export function frameHealth() {
  let last, elapsed, work, count, warningMs, criticalMs, warned
  function reset() {
    const recovered = warned
    last = undefined
    elapsed = work = count = warningMs = criticalMs = 0
    warned = false
    return recovered ? 'recovered' : undefined
  }
  reset()
  return { reset, sample(time, duration) {
    if (!Number.isFinite(time) || !Number.isFinite(duration) || duration < 0) return
    if (last === undefined) { last = time; return }
    const delta = time - last
    last = time
    if (delta >= 1000 && duration < 1000) { const state = reset(); last = time; return state }
    if (delta <= 0) return
    elapsed += delta
    work += duration
    count++
    if (elapsed < 1000) return
    // RAF cadence includes compositor throttling and time when no JS runs.
    // Attribute only the measured update work to the region's frame budget.
    const average = work / count
    warningMs = average > 20 ? warningMs + elapsed : 0
    criticalMs = average > 33 ? criticalMs + elapsed : 0
    elapsed = work = count = 0
    if (criticalMs >= 10000) { reset(); return 'fallback' }
    if (warningMs >= 2000 && !warned) { warned = true; return 'warning' }
    if (!warningMs && warned) { warned = false; return 'recovered' }
  } }
}
