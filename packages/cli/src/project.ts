import {
  readFile,
  realpath,
  mkdir,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute, sep, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import ts from 'typescript'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { isBuiltin } from 'node:module'
import { stylesheetPlugin, vuePlugin, webDistEntry } from './frameworks.js'
import {buildComponent, type WatchComponentCache} from './component.js'
import { hostModulesPlugin, assertBundledDependencies } from './dependencies.js'
import {
  canonical,
  encodeArtifact,
  parseJsonStrict,
  readArtifact,
  validateManifest,
  LIMITS,
  type ArtifactHeader,
  type Resource,
} from '@shiqianjiang/ceru-plugin-issuer'
import type { JsonObject, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

export interface BuildConfig {
  manifest: ArtifactHeader['manifest']
  config?: JsonObject
  entries: Record<string, string>
  resources?: Record<string, { path: string; type: 'json' | 'text' | 'base64'; mime?: string }>
  output?: string
  framework?: 'vanilla' | 'vue' | 'react'
  /** @deprecated Accepted to migrate 0.1.0 projects; frameworks are now always bundled. */
  sharedLibraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>
  webDist?: Record<string, string>
}

async function resolveConfigValue(
  root: string,
  value: unknown,
  stack = new Set<string>(),
  depth = 0,
): Promise<JsonValue> {
  if (depth > 32) throw new Error('Plugin config references are too deeply nested')
  if (typeof value === 'string') {
    if (value.startsWith('@@')) return value.slice(1)
    if (!value.startsWith('@')) return value
    const request = value.slice(1)
    if (!request) throw new Error('Plugin config reference cannot be empty')
    const path = await inside(root, request)
    if (stack.has(path)) throw new Error('Circular plugin config reference: ' + request)
    stack.add(path)
    try {
      const extension = extname(path).toLowerCase()
      let loaded: unknown
      if (extension === '.json') {
        loaded = parseJsonStrict(await readFile(path, 'utf8'))
      } else if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(extension)) {
        const result = await build({
          absWorkingDir: root,
          entryPoints: [path],
          bundle: true,
          write: false,
          format: 'esm',
          platform: 'node',
          target: 'node22',
          logLevel: 'silent',
        })
        if (result.outputFiles.length !== 1)
          throw new Error('Config module emitted sidecar files: ' + request)
        const url =
          'data:text/javascript;base64,' +
          Buffer.from(result.outputFiles[0].text).toString('base64') +
          '#' +
          randomUUID()
        const module = await import(url)
        if (!Object.hasOwn(module, 'default'))
          throw new Error('Config module must export default: ' + request)
        loaded = module.default
      } else {
        throw new Error('Config reference must be JSON, JS or TS: ' + request)
      }
      return resolveConfigValue(root, loaded, stack, depth + 1)
    } finally {
      stack.delete(path)
    }
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (Array.isArray(value))
    return Promise.all(value.map((item) => resolveConfigValue(root, item, stack, depth + 1)))
  if (value && typeof value === 'object') {
    const result: JsonObject = Object.create(null)
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('Unsafe plugin config key: ' + key)
      result[key] = await resolveConfigValue(root, child, stack, depth + 1)
    }
    return result
  }
  throw new Error('Plugin config must contain only JSON-compatible values')
}

function validatePluginConfig(value: unknown): JsonObject | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Plugin config root must resolve to an object')
  return parseJsonStrict(canonical(value)) as JsonObject
}

function configType(value: JsonValue, depth = 0): string {
  if (depth > 24) return 'JsonValue'
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) {
    const members = [...new Set(value.map((item) => configType(item, depth + 1)))]
    return 'readonly (' + (members.join(' | ') || 'JsonValue') + ')[]'
  }
  const fields = Object.entries(value).map(
    ([key, child]) => 'readonly ' + JSON.stringify(key) + ': ' + configType(child, depth + 1) + ';',
  )
  return '{ ' + fields.join(' ') + ' }'
}

async function writeConfigTypes(root: string, config: JsonObject): Promise<string> {
  const path = resolve(root, '.ceru-dev/types/plugin-config.d.ts')
  const source =
    "declare module '@ceru/plugin-config' {\n" +
    "  type JsonValue = import('@shiqianjiang/ceru-plugin-sdk').JsonValue\n" +
    '  export type PluginConfig = ' +
    configType(config) +
    '\n  const config: PluginConfig\n  export default config\n}\n'
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, source)
  return path
}

