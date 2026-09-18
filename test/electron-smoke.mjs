// Explicit integration check: npm run test:electron -- /absolute/path/to/electron
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, writeFile, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scaffoldProject, buildProject } from '../packages/cli/dist/index.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = await realpath(await mkdtemp(join(root, '.electron-smoke-')))
const project = join(temp, 'plugin')
const template = process.argv[3] || 'source'
const production = process.argv[4] === 'release'
await scaffoldProject(project, { template })
const sdk = join(project, 'node_modules/@shiqianjiang/ceru-plugin-sdk')
await mkdir(sdk, { recursive: true })
await cp(resolve(root, 'packages/sdk/dist'), join(sdk, 'dist'), { recursive: true })
await cp(resolve(root, 'packages/sdk/package.json'), join(sdk, 'package.json'))
await mkdir(join(project, 'node_modules/@types'), { recursive: true })
await cp(resolve(root, 'node_modules/@types/lodash'), join(project, 'node_modules/@types/lodash'), {
  recursive: true,
})
const manifest = JSON.parse(await readFile(join(project, 'ceru.plugin.json')))
manifest.manifest.contributes.commands.push({
  id: 'environment',
  title: 'Environment',
  action: 'environment',
})
if (template === 'source') {
  manifest.manifest.modules.surfaces = [{ id: 'page', kind: 'web', entry: 'view.main' }]
  manifest.entries['view.main'] = 'src/view.ts'
}
manifest.manifest.contributes.providers ||= [
  {
    id: 'catalog',
    name: 'Runtime test',
    protocols: ['music.search@1', 'music.resolve@1'],
    icon: { kind: 'host', name: 'platform.tx' },
  },
]
manifest.manifest.contributes.providers[0].icon.name = 'platform.tx'
await writeFile(join(project, 'ceru.plugin.json'), JSON.stringify(manifest, null, 2))
if (template === 'react') {
  const view = join(project, 'src/view.tsx')
  await writeFile(view, "import './demo.css'\n" + (await readFile(view, 'utf8')))
  await writeFile(join(project, 'src/demo.css'), 'main { --ceru-css-test: standalone; }')
}
await writeFile(
  join(project, 'src/index.ts'),
  [
    "import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'",
    'export default definePlugin(async (ctx) => {',
    "  ctx.actions.register('hello', async () => { await ctx.ui.notify({key:'hello',level:'info',message:'Hello from real execution'}); return { asset: (await ctx.assets.url('placeholder.cover')).startsWith('data:image/'), icon: (await ctx.icons.url('platform.tx')).startsWith('data:image/svg+xml') } })",
    "  ctx.actions.register('environment', () => { let parentAccess = false; try { parentAccess = !!parent.document.body } catch {} return { node: typeof (globalThis as any).process, parentAccess } })",
    "  ctx.providers.register('catalog', { tracks: {",
    '    async search(request) {',
    "      const titles = ctx.utils.lodash.uniqBy([{title: request.query}, {title: request.query}], 'title')",
    "      return {items: titles.map((x) => ({ref:{pluginId:ctx.plugin.id,providerId:'catalog',kind:'track',id:'1'},title:x.title,metadata:{artists:['Smoke Test']},capabilities:[]}))}",
    '    },',
    "    async resolve() { return ctx.playback.failure({code:'RATE_LIMITED',message:'429 demo',recovery:{mode:'await-user',maxWaitMs:1000}}) }",
    '  } })',
    '})',
  ].join('\n'),
)
if (template === 'source')
  await writeFile(
    join(project, 'src/view.ts'),
    [
      "import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'",
      "export default defineSurface(async (ctx) => { const title=document.createElement('h1');title.textContent=ctx.utils.lodash.startCase('shared ui ready'); const image=document.createElement('img');image.src=await ctx.icons.url('platform.tx');image.width=80;ctx.root.replaceChildren(title,image) })",
    ].join('\n'),
  )
