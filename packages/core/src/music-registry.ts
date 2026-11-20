import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult,
  assertResourceRef,
  assertSearchRequest,
  type ContentEntity,
  type CrLyric,
  type Disposable,
  type ImporterDeclaration,
  type MusicSource,
  type OperationContext,
  type Page,
  type ProviderDeclaration,
  type ResourceRef,
  type ResolveResult,
} from '@shiqianjiang/ceru-plugin-sdk'

type ProviderInvoker = (method: string, args: any[], operation: OperationContext) => Promise<any>
type Source = {
  pluginId: string
  ownerId?: string
  providerId: string
  runtime: MusicSource['runtime']
  declaration: ProviderDeclaration
  methods: readonly string[]
  icon?: string
}
type Importer = {
  pluginId: string
  ownerId?: string
  runtime: 2 | 3
  declaration: ImporterDeclaration
}
type Entry = Source & { invoke: ProviderInvoker }
type ImportEntry = Importer & { invoke: ProviderInvoker }
type Selection = (
  source: string,
  method: string | undefined,
  owners: readonly string[],
) => readonly string[]

function cleanRef(ref: ResourceRef, pluginId = ref.pluginId): ResourceRef {
  return {
    id: ref.id,
    providerId: ref.providerId,
    kind: ref.kind,
    ...(pluginId ? { pluginId } : {}),
    ...(ref.scope ? { scope: ref.scope } : {}),
  }
}
function publicPage(
  result: Page<ContentEntity> & { name?: string; playlist?: ContentEntity['playlist'] },
  caller: string,
  producer: string,
) {
  assertContentPage(result)
  if (caller === producer) return structuredClone(result)
  const items = result.items
    .filter((item) => !item.ref.connectionId)
    .map(
      ({
        ref,
        title,
        subtitle,
        metadata,
        playlist,
        chart,
        capabilities,
        playable,
        durationMs,
      }) => ({
        ref: cleanRef(ref),
        title,
        subtitle,
        capabilities: [...capabilities],
        playable,
        durationMs,
        ...(metadata
          ? {
              metadata: {
                artists: metadata.artists,
                album: metadata.album && { id: metadata.album.id, title: metadata.album.title },
                qualities: metadata.qualities,
                qualitySizes: metadata.qualitySizes,
                qualitySizeLabels: metadata.qualitySizeLabels,
                hash: metadata.hash,
                durationMs: metadata.durationMs,
                artworkUrl: metadata.artworkUrl,
              },
            }
          : {}),
        ...(playlist
          ? {
              playlist: {
                trackCount: playlist.trackCount,
                description: playlist.description,
                author: playlist.author,
                artworkUrl: playlist.artworkUrl,
              },
            }
          : {}),
        ...(chart
          ? { chart: { artworkUrl: chart.artworkUrl, updateFrequency: chart.updateFrequency } }
          : {}),
      }),
    )
  return structuredClone({
    items,
    nextCursor: result.nextCursor,
    totalEstimate: result.totalEstimate,
    snapshotId: result.snapshotId,
    name: result.name,
    ...(result.playlist
      ? {
          playlist: {
            trackCount: result.playlist.trackCount,
            description: result.playlist.description,
            author: result.playlist.author,
            artworkUrl: result.playlist.artworkUrl,
          },
        }
      : {}),
  })
}
function shortText(value: unknown, limit = 2048) {
  if (typeof value !== 'string' || !value || value.length > limit)
    throw Error('Invalid music argument')
  return value
}
const providerMethods = {
  'music.search': 'tracks.search',
  'music.suggest': 'tracks.suggest',
  'music.hotSearch': 'tracks.hotSearch',
  'music.tracks.resolve': 'tracks.resolve',
  'music.tracks.lyrics': 'tracks.lyrics',
  'music.tracks.artwork': 'tracks.artwork',
  'music.playlists.search': 'playlists.search',
  'music.playlists.categories': 'playlists.categories',
  'music.playlists.list': 'playlists.list',
  'music.playlists.get': 'playlists.get',
  'music.charts.list': 'charts.list',
  'music.charts.getTracks': 'charts.getTracks',
} as const
export class MusicRegistry {
  private providers = new Map<string, Entry>()
  private importers = new Map<string, ImportEntry>()
  private listeners = new Set<(sources: MusicSource[]) => void>()
  constructor(
    private select: Selection = (_source, _method, owners) => owners,
    private prepareMedia?: (
      source: Source,
      result: Extract<ResolveResult, { ok: true }>,
      operation: OperationContext,
    ) => Promise<Extract<ResolveResult, { ok: true }>> | Extract<ResolveResult, { ok: true }>,
  ) {}

