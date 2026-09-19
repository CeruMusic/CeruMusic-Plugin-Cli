import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult,
  createHttpClient,
  type ContentEntity,
  type JsonObject,
  type JsonValue,
  type LyricsDocument,
  type OperationContext,
  type PluginContext,
  type PluginManifest,
  type ProviderImplementation,
  type ResourceRef,
  type ResolveResult,
  type LyricConverter,
  type LyricParseRequest,
  type LyricExportRequest,
} from '@shiqianjiang/ceru-plugin-sdk'
import {
  readArtifact,
  type Artifact,
  type ArtifactHeader,
  resolveArtifactConfig,
} from '@shiqianjiang/ceru-plugin-issuer'

export interface CoreHostAdapter {
  /** Real Host capabilities; absent services reject instead of pretending success. */
  services?: Partial<PluginContext>
  /** Execute the bundled logic entry in the Host sandbox. */
  activate(artifact: Artifact, context: PluginContext): Promise<void | (() => unknown)>
  /** Host-owned network broker. Playback URLs are returned directly. */
  request?(request: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    timeoutMs?: number
    operation: OperationContext
  }): Promise<{ status: number; headers: Record<string, string>; body: JsonValue }>
  onNotice?(notice: { type: string; data: JsonValue }): void
}

export interface CoreOptions {
  host: CoreHostAdapter
  /** Optional trusted artifact verification is performed by the issuer before Core loads it. */
  maxProviders?: number
  maxActions?: number
  maxImporters?: number
}

export interface ProviderRegistration {
  id: string
  implementation: ProviderImplementation
}

export interface ActionRegistration {
  id: string
  handler: (
    input: JsonValue,
    operation: OperationContext,
  ) => Promise<JsonValue | void> | JsonValue | void
}

export interface ImporterRegistration {
  id: string
  implementation: {
    getTracks(
      request: { value: string; cursor?: string; limit: number },
      operation: OperationContext,
    ): Promise<{
      items: ContentEntity[]
      nextCursor?: string
      totalEstimate?: number
      name?: string
    }>
  }
}

export interface CoreSnapshot {
  manifest: PluginManifest
  config: JsonObject
  providers: string[]
  actions: string[]
  importers: string[]
  lyricConverters: string[]
}

function methodAt(value: any, path: string): ((...args: any[]) => any) | undefined {
  if (
    !/^(tracks\.(search|resolve|lyrics|artwork|suggest|hotSearch)|playlists\.(search|categories|list|get)|charts\.(list|getTracks)|sharing\.describe)$/.test(
      path,
    )
  )
    throw new Error('Unsupported provider method: ' + path)
  const parts = path.split('.')
  const owner = parts.slice(0, -1).reduce((current, key) => current?.[key], value)
  const method = owner?.[parts.at(-1)!]
  return typeof method === 'function' ? method.bind(owner) : undefined
}

function declaration(
  manifest: PluginManifest,
  group: 'providers' | 'commands' | 'playlistImporters',
  id: string,
) {
  const values = manifest.contributes?.[group] ?? []
  return values.find((item: any) => (group === 'commands' ? item.action === id : item.id === id))
}

function operationOrDefault(operation?: OperationContext): OperationContext {
  if (operation) return operation
  const controller = new AbortController()
  return {
    id: `core-${Date.now()}`,
    deadlineAt: Date.now() + 30_000,
    signal: controller.signal,
  }
}

/**
 * Host-neutral v2 Core. The Core owns protocol dispatch and validation; a Host
 * owns sandbox execution and application services.
 */
export class PluginCore {
  readonly artifact: Artifact
  readonly manifest: PluginManifest
  readonly config: Readonly<JsonObject>
  private readonly options: Required<
    Pick<CoreOptions, 'maxProviders' | 'maxActions' | 'maxImporters'>
  > &
    Pick<CoreOptions, 'host'>
  private readonly providers = new Map<string, ProviderImplementation>()
  private readonly actions = new Map<string, ActionRegistration['handler']>()
  private readonly importers = new Map<string, ImporterRegistration['implementation']>()
  private disposers: (() => unknown)[] = []
  private converters = new Map<string, LyricConverter>()

  private constructor(artifact: Artifact, options: CoreOptions) {
    this.artifact = artifact
    this.manifest = artifact.header.manifest
    this.config = resolveArtifactConfig(artifact.header)
    this.options = {
      host: options.host,
      maxProviders: options.maxProviders ?? 128,
      maxActions: options.maxActions ?? 256,
      maxImporters: options.maxImporters ?? 128,
    }
  }

  static async load(
    input: Uint8Array | ArrayBuffer | string,
    options: CoreOptions,
  ): Promise<PluginCore> {
    const bytes =
      typeof input === 'string'
        ? new TextEncoder().encode(input)
        : input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : input
    const artifact = readArtifact(bytes)
    const core = new PluginCore(artifact, options)
    try {
      const dispose = await options.host.activate(artifact, core.context())
      if (typeof dispose === 'function') core.disposers.push(dispose)
    } catch (error) {
      await core.dispose()
      throw error
    }
    return core
  }

