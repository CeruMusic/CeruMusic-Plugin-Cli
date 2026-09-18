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
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import ts from 'typescript'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { stylesheetPlugin, vuePlugin, webDistEntry } from './frameworks.js'
import { hostModulesPlugin, assertBundledDependencies } from './dependencies.js'
import {
  encodeArtifact,
  parseJsonStrict,
  readArtifact,
  validateManifest,
  LIMITS,
  type ArtifactHeader,
  type Resource,
} from '@shiqianjiang/ceru-plugin-issuer'

export interface BuildConfig {
  manifest: ArtifactHeader['manifest']
  entries: Record<string, string>
  resources?: Record<string, { path: string; type: 'json' | 'text' | 'base64'; mime?: string }>
  output?: string
  framework?: 'vanilla' | 'vue' | 'react'
  /** @deprecated Accepted to migrate 0.1.0 projects; frameworks are now always bundled. */
  sharedLibraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>
  webDist?: Record<string, string>
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
export async function loadProject(project: string): Promise<{ root: string; config: BuildConfig }> {
  const root = await realpath(resolve(project))
  const raw = parseJsonStrict(await readFile(resolve(root, 'ceru.plugin.json'), 'utf8'))
  for (const key of Object.keys(raw))
    if (
      ![
        'manifest',
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
  if (raw.framework && !['vanilla', 'vue', 'react'].includes(raw.framework))
    throw new Error('Unsupported framework')
  validateManifest(raw.manifest)
  if (!raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries))
    throw new Error('entries must map module IDs to source paths')
  if (Object.keys(raw.entries).length > 128) throw new Error('Too many entry points')
  for (const [id, path] of Object.entries(raw.entries)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || typeof path !== 'string')
      throw new Error('Invalid module entry: ' + id)
  }
  return { root, config: raw }
}
function checkTypes(root: string): ts.Program {
  const path = resolve(root, 'tsconfig.json')
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true })
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
export async function buildProject(
  project = '.',
  options: { out?: string; overwrite?: boolean; development?: boolean } = {},
): Promise<{ path: string; bytes: number; devModules: Record<string, string> }> {
  const { root, config } = await loadProject(project)
  if (config.framework === 'vue') {
    const executable = createRequire(import.meta.url).resolve('vue-tsc/bin/vue-tsc.js')
    const result = spawnSync(
      process.execPath,
      [executable, '--noEmit', '--pretty', 'false', '-p', resolve(root, 'tsconfig.json')],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    )
    if (result.status !== 0) throw new Error(result.stdout + result.stderr)
  }
  const program = checkTypes(root)
  const checker = program.getTypeChecker()
  const chunks = new Map<string, string>()
  const devModules: Record<string, string> = {}
  const plugins = [hostModulesPlugin(), vuePlugin(root, config.framework), stylesheetPlugin()]
  const defines = {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  }
  for (const [id, file] of Object.entries(config.entries)) {
    const entry = await inside(root, file)
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
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: '__ceru_entry',
      platform: 'browser',
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
      plugins,
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
    if (result.outputFiles.length !== 1) throw new Error('Entry emitted sidecar files: ' + id)
    for (const info of Object.values(result.metafile.outputs))
      if (info.imports.length) throw new Error('Unbundled import in ' + id)
    const source = result.outputFiles[0].text
    assertBundledDependencies(source)
    chunks.set(
      id,
      'async function(ctx) {\n' +
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
        platform: 'browser',
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
    assertBundledDependencies(result.outputFiles[0].text)
    chunks.set(
      id,
      'async function(ctx) {\n' +
        result.outputFiles[0].text +
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
      }
  }
  const emitted = new Set<string>()
  const body: string[] = []
  const logicEntry = config.manifest.modules.logic?.entry
  if (logicEntry) {
    const logic = chunks.get(logicEntry)
    if (!logic) throw new Error('Missing compiled logic entry: ' + logicEntry)
    body.push('exports.activate = ' + logic + ';')
    emitted.add(logicEntry)
  }
  const visibleSurfaces = (config.manifest.modules.surfaces ?? []).filter(
    (surface) => surface.kind === 'web',
  )
  if (visibleSurfaces.length) {
    const entries = visibleSurfaces.map((surface) => {
      const entry = chunks.get(surface.entry)
      if (!entry) throw new Error('Missing compiled Surface entry: ' + surface.entry)
      emitted.add(surface.entry)
      return JSON.stringify(surface.id) + ': ' + entry
    })
    body.push('exports.surfaces = {\n' + entries.join(',\n') + '\n};')
  }
  const modules = [...chunks].filter(([id]) => !emitted.has(id))
  if (modules.length)
    body.push(
      'exports.modules = {\n' +
        modules.map(([id, entry]) => JSON.stringify(id) + ': ' + entry).join(',\n') +
        '\n};',
    )
  body.push('exports.resources = ' + JSON.stringify(resources) + ';')
  const header: ArtifactHeader = {
    formatVersion: 2,
    syntax: 'js',
    manifest: config.manifest,
    signature: null,
  }
  const artifact = encodeArtifact(header, body.join('\n') + '\n')
  readArtifact(artifact)
  const output = resolve(root, options.out ?? config.output ?? 'dist/plugin.js')
  if (extname(output) !== '.js')
    throw new Error('Final output must be a .js file containing compiled JavaScript')
  const rel = relative(root, output)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Build output must stay inside project')
  await writeAtomic(output, artifact, options.overwrite ?? true)
  return { path: output, bytes: artifact.length, devModules }
}
export const TEMPLATES = [
  'source',
  'connected-library',
  'importer',
  'guest-adapter',
  'web-surface',
  'vue',
  'vue-tsx',
  'react',
  'web-dist',
] as const
export type TemplateName = (typeof TEMPLATES)[number]
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
  const slug =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-plugin'
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
      contents = JSON.stringify(pkg, null, 2) + '\n'
    }
    if (name === 'ceru.plugin.json') {
      const cfg = JSON.parse(bytes.toString('utf8'))
      const old = cfg.manifest.name
      cfg.manifest.id = 'local.' + slug
      cfg.manifest.name = slug
      for (const provider of cfg.manifest.contributes?.providers ?? [])
        if (provider.name === old) provider.name = slug
      for (const item of cfg.manifest.contributes?.sidebarItems ?? [])
        if (item.title === old) item.title = slug
      contents = JSON.stringify(cfg, null, 2) + '\n'
    }
    if (name === 'README.md') contents = bytes.toString('utf8').replace(/^# .*/, '# ' + slug)
    await writeAtomic(resolve(root, name), contents)
  }
  return realpath(root)
}
