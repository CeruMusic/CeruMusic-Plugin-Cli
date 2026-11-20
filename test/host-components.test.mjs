import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createRenderer, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'

const temp = await mkdtemp(join(process.cwd(), '.test-tmp-components-'))
after(() => rm(temp, { recursive: true, force: true, maxRetries: 3 }))
const { createHostComponents } = await import('../packages/core/dist/component-runtime.js')
const lyricModule = join(temp,'lyric.mjs')
await build({entryPoints:['packages/core/runtime/aml-lyric-player.ts'],outfile:lyricModule,bundle:true,format:'esm',platform:'node',packages:'external'})
const {amlLines} = await import(pathToFileURL(lyricModule).href)
test('AMLL receives independent timed words, translations, duet and background markers', () => {
  const input = Object.freeze([{startTimeMs:100, text:'春风', translation:'spring wind', romanization:'chun feng', isDuet:true,
    words:[{text:'春',startTimeMs:100,endTimeMs:400,romanization:'chun'},{text:'风',startTimeMs:400,endTimeMs:750}]},
    {startTimeMs:750,endTimeMs:1000,text:'啊',isBackground:true}])
  const output = amlLines(input)
  assert.deepEqual(output[0],{startTime:100,endTime:750,translatedLyric:'spring wind',romanLyric:'chun feng',isBG:false,isDuet:true,
    words:[{word:'春',startTime:100,endTime:400,romanWord:'chun'},{word:'风',startTime:400,endTime:750,romanWord:''}]})
  assert.equal(output[1].isBG,true)
  assert.deepEqual(output[1].words,[{word:'啊',startTime:750,endTime:1000,romanWord:''}])
  output[0].words[0].word = 'changed'
  assert.equal(input[0].words[0].text,'春')
})
const icons = (name) => (name === 'music-note' || name === 'library' ? 'asset:' + name : '')
const components = createHostComponents(icons, () => assert.fail('rendering cannot dispatch'), undefined, {PlayerArtwork: {props:['mode','playing','alt'], render() { return h('figure', { 'aria-label':this.alt, 'data-mode':this.mode, 'data-playing':this.playing }) }}, SpectrumCanvas: {render: () => h('canvas')}})
const render = (component, props, slots) =>
  renderToString(createSSRApp({ render: () => h(component, props, slots) }))
const item = {
  key: 'opaque:1',
  title: '<我的歌>',
  source: 'local',
  durationMs: 61000,
  metadata: { artists: ['歌手'], qualities: ['flac'] },
}

test('host component markup: metadata, fallback icons, accessible states, slots and unplayable media', async () => {
  const song = await render(components.SongList, {
    items: [{ ...item, playable: false }],
    actions: { play: 'start', enqueue: 'toQueue' },
  })
  for (const label of [
    '&lt;我的歌&gt;',
    '本地',
    'asset:music-note',
    '无损',
    '歌手',
    '1:01',
    '加入队列',
  ])
    assert.ok(song.includes(label), label)
  assert.doesNotMatch(song, /<我的歌>|class="ceru-hc-title"|收藏|下载/)
  const grid = await render(components.PlaylistGrid, {
    items: [{ title: '歌单', playlist: { author: '作者', trackCount: 0 } }],
  })
  assert.match(grid, /作者 · 0 首/)
  assert.match(grid, /asset:library/)
  assert.doesNotMatch(grid, /<button/)
  assert.match(
    await render(components.PlaylistCard, { item }, { cover: () => h('span', '封面插槽') }),
    /封面插槽/,
  )
  assert.match(
    await render(components.PlaylistGrid, {}, { default: () => h('b', '网格插槽') }),
    /网格插槽/,
  )
  assert.match(
    await render(
      components.PageHeader,
      { title: '页面', description: '说明' },
      { actions: () => h('button', '设置') },
    ),
    /页面.*说明.*设置/,
  )
  assert.match(await render(components.EmptyState, {}), /role="status".*暂无内容/)
  assert.match(await render(components.LoadingState, {}), /role="status".*加载中/)
  assert.match(
    await render(components.SourceIcon, { source: 'unknown' }),
    /asset:music-note.*unknown/,
  )
  assert.match(
    await render(
      createHostComponents(
        (name) => 'asset:' + name,
        () => {},
      ).SourceIcon,
      { source: 'wy' },
    ),
    /asset:platform.wy.*网易云音乐/,
  )
  assert.match(await render(components.QualityBadge, { quality: '320k' }), /高品质/)
  assert.match(await render(components.SquareCover, { artwork: 'data:image/png;base64,aa', track: { title: '封面' }, playing: true }), /aria-label="封面" data-mode="square" data-playing="true"/)
  assert.match(await render(components.VinylRecord, { artwork: 'data:image/png;base64,aa', playing: true }), /data-mode="vinyl" data-playing="true"/)
  assert.match(await render(components.ShaderBackground, { artwork: 'data:image/png;base64,aa' }), /ceru-hc-background/)
  assert.match(await render(components.AudioVisualizer, { spectrum: new Float32Array([0, .5, 1]), barCount: 3 }), /ceru-hc-visualizer/)
})

