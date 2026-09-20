import { assertNativeView, SurfaceSession } from './core-contracts.js'

/** Preview Host components, rendered in the Host DOM; plugin code remains in the logic sandbox. */
export class NativeSurfacePreview {
  constructor(container, session, actions, onError = () => {}) {
    this.container = container
    this.session = session
    this.actions = actions
    this.onError = onError
    this.closed = false
    this.revision = 0
    this.container.classList.add('native-preview')
  }

  async open() {
    try {
      await this.session.open()
      if (!this.closed) await this.refresh()
    } catch (error) { this.fail(error) }
  }

  refresh() {
    if (this.closed) return Promise.resolve()
    this.revision++
    if (this.rendering) return this.rendering
    this.rendering = (async () => {
      let rendered
      do {
        rendered = this.revision
        const view = await this.session.invoke(this.session.surface.entry, {})
        if (this.closed) return
        assertNativeView(view, this.actions)
        if (rendered === this.revision) this.render(view)
      } while (!this.closed && rendered !== this.revision)
    })().catch(error => this.fail(error)).finally(() => { this.rendering = undefined })
    return this.rendering
  }

  dispose() {
    this.closed = true
    this.container.classList.remove('native-preview')
  }

  fail(error) {
    if (this.closed) return
    this.container.replaceChildren(this.element('p', error.message, 'error'))
    this.onError(error)
  }

  element(tag, text, className) {
    const element = this.container.ownerDocument.createElement(tag)
    if (text !== undefined) element.textContent = text
    if (className) element.className = className
    return element
  }

  button(label, action, input, primary = false) {
    const button = this.element('button', label, primary ? 'primary' : '')
    button.type = 'button'
    button.onclick = async () => {
      button.disabled = true
      try {
        await this.session.invoke(action, input)
        if (!this.closed) await this.refresh()
      } catch (error) { if (!this.closed) this.onError(error) }
      finally { button.disabled = false }
    }
    return button
  }

  render(view) {
    const page = this.element('div', undefined, 'native-page')
    if (view.title) page.append(this.element('h2', view.title))
    if (view.description) page.append(this.element('p', view.description, 'hint'))
    const toolbar = this.element('div', undefined, 'native-actions')
    for (const action of view.actions ?? [])
      toolbar.append(this.button(action.label, action.action, action.input ?? {}, action.primary))
    page.append(toolbar)
    for (const section of view.sections) {
      const group = this.element('div', undefined, 'native-section')
      group.dataset.section = section.id
      if (section.title) group.append(this.element('h3', section.title))
      const items = this.element('div', undefined, 'native-' + section.layout)
      const refs = section.items.map(item => item.ref)
      for (const item of section.items) {
        const card = this.element('div', undefined, 'native-item')
        const content = this.element('div', undefined, 'native-item-content')
        const artwork = item.playlist?.artworkUrl ?? item.metadata?.artworkUrl ?? item.chart?.artworkUrl
        if (typeof artwork === 'string' && /^(https?:\/\/|data:image\/)/i.test(artwork)) {
          const image = this.element('img', '', 'native-artwork')
          image.src = artwork
          image.alt = ''
          image.loading = 'lazy'
          image.referrerPolicy = 'no-referrer'
          content.append(image)
        }
        const details = this.element('div', undefined, 'native-item-details')
        const title = section.onOpen
          ? this.button(item.title, section.onOpen, { ref: item.ref })
          : this.element('strong', item.title)
        title.classList.add('native-item-title')
        details.append(title)
        const subtitle = item.subtitle ?? item.playlist?.description ?? item.metadata?.artists.join(' / ')
        if (subtitle) details.append(this.element('p', subtitle, 'hint'))
        if (item.playlist?.trackCount !== undefined)
          details.append(this.element('small', item.playlist.trackCount + ' 首', 'hint'))
        content.append(details)
        card.append(content)
        const buttons = this.element('div', undefined, 'native-actions')
        if (section.onPlay) buttons.append(this.button('播放', section.onPlay, { ref: item.ref, refs }))
        for (const action of section.itemActions ?? []) {
          const input = action.input && typeof action.input === 'object' && !Array.isArray(action.input)
            ? action.input : {}
          buttons.append(this.button(action.label, action.action, { ...input, ref: item.ref }, action.primary))
        }
        card.append(buttons)
        items.append(card)
      }
      if (!section.items.length) items.append(this.element('p', '暂无内容', 'empty'))
      group.append(items)
      page.append(group)
    }
    this.container.replaceChildren(page)
  }
}

/** Existing Host playlist page, with native plugin sections following local/cloud lists. */
export class PlaylistPagePreview {
  constructor(container, manifest, dispatch, onError = () => {}) {
    this.container = container
    this.manifest = manifest
    this.dispatch = dispatch
    this.onError = onError
    this.previews = new Map()
    this.closed = false
  }

  async open(sectionId) {
    const doc = this.container.ownerDocument
    const page = doc.createElement('div')
    page.className = 'host-playlist-page'
    const heading = doc.createElement('h2')
    heading.textContent = '歌单'
    page.append(heading)
    for (const title of ['本地歌单', '云歌单']) {
      const section = doc.createElement('section')
      const label = doc.createElement('h3')
      label.textContent = title
      const empty = doc.createElement('p')
      empty.className = 'hint'
      empty.textContent = '独立开发 Host 暂无' + title
      section.append(label, empty)
      page.append(section)
    }
    const actions = new Set(this.manifest.contributes?.commands?.map(command => command.action))
    const openings = []
    let selected
    for (const contribution of [...(this.manifest.contributes?.playlistSections ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const surface = this.manifest.modules.surfaces?.find(surface => surface.id === contribution.view)
      if (surface?.kind !== 'native') throw new Error('Playlist section requires a native view')
      const section = doc.createElement('section')
      section.dataset.playlistSection = contribution.id
      const title = doc.createElement('h3')
      title.textContent = contribution.title
      const content = doc.createElement('div')
      section.append(title, content)
      page.append(section)
      const session = new SurfaceSession(surface, this.manifest, this.dispatch)
      const preview = new NativeSurfacePreview(content, session, actions, this.onError)
      this.previews.set(contribution.id, { surfaceId: surface.id, preview })
      openings.push(preview.open())
      if (contribution.id === sectionId) {
        selected = section
        section.classList.add('is-target')
      }
    }
    this.container.replaceChildren(page)
    await Promise.all(openings)
    if (!this.closed) selected?.scrollIntoView({ block: 'start' })
  }

  async refresh(surfaceId) {
    if (this.closed) return
    await Promise.all([...this.previews.values()]
      .filter(item => item.surfaceId === surfaceId)
      .map(item => item.preview.refresh()))
  }

  async close() {
    if (this.closed) return
    this.closed = true
    const items = [...this.previews.values()]
    this.previews.clear()
    for (const { preview } of items) preview.dispose()
    await Promise.all(items.map(({ preview }) => preview.session.close()))
  }
}
