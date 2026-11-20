import {createApp, defineComponent, h, inject, onMounted, onBeforeUnmount, type Component, type InjectionKey, type Ref} from 'vue'
import TDesign, {ConfigProvider, Dialog} from 'tdesign-vue-next'
import type {JsonObject,JsonValue} from '../manifest.js'
import type {ViewBridge,ViewEntry} from '../view-bridge.js'
import type { PlayerRegion, RegionContext } from '../regions.js'
export type {ViewBridge, ViewEntry, ViewDeps, RegionTransitionHook, HostComponents, HostMediaItem, HostSongAction, HostSongActions} from '../view-bridge.js'
const bridgeKey: InjectionKey<ViewBridge> = Symbol('ceru.plugin.view')
export const defineView = (setup: ViewEntry): ViewEntry => setup
export const ViewDialog = defineComponent({
  name: 'CeruViewDialog', inheritAttrs: false,
  setup(_, { attrs, slots, emit }) {
    const bridge = useView()
    const dismiss = (event: Event) => {
      if (!attrs.visible) return
      emit('close', { trigger: 'close-btn', e: event })
      emit('update:visible', false)
    }
    onMounted(() => bridge.overlay.addEventListener('ceru-overlay-dismiss', dismiss))
    onBeforeUnmount(() => bridge.overlay.removeEventListener('ceru-overlay-dismiss', dismiss))
    return () => h(Dialog as Component, { attach: () => bridge.overlay, ...attrs }, slots)
  }
})
export function mountComponent(component:Component, bridge:ViewBridge) {
  const container = bridge.root.ownerDocument.createElement('div')
  bridge.root.append(container)
  const app = createApp({render:() => h(ConfigProvider,{}, {default:() => h(component,bridge.props)})})
  app.use(TDesign)
  app.component('TDialog', ViewDialog)
  app.provide(bridgeKey,bridge)
  let mounted = false
  const dispose = () => { if (mounted) {mounted=false;app.unmount()} container.remove() }
  try { app.mount(container);mounted=true } catch(error) {dispose();throw error}
  bridge.onDispose(dispose)
  return dispose
}
export function useView():ViewBridge {
  const bridge=inject(bridgeKey)
  if (!bridge) throw Error('useView requires a mounted Ceru component view')
  return bridge
}
export function useAction<Input extends JsonValue=JsonValue,Output extends JsonValue=JsonValue>(action:string) {
  const bridge=useView()
  return (input?:Input) => bridge.invoke<Input,Output>(action,input)
}
export function useViewState<State extends JsonObject=JsonObject>() {return useView().state as Readonly<Ref<State>>}
export function useHostComponents() {return useView().components}
export function useRegion<Name extends PlayerRegion>(name: Name): RegionContext<Name> {
  const region = useView().region
  if (region?.name !== name || region.version !== 1) throw Error('Not mounted in region: ' + name)
  return region as RegionContext<Name>
}
export function useFrame(callback: (timestamp: number) => void) {
  const region = useView().region
  if (!region) throw Error('useFrame requires a mounted player region')
  const stop = region.onFrame(callback)
  onBeforeUnmount(stop)
  return stop
}
export function useSpectrum(): Readonly<Float32Array> {
  const region = useView().region
  if (!region || !('spectrum' in region.props)) throw Error('No spectrum in this region')
  return region.props.spectrum
}
