import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult,
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

export type RegistrationContext = Pick<
  PluginContext,
  | 'plugin'
  | 'config'
  | 'providers'
  | 'actions'
  | 'playlistImporters'
  | 'lyricConverters'
  | 'effects'
>
export interface CoreHostAdapter {
  activate(artifact: Artifact, context: RegistrationContext): Promise<void | (() => unknown)>
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
    !/^(tracks\.(search|resolve|lyrics|artwork|artworkHires|suggest|hotSearch)|playlists\.(search|categories|list|get)|charts\.(list|getTracks)|sharing\.describe)$/.test(
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
  group: 'providers' | 'actions' | 'importers',
  id: string,
) {
  const values = manifest.provides?.[group] ?? []
  return values.find((item) => item.id === id)
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
 * Host-neutral v3 Core. The Core owns protocol dispatch and validation; a Host
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

  context(): RegistrationContext {
    return {
      plugin: { id: this.manifest.id, version: this.manifest.version, manifest: this.manifest },
      config: { get: async <T = JsonObject>() => this.config as Readonly<T> },
      providers: {
        register: (id: string, implementation: ProviderImplementation) =>
          this.registerProvider(id, implementation),
      },
      actions: {
        register: (id, handler) => this.registerAction(id, handler),
      },
      playlistImporters: {
        register: (id: string, implementation: ImporterRegistration['implementation']) =>
          this.registerImporter(id, implementation),
      },
      lyricConverters: {
        register: (id: string, implementation: LyricConverter) => {
          if (!this.manifest.provides?.lyricConverters?.some((item) => item.id === id))
            throw new Error('Undeclared lyric converter')
          this.converters.set(id, implementation)
          return () => {
            this.converters.delete(id)
          }
        },
      },
      effects: {
        add: (dispose: () => unknown) => {
          this.disposers.push(dispose)
        },
      },
    }
  }

  private registerProvider(id: string, implementation: ProviderImplementation): () => void {
    if (!declaration(this.manifest, 'providers', id))
      throw new Error(`Provider ${id} is not declared in manifest`)
    if (!this.providers.has(id) && this.providers.size >= this.options.maxProviders)
      throw new Error('Provider limit exceeded')
    this.providers.set(id, implementation)
    return () => this.providers.delete(id)
  }

  private registerAction<TInput extends JsonValue>(
    id: string,
    handler: (
      input: TInput,
      operation: OperationContext,
    ) => ReturnType<ActionRegistration['handler']>,
  ): () => void {
    if (!declaration(this.manifest, 'actions', id))
      throw new Error(`Action ${id} is not declared in manifest`)
    if (!this.actions.has(id) && this.actions.size >= this.options.maxActions)
      throw new Error('Action limit exceeded')
    this.actions.set(id, (input, operation) => handler(input as TInput, operation))
    return () => this.actions.delete(id)
  }

  private registerImporter(
    id: string,
    implementation: ImporterRegistration['implementation'],
  ): () => void {
    if (!declaration(this.manifest, 'importers', id))
      throw new Error(`Playlist importer ${id} is not declared in manifest`)
    if (!this.importers.has(id) && this.importers.size >= this.options.maxImporters)
      throw new Error('Importer limit exceeded')
    this.importers.set(id, implementation)
    return () => this.importers.delete(id)
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
      // 高清封面协议（可选）：resource + request（+ operation 由 invokeProvider 追加）
      'tracks.artworkHires': 2,
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
    if (method === 'tracks.resolve') assertResolveResult(result)
    else if (method === 'tracks.lyrics') assertLyricsDocument(result)
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