function entryFunctionName(id: string, suffix: 'Logic' | 'Surface' | 'Module'): string {
  const words = id.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  const base = name || 'Plugin'
  const safe = /^[A-Za-z_$]/.test(base) ? base : 'Plugin' + base
  return safe.startsWith(suffix) || safe.endsWith(suffix) ? safe : safe + suffix
}

export async function writeAtomic(
  path: string,
  data: string | Uint8Array,
  overwrite = false,
  mode = 0o644,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  if (!overwrite) {
    // Exclusive creation avoids overwriting user files, including a symlink target.
    await writeFile(path, data, { flag: 'wx', mode })
    return
  }
  const tmp = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(tmp, data, { flag: 'wx', mode })
    await rename(tmp, path)
  } finally {
    await unlink(tmp).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e
    })
  }
}
async function inside(root: string, path: string): Promise<string> {
  if (isAbsolute(path)) throw new Error('Project input must be relative: ' + path)
  const realRoot = await realpath(root)
  const target = await realpath(resolve(root, path))
  const rel = relative(realRoot, target)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Input escapes project root: ' + path)
  return target
}
function resolveAuthorEntries(raw: Record<string, any>) {
  if (!raw.manifest?.entry || raw.manifest.manifestVersion !== 3) return
  raw.entries ??= {}
  if (!raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries))
    throw new Error('entries must be an object')
  const mapModule = (declaration: any, fallback: string) => {
    const file = declaration?.module
    if (
      typeof file !== 'string' ||
      Object.hasOwn(raw.entries, file) ||
      Object.hasOwn(raw.webDist ?? {}, file)
    )
      return
    if (!/\.(?:[cm]?[jt]sx?|vue)$/.test(file)) return
    const existing = Object.keys(raw.entries).find((key) => raw.entries[key] === file)
    if (existing) {
      declaration.module = existing
      return
    }
    if (Object.hasOwn(raw.entries, fallback) || Object.hasOwn(raw.webDist ?? {}, fallback))
      throw new Error('Conflicting module id: ' + fallback)
    raw.entries[fallback] = file
    declaration.module = fallback
  }
  const entry = raw.manifest.entry
  mapModule(entry.logic, 'logic.main')
  mapModule(entry.share, 'share.main')
  mapModule(entry.server, 'server.main')
  if (Array.isArray(entry.views))
    for (const view of entry.views)
      if (view?.kind === 'web' || view?.kind === 'component') mapModule(view, 'view.' + view.id)
}

