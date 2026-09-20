import {
  assertContentPage,
  assertAccountSummary,
  assertNavigationRequest,
  assertLyricsDocument,
  assertResolveResult,
  PERMISSION_GROUPS,
  permissionGroup,
  SurfaceSession,
} from './core-contracts.js'
import { NativeSurfacePreview, PlaylistPagePreview } from './native-view.js'
const $ = (id) => document.getElementById(id)
let state,
  revision = 0,
  sequence = 0,
  stopped = false,
  viewId = null,
  currentInvocation
let viewSession
let nativePreview
let viewMountInfo
let playlistPagePreview
const PLAYLIST_PAGE = Symbol('Host playlist page')
let viewTransition = Promise.resolve()
const frames = new Map(),
  calls = new Map(),
  registrations = new Map(),
  surfaceStates = new Map()
const accountButtons = new Map()
const accountLogoutButtons = new Map()
const api = async (path, data) => {
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'x-ceru-dev-token': window.CERU_DEV_TOKEN,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Host request failed')
  return result
}
function log(level, message) {
  const el = document.createElement('div')
  el.className = 'log ' + level
  const time = document.createElement('span')
  time.className = 'time'
  time.textContent = new Date().toLocaleTimeString() + ' '
  el.append(
    time,
    document.createTextNode(
      typeof message === 'string' ? message : JSON.stringify(message, null, 2),
    ),
  )
  $('logs').prepend(el)
  while ($('logs').children.length > 300) $('logs').lastChild.remove()
}
const iconUrl = (name) =>
  'data:image/svg+xml;base64,' +
  btoa(unescape(encodeURIComponent(state.catalog.icons[name] || state.catalog.icons['music-note'])))
