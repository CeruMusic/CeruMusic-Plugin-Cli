import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import type { LyricPlayer, LyricLine as AmlLine, LyricLineMouseEvent } from '@applemusic-like-lyrics/core'
import type { MountedRegion, RegionProps } from '@shiqianjiang/ceru-plugin-sdk'
import { isRegionActive } from './component-region.js'

export function amlLines(lines:RegionProps['player.lyrics']['lines']): AmlLine[] {
  return lines.map((line,index) => {
    const endTime = line.endTimeMs ?? line.words?.at(-1)?.endTimeMs ?? lines[index+1]?.startTimeMs ?? line.startTimeMs
    return {startTime:line.startTimeMs, endTime, translatedLyric:line.translation ?? '', romanLyric:line.romanization ?? '',
      isBG:line.isBackground === true, isDuet:line.isDuet === true,
      words:line.words?.length ? line.words.map(word => ({word:word.text, startTime:word.startTimeMs, endTime:word.endTimeMs, romanWord:word.romanization ?? ''})) :
        [{word:line.text,startTime:line.startTimeMs,endTime,romanWord:''}] }
  })
}

export function createAmlLyricPlayer(region?:MountedRegion) {
  return defineComponent({ name:'CeruAmlLyricPlayer',
    props:{alignPosition:{type:Number,default:0.34},enableBlur:{type:Boolean,default:true},enableScale:{type:Boolean,default:true},enableSpring:{type:Boolean,default:true}},
    emits:{lineClick:(milliseconds:number) => Number.isFinite(milliseconds)},
    setup(props,{emit}) {
      if (region?.name !== 'player.lyrics' && region?.name !== 'player.stage') throw Error('AmlLyricPlayer requires a lyrics or stage region')
      const source = region.props, container = ref<HTMLElement>(), player = shallowRef<LyricPlayer>()
      let stopFrame: (()=>void)|undefined, disposed = false
      const click = (event:Event) => emit('lineClick',(event as LyricLineMouseEvent).line.getLine().startTime)
      onMounted(async () => {
        const {LyricPlayer} = await import('@applemusic-like-lyrics/core')
        if (disposed || !container.value) return
        const instance = new LyricPlayer()
        container.value.append(instance.getElement())
        instance.addEventListener('line-click',click)
        player.value = instance
        let previous = performance.now()
        stopFrame = region.onFrame(time => {
          instance.setCurrentTime(source.currentTime.value)
          instance.update(Math.min(100,Math.max(0,time-previous)))
          previous = time
        })
      })
      watchEffect(() => { player.value?.setLyricLines(amlLines(source.lines)) })
      watchEffect(() => { if (source.playing.value && isRegionActive(region)) player.value?.resume(); else player.value?.pause() })
      watchEffect(() => { player.value?.setAlignPosition(props.alignPosition); player.value?.setEnableBlur(props.enableBlur); player.value?.setEnableSpring(props.enableSpring); player.value?.setEnableScale(props.enableScale) })
      onBeforeUnmount(() => { disposed = true; stopFrame?.(); player.value?.removeEventListener('line-click',click); player.value?.dispose() })
      return () => h('div',{ref:container,class:'ceru-aml-player',style:{width:'100%',height:'100%',minHeight:'0'},'aria-label':'逐字歌词'})
    }
  })
}
