import * as vue from 'vue'
import * as tdesign from 'tdesign-vue-next'
import * as sdk from '@shiqianjiang/ceru-plugin-sdk/vue'
import type { ViewBridge, ViewDeps, ViewEntry } from '@shiqianjiang/ceru-plugin-sdk/view-bridge'
import { HOST_ICON_NAMES } from '@shiqianjiang/ceru-plugin-sdk/catalog'
import styles from 'tdesign-vue-next/dist/tdesign.min.css'

import { createHostComponents, type DesktopComponents } from './host-components'
import hostStyles from './host-components.css'
import amlStyles from '@applemusic-like-lyrics/core/style.css'
import { connectOverlay } from './component-overlay'
import { connectRegion } from './component-region'
import { connectRegionTransition } from './region-transition'
function freezeJson(value: any): any {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}
export const mount =
  (factory: (deps: ViewDeps) => ViewEntry, viewId: string, instanceId: string, desktopFactory?: (runtime: typeof vue) => DesktopComponents, desktopStyles = '') =>
  async (ctx: any, reportMount?: (ms: number) => void) => {
    const root: ShadowRoot = ctx.root.attachShadow({ mode: ctx.inspectComponent === true ? 'open' : 'closed' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(styles)
    const hostSheet = new CSSStyleSheet()
    hostSheet.replaceSync([hostStyles, ctx.mount?.kind === 'region' && ['player.lyrics','player.stage'].includes(ctx.mount.name) ? amlStyles : '', desktopStyles].join('\n'))
    root.adoptedStyleSheets = [sheet, hostSheet]
    document.adoptedStyleSheets = [sheet]
    const overlay = document.createElement('div')
    document.body.append(overlay)
    const stopOverlay = connectOverlay(root, overlay, instanceId)
    const state = vue.shallowRef({}),
      theme = vue.shallowRef<'light' | 'dark'>('light'),
      disposeFns = new Set<() => void>()
    const icons = Object.fromEntries(
      await Promise.all(
        HOST_ICON_NAMES.map(async (name) => [name, await ctx.icons.url(name).catch(() => '')]),
      ),
    )
    const media = matchMedia('(prefers-color-scheme: dark)')
    let hostTheme: 'dark' | 'light' | undefined = ctx.initialTheme === 'dark' || ctx.initialTheme === 'light' ? ctx.initialTheme : undefined
    const change = () => {
      theme.value = hostTheme ?? (media.matches ? 'dark' : 'light')
      document.documentElement.style.colorScheme = theme.value
      document.documentElement.setAttribute('theme-mode', theme.value)
    }
    const receiveTheme = (event: MessageEvent) => {
      const message = event.data
      if (event.source !== window.parent || message?.type !== 'component-theme' || message.generation !== instanceId) return
      if (message.data !== 'dark' && message.data !== 'light' && message.data !== null) return
      hostTheme = message.data ?? undefined
      change()
    }
    change()
    window.addEventListener('message', receiveTheme)
    media.addEventListener('change', change)
    const unsubscribe = ctx.subscribe((next: any) => {
      state.value = freezeJson(structuredClone(next ?? {}))
    })
    const playerRegion = ctx.mount?.kind === 'region' && ctx.mount.version === 1 ? connectRegion(ctx.mount.name, instanceId, ctx.mount.initial ?? ctx.mount.props, freezeJson) : undefined
    const components = createHostComponents((name) => icons[name] ?? '', ctx.invoke, playerRegion?.region, desktopFactory?.(vue))
    const bridge: ViewBridge = {
      ...(playerRegion ? {region: playerRegion.region} : {}),
      root,
      viewId,
      instanceId,
      props: freezeJson(structuredClone(ctx.mount?.props ?? {})),
      state: vue.readonly(state),
      theme: vue.readonly(theme),
      overlay,
      components,
      icons: { url: (name) => icons[name] ?? '' },
      invoke: ctx.invoke,
      close: ctx.close,
      onDispose: (cleanup) => {
        disposeFns.add(cleanup)
      },
    }
    const dispose = () => {
      playerRegion?.dispose()
      unsubscribe()
      media.removeEventListener('change', change)
      window.removeEventListener('message', receiveTheme)
      for (const fn of [...disposeFns].reverse()) {
        try {
          fn()
        } catch {}
      }
      disposeFns.clear()
      stopOverlay()
      overlay.remove()
      root.replaceChildren()
    }
    try {
      const now = performance.now.bind(performance)
      const start = now()
      const entry = await factory({ vue, tdesign: { ...tdesign, Dialog: sdk.ViewDialog as unknown as typeof tdesign.Dialog }, sdk })
      const cleanup = await entry(Object.freeze(bridge))
      if (playerRegion) disposeFns.add(connectRegionTransition(root, instanceId, entry))
      reportMount?.(now() - start)
      if (cleanup) disposeFns.add(cleanup)
      return dispose
    } catch (error) {
      dispose()
      throw error
    }
  }