function mount(component, props) {
  const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null })
  const remove = (child) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  }
  const renderer = createRenderer({
    createElement: node,
    createText: (text) => node('#text', text),
    createComment: (text) => node('#comment', text),
    setText: (child, text) => {
      child.text = text
    },
    setElementText: (child, text) => {
      child.children = []
      child.text = text
    },
    patchProp: (child, name, _old, value) => {
      child.props[name] = value
    },
    parentNode: (child) => child.parent,
    nextSibling: (child) =>
      child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
    remove,
    insert: (child, parent, anchor) => {
      remove(child)
      child.parent = parent
      parent.children.splice(
        anchor ? parent.children.indexOf(anchor) : parent.children.length,
        0,
        child,
      )
    },
  })
  const root = node('root')
  renderer.createApp({ render: () => h(component, props) }).mount(root)
  function find(predicate, target = root) {
    if (predicate(target)) return target
    for (const child of target.children) {
      const hit = find(predicate, child)
      if (hit) return hit
    }
  }
  return { find, button: (text) => find((child) => child.type === 'button' && child.text === text) }
}

test('song actions use only keys or projected refs, gate duplicate requests and report failures', async () => {
  const calls = []
  let finish
  const run = (action, input) => {
    calls.push({ action, input })
    if (action === 'denied') throw Error('未授权')
    return new Promise((done) => {
      finish = done
    })
  }
  const { SongList } = createHostComponents(icons, run)
  const privateRef = {
    id: 'song',
    providerId: 'provider',
    kind: 'track',
    scope: 'provider',
    pluginId: 'author',
    data: { url: 'private' },
  }
  const refItem = { title: '引用曲目', ref: privateRef }
  const actions = { play: 'start', enqueue: 'queue', favorite: 'like', download: 'denied' }
  const view = mount(SongList, { items: [{ ...item, ref: privateRef }, refItem], actions })
  const click = { currentTarget: { closest: () => null } }
  view.button('加入队列').props.onClick(click)
  view.button('收藏').props.onClick(click)
  await nextTick()
  assert.equal(view.button('收藏').props.disabled, true)
  assert.deepEqual(calls, [{ action: 'queue', input: item.key }])
  finish()
  await Promise.resolve()
  await nextTick()
  assert.equal(view.find((child) => child.props.role === 'status').text, '加入队列：<我的歌>')
  view.button('收藏').props.onClick(click)
  finish()
  await Promise.resolve()
  await nextTick()
  assert.deepEqual(calls.at(-1), { action: 'like', input: item.key })
  view.button('下载').props.onClick(click)
  await nextTick()
  assert.equal(view.find((child) => child.props.role === 'alert').text, '未授权')
  view.button('引用曲目').props.onClick()
  assert.deepEqual(calls.at(-1), {
    action: 'start',
    input: {
      id: 'song',
      providerId: 'provider',
      kind: 'track',
      scope: 'provider',
      pluginId: 'author',
    },
  })
  finish()
})

test('legacy play and playlist open forward the clicked item without invoking a host service', () => {
  let selected
  const select = (entry) => {
    selected = entry
  }
  mount(components.SongList, { items: [item], onPlay: select })
    .button(item.title)
    .props.onClick()
  assert.equal(selected.key, item.key)
  selected = null
  mount(components.PlaylistGrid, { items: [item], onOpen: select })
    .button(item.title)
    .props.onClick()
  assert.equal(selected.key, item.key)
})
