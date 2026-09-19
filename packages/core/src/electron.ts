import { BrowserWindow, ipcMain, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
let cachedAssets: Promise<[string, string]> | undefined
function assets() {
  return (cachedAssets ??= Promise.all([
    readFile(new URL('../assets/sandbox.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/catalog.json', import.meta.url), 'utf8'),
  ]))
}

/** Chromium's OS sandbox executes plugin code; only JSON messages cross IPC. */
export class ElectronPluginSandbox {
  static async prewarm(): Promise<void> {
    await assets()
  }
  private window?: BrowserWindow
  private readonly generation = randomUUID()
  private readonly pending = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private listener?: (event: Electron.IpcMainEvent, message: any) => void
  constructor(
    private readonly rpc: (method: string, data: any) => Promise<any>,
    private readonly event: (type: string, data: any) => void,
  ) {}

  async start(artifact: Artifact, surfaceId?: string): Promise<void> {
    const surface = artifact.header.manifest.modules.surfaces?.find((item) => item.id === surfaceId)
    const moduleId = surfaceId ? surface?.entry : artifact.header.manifest.modules.logic?.entry
    if (!moduleId) {
      if (surfaceId) throw new Error('Unknown surface')
      return
    }
    const code = artifact.modules[moduleId]
    if (!code) throw new Error('Missing plugin entry')
    const [runtime, catalog] = await assets()
    const isolatedSession = session.fromPartition('ceru-plugin-' + this.generation)
    isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    isolatedSession.setPermissionCheckHandler(() => false)
    isolatedSession.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !/^(data:|about:)/.test(details.url) }),
    )
    const win = new BrowserWindow({
      show: false,
      width: 1040,
      height: 760,
      title: artifact.header.manifest.name,
      webPreferences: {
        session: isolatedSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        backgroundThrottling: false,
        preload: fileURLToPath(new URL('../assets/preload.cjs', import.meta.url)),
      },
    })
    this.window = win
    win.on('close', (event) => {
      event.preventDefault()
      win.hide()
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => {
      this.window = undefined
      this.dispose()
      this.event('closed', {})
    })
    win.webContents.on('render-process-gone', () => this.dispose())
    const htmlScript = (source: string) =>
      '<script src="data:text/javascript;base64,' +
      Buffer.from(source).toString('base64') +
      '"></script>'
    const html =
      "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src data:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'\"><div id=\"plugin-root\"></div>" +
      htmlScript(runtime) +
      htmlScript('globalThis.__ceruStart(' + code + ');')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Plugin activation timed out'))
        this.dispose()
      }, 30000)
      this.listener = (event, message) => {
        if (event.sender !== win.webContents || !message || typeof message !== 'object') return
        const { type, data } = message
        if (type === 'ready') {
          void this.send('init', {
            generation: this.generation,
            mode: 'production',
            kind: surfaceId ? 'web' : 'logic',
            manifest: artifact.header.manifest,
            resources: artifact.resources,
            catalog: JSON.parse(catalog),
            mount: { kind: 'page' },
          })
          return
        }
        if (message.generation !== this.generation) return
        if (type === 'active') {
          clearTimeout(timer)
          if (surfaceId) win.show()
          resolve()
          return
        }
        if (type === 'failed') {
          clearTimeout(timer)
          reject(new Error(String(data?.message || 'Plugin failed')))
          return
        }
        if (type === 'invoke-result') {
          const call = this.pending.get(data?.id)
          if (!call) return
          this.pending.delete(data.id)
          clearTimeout(call.timer)
          data.error ? call.reject(new Error(String(data.error))) : call.resolve(data.value)
          return
        }
        if (type === 'rpc') {
          void this.rpc(String(data?.method), data?.data)
            .then(
              (value) => this.send('rpc-result', { id: data.id, value }),
              (error) =>
                this.send('rpc-result', {
                  id: data.id,
                  error: error instanceof Error ? error.message : 'Host request failed',
                }),
            )
            .catch(() => {})
          return
        }
        this.event(type, data)
      }
      ipcMain.on('ceru:runtime', this.listener)
      void win
        .loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    }).catch((error) => {
      this.dispose()
      throw error
    })
  }

  send(type: string, data: any): Promise<any> {
    if (!this.window || this.window.isDestroyed())
      return Promise.reject(new Error('Plugin is stopped'))
    return this.window.webContents
      .executeJavaScript(
        'window.postMessage(' +
          JSON.stringify({ type, data, generation: this.generation }) +
          ', "*")',
      )
      .then(() => undefined)
  }
  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
    }
  }

  invoke(
    kind: string,
    target: string,
    method: string,
    args: any[],
    signal?: AbortSignal,
  ): Promise<any> {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.pending.delete(id)
        void this.send('cancel', { id }).catch(() => {})
        reject(new Error('Plugin operation cancelled'))
      }
      const timer = setTimeout(cancel, 120000)
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
      this.pending.set(id, {
        timer,
        resolve: (value) => {
          done()
          resolve(value)
        },
        reject: (error) => {
          done()
          reject(error)
        },
      })
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) {
        done()
        cancel()
        return
      }
      void this.send('invoke', { id, kind, target, method, args }).catch((error) => {
        this.pending.delete(id)
        done()
        reject(error)
      })
    })
  }

  dispose(): void {
    if (this.listener) ipcMain.removeListener('ceru:runtime', this.listener)
    this.listener = undefined
    for (const call of this.pending.values()) {
      clearTimeout(call.timer)
      call.reject(new Error('Plugin stopped'))
    }
    this.pending.clear()
    const win = this.window
    this.window = undefined
    if (win && !win.isDestroyed()) win.destroy()
  }
}
