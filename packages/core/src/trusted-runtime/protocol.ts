import { randomUUID } from 'node:crypto'

export const MAX_MESSAGE_BYTES = 1024 * 1024
export const MAX_PENDING = 64
export const RPC_TIMEOUT_MS = 30_000
type Envelope = { token: string; type: 'request' | 'reply' | 'event'; id?: string; name?: string; data?: any; error?: string }

/** A bounded JSON protocol on the child's dedicated IPC pipe, never stdout. */
export class TrustedChannel {
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  private incoming = new Map<string, NodeJS.Timeout>()
  private closed = false
  private window = Date.now()
  private received = 0
  constructor(
    private token: string,
    private transport: (message: string, done: (error?: Error | null) => void) => void,
    private request: (name: string, data: any) => Promise<any>,
    private event: (name: string, data: any) => void,
    private fail: (error: Error) => void,
    private timeout = RPC_TIMEOUT_MS,
  ) {}
  private send(value: Omit<Envelope, 'token'>): Promise<void> {
    if (this.closed) return Promise.reject(Error('Trusted IPC is closed'))
    let encoded: string
    try {
      encoded = JSON.stringify({ ...value, token: this.token })
      if (Buffer.byteLength(encoded) > MAX_MESSAGE_BYTES) throw Error('Trusted IPC message exceeds limit')
    } catch (error) { return Promise.reject(error) }
    return new Promise((resolve, reject) => {
      try { this.transport(encoded, error => error ? reject(error) : resolve()) }
      catch (error) { reject(error) }
    })
  }
  notify(name: string, data?: any): Promise<void> { return this.send({ type: 'event', name, data }) }
  call(name: string, data?: any): Promise<any> {
    if (this.closed) return Promise.reject(Error('Trusted IPC is closed'))
    if (this.pending.size >= MAX_PENDING) return Promise.reject(Error('Trusted IPC pending limit exceeded'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(Error('Trusted IPC request timed out: ' + name))
      }, this.timeout)
      this.pending.set(id, { resolve, reject, timer })
      void this.send({ type: 'request', id, name, data }).catch(error => {
        clearTimeout(timer); this.pending.delete(id); reject(error)
      })
    })
  }
  receive(encoded: unknown): void {
    if (this.closed) return
    try {
      if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > MAX_MESSAGE_BYTES)
        throw Error('Invalid trusted IPC frame')
      const message = JSON.parse(encoded) as Envelope
      if (!message || message.token !== this.token) throw Error('Unauthenticated trusted IPC frame')
      if (Date.now() - this.window >= 1000) { this.window = Date.now(); this.received = 0 }
      if (++this.received > 1000) throw Error('Trusted IPC rate limit exceeded')
      if (message.type === 'reply') {
        if (typeof message.id !== 'string') throw Error('Invalid trusted IPC reply')
        const call = this.pending.get(message.id)
        if (!call) return // A late reply to an expired request is harmless.
        this.pending.delete(message.id); clearTimeout(call.timer)
        message.error === undefined ? call.resolve(message.data) : call.reject(Error(String(message.error)))
      } else if (message.type === 'request') {
        const { id, name } = message
        if (typeof id !== 'string' || id.length > 128 || typeof name !== 'string' || name.length > 128 ||
            this.incoming.has(id) || this.incoming.size >= MAX_PENDING)
          throw Error('Invalid trusted IPC request or capacity exceeded')
        // Keep the slot until the real handler settles; timed-out host work must
        // not create unbounded background work by recycling slots.
        const timer = setTimeout(() => this.fail(Error('Trusted IPC incoming request timed out')), this.timeout)
        this.incoming.set(id, timer)
        void Promise.resolve().then(() => this.request(name, message.data)).then(
          data => this.send({ type: 'reply', id, data }),
          error => this.send({ type: 'reply', id, error: String(error instanceof Error ? error.message : error).slice(0, 4096) }),
        ).catch(error => { if (!this.closed) this.fail(error) }).finally(() => {
          clearTimeout(timer); this.incoming.delete(id)
        })
      } else if (message.type === 'event' && typeof message.name === 'string' && message.name.length <= 128) {
        this.event(message.name, message.data)
      } else throw Error('Invalid trusted IPC message')
    } catch (error) { this.fail(error instanceof Error ? error : Error(String(error))) }
  }
  close(error = Error('Trusted runtime stopped')): void {
    this.closed = true
    for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(error) }
    this.pending.clear()
    for (const timer of this.incoming.values()) clearTimeout(timer)
  }
}
