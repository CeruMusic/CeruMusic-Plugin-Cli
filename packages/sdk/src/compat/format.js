export const decodeName = (value) =>
  String(value ?? '').replace(
    /&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:39|039);/g,
    (x) =>
      ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&#39;': "'",
        '&#039;': "'",
        '&nbsp;': ' ',
      })[x],
  )
export const formatPlayTime = (seconds) => {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export const sizeFormate = (size) => {
  const value = Number(size) || 0
  return value >= 1048576 ? (value / 1048576).toFixed(2) + ' MB' : (value / 1024).toFixed(2) + ' KB'
}
export const formatPlayCount = (value) =>
  value >= 1e8
    ? (value / 1e8).toFixed(1) + '亿'
    : value >= 1e4
      ? (value / 1e4).toFixed(1) + '万'
      : String(value ?? 0)
export const dateFormat = (value) => new Date(value).toLocaleDateString('zh-CN')
export const dateFormat2 = dateFormat
export const formatNumberToChineseSimple = (value) => formatPlayCount(value)
export const formatMinutesFlexible = (seconds) => formatPlayTime(seconds)
