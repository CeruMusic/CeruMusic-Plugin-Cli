import { nextTick, readonly, shallowRef } from 'vue'
import type { MountedRegion, PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'
import { frameHealth } from './region-performance.mjs'

type Snapshot = Record<string, any>
const activity = new WeakMap<MountedRegion, ReturnType<typeof shallowRef<boolean>>>()
export function bindRegionActivity(region: MountedRegion, active: ReturnType<typeof shallowRef<boolean>>) {
  activity.set(region, active)
  return () => { activity.delete(region) }
}
export const isRegionActive = (region?: MountedRegion) => !region || activity.get(region)?.value !== false
export function connectRegion(name: PlayerRegion, generation: string, initial: Snapshot, freeze: (value: any) => any) {
  const currentTime = shallowRef(0), playing = shallowRef(false), locked = shallowRef(false)
  const snapshot = shallowRef<Snapshot>({})
  const viewport = () => Object.freeze({width:document.documentElement.clientWidth,height:document.documentElement.clientHeight})
  const size = shallowRef(viewport())
  const resize = new ResizeObserver(() => {
    const next = viewport()
    if (next.width !== size.value.width || next.height !== size.value.height) size.value = next
  })
  resize.observe(document.documentElement)
  const health = frameHealth()
  const notify = (type:string, data:unknown) => window.parent.postMessage({type,generation,data}, '*')
  const spectrum = new Float32Array(128)
  const frames = new Set<(timestamp: number) => void>()
  const requests = new Map<number, { resolve(): void; reject(error: Error): void; timer: number }>()
  let baseline = 0, started = 0, frame = 0, sequence = 0, closed = false
  let hostActive = initial.active !== false
  let ticking = false
  const active = shallowRef(hostActive && !document.hidden)
  const tick = async (time: number) => {
    frame = 0
    if (closed || document.hidden || !hostActive) return
    ticking = true
    const began = performance.now()
    if (playing.value) currentTime.value = Math.min(snapshot.value.durationMs || Infinity, baseline + Math.max(0, time - started))
    try {
      for (const callback of frames) callback(time)
      await nextTick()
      // Read after Vue's batched writes, once per frame, to include layout work.
      document.documentElement.getBoundingClientRect()
    } catch { ticking = false; notify('failed',{message:'区域动画执行失败'}); return }
    if (closed || document.hidden || !hostActive) { ticking = false; return }
    if (name !== 'desktopLyric') {
      const status = health.sample(time, performance.now() - began)
      if (status) notify('region-health',status)
      if (status === 'fallback') { ticking = false; return }
    }
    ticking = false
    schedule()
  }
  const schedule = () => {
    if (!closed && !ticking && !frame && !document.hidden && hostActive && (playing.value || frames.size)) frame = requestAnimationFrame(tick)
    if (!playing.value && !frames.size && health.reset()) notify('region-health','recovered')
  }
  const visibility = () => {
    active.value = hostActive && !document.hidden
    if (document.hidden || !hostActive) { cancelAnimationFrame(frame); frame = 0; if (health.reset()) notify('region-health','recovered') } else schedule()
  }
  const update = (data: Snapshot) => {
    if (typeof data?.positionMs !== 'number' || !Number.isFinite(data.positionMs) || data.positionMs < 0 || typeof data.playing !== 'boolean') return
    baseline = data.positionMs; started = performance.now(); currentTime.value = baseline; playing.value = data.playing
    if (data.content && typeof data.content === 'object') {
      snapshot.value = freeze(data.content)
      locked.value = data.content.locked === true
    }
    schedule()
  }
  const receive = (event: MessageEvent) => {
    const message = event.data
    if (event.source !== window.parent || message?.generation !== generation) return
    if (message.type === 'region-active' && typeof message.data === 'boolean') { hostActive = message.data; visibility(); return }
    if (message.type === 'region-update') update(message.data)
    if (message.type === 'region-spectrum' && message.data instanceof Float32Array && message.data.length === spectrum.length) spectrum.set(message.data)
    if (message.type !== 'region-seek-result') return
    const pending = requests.get(message.data?.id)
    if (!pending) return
    clearTimeout(pending.timer); requests.delete(message.data.id)
    if (message.data.ok === true) pending.resolve(); else pending.reject(Error('Player seek was not applied'))
  }
  function seek(milliseconds: number): Promise<void> {
    if (closed || !Number.isFinite(milliseconds) || milliseconds < 0 || requests.size >= 4) return Promise.reject(Error('Invalid region seek'))
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { requests.delete(id); reject(Error('Player seek timed out')) }, 5000)
      requests.set(id, { resolve, reject, timer })
      window.parent.postMessage({ type: 'region-seek', generation, data: { id, milliseconds } }, '*')
    })
  }
  const common = {
    currentTime: readonly(currentTime), playing: readonly(playing),
    get track() { return snapshot.value.track ?? null }, get layout() { return snapshot.value.layout ?? 'cover' },
    get palette() { return snapshot.value.palette ?? defaults }, get forward() { return snapshot.value.forward ?? empty },
  }
  const defaults = Object.freeze({ accent: '#47867a', foreground: '#232323', background: '#f7f7f7' }), empty = Object.freeze({}), noLines = Object.freeze([])
  const lyrics = name === 'player.lyrics' || name === 'player.stage'
  const props = Object.create(null)
  const include = (fields: object) => Object.defineProperties(props, Object.getOwnPropertyDescriptors(fields))
  include(common)
  if (lyrics) include({ get lines() { return snapshot.value.lines ?? noLines } })
  if (['player.artwork','player.background','player.stage'].includes(name)) include({ get artwork() { return snapshot.value.artwork ?? null } })
  if (['player.visualizer','player.background','player.stage'].includes(name)) include({ spectrum })
  if (name === 'desktopLyric') include({ locked: readonly(locked), get current() { return snapshot.value.current ?? null }, get next() { return snapshot.value.next ?? null } })
  const region = Object.freeze({ name, version: 1, size:readonly(size), props: Object.freeze(props), get settings() { return snapshot.value.settings ?? empty },
    actions: lyrics ? Object.freeze({ seek }) : empty,
    onFrame(callback: (timestamp: number) => void) {
      if (closed) throw Error('Region is closed')
      frames.add(callback); schedule(); return () => { frames.delete(callback) }
    },
  }) as MountedRegion
  activity.set(region, active)
  update(initial)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('message', receive)
  return { region, dispose() {
    active.value = false
    closed = true; cancelAnimationFrame(frame); frames.clear(); resize.disconnect()
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('message', receive)
    for (const pending of requests.values()) { clearTimeout(pending.timer); pending.reject(Error('Region closed')) }
    requests.clear()
  } }
}
