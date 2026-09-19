/** Manifest order is authoritative: first is lowest, last is highest. */
export function compareQualities(
  order: readonly string[],
  a: string,
  b: string,
): -1 | 0 | 1 | undefined {
  const left = order.indexOf(a),
    right = order.indexOf(b)
  if (left < 0 || right < 0) return undefined
  return left === right ? 0 : left < right ? -1 : 1
}

export function selectQuality(
  order: readonly string[],
  available: readonly string[] = order,
  requested?: string,
): string | undefined {
  const choices = order.filter((quality) => available.includes(quality))
  if (!choices.length) return undefined
  if (!requested || !order.includes(requested)) return choices.at(-1)
  if (choices.includes(requested)) return requested
  const index = order.indexOf(requested)
  return choices.filter((quality) => order.indexOf(quality) <= index).at(-1) ?? choices[0]
}
