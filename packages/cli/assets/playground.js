const $ = (id) => document.getElementById(id)
let state,
  revision = 0,
  sequence = 0,
  stopped = false,
  viewId = null,
  currentInvocation
const frames = new Map(),
  calls = new Map(),
  registrations = new Map(),
  surfaceStates = new Map()
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
  for (const frame of frames.values()) frame.element.remove()
  frames.clear()
  registrations.clear()
  for (const call of calls.values()) {
    clearTimeout(call.timer)
    call.reject(new Error('Plugin reloaded or stopped'))
  }
  calls.clear()
  drawRegistrations()
}
function mount(moduleId, kind, container) {
  const element = document.createElement('iframe')
  element.setAttribute('sandbox', 'allow-scripts')
  element.src = '/sandbox.html?module=' + encodeURIComponent(moduleId)
  const frame = { element, moduleId, kind, generation: crypto.randomUUID(), active: false }
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
  if (viewId) showView(viewId)
}
function drawRegistrations() {
  $('registrations').replaceChildren()
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
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = meta?.name || item.id
      $('provider').append(option)
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
  if (!registrations.size) $('registrations').textContent = '尚未注册'
}
function invoke(frame, kind, target, method, args) {
  const id = 'call-' + ++sequence
  currentInvocation = { frame, id }
  log('info', { call: kind === 'action' ? target : target + '.' + method })
  return new Promise((resolve, reject) => {
    calls.set(id, {
      frame,
      resolve,
      reject,
      timer: setTimeout(() => {
        calls.delete(id)
        post(frame, 'cancel', { id })
        reject(new Error('Invocation timed out'))
      }, 20000),
    })
    post(frame, 'invoke', { id, kind, target, method, args })
  })
}
function showResult(value) {
  $('result-detail').textContent = JSON.stringify(value ?? null, null, 2)
  document.getElementById('media-preview')?.remove()
  if (value?.ok && value.media?.kind === 'media') {
    const audio = document.createElement('audio')
    audio.id = 'media-preview'
    audio.controls = true
    audio.src = '/media/' + encodeURIComponent(value.media.id)
    $('result-detail').after(audio)
  }
  return value
}
function runAction(action, input) {
  const item = registrations.get('action:' + action)
  if (!item) return Promise.reject(new Error('Action is not registered: ' + action))
  return invoke(item.frame, 'action', action, '', [input])
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
function showView(id) {
  viewId = id
  for (const [key, frame] of frames)
    if (frame.kind !== 'logic') {
      frame.element.remove()
      frames.delete(key)
    }
  $('preview').replaceChildren()
  const view = state.manifest.modules.surfaces?.find((v) => v.id === id)
  if (view?.kind === 'web') mount(view.entry, 'web', $('preview'))
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
  for (const view of [
    ...(state.manifest.modules.surfaces || []),
    ...(state.manifest.contributes?.guestAdapters || []),
  ]) {
    const button = document.createElement('button')
    button.textContent = view.id + (view.kind ? ' · ' + view.kind : ' · guest bootstrap')
    button.onclick = () => showView(view.id)
    $('views').append(button)
  }
  $('permissions').replaceChildren()
  for (const permission of state.manifest.permissions || []) {
    const row = document.createElement('div')
    row.className = 'permission'
    const title = document.createElement('strong')
    title.textContent = permission.key
    const reason = document.createElement('small')
    reason.textContent = permission.reason
    const input = document.createElement('input')
    input.placeholder = '授权的确切 origin'
    input.value =
      state.grants[permission.key]?.origin ||
      (typeof permission.scope?.origin === 'string' ? permission.scope.origin : '')
    const button = document.createElement('button')
    button.textContent = state.grants[permission.key] ? '撤销' : '授予'
    button.onclick = async () => {
      try {
        await api('grant', {
          key: permission.key,
          allow: !state.grants[permission.key],
          origin: input.value,
        })
        state = await api('state')
        drawStatic()
      } catch (e) {
        log('error', e.message)
      }
    }
    row.append(title, reason)
    if (permission.name.startsWith('network.')) row.append(input)
    row.append(button)
    $('permissions').append(row)
  }
  if (!(state.manifest.permissions || []).length)
    $('permissions').textContent = '此插件未声明额外权限'
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
window.addEventListener('message', async (event) => {
  const frame = [...frames.values()].find((f) => f.element.contentWindow === event.source)
  if (!frame || !event.data?.type) return
  const message = event.data
  if (message.type === 'ready') {
    post(frame, 'init', {
      generation: frame.generation,
      kind: frame.kind,
      manifest: state.manifest,
      catalog: state.catalog,
      resources: state.resources,
    })
    return
  }
  if (message.generation !== frame.generation) return
  const data = message.data
  if (message.type === 'active') {
    frame.active = true
    $('status').textContent = '运行中'
    log('info', frame.moduleId + ' activated')
  }
  if (message.type === 'failed') {
    $('status').textContent = '运行失败'
    log('error', data.message)
  }
  if (message.type === 'log') log(data.level, data.values)
  if (message.type === 'notify') log(data.level, data.message)
  if (message.type === 'open-view') showView(data.surfaceId)
  if (message.type === 'register') {
    if (frame.kind !== 'logic') return
    const valid =
      data.kind === 'provider'
        ? state.manifest.contributes?.providers?.some((p) => p.id === data.id)
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
    surfaceStates.set(data.surfaceId, data.state)
    for (const view of frames.values()) if (view.kind === 'web') post(view, 'state', data.state)
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
      data.error ? call.reject(new Error(data.error)) : call.resolve(data.value)
    }
  }
  if (message.type === 'rpc') {
    try {
      let value
      if (data.method === 'surface.invoke' && frame.kind === 'web')
        value = await runAction(data.data.action, data.data.input)
      else if (frame.kind !== 'logic')
        throw new Error('This Surface/Guest cannot call a logic Host API directly')
      else if (data.method === 'permissions.request') {
        const declaration = state.manifest.permissions?.find((p) => p.key === data.data.key)
        if (!declaration) value = { status: 'undeclared' }
        else {
          const allowed = confirm(
            '开发权限申请：' +
              declaration.key +
              '\n' +
              declaration.reason +
              '\n若需要动态 origin，请先在权限面板中指定。',
          )
          if (allowed) {
            const scope = data.data.scope?.origin
            await api('grant', {
              key: declaration.key,
              allow: true,
              origin: typeof scope === 'string' ? scope : undefined,
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
  try {
    const id = $('provider').value,
      item = registrations.get('provider:' + id)
    if (!item) throw new Error('尚未注册 Provider')
    const result = await invoke(item.frame, 'provider', id, 'search', [
      { query: $('query').value, kinds: ['track'], filters: {}, limit: 20 },
    ])
    showResult(result)
    $('results').replaceChildren()
    for (const track of result.items || []) {
      const row = document.createElement('div')
      row.className = 'track'
      const title = document.createElement('div')
      title.textContent = track.title
      const button = document.createElement('button')
      button.textContent = '调用解析'
      button.onclick = () =>
        invoke(item.frame, 'provider', id, 'resolve', [track.ref, undefined])
          .then(showResult)
          .catch((e) => log('error', e.message))
      row.append(title, button)
      $('results').append(row)
    }
    if (!(result.items || []).length) $('results').textContent = '没有结果'
  } catch (e) {
    log('error', e.message)
  }
}
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
      if (!stopped) start()
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
