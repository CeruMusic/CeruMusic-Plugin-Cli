import type { PluginContext, LogicEntry } from './index.js'

export const LIFECYCLE_NAMES = ['onAppReady', 'onInstall', 'onUninstall', 'onEnable', 'onDisable', 'onUpdate', 'onOnline', 'onOffline', 'onLocaleChange', 'onBeforeQuit', 'onWindowShow', 'onWindowHide', 'onWindowFocus', 'onWindowBlur', 'onSuspend', 'onResume', 'onLock', 'onUnlock', 'onThemeChange', 'onConfigChange', 'onPermissionChange'] as const
export type LifecycleName = (typeof LIFECYCLE_NAMES)[number]
export type LifecycleArgs<Name extends LifecycleName> = Name extends 'onUpdate' ? [update: { from: string }] : Name extends 'onLocaleChange' ? [locale: string] : Name extends 'onThemeChange' ? [theme: 'light' | 'dark'] : Name extends 'onConfigChange' | 'onPermissionChange' ? [keys: string[]] : []
export type LifecycleAPI = { [Name in LifecycleName]: (handler: (...args: LifecycleArgs<Name>) => void | Promise<void>) => () => void } & {
  onIdle(milliseconds: number, handler: () => void | Promise<void>): () => void
}
export type PluginOptions = { setup: LogicEntry } & { [Name in LifecycleName]?: (ctx: PluginContext, ...args: LifecycleArgs<Name>) => void | Promise<void> } & {
  onIdle?: { milliseconds: number; handler(ctx: PluginContext): void | Promise<void> }
}
