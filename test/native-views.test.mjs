import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import {
  assertNativeView,
  assertAccountSummary,
  assertNavigationRequest,
  defineNativeView,
} from '../packages/sdk/dist/index.js'
import { validateManifest, readArtifact } from '../packages/issuer/dist/index.js'
import { SurfaceSession } from '../packages/core/dist/surface.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'

const manifest = {
  manifestVersion: 2,
  id: 'native.test',
  name: 'Native test',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: {
    logic: { entry: 'logic' },
    surfaces: [{ id: 'library', kind: 'native', entry: 'render' }],
  },
  contributes: {
    commands: ['render', 'open', 'play', 'import', 'summary'].map((action) => ({
      id: action,
      title: action,
      action,
    })),
    accountItems: [{ id: 'account', title: 'Account', view: 'library', action: 'summary' }],
  },
}
const ref = {
  pluginId: 'native.test',
  providerId: 'catalog',
  connectionId: 'a',
  kind: 'playlist',
  id: '1',
  data: { revision: 'r1' },
}
const view = {
  type: 'page',
  sections: [
    {
      id: 'playlists',
      layout: 'grid',
      onOpen: 'open',
      onPlay: 'play',
      itemActions: [{ label: 'Import', action: 'import' }],
      items: [{ ref, title: 'Library', capabilities: [] }],
    },
  ],
}

test('native manifest entry is a declared logic action, not a web module', () => {
  assert.doesNotThrow(() => validateManifest(manifest))
  const artifact = readArtifact(
    'exports.manifest = ' + JSON.stringify(manifest) + '; exports.activate = function() {};',
  )
  assert.deepEqual(Object.keys(artifact.modules), ['logic'])
  const missingAction = structuredClone(manifest)
  missingAction.modules.surfaces[0].entry = 'undeclared'
  assert.throws(() => validateManifest(missingAction), /native render action/)
  const missingLogic = structuredClone(manifest)
  delete missingLogic.modules.logic
  assert.throws(() => validateManifest(missingLogic), /logic module/)
  const badAccount = structuredClone(manifest)
  badAccount.contributes.accountItems[0].view = 'missing'
  assert.throws(() => validateManifest(badAccount), /account view/)
  badAccount.contributes.accountItems[0].view = 'library'
  badAccount.contributes.accountItems[0].action = 'missing'
  assert.throws(() => validateManifest(badAccount), /account summary action/)
  badAccount.contributes.accountItems[0].action = 'summary'
  badAccount.contributes.accountItems[0].logoutAction = 'missing'
  assert.throws(() => validateManifest(badAccount), /account logout action/)
  badAccount.contributes.accountItems[0].logoutAction = 'open'
  badAccount.modules.surfaces[0].presentation = { kind: 'modal', size: 420 }
  assert.doesNotThrow(() => validateManifest(badAccount))
})

test('native wire view rejects executable, malformed and undeclared actions', async () => {
  assert.doesNotThrow(() => assertNativeView(view, new Set(['open', 'play', 'import'])))
  for (const alter of [
    (value) => {
      value.sections[0].onOpen = 'undeclared'
    },
    (value) => {
      value.sections[0].itemActions[0].action = 'undeclared'
    },
    (value) => {
      value.sections.push(value.sections[0])
    },
    (value) => {
      value.sections[0].items[0].title = () => 'code'
    },
    (value) => {
      value.actions = [{ label: 'Run', action: 'open', primary: 'yes' }]
    },
    (value) => {
      value.sections[0].items[0].ref.id = ''
    },
  ]) {
    const invalid = structuredClone(view)
    alter(invalid)
    assert.throws(() => assertNativeView(invalid, new Set(['open', 'play', 'import'])))
  }
  const circular = structuredClone(view)
  circular.sections[0].items[0].ref.data = circular
  assert.throws(() => assertNativeView(circular), /JSON/)
  assert.deepEqual(await defineNativeView(async () => view)({}, {}), view)
})

