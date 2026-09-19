import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'

/** Node worker + realm-local SDK. No Node modules or host objects enter plugin globals. */
export class NodePluginSandbox {
  private worker?: Worker
  private generation = randomUUID()
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    private readonly rpc: (method: string, data: any) => Promise<any>,
    private readonly event: (type: string, data: any) => void,
  ) {}
  async start(artifact: Artifact): Promise<void> {
    const entry = artifact.header.manifest.modules.logic?.entry
    if (!entry) return
    const worker = new Worker(new URL('./node-worker.js', import.meta.url), {
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    })
    this.worker = worker
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Plugin activation timed out'))
        this.dispose()
      }, 30000)
      worker.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
        this.dispose()
      })
      worker.on('exit', () => {
        clearTimeout(timer)
        reject(new Error('Plugin runtime stopped'))
        this.dispose()
        this.event('closed', {})
      })
      worker.on('message', (message) => {
        if (message?.generation !== this.generation) return
        const { type, data } = message
        try {
          if (type === 'active') {
            clearTimeout(timer)
            resolve()
            return
          }
          if (type === 'failed') {
            clearTimeout(timer)
            reject(new Error(String(data.message)))
            this.dispose()
            return
          }
          if (type === 'rpc') {
            void this.rpc(String(data.method), data.data)
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
          if (type === 'invoke-result') {
            const call = this.pending.get(data.id)
            if (!call) return
            this.pending.delete(data.id)
            clearTimeout(call.timer)
            data.error ? call.reject(new Error(String(data.error))) : call.resolve(data.value)
            return
          }
          this.event(type, data)
        } catch (error) {
          clearTimeout(timer)
          reject(error)
          this.dispose()
        }
      })
      worker.postMessage({
        type: 'boot',
        generation: this.generation,
        manifest: artifact.header.manifest,
        resources: artifact.resources,
        entry: artifact.modules[entry],
      })
    })
  }
  async send(type: string, data: any): Promise<void> {
    this.worker?.postMessage({ type, data, generation: this.generation })
  }
  invoke(
    kind: string,
    target: string,
    method: string,
    args: any[],
    signal?: AbortSignal,
    operationId?: string,
  ): Promise<any> {
    const id = operationId ?? randomUUID()
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Plugin runtime is not active'))
        return
      }
      const cancel = () => {
        void this.send('cancel', { id })
        done()
        this.pending.delete(id)
        reject(new Error('Plugin operation cancelled'))
      }
      const timer = setTimeout(() => {
        cancel()
        this.dispose()
      }, 120000)
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
        cancel()
        return
      }
      void this.send('invoke', { id, kind, target, method, args })
    })
  }
  dispose(): void {
    const worker = this.worker
    this.worker = undefined
    for (const call of this.pending.values()) {
      clearTimeout(call.timer)
      call.reject(new Error('Plugin runtime stopped'))
    }
    this.pending.clear()
    void worker?.terminate()
  }
}
