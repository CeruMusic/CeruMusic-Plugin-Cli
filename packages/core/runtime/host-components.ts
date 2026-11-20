import { defineComponent, getCurrentInstance, h, onBeforeUnmount, onMounted, ref, watch, type Component, type PropType } from 'vue'
import { createAmlLyricPlayer } from './aml-lyric-player.js'
import { createLyricAdapter } from './lyric-adapter.js'
import { isRegionActive } from './component-region.js'
import type { BaseRenderer, BackgroundRender } from '@applemusic-like-lyrics/core'
import type { MountedRegion } from '@shiqianjiang/ceru-plugin-sdk'
import type {
  HostComponents,
  HostMediaItem,
  HostSongAction,
  HostSongActions,
  HostVisualProps,
  HostVisualizerProps,
} from '@shiqianjiang/ceru-plugin-sdk/view-bridge'
import type { HostIconName, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

const textProps = { title: String, text: String, name: String }
const titleOf = (props: { title?: string; text?: string; name?: string }) =>
  props.title || props.text || props.name || ''
const media = Object as PropType<HostMediaItem>
const itemsProp = { type: Array as PropType<readonly HostMediaItem[]>, default: () => [] }
const platformNames: Readonly<Record<string, string>> = {
  tx: 'QQ音乐',
  kg: '酷狗音乐',
  kw: '酷我音乐',
  wy: '网易云音乐',
  mg: '咪咕音乐',
  local: '本地',
  all: '全部平台',
}
const qualityNames: Readonly<Record<string, string>> = {
  '128k': '标准',
  '320k': '高品质',
  flac: '无损',
  flac24bit: 'Hi-Res',
}
const actionNames = { play: '播放', enqueue: '加入队列', favorite: '收藏', download: '下载' }
const extraActions = ['enqueue', 'favorite', 'download'] as const
function identity(item: HostMediaItem) {
  const ref = item.ref
  return (
    item.key ||
    (ref && JSON.stringify([ref.pluginId, ref.connectionId, ref.providerId, ref.kind, ref.id]))
  )
}
function actionInput(item: HostMediaItem): JsonValue {
  if (typeof item.key === 'string' && item.key) return item.key
  if (!item.ref) throw Error('歌曲缺少可用的引用')
  const { id, providerId, kind, pluginId, connectionId, scope } = item.ref
  return {
    id,
    providerId,
    kind: kind || 'track',
    ...(pluginId ? { pluginId } : {}),
    ...(connectionId ? { connectionId } : {}),
    ...(scope ? { scope } : {}),
  }
}
function duration(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return ''
  const seconds = Math.floor(value / 1000)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}
const visualProps = {
  artwork: { type: String as PropType<string | null>, default: null },
  track: { type: Object as PropType<HostVisualProps['track']>, default: null },
  palette: { type: Object as PropType<HostVisualProps['palette']>, default: undefined },
  playing: { type: Boolean, default: false },
  alt: { type: String, default: '' },
}
const visualStyle = (props: HostVisualProps) => ({
  '--ceru-hc-accent': props.palette?.accent || 'var(--td-brand-color, #47867a)',
  '--ceru-hc-foreground': props.palette?.foreground || 'var(--td-text-color-primary, #fff)',
  '--ceru-hc-background': props.palette?.background || 'var(--td-bg-color-page, #202524)',
}) as Record<string, string>
export interface DesktopComponents { LyricAdapter: Component; SpectrumCanvas: Component; PlayerArtwork: Component }
function createVisualComponents(region?: MountedRegion, desktop?: DesktopComponents) {
  const artwork = (name: 'SquareCover' | 'VinylRecord', mode: 'square' | 'vinyl') => defineComponent({
    name,
    props: visualProps,
    setup(props) {
      if (!desktop?.PlayerArtwork) throw Error(name + ' is not installed by this host')
      return () => h(desktop.PlayerArtwork, { mode, artwork: props.artwork, playing: props.playing && isRegionActive(region),
        alt: props.alt || props.track?.title || '', style: visualStyle(props) })
    },
  })
  const SquareCover = artwork('SquareCover', 'square')
  const VinylRecord = artwork('VinylRecord', 'vinyl')
  const ShaderBackground = defineComponent({
    name: 'ShaderBackground',
    props: visualProps,
    setup(props) {
      const host = ref<HTMLElement>()
      watch([host, () => props.artwork], ([element, artwork], _, cleanup) => {
        if (!element || !artwork || !/^data:image\/(png|jpeg|webp);base64,/i.test(artwork)) return
        let closed = false, loading = false
        let renderer: BackgroundRender<BaseRenderer> | undefined
        const motion = matchMedia('(prefers-reduced-motion: reduce)')
        function sync() {
          if (!renderer || loading || closed) return
          if (!document.hidden && isRegionActive(region) && props.playing && !motion.matches) renderer.resume()
          else renderer.pause()
        }
        const stop = watch([() => props.playing, () => isRegionActive(region)], sync)
        motion.addEventListener('change', sync)
        document.addEventListener('visibilitychange', sync)
        cleanup(() => {
          closed = true; stop(); motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync)
          renderer?.pause(); renderer?.getElement().remove()
          if (!loading) renderer?.dispose()
        })
        void (async () => {
          try {
            const { BackgroundRender, MeshGradientRenderer } = await import('@applemusic-like-lyrics/core')
            if (closed) return
            renderer = BackgroundRender.new(MeshGradientRenderer)
            renderer.setRenderScale(0.5); renderer.setFPS(30); renderer.setFlowSpeed(1)
            loading = true
            const cover = new Image()
            cover.src = artwork
            await cover.decode()
            if (closed) return
            await renderer.setAlbum(cover, false)
            if (!closed) element.append(renderer.getElement())
          } catch {
            renderer?.getElement().remove(); renderer?.dispose(); renderer = undefined
          } finally {
            loading = false
            if (closed) renderer?.dispose(); else sync()
          }
        })()
      }, { flush: 'post' })
      return () => h('div', {
        ref: host,
        class: ['ceru-hc-background', { playing: props.playing }],
        style: {
          ...visualStyle(props),
          ...(props.artwork ? { backgroundImage: `url(${JSON.stringify(props.artwork)})` } : {}),
        },
        role: 'img',
        'aria-label': props.alt || props.track?.title || '播放背景',
      })
    },
  })
  const AudioVisualizer = defineComponent({
    name: 'AudioVisualizer',
    props: {
      ...visualProps,
      spectrum: { type: Object as PropType<HostVisualizerProps['spectrum']>, default: undefined },
      color: { type: String, default: '' },
      barCount: { type: Number, default: 48 },
      height: { type: Number, default: 72 },
    },
    setup(props) {
      if (!desktop?.SpectrumCanvas) throw Error('AudioVisualizer is not installed by this host')
      const view = ref<{ draw(samples: ArrayLike<number>, timestamp?: number, force?: boolean): void }>()
      const update = (time?: number, force = false) => {
        const source = props.spectrum || (region && 'spectrum' in region.props ? region.props.spectrum : undefined)
        view.value?.draw(source ?? [], time, force)
      }
      let stop: (() => void) | undefined
      onMounted(() => { update(undefined, true); stop = region?.onFrame(update) })
      onBeforeUnmount(() => stop?.())
      watch(() => props.spectrum, () => update(undefined, true), { flush: 'post' })
      return () => h(desktop.SpectrumCanvas, {
        ref: view, barCount: Math.max(4, Math.min(128, Math.round(props.barCount))), height: Math.max(24, props.height),
        color: props.color || props.palette?.accent || 'var(--td-brand-color, #47867a)',
        class: ['ceru-hc-visualizer', { playing: props.playing }],
      })
    },
  })
  return { SquareCover, VinylRecord, ShaderBackground, AudioVisualizer }
}
export function createHostComponents(
  iconUrl: (name: HostIconName) => string,
  invoke: (action: string, input: JsonValue) => Promise<unknown>,
  region?: MountedRegion,
  desktop?: DesktopComponents,
): HostComponents {
  const glyph = (name: HostIconName) => {
    const src = iconUrl(name)
    return src ? h('img', { class: 'ceru-hc-icon', src, alt: '', draggable: false }) : undefined
  }
  const PageHeader = defineComponent({
    name: 'PageHeader',
    props: { ...textProps, description: String },
    setup(props, { slots }) {
      return () =>
        h('header', { class: 'ceru-hc-header' }, [
          h('div', [
            h('h2', slots.default?.() ?? titleOf(props)),
            props.description && h('p', props.description),
          ]),
          slots.actions?.(),
        ])
    },
  })
  const EmptyState = defineComponent({
    name: 'EmptyState',
    props: { ...textProps, description: String },
    setup(props, { slots }) {
      return () =>
        h('div', { class: 'ceru-hc-state', role: 'status' }, [
          glyph('music-note'),
          h('strong', slots.default?.() ?? (titleOf(props) || '暂无内容')),
          props.description && h('p', props.description),
          slots.actions?.(),
        ])
    },
  })
  const LoadingState = defineComponent({
    name: 'LoadingState',
    props: textProps,
    setup(props, { slots }) {
      return () =>
        h('div', { class: 'ceru-hc-state', role: 'status', 'aria-live': 'polite' }, [
          h('span', { class: 'ceru-hc-spinner', 'aria-hidden': true }),
          h('span', slots.default?.() ?? (titleOf(props) || '加载中…')),
        ])
    },
  })
  const QualityBadge = defineComponent({
    name: 'QualityBadge',
    props: { ...textProps, quality: String },
    setup(props, { slots }) {
      return () => {
        const value = props.quality || titleOf(props)
        return h(
          'span',
          { class: 'ceru-hc-quality', title: value },
          slots.default?.() ?? (Object.hasOwn(qualityNames, value) ? qualityNames[value] : value),
        )
      }
    },
  })
  const SourceIcon = defineComponent({
    name: 'SourceIcon',
    props: { ...textProps, source: String },
    setup(props, { slots }) {
      return () => {
        const source = props.source || props.name || '',
          known = Object.hasOwn(platformNames, source)
        const label =
          props.title || props.text || (known ? platformNames[source] : source || '音源')
        return h('span', { class: 'ceru-hc-source', title: label }, [
          (known && glyph(('platform.' + source) as HostIconName)) || glyph('music-note'),
          h('span', slots.default?.() ?? label),
        ])
      }
    },
  })
  const PlaylistCard = defineComponent({
    name: 'PlaylistCard',
    props: { ...textProps, item: media },
    emits: ['open'],
    setup(props, { slots, emit }) {
      const instance = getCurrentInstance()
      return () => {
        const item = props.item,
          title = item?.title || titleOf(props) || '未命名歌单',
          open = !!item && !!instance?.vnode.props?.onOpen
        return h('article', { class: 'ceru-hc-card' }, [
          h('div', { class: 'ceru-hc-cover' }, slots.cover?.() ?? [glyph('library')]),
          h('div', { class: 'ceru-hc-copy' }, [
            open
              ? h(
                  'button',
                  { type: 'button', class: 'ceru-hc-title', onClick: () => emit('open', item) },
                  slots.default?.() ?? title,
                )
              : h('strong', slots.default?.() ?? title),
            h(
              'small',
              [
                item?.playlist?.author || item?.subtitle,
                Number.isFinite(item?.playlist?.trackCount)
                  ? item!.playlist!.trackCount + ' 首'
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          ]),
        ])
      }
    },
  })
  const PlaylistGrid = defineComponent({
    name: 'PlaylistGrid',
    props: { ...textProps, items: itemsProp },
    emits: ['open'],
    setup(props, { slots, emit }) {
      const instance = getCurrentInstance()
      return () =>
        h(
          'section',
          { 'aria-label': titleOf(props) || '歌单', class: 'ceru-hc-grid' },
          slots.default?.() ??
            (props.items.length
              ? props.items.map((item, index) =>
                  h(PlaylistCard, {
                    key: identity(item) ?? index,
                    item,
                    ...(instance?.vnode.props?.onOpen ? { onOpen: () => emit('open', item) } : {}),
                  }),
                )
              : titleOf(props)),
        )
    },
  })
  const SongList = defineComponent({
    name: 'SongList',
    props: { items: itemsProp, actions: Object as PropType<HostSongActions>, label: String },
    emits: ['play'],
    setup(props, { emit }) {
      const error = ref(''),
        notice = ref(''),
        pending = ref(false),
        instance = getCurrentInstance()
      async function run(action: HostSongAction, item: HostMediaItem) {
        if (pending.value) return
        error.value = ''
        notice.value = ''
        const declared = props.actions?.[action]
        if (!declared) {
          if (action === 'play') emit('play', item)
          return
        }
        pending.value = true
        try {
          await invoke(declared, actionInput(item))
          if (action !== 'play') notice.value = actionNames[action] + '：' + item.title
        } catch (reason) {
          error.value = reason instanceof Error ? reason.message : String(reason)
        } finally {
          pending.value = false
        }
      }
      function closeMenu(element: HTMLElement) {
        const details = element.closest('details')
        if (!details) return
        details.open = false
        details.querySelector('summary')?.focus()
      }
      return () =>
        h('div', { class: 'ceru-hc-library' }, [
          h(
            'ul',
            { 'aria-label': props.label || '歌曲列表' },
            props.items.map((item, index) => {
              const time = duration(item.durationMs ?? item.metadata?.durationMs),
                source = item.source || item.ref?.providerId,
                quality = item.metadata?.qualities?.[0]
              const menu = extraActions.filter((action) => props.actions?.[action]),
                playable =
                  item.playable !== false &&
                  !!(props.actions?.play || instance?.vnode.props?.onPlay)
              return h('li', { key: identity(item) ?? index }, [
                h('div', { class: 'ceru-hc-copy' }, [
                  playable
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: 'ceru-hc-title',
                          disabled: pending.value,
                          onClick: () => run('play', item),
                        },
                        item.title,
                      )
                    : h('strong', item.title),
                  h('small', [
                    item.metadata?.artists?.join('、') || item.subtitle,
                    source && h(SourceIcon, { source }),
                    quality && h(QualityBadge, { quality }),
                  ]),
                ]),
                time && h('span', { class: 'ceru-hc-duration' }, time),
                menu.length
                  ? h(
                      'details',
                      {
                        class: 'ceru-hc-menu',
                        onKeydown: (event: KeyboardEvent) => {
                          if (event.key === 'Escape') {
                            event.stopPropagation()
                            closeMenu(event.currentTarget as HTMLElement)
                          }
                        },
                      },
                      [
                        h('summary', { 'aria-label': item.title + '的操作' }, '更多'),
                        h(
                          'div',
                          menu.map((action) =>
                            h(
                              'button',
                              {
                                type: 'button',
                                disabled: pending.value,
                                onClick: (event: MouseEvent) => {
                                  closeMenu(event.currentTarget as HTMLElement)
                                  void run(action, item)
                                },
                              },
                              actionNames[action],
                            ),
                          ),
                        ),
                      ],
                    )
                  : null,
              ])
            }),
          ),
          error.value && h('p', { role: 'alert' }, error.value),
          notice.value && h('p', { role: 'status' }, notice.value),
        ])
    },
  })
  return Object.freeze({
    AmlLyricPlayer: createAmlLyricPlayer(region),
    LyricAdapter: createLyricAdapter(region, desktop?.LyricAdapter),
    ...createVisualComponents(region, desktop),
    SongList,
    PlaylistCard,
    PlaylistGrid,
    QualityBadge,
    SourceIcon,
    PageHeader,
    EmptyState,
    LoadingState,
  })
}
