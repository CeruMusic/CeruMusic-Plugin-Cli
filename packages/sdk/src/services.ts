import type { Disposable, JsonObject, JsonValue, IconRef } from './manifest.js'
import type {
  ContentEntity,
  MusicFault,
  OperationContext,
  Page,
  ResourceRef,
  AssetHandle,
} from './index.js'
import type { LibraryPlaylist, PlaylistReference } from './library.js'
import type { LyricsDocument } from './music.js'
import type { PermissionGroup } from './permissions.js'
import type { HostNavigationRequest } from './navigation.js'

/** Supplied by Host actions/events. Never construct trusted intents from plugin JSON. */
export interface ServiceCall {
  operation: OperationContext
  permissionKey: string
}
export interface ServiceAvailability {
  service: string
  version: string
  available: boolean
  /** When present, only these methods are connected by the Host. */
  methods?: string[]
  reason?: 'host-not-connected' | 'unsupported' | 'not-logged-in' | 'disabled'
  permissionGroups: PermissionGroup[]
}
export interface AccountProfile {
  id: string
  displayName: string
  avatar?: AssetHandle
  /** Stable plugin-scoped identity; no email, phone, tokens or auth provider subject by default. */
  identityScope: 'plugin'
}
export interface AccountSession {
  loggedIn: boolean
  profile: AccountProfile | null
}
export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
  track: ContentEntity | null
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  repeat: 'off' | 'one' | 'all'
  shuffle: boolean
}
export interface QueueState {
  items: ContentEntity[]
  currentIndex: number
  revision: string
}
export interface DownloadTask {
  id: string
  track: ContentEntity
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  receivedBytes: number
  totalBytes?: number
  error?: MusicFault
}
export interface FileHandle {
  kind: 'file'
  id: string
  name: string
  size?: number
  mime?: string
}
export interface DirectoryHandle {
  kind: 'directory'
  id: string
  name: string
}
export interface AudioDevice {
  id: string
  name: string
  kind: 'local' | 'dlna'
  available: boolean
}
export interface ShareDescriptor {
  version: 1
  track: ResourceRef
  title: string
  artists: string[]
  canonicalUrl?: string
  /** Public resolver identity; never executable plugin code, master keys or auth tokens. */
  resolver?: { id: string; resourceId: string }
}
export interface RoomState {
  joined: boolean
  id?: string
  title?: string
  role?: 'owner' | 'member'
  members?: number
}
export interface AppInfo {
  name: string
  version: string
  platform: 'win32' | 'darwin' | 'linux'
  locale: string
  theme: 'light' | 'dark'
  hostApi: string
}

export interface HostServiceEvents {
  'account.changed': AccountSession
  'library.changed': {
    target: PlaylistReference
    reason: 'created' | 'updated' | 'deleted' | 'synced'
  }
  'player.changed': PlayerState
  'queue.changed': QueueState
  'lyrics.changed': LyricsDocument | null
  'downloads.changed': DownloadTask
  'settings.changed': { keys: string[] }
  'theme.changed': { theme: 'light' | 'dark' }
  'rooms.changed': RoomState
  'devices.changed': AudioDevice[]
  'permissions.changed': { keys: string[] }
}

export const HOST_SERVICE_EVENT_NAMES = [
  'account.changed',
  'library.changed',
  'player.changed',
  'queue.changed',
  'lyrics.changed',
  'downloads.changed',
  'settings.changed',
  'theme.changed',
  'rooms.changed',
  'devices.changed',
  'permissions.changed',
] as const satisfies readonly (keyof HostServiceEvents)[]

