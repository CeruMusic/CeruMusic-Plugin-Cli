/** Measure mounted content, not the document viewport which the Host is resizing. */
export function observeSurfaceSize(root: HTMLElement, report: (height: number) => void): () => void {
  let disposed = false
  let frame = 0
  let previous = -1
  const schedule = () => {
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (disposed) return
      const top = root.getBoundingClientRect().top
      let bottom = top
      for (const node of root.childNodes) {
        if (node instanceof HTMLElement || node instanceof SVGElement) {
          const style = getComputedStyle(node)
          if (style.display === 'none' || style.position === 'fixed') continue
          bottom = Math.max(bottom, node.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0))
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          const range = document.createRange()
          range.selectNode(node)
          bottom = Math.max(bottom, range.getBoundingClientRect().bottom)
        }
      }
      const padding = parseFloat(getComputedStyle(root).paddingBottom) || 0
      const height = Math.max(1, Math.min(16384, Math.ceil(bottom - top + padding)))
      if (height !== previous) { previous = height; report(height) }
    })
  }
  const resize = new ResizeObserver(schedule)
  const observe = () => {
    resize.disconnect()
    resize.observe(root)
    for (const child of root.children) resize.observe(child)
    schedule()
  }
  const mutations = new MutationObserver(observe)
  mutations.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })
  window.addEventListener('resize', schedule)
  void document.fonts?.ready.then(schedule)
  observe()
  return () => {
    disposed = true
    cancelAnimationFrame(frame)
    resize.disconnect()
    mutations.disconnect()
    window.removeEventListener('resize', schedule)
  }
}