test('playlist page sections require native views and navigation stays within the caller manifest', () => {
  const valid = structuredClone(manifest)
  valid.contributes.playlistSections = [
    { id: 'owned', title: 'Library', view: 'library', order: 0 },
  ]
  assert.doesNotThrow(() => validateManifest(valid))
  assertNavigationRequest({ page: 'playlist', sectionId: 'owned' }, valid)
  assertNavigationRequest({ page: 'playlist', ref }, valid)
  assert.throws(
    () => assertNavigationRequest({ page: 'search', sectionId: 'owned' }, valid),
    /only valid/,
  )
  assert.throws(
    () => assertNavigationRequest({ page: 'playlist', sectionId: 'another-plugin' }, valid),
    /Unknown playlist section/,
  )
  assert.throws(
    () => assertNavigationRequest({ page: 'playlist', sectionId: 'owned' }, manifest),
    /Unknown playlist section/,
  )
  const invalid = structuredClone(valid)
  invalid.modules.surfaces[0].kind = 'web'
  assert.throws(() => validateManifest(invalid), /native view/)
  invalid.modules.surfaces[0].kind = 'native'
  invalid.contributes.playlistSections[0].view = 'missing'
  assert.throws(() => validateManifest(invalid), /native view/)
  const duplicate = structuredClone(valid)
  duplicate.contributes.playlistSections.push(duplicate.contributes.playlistSections[0])
  assert.throws(() => validateManifest(duplicate), /Duplicate/)
})

test('Core sandbox rejects undeclared playlist section navigation before calling the Host', async () => {
  const m = structuredClone(manifest)
  m.contributes.playlistSections = [{ id: 'owned', title: 'Library', view: 'library' }]
  m.contributes.commands.push({ id: 'navigate', title: 'Navigate', action: 'navigate' })
  const artifact = readArtifact(
    'exports.manifest = ' +
      JSON.stringify(m) +
      '; exports.activate = function(ctx) { ctx.actions.register("navigate", async function(input) { await ctx.ui.navigation.open(input); return true; }); };',
  )
  const calls = []
  const runtime = new NodePluginSandbox(
    async (method, input) => {
      calls.push({ method, input })
      return null
    },
    () => {},
  )
  try {
    await runtime.start(artifact)
    await runtime.invoke('action', 'navigate', '', [{ page: 'playlist', sectionId: 'owned' }])
    assert.deepEqual(calls, [
      { method: 'ui.navigation.open', input: { page: 'playlist', sectionId: 'owned' } },
    ])
    await assert.rejects(
      runtime.invoke('action', 'navigate', '', [{ page: 'playlist', sectionId: 'foreign' }]),
      /Unknown playlist section/,
    )
    await assert.rejects(
      runtime.invoke('action', 'navigate', '', [{ page: 'settings', sectionId: 'owned' }]),
      /only valid/,
    )
    assert.equal(calls.length, 1)
  } finally {
    runtime.dispose()
  }
})

test('native Core session validates render output before returning it to a Host', async () => {
  let response = view
  const session = new SurfaceSession(manifest.modules.surfaces[0], manifest, async () => response)
  assert.deepEqual(await session.invoke('render'), view)
  response = { ...view, actions: [{ label: 'Undeclared', action: 'escape' }] }
  await assert.rejects(session.invoke('render'), /native action/)
  await session.close()
  await assert.rejects(session.invoke('render'), /closed/)
})

test('account summaries carry bounded public presentation fields', () => {
  assertAccountSummary({
    signedIn: true,
    displayName: 'Reader',
    avatarUrl: 'https://example.com/avatar.png',
    badge: 'Member',
  })
  for (const invalid of [
    { signedIn: 'true', displayName: 'Reader' },
    { signedIn: true, displayName: '' },
    { signedIn: true, displayName: 'Reader', avatarUrl: 'javascript:alert(1)' },
    { signedIn: true, displayName: 'Reader', badge: 'x'.repeat(81) },
  ])
    assert.throws(() => assertAccountSummary(invalid))
})