/** Contract first: availability must be checked before using services not connected by this Host. */
export interface HostServices {
  capabilities: {
    list(): Promise<ServiceAvailability[]>
    get(service: string): Promise<ServiceAvailability>
  }
  account: {
    getSession(call: ServiceCall): Promise<AccountSession>
    getProfile(call: ServiceCall): Promise<AccountProfile | null>
    /** Opens the application's own account page. Plugins do not implement login or receive its token. */
    openLogin(operation: OperationContext): Promise<void>
  }
  app: {
    getInfo(): Promise<AppInfo>
    openSettings(section?: string): Promise<void>
    openExternal(url: string, call: ServiceCall): Promise<void>
  }
  player: {
    getState(call: ServiceCall): Promise<PlayerState>
    play(track: ResourceRef | undefined, call: ServiceCall): Promise<void>
    pause(call: ServiceCall): Promise<void>
    next(call: ServiceCall): Promise<void>
    previous(call: ServiceCall): Promise<void>
    seek(positionMs: number, call: ServiceCall): Promise<void>
    setVolume(volume: number, call: ServiceCall): Promise<void>
    setMode(
      mode: { repeat?: PlayerState['repeat']; shuffle?: boolean; muted?: boolean },
      call: ServiceCall,
    ): Promise<void>
  }
  queue: {
    get(call: ServiceCall): Promise<QueueState>
    append(items: ContentEntity[], call: ServiceCall): Promise<QueueState>
    replace(items: ContentEntity[], call: ServiceCall): Promise<QueueState>
    remove(refs: ResourceRef[], call: ServiceCall): Promise<QueueState>
    reorder(refs: ResourceRef[], revision: string, call: ServiceCall): Promise<QueueState>
  }
  favorites: {
    contains(refs: ResourceRef[], call: ServiceCall): Promise<boolean[]>
    add(refs: ResourceRef[], call: ServiceCall): Promise<void>
    remove(refs: ResourceRef[], call: ServiceCall): Promise<void>
  }
  history: { list(cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>> }
  downloads: {
    list(call: ServiceCall): Promise<DownloadTask[]>
    create(
      request: { tracks: ResourceRef[]; quality?: string; directory?: DirectoryHandle },
      call: ServiceCall,
    ): Promise<DownloadTask[]>
    pause(ids: string[], call: ServiceCall): Promise<void>
    resume(ids: string[], call: ServiceCall): Promise<void>
    cancel(ids: string[], call: ServiceCall): Promise<void>
    retry(ids: string[], call: ServiceCall): Promise<void>
    reveal(id: string, call: ServiceCall): Promise<void>
  }
  files: {
    pick(
      request: { title?: string; extensions?: string[]; multiple?: boolean },
      operation: OperationContext,
    ): Promise<FileHandle[]>
    pickDirectory(operation: OperationContext): Promise<DirectoryHandle | null>
    readText(file: FileHandle, call: ServiceCall): Promise<string>
    readBase64(file: FileHandle, call: ServiceCall): Promise<string>
    saveText(
      request: { suggestedName: string; text: string },
      operation: OperationContext,
    ): Promise<FileHandle | null>
    writeText(file: FileHandle, text: string, call: ServiceCall): Promise<void>
  }
  clipboard: {
    readText(call: ServiceCall): Promise<string>
    writeText(text: string, call: ServiceCall): Promise<void>
  }
  localMusic: {
    list(cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>
    scan(directories: DirectoryHandle[], call: ServiceCall): Promise<{ taskId: string }>
    getTags(track: ResourceRef, call: ServiceCall): Promise<JsonObject>
    writeTags(
      track: ResourceRef,
      tags: { title?: string; artists?: string[]; album?: string; lyrics?: LyricsDocument },
      call: ServiceCall,
    ): Promise<void>
  }
  settings: {
    /** Only explicit public setting names. Secret/unsafe settings are not part of this API. */
    get(keys: string[], call: ServiceCall): Promise<JsonObject>
    update(values: JsonObject, call: ServiceCall): Promise<void>
  }
  window: {
    control(
      action: 'show' | 'minimize' | 'maximize' | 'restore' | 'mini-player',
      call: ServiceCall,
    ): Promise<void>
  }
  hotkeys: {
    register(
      request: { id: string; accelerator: string; commandId: string },
      call: ServiceCall,
    ): Promise<Disposable>
  }
  sharing: {
    create(
      request: ShareDescriptor,
      call: ServiceCall,
    ): Promise<{ id: string; url: string; expiresAt?: number }>
    revoke(id: string, call: ServiceCall): Promise<void>
    resolve(url: string, operation: OperationContext): Promise<ShareDescriptor>
  }
  rooms: {
    getState(call: ServiceCall): Promise<RoomState>
    join(inviteCode: string, call: ServiceCall): Promise<RoomState>
    leave(call: ServiceCall): Promise<void>
    requestTrack(track: ResourceRef, call: ServiceCall): Promise<void>
  }
  devices: {
    list(call: ServiceCall): Promise<AudioDevice[]>
    select(id: string, call: ServiceCall): Promise<void>
  }
  ai: {
    generate(
      request: { prompt: string; maxOutputChars?: number },
      call: ServiceCall,
    ): Promise<{ text: string }>
  }
  tasks: {
    schedule(
      request: { id: string; commandId: string; intervalMs: number },
      call: ServiceCall,
    ): Promise<{ id: string }>
    cancel(id: string, call: ServiceCall): Promise<void>
  }
  events: {
    on<K extends keyof HostServiceEvents>(
      event: K,
      listener: (value: HostServiceEvents[K]) => void,
      call?: ServiceCall,
    ): Disposable
  }
}

export interface HostUI {
  dialogs: {
    confirm(request: { title: string; message: string; confirmText?: string }): Promise<boolean>
    prompt(request: {
      title: string
      label: string
      value?: string
      secret?: boolean
    }): Promise<string | null>
    pickPlaylist(request?: {
      location?: 'local' | 'cloud'
      writable?: boolean
    }): Promise<LibraryPlaylist | null>
  }
  navigation: {
    open(request: HostNavigationRequest): Promise<void>
  }
  notifications: {
    show(request: { title: string; body: string }, call: ServiceCall): Promise<void>
  }
  progress: {
    create(request: { title: string; cancellable?: boolean }): Promise<{ id: string }>
    update(id: string, request: { value?: number; message?: string }): Promise<void>
    close(id: string): Promise<void>
  }
}

export interface MenuContribution {
  id: string
  slot: 'playlist.import' | 'playlist.actions' | 'track.actions' | 'player.actions' | 'search.tools'
  title: string
  description?: string
  commandId: string
  icon?: IconRef
  when?: { kinds?: ('track' | 'playlist')[]; loggedIn?: boolean }
}

/** Explicit allowlist for future Core routing; never forward arbitrary IPC channel names. */
export const HOST_SERVICE_METHODS = {
  capabilities: ['list', 'get'],
  account: ['getSession', 'getProfile', 'openLogin'],
  app: ['getInfo', 'openSettings', 'openExternal'],
  player: ['getState', 'play', 'pause', 'next', 'previous', 'seek', 'setVolume', 'setMode'],
  queue: ['get', 'append', 'replace', 'remove', 'reorder'],
  favorites: ['contains', 'add', 'remove'],
  history: ['list'],
  downloads: ['list', 'create', 'pause', 'resume', 'cancel', 'retry', 'reveal'],
  files: ['pick', 'pickDirectory', 'readText', 'readBase64', 'saveText', 'writeText'],
  clipboard: ['readText', 'writeText'],
  localMusic: ['list', 'scan', 'getTags', 'writeTags'],
  settings: ['get', 'update'],
  window: ['control'],
  hotkeys: ['register'],
  sharing: ['create', 'revoke', 'resolve'],
  rooms: ['getState', 'join', 'leave', 'requestTrack'],
  devices: ['list', 'select'],
  ai: ['generate'],
  tasks: ['schedule', 'cancel'],
} as const

export type SerializedHostValue = JsonValue | AssetHandle
