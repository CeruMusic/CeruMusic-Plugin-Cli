import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'
import { Readable, type Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse, parseExpressionAt } from 'acorn'
import { Ajv } from 'ajv'
import type { JsonObject, JsonValue, PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import { HOST_MODULE_NAMES, PERMISSION_NAMES } from '@shiqianjiang/ceru-plugin-sdk/catalog'

export const FORMAT_VERSION = 2
export const LIMITS = {
  file: 10 * 1024 * 1024,
  header: 256 * 1024,
  delivery: 16 * 1024,
  resources: 32 * 1024 * 1024,
  nodes: 500_000,
}
const START = '/* @ceru-plugin-v2\n'
const END = '\n@end-ceru-plugin */\n'
const ID = '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const ajv = new Ajv({ strict: false, allErrors: true, ownProperties: true })
type Ast = any
export type Resource =
  | { type: 'json'; value: JsonValue }
  | { type: 'text'; value: string; mime?: string }
  | { type: 'base64'; value: string; mime: string }
export interface Proof {
  mode: 'single@1' | 'template@1' | 'delivery@1'
  algorithm: 'ed25519'
  keyId: string
  publicKey: string
  value: string
}
export interface TemplateDeclaration {
  codeDigest: string
  personalizationSchema: JsonObject
  issuerKeys: string[]
}
export interface Delivery {
  payload: JsonObject
  signature: Proof
}
export interface ArtifactHeader {
  formatVersion: 2
  syntax: 'js'
  manifest: PluginManifest
  signature: Proof | null
  template?: TemplateDeclaration
  delivery?: Delivery
}
export interface Artifact {
  header: ArtifactHeader
  body: string
  modules: Record<string, string>
  resources: Record<string, Resource>
  codeDigest: string
  templateDigest?: string
  signatureStatus: 'unsigned' | 'verified-untrusted' | 'verified-trusted'
  sourceFormat: 'exports-v2' | 'ceru-plugin-define-v2'
  migrationWarnings: string[]
}
export interface ValidationOptions {
  trustedPublicKeys?: string[]
  now?: Date
  requireUnexpiredActivation?: boolean
}

function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function plain(value: unknown): value is Record<string, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
}
function exactKeys(
  value: unknown,
  allowed: string[],
  label: string,
): asserts value is Record<string, any> {
  ensure(plain(value), label + ' must be an object')
  for (const key of Object.keys(value))
    ensure(allowed.includes(key), label + ': unknown field ' + key)
}
export function canonical(value: unknown): string {
  function visit(v: unknown, depth: number): string {
    ensure(depth <= 64, 'JSON nesting exceeds 64')
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v)
    if (typeof v === 'number') {
      ensure(Number.isFinite(v), 'JSON number must be finite')
      return JSON.stringify(v)
    }
    if (Array.isArray(v)) return '[' + v.map((x) => visit(x, depth + 1)).join(',') + ']'
    ensure(plain(v), 'Only JSON data is supported')
    const descriptors = Object.getOwnPropertyDescriptors(v)
    return (
      '{' +
      Object.keys(descriptors)
        .sort()
        .map((key) => {
          ensure(!forbidden.has(key), 'Unsafe JSON key: ' + key)
          ensure('value' in descriptors[key], 'JSON getters are forbidden')
          return JSON.stringify(key) + ':' + visit(descriptors[key].value, depth + 1)
        })
        .join(',') +
      '}'
    )
  }
  return visit(value, 0)
}
function astKey(property: Ast): string {
  ensure(
    property.type === 'Property' &&
      property.kind === 'init' &&
      !property.method &&
      !property.computed,
    'Only literal object properties are supported',
  )
  const key = property.key.type === 'Identifier' ? property.key.name : property.key.value
  ensure(typeof key === 'string' && !forbidden.has(key), 'Unsafe object key')
  return key
}
function astObject(node: Ast): Map<string, Ast> {
  ensure(node?.type === 'ObjectExpression', 'Expected literal object')
  const entries = new Map<string, Ast>()
  for (const property of node.properties) {
    const key = astKey(property)
    ensure(!entries.has(key), 'Duplicate key: ' + key)
    entries.set(key, property.value)
  }
  return entries
}
function astJson(node: Ast, depth = 0): JsonValue {
  ensure(depth <= 64, 'Resource nesting exceeds 64')
  if (node.type === 'Literal') {
    ensure(!node.regex && !node.bigint, 'Only JSON literals are supported')
    canonical(node.value)
    return node.value
  }
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'Literal' &&
    typeof node.argument.value === 'number'
  )
    return -node.argument.value
  if (node.type === 'ArrayExpression')
    return node.elements.map((x: Ast) => {
      ensure(x, 'Array holes are forbidden')
      return astJson(x, depth + 1)
    })
  const result: JsonObject = Object.create(null)
  for (const [key, child] of astObject(node)) result[key] = astJson(child, depth + 1)
  return result
}
export function parseJsonStrict(text: string): any {
  ensure(Buffer.byteLength(text) <= LIMITS.header, 'JSON document too large')
  const result = JSON.parse(text)
  const expression = parseExpressionAt(text, 0, { ecmaVersion: 2022 })
  astJson(expression)
  canonical(result)
  return result
}
const string = { type: 'string', minLength: 1, maxLength: 4096 }
const id = { type: 'string', pattern: ID }
const strings = { type: 'array', items: string, maxItems: 128, uniqueItems: true }
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})
export const MANIFEST_SCHEMA = object(
  {
    manifestVersion: { const: 2 },
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{2,127}$' },
    name: { ...string, maxLength: 120 },
    version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$',
    },
    description: string,
    author: string,
    publisher: string,
    license: string,
    homepage: string,
    config: { type: 'object', additionalProperties: true },
    engines: object(
      {
        hostApi: string,
        logicRuntime: { const: 'ceru-js@1' },
        uiSchema: string,
        libraries: object({ vue: string, react: string, 'react-dom': string }),
      },
      ['hostApi', 'logicRuntime'],
    ),
    modules: object({
      logic: object({ entry: id, activation: strings }, ['entry']),
      share: object({ entry: id, configKeys: strings, guestAdapterId: id, guestGlobals: strings }, [
        'entry',
      ]),
      surfaces: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            kind: { enum: ['schema', 'web', 'native'] },
            entry: id,
            title: { type: 'string', minLength: 1, maxLength: 100 },
            presentation: object(
              {
                kind: { enum: ['drawer', 'modal'] },
                placement: { enum: ['left', 'right', 'top', 'bottom'] },
                size: { type: 'integer', minimum: 280, maximum: 1200 },
              },
              ['kind'],
            ),
            lifecycle: object({ openAction: id, closeAction: id }),
          },
          ['id', 'kind', 'entry'],
        ),
      },
    }),
    contributes: object({
      lyricConverters: {
        type: 'array',
        maxItems: 16,
        items: object(
          {
            id,
            title: string,
            formats: {
              type: 'array',
              items: {
                enum: ['auto', 'lrc', 'enhanced-lrc', 'yrc', 'qrc', 'krc', 'ttml', 'plain'],
              },
              uniqueItems: true,
            },
          },
          ['id', 'title', 'formats'],
        ),
      },
      menus: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            title: string,
            commandId: id,
            description: string,
            slot: {
              enum: [
                'playlist.import',
                'playlist.actions',
                'track.actions',
                'player.actions',
                'search.tools',
              ],
            },
            icon: {
              oneOf: [
                object({ kind: { const: 'host' }, name: string }, ['kind', 'name']),
                object({ kind: { const: 'asset' }, resource: id }, ['kind', 'resource']),
              ],
            },
            when: object({
              kinds: { type: 'array', items: { enum: ['track', 'playlist'] } },
              loggedIn: { type: 'boolean' },
            }),
          },
          ['id', 'slot', 'title', 'commandId'],
        ),
      },
      accountItems: {
        type: 'array',
        maxItems: 16,
        items: object({ id, title: string, view: id, action: id, logoutAction: id }, ['id', 'title', 'view', 'action']),
      },
      playlistSections: {
        type: 'array',
        maxItems: 32,
        items: object(
          { id, title: string, view: id, order: { type: 'integer', minimum: -1000, maximum: 1000 } },
          ['id', 'title', 'view'],
        ),
      },
      homeSections: {
        type: 'array',
        maxItems: 32,
        items: object(
          {
            id,
            title: string,
            kind: { enum: ['playlists', 'charts', 'custom'] },
            icon: {
              oneOf: [
                object({ kind: { const: 'host' }, name: string }, ['kind', 'name']),
                object({ kind: { const: 'asset' }, resource: id }, ['kind', 'resource']),
              ],
            },
            view: id,
            providerIds: strings,
            order: { type: 'integer', minimum: -1000, maximum: 1000 },
          },
          ['id', 'title', 'kind'],
        ),
      },
      uiExtensions: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            slot: {
              enum: [
                'home.header',
                'home.content.before',
                'home.content.after',
                'search.source-selector.after',
                'playlist.header.actions',
                'playlist.item.actions',
                'player.actions',
                'settings.sections',
              ],
            },
            mode: { enum: ['append', 'prepend', 'wrap', 'replace'] },
            view: id,
            order: { type: 'integer', minimum: -1000, maximum: 1000 },
            when: object({ loggedIn: { type: 'boolean' }, route: string }),
          },
          ['id', 'slot', 'mode', 'view'],
        ),
      },
      styles: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            resource: id,
            scope: { enum: ['surface', 'slot', 'application'] },
            slots: {
              type: 'array',
              maxItems: 16,
              items: {
                enum: [
                  'home.header',
                  'home.content.before',
                  'home.content.after',
                  'search.source-selector.after',
                  'playlist.header.actions',
                  'playlist.item.actions',
                  'player.actions',
                  'settings.sections',
                ],
              },
            },
            order: { type: 'integer', minimum: -1000, maximum: 1000 },
          },
          ['id', 'resource', 'scope'],
        ),
      },
      playlistImporters: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            title: string,
            description: string,
            placeholder: string,
            providerId: id,
            examples: {
              type: 'array',
              maxItems: 16,
              items: object({ label: string, value: string }, ['label', 'value']),
            },
            instructions: strings,
          },
          ['id', 'title'],
        ),
      },
      providers: {
        type: 'array',
        maxItems: 64,
        items: object(
          {
            id,
            name: string,
            protocols: strings,
            qualities: strings,
            connectionMode: { enum: ['none', 'single', 'multiple'] },
            icon: {
              oneOf: [
                object({ kind: { const: 'host' }, name: string }, ['kind', 'name']),
                object({ kind: { const: 'asset' }, resource: id }, ['kind', 'resource']),
              ],
            },
          },
          ['id', 'name', 'protocols'],
        ),
      },
      commands: {
        type: 'array',
        maxItems: 128,
        items: object({ id, title: string, description: string, action: id, view: id }, [
          'id',
          'title',
          'action',
        ]),
      },
      sidebarItems: {
        type: 'array',
        maxItems: 64,
        items: object({ id, group: id, title: string, view: id }, ['id', 'group', 'title', 'view']),
      },
      settingsPages: {
        type: 'array',
        maxItems: 64,
        items: object({ id, title: string, view: id }, ['id', 'title', 'view']),
      },
      guestAdapters: {
        type: 'array',
        maxItems: 16,
        items: object(
          {
            id,
            format: string,
            compatibilityProfile: string,
            title: string,
            extensions: strings,
            badge: object(
              {
                label: { type: 'string', minLength: 1, maxLength: 24 },
                backgroundColor: {
                  type: 'string',
                  pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$',
                },
                textColor: {
                  type: 'string',
                  pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$',
                },
              },
              ['label', 'backgroundColor', 'textColor'],
            ),
            bootstrap: id,
            runtime: { const: 'ceru-js@1' },
            projectableProtocols: strings,
          },
          ['id', 'format', 'compatibilityProfile', 'bootstrap', 'runtime', 'projectableProtocols'],
        ),
      },
    }),
    permissions: {
      type: 'array',
      maxItems: 64,
      items: object(
        {
          key: id,
          name: { enum: PERMISSION_NAMES },
          scope: { type: 'object' },
          reason: string,
          optional: { type: 'boolean' },
          requiredFor: strings,
        },
        ['key', 'name', 'reason'],
      ),
    },
    guestPolicy: object(
      {
        maxDepth: { const: 1 },
        allowedCapabilities: strings,
        networkScopeMode: { const: 'per-guest-user-approved' },
        allowNativeCode: { const: false },
        allowRemoteCodeExecution: { const: false },
      },
      [
        'maxDepth',
        'allowedCapabilities',
        'networkScopeMode',
        'allowNativeCode',
        'allowRemoteCodeExecution',
      ],
    ),
    dataSchemas: object(
      { config: { type: 'integer', minimum: 1 }, state: { type: 'integer', minimum: 1 } },
      ['config', 'state'],
    ),
  },
  ['manifestVersion', 'id', 'name', 'version', 'engines', 'modules'],
)
const checkManifest = ajv.compile(MANIFEST_SCHEMA)
export function validateManifest(value: unknown): asserts value is PluginManifest {
  canonical(value)
  ensure(checkManifest(value), 'Invalid manifest: ' + ajv.errorsText(checkManifest.errors))
  const manifest = value as unknown as PluginManifest
  const unique = (values: string[], label: string) =>
    ensure(new Set(values).size === values.length, 'Duplicate ' + label)
  unique(manifest.permissions?.map((p) => p.key) ?? [], 'permission key')
  unique(manifest.modules.surfaces?.map((p) => p.id) ?? [], 'surface id')
  for (const menu of manifest.contributes?.menus ?? [])
    ensure(
      manifest.contributes?.commands?.some((command) => command.id === menu.commandId),
      'Unknown menu command: ' + menu.commandId,
    )
  for (const items of Object.values(manifest.contributes ?? {}))
    unique(
      items.map((p) => p.id),
      'contribution id',
    )
  const views = new Set(manifest.modules.surfaces?.map((p) => p.id))
  const actions = new Set(manifest.contributes?.commands?.map((command) => command.action))
  for (const surface of manifest.modules.surfaces ?? []) {
    if (surface.kind === 'native') {
      ensure(manifest.modules.logic, 'Native surfaces require a logic module')
      ensure(actions.has(surface.entry), 'Missing native render action: ' + surface.entry)
    }
    for (const action of Object.values(surface.lifecycle ?? {}))
      ensure(actions.has(action), 'Unknown surface lifecycle action: ' + action)
  }
  for (const account of manifest.contributes?.accountItems ?? []) {
    ensure(manifest.modules.logic, 'Account items require a logic module')
    ensure(views.has(account.view), 'Unknown account view: ' + account.view)
    ensure(actions.has(account.action), 'Unknown account summary action: ' + account.action)
    if (account.logoutAction)
      ensure(actions.has(account.logoutAction), 'Unknown account logout action: ' + account.logoutAction)
  }
  for (const section of manifest.contributes?.playlistSections ?? [])
    ensure(
      manifest.modules.surfaces?.some(surface => surface.id === section.view && surface.kind === 'native'),
      'Playlist section requires a declared native view: ' + section.view,
    )
  const share = manifest.modules.share
  if (share?.guestAdapterId)
    ensure(
      manifest.contributes?.guestAdapters?.some((adapter) => adapter.id === share.guestAdapterId),
      'Unknown share guest adapter: ' + share.guestAdapterId,
    )
  for (const name of share?.guestGlobals ?? [])
    ensure(
      /^[a-zA-Z_$][\w$]*$/.test(name) && !['globalThis', 'arguments', 'eval'].includes(name),
      'Invalid share guest global: ' + name,
    )
  for (const menu of manifest.contributes?.menus ?? [])
    ensure(
      manifest.contributes?.commands?.some((command) => command.id === menu.commandId),
      'Unknown menu command: ' + menu.commandId,
    )
  for (const items of [
    manifest.contributes?.commands,
    manifest.contributes?.sidebarItems,
    manifest.contributes?.settingsPages,
  ]) {
    for (const item of items ?? [])
      if (item.view) ensure(views.has(item.view), 'Unknown view: ' + item.view)
  }
  for (const section of manifest.contributes?.homeSections ?? []) {
    if (section.kind === 'custom')
      ensure(section.view && views.has(section.view), 'Custom home section requires a valid view')
    else ensure(!section.view, 'Built-in home sections cannot replace the Host view')
    for (const providerId of section.providerIds ?? [])
      ensure(
        manifest.contributes?.providers?.some((provider) => provider.id === providerId),
        'Unknown home section provider: ' + providerId,
      )
  }
  for (const extension of manifest.contributes?.uiExtensions ?? [])
    if (extension.mode === 'wrap')
      ensure(
        manifest.modules.surfaces?.some(
          (surface) => surface.id === extension.view && surface.kind === 'schema',
        ),
        'Wrap UI extensions require a schema view with a host-content node',
      )
    else ensure(views.has(extension.view), 'Unknown UI extension view: ' + extension.view)
  for (const style of manifest.contributes?.styles ?? []) {
    ensure(style.scope !== 'slot' || style.slots?.length, 'Slot style requires slots')
    ensure(
      style.scope !== 'application' ||
        manifest.permissions?.some((permission) => permission.name === 'ui.styles.global'),
      'Application styles require ui.styles.global',
    )
  }
  if (manifest.contributes?.guestAdapters?.length)
    ensure(manifest.guestPolicy, 'guestPolicy is required for a guest adapter')
}
export function digest(input: string | Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(input).digest('hex')
}
function publicDer(key: KeyObject): string {
  const pub = key.type === 'private' ? createPublicKey(key) : key
  ensure(pub.asymmetricKeyType === 'ed25519', 'Only Ed25519 keys are supported')
  return pub.export({ type: 'spki', format: 'der' }).toString('base64')
}
function readPublic(der: string): KeyObject {
  ensure(typeof der === 'string' && der.length < 256, 'Invalid Ed25519 public key')
  const key = createPublicKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'spki' })
  ensure(publicDer(key) === der, 'Noncanonical public key')
  return key
}
export function generateSigningKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}
function newProof(mode: Proof['mode'], key: KeyObject): Proof {
  const publicKey = publicDer(key)
  return {
    mode,
    algorithm: 'ed25519',
    keyId: digest(Buffer.from(publicKey, 'base64')),
    publicKey,
    value: '',
  }
}
function signedBytes(domain: string, value: unknown): Buffer {
  const data = Buffer.from(canonical(value))
  const length = Buffer.alloc(8)
  length.writeBigUInt64BE(BigInt(data.length))
  return Buffer.concat([Buffer.from(domain + '\0'), length, data])
}
function headerBytes(header: ArtifactHeader, codeDigest: string): Buffer {
  const { delivery: _delivery, signature, ...metadata } = header
  ensure(signature, 'Signature missing')
  return signedBytes('ceru/' + signature.mode, {
    ...metadata,
    signature: { ...signature, value: '' },
    codeDigest,
  })
}
function checkProof(proof: Proof, data: Uint8Array): void {
  exactKeys(proof, ['mode', 'algorithm', 'keyId', 'publicKey', 'value'], 'signature')
  ensure(proof.algorithm === 'ed25519', 'Unsupported signature algorithm')
  ensure(
    typeof proof.value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(proof.value),
    'Invalid signature encoding',
  )
  const key = readPublic(proof.publicKey)
  ensure(proof.keyId === digest(Buffer.from(proof.publicKey, 'base64')), 'Incorrect keyId')
  ensure(
    verify(null, data, key, Buffer.from(proof.value, 'base64')),
    'Signature verification failed',
  )
}
export function encodeHeader(header: ArtifactHeader): Buffer {
  const { manifest, ...metadata } = header
  const literal = (value: unknown) =>
    JSON.stringify(value, null, 2).replace(/^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm, '$1$2:')
  const head = Buffer.from(
    'exports.manifest = ' +
      literal(manifest) +
      ';\n' +
      'exports.package = ' +
      literal(metadata) +
      ';\n',
  )
  ensure(head.length <= LIMITS.header, 'Artifact metadata is too large')
  return head
}
export function encodeArtifact(header: ArtifactHeader, body: string): Buffer {
  const result = Buffer.concat([encodeHeader(header), Buffer.from(body)])
  ensure(result.length <= LIMITS.file, 'Artifact exceeds size limit')
  return result
}

