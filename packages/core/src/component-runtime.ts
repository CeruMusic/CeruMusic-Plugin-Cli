// Browser implementation is bundled from runtime/component-host.ts, with Vue,
// TDesign and SDK left external so the desktop uses its own module instances.
import type { Component, Ref } from 'vue'
import type { MountedRegion, HostIconName, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'
import type { HostComponents, ViewEntry } from '@shiqianjiang/ceru-plugin-sdk/view-bridge'
export declare const componentStyles: string
export declare function createHostComponents(
  icon: (name: HostIconName) => string,
  invoke: <I extends JsonValue = JsonValue, O extends JsonValue = JsonValue>(action: string, input?: I) => Promise<O>,
  region?: MountedRegion,
  desktop?: { LyricAdapter: Component; SpectrumCanvas: Component; PlayerArtwork: Component },
): HostComponents
export declare function bindRegionActivity(region: MountedRegion, active: Ref<boolean>): () => void
export declare function frameHealth(): {
  reset(): 'recovered' | undefined
  sample(time: number, duration: number): 'warning' | 'recovered' | 'fallback' | undefined
}
export declare function createRegionTransition(root: ShadowRoot, entry: ViewEntry): {
  run(phase: 'onEnter' | 'onLeave', reason: 'skin' | 'track'): Promise<void>
  dispose(): void
}
