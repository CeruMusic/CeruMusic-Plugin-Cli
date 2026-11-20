import type { PlayerRegion, RegionContext } from '../regions.js'
import type { HostComponents } from '../view-contracts.js'
import * as shared from './index.js'

export type { HostComponents, RegionTransitionHook } from '../view-contracts.js'
export const useRegion: <Name extends PlayerRegion>(name: Name) => RegionContext<Name> = shared.useRegion
export const useHostComponents: () => HostComponents = shared.useHostComponents
export const useFrame: (callback: (timestamp: number) => void) => void = shared.useFrame
export const useSpectrum: () => Readonly<Float32Array> = shared.useSpectrum
