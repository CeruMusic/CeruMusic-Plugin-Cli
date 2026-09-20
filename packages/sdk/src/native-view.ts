import { assertContentPage } from './music.js'
import type { ContentEntity, JsonValue, MaybePromise, OperationContext } from './index.js'

export interface NativeViewAction {
  label: string
  action: string
  input?: JsonValue
  primary?: boolean
}
export interface NativeViewSection {
  id: string
  title?: string
  layout: 'grid' | 'list'
  items: ContentEntity[]
  /** Receives { ref }; typically opens a native playlist page. */
  onOpen?: string
  /** Receives { ref, refs }; typically replaces the native playback queue. */
  onPlay?: string
  /** Receives the action input merged with { ref }; the Host supplies the item's ref. */
  itemActions?: NativeViewAction[]
}
/** Rendered using Host components. No plugin DOM, iframe, or framework runs in this surface. */
export interface NativeView {
  type: 'page'
  title?: string
  description?: string
  actions?: NativeViewAction[]
  sections: NativeViewSection[]
}
/** A typed render callback that can be passed directly to ctx.actions.register. */
export function defineNativeView<TInput extends JsonValue = JsonValue>(
  render: (input: TInput, operation: OperationContext) => MaybePromise<NativeView>,
): (input: TInput, operation: OperationContext) => Promise<NativeView & JsonValue> {
  return async (input, operation) => {
    const value = await render(input, operation)
    assertNativeView(value)
    return value as NativeView & JsonValue
  }
}

function assertJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (!value || typeof value !== 'object' || ancestors.has(value))
    throw new Error('Native view must contain JSON data only')
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error('Native view must contain JSON data only')
  ancestors.add(value)
  for (const item of Object.values(value)) if (item !== undefined) assertJson(item, ancestors)
  ancestors.delete(value)
}

export function assertNativeView(
  value: unknown,
  actions?: ReadonlySet<string>,
): asserts value is NativeView {
  assertJson(value)
  const v = value as NativeView
  const text = (s: unknown, max = 500) => typeof s === 'string' && s.length <= max
  const action = (s: unknown) => text(s, 128) && !!s && (!actions || actions.has(s as string))
  if (
    !v ||
    v.type !== 'page' ||
    !Array.isArray(v.sections) ||
    v.sections.length > 24 ||
    (v.title !== undefined && !text(v.title)) ||
    (v.description !== undefined && !text(v.description, 4000))
  )
    throw new Error('Invalid native view')
  const validateActions = (items: NativeViewAction[] | undefined) => {
    if (items !== undefined && (!Array.isArray(items) || items.length > 16))
      throw new Error('Invalid native actions')
    for (const item of items ?? [])
      if (
        !item ||
        !text(item.label, 100) ||
        !item.label ||
        !action(item.action) ||
        (item.primary !== undefined && typeof item.primary !== 'boolean') ||
        JSON.stringify(item.input ?? {}).length > 16384
      )
        throw new Error('Invalid native action')
  }
  validateActions(v.actions)
  const ids = new Set<string>()
  for (const section of v.sections) {
    if (
      !section ||
      !text(section.id, 128) ||
      !section.id ||
      ids.has(section.id) ||
      !['grid', 'list'].includes(section.layout) ||
      (section.title !== undefined && !text(section.title)) ||
      (section.onOpen !== undefined && !action(section.onOpen)) ||
      (section.onPlay !== undefined && !action(section.onPlay))
    )
      throw new Error('Invalid native section')
    ids.add(section.id)
    validateActions(section.itemActions)
    assertContentPage({ items: section.items })
  }
}