  context(): PluginContext {
    const context: any = {
      plugin: { id: this.manifest.id, version: this.manifest.version, manifest: this.manifest },
      host: {
        apiVersion: '2.0.0',
        libraries: { lodash: 'host', icons: 'host', assets: 'host' },
        mode: 'production',
      },
      modules: {
        require: (name: string) => {
          throw new Error(`Host module ${name} must be supplied by the Host`)
        },
      },
      utils: { lodash: {} },
      icons: {
        list: () => [],
        url: async () => {
          throw new Error('Icon service is not connected')
        },
      },
      assets: {
        list: () => [],
        url: async () => {
          throw new Error('Asset service is not connected')
        },
      },
      config: { get: async <T = JsonObject>() => this.config as Readonly<T> },
      providers: {
        register: (id: string, implementation: ProviderImplementation) =>
          this.registerProvider(id, implementation),
      },
      actions: {
        register: (id: string, handler: ActionRegistration['handler']) =>
          this.registerAction(id, handler),
      },
      playlistImporters: {
        register: (id: string, implementation: ImporterRegistration['implementation']) =>
          this.registerImporter(id, implementation),
      },
      lyricConverters: {
        register: (id: string, implementation: LyricConverter) => {
          if (!this.manifest.contributes?.lyricConverters?.some((item) => item.id === id))
            throw new Error('Undeclared lyric converter')
          this.converters.set(id, implementation)
          return () => this.converters.delete(id)
        },
      },
      effects: {
        add: (dispose: () => unknown) => {
          this.disposers.push(dispose)
        },
      },
      http: {
        request: (request: any) => this.request(request),
        create: (defaults: any = {}) => ({
          request: (url: string, input: any = {}) =>
            this.request({ ...input, ...defaults, url: new URL(url, defaults.baseURL).href }),
        }),
      },
      permissions: {
        getGranted: async () => [],
        query: async () => ({ status: 'prompt' }),
        request: async () => ({ status: 'prompt' }),
        requestGroup: async () => ({ status: 'prompt', grants: [] }),
      },
      playback: { failure: (error: any): ResolveResult => ({ ok: false, error }) },
      ui: {
        toast: async (message: any) =>
          this.options.host.onNotice?.({ type: 'toast', data: message }),
        notify: async (message: any) =>
          this.options.host.onNotice?.({ type: 'notify', data: message }),
      },
      log: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    }
    const services = this.options.host.services ?? {}
    for (const [key, value] of Object.entries(services)) {
      if (
        [
          'plugin',
          'providers',
          'actions',
          'playlistImporters',
          'lyricConverters',
          'effects',
        ].includes(key)
      )
        throw new Error('Host cannot override Core registry: ' + key)
      context[key] = value
    }
    for (const name of [
      'library',
      'account',
      'player',
      'queue',
      'downloads',
      'files',
      'clipboard',
      'settings',
      'window',
      'sharing',
      'rooms',
      'ai',
      'tasks',
      'sockets',
      'events',
      'guests',
      'storage',
    ]) {
      if (!context[name])
        context[name] = new Proxy(
          {},
          {
            get: () => {
              throw new Error('Host service is not connected: ' + name)
            },
          },
        )
    }
    if (!services.http) context.http.create = (defaults: any) => createHttpClient(context, defaults)
    return context as PluginContext
  }

  private registerProvider(id: string, implementation: ProviderImplementation): () => void {
    if (!declaration(this.manifest, 'providers', id))
      throw new Error(`Provider ${id} is not declared in manifest`)
    if (!this.providers.has(id) && this.providers.size >= this.options.maxProviders)
      throw new Error('Provider limit exceeded')
    this.providers.set(id, implementation)
    return () => this.providers.delete(id)
  }

  private registerAction(id: string, handler: ActionRegistration['handler']): () => void {
    if (!declaration(this.manifest, 'commands', id))
      throw new Error(`Action ${id} is not declared in manifest`)
    if (!this.actions.has(id) && this.actions.size >= this.options.maxActions)
      throw new Error('Action limit exceeded')
    this.actions.set(id, handler)
    return () => this.actions.delete(id)
  }

  private registerImporter(
    id: string,
    implementation: ImporterRegistration['implementation'],
  ): () => void {
    if (!declaration(this.manifest, 'playlistImporters', id))
      throw new Error(`Playlist importer ${id} is not declared in manifest`)
    if (!this.importers.has(id) && this.importers.size >= this.options.maxImporters)
      throw new Error('Importer limit exceeded')
    this.importers.set(id, implementation)
    return () => this.importers.delete(id)
  }