const electron = process.argv[2]
if (!electron) throw new Error('Pass an Electron executable path')
const debugPort = Number(process.env.CERU_SMOKE_DEBUG_PORT || 9337)
let launchArgs = ['dev', '--project', project]
if (production) {
  const built = await buildProject(project)
  const artifact = readArtifact(await readFile(built.path))
  assert.equal(artifact.header.manifest.engines.libraries, undefined)
  assert.ok(!artifact.body.includes('__ceruSharedRequire'))
  const delivery = join(temp, 'delivery')
  await mkdir(delivery)
  const file = join(delivery, 'plugin.js')
  await cp(built.path, file)
  // This directory has no source, project manifest, Vue or React package.
  launchArgs = ['preview', file, '--project', delivery]
}
const child = spawn(
  process.execPath,
  [
    join(root, 'packages/cli/dist/bin.js'),
    ...launchArgs,
    '--port',
    '0',
    '--debug-port',
    String(debugPort),
    '--electron',
    electron,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let output = ''
child.stdout.on('data', (data) => {
  output += data.toString()
})
child.stderr.on('data', (data) => {
  output += data.toString()
})
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
async function waitFor(fn, timeout = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await sleep(150)
  }
  throw new Error('Timed out\n' + output)
}
let ws
const pending = new Map()
const scripts = []
let next = 0
let paused
function send(method, params = {}, sessionId) {
  return new Promise((resolveRequest, reject) => {
    const id = ++next
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('CDP timeout: ' + method))
    }, 15000)
    pending.set(id, { resolve: resolveRequest, reject, timer })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
try {
  const url = await waitFor(
    () => output.match(/Dev playground: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1],
  )
  await waitFor(() => output.includes('CERU_DEBUG_READY '))
  if (!production) {
    const reused = spawnSync(
      process.execPath,
      [
        join(root, 'packages/cli/dist/bin.js'),
        'dev',
        '--project',
        project,
        '--ensure-running',
        '--port',
        new URL(url).port,
        '--debug-port',
        String(debugPort),
      ],
      { encoding: 'utf8', timeout: 20000 },
    )
    assert.equal(reused.status, 0, reused.stderr)
    assert.ok(reused.stdout.includes('Reusing existing'))
  }
  const target = await waitFor(async () =>
    (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find(
      (t) => t.type === 'page' && t.url.startsWith(url),
    ),
  )
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const item = pending.get(message.id)
      if (item) {
        clearTimeout(item.timer)
        pending.delete(message.id)
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result)
      }
    }
    if (message.method === 'Debugger.scriptParsed')
      scripts.push({ ...message.params, sessionId: message.sessionId })
    if (message.method === 'Debugger.paused') {
      paused?.(message.sessionId)
      send('Debugger.resume', {}, message.sessionId).catch(() => {})
    }
    if (message.method === 'Target.attachedToTarget') {
      send('Runtime.enable', {}, message.params.sessionId).catch(() => {})
      send('Debugger.enable', {}, message.params.sessionId).catch(() => {})
    }
  })
  await send('Runtime.enable')
  await send('Debugger.enable')
  await send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  })
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await waitFor(async () =>
    (await evaluate('window.__ceruDev?.registrations || []')).includes('provider:catalog'),
  )
  assert.deepEqual(await evaluate("window.__ceruDev.runAction('hello', {})", true), {
    asset: true,
    icon: true,
  })
  assert.deepEqual(await evaluate("window.__ceruDev.runAction('environment', {})", true), {
    node: 'undefined',
    parentAccess: false,
  })
  const script = await waitFor(() => scripts.find((s) => s.url.includes('/modules/logic.main.js')))
  if (!production) {
    assert.ok(script.sourceMapURL?.startsWith('data:'))
    const map = JSON.parse(Buffer.from(script.sourceMapURL.split(',')[1], 'base64').toString())
    assert.equal(map.sourceRoot, 'ceru:///')
    assert.ok(map.sources.some((s) => s.endsWith('src/index.ts')))
  } else assert.ok(!script.sourceMapURL)
  const source = await send(
    'Debugger.getScriptSource',
    { scriptId: script.scriptId },
    script.sessionId,
  )
  const line = source.scriptSource.split('\n').findIndex((s) => s.includes('const titles ='))
  assert.ok(line >= 0)
  await send(
    'Debugger.setBreakpoint',
    { location: { scriptId: script.scriptId, lineNumber: line } },
    script.sessionId,
  )
  let hit = false
  paused = () => {
    hit = true
  }
  await evaluate(
    "document.getElementById('query').value='Typed search';document.getElementById('search').click()",
  )
  await waitFor(() => hit)
  const search = await waitFor(async () => {
    const raw = await evaluate("document.getElementById('result-detail').textContent")
    const value = JSON.parse(raw || 'null')
    return value?.items ? value : null
  })
  assert.equal(search.items.length, 1)
  assert.equal(search.items[0].title, 'Typed search')
  await evaluate("document.querySelector('#results button').click()")
  await waitFor(async () =>
    (await evaluate("document.getElementById('result-detail').textContent")).includes(
      'RATE_LIMITED',
    ),
  )
  await evaluate("document.querySelector('#views button').click()")
  await waitFor(async () =>
    (await evaluate("document.getElementById('logs').textContent")).includes('view.main activated'),
  )
  const viewScript = await waitFor(() =>
    scripts.find((s) => s.url.includes('/modules/view.main.js')),
  )
  const globals = await send(
    'Runtime.evaluate',
    {
      contextId: viewScript.executionContextId,
      expression:
        '({ vue: typeof globalThis.Vue, react: typeof globalThis.React, sharedLoader: typeof globalThis.__ceruSharedRequire })',
      returnByValue: true,
    },
    viewScript.sessionId,
  )
  assert.deepEqual(globals.result.value, {
    vue: 'undefined',
    react: 'undefined',
    sharedLoader: 'undefined',
  })
  assert.equal((await fetch(new URL('/shared/vue.js', url))).status, 404)
  assert.equal((await fetch(new URL('/shared/react.js', url))).status, 404)
  if (template === 'react') {
    const result = await send(
      'Runtime.evaluate',
      {
        contextId: viewScript.executionContextId,
        expression:
          "getComputedStyle(document.querySelector('main')).getPropertyValue('--ceru-css-test').trim()",
        returnByValue: true,
      },
      viewScript.sessionId,
    )
    assert.equal(result.result.value, 'standalone')
  }
  const hasCounter = ['vue', 'vue-tsx', 'react'].includes(template)
  if (hasCounter) {
    const buttonText = async (click = false) => {
      const result = await send(
        'Runtime.evaluate',
        {
          contextId: viewScript.executionContextId,
          expression: click
            ? "document.querySelector('button').click();document.querySelector('button').textContent"
            : "document.querySelector('button')?.textContent",
          returnByValue: true,
        },
        viewScript.sessionId,
      )
      return result.result.value
    }
    assert.ok((await waitFor(() => buttonText())).includes('0'))
    await buttonText(true)
    await waitFor(async () => (await buttonText()).includes('1'))
  }
  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  const imagePath = join(temp, 'playground.png')
  await writeFile(imagePath, Buffer.from(screenshot.data, 'base64'))
  console.log(
    JSON.stringify(
      {
        passed: true,
        template,
        mode: production ? 'release artifact only' : 'development',
        project,
        screenshot: imagePath,
        checks: [
          'actual plugin activation',
          'commands',
          'shared icons/assets',
          'Lodash',
          'search',
          'resolve',
          'isolated Web Surface',
          ...(production ? ['release runs without source or Host frameworks'] : ['source maps']),
          'debugger breakpoint',
          'no Node or parent DOM',
          ...(hasCounter ? ['framework counter interaction'] : []),
        ],
      },
      null,
      2,
    ),
  )
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: ++next, method: 'Browser.close' }))
    await sleep(300)
    ws.close()
  }
  for (const item of pending.values()) clearTimeout(item.timer)
  if (child.exitCode === null) {
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)])
    if (child.exitCode === null) child.kill()
  }
}
