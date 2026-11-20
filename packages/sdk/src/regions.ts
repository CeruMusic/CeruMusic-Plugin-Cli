import type { LyricLine } from './music.js'

export const PLAYER_REGIONS = ['player.lyrics', 'player.artwork', 'player.background',
  'player.visualizer', 'player.songInfo', 'player.stage', 'desktopLyric'] as const
export type PlayerRegion = typeof PLAYER_REGIONS[number]

export function parsePlayerRegion(value: string): { name: PlayerRegion; version: number } | null {
  const match = /^([A-Za-z.]+)(?:@([1-9]\d*))?$/.exec(value)
  if (!match || !PLAYER_REGIONS.includes(match[1] as PlayerRegion)) return null
  const version = Number(match[2] ?? 1)
  return Number.isSafeInteger(version) ? { name: match[1] as PlayerRegion, version } : null
}

type Live<Value> = { readonly value: Value }
type DeepReadonly<Value> = Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value
export type RegionJsonValue = null | string | number | boolean | RegionJsonObject | readonly RegionJsonValue[]
export interface RegionJsonObject { readonly [key:string]: RegionJsonValue }
export interface RegionTrack {
  readonly title: string
  readonly artists: readonly string[]
  readonly album?: string
  readonly durationMs?: number
}
interface PlayerProps {
  readonly track: RegionTrack | null
  readonly currentTime: Live<number>
  readonly playing: Live<boolean>
  readonly palette: Readonly<{ accent: string; foreground: string; background: string }>
  readonly layout: 'cd' | 'cover'
  readonly forward: RegionJsonObject
}
interface LyricsProps { readonly lines: DeepReadonly<LyricLine[]> }
interface ArtworkProps { readonly artwork: string | null }
interface SpectrumProps { readonly spectrum: Readonly<Float32Array> }
interface DesktopProps { readonly current: DeepReadonly<LyricLine> | null; readonly next: DeepReadonly<LyricLine> | null; readonly locked: Live<boolean> }

export interface RegionProps {
  'player.lyrics': PlayerProps & LyricsProps
  'player.artwork': PlayerProps & ArtworkProps
  'player.background': PlayerProps & ArtworkProps & SpectrumProps
  'player.visualizer': PlayerProps & SpectrumProps
  'player.songInfo': PlayerProps
  'player.stage': PlayerProps & LyricsProps & ArtworkProps & SpectrumProps
  desktopLyric: PlayerProps & DesktopProps
}
export interface RegionContext<Name extends PlayerRegion> {
  readonly size: Live<Readonly<{width:number; height:number}>>
  readonly name: Name
  readonly version: 1
  readonly props: RegionProps[Name]
  readonly settings: RegionJsonObject
  readonly actions: Name extends 'player.lyrics' | 'player.stage' ? { seek(milliseconds: number): Promise<void> } : Readonly<Record<string, never>>
  onFrame(callback: (timestamp: number) => void): () => void
}
export type MountedRegion = { [Name in PlayerRegion]: RegionContext<Name> }[PlayerRegion]