  private async request(input: any): Promise<any> {
    if (!this.options.host.request) throw new Error('Host HTTP service is not connected')
    const declaration = this.manifest.permissions?.find(
      (item) => item.key === input.permissionKey && item.name === 'network.request',
    )
    if (!declaration) throw new Error('Network permission is not declared')
    const permissions = this.options.host.services?.permissions
    if (!permissions || (await permissions.query({ key: declaration.key })).status !== 'granted')
      throw new Error('Network permission is not granted')
    return this.options.host.request({ ...input, operation: operationOrDefault(input.operation) })
  }

  async invokeProvider(
    providerId: string,
    method: string,
    args: any[] = [],
    operation?: OperationContext,
  ): Promise<any> {
    const arities: Record<string, number> = {
      'tracks.search': 1,
      'tracks.resolve': 2,
      'tracks.lyrics': 1,
      'tracks.artwork': 1,
      'tracks.suggest': 1,
      'tracks.hotSearch': 0,
      'playlists.search': 1,
      'playlists.categories': 0,
      'playlists.list': 2,
      'playlists.get': 2,
      'charts.list': 0,
      'charts.getTracks': 2,
      'sharing.describe': 2,
    }
    const arity = arities[method]
    if (arity === undefined || !Array.isArray(args) || args.length > arity)
      throw new Error(`Invalid ${method} arguments: expected ${arity ?? 'a supported method'}`)
    const input = [...args]
    while (input.length < arity) input.push(undefined)
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider ${providerId} is not registered`)
    const fn = methodAt(provider, method)
    if (!fn) throw new Error(`Provider ${providerId} does not implement ${method}`)
    const op = operationOrDefault(operation)
    op.signal.throwIfAborted()
    const result = await fn(...input, op)
    op.signal.throwIfAborted()
    if (method === 'tracks.resolve' || method === 'resolve') assertResolveResult(result)
    else if (method === 'tracks.lyrics' || method === 'lyrics') assertLyricsDocument(result)
    else if (
      [
        'tracks.search',
        'playlists.search',
        'playlists.categories',
        'playlists.list',
        'playlists.get',
        'charts.list',
        'charts.getTracks',
      ].includes(method)
    )
      assertContentPage(result)
    return result
  }

  async invokeAction(
    id: string,
    input: JsonValue = {},
    operation?: OperationContext,
  ): Promise<JsonValue | void> {
    const handler = this.actions.get(id)
    if (!handler) throw new Error(`Action ${id} is not registered`)
    const result = await handler(input, operationOrDefault(operation))
    return result === undefined ? undefined : (JSON.parse(JSON.stringify(result)) as JsonValue)
  }

  async importPlaylist(
    id: string,
    value: string,
    cursor?: string,
    limit = 100,
    operation?: OperationContext,
  ): Promise<any> {
    const importer = this.importers.get(id)
    if (!importer) throw new Error(`Playlist importer ${id} is not registered`)
    const result = await importer.getTracks({ value, cursor, limit }, operationOrDefault(operation))
    assertContentPage(result)
    if (result.items.some((item) => item.ref.kind !== 'track'))
      throw new Error('Importers must return tracks')
    return result
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(
      this.disposers
        .splice(0)
        .reverse()
        .map((dispose) => Promise.resolve().then(dispose)),
    )
    this.providers.clear()
    this.actions.clear()
    this.importers.clear()
    this.converters.clear()
  }

  async convertLyrics(
    id: string,
    method: 'parse' | 'export',
    request: LyricParseRequest | LyricExportRequest,
    operation?: OperationContext,
  ): Promise<any> {
    const converter = this.converters.get(id)
    if (!converter || !['parse', 'export'].includes(method))
      throw new Error('Lyric converter unavailable')
    if (method === 'export') assertLyricsDocument((request as LyricExportRequest).document)
    else if (
      typeof (request as LyricParseRequest).text !== 'string' ||
      (request as LyricParseRequest).text.length > 2 * 1024 * 1024
    )
      throw new Error('Invalid lyric input')
    const result = await (converter[method] as Function)(request, operationOrDefault(operation))
    if (method === 'parse') assertLyricsDocument(result)
    else if (
      !result ||
      !['lrc', 'enhanced-lrc', 'yrc'].includes(result.format) ||
      result.format !== (request as LyricExportRequest).format ||
      typeof result.text !== 'string' ||
      result.text.length > 2 * 1024 * 1024 ||
      result.extension !== (result.format === 'enhanced-lrc' ? 'lrc' : result.format)
    )
      throw new Error('Invalid exported lyric text')
    return result
  }

  snapshot(): CoreSnapshot {
    return {
      manifest: this.manifest,
      config: this.config,
      providers: [...this.providers.keys()],
      actions: [...this.actions.keys()],
      importers: [...this.importers.keys()],
      lyricConverters: [...this.converters.keys()],
    }
  }
}

export function readPluginArtifact(input: Uint8Array | ArrayBuffer | string): {
  header: ArtifactHeader
  artifact: Artifact
} {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input
  const artifact = readArtifact(bytes)
  return { header: artifact.header, artifact }
}
