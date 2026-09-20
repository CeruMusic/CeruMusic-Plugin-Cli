import type { JsonValue, PluginManifest, SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk'
import { assertNativeView } from '@shiqianjiang/ceru-plugin-sdk'

/** Shared by preview and production hosts; no platform or login-specific behavior. */
export class SurfaceSession {
  private closed = false
  private opened = false
  private opening?: Promise<unknown>
  private closing?: Promise<void>
  private pending = new Set<AbortController>()
  private actions: Set<string>

  constructor(
    readonly surface: SurfaceDeclaration,
    manifest: PluginManifest,
    private readonly dispatch: (
      action: string,
      input: JsonValue,
      signal?: AbortSignal,
    ) => Promise<unknown>,
  ) {
    this.actions = new Set(manifest.contributes?.commands?.map((command) => command.action))
    if (surface.kind === 'native' && !this.actions.has(surface.entry))
      throw new Error('Missing native render action: ' + surface.entry)
    for (const action of Object.values(surface.lifecycle ?? {}))
      if (!this.actions.has(action)) throw new Error('Unknown surface lifecycle action: ' + action)
  }

  /** Call when the view is mounted, once even if the transport repeats its ready message. */
  open(): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Surface is closed'))
    if (!this.opened) {
      this.opened = true
      this.opening = this.surface.lifecycle?.openAction
        ? this.invoke(this.surface.lifecycle.openAction, {})
        : Promise.resolve()
    }
    return this.opening!
  }

  async invoke(action: string, input: JsonValue = {}): Promise<unknown> {
    if (this.closed) throw new Error('Surface is closed')
    if (!this.actions.has(action)) throw new Error('Undeclared surface action: ' + action)
    if (this.pending.size >= 32 || JSON.stringify(input).length > 128 * 1024)
      throw new Error('Surface request exceeds limit')
    const controller = new AbortController()
    this.pending.add(controller)
    try {
      const result = await this.dispatch(action, input, controller.signal)
      if (this.closed) throw new Error('Surface is closed')
      if (this.surface.kind === 'native' && action === this.surface.entry)
        assertNativeView(result, this.actions)
      return result
    } finally {
      this.pending.delete(controller)
    }
  }

  /** Invalidate first, cancel in-flight calls, then let the plugin stop its background work. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    for (const controller of this.pending) controller.abort()
    this.pending.clear()
    const action = this.surface.lifecycle?.closeAction
    this.closing = Promise.resolve().then(async () => {
      if (action) await this.dispatch(action, {})
    })
    return this.closing
  }
}
