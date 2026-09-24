import type { ContentEntity, ResourceRef, ResolveResult } from './index.js'

/** Milliseconds throughout. Platform-specific formats/decryption stay inside the plugin. */
export interface LyricWord {
  /** Optional translation aligned with this timed source word. */
  translation?: string
  romanization?: string
  startTimeMs: number
  endTimeMs: number
  text: string
}
/** A translation or romanization, optionally preserving its own timed words. */
export interface LyricSubLine {
  language?: string
  text: string
  words?: LyricWord[]
}
export interface LyricLine {
  isBackground?: boolean
  isDuet?: boolean
  startTimeMs: number
  endTimeMs?: number
  text: string
  translation?: string
  romanization?: string
  /** Structured TTML-style alternatives. Singular fields remain backward compatible. */
  translations?: LyricSubLine[]
  romanizations?: LyricSubLine[]
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
  /** Optional platform hash; not a plugin owner or routing key. */
  hash?: string
  /** Original display sizes when exact bytes are unavailable. Never infer bytes from these labels. */
  qualitySizeLabels?: Record<string, string>
  artists: string[]
  album?: { id?: string; title: string }
  qualities?: string[]
  /** Actual file sizes in bytes, keyed by the same IDs as qualities. Omit unknown sizes. */
  qualitySizes?: Record<string, number>
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

function assertLyricWords(value: unknown, minimumStartTimeMs: number): void {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid lyric words')
  let lastWord = minimumStartTimeMs
  for (const word of value) {
    if (
      !record(word) ||
      !milliseconds(word.startTimeMs) ||
      !milliseconds(word.endTimeMs) ||
      word.endTimeMs < word.startTimeMs ||
      word.startTimeMs < lastWord ||
      !text(word.text, 65536) ||
      (word.translation !== undefined && !text(word.translation, 65536)) ||
      (word.romanization !== undefined && !text(word.romanization, 65536))
    )
      throw new Error('Invalid lyric word')
    lastWord = word.startTimeMs
  }
}

function assertLyricSubLines(value: unknown): void {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid lyric alternatives')
  for (const item of value) {
    if (
      !record(item) ||
      !text(item.text, 65536) ||
      (item.language !== undefined && !text(item.language, 128))
    )
      throw new Error('Invalid lyric alternative')
    if (item.words !== undefined) assertLyricWords(item.words, 0)
  }
}

export function assertResourceRef(value: unknown): asserts value is ResourceRef {
  if (
    !record(value) ||
    !['providerId', 'kind', 'id'].every((key) => text(value[key], 2048) && value[key].length > 0) ||
    (value.pluginId !== undefined && (!text(value.pluginId, 2048) || !value.pluginId))
  )
    throw new Error('Invalid resource reference')
  if (value.connectionId !== undefined && (!text(value.connectionId, 2048) || !value.connectionId))
    throw new Error('Invalid resource connection')
  if (
    value.scope !== undefined &&
    (value.scope !== 'provider' || value.kind !== 'track' || value.connectionId !== undefined)
  )
    throw new Error('Provider scope requires a public track without a connection')
  if (value.pluginId === undefined && value.scope !== 'provider')
    throw new Error('Private resources require an owning plugin')
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

/** Retarget a public track without disclosing the original plugin's private data. */
export function retargetTrackRef(ref: ResourceRef, pluginId: string): ResourceRef {
  assertResourceRef(ref)
  if (ref.kind !== 'track') throw new Error('Expected a track reference')
  if (!text(pluginId, 2048) || !pluginId) throw new Error('Invalid target plugin')
  if (ref.pluginId === pluginId) return ref
  if (ref.scope !== 'provider') throw new Error('Private tracks must stay with their owner')
  return { pluginId, providerId: ref.providerId, kind: 'track', id: ref.id, scope: 'provider' }
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
      const { qualities, qualitySizes, qualitySizeLabels, hash } = item.metadata
      if (hash !== undefined && !text(hash, 4096)) throw new Error('Invalid track hash')
      if (
        qualitySizeLabels !== undefined &&
        (!record(qualitySizeLabels) ||
          Object.keys(qualitySizeLabels).length > 128 ||
          Object.entries(qualitySizeLabels).some(
            ([quality, label]) => !qualities?.includes(quality) || !text(label, 128),
          ))
      )
        throw new Error('Invalid track quality size labels')
      if (
        qualities !== undefined &&
        (!Array.isArray(qualities) ||
          qualities.length > 128 ||
          !qualities.every((quality: unknown) => text(quality, 128) && !!quality))
      )
        throw new Error('Invalid track qualities')
      if (
        qualitySizes !== undefined &&
        (!record(qualitySizes) ||
          Object.keys(qualitySizes).length > 128 ||
          Object.entries(qualitySizes).some(
            ([quality, bytes]) =>
              !qualities?.includes(quality) || !Number.isSafeInteger(bytes) || Number(bytes) <= 0,
          ))
      )
        throw new Error('Invalid track quality sizes')
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
    if (value.requestHeaders !== undefined) {
      if (!record(value.requestHeaders) || Object.keys(value.requestHeaders).length > 32)
        throw new Error('Invalid playback request headers')
      for (const [name, headerValue] of Object.entries(value.requestHeaders)) {
        if (
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
          /^(host|connection|content-length|transfer-encoding|proxy-.*|upgrade)$/i.test(name) ||
          typeof headerValue !== 'string' ||
          headerValue.length > 8192 ||
          /[\r\n]/.test(headerValue)
        )
          throw new Error('Invalid playback request header')
      }
    }
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
    if (line.translations !== undefined) assertLyricSubLines(line.translations)
    if (line.romanizations !== undefined) assertLyricSubLines(line.romanizations)
    if (line.words !== undefined) assertLyricWords(line.words, line.startTimeMs)
  }
  if (value.plainText !== undefined && !text(value.plainText, 1048576))
    throw new Error('Invalid plain lyrics')
}
