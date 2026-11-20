import type { ViewEntry } from '@shiqianjiang/ceru-plugin-sdk/view-bridge'

export function createRegionTransition(root: ShadowRoot, entry: ViewEntry) {
  let active: AbortController | undefined
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const stop = () => active?.abort()
  async function run(phase: 'onEnter' | 'onLeave', reason: 'skin' | 'track') {
    stop()
    if (motion.matches || document.hidden) return
    const controller = new AbortController()
    active = controller
    const timer = setTimeout(() => controller.abort(), 600)
    const hook = entry[phase]
    let fade: Animation | undefined
    const cancelled = new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }))
    try {
      const work = typeof hook === 'function'
        ? hook({ root, signal: controller.signal, reason })
        : (fade = root.host.animate(phase === 'onEnter' ? [{opacity:0},{opacity:1}] : [{opacity:1},{opacity:0}], {duration:140,easing:'ease-out',fill:'forwards'})).finished
      await Promise.race([work, cancelled])
    } finally {
      clearTimeout(timer)
      fade?.cancel()
      controller.abort()
      if (active === controller) active = undefined
    }
  }
  motion.addEventListener('change', stop)
  return { run, dispose() { motion.removeEventListener('change', stop); stop() } }
}
export function connectRegionTransition(root: ShadowRoot, generation: string, entry: ViewEntry) {
  const transition = createRegionTransition(root, entry)
  const receive = (event: MessageEvent) => {
    const message = event.data, data = message?.data
    if (event.source !== window.parent || message?.generation !== generation || message.type !== 'region-transition' ||
      !Number.isSafeInteger(data?.id) || !['onEnter','onLeave'].includes(data.phase) || !['skin','track'].includes(data.reason)) return
    const done = () => window.parent.postMessage({type:'region-transition-done',generation,data:{id:data.id}}, '*')
    void transition.run(data.phase,data.reason).then(done,done)
  }
  window.addEventListener('message', receive)
  return () => { window.removeEventListener('message', receive); transition.dispose() }
}
