const { app, BrowserWindow } = require('electron')
const origin = process.env.CERU_DEV_ORIGIN
const debugPort = process.env.CERU_DEV_DEBUG_PORT || '9223'
const visibility = process.env.CERU_DEV_HIDDEN === '1' ? 'hidden' : 'visible'
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ''))
  throw new Error('Invalid development Host origin')
console.log('[Ceru Electron] launching', origin, 'debug port', debugPort)
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
app.commandLine.appendSwitch('remote-debugging-port', debugPort || '9223')
app.whenReady().then(() => {
  console.log('[Ceru Electron] ready')
  const window = new BrowserWindow({
    title: 'Ceru Plugin Dev',
    width: 1420,
    height: 960,
    show: visibility !== 'hidden',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'ceru-plugin-dev-' + Date.now(),
    },
  })
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  )
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      callback({ cancel: !details.url.startsWith(origin + '/') })
    },
  )
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin + '/')) event.preventDefault()
  })
  window.webContents.on('will-frame-navigate', (event) => {
    if (!event.url.startsWith(origin + '/')) event.preventDefault()
  })
  window.loadURL(origin + '/').catch((error) => console.error('[Ceru Electron] load failed', error))
})
app.on('window-all-closed', () => app.quit())