function mergeConfig(base: JsonObject, override: JsonObject): JsonObject {
  const result: JsonObject = JSON.parse(canonical(base))
  for (const [key, value] of Object.entries(override)) {
    const current = result[key]
    result[key] =
      plain(current) && plain(value)
        ? mergeConfig(current as JsonObject, value as JsonObject)
        : (JSON.parse(canonical(value)) as JsonValue)
  }
  return result
}

/** Resolves signed delivery configuration over the defaults embedded at build time. */
export function resolveArtifactConfig(header: ArtifactHeader): JsonObject {
  const personalization = header.delivery?.payload.personalization
  const personalizationObject =
    personalization && typeof personalization === 'object' && !Array.isArray(personalization)
      ? (personalization as JsonObject)
      : undefined
  const config = personalizationObject?.['config']
  const override = plain(config) ? (config as JsonObject) : Object.create(null)
  return mergeConfig(header.manifest.config ?? Object.create(null), override)
}

/** Returns customer-facing metadata without changing plugin identity or permissions. */
export function resolveArtifactDisplay(header: ArtifactHeader): {
  name: string
  description?: string
  author?: string
} {
  const personalization = header.delivery?.payload.personalization
  const display =
    plain(personalization) && plain((personalization as JsonObject).display)
      ? ((personalization as JsonObject).display as JsonObject)
      : Object.create(null)
  return {
    name: typeof display.name === 'string' ? display.name : header.manifest.name,
    ...(typeof display.description === 'string'
      ? { description: display.description }
      : header.manifest.description
        ? { description: header.manifest.description }
        : {}),
    ...(typeof display.author === 'string'
      ? { author: display.author }
      : header.manifest.author
        ? { author: header.manifest.author }
        : {}),
  }
}

