import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTRACT } from '../contract.js'
import { extractNative } from './native.js'
import { TrustedChannel } from './protocol.js'
import type { TrustedRuntimeOptions, TrustedServerRegistration, TrustedProcessTransport } from './types.js'
export { defineServer } from './types.js'
export type { TrustedConsent, TrustedVerification, TrustedRuntimeOptions, TrustedServerContext, TrustedServerEntry, TrustedServerHandle, TrustedServerRegistration, TrustedProcessTransport, TrustedProcessLaunch } from './types.js'

function launchNode(options: TrustedRuntimeOptions, args: string[], directory: string, token: string): TrustedProcessTransport {
  const child = spawn(options.executable, args, {
    cwd: directory, windowsHide: true,
    env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      ELECTRON_RUN_AS_NODE: '1', CERU_TRUSTED_TOKEN: token },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  return {
    get pid() { return child.pid },
    send: (message, done) => { child.send(message, done) },
    kill: () => { child.kill('SIGKILL') },
    onMessage: listener => { child.on('message', listener) },
    onExit: listener => { child.once('exit', listener) },
    onError: listener => { child.once('error', listener) },
    onDisconnect: listener => { child.once('disconnect', listener) },
    onStderr: listener => { child.stderr?.on('data', listener) },
  }
}

/** Raw Node execution, NOT a security sandbox. The host owns signature checks,
 * consent UI/persistence, normal RPC dispatch, and revocation of that consent.
 * The CLI's Node transport limits accidental access (native addons can bypass
 * it). Electron's utility transport is unrestricted and needs separate consent. */
export class TrustedPluginRuntime {
  private controller = new AbortController()
  private child?: TrustedProcessTransport
  private channel?: TrustedChannel
  private directory?: string
  private startTask?: Promise<void>
  private stopTask?: Promise<void>
  private exitTask?: Promise<void>
  private cleanupServer?: () => void
  private serverApproval?: { host: '127.0.0.1' | '0.0.0.0'; port: number }
  private registering = false
  private active = false
  private failure?: Error
  private stderr = ''
  private notified = false
  private readonly revoke = () => { void this.stop() }
  constructor(private options: TrustedRuntimeOptions) {}
  get running() { return this.active && !this.controller.signal.aborted }
  get pid() { return this.child?.pid }
  start(): Promise<void> {
    if (this.startTask || this.controller.signal.aborted) return Promise.reject(Error('Trusted runtime can only start once'))
    // Bind this activation to a stable copy of the host-verified input, even if
    // the caller later updates its installed-plugin record in place.
    this.options = { ...this.options, artifact: structuredClone(this.options.artifact),
      verification: { ...this.options.verification, nodeApiModules: [...this.options.verification.nodeApiModules] },
      consent: { ...this.options.consent } }
    this.startTask = this.startInternal()
    return this.startTask
  }
  private assertAllowed() {
    this.controller.signal.throwIfAborted()
    this.options.signal?.throwIfAborted()
    const { artifact, verification, consent } = this.options
    const manifest = artifact.header.manifest
    if (manifest.manifestVersion !== 3 || manifest.entry.server?.runtime !== 'node')
      throw Error('Trusted runtime requires entry.server.runtime node')
    const declarations = manifest.uses?.permissions?.filter(item => item.name === 'runtime.trusted') ?? []
    if (declarations.length !== 1 || declarations[0].reason.trim().length < 10)
      throw Error('Trusted runtime requires a reasoned runtime.trusted declaration')
    const development = this.options.development === true && consent?.development === true
    const signed = verification?.signatureVerified === true && !!artifact.header.signature &&
      ['verified-trusted', 'verified-untrusted'].includes(artifact.signatureStatus)
    if (!verification?.publisher || verification.codeDigest !== artifact.codeDigest ||
        (!signed && !(development && artifact.signatureStatus === 'unsigned' && artifact.header.signature === null)))
      throw Error('Host must provide a verified signed artifact')
    if (!!this.options.development !== !!consent?.development)
      throw Error('Development mode requires matching explicit development consent')
    if (consent?.granted !== true || consent.pluginId !== manifest.id ||
        consent.publisher !== verification.publisher || !consent.signal || consent.signal.aborted)
      throw Error('Explicit matching trusted-runtime consent is required')
    if (this.options.launchUtilityProcess && consent.fileAccess !== 'unrestricted')
      throw Error('Utility process requires explicit unrestricted file-access consent')
    if (!Object.hasOwn(artifact.modules, manifest.entry.server.module)) throw Error('Missing trusted server module')
  }
  private async startInternal() {
    const timeoutMs = this.options.startupTimeoutMs ?? 30_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
      throw Error('Invalid trusted startup timeout')
    const timer = setTimeout(() => this.fail(Error('Trusted runtime activation timed out')), timeoutMs)
    try {
      this.assertAllowed()
      this.options.consent.signal.addEventListener('abort', this.revoke, { once: true })
      this.options.signal?.addEventListener('abort', this.revoke, { once: true })
      const { artifact } = this.options
      const dataDirectory = await realpath(this.options.dataDir)
      const runtimeDirectory = await realpath(this.options.nativeDir)
      this.controller.signal.throwIfAborted()
      this.directory = await mkdtemp(join(runtimeDirectory, 'ceru-trusted-'))
      const nativeDirectory = join(this.directory, 'native')
      await mkdir(nativeDirectory)
      const native = await extractNative(artifact, nativeDirectory, this.options.verification.nodeApiModules)
      const entryPath = join(this.directory, 'server.cjs')
      await writeFile(entryPath, 'module.exports = (' + artifact.modules[artifact.header.manifest.entry.server!.module] + ');\n', { flag: 'wx', mode: 0o600 })
      // The host (Electron's ASAR-aware fs) reads this bundled asset. The raw
      // Node child needs no ASAR loader or imports outside its scoped folders.
      const runner = join(this.directory, 'runner.cjs')
      await writeFile(runner, await readFile(new URL('../../assets/trusted-runner.cjs', import.meta.url)), { flag: 'wx', mode: 0o600 })
      const reads = [this.directory, dataDirectory]
      const writes = [dataDirectory, nativeDirectory]
      if ([...reads, ...writes].some(path => /[*?,\r\n]/.test(path))) throw Error('Unsafe permission path')
      const args = ['--permission', ...reads.map(path => '--allow-fs-read=' + path),
        ...writes.map(path => '--allow-fs-write=' + path), ...(native.length ? ['--allow-addons'] : []), runner]
      const token = randomBytes(32).toString('hex')
      this.controller.signal.throwIfAborted()
      const child = this.options.launchUtilityProcess
        ? this.options.launchUtilityProcess({ runner, directory: this.directory, token })
        : launchNode(this.options, args, this.directory, token)
      this.child = child
      this.exitTask = new Promise(done => {
        child.onExit((code, signal) => {
          done()
          if (!this.controller.signal.aborted) this.fail(Error(`Trusted process exited (${signal ?? code}): ${this.stderr}`))
        })
        child.onError(error => { done(); this.fail(error) })
      })
      child.onStderr(chunk => { this.stderr = (this.stderr + String(chunk)).slice(-16_384) })
      const channel = new TrustedChannel(token,
        (message, done) => { child.send(message, done) },
        (name, data) => this.request(name, data),
        (name, data) => {
          if (name === 'failed') this.fail(Error(String(data?.message ?? 'Trusted runner failed')))
          else if (name === 'log') { /* Logs are opt-in through onLog; never treat them as host instructions. */ this.options.onLog?.(data) }
          else throw Error('Unknown trusted runtime event')
        }, error => this.fail(error),
      )
      this.channel = channel
      child.onMessage(value => channel.receive(value))
      child.onDisconnect(() => { if (!this.controller.signal.aborted) this.fail(Error('Trusted IPC disconnected: ' + this.stderr)) })
      await channel.call('boot', { manifest: artifact.header.manifest, platform: process.platform + '-' + process.arch,
        native, entryPath, dataDirectory, nativeDirectory,
        securityMode: this.options.launchUtilityProcess ? 'utility-unrestricted' : 'node-permission' })
      this.controller.signal.throwIfAborted()
      this.active = true
    } catch (error) {
      this.fail(error instanceof Error ? error : Error(String(error)))
      await this.exitTask
      await this.cleanup()
      throw this.failure ?? error
    } finally { clearTimeout(timer) }
  }
  private fail(error: Error) {
    this.failure ??= error
    this.controller.abort(error)
    this.active = false
    this.channel?.close(error)
    // Revocation cannot run plugin signal handlers or wait for cooperation.
    this.child?.kill()
    this.releaseServer()
    // Do not await startTask from its own rejection path.
    if (this.startTask) void this.startTask.catch(() => {}).then(() => this.stop()).catch(() => {})
  }
  private releaseServer() {
    const dispose = this.cleanupServer
    this.cleanupServer = undefined
    this.serverApproval = undefined
    if (dispose) { try { dispose() } catch (error) { this.failure ??= error instanceof Error ? error : Error(String(error)) } }
  }
  private async request(name: string, data: any) {
    const signal = this.controller.signal
    signal.throwIfAborted()
    const manifest = this.options.artifact.header.manifest
    if (name === 'server.authorize') {
      if (this.serverApproval || this.registering || this.cleanupServer) throw Error('Only one trusted server is allowed')
      const declaration = manifest.entry.server!
      const port = data?.port ?? declaration.port ?? 0
      const lan = data?.lan ?? declaration.lan ?? false
      if (!Number.isInteger(port) || port < 0 || port > 65535 || typeof lan !== 'boolean' || (lan && !declaration.lan))
        throw Error('Invalid or undeclared server options')
      this.registering = true
      try {
        for (const [permission, key] of [['network.serve', data?.permissionKey], ...(lan ? [['network.serve.lan', data?.lanPermissionKey]] : [])]) {
          const item = manifest.uses?.permissions?.find(item => item.name === permission && (!key || item.key === key))
          if (!item) throw Error('Missing declared server permission: ' + permission)
          await this.options.authorize(item.key, item.name, signal)
          signal.throwIfAborted()
        }
        return this.serverApproval = { host: lan ? '0.0.0.0' : '127.0.0.1', port }
      } finally { this.registering = false }
    }
    if (name === 'server.register') {
      if (!this.serverApproval || this.cleanupServer || this.registering || data?.host !== this.serverApproval.host ||
          !Number.isInteger(data?.port) || data.port < 1 || data.port > 65535 || data.url !== 'http://127.0.0.1:' + data.port)
        throw Error('Invalid trusted server registration')
      this.registering = true
      try {
        const registration: TrustedServerRegistration = { pluginId: manifest.id, host: data.host, port: data.port, url: data.url }
        const dispose = await this.options.onListen(registration, signal)
        if (typeof dispose !== 'function') throw Error('Server registration must return a disposer')
        if (signal.aborted) { dispose(); signal.throwIfAborted() }
        this.cleanupServer = dispose
        return null
      } finally { this.registering = false }
    }
    if (name === 'server.closed') { this.releaseServer(); return null }
    if (!Object.hasOwn(CONTRACT, name) || name === 'server.start' || name === 'server.stop')
      throw Error('Unsupported trusted RPC method: ' + name)
    // Trusted consent must never be obtained through the plugin's RPC API.
    if (name === 'permissions.request' || name === 'permissions.requestGroup') {
      const keys = manifest.uses?.permissions?.filter(item => item.name === 'runtime.trusted').map(item => item.key) ?? []
      if (name === 'permissions.requestGroup' && (data?.group === 'trustedRuntime' || data?.keys?.some((key: string) => keys.includes(key))))
        return { group: data.group, status: 'denied', grants: [] }
      if (name === 'permissions.request' && [data?.key, data?.permissionKey, data?.name, data?.args?.[0]].some(key => keys.includes(key) || key === 'runtime.trusted'))
        return { status: 'denied' }
    }
    const result = await this.options.rpc(name, data, signal)
    signal.throwIfAborted()
    return result
  }
  invoke(target: string, args: unknown[] = []): Promise<any> {
    if (!this.running) return Promise.reject(Error('Trusted runtime is not active'))
    return this.channel!.call('invoke', { target, args })
  }
  async emit(name: string, data: unknown): Promise<void> {
    if (!this.running) throw Error('Trusted runtime is not active')
    await this.channel!.notify('event', { name, data })
  }
  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask
    this.controller.abort(this.failure ?? Error('Trusted runtime stopped'))
    this.active = false
    this.channel?.close(this.failure)
    this.child?.kill()
    this.releaseServer()
    this.stopTask = (async () => {
      await this.startTask?.catch(() => {})
      await this.exitTask
      await this.cleanup()
    })()
    return this.stopTask
  }
  private async cleanup() {
    this.options.consent?.signal?.removeEventListener('abort', this.revoke)
    this.options.signal?.removeEventListener('abort', this.revoke)
    const directory = this.directory
    this.directory = undefined
    // On Windows the utility exit event can precede release of a loaded .node
    // DLL and the process working directory. Retry transient sharing violations.
    if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 })
    if (!this.notified) { this.notified = true; this.options.onExit?.(this.failure) }
  }
}
