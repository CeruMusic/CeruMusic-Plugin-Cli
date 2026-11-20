import { computed, defineComponent, h, type Component } from 'vue'
import type { MountedRegion } from '@shiqianjiang/ceru-plugin-sdk'
import { amlLines } from './aml-lyric-player.js'
import { isRegionActive } from './component-region.js'

export function createLyricAdapter(region?: MountedRegion, desktopAdapter?: Component) {
  return defineComponent({
    name: 'CeruLyricAdapter',
    inheritAttrs: false,
    emits: { lineClick: (milliseconds: number) => Number.isFinite(milliseconds) },
    setup(_props, { attrs, emit }) {
      if (region?.name !== 'player.lyrics' && region?.name !== 'player.stage') throw Error('LyricAdapter requires a lyrics or stage region')
      if (!desktopAdapter) throw Error('LyricAdapter is not installed by this host')
      const source = region.props
      const lines = computed(() => amlLines(source.lines))
      const click = (event: { line: { getLine(): {startTime: number} } }) => emit('lineClick', event.line.getLine().startTime)
      return () => h(desktopAdapter, { ...attrs, lyricLines: lines.value, currentTime: source.currentTime.value,
        playing: source.playing.value && isRegionActive(region), onLineClick: click, style: {'--amll-lyric-view-color': source.palette.foreground} })
    }
  })
}