function checkPolicy(schema: unknown, depth = 0): void {
  ensure(depth <= 12, 'Personalization schema is too deep')
  exactKeys(
    schema,
    [
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'enum',
      'minLength',
      'maxLength',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
    ],
    'personalization schema',
  )
  ensure(
    ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(schema.type),
    'Schema must declare a supported type',
  )
  if (schema.type === 'object') {
    ensure(
      schema.additionalProperties === false && plain(schema.properties),
      'Schema objects must close additionalProperties and declare properties',
    )
    for (const child of Object.values(schema.properties)) checkPolicy(child, depth + 1)
  }
  if (schema.type === 'array') {
    ensure(
      Number.isInteger(schema.maxItems) && schema.maxItems <= 256,
      'Schema arrays must have maxItems <= 256',
    )
    checkPolicy(schema.items, depth + 1)
  }
  if (schema.type === 'string')
    ensure(
      Number.isInteger(schema.maxLength) && schema.maxLength <= 8192,
      'Schema strings must have maxLength <= 8192',
    )
  canonical(schema)
}
export const DEFAULT_PERSONALIZATION_SCHEMA: JsonObject = {
  type: 'object',
  properties: {
    display: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        description: { type: 'string', maxLength: 1024 },
        author: { type: 'string', maxLength: 120 },
      },
      additionalProperties: false,
    },
    config: { type: 'object', properties: {}, additionalProperties: false },
    activation: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['one-time-code', 'legacy-api-key'], maxLength: 32 },
        code: { type: 'string', minLength: 1, maxLength: 2048 },
      },
      required: ['mode', 'code'],
      additionalProperties: false,
    },
    activationExpiresAt: { type: 'string', maxLength: 40 },
  },
  additionalProperties: false,
}

