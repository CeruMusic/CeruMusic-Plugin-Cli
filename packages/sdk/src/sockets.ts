import type { Disposable, JsonValue } from './manifest.js'
import type { OperationContext } from './index.js'

export interface SocketConnectOptions {
  /** Defaults to network.socket. */
  permissionKey?: string
  operation: OperationContext
  /** wss:// for native WebSocket; https:// for Socket.IO. */
  url: string
  kind: 'websocket' | 'socket.io'
  path?: string
  auth?: Record<string, JsonValue>
  /** Socket.IO reconnects at most five times. Native WebSocket does not auto-reconnect. */
  reconnection?: boolean
}
export interface HostSocket {
  readonly id: string
  /** Incoming Socket.IO payloads are arrays of event arguments. WebSocket messages are text. */
  on<T extends JsonValue = JsonValue>(event: string, handler: (data: T) => void): Disposable
  emit(event: string, data: JsonValue): Promise<void>
  send(data: JsonValue): Promise<void>
  disconnect(): Promise<void>
}
export interface SocketAPI {
  connect(options: SocketConnectOptions): Promise<HostSocket>
}
