export type FrameHealthStatus = 'warning' | 'recovered' | 'fallback'
export function frameHealth(): {
  reset(): 'recovered' | undefined
  sample(time: number, duration: number): FrameHealthStatus | undefined
}