function post(frame, type, data) {
  frame.element.contentWindow?.postMessage({ type, data, generation: frame.generation }, '*')
}
function removeFrames() {
  void playlistPagePreview?.close().catch(error => log('error', error.message))
  playlistPagePreview = undefined
  nativePreview?.dispose()
  nativePreview = undefined
  $('preview').replaceChildren()
  void viewSession?.close().catch(error => log('error', error.message))
  viewSession = undefined
  void api('rpc', { method: 'sockets.closeAll' }).catch(() => {})
  document.getElementById('host-playlist-import')?.remove()
  for (const frame of frames.values()) { post(frame, 'dispose'); frame.element.remove() }
  frames.clear()
  registrations.clear()
  for (const call of calls.values()) {
    clearTimeout(call.timer)
    call.reject(new Error('Plugin reloaded or stopped'))
  }
  calls.clear()
  surfaceStates.clear()
  currentInvocation = null
  $('results').replaceChildren()
  $('result-detail').textContent = ''
  document.getElementById('media-preview')?.remove()
  drawRegistrations()
}
function mount(moduleId, kind, container, mountInfo) {
  const element = document.createElement('iframe')
  element.setAttribute('sandbox', 'allow-scripts')
  element.src = '/sandbox.html?module=' + encodeURIComponent(moduleId)
  const frame = {
    element,
    moduleId,
    kind,
    mountInfo,
    generation: crypto.randomUUID(),
    active: false,
  }
  frames.set(moduleId, frame)
  container.append(element)
  return frame
}
function start() {
  stopped = false
  removeFrames()
  $('status').textContent = '加载中'
  if (state.manifest.modules.logic) mount(state.manifest.modules.logic.entry, 'logic', $('runners'))
  else $('status').textContent = '无后台入口'
  // Views open only after logic activation, when their actions have registered.
  updateSearchControls()
}
function hasProtocol(providerId, protocol) {
  return state?.manifest.contributes?.providers?.some(
    (provider) => provider.id === providerId && provider.protocols?.includes(protocol),
  )
}
function supportsMethod(item, method) {
  const protocol = method === 'search' ? 'music.search@1' : 'music.resolve@1'
  return item?.kind === 'provider' && Array.isArray(item.methods) &&
    item.methods.includes('tracks.' + method) && hasProtocol(item.id, protocol)
}
function isAvailable(item, method) {
  return !stopped && supportsMethod(item, method) && item.frame.active &&
    !item.frame.failed && frames.get(item.frame.moduleId) === item.frame
}
function updateSearchControls() {
  const item = registrations.get('provider:' + $('provider').value)
  const available = isAvailable(item, 'search')
  $('provider').disabled = !available
  $('query').disabled = !available
  $('search').disabled = !available
  $('cancel').disabled = !currentInvocation || !calls.has(currentInvocation.id)
  const logic = [...frames.values()].find((frame) => frame.kind === 'logic')
  let message
  if (stopped) message = '插件已停止，点击“重新运行”后继续调试。'
  else if (logic?.failed) message = '后台模块运行失败，请查看右侧日志并修复后重新运行。'
  else if (!state?.manifest.contributes?.providers?.some((p) => p.protocols?.includes('music.search@1')))
    message = '当前插件未提供搜索能力。页面插件可点击左侧“界面与兼容模块”中的页面进行预览；命令在“能力注册”中调用。'
  else if (!logic) message = '插件声明了搜索能力，但没有后台入口；请检查 Manifest 的 modules.logic。'
  else if (!logic.active) message = '后台模块正在启动，搜索将在注册完成后启用。'
  else if (!available) message = '插件声明了搜索能力，但尚未注册 search 实现；请检查后台的 ctx.providers.register(...)。'
  else message = '搜索来源已就绪。'
  $('search-status').textContent = message
  if (!$('results').children.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.dataset.capabilityHint = 'true'
    $('results').append(empty)
  }
  const empty = $('results').querySelector('[data-capability-hint]')
  if (empty) empty.textContent = available ? '输入关键词后点击“调用搜索”。' : message
}
function drawRegistrations() {
  $('registrations').replaceChildren()
  const selected = $('provider').value
  $('provider').replaceChildren()
  for (const [key, item] of registrations) {
    const row = document.createElement('div')
    row.className = 'item'
    if (item.kind === 'provider') {
      const meta = state.manifest.contributes?.providers?.find((p) => p.id === item.id)
      const img = document.createElement('img')
      img.width = 22
      img.height = 22
      img.src = iconUrl(meta?.icon?.name)
      row.append(img)
      row.append(document.createTextNode(meta?.name || item.id))
      if (supportsMethod(item, 'search')) {
        const option = document.createElement('option')
        option.value = item.id
        option.textContent = meta?.name || item.id
        $('provider').append(option)
      }
    } else if (item.kind === 'playlist-importer') {
      const button = document.createElement('button')
      const meta = state.manifest.contributes?.playlistImporters?.find((p) => p.id === item.id)
      button.textContent = '导入 · ' + (meta?.title || item.id)
      button.onclick = () => openPlaylistImport(item.id)
      row.append(button)
    } else {
      const button = document.createElement('button')
      button.textContent = item.id
      button.onclick = () =>
        invoke(item.frame, 'action', item.id, '', [{}])
          .then(showResult)
          .catch((e) => log('error', e.message))
      row.append(button)
    }
    $('registrations').append(row)
  }
  if ([...$('provider').options].some((option) => option.value === selected))
    $('provider').value = selected
  if (!$('provider').options.length) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = '无可用搜索来源'
    $('provider').append(option)
  }
  if (!registrations.size)
    $('registrations').textContent = stopped ? '插件已停止' : '等待后台模块注册命令或能力'
  updateSearchControls()
}
function invoke(frame, kind, target, method, args, signal) {
  const id = 'call-' + ++sequence
  currentInvocation = { frame, id }
  log('info', { call: kind === 'action' ? target : target + '.' + method })
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const call = calls.get(id)
      if (!call) return
      clearTimeout(call.timer)
      calls.delete(id)
      post(frame, 'cancel', { id })
      reject(new Error('Surface invocation cancelled'))
    }
    signal?.addEventListener('abort', cancel, { once: true })
    calls.set(id, {
      frame,
      resolve: (value) => {
        signal?.removeEventListener('abort', cancel)
        try {
          if (
            kind === 'playlist-importer' ||
            (kind === 'provider' &&
              ['tracks.search', 'playlists.search', 'playlists.categories', 'playlists.list', 'playlists.get', 'charts.list', 'charts.getTracks'].includes(method))
          )
            assertContentPage(value)
          if (kind === 'provider' && method === 'tracks.lyrics') assertLyricsDocument(value)
          if (kind === 'provider' && method === 'tracks.resolve') assertResolveResult(value)
          resolve(value)
        } catch (error) { reject(error) }
      },
      reject: error => { signal?.removeEventListener('abort', cancel); reject(error) },
      timer: setTimeout(() => {
        calls.delete(id)
        updateSearchControls()
        post(frame, 'cancel', { id })
        signal?.removeEventListener('abort', cancel)
        reject(new Error('Invocation timed out'))
      }, 20000),
    })
    if (signal?.aborted) { cancel(); return }
    updateSearchControls()
    post(frame, 'invoke', { id, kind, target, method, args })
  })
}
function showResult(value) {
  $('result-detail').textContent = JSON.stringify(value ?? null, null, 2)
  document.getElementById('media-preview')?.remove()
  if (value?.ok && typeof value.url === 'string') {
    const audio = document.createElement('audio')
    audio.id = 'media-preview'
    audio.controls = true
    audio.src = value.url
    $('result-detail').after(audio)
  }
  return value
}
function runAction(action, input = {}, signal) {
  const item = registrations.get('action:' + action)
  if (!item) return Promise.reject(new Error('Action is not registered: ' + action))
  return invoke(item.frame, 'action', action, '', [input], signal)
}