export async function loadProject(project: string): Promise<{ root: string; config: BuildConfig }> {
  const root = await realpath(resolve(project))
  const source = parseJsonStrict(await readFile(resolve(root, 'ceru.plugin.json'), 'utf8'))
  const expanded = await resolveConfigValue(root, source)
  if (!expanded || typeof expanded !== 'object' || Array.isArray(expanded))
    throw new Error('ceru.plugin.json must resolve to an object')
  const raw = expanded as Record<string, any>
  for (const key of Object.keys(raw))
    if (
      ![
        '$schema',
        'manifest',
        'config',
        'entries',
        'resources',
        'output',
        'framework',
        'sharedLibraries',
        'webDist',
      ].includes(key)
    )
      throw new Error('Unknown build config key: ' + key)
  // Older scaffolds declared Host-provided Vue/React. Always migrate their output
  // to standalone bundles, without requiring authors to rewrite their source.
  if (raw.manifest?.engines) delete raw.manifest.engines.libraries
  if (raw.config !== undefined && raw.manifest?.config !== undefined)
    throw new Error('Define config either at the project root or manifest.config, not both')
  raw.config = validatePluginConfig(raw.config ?? raw.manifest?.config)
  if (raw.config !== undefined) raw.manifest.config = raw.config
  if (raw.framework && !['vanilla', 'vue', 'react'].includes(raw.framework))
    throw new Error('Unsupported framework')
  resolveAuthorEntries(raw)
  validateManifest(raw.manifest)
  if (!raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries))
    throw new Error('entries must map module IDs to source paths')
  if (Object.keys(raw.entries).length > 128) throw new Error('Too many entry points')
  for (const [id, path] of Object.entries(raw.entries)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || typeof path !== 'string')
      throw new Error('Invalid module entry: ' + id)
  }
  return { root, config: raw as unknown as BuildConfig }
}
function checkTypes(root: string, extraFiles: string[] = []): ts.Program {
  const path = resolve(root, 'tsconfig.json')
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
  const program = ts.createProgram([...new Set([...config.fileNames, ...extraFiles])], {
    ...config.options,
    noEmit: true,
  })
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)]
  if (diagnostics.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      }),
    )
  }
  return program
}
async function projectProgram(root:string,config:BuildConfig,watchVueTypes?:(root:string,declarations:string)=>ts.Program):Promise<ts.Program> {
  const configTypes=await writeConfigTypes(root,config.config??{})
  if (config.framework === 'vue' && !watchVueTypes) {
    const executable = createRequire(import.meta.url).resolve('vue-tsc/bin/vue-tsc.js')
    const result = spawnSync(
      process.execPath,
      [executable, '--noEmit', '--pretty', 'false', '-p', resolve(root, 'tsconfig.json')],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    )
    if (result.status !== 0) throw new Error(result.stdout + result.stderr)
  }
  return config.framework === 'vue' && watchVueTypes ? watchVueTypes(root, configTypes) : checkTypes(root, [configTypes])
}
export async function typecheckProject(project='.') {
  const {root,config}=await loadProject(project)
  await projectProgram(root,config)
}
export async function buildProject(
  project = '.',
  options: { out?: string; overwrite?: boolean; development?: boolean } = {},
  watchVueTypes?: (root: string, declarations: string) => ts.Program,
  isCurrent: () => boolean = () => true,
  componentCache?: WatchComponentCache,
): Promise<{ path: string; bytes: number; devModules: Record<string, string> }> {
  const { root, config } = await loadProject(project)
  const program = await projectProgram(root,config,watchVueTypes)
  const checker = program.getTypeChecker()
  const chunks = new Map<string, string>()
  const chunkNames = new Map<string, string>()
  const usedNames = new Set<string>()
  const uniqueEntryName = (id: string, suffix: 'Logic' | 'Surface' | 'Module') => {
    const base = entryFunctionName(id, suffix)
    let name = base
    let counter = 2
    while (usedNames.has(name)) name = base + counter++
    usedNames.add(name)
    chunkNames.set(id, name)
    return name
  }
  const devModules: Record<string, string> = {}
  const surfaceEntries = new Set(
    (config.manifest.entry.views ?? [])
      .filter((surface) => surface.kind === 'web')
      .map((surface) => surface.module),
  )
  const plugins = [hostModulesPlugin(), vuePlugin(root, config.framework), stylesheetPlugin()]
  const defines = {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  }
  for (const [id, file] of Object.entries(config.entries)) {
    const entry = await inside(root, file)
    const nodeServer = config.manifest.entry.server?.runtime === 'node' && config.manifest.entry.server.module === id
    if (config.manifest.entry.views?.some(view => view.kind === 'component' && view.module === id)) {
      const factory = await buildComponent(root,entry,uniqueEntryName(id,'Surface'),defines,componentCache)
      chunks.set(id,factory)
      if(options.development) devModules[id]='export default '+factory
      continue
    }
    const sourceFile = program.getSourceFile(entry)
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile)
    const defaultExport =
      moduleSymbol &&
      checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === 'default')
    if (
      !sourceFile ||
      !defaultExport ||
      !checker.getSignaturesOfType(
        checker.getTypeOfSymbolAtLocation(defaultExport, sourceFile),
        ts.SignatureKind.Call,
      ).length
    ) {
      throw new Error('Entry must be included in tsconfig and default-export a function: ' + file)
    }
    const buildEntry = (optional = new Set<string>()) => build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: '__ceru_entry',
      platform: config.manifest.entry.server?.runtime === 'node' && config.manifest.entry.server.module === id ? 'node' : 'browser',
      target: 'es2022',
      charset: 'utf8',
      minify: false,
      sourcemap: false,
      splitting: false,
      metafile: true,
      logLevel: 'silent',
      tsconfig: resolve(root, 'tsconfig.json'),
      outfile: 'entry.js',
      legalComments: 'inline',
      plugins: [...plugins, {
        name: 'ceru-optional-node-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => optional.has(args.path)
            ? { path: args.path, namespace: 'ceru-missing-optional' } : undefined)
          builder.onLoad({ filter: /.*/, namespace: 'ceru-missing-optional' }, args => ({
            contents: 'const error = new Error(' + JSON.stringify('Cannot find module ' + args.path) + '); error.code = "MODULE_NOT_FOUND"; throw error;',
            loader: 'js',
          }))
        },
      }],
      define: defines,
      loader: {
        '.svg': 'dataurl',
        '.css': 'text',
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.webp': 'dataurl',
        '.woff2': 'dataurl',
      },
    })
    let result = await buildEntry()
    // esbuild only tolerates unresolved require() inside try/catch. Bundle a
    // throwing module for those absent optional dependencies (e.g. Express's
    // debug -> supports-color), preserving the catch without external files.
    // Missing required dependencies already failed the first build.
    if (nodeServer) {
      const optional = new Set(Object.values(result.metafile.outputs).flatMap(info =>
        info.imports.filter(item => item.external && item.kind === 'require-call' && !isBuiltin(item.path)).map(item => item.path)))
      if (optional.size) result = await buildEntry(optional)
    }
    if (result.outputFiles.length !== 1) throw new Error('Entry emitted sidecar files: ' + id)
    for (const info of Object.values(result.metafile.outputs))
      if (info.imports.some(item => !(config.manifest.entry.server?.runtime === 'node' && config.manifest.entry.server.module === id && item.external && isBuiltin(item.path))))
        throw new Error('Unbundled import in ' + id)
    const source = result.outputFiles[0].text.replace(
      /(^|\n)var __ceru_entry =/,
      '$1const __ceru_entry =',
    )
    if (!(config.manifest.entry.server?.runtime === 'node' && config.manifest.entry.server.module === id))
      assertBundledDependencies(source)
    const entryName = uniqueEntryName(
      id,
      id === config.manifest.entry.logic?.module
        ? 'Logic'
        : surfaceEntries.has(id)
          ? 'Surface'
          : 'Module',
    )
    chunks.set(
      id,
      'async function ' +
        entryName +
        '(ctx) {\n' +
        source +
        '\nif (typeof __ceru_entry.default !== "function") throw new Error("Entry must default-export a function");\nreturn __ceru_entry.default(ctx);\n}',
    )
    if (options.development) {
      const debug = await build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        globalName: '__ceru_entry',
        platform: config.manifest.entry.server?.runtime === 'node' && config.manifest.entry.server.module === id ? 'node' : 'browser',
        target: 'es2022',
        charset: 'utf8',
        sourcemap: 'inline',
        sourcesContent: true,
        sourceRoot: 'ceru:///',
        logLevel: 'silent',
        tsconfig: resolve(root, 'tsconfig.json'),
        outfile: 'entry.js',
        plugins,
        define: defines,
        banner: { js: 'globalThis.__ceruStart(async function(ctx) {' },
        footer: { js: 'return __ceru_entry.default(ctx); });' },
        loader: {
          '.svg': 'dataurl',
          '.css': 'text',
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.webp': 'dataurl',
          '.woff2': 'dataurl',
        },
      })
      devModules[id] = debug.outputFiles[0].text
    }
  }
  for (const [id, dir] of Object.entries(config.webDist ?? {})) {
    if (config.entries[id]) throw new Error('Duplicate source/webDist entry: ' + id)
    const directory = await inside(root, dir)
    const web = await webDistEntry(directory)
    const base = {
      absWorkingDir: root,
      entryPoints: [web.entry],
      bundle: true,
      write: false as const,
      format: 'iife' as const,
      globalName: '__ceru_entry',
      platform: 'browser' as const,
      target: 'es2022',
      charset: 'utf8' as const,
      plugins: [web.plugin, ...plugins],
      define: defines,
      outfile: 'entry.js',
      logLevel: 'silent' as const,
    }
    const result = await build(base)
    if (result.outputFiles.length !== 1) throw new Error('webDist emitted an external file')
    const source = result.outputFiles[0].text.replace(
      /(^|\n)var __ceru_entry =/,
      '$1const __ceru_entry =',
    )
    assertBundledDependencies(source)
    const entryName = uniqueEntryName(id, 'Surface')
    chunks.set(
      id,
      'async function ' +
        entryName +
        '(ctx) {\n' +
        source +
        '\nreturn __ceru_entry.default(ctx);\n}',
    )
    if (options.development) {
      const debug = await build({
        ...base,
        sourcemap: 'inline',
        sourceRoot: 'ceru:///',
        banner: { js: 'globalThis.__ceruStart(async function(ctx) {' },
        footer: { js: 'return __ceru_entry.default(ctx); });' },
      })
      devModules[id] = debug.outputFiles[0].text
    }
  }
  const resources: Record<string, Resource> = Object.create(null)
  const nativeResources = new Set(
    (config.manifest.entry.native ?? []).flatMap(item => Object.values(item.platforms)),
  )
  for (const [id, input] of Object.entries(config.resources ?? {})) {
    if (
      !input ||
      !['json', 'text', 'base64'].includes(input.type) ||
      typeof input.path !== 'string'
    )
      throw new Error('Invalid resource: ' + id)
    const path = await inside(root, input.path)
    if ((await stat(path)).size > LIMITS.resources) throw new Error('Resource too large: ' + id)
    const bytes = await readFile(path)
    if (input.type === 'json')
      resources[id] = {
        type: 'json',
        value: parseJsonStrict(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      }
    else if (input.type === 'text')
      resources[id] = {
        type: 'text',
        value: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        ...(input.mime ? { mime: input.mime } : {}),
      }
    else
      resources[id] = {
        type: 'base64',
        value: bytes.toString('base64'),
        mime: input.mime ?? 'application/octet-stream',
        ...(nativeResources.has(id) ? { sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') } : {}),
      }
  }
  const emitted = new Set<string>()
  const definitions: string[] = []
  const exports: string[] = []
  const logicEntry = config.manifest.entry.logic?.module
  if (logicEntry) {
    const logic = chunks.get(logicEntry)
    const name = chunkNames.get(logicEntry)
    if (!logic) throw new Error('Missing compiled logic entry: ' + logicEntry)
    if (!name) throw new Error('Missing compiled logic name: ' + logicEntry)
    definitions.push(
      '// Invisible plugin logic\nconst ' + name + ' = /* @ceru-self-contained */ ' + logic + ';',
    )
    exports.push('exports.activate = ' + name + ';')
    emitted.add(logicEntry)
  }
  const visibleSurfaces = (config.manifest.entry.views ?? []).filter(
    (surface) => surface.kind === 'web' || surface.kind === 'component',
  )
  if (visibleSurfaces.length) {
    const entries = visibleSurfaces.map((surface) => {
      const entry = chunks.get(surface.module)
      const name = chunkNames.get(surface.module)
      if (!entry) throw new Error('Missing compiled Surface entry: ' + surface.module)
      if (!name) throw new Error('Missing compiled Surface name: ' + surface.module)
      emitted.add(surface.module)
      definitions.push(
        '// Visible plugin surface: ' +
          surface.id +
          '\nconst ' +
          name +
          ' = /* @ceru-self-contained */ ' +
          entry +
          ';',
      )
      return JSON.stringify(surface.id) + ': ' + name
    })
    definitions.push('const surfaces = {\n' + entries.join(',\n') + '\n};')
    exports.push('exports.surfaces = surfaces;')
  }
  const modules = [...chunks].filter(([id]) => !emitted.has(id))
  if (modules.length) {
    const entries = modules.map(([id, entry]) => {
      const name = chunkNames.get(id)
      if (!name) throw new Error('Missing compiled module name: ' + id)
      definitions.push(
        '// Additional plugin module: ' +
          id +
          '\nconst ' +
          name +
          ' = /* @ceru-self-contained */ ' +
          entry +
          ';',
      )
      return JSON.stringify(id) + ': ' + name
    })
    definitions.push('const modules = {\n' + entries.join(',\n') + '\n};')
    exports.push('exports.modules = modules;')
  }
  definitions.push(
    '// Embedded static resources\nconst resources = ' + JSON.stringify(resources) + ';',
  )
  exports.push('exports.resources = resources;')
  const body = [...definitions, '// Public plugin exports', ...exports].join('\n\n') + '\n'
  const header: ArtifactHeader = {
    formatVersion: 2,
    syntax: 'js',
    manifest: config.manifest,
    signature: null,
  }
  const artifact = encodeArtifact(header, body)
  readArtifact(artifact)
  const output = resolve(root, options.out ?? config.output ?? 'dist/plugin.js')
  if (extname(output) !== '.js')
    throw new Error('Final output must be a .js file containing compiled JavaScript')
  const rel = relative(root, output)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Build output must stay inside project')
  if (isCurrent()) await writeAtomic(output, artifact, options.overwrite ?? true)
  return { path: output, bytes: artifact.length, devModules }
}
export const TEMPLATES = [
  'source',
  'connected-library',
  'account-qrcode',
  'importer',
  'guest-adapter',
  'web-surface',
  'vue',
  'vue-tsx',
  'react',
  'web-dist',
  'page-extension',
  'playback-hook',
  'player-skin',
  'encrypted-source',
] as const
export type TemplateName = (typeof TEMPLATES)[number]
// 与根 README 的模板表保持一致；Record 保证新增模板必须补说明。
export const TEMPLATE_INFO: Record<TemplateName, string> = {
  'player-skin': 'Vue 歌词、封面与背景区域',
  source: '本地搜索 demo、标准 Provider、结构化解析结果',
  'encrypted-source': '内置解密、WASM 变换和本机服务三个音源',
  'playback-hook': '拦截点播和队列，内置无桌面测试',
  'page-extension':'Vue 侧边栏、设置页及歌单按钮',
  'connected-library': '连接表单与状态更新 demo',
  'account-qrcode': '扫码登录：宿主模板或插件自定义内部 UI',
  importer: '曲目去重与导入计划预览',
  'guest-adapter': '父插件与 Guest bootstrap 的边界',
  'web-surface': '普通 DOM 页面',
  vue: 'Vue 单文件组件、scoped CSS',
  'vue-tsx': 'Vue TSX 组件',
  react: 'React TSX/JSX、Hooks',
  'web-dist': '封装已构建的本地 index.html、脚本和样式',
}
export async function scaffoldProject(
  destination: string,
  options: { template?: string; language?: string } = {},
): Promise<string> {
  const template = options.template ?? 'source'
  const language = options.language ?? 'ts'
  if (!TEMPLATES.includes(template as TemplateName))
    throw new Error('Unknown template. Choose: ' + TEMPLATES.join(', '))
  if (!['ts', 'js'].includes(language)) throw new Error('--lang must be ts or js')
  const root = resolve(destination)
  try {
    if ((await readdir(root)).length) throw new Error('Destination is not empty: ' + root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const directoryName = basename(root).normalize('NFC')
  const lowerName = directoryName.toLowerCase()
  const stem = lowerName.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-plugin'
  const maxSlugLength = 128 - 'local.'.length
  const suffix = createHash('sha256').update(directoryName).digest('hex').slice(0,12)
  const slug = stem === lowerName && stem.length <= maxSlugLength ? stem :
    stem.slice(0,maxSlugLength - suffix.length - 1).replace(/-+$/,'') + '-' + suffix
  const displayName = Array.from(directoryName.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0,120).join('') || slug
  const base = fileURLToPath(new URL('../templates/', import.meta.url))
  const snapshot = JSON.parse(await readFile(resolve(base, 'snapshot.json'), 'utf8'))
  const prefix = template + '/' + language + '/'
  const files: string[] = snapshot.files.filter((path: string) => path.startsWith(prefix))
  if (!files.length) throw new Error('Template snapshot is missing: ' + prefix)
  for (const path of files) {
    if (path.includes('..') || path.includes('\\') || isAbsolute(path))
      throw new Error('Invalid template snapshot path')
    const rel = path.slice(prefix.length)
    const name = rel === '_gitignore' ? '.gitignore' : rel
    const bytes = await readFile(resolve(base, path))
    let contents: string | Uint8Array = bytes
    if (name === 'package.json') {
      const pkg = JSON.parse(bytes.toString('utf8'))
      pkg.name = slug
      pkg.scripts = { ...pkg.scripts, 'check:compat': 'ceru-plugin check-compat' }
      contents = JSON.stringify(pkg, null, 2) + '\n'
    }
    if (name === 'ceru.plugin.json') {
      const cfg = JSON.parse(bytes.toString('utf8'))
      const old = cfg.manifest.name
      cfg.manifest.id = 'local.' + slug
      cfg.manifest.name = displayName
      for (const provider of cfg.manifest.provides?.providers ?? [])
        if (provider.name === old) provider.name = displayName
      for (const item of cfg.manifest.ui?.pages ?? []) if (item.title === old) item.title = displayName
      contents = JSON.stringify(cfg, null, 2) + '\n'
    }
    if (name === 'README.md') contents = bytes.toString('utf8').replace(/^# .*/, () => '# ' + displayName)
    await writeAtomic(resolve(root, name), contents)
  }
  return realpath(root)
}
