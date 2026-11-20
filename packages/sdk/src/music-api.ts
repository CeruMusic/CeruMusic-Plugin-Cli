import type {
  SearchRequest,
  ContentEntity,
  Page,
  ResourceRef,
  ResolveResult,
  Disposable,
  ServiceCall,
  CrLyric,
  PlaylistTrackPage,
} from './index.js'

export interface MusicSource {
  id: string
  pluginId: string
  runtime: 2 | 3 | 'host'
  name: string
  protocols: string[]
  qualities: string[]
  icon?: string
  available: boolean
}

export interface MusicAPI {
  sources(): Promise<MusicSource[]>
  search(sourceId: string, request: SearchRequest, call: ServiceCall): Promise<Page<ContentEntity>>
  suggest(sourceId: string, query: string, call: ServiceCall): Promise<string[]>
  hotSearch(sourceId: string, call: ServiceCall): Promise<string[]>
  tracks: {
    resolve(
      ref: ResourceRef,
      quality: string | undefined,
      call: ServiceCall,
    ): Promise<ResolveResult>
    lyrics(ref: ResourceRef, call: ServiceCall): Promise<CrLyric>
    artwork(ref: ResourceRef, call: ServiceCall): Promise<string | undefined>
  }
  playlists: {
    search(
      sourceId: string,
      request: SearchRequest,
      call: ServiceCall,
    ): Promise<Page<ContentEntity>>
    categories(sourceId: string, call: ServiceCall): Promise<Page<ContentEntity>>
    list(
      ref: ResourceRef,
      cursor: string | undefined,
      call: ServiceCall,
    ): Promise<Page<ContentEntity>>
    get(ref: ResourceRef, cursor: string | undefined, call: ServiceCall): Promise<PlaylistTrackPage>
  }
  charts: {
    list(sourceId: string, call: ServiceCall): Promise<Page<ContentEntity>>
    getTracks(
      ref: ResourceRef,
      cursor: string | undefined,
      call: ServiceCall,
    ): Promise<Page<ContentEntity>>
  }
  importers: {
    list(): Promise<{ id: string; pluginId: string; title: string; description?: string }[]>
    parse(
      importerId: string,
      value: string,
      cursor: string | undefined,
      call: ServiceCall,
    ): Promise<Page<ContentEntity>>
  }
  play(ref: ResourceRef, call: ServiceCall): Promise<void>
  enqueue(refs: ResourceRef[], position: 'next' | 'end', call: ServiceCall): Promise<void>
  on(event: 'sources.changed', handler: (sources: MusicSource[]) => void): Disposable
}