// A single Host-owned preview for all importers. Plugins contribute data callbacks only.
// The desktop application maps the same declarations to its existing import dialog.
function openPlaylistImport(importerId, initialValue = '') {
  const item = registrations.get('playlist-importer:' + importerId)
  const meta = state.manifest.contributes?.playlistImporters?.find((p) => p.id === importerId)
  if (!item || !meta) throw new Error('Playlist importer is not registered')
  document.getElementById('host-playlist-import')?.remove()
  const dialog = document.createElement('dialog')
  dialog.id = 'host-playlist-import'
  const title = document.createElement('h3'); title.textContent = meta.title
  const description = document.createElement('p'); description.textContent = meta.description || '粘贴歌单链接或 ID'
  const input = document.createElement('input'); input.placeholder = meta.placeholder || '歌单链接或 ID'; input.value = initialValue
  const examples = document.createElement('ul')
  for (const example of meta.examples || []) { const li = document.createElement('li'); li.textContent = example.label + '：' + example.value; examples.append(li) }
  for (const note of meta.instructions || []) { const li = document.createElement('li'); li.textContent = note; examples.append(li) }
  const load = document.createElement('button'); load.textContent = '读取歌曲'
  const close = document.createElement('button'); close.textContent = '关闭'; close.onclick = () => dialog.close()
  const detail = document.createElement('pre')
  const hint = document.createElement('p')
  hint.textContent = '独立开发 Host 可预览解析结果；保存到软件本地/云歌单需要连接澜音正式 Host。'
  let cursor
  let previousValue
  load.onclick = async () => {
    if (!input.value.trim()) { detail.textContent = '请输入歌单链接或 ID'; return }
    if (input.value !== previousValue) cursor = undefined
    load.disabled = true
    try {
      const result = await invoke(item.frame, 'playlist-importer', importerId, 'getTracks', [{ value: input.value.trim(), cursor, limit: 100 }])
      previousValue = input.value
      cursor = result.nextCursor
      detail.textContent = JSON.stringify(result, null, 2)
      load.textContent = cursor ? '读取下一页' : '重新读取'
    } catch (error) { detail.textContent = error.message }
    finally { load.disabled = false }
  }
  dialog.append(title, description, input, examples, load, close, hint, detail)
  document.body.append(dialog); dialog.showModal()
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
}
function renderSchema(node, values, container) {
  if (!node || typeof node !== 'object') return
  if (['section', 'stack', 'form', 'grid'].includes(node.type)) {
    const group = document.createElement('div')
    if (node.title) {
      const title = document.createElement('h3')
      title.textContent = node.title
      group.append(title)
    }
    for (const child of (node.children || []).slice(0, 100)) renderSchema(child, values, group)
    container.append(group)
    return
  }
  if (node.type === 'button') {
    const button = document.createElement('button')
    button.textContent = node.label || '执行'
    button.onclick = () =>
      runAction(node.action, values)
        .then(showResult)
        .catch((e) => log('error', e.message))
    container.append(button)
    return
  }
  if (node.type === 'host-content') {
    const content = document.createElement('div')
    content.className = 'host-content-preview'
    content.textContent = '宿主原内容（正式 Host 在这里保持现有组件和交互）'
    container.append(content)
    return
  }
  if (['text-input', 'input', 'number', 'toggle', 'host-credential'].includes(node.type)) {
    const label = document.createElement('label')
    label.textContent = node.label || node.bind || ''
    const input = document.createElement('input')
    input.type = node.type === 'number' ? 'number' : node.type === 'toggle' ? 'checkbox' : 'text'
    if (node.type === 'host-credential') {
      input.disabled = true
      input.placeholder = '凭据保险箱由生产 Host 提供'
    } else input.value = values[node.bind] ?? ''
    input.oninput = () => {
      values[node.bind] = input.type === 'checkbox' ? input.checked : input.value
    }
    label.append(input)
    container.append(label)
    return
  }
  const text = document.createElement('p')
  text.textContent =
    node.text || node.label || (node.bind ? String(values[node.bind] ?? '') : '[' + node.type + ']')
  container.append(text)
}
function showView(id, mountInfo = { kind: 'page' }) {
  viewTransition = viewTransition.catch(() => {}).then(async () => {
    await closeView()
    if (stopped) return
    viewMountInfo = mountInfo
    const logicEntry = state.manifest.modules.logic?.entry
    if (logicEntry && !frames.get(logicEntry)?.active) {
      viewId = id
      $('preview').textContent = '正在启动插件…'
      return
    }
    mountView(id, mountInfo)
  })
  return viewTransition.catch(error => log('error', error.message))
}
async function closeView() {
  const previousPlaylistPage = playlistPagePreview
  playlistPagePreview = undefined
  nativePreview?.dispose()
  nativePreview = undefined
  const previous = viewSession
  viewSession = undefined
  viewId = null
  for (const [key, frame] of frames) if (frame.kind !== 'logic') {
    post(frame, 'dispose')
    frame.element.remove()
    frames.delete(key)
  }
  $('preview').replaceChildren()
  await previous?.close()
  await previousPlaylistPage?.close()
}
function mountView(id, mountInfo) {
  viewId = id
  for (const [key, frame] of frames)
    if (frame.kind !== 'logic') {
      frame.element.remove()
      frames.delete(key)
    }
  $('preview').replaceChildren()
  if (id === PLAYLIST_PAGE) {
    playlistPagePreview = new PlaylistPagePreview($('preview'), state.manifest, runAction, error => log('error', error.message))
    void playlistPagePreview.open(mountInfo.sectionId).catch(error => log('error', error.message))
    return
  }
  const view = state.manifest.modules.surfaces?.find((v) => v.id === id)
  if (view?.kind === 'web') {
    viewSession = new SurfaceSession(view, state.manifest, runAction)
    const frame = mount(view.entry, 'web', $('preview'), mountInfo)
    frame.surfaceId = id
    frame.session = viewSession
    if (view.presentation?.kind === 'modal') {
      frame.element.style.width = (view.presentation.size ?? 480) + 'px'
      frame.element.style.maxWidth = '100%'
      frame.element.style.display = 'block'
      frame.element.style.marginInline = 'auto'
      frame.element.scrollIntoView({ block: 'center' })
    }
  }
  else if (view?.kind === 'native') {
    viewSession = new SurfaceSession(view, state.manifest, runAction)
    nativePreview = new NativeSurfacePreview(
      $('preview'), viewSession,
      new Set(state.manifest.contributes?.commands?.map(command => command.action)),
      error => log('error', error.message),
    )
    void nativePreview.open()
  }
  else if (view?.kind === 'schema')
    renderSchema(
      state.resources[view.entry]?.value?.root,
      { ...(surfaceStates.get(id) || {}) },
      $('preview'),
    )
  else {
    const adapter = state.manifest.contributes?.guestAdapters?.find((v) => v.id === id)
    if (adapter) mount(adapter.bootstrap, 'guest', $('preview'))
  }
}
function drawStatic() {
  $('plugin-name').textContent = state.manifest.name
  $('plugin-meta').textContent =
    state.manifest.id + ' · v' + state.manifest.version + ' · revision ' + revision
  $('views').replaceChildren()
  const playlistPage = document.createElement('button')
  playlistPage.textContent = '歌单页 · 本地与云歌单'
  playlistPage.onclick = () => showView(PLAYLIST_PAGE)
  $('views').append(playlistPage)
  for (const section of [...(state.manifest.contributes?.playlistSections ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const button = document.createElement('button')
    button.textContent = '歌单页 · ' + section.title
    button.onclick = () => showView(PLAYLIST_PAGE, { kind: 'page', sectionId: section.id })
    $('views').append(button)
  }
  accountButtons.clear()
  accountLogoutButtons.clear()
  for (const account of state.manifest.contributes?.accountItems ?? []) {
    const item = document.createElement('div')
    item.className = 'account-item'
    const button = document.createElement('button')
    button.textContent = '账号 · ' + account.title
    button.onclick = () => showView(account.view)
    button.disabled = true
    accountButtons.set(account.id, button)
    item.append(button)
    if (account.logoutAction) {
      const logout = document.createElement('button')
      logout.textContent = '退出登录'
      logout.className = 'account-logout'
      logout.hidden = true
      logout.onclick = async () => {
        logout.disabled = true
        try { await runAction(account.logoutAction); await refreshAccountItems(account.view) }
        catch (error) { log('error', error.message) }
        finally { logout.disabled = false }
      }
      accountLogoutButtons.set(account.id, logout)
      item.append(logout)
    }
    $('views').append(item)
  }
  for (const view of [
    ...(state.manifest.modules.surfaces || []),
    ...(state.manifest.contributes?.guestAdapters || []),
  ]) {
    const button = document.createElement('button')
    button.textContent = view.id + (view.kind ? ' · ' + view.kind : ' · guest bootstrap')
    button.onclick = () => showView(view.id)
    $('views').append(button)
  }
  for (const section of state.manifest.contributes?.homeSections || []) {
    const button = document.createElement('button')
    button.textContent = '首页 · ' + section.title + ' · ' + section.kind
    button.disabled = !section.view
    if (section.view) button.onclick = () => showView(section.view)
    else button.title = '正式 Host 将复用软件现有页面'
    $('views').append(button)
  }
  for (const extension of state.manifest.contributes?.uiExtensions || []) {
    const button = document.createElement('button')
    button.textContent = extension.slot + ' · ' + extension.mode
    button.onclick = () =>
      showView(extension.view, {
        kind: 'slot',
        slot: extension.slot,
        mode: extension.mode,
      })
    $('views').append(button)
  }
  $('permissions').replaceChildren()
  const renderedGroups = new Set()
  for (const permission of state.manifest.permissions || []) {
    const group = permissionGroup(permission.name) || 'other'
    if (!renderedGroups.has(group)) {
      renderedGroups.add(group)
      const declared = (state.manifest.permissions || []).filter(
        (item) => (permissionGroup(item.name) || 'other') === group,
      )
      const header = document.createElement('div')
      header.className = 'permission-group'
      const title = document.createElement('strong')
      title.textContent = PERMISSION_GROUPS[group]?.title || '其他权限'
      const button = document.createElement('button')
      const allGranted = declared.every((item) => state.grants[item.key])
      button.textContent = allGranted ? '撤销整组' : '授予整组'
      button.onclick = async () => {
        try {
          for (const item of declared)
            await api('grant', {
              key: item.key,
              allow: !allGranted,
            })
          state = await api('state')
          drawStatic()
        } catch (error) {
          log('error', error.message)
        }
      }
      header.append(title, button)
      $('permissions').append(header)
    }
    const row = document.createElement('div')
    row.className = 'permission'
    const title = document.createElement('strong')
    title.textContent = permission.key
    const reason = document.createElement('small')
    reason.textContent = permission.reason
    const button = document.createElement('button')
    button.textContent = state.grants[permission.key] ? '撤销' : '授予'
    button.onclick = async () => {
      try {
        await api('grant', {
          key: permission.key,
          allow: !state.grants[permission.key],
        })
        state = await api('state')
        drawStatic()
      } catch (e) {
        log('error', e.message)
      }
    }
    row.append(title, reason)
    row.append(button)
    $('permissions').append(row)
  }
  if (!(state.manifest.permissions || []).length)
    $('permissions').textContent = '此插件未声明额外权限'
  for (const style of document.querySelectorAll('style[data-plugin-global-style]')) style.remove()
  const hasGlobalStyleGrant = (state.manifest.permissions || []).some(
    (permission) => permission.name === 'ui.styles.global' && state.grants[permission.key],
  )
  if (hasGlobalStyleGrant)
    for (const contribution of state.manifest.contributes?.styles || []) {
      if (contribution.scope !== 'application') continue
      const resource = state.resources[contribution.resource]
      if (resource?.type !== 'text') continue
      const style = document.createElement('style')
      style.dataset.pluginGlobalStyle = contribution.id
      style.textContent = resource.value
      document.head.append(style)
    }
  $('icons').replaceChildren()
  for (const name of Object.keys(state.catalog.icons)) {
    const card = document.createElement('div')
    card.className = 'icon-card'
    const img = document.createElement('img')
    img.src = iconUrl(name)
    card.append(img, document.createTextNode(name))
    $('icons').append(card)
  }
  $('static-assets').replaceChildren()
  for (const [name, url] of Object.entries(state.catalog.assets)) {
    const card = document.createElement('div'),
      image = document.createElement('img'),
      label = document.createElement('div')
    image.src = url
    label.textContent = name
    label.className = 'hint'
    card.append(image, label)
    $('static-assets').append(card)
  }
}
async function refreshAccountItems(surfaceId) {
  await Promise.all((state.manifest.contributes?.accountItems ?? []).map(async account => {
    if ((surfaceId && account.view !== surfaceId) || !registrations.has('action:' + account.action)) return
    const button = accountButtons.get(account.id)
    if (!button) return
    try {
      const summary = await runAction(account.action)
      assertAccountSummary(summary)
      button.textContent = '账号 · ' + summary.displayName + (summary.badge ? ' · ' + summary.badge : '')
      button.disabled = false
      const logout = accountLogoutButtons.get(account.id)
      if (logout) logout.hidden = !summary.signedIn
    } catch (error) {
      button.textContent = '账号 · ' + account.title
      button.disabled = false
      log('error', error.message)
    }
  }))
}
window.addEventListener('message', async (event) => {
  const frame = [...frames.values()].find((f) => f.element.contentWindow === event.source)
  if (!frame || !event.data?.type) return
  const message = event.data
  if (message.type === 'ready') {
    post(frame, 'init', {
      generation: frame.generation,
      kind: frame.kind,
      manifest: frame.kind === 'web' ? { ...state.manifest, config: {} } : state.manifest,
      catalog: state.catalog,
      resources: state.resources,
      mount: frame.mountInfo,
    })
    return
  }
  if (message.generation !== frame.generation) return
  const data = message.data
  if (message.type === 'resize' && frame.kind === 'web' &&
    Number.isFinite(data?.height) && data.height >= 1 && data.height <= 16384) {
    frame.element.style.minHeight = '0'
    frame.element.style.height = Math.min(Math.max(120, data.height), Math.max(160, window.innerHeight - 160)) + 'px'
  }
  if (message.type === 'active') {
    frame.active = true
    frame.failed = false
    $('status').textContent = '运行中'
    log('info', frame.moduleId + ' activated')
    drawRegistrations()
    if (frame.kind === 'web') {
      post(frame, 'state', surfaceStates.get(frame.surfaceId) ?? {})
      void frame.session.open().catch(error => log('error', error.message))
    } else if (frame.kind === 'logic') {
      void refreshAccountItems()
      if (viewId) void showView(viewId, viewMountInfo)
    }
  }
  if (message.type === 'failed') {
    frame.failed = true
    frame.active = false
    for (const [key, item] of registrations) {
      if (item.frame === frame) registrations.delete(key)
    }
    drawRegistrations()
    $('status').textContent = '运行失败'
    log('error', data.message)
  }
  if (message.type === 'log') log(data.level, data.values)
  if (message.type === 'notify') log(data.level, data.message)
  if (message.type === 'open-view' && frame.kind === 'logic') void showView(data.surfaceId)
  if (message.type === 'close-view' &&
    ((frame.kind === 'logic' && data.surfaceId === viewId) ||
      (frame.kind === 'web' && frame.surfaceId === viewId)))
    void closeView().catch(error => log('error', error.message))
  if (message.type === 'register') {
    if (frame.kind !== 'logic') return
    const valid =
      data.kind === 'provider'
        ? state.manifest.contributes?.providers?.some((p) => p.id === data.id)
        : data.kind === 'playlist-importer'
          ? state.manifest.contributes?.playlistImporters?.some((p) => p.id === data.id)
        : data.kind === 'lyric-converter' ? state.manifest.contributes?.lyricConverters?.some((p) => p.id === data.id)
        : state.manifest.contributes?.commands?.some((p) => p.action === data.id)
    if (valid) {
      registrations.set(data.kind + ':' + data.id, { ...data, frame })
      drawRegistrations()
    }
  }
  if (message.type === 'unregister') {
    registrations.delete(data.kind + ':' + data.id)
    drawRegistrations()
  }
  if (message.type === 'state' && frame.kind === 'logic') {
    const changed = JSON.stringify(surfaceStates.get(data.surfaceId)) !== JSON.stringify(data.state)
    surfaceStates.set(data.surfaceId, data.state)
    if (changed) void playlistPagePreview?.refresh(data.surfaceId)
    if (changed) void refreshAccountItems(data.surfaceId)
    if (changed && viewId === data.surfaceId) void nativePreview?.refresh()
    for (const view of frames.values()) if (view.kind === 'web' && view.surfaceId === data.surfaceId) post(view, 'state', data.state)
    if (
      viewId === data.surfaceId &&
      state.manifest.modules.surfaces?.find((v) => v.id === viewId)?.kind === 'schema'
    )
      showView(viewId)
  }
  if (message.type === 'invoke-result') {
    const call = calls.get(data.id)
    if (call?.frame === frame) {
      clearTimeout(call.timer)
      calls.delete(data.id)
      updateSearchControls()
      data.error ? call.reject(new Error(data.error)) : call.resolve(data.value)
    }
  }
  if (message.type === 'rpc') {
    try {
      let value
      if (data.method === 'surface.invoke' && frame.kind === 'web')
        value = await frame.session.invoke(data.data.action, data.data.input ?? {})
      else if (frame.kind !== 'logic')
        throw new Error('This Surface/Guest cannot call a logic Host API directly')
      else if (data.method === 'permissions.requestGroup') {
        const declared = (state.manifest.permissions || []).filter(
          (permission) =>
            permissionGroup(permission.name) === data.data.group &&
            (!data.data.keys || data.data.keys.includes(permission.key)),
        )
        if (!declared.length) throw new Error('No permissions are declared in this group')
        const allowed = confirm(
          '开发权限组申请：' +
            data.data.group +
            '\n\n' +
            declared.map((permission) => permission.reason).join('\n'),
        )
        if (allowed) {
          for (const declaration of declared) {
            await api('grant', {
              key: declaration.key,
              allow: true,
            })
          }
          state = await api('state')
          drawStatic()
        }
        value = {
          group: data.data.group,
          status: allowed ? 'granted' : 'denied',
          grants: declared.map((permission) => ({
            key: permission.key,
            name: permission.name,
            group: data.data.group,
            scope: permission.scope || {},
            status: allowed ? 'granted' : 'denied',
          })),
        }
      } else if (data.method === 'ui.dialogs.confirm')
        value = confirm(data.data.message || data.data.title || '确认操作？')
      else if (data.method === 'ui.dialogs.prompt')
        value = prompt(data.data.label || data.data.title || '请输入', data.data.value || '')
      else if (data.method === 'ui.navigation.open') {
        assertNavigationRequest(data.data, state.manifest)
        log('info', { navigation: data.data })
        if (data.data.page === 'playlist' && !data.data.ref)
          void showView(PLAYLIST_PAGE, { kind: 'page', sectionId: data.data.sectionId })
        value = null
      }
      else if (data.method === 'ui.playlistImport.open') {
        openPlaylistImport(data.data.importerId, data.data.initialValue)
        value = null
      }
      else if (data.method === 'permissions.request') {
        const declaration = state.manifest.permissions?.find((p) => p.key === data.data.key)
        if (!declaration) value = { status: 'undeclared' }
        else {
          const allowed = confirm(
            '开发权限申请：' +
              declaration.key +
              '\n' +
              declaration.reason,
          )
          if (allowed) {
            await api('grant', {
              key: declaration.key,
              allow: true,
            })
            state = await api('state')
            drawStatic()
          }
          value = { status: allowed ? 'granted' : 'denied' }
        }
      } else value = (await api('rpc', { method: data.method, data: data.data })).value
      post(frame, 'rpc-result', { id: data.id, value })
    } catch (e) {
      post(frame, 'rpc-result', { id: data.id, error: e.message })
    }
  }
})
$('search').onclick = async () => {
  const id = $('provider').value
  const item = registrations.get('provider:' + id)
  if (!isAvailable(item, 'search')) {
    updateSearchControls()
    return
  }
  try {
    const result = await invoke(item.frame, 'provider', id, 'tracks.search', [
      { query: $('query').value, kinds: ['track'], filters: {}, limit: 20 },
    ])
    if (!isAvailable(item, 'search')) return
    showResult(result)
    $('results').replaceChildren()
    for (const track of result.items || []) {
      const row = document.createElement('div')
      row.className = 'track'
      const title = document.createElement('div')
      title.textContent = track.title
      const button = document.createElement('button')
      button.textContent = '调用解析'
      button.disabled = !isAvailable(item, 'resolve')
      if (button.disabled) button.title = '此来源未提供播放解析能力'
      button.onclick = () =>
        isAvailable(item, 'resolve') &&
        invoke(item.frame, 'provider', id, 'tracks.resolve', [track.ref, undefined])
          .then(showResult)
          .catch((e) => log('error', e.message))
      row.append(title, button)
      $('results').append(row)
    }
    if (!(result.items || []).length) $('results').textContent = '没有结果'
  } catch (e) {
    if (isAvailable(item, 'search')) log('error', e.message)
  }
}
$('provider').onchange = updateSearchControls
$('cancel').onclick = () => {
  if (currentInvocation) post(currentInvocation.frame, 'cancel', { id: currentInvocation.id })
}
$('restart').onclick = start
$('stop').onclick = () => {
  stopped = true
  removeFrames()
  $('status').textContent = '已停止'
}
$('clear-log').onclick = () => $('logs').replaceChildren()
$('close-view').onclick = () => { void closeView().catch(error => log('error', error.message)) }
$('apply-config').onclick = async () => {
  try {
    await api('config', JSON.parse($('config').value))
    start()
  } catch (e) {
    log('error', e.message)
  }
}
async function poll() {
  try {
    const next = await api('state')
    $('build-error').classList.toggle('hidden', !next.error)
    $('build-error').textContent = next.error || ''
    if (next.revision !== revision) {
      state = next
      revision = next.revision
      drawStatic()
      for (const warning of next.migrationWarnings || []) log('warn', warning)
      if (!stopped) start()
    }
    const { events } = await api('socket-events')
    for (const event of events) {
      for (const frame of frames.values()) if (frame.kind === 'logic' && frame.active) post(frame, 'socket-event', event)
    }
  } catch (e) {
    $('status').textContent = 'Host 已断开'
    log('error', e.message)
  }
}
window.__ceruDev = {
  get state() {
    return state
  },
  get registrations() {
    return [...registrations.keys()]
  },
  runAction,
  restart: start,
}
poll()
setInterval(poll, 750)
