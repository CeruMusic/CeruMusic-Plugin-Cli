import type { ContentEntity, ResourceRef, ResolveResult } from './index.js'

/** Milliseconds throughout. Platform-specific formats/decryption stay inside the plugin. */
export interface LyricWord {
  romanization?: string
  startTimeMs: number
  endTimeMs: number
  text: string
}
export interface LyricLine {
  isBackground?: boolean
  isDuet?: boolean
  startTimeMs: number
  endTimeMs?: number
  text: string
  translation?: string
  romanization?: string
  words?: LyricWord[]
}
export interface CrLyric {
  format: 'crlyric'
  version: 1
  track: ResourceRef
  offsetMs: number
  lines: LyricLine[]
  /** Untimed lyrics only. Empty lines + no plainText means no available lyrics. */
  plainText?: string
}
/** @deprecated Use CrLyric. */
export type LyricsDocument = CrLyric
export interface TrackMetadata {
  artists: string[]
  album?: { id?: string; title: string }
  qualities?: string[]
  artworkUrl?: string
  durationMs?: number
}
export interface MusicTrack extends ContentEntity {
  ref: ResourceRef & { kind: 'track' }
  metadata: TrackMetadata
}
export interface PlaylistMetadata {
  trackCount?: number
  description?: string
  author?: string
  artworkUrl?: string
}
export interface ChartMetadata {
  updateFrequency?: string
  artworkUrl?: string
}
export interface MusicPlaylist extends ContentEntity {
  ref: ResourceRef & { kind: 'playlist' }
  playlist?: PlaylistMetadata
}
export interface MusicChart extends ContentEntity {
  ref: ResourceRef & { kind: 'chart' }
  chart?: ChartMetadata
}

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 4096) => typeof value === 'string' && value.length <= max
const milliseconds = (value: unknown) => Number.isFinite(value) && Number(value) >= 0

export function assertResourceRef(value: unknown): asserts value is ResourceRef {
  if (
    !record(value) ||
    !['pluginId', 'providerId', 'kind', 'id'].every(
      (key) => text(value[key], 2048) && value[key].length > 0,
    )
  )
    throw new Error('Invalid resource reference')
  if (value.data !== undefined) {
    if (!record(value.data)) throw new Error('Invalid resource private data')
    let encoded: string
    try {
      encoded = JSON.stringify(value.data)
    } catch {
      throw new Error('Resource private data must be JSON')
    }
    if (new TextEncoder().encode(encoded).byteLength > 64 * 1024)
      throw new Error('Resource private data exceeds 64 KiB')
  }
}

export function assertContentPage(value: unknown): void {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 10000)
    throw new Error('Invalid content page')
  if (value.nextCursor != null && (!text(value.nextCursor, 2048) || !value.nextCursor.length))
    throw new Error('Invalid pagination cursor')
  for (const item of value.items) {
    if (
      !record(item) ||
      !text(item.title) ||
      !Array.isArray(item.capabilities) ||
      !item.capabilities.every((entry: unknown) => text(entry, 128))
    )
      throw new Error('Invalid content item')
    assertResourceRef(item.ref)
    if (item.ref.kind === 'track') {
      if (
        !record(item.metadata) ||
        !Array.isArray(item.metadata.artists) ||
        !item.metadata.artists.every((artist: unknown) => text(artist))
      )
        throw new Error('Track metadata must contain artists')
      if (item.metadata.durationMs !== undefined && !milliseconds(item.metadata.durationMs))
        throw new Error('Invalid track duration')
    }
    if (item.ref.kind === 'playlist' && item.playlist !== undefined) {
      if (!record(item.playlist)) throw new Error('Invalid playlist metadata')
      if (
        item.playlist.trackCount !== undefined &&
        (!Number.isInteger(item.playlist.trackCount) || item.playlist.trackCount < 0)
      )
        throw new Error('Invalid playlist track count')
    }
    if (item.ref.kind === 'chart' && item.chart !== undefined && !record(item.chart))
      throw new Error('Invalid chart metadata')
  }
}

export function assertResolveResult(value: unknown): asserts value is ResolveResult {
  if (!record(value) || typeof value.ok !== 'boolean') throw new Error('Invalid resolve result')
  if (value.ok) {
    if (!text(value.url, 8192)) throw new Error('Invalid playback URL')
    const url = new URL(value.url)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid playback protocol')
    if (value.expiresAt !== undefined && !milliseconds(value.expiresAt))
      throw new Error('Invalid playback expiry')
    return
  }
  if (!record(value.error) || !text(value.error.code, 128) || !text(value.error.message, 65536))
    throw new Error('Invalid music fault')
}

export function assertLyricsDocument(value: unknown): asserts value is LyricsDocument {
  if (
    !record(value) ||
    value.format !== 'crlyric' ||
    value.version !== 1 ||
    !Number.isFinite(value.offsetMs) ||
    !Array.isArray(value.lines) ||
    value.lines.length > 20000
  )
    throw new Error('Invalid lyrics document')
  assertResourceRef(value.track)
  if (value.track.kind !== 'track') throw new Error('Lyrics must reference a track')
  let previous = -1
  for (const line of value.lines) {
    if (
      !record(line) ||
      !milliseconds(line.startTimeMs) ||
      line.startTimeMs < previous ||
      !text(line.text, 65536)
    )
      throw new Error('Invalid lyric line')
    previous = line.startTimeMs
    if (
      line.endTimeMs !== undefined &&
      (!milliseconds(line.endTimeMs) || line.endTimeMs < line.startTimeMs)
    )
      throw new Error('Invalid lyric line end')
    for (const field of ['translation', 'romanization'])
      if (line[field] !== undefined && !text(line[field], 65536))
        throw new Error('Invalid lyric translation')
    if (line.words !== undefined) {
      if (!Array.isArray(line.words) || line.words.length > 10000)
        throw new Error('Invalid lyric words')
      let lastWord = line.startTimeMs
      for (const word of line.words) {
        if (
          !record(word) ||
          !milliseconds(word.startTimeMs) ||
          !milliseconds(word.endTimeMs) ||
          word.endTimeMs < word.startTimeMs ||
          word.startTimeMs < lastWord ||
          !text(word.text, 65536)
        )
          throw new Error('Invalid lyric word')
        lastWord = word.startTimeMs
      }
    }
  }
  if (value.plainText !== undefined && !text(value.plainText, 1048576))
    throw new Error('Invalid plain lyrics')
}