  register(source: Source, invoke: ProviderInvoker): Disposable {
    if (
      (source.providerId === 'local' || source.pluginId === 'host') &&
      !(source.runtime === 'host' && source.providerId === 'local' && source.pluginId === 'host')
    )
      throw Error('Reserved host source')
    const key = JSON.stringify([source.pluginId, source.providerId])
    const entry = { ...structuredClone(source), invoke }
    this.providers.set(key, entry)
    this.changed()
    return () => {
      if (this.providers.get(key) === entry) {
        this.providers.delete(key)
        this.changed()
      }
    }
  }
  registerImporter(source: Importer, invoke: ProviderInvoker): Disposable {
    const key = JSON.stringify([source.pluginId, source.declaration.id])
    const entry = { ...structuredClone(source), invoke }
    this.importers.set(key, entry)
    return () => {
      if (this.importers.get(key) === entry) this.importers.delete(key)
    }
  }
  on(event: 'sources.changed', handler: (sources: MusicSource[]) => void): Disposable {
    if (event !== 'sources.changed') throw Error('Unsupported music event')
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }
  changed() {
    for (const handler of this.listeners) handler(this.sources())
  }
  sources(): MusicSource[] {
    return [...new Set([...this.providers.values()].map((entry) => entry.providerId))].flatMap(
      (id) => {
        const entry = this.provider(id)
        if (!entry) return []
        const { pluginId, runtime, declaration, icon } = entry
        return [
          {
            id,
            pluginId,
            runtime,
            name: declaration.name,
            protocols: [...declaration.protocols],
            qualities: [...(declaration.qualities ?? [])],
            ...(icon ? { icon } : {}),
            available: true,
          },
        ]
      },
    )
  }
  provider(
    source: string,
    method?: string,
    owner?: string,
    predicate?: (id: string) => boolean,
  ): Entry | undefined {
    const candidates = [...this.providers.values()].filter(
      (entry) =>
        entry.providerId === source &&
        (!method || entry.methods.includes(method)) &&
        (!predicate || predicate(entry.pluginId)),
    )
    if (owner) {
      const matches = candidates.filter(
        (entry) => entry.pluginId === owner || entry.ownerId === owner,
      )
      return matches.length === 1 ? matches[0] : undefined
    }
    for (const id of this.select(
      source,
      method,
      candidates.map((entry) => entry.pluginId),
    )) {
      const entry = candidates.find((candidate) => candidate.pluginId === id)
      if (entry) return entry
    }
  }
  resolveProvider(ref: ResourceRef, method?: string) {
    assertResourceRef(ref)
    const entry = this.provider(
      ref.providerId,
      method,
      ref.scope === 'provider' ? undefined : ref.pluginId,
    )
    if (entry) return { pluginId: entry.pluginId, providerId: entry.providerId }
  }
  playbackRef(ref: ResourceRef, caller: string): ResourceRef {
    assertResourceRef(ref)
    if (ref.kind !== 'track') throw Error('Expected a track')
    const entry = this.provider(
      ref.providerId,
      'tracks.resolve',
      ref.scope === 'provider' ? undefined : ref.pluginId,
    )
    if (!entry || (ref.connectionId && entry.pluginId !== caller))
      throw Error('Music resource unavailable to caller')
    return caller === entry.pluginId &&
      (ref.pluginId === entry.ownerId || ref.pluginId === entry.pluginId)
      ? structuredClone(ref)
      : cleanRef(ref, entry.ownerId ?? entry.pluginId)
  }
  async invoke(
    method:
      | keyof typeof providerMethods
      | 'music.importers.list'
      | 'music.importers.parse'
      | 'music.sources',
    args: any[],
    caller: string,
    operation: OperationContext,
  ) {
    operation.signal.throwIfAborted()
    if (method === 'music.sources') return this.sources()
    if (method === 'music.importers.list')
      return [...this.importers.values()].map(
        ({ pluginId, declaration: { id, title, description } }) => ({
          pluginId,
          id,
          title,
          description,
        }),
      )
    if (method === 'music.importers.parse') {
      const entries = [...this.importers.values()].filter(
        (entry) => entry.declaration.id === args[0],
      )
      if (entries.length !== 1) throw Error('Unknown or ambiguous importer')
      const entry = entries[0]
      const value = shortText(args[1], 8192),
        cursor = args[2] == null ? undefined : shortText(args[2])
      const result = await entry.invoke('getTracks', [{ value, cursor, limit: 100 }], operation)
      operation.signal.throwIfAborted()
      return publicPage(result, caller, entry.pluginId)
    }
    const target = providerMethods[method]
    const referenced = [
      'tracks.resolve',
      'tracks.lyrics',
      'tracks.artwork',
      'playlists.list',
      'playlists.get',
      'charts.getTracks',
    ].includes(target)
    const ref: ResourceRef | undefined = referenced ? args[0] : undefined
    if (referenced) {
      assertResourceRef(ref)
      if (
        (target.startsWith('tracks.') && ref.kind !== 'track') ||
        (target === 'playlists.get' && ref.kind !== 'playlist') ||
        (target === 'charts.getTracks' && ref.kind !== 'chart')
      )
        throw Error('Invalid resource kind')
    }
    const source = ref?.providerId ?? shortText(args[0])
    const owner = ref?.scope === 'provider' ? undefined : ref?.pluginId
    const entry =
      this.provider(source, target, owner) ??
      (target === 'tracks.artwork'
        ? this.provider(source, 'tracks.artworkHires', owner)
        : undefined)
    if (!entry || (ref?.connectionId && entry.pluginId !== caller))
      throw Error('Music resource unavailable to caller')
    const input = args.slice(1, -1)
    if (target.endsWith('.search')) assertSearchRequest(input[0])
    if (target === 'tracks.suggest') shortText(input[0], 4096)
    if (ref) {
      if (input[0] != null) shortText(input[0])
      input.unshift(
        entry.pluginId === caller &&
          (ref.pluginId === entry.ownerId || ref.pluginId === entry.pluginId)
          ? structuredClone(ref)
          : cleanRef(ref, entry.ownerId ?? entry.pluginId),
      )
    }
    const hires = target === 'tracks.artwork' && !entry.methods.includes(target)
    if (hires) input.push({})
    let result = await entry.invoke(hires ? 'tracks.artworkHires' : target, input, operation)
    operation.signal.throwIfAborted()
    if (target === 'tracks.resolve') {
      if (
        entry.runtime === 'host' &&
        result?.ok &&
        /^ceru-local:\/\/track\/[0-9a-f-]{36}$/.test(result.url)
      )
        return { ok: true, url: result.url, expiresAt: result.expiresAt }
      assertResolveResult(result)
      if (entry.runtime === 3 && result.ok) {
        if (this.prepareMedia) result = await this.prepareMedia(entry, result, operation)
        else if (result.stream) throw Error('Host media streaming is unavailable')
      }
      if (result.ok && entry.pluginId !== caller)
        return { ok: true, url: result.url, expiresAt: result.expiresAt }
      return structuredClone(result)
    }
    if (target === 'tracks.lyrics') {
      assertLyricsDocument(result)
      return { ...structuredClone(result as CrLyric), track: structuredClone(ref!) }
    }
    if (target === 'tracks.artwork') {
      if (
        result != null &&
        !(
          typeof result === 'string' &&
          (/^https?:\/\//i.test(result) ||
            (entry.runtime === 'host' && /^data:image\/(png|jpeg|webp);base64,/i.test(result)))
        )
      )
        throw Error('Invalid artwork URL')
      return result ?? undefined
    }
    if (target === 'tracks.suggest' || target === 'tracks.hotSearch') {
      if (
        !Array.isArray(result) ||
        result.length > 1000 ||
        result.some((value) => typeof value !== 'string' || value.length > 4096)
      )
        throw Error('Invalid music suggestions')
      return [...result]
    }
    return publicPage(result, caller, entry.pluginId)
  }
}
