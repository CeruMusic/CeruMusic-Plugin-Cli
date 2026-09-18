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

export interface PlaylistImporterImplementation {
  /** Resolve a pasted link/ID and return one page. Host owns paging and the import UI. */
  getTracks(
    request: { value: string; cursor?: string; limit: number },
    operation: OperationContext,
  ): Promise<Page<ContentEntity> & { name?: string }>
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
  }
}
