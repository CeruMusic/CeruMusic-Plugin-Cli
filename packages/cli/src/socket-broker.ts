import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import WebSocket from 'ws'

interface Connection {
  key: string
  kind: 'websocket' | 'socket.io'
  socket: WebSocket | Socket
  agent: HttpAgent | HttpsAgent
  lastSend: number
  sends: number
}
interface SocketEvent {
  id: string
  event: string
  data: unknown
}

const privateAddress = (address: string): boolean => {
  const value = address.toLowerCase()
  if (value.startsWith('::ffff:')) return privateAddress(value.slice('::ffff:'.length))
  if (value.includes(':'))
    return (
      value === '::1' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80')
    )
  const parts = value.split('.').map(Number)
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}
const reservedEvents = new Set([
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
  'error',
  '__proto__',
  'constructor',
  'prototype',
])

/** Network libraries live in the Host. Plugins receive bounded JSON events and opaque handles. */
export class SocketBroker {
  private readonly connections = new Map<string, Connection>()
  private events: SocketEvent[] = []
  private generation = 0
  private connecting = 0

  async connect(
    input: any,
    privateAllowed: boolean,
    reservedPorts: number[],
  ): Promise<{ id: string }> {
    if (this.connections.size + this.connecting >= 8)
      throw new Error('Socket connection limit reached')
    this.connecting++
    const generation = this.generation
    try {
      const kind = input.kind
      if (!['websocket', 'socket.io'].includes(kind)) throw new Error('Unknown socket protocol')
      const url = new URL(input.url)
      if (
        url.username ||
        url.password ||
        url.hash ||
        (kind === 'websocket'
          ? !['ws:', 'wss:'].includes(url.protocol)
          : !['http:', 'https:'].includes(url.protocol))
      )
        throw new Error('Unsupported socket URL')
      const path = kind === 'socket.io' ? String(input.path || '/socket.io/') : url.pathname
      if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]|%(?:2f|5c)/i.test(path))
        throw new Error('Invalid socket path')
      const hostname = url.hostname.replace(/^\[|\]$/g, '')
      const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await lookup(hostname, { all: true })
      if (!addresses.length) throw new Error('No socket address found')
      if (addresses.some((item) => privateAddress(item.address)) && !privateAllowed)
        throw new Error('Private network access is not granted')
      const defaultPort = ['https:', 'wss:'].includes(url.protocol) ? 443 : 80
      if (reservedPorts.includes(Number(url.port) || defaultPort))
        throw new Error('Development ports are reserved')
      const chosen = addresses[0]
      const Agent = ['https:', 'wss:'].includes(url.protocol) ? HttpsAgent : HttpAgent
      const agent = new Agent({
        lookup: ((_hostname: string, options: any, callback: any) =>
          options?.all
            ? callback(null, [chosen])
            : callback(null, chosen.address, chosen.family)) as any,
      })
      const id = randomUUID()
      let socket: Socket | WebSocket
      if (kind === 'socket.io') {
        const auth = input.auth ?? {}
        if (Buffer.byteLength(JSON.stringify(auth)) > 16384) {
          agent.destroy()
          throw new Error('Socket auth is too large')
        }
        socket = io(url.href, {
          path,
          auth,
          autoConnect: false,
          forceNew: true,
          transports: ['websocket'],
          upgrade: false,
          reconnection: input.reconnection !== false,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          timeout: 10000,
          transportOptions: { websocket: { agent, followRedirects: false, maxPayload: 65536 } },
        })
        socket.on('connect', () => this.push(id, 'connect', null))
        socket.on('disconnect', (reason) => this.push(id, 'disconnect', reason))
        socket.on('connect_error', () => this.push(id, 'error', 'Socket.IO connection failed'))
        socket.onAny((event, ...args) => this.push(id, String(event), args))
      } else {
        socket = new WebSocket(url.href, {
          agent,
          followRedirects: false,
          handshakeTimeout: 10000,
          maxPayload: 65536,
        })
        socket.on('open', () => this.push(id, 'connect', null))
        socket.on('close', (code) => {
          this.push(id, 'disconnect', { code })
          this.release(id)
        })
        socket.on('error', () => this.push(id, 'error', 'WebSocket connection failed'))
        socket.on('message', (data, binary) => {
          if (binary) {
            this.push(id, 'error', 'Binary frames are not supported by this JSON channel')
            return
          }
          this.push(id, 'message', data.toString())
        })
      }
      this.connections.set(id, {
        key: String(input.permissionKey),
        kind,
        socket,
        agent,
        lastSend: Date.now(),
        sends: 0,
      })
      if (generation !== this.generation) {
        this.disconnect(id)
        throw new Error('Plugin was stopped while connecting')
      }
      if (kind === 'socket.io') (socket as Socket).connect()
      return { id }
    } finally {
      this.connecting--
    }
  }

  private push(id: string, event: string, data: unknown): void {
    if (!this.connections.has(id)) return
    let text: string
    try {
      text = JSON.stringify(data ?? null)
    } catch {
      this.disconnect(id)
      return
    }
    if (Buffer.byteLength(text) > 65536 || this.events.length >= 256) {
      this.disconnect(id)
      return
    }
    this.events.push({ id, event, data: JSON.parse(text) })
  }
  send(id: string, event: string, data: unknown): void {
    const entry = this.connections.get(id)
    if (!entry) throw new Error('Socket is closed')
    const text = JSON.stringify(data ?? null)
    if (Buffer.byteLength(text) > 65536) throw new Error('Socket message is too large')
    if (Date.now() - entry.lastSend >= 1000) {
      entry.lastSend = Date.now()
      entry.sends = 0
    }
    if (++entry.sends > 100) throw new Error('Socket send rate exceeded')
    if (entry.kind === 'socket.io') {
      if (typeof event !== 'string' || event.length > 128 || reservedEvents.has(event))
        throw new Error('Invalid Socket.IO event')
      const socket = entry.socket as Socket
      if (!socket.connected) throw new Error('Socket is not connected')
      socket.emit(event, data)
    } else {
      const socket = entry.socket as WebSocket
      if (socket.readyState !== WebSocket.OPEN) throw new Error('Socket is not connected')
      socket.send(typeof data === 'string' ? data : text)
    }
  }
  private release(id: string): void {
    const entry = this.connections.get(id)
    this.connections.delete(id)
    entry?.agent.destroy()
  }
  disconnect(id: string): void {
    const entry = this.connections.get(id)
    if (!entry) return
    this.connections.delete(id)
    if (entry.kind === 'socket.io') (entry.socket as Socket).disconnect()
    else (entry.socket as WebSocket).terminate()
    entry.agent.destroy()
    this.events = this.events.filter((event) => event.id !== id)
  }
  revoke(key: string): void {
    for (const [id, entry] of this.connections) if (entry.key === key) this.disconnect(id)
  }
  closeAll(): void {
    this.generation++
    for (const id of this.connections.keys()) this.disconnect(id)
    this.events = []
  }
  drain(): SocketEvent[] {
    const events = this.events
    this.events = []
    return events
  }
}