function configValueSchema(value: JsonValue, depth = 0): JsonObject {
  ensure(depth <= 12, 'Plugin config is too deeply nested for personalization')
  if (value === null) return { type: 'null' }
  if (typeof value === 'string') return { type: 'string', maxLength: 8192 }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' }
  if (Array.isArray(value))
    return {
      type: 'array',
      items: configValueSchema(value[0] ?? '', depth + 1),
      maxItems: 256,
    }
  const properties: JsonObject = Object.create(null)
  for (const [key, child] of Object.entries(value))
    properties[key] = configValueSchema(child, depth + 1)
  return { type: 'object', properties, additionalProperties: false }
}

/** Creates the default delivery policy from a plugin's build-time config shape. */
export function createPersonalizationSchema(config: JsonObject = {}): JsonObject {
  const schema = JSON.parse(canonical(DEFAULT_PERSONALIZATION_SCHEMA)) as JsonObject
  ;(schema.properties as JsonObject).config = configValueSchema(config)
  return schema
}

function policyValidator(schema: JsonObject) {
  checkPolicy(schema)
  ensure(schema.type === 'object', 'Personalization root must be an object')
  for (const key of Object.keys(schema.properties as JsonObject))
    ensure(
      ['display', 'config', 'activation', 'activationExpiresAt'].includes(key),
      'Personalization cannot alter: ' + key,
    )
  return ajv.compile(schema)
}
function validatePersonalization(
  value: JsonObject,
  check: ReturnType<typeof policyValidator>,
  now: Date,
  requireUnexpired = true,
): void {
  ensure(Buffer.byteLength(canonical(value)) <= LIMITS.delivery, 'Personalization is too large')
  ensure(check(value), 'Invalid personalization: ' + ajv.errorsText(check.errors))
  if (value.activationExpiresAt !== undefined) {
    ensure(
      typeof value.activationExpiresAt === 'string' &&
        Number.isFinite(Date.parse(value.activationExpiresAt)),
      'Invalid activation expiry',
    )
    if (requireUnexpired)
      ensure(
        Date.parse(value.activationExpiresAt) > now.getTime(),
        'Activation delivery has expired',
      )
  }
}
function inspectBody(
  body: string,
  manifest: PluginManifest,
): Pick<Artifact, 'modules' | 'resources' | 'sourceFormat' | 'migrationWarnings'> {
  const tree = parse(body, { ecmaVersion: 2022, sourceType: 'script' }) as Ast
  const pending: Ast[] = [tree]
  let count = 0
  while (pending.length) {
    const node = pending.pop()
    ensure(++count <= LIMITS.nodes, 'Too many AST nodes')
    ensure(
      node.type !== 'ImportExpression',
      'External/dynamic import is not allowed in the final single-file artifact',
    )
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      ensure(
        node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string',
        'require() must use one literal Host module name',
      )
      ensure(
        (HOST_MODULE_NAMES as readonly string[]).includes(node.arguments[0].value),
        'Hand-written artifacts may require only documented Host modules: ' +
          node.arguments[0].value,
      )
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) pending.push(child)
        }
      else if (value && typeof value === 'object' && 'type' in value) pending.push(value)
    }
  }
  let registry: Map<string, Ast>
  const preamble: string[] = []
  const functions = new Map<string, Ast>()
  const bindings = new Map<string, Ast>()
  const selfContained = new Set<string>()
  const staticOrReference = (node: Ast, depth = 0): void => {
    ensure(depth <= 64, 'Static export nesting exceeds 64')
    if (node.type === 'Identifier' || node.type === 'Literal') return
    if (
      node.type === 'UnaryExpression' &&
      node.operator === '-' &&
      node.argument.type === 'Literal'
    )
      return
    if (node.type === 'ArrayExpression') {
      for (const item of node.elements) {
        ensure(item, 'Array holes are forbidden')
        staticOrReference(item, depth + 1)
      }
      return
    }
    for (const [, child] of astObject(node)) staticOrReference(child, depth + 1)
  }
  const resolveBinding = (node: Ast): Ast => {
    const seen = new Set<string>()
    while (node?.type === 'Identifier' && bindings.has(node.name)) {
      ensure(!seen.has(node.name), 'Circular top-level binding: ' + node.name)
      seen.add(node.name)
      node = bindings.get(node.name)
    }
    return node
  }
  let sourceFormat: Artifact['sourceFormat'] = 'exports-v2'
  if (
    tree.body.length === 1 &&
    tree.body[0].type === 'ExpressionStatement' &&
    tree.body[0].expression.type === 'CallExpression'
  ) {
    // Compatibility with the original v2 registration container.
    sourceFormat = 'ceru-plugin-define-v2'
    const call = tree.body[0].expression
    ensure(
      call.arguments.length === 1 &&
        call.callee.type === 'MemberExpression' &&
        !call.callee.computed &&
        !call.callee.optional &&
        call.callee.object.name === 'CeruPlugin' &&
        call.callee.property.name === 'define',
      'Expected CeruPlugin.define',
    )
    registry = astObject(call.arguments[0])
    ensure(
      registry.size === 2 && registry.has('modules') && registry.has('resources'),
      'Registration requires only modules and resources',
    )
  } else {
    const exported = new Map<string, Ast>()
    for (const statement of tree.body) {
      if (statement.type === 'FunctionDeclaration') {
        ensure(statement.id?.name && !statement.generator, 'Invalid helper function')
        functions.set(statement.id.name, statement)
        preamble.push(body.slice(statement.start, statement.end))
        continue
      }
      if (statement.type === 'VariableDeclaration') {
        for (const declaration of statement.declarations) {
          const init = declaration.init
          const isFunction =
            init && ['FunctionExpression', 'ArrowFunctionExpression'].includes(init.type)
          const isRequire =
            init?.type === 'CallExpression' &&
            init.callee?.name === 'require' &&
            init.arguments.length === 1 &&
            typeof init.arguments[0]?.value === 'string'
          const isStatic =
            init && ['Literal', 'ObjectExpression', 'ArrayExpression'].includes(init.type)
          ensure(
            isFunction || isRequire || isStatic,
            'Top-level variables must be static data, functions, or require() imports',
          )
          if (isStatic) staticOrReference(init)
          if (declaration.id.type === 'Identifier') {
            bindings.set(declaration.id.name, init)
            if (isFunction) {
              functions.set(declaration.id.name, init)
              if (body.slice(declaration.id.end, init.start).includes('@ceru-self-contained'))
                selfContained.add(declaration.id.name)
            }
          }
        }
        preamble.push(body.slice(statement.start, statement.end))
        continue
      }
      ensure(statement.type === 'ExpressionStatement', 'Invalid top-level statement')
      const expression = statement.expression
      const left = expression.left
      ensure(
        expression.type === 'AssignmentExpression' &&
          expression.operator === '=' &&
          left.type === 'MemberExpression' &&
          !left.computed &&
          left.object.name === 'exports',
        'Expected exports assignment',
      )
      const key = left.property.name
      ensure(
        ['modules', 'activate', 'surfaces', 'resources'].includes(key) && !exported.has(key),
        'Unknown or duplicate export: ' + key,
      )
      exported.set(key, expression.right)
    }
    const properties: Ast[] = []
    const addModule = (key: string, node: Ast) =>
      properties.push({
        type: 'Property',
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
        key: { type: 'Literal', value: key },
        value: node,
      })
    if (exported.has('modules'))
      for (const [key, node] of astObject(resolveBinding(exported.get('modules'))))
        addModule(key, node)
    if (exported.has('activate')) {
      ensure(manifest.modules.logic, 'activate requires modules.logic')
      addModule(manifest.modules.logic.entry, exported.get('activate'))
    }
    if (exported.has('surfaces'))
      for (const [id, node] of astObject(resolveBinding(exported.get('surfaces')))) {
        const surface = manifest.modules.surfaces?.find(
          (item) => item.id === id && item.kind === 'web',
        )
        ensure(surface, 'Unknown visible surface: ' + id)
        addModule(surface.entry, node)
      }
    registry = new Map([
      ['modules', { type: 'ObjectExpression', properties }],
      [
        'resources',
        resolveBinding(exported.get('resources')) ?? { type: 'ObjectExpression', properties: [] },
      ],
    ])
  }
  const modules: Record<string, string> = Object.create(null)
  for (const [key, exportedNode] of astObject(registry.get('modules'))) {
    const node =
      exportedNode.type === 'Identifier' ? functions.get(exportedNode.name) : exportedNode
    ensure(node, 'Export references an unknown function')
    ensure(new RegExp(ID).test(key), 'Invalid module id: ' + key)
    ensure(
      ['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(
        node.type,
      ) &&
        !node.generator &&
        node.params.length <= 1 &&
        (!node.params.length || node.params[0].type === 'Identifier'),
      'Module must be a function with one context parameter',
    )
    const generatedEntry =
      exportedNode.type === 'Identifier' && selfContained.has(exportedNode.name)
    modules[key] =
      preamble.length && !generatedEntry
        ? 'async function(ctx) {\n' +
          preamble.join('\n') +
          '\nreturn (' +
          body.slice(exportedNode.start, exportedNode.end) +
          ')(ctx);\n}'
        : body.slice(node.start, node.end)
  }
  ensure(Object.keys(modules).length <= 128, 'Too many modules')
  const resources = astJson(registry.get('resources')) as Record<string, Resource>
  ensure(plain(resources) && Object.keys(resources).length <= 512, 'Invalid resource table')
  let resourceBytes = 0
  for (const [key, resource] of Object.entries(resources)) {
    ensure(new RegExp(ID).test(key), 'Invalid resource id: ' + key)
    exactKeys(resource, ['type', 'value', 'mime'], 'resource')
    ensure(['json', 'text', 'base64'].includes(resource.type), 'Invalid resource type')
    if ('mime' in resource && resource.mime !== undefined)
      ensure(
        typeof resource.mime === 'string' && resource.mime.length <= 128,
        'Invalid resource MIME type',
      )
    if (resource.type === 'json') resourceBytes += Buffer.byteLength(canonical(resource.value))
    else {
      ensure(typeof resource.value === 'string', 'Text/binary resource must be a string')
      if (resource.type === 'base64') {
        ensure(
          /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resource.value),
          'Invalid base64 resource',
        )
        resourceBytes += Buffer.from(resource.value, 'base64').length
      } else resourceBytes += Buffer.byteLength(resource.value)
    }
  }
  ensure(resourceBytes <= LIMITS.resources, 'Decoded resources exceed limit')
  const declared = new Set<string>()
  const add = (entry: string) => {
    ensure(Object.hasOwn(modules, entry), 'Missing module: ' + entry)
    declared.add(entry)
  }
  if (manifest.modules.logic) add(manifest.modules.logic.entry)
  if (manifest.modules.share) add(manifest.modules.share.entry)
  for (const surface of manifest.modules.surfaces ?? []) {
    if (surface.kind === 'web') add(surface.entry)
    else if (surface.kind === 'native') ensure(manifest.contributes?.commands?.some(command => command.action === surface.entry), 'Missing native render action: ' + surface.entry)
    else
      ensure(resources[surface.entry]?.type === 'json', 'Missing schema resource: ' + surface.entry)
  }
  for (const adapter of manifest.contributes?.guestAdapters ?? []) add(adapter.bootstrap)
  for (const provider of manifest.contributes?.providers ?? [])
    if (provider.icon?.kind === 'asset')
      ensure(Object.hasOwn(resources, provider.icon.resource), 'Missing icon resource')
  for (const style of manifest.contributes?.styles ?? []) {
    const resource = resources[style.resource]
    ensure(resource?.type === 'text', 'Style contribution requires a text resource')
    ensure(
      !/@import\b|url\s*\(\s*(?!["']?data:)|expression\s*\(|behavior\s*:/i.test(resource.value),
      'Style contribution cannot load external resources or executable CSS',
    )
  }
  for (const entry of Object.keys(modules))
    ensure(declared.has(entry), 'Undeclared module: ' + entry)
  return {
    modules,
    resources,
    sourceFormat,
    migrationWarnings:
      sourceFormat === 'ceru-plugin-define-v2'
        ? ['This plugin uses the legacy CeruPlugin.define container; rebuild it as exports.*.']
        : [],
  }
}
function legacyCommentArtifact(text: string): ArtifactHeader | undefined {
  const comment = /^\/\*!([\s\S]*?)\*\//.exec(text)?.[1]
  if (!comment || !/@name\s+(.+)/.test(comment) || !/@version\s+(.+)/.test(comment)) return
  const value = (name: string) =>
    new RegExp('@' + name + '\\s+([^\\r\\n*]+)').exec(comment)?.[1]?.trim() ?? ''
  const name = value('name')
  const version = value('version').replace(/^v/, '')
  const id =
    value('id') ||
    'legacy.' +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
  if (!id || !/^\d+\.\d+\.\d+/.test(version)) return
  return {
    formatVersion: 2,
    syntax: 'js',
    manifest: {
      manifestVersion: 2,
      id,
      name,
      version,
      description: value('description'),
      author: value('author'),
      engines: { hostApi: '^2.0.0', logicRuntime: 'legacy-comment@1' },
      modules: {},
    },
    signature: null,
  }
}
export function readArtifact(
  input: Uint8Array | string,
  options: ValidationOptions = {},
): Artifact {
  const bytes = typeof input === 'string' ? Buffer.from(input) : input
  ensure(bytes.byteLength <= LIMITS.file, 'Artifact exceeds size limit')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  let header: ArtifactHeader
  let body: string
  if (text.startsWith(START)) {
    const end = text.indexOf(END, START.length)
    ensure(
      end > 0 && Buffer.byteLength(text.slice(0, end)) <= LIMITS.header,
      'Invalid static header boundary',
    )
    header = parseJsonStrict(text.slice(START.length, end)) as ArtifactHeader
    body = text.slice(end + END.length)
  } else {
    // Read only JSON-compatible literal metadata. Never run source to display permissions.
    let offset = 0
    function assignment(name: string): Ast | undefined {
      const match = new RegExp('^\\s*exports\\.' + name + '\\s*=\\s*').exec(text.slice(offset))
      if (!match) return undefined
      const start = offset + match[0].length
      const node = parseExpressionAt(text, start, { ecmaVersion: 2022 }) as Ast
      const tail = text.slice(node.end)
      const terminated = /^[ \t]*;[ \t]*(?:\r?\n)?/.exec(tail)
      const asi = /^[ \t]*\r?\n/.exec(tail)
      ensure(terminated || asi, 'Metadata assignments must end at a statement boundary')
      offset = node.end + (terminated ?? asi)![0].length
      ensure(
        Buffer.byteLength(text.slice(0, offset)) <= LIMITS.header,
        'Artifact metadata is too large',
      )
      return node
    }
    const manifestNode = assignment('manifest')
    if (!manifestNode) {
      const legacy = legacyCommentArtifact(text)
      ensure(
        !legacy,
        'Legacy comment-header plugins are recognized for migration metadata only; convert them to exports.manifest/exports.activate before installation.',
      )
    }
    ensure(manifestNode, 'Expected exports.manifest = { ... };')
    const manifest = astJson(manifestNode) as unknown as PluginManifest
    const packageNode = assignment('package')
    const metadata = packageNode
      ? astJson(packageNode)
      : { formatVersion: 2, syntax: 'js', signature: null }
    ensure(plain(metadata) && !Object.hasOwn(metadata, 'manifest'), 'Invalid package metadata')
    header = { ...metadata, manifest } as ArtifactHeader
    body = text.slice(offset)
  }
  exactKeys(
    header,
    ['formatVersion', 'syntax', 'manifest', 'signature', 'template', 'delivery'],
    'header',
  )
  ensure(header.formatVersion === 2 && header.syntax === 'js', 'Unsupported artifact format/syntax')
  ensure(Object.hasOwn(header, 'signature'), 'Signature field is required')
  validateManifest(header.manifest)
  const codeDigest = digest(body)
  let signatureStatus: Artifact['signatureStatus'] = 'unsigned'
  let templateDigest: string | undefined
  if (header.template) {
    exactKeys(header.template, ['codeDigest', 'personalizationSchema', 'issuerKeys'], 'template')
    ensure(header.signature?.mode === 'template@1', 'Template signature required')
    ensure(header.template.codeDigest === codeDigest, 'Core code digest mismatch')
    ensure(
      Array.isArray(header.template.issuerKeys) &&
        header.template.issuerKeys.length > 0 &&
        header.template.issuerKeys.length <= 16,
      'Invalid issuer keys',
    )
    header.template.issuerKeys.forEach(readPublic)
    const check = policyValidator(header.template.personalizationSchema)
    const message = headerBytes(header, codeDigest)
    checkProof(header.signature, message)
    templateDigest = digest(message)
    if (header.delivery) {
      exactKeys(header.delivery, ['payload', 'signature'], 'delivery')
      const { payload, signature } = header.delivery
      exactKeys(
        payload,
        ['deliveryVersion', 'templateDigest', 'deliveryId', 'issuedAt', 'personalization'],
        'delivery payload',
      )
      ensure(
        payload.deliveryVersion === 1 && payload.templateDigest === templateDigest,
        'Delivery belongs to a different template',
      )
      ensure(
        typeof payload.deliveryId === 'string' &&
          payload.deliveryId.length > 0 &&
          payload.deliveryId.length <= 128,
        'Invalid deliveryId',
      )
      ensure(
        typeof payload.issuedAt === 'string' && Number.isFinite(Date.parse(payload.issuedAt)),
        'Invalid issuedAt',
      )
      ensure(
        signature.mode === 'delivery@1' && header.template.issuerKeys.includes(signature.publicKey),
        'Unauthorized issuer',
      )
      validatePersonalization(
        payload.personalization as JsonObject,
        check,
        options.now ?? new Date(),
        options.requireUnexpiredActivation ?? false,
      )
      checkProof(
        signature,
        signedBytes('ceru/delivery@1', { payload, signature: { ...signature, value: '' } }),
      )
    }
  } else {
    ensure(!header.delivery, 'Delivery requires a signed template')
    if (header.signature) {
      ensure(header.signature.mode === 'single@1', 'Invalid signature mode')
      checkProof(header.signature, headerBytes(header, codeDigest))
    }
  }
  if (header.signature) {
    signatureStatus = 'verified-untrusted'
    if (
      options.trustedPublicKeys?.some(
        (pem) => publicDer(createPublicKey(pem)) === header.signature?.publicKey,
      )
    )
      signatureStatus = 'verified-trusted'
  }
  if (options.trustedPublicKeys?.length)
    ensure(signatureStatus === 'verified-trusted', 'Publisher is not in the supplied trust store')
  return {
    header,
    body,
    codeDigest,
    templateDigest,
    signatureStatus,
    ...inspectBody(body, header.manifest),
  }
}
export function signArtifact(input: Uint8Array, privateKey: string): Buffer {
  const artifact = readArtifact(input)
  ensure(!artifact.header.template, 'Use template issuance for a template artifact')
  const key = createPrivateKey(privateKey)
  const header = { ...artifact.header, signature: newProof('single@1', key) }
  header.signature.value = sign(null, headerBytes(header, artifact.codeDigest), key).toString(
    'base64',
  )
  return encodeArtifact(header, artifact.body)
}
export function createTemplate(
  input: Uint8Array,
  options: { privateKey: string; issuerPublicKeys: string[]; personalizationSchema?: JsonObject },
): Buffer {
  const artifact = readArtifact(input)
  ensure(!artifact.header.template, 'Input must be a normal plugin artifact')
  const key = createPrivateKey(options.privateKey)
  const policy =
    options.personalizationSchema ?? createPersonalizationSchema(artifact.header.manifest.config)
  policyValidator(policy)
  ensure(
    options.issuerPublicKeys.length > 0 && options.issuerPublicKeys.length <= 16,
    'Provide 1-16 issuer public keys',
  )
  const header: ArtifactHeader = {
    ...artifact.header,
    template: {
      codeDigest: artifact.codeDigest,
      personalizationSchema: policy,
      issuerKeys: options.issuerPublicKeys.map((pem) => publicDer(createPublicKey(pem))),
    },
    signature: newProof('template@1', key),
  }
  header.signature!.value = sign(null, headerBytes(header, artifact.codeDigest), key).toString(
    'base64',
  )
  return encodeArtifact(header, artifact.body)
}

/** Prepare once per core/key; issue() copies a file, writeTo() streams the shared core without rehashing it. */
export class PreparedIssuer {
  #header: ArtifactHeader
  #core: Buffer
  #key: KeyObject
  #check: ReturnType<typeof policyValidator>
  readonly templateDigest: string
  constructor(
    input: Uint8Array,
    options: { issuerPrivateKey: string; trustedPublicKeys?: string[] },
  ) {
    const artifact = readArtifact(input, { trustedPublicKeys: options.trustedPublicKeys })
    ensure(
      artifact.header.template && artifact.templateDigest && !artifact.header.delivery,
      'Expected a template without a delivery',
    )
    this.#header = artifact.header
    this.#core = Buffer.from(artifact.body)
    this.#key = createPrivateKey(options.issuerPrivateKey)
    ensure(
      artifact.header.template.issuerKeys.includes(publicDer(this.#key)),
      'Issuer key is not delegated by the template',
    )
    this.#check = policyValidator(artifact.header.template.personalizationSchema)
    this.templateDigest = artifact.templateDigest
  }
  #head(personalization: JsonObject, options: { deliveryId?: string; now?: Date } = {}): Buffer {
    const now = options.now ?? new Date()
    const data = JSON.parse(canonical(personalization)) as JsonObject
    validatePersonalization(data, this.#check, now)
    const payload: JsonObject = {
      deliveryVersion: 1,
      templateDigest: this.templateDigest,
      deliveryId: options.deliveryId ?? randomUUID(),
      issuedAt: now.toISOString(),
      personalization: data,
    }
    ensure(
      typeof payload.deliveryId === 'string' &&
        payload.deliveryId.length > 0 &&
        payload.deliveryId.length <= 128,
      'Invalid deliveryId',
    )
    const proof = newProof('delivery@1', this.#key)
    proof.value = sign(
      null,
      signedBytes('ceru/delivery@1', { payload, signature: { ...proof, value: '' } }),
      this.#key,
    ).toString('base64')
    const head = encodeHeader({ ...this.#header, delivery: { payload, signature: proof } })
    ensure(head.length + this.#core.length <= LIMITS.file, 'Issued file exceeds limit')
    return head
  }
  issue(personalization: JsonObject, options?: { deliveryId?: string; now?: Date }): Buffer {
    return Buffer.concat([this.#head(personalization, options), this.#core])
  }
  async writeTo(
    destination: Writable,
    personalization: JsonObject,
    options?: { deliveryId?: string; now?: Date },
  ): Promise<void> {
    const head = this.#head(personalization, options)
    await pipeline(Readable.from([head, this.#core]), destination, { end: false })
    // Caller owns end(), HTTP policy and the writable. Do not expose this stream to untrusted code.
  }
}
