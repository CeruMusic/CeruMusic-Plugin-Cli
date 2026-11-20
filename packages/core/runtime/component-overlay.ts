export function connectOverlay(root: ShadowRoot, overlay: HTMLElement, generation: string) {
  const host = root.host as HTMLElement
  let opener: HTMLElement | null = null
  let requested = false
  let expanded = false
  const capture = () => {
    const active = root.activeElement
    if (!requested && active instanceof HTMLElement) opener = active
  }
  const update = () => {
    const visible = Array.from(overlay.children).some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
    if (visible === requested) return
    requested = visible
    window.parent.postMessage({type:'component-overlay', generation, data:visible}, '*')
  }
  const observer = new MutationObserver(update)
  observer.observe(overlay, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class','hidden'] })
  root.addEventListener('focusin', capture)
  const response = (event: MessageEvent) => {
    const message = event.data
    if (event.source !== window.parent || message?.generation !== generation || message.type !== 'component-overlay-state') return
    if (message.data === 'dismiss') {
      overlay.dispatchEvent(new Event('ceru-overlay-dismiss'))
      return
    }
    if (typeof message.data !== 'boolean' || expanded === message.data) return
    expanded = message.data
    host.inert = expanded
    host.style.visibility = expanded ? 'hidden' : ''
    if (expanded) {
      const first = overlay.querySelector<HTMLElement>('[autofocus],button:not([disabled]),input:not([disabled]),[tabindex="0"]')
      first?.focus({ preventScroll:true })
    } else if (opener?.isConnected) opener.focus({ preventScroll:true })
  }
  window.addEventListener('message', response)
  return () => { observer.disconnect(); root.removeEventListener('focusin', capture); window.removeEventListener('message', response); host.inert = false; host.style.visibility = '' }
}