test(
  'native preview uses real Host DOM and preserves item refs through actions, refresh and disposal',
  {
    skip: process.platform === 'linux' && !process.env.DISPLAY,
    timeout: 30000,
  },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'ceru-native-dom-'))
    const bundled = await build({
      stdin: {
        contents:
          "export { NativeSurfacePreview, PlaylistPagePreview } from './packages/cli/assets/native-view.js'; export { SurfaceSession } from './packages/core/src/surface.ts'; export { observeSurfaceSize } from './packages/cli/runtime/surface-size.ts'",
        resolveDir: process.cwd(),
        loader: 'js',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'NativeContracts',
    })
    const runtime = await readFile(
      new URL('../packages/cli/assets/sandbox.js', import.meta.url),
      'utf8',
    )
    const sandboxDocument =
      '<script>' +
      runtime.replace(/<\/script/gi, '<\\/script') +
      '</script><script>' +
      `
      __ceruStart(async(ctx)=>{
        ctx.actions.register('play',async(_input,operation)=>{
          const call={permissionKey:'control',operation};
          await ctx.queue.replace([],call); await ctx.player.play(undefined,call); return 'played';
        });
        ctx.actions.register('cancel',async(_input,operation)=>{
          await ctx.player.pause({permissionKey:'control',operation});
        });
      });` +
      '</script>'
    const browserTest = `async function test() {
    const container = document.getElementById('preview');
    const received = []; const errors = []; let title = '<img src=x onerror=alert(1)>'; let opened = 0; let closed = 0;
    const manifest = ${JSON.stringify(manifest)};
    manifest.contributes.commands.push(...['lifecycle.open','lifecycle.close'].map(action=>({id:action,title:action,action})));
    const surface = {...manifest.modules.surfaces[0], lifecycle:{openAction:'lifecycle.open',closeAction:'lifecycle.close'}};
    const expected = ${JSON.stringify(ref)};
    const dispatch = async(action,input) => {
      if(action==='lifecycle.open') {opened++;return}
      if(action==='lifecycle.close') {closed++;return}
      if(action!=='render') {received.push({action,input});return}
      return {type:'page',sections:[{id:'lists',layout:'grid',onOpen:'open',onPlay:'play',
        itemActions:[{label:'Import',action:'import',input:{ref:{id:'spoofed'},source:'menu'}}],
        items:[{ref:expected,title,capabilities:[]}]}]};
    };
    const session = new NativeContracts.SurfaceSession(surface, manifest, dispatch);
    const preview = new NativeContracts.NativeSurfacePreview(container, session, new Set(manifest.contributes.commands.map(x=>x.action)), error=>errors.push(error.message));
    await preview.open();
    const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
    const check = (ok,message) => {if(!ok)throw Error(message)};
    check(!container.querySelector('iframe') && !container.querySelector('img'), 'Native view created embedded or injected DOM');
    check(container.textContent.includes(title), 'Title was not rendered as text');
    await container.querySelector('.native-item-title').onclick();
    await [...container.querySelectorAll('button')].find(x=>x.textContent==='播放').onclick();
    await [...container.querySelectorAll('button')].find(x=>x.textContent==='Import').onclick();
    check(same(received[0],{action:'open',input:{ref:expected}}), 'Open lost complete ref');
    check(same(received[1],{action:'play',input:{ref:expected,refs:[expected]}}), 'Play lost refs');
    check(same(received[2],{action:'import',input:{ref:expected,source:'menu'}}), 'Item action failed to overwrite spoofed ref');
    title = 'Updated by plugin state'; await preview.refresh();
    check(container.textContent.includes(title), 'State refresh failed');
    preview.dispose(); await session.close();
    title='stale'; await preview.refresh();
    check(!container.textContent.includes('stale'), 'Disposed session refreshed');
    check(opened===1 && closed===1 && errors.length===0, 'Lifecycle or rendering failed');
    manifest.modules.surfaces[0] = surface;
    manifest.contributes.playlistSections = [
      {id:'second',title:'Second',view:'library',order:10},
      {id:'first',title:'First',view:'library',order:-1},
    ];
    const playlistPage = new NativeContracts.PlaylistPagePreview(container, manifest, dispatch, error=>errors.push(error.message));
    title='Playlist page row'; await playlistPage.open('second');
    check(container.querySelector('.host-playlist-page') && !container.querySelector('iframe'), 'Playlist page was not native');
    check(container.textContent.includes('本地歌单') && container.textContent.includes('云歌单'), 'Existing Host sections were replaced');
    check(same([...container.querySelectorAll('[data-playlist-section]')].map(x=>x.dataset.playlistSection),['first','second']), 'Section order was ignored');
    check(container.querySelector('[data-playlist-section="second"]').classList.contains('is-target'), 'Navigation target was lost');
    await container.querySelector('[data-playlist-section="second"] .native-item-title').onclick();
    check(same(received[3],{action:'open',input:{ref:expected}}),'Playlist page item lost ref');
    title='Refreshed playlist page'; await playlistPage.refresh('library');
    check([...container.querySelectorAll('.native-item-title')].every(x=>x.textContent===title),'Shared Surface state did not refresh all sections');
    await playlistPage.close(); await playlistPage.close();
    check(opened===3 && closed===3 && errors.length===0,'Playlist page lifecycle cleanup failed');
    const sizingRoot=document.createElement('div'); sizingRoot.style.minHeight='100vh';
    const sizingContent=document.createElement('div'); sizingContent.style.height='240px';
    sizingRoot.append(sizingContent); document.body.append(sizingRoot);
    const sizes=[]; let sizeReady;
    const nextSize=()=>new Promise(resolve=>{sizeReady=resolve});
    const initialSize=nextSize();
    const stopSizing=NativeContracts.observeSurfaceSize(sizingRoot,height=>{sizes.push(height);sizeReady?.(height)});
    check(await initialSize===240,'Surface height followed its viewport rather than content');
    const resized=nextSize(); sizingContent.style.height='320px';
    check(await resized===320,'Content resize was not reported');
    const shrunk=nextSize(); sizingContent.style.height='100px';
    check(await shrunk===100,'Content shrink was not reported');
    const count=sizes.length; stopSizing(); sizingContent.style.height='400px';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    check(sizes.length===count,'Disposed Surface still reports sizes'); sizingRoot.remove();
    const services = [];
    await new Promise((resolve,reject)=>{
      const frame = document.createElement('iframe'); frame.setAttribute('sandbox','allow-scripts');
      const generation = 'rpc-test'; let cancelled = false;
      const post = (type,data) => frame.contentWindow.postMessage({type,data,generation},'*');
      const timer = setTimeout(()=>finish(new Error('Sandbox RPC regression timed out')),5000);
      const finish = error => {clearTimeout(timer);window.removeEventListener('message',listener);frame.remove();error?reject(error):resolve()};
      const listener = event => {
        if(event.source!==frame.contentWindow)return;
        const message=event.data; const data=message.data;
        try {
          if(message.type==='ready')post('init',{generation,kind:'logic',catalog:{icons:{},assets:{}},resources:{},manifest:{id:'rpc',version:'1',contributes:{commands:['play','cancel'].map(action=>({id:action,action}))}}});
          if(message.type==='active')post('invoke',{id:'play-op',kind:'action',target:'play',method:'',args:[{}]});
          if(message.type==='failed')throw Error(data.message);
          if(message.type==='rpc'){
            if(data.method.startsWith('services.')){
              const operation=data.data.args.at(-1).operation;
              check(operation && !('signal' in operation) && operation.userIntent.id===operation.id,'Operation was not serialized');
              services.push(data.method);
              if(data.method==='services.player.pause') {post('cancel',{id:'cancel-op'});return;}
            }
            if(data.method==='operations.cancel')cancelled=true;
            post('rpc-result',{id:data.id,value:null});
          }
          if(message.type==='invoke-result'){
            if(data.id==='play-op'){
              check(data.value==='played'&&!data.error,'Queue/play RPC failed: '+data.error);
              post('invoke',{id:'cancel-op',kind:'action',target:'cancel',method:'',args:[{}]});
            } else {
              check(cancelled && data.error.includes('cancelled'),'Service call did not cancel'); finish();
            }
          }
        }catch(error){finish(error)}
      };
      window.addEventListener('message',listener);
      frame.srcdoc=${JSON.stringify(sandboxDocument)}; document.body.append(frame);
    });
    check(same(services,['services.queue.replace','services.player.play','services.player.pause']),'Missing player RPC');
    return {native:true,actions:received.length,opened,closed,services:true};
  }; test().catch(error => ({error: String(error), stack: error.stack}))`
    const script = join(temporary, 'run.cjs')
    await writeFile(
      script,
      `const {app,BrowserWindow}=require('electron');
    app.setPath('userData',${JSON.stringify(join(temporary, 'user-data'))});
    app.disableHardwareAcceleration();
    app.whenReady().then(async()=>{try{
      const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
      window.webContents.on('console-message', event => console.log('RENDERER', event.message));
      await window.loadURL('data:text/html,<div id="preview"></div>');
      await window.webContents.executeJavaScript(${JSON.stringify(bundled.outputFiles[0].text)});
      const result=await window.webContents.executeJavaScript(${JSON.stringify(browserTest)});
      if(result.error)throw new Error(JSON.stringify(result));
      console.log('NATIVE_RESULT '+JSON.stringify(result)); app.exit(0);
    }catch(error){console.error(error);app.exit(1)}});`,
    )
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const electron = createRequire(import.meta.url)('electron')
    const output = await new Promise((resolve, reject) => {
      const child = spawn(electron, [script], {
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Native DOM test timed out\n' + output))
      }, 25000)
      child.stdout.on('data', (data) => {
        output += data
      })
      child.stderr.on('data', (data) => {
        output += data
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve(output) : reject(new Error(output))
      })
    })
    assert.match(output, /NATIVE_RESULT .*"actions":4,"opened":3,"closed":3/)
  },
)
