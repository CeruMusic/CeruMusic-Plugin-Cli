import type { ContentEntity, OperationContext, Page } from './index.js'

export type PlaylistLocation = 'local' | 'cloud'
export interface PlaylistReference {
  /** Host ID; never a path or backend database credential. */
  id: string
  location: PlaylistLocation
}
export interface LibraryPlaylist {
  ref: PlaylistReference
  name: string
  description?: string
  trackCount?: number
  writable: boolean
}
export interface PlaylistImportRequest {
  /** Omit to let the Host show its existing playlist picker/create dialog. */
  target?: PlaylistReference
  suggestedName?: string
  items: ContentEntity[]
  /** Reuse this key when retrying the same batch, so the Host can avoid duplicates. */
  requestId: string
  permissionKey: string
  operation: OperationContext
}
export interface PlaylistImportResult {
  cancelled: boolean
  target?: PlaylistReference
  added: number
  skipped: number
}
export interface PlaylistRemoveRequest {
  target: PlaylistReference
  /** Only `kind: 'track'` entities are accepted. */
  items: ContentEntity[]
  permissionKey: string
  operation: OperationContext
}
export interface PlaylistRemoveResult {
  /** Tracks that were actually in the playlist and are now gone. */
  removed: number
  /** Tracks that matched nothing, so the caller can tell a no-op from a failure. */
  notFound: number
}

export interface PlaylistImporterImplementation {
  /** Resolve a pasted link/ID and return one page. Host owns paging and the import UI. */
  getTracks(
    request: { value: string; cursor?: string; limit: number },
    operation: OperationContext,
  ): Promise<PlaylistTrackPage>
}
export interface PlaylistTrackPage extends Page<ContentEntity> {
  name?: string
  playlist?: import('./music.js').PlaylistMetadata
}

/** Existing application library services. No plugin-owned playlist database. */
export interface LibraryAPI {
  playlists: {
    list(request: {
      location?: PlaylistLocation
      cursor?: string
      permissionKey: string
      operation: OperationContext
    }): Promise<Page<LibraryPlaylist>>
    getTracks(request: {
      target: PlaylistReference
      cursor?: string
      permissionKey: string
      operation: OperationContext
    }): Promise<Page<ContentEntity>>
    /** Host handles destination selection, auth, deduplication, persistence and cloud sync. */
    import(request: PlaylistImportRequest): Promise<PlaylistImportResult>
    /**
     * Delete tracks from an existing playlist. Requires `library.delete`; never
     * creates or relocates a playlist. `removed + notFound` equals `items.length`.
     */
    removeTracks(request: PlaylistRemoveRequest): Promise<PlaylistRemoveResult>
    /** Empty a playlist while keeping the playlist itself. Requires `library.delete`. */
    clearPlaylist(request: {
      target: PlaylistReference
      permissionKey: string
      operation: OperationContext
    }): Promise<void>
  }
}
