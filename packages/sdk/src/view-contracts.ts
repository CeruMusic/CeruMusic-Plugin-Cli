import type { AllowedComponentProps, Ref, VNodeProps } from 'vue'
import type { JsonObject, JsonValue, HostIconName } from './index.js'

export interface HostMediaItem {
  title: string
  key?: string
  ref?: {
    id: string
    providerId: string
    kind?: string
    pluginId?: string
    connectionId?: string
    scope?: 'provider'
  }
  source?: string
  subtitle?: string
  playable?: boolean
  durationMs?: number
  metadata?: { artists?: string[]; qualities?: string[]; durationMs?: number }
  playlist?: { author?: string; trackCount?: number }
}
export type HostSongAction = 'play' | 'enqueue' | 'favorite' | 'download'
export type HostSongActions = Partial<Record<HostSongAction, string>>
export interface HostTextProps {
  title?: string
  text?: string
  name?: string
}
export interface HostPalette {
  readonly accent: string
  readonly foreground: string
  readonly background: string
}
export interface HostVisualProps {
  artwork?: string | null
  track?: { title?: string; artists?: readonly string[]; album?: string } | null
  palette?: HostPalette
  playing?: boolean
  alt?: string
}
export interface HostVisualizerProps extends HostVisualProps {
  spectrum?: Readonly<Float32Array> | readonly number[]
  color?: string
  barCount?: number
  height?: number
}
type ViewComponent<Props> = new () => { $props: Props & VNodeProps & AllowedComponentProps }
export interface HostComponents {
  LyricAdapter: ViewComponent<{ alignPosition?: number; enableBlur?: boolean; enableSpring?: boolean; enableScale?: boolean; textAlign?: 'left' | 'center' | 'right'; onLineClick?: (milliseconds:number) => void }>
  AmlLyricPlayer: ViewComponent<{ alignPosition?: number; enableBlur?: boolean; enableSpring?: boolean; enableScale?: boolean; onLineClick?: (milliseconds:number) => void }>
  SquareCover: ViewComponent<HostVisualProps>
  VinylRecord: ViewComponent<HostVisualProps>
  ShaderBackground: ViewComponent<HostVisualProps>
  AudioVisualizer: ViewComponent<HostVisualizerProps>
  SongList: ViewComponent<{
    items?: readonly HostMediaItem[]
    actions?: HostSongActions
    label?: string
    onPlay?: { listener(item: HostMediaItem): void }['listener']
  }>
  PlaylistCard: ViewComponent<
    HostTextProps & { item?: HostMediaItem; onOpen?: (item: HostMediaItem) => void }
  >
  PlaylistGrid: ViewComponent<
    HostTextProps & { items?: readonly HostMediaItem[]; onOpen?: (item: HostMediaItem) => void }
  >
  QualityBadge: ViewComponent<HostTextProps & { quality?: string }>
  SourceIcon: ViewComponent<HostTextProps & { source?: string }>
  PageHeader: ViewComponent<HostTextProps & { description?: string }>
  EmptyState: ViewComponent<HostTextProps & { description?: string }>
  LoadingState: ViewComponent<HostTextProps>
}
export interface ViewBridge {
  readonly region?: import('./regions.js').MountedRegion
  readonly root: ShadowRoot
  readonly instanceId: string
  readonly viewId: string
  readonly props: Readonly<JsonObject>
  readonly state: Readonly<Ref<JsonObject>>
  readonly theme: Readonly<Ref<'light' | 'dark'>>
  readonly overlay: HTMLElement
  readonly components: HostComponents
  readonly icons: { url(name: HostIconName): string }
  invoke<Input extends JsonValue = JsonValue, Output extends JsonValue = JsonValue>(
    action: string,
    input?: Input,
  ): Promise<Output>
  close(): Promise<void>
  onDispose(cleanup: () => void): void
}
export type RegionTransitionHook = (context: { readonly root: ShadowRoot; readonly signal: AbortSignal; readonly reason: 'skin' | 'track' }) => void | Promise<void>
export type ViewEntry = ((bridge: ViewBridge) => void | (() => void)) & {
  onEnter?: RegionTransitionHook
  onLeave?: RegionTransitionHook
}
