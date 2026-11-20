import { resolve } from 'node:path'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import {
  createParsedCommandLine,
  createVueLanguagePlugin,
  getAllExtensions,
} from '@vue/language-core'
import { proxyCreateProgram } from '@volar/typescript/lib/node/proxyCreateProgram.js'

const normalized = (path: string) => resolve(path).replaceAll('\\', '/')

type VueShape = { types: string; source: string; outsideTemplate?: string }

function checkedShape(source: string, file: string): VueShape {
  const { descriptor, errors } = parse(source, { filename: file })
  const template = descriptor.template
  if (errors.length || !template?.ast || template.lang || template.src) return { types: source, source }
  const spans: { start: number; end: number }[] = []
  const visit = (node: (typeof template.ast.children)[number]) => {
    if (node.type === 2 && node.content.trim()) {
      spans.push({ start: node.loc.start.offset, end: node.loc.end.offset })
    } else if (node.type === 1 && node.tag !== 'script' && node.tag !== 'style') {
      node.children.forEach(visit)
    }
  }
  template.ast.children.forEach(visit)
  let shape = source
  for (const span of spans.reverse())
    shape = shape.slice(0, span.start) + '\u0000' + shape.slice(span.end)
  return { types: shape, source, outsideTemplate: JSON.stringify([source.slice(0, template.loc.start.offset), source.slice(template.loc.end.offset)]) }
}

export class VueWatchTypes {
  private accepted?: ts.Program
  private readonly shapes = new Map<string, VueShape>()
  private readonly cache = new Map<string, ts.SourceFile>()
  private readonly create: typeof ts.createProgram
  private readonly options: ts.CompilerOptions
  private readonly host: ts.CompilerHost
  private readonly extensions: ts.FileExtensionInfo[]
  private readonly configPath: string
  private previous?: ts.SemanticDiagnosticsBuilderProgram

  constructor(private readonly root: string) {
    this.configPath = normalized(resolve(root, 'tsconfig.json'))
    const { vueOptions } = createParsedCommandLine(ts, ts.sys, this.configPath)
    this.extensions = getAllExtensions(vueOptions).map((extension) => ({
      extension,
      isMixedContent: true,
      scriptKind: ts.ScriptKind.Deferred,
    }))
    const config = this.config()
    this.options = { ...config.options, noEmit: true, allowNonTsExtensions: true }
    this.host = ts.createIncrementalCompilerHost(this.options)
    const getSource = this.host.getSourceFile.bind(this.host)
    this.host.getSourceFile = (file, ...args) => {
      const key = normalized(file)
      const cached = this.cache.get(key)
      if (cached && !args[2]) return cached
      const source = getSource(file, ...args)
      if (source) this.cache.set(key, source)
      return source
    }
    this.create = proxyCreateProgram(ts, ts.createProgram, () => [
      createVueLanguagePlugin(ts, this.options, vueOptions, (id) => id),
    ])
  }

  private config() {
    const input = ts.readConfigFile(this.configPath, ts.sys.readFile)
    if (input.error) throw Error(ts.flattenDiagnosticMessageText(input.error.messageText, '\n'))
    return ts.parseJsonConfigFileContent(
      input.config,
      ts.sys,
      this.root,
      undefined,
      this.configPath,
      undefined,
      this.extensions,
    )
  }

  private independentTemplates(before: ts.Program | undefined, program: ts.Program, edits: string[]) {
    if (!before || edits.length !== 1 || !edits[0].endsWith('.vue') || program.getProjectReferences()?.length) return
    const localModule = (source: ts.SourceFile | undefined) => source && ts.isExternalModule(source) &&
      !source.statements.some(statement => ts.isModuleDeclaration(statement) || ts.isNamespaceExportDeclaration(statement))
    const roots = program.getRootFileNames()
    if (!roots.includes(edits[0]) || roots.length !== before.getRootFileNames().length ||
        roots.some((root, index) => root !== before.getRootFileNames()[index])) return
    const sources = program.getSourceFiles()
    if (sources.length !== before.getSourceFiles().length) return
    const changed = sources.filter(source => before.getSourceFile(source.fileName) !== source)
    if (!changed.length || changed.some(source => {
      const prior = before.getSourceFile(source.fileName)
      return !source.fileName.endsWith('.vue') || !roots.includes(source.fileName) || !localModule(prior) || !localModule(source)
    })) return
    const names = new Set(changed.map(source => source.fileName))
    if (!names.has(edits[0])) return
    // TypeScript still follows imports, aliases and references after these files cease to be roots.
    const remaining = this.create({ rootNames: roots.filter(root => !names.has(root)), options: this.options,
      host: { ...this.host }, oldProgram: program })
    if (changed.some(source => remaining.getSourceFile(source.fileName)) || remaining.getSourceFiles().length !== sources.length - changed.length) return
    return changed
  }

  check(declarations: string, changed: string[]) {
    const edits = changed.map((file) => normalized(resolve(this.root, file)))
    const shapes = new Map<string, VueShape>()
    for (const file of edits) {
      this.cache.delete(file)
      const source = file.endsWith('.vue') ? ts.sys.readFile(file) : undefined
      if (source !== undefined) shapes.set(file, checkedShape(source, file))
    }
    if (
      this.accepted &&
      edits.length &&
      edits.every((file) => shapes.has(file) && shapes.get(file)!.types === this.shapes.get(file)?.types)
    )
      return this.accepted
    const accepted = this.accepted
    this.accepted = undefined
    const config = this.config()
    const program = this.create({
      rootNames: [...new Set([...config.fileNames.map(normalized), normalized(declarations)])],
      options: this.options,
      host: { ...this.host },
      oldProgram: accepted ?? this.previous?.getProgram(),
      projectReferences: config.projectReferences,
    })
    const outsideTemplate = shapes.get(edits[0])?.outsideTemplate
    const independent = outsideTemplate !== undefined && outsideTemplate === this.shapes.get(edits[0])?.outsideTemplate
      ? this.independentTemplates(accepted, program, edits) : undefined
    if (!independent) this.previous = ts.createSemanticDiagnosticsBuilderProgram(program, this.host, this.previous)
    const errors = [
      ...config.errors,
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...(independent ? independent.flatMap(source => program.getSemanticDiagnostics(source)) : this.previous!.getSemanticDiagnostics()),
    ]
    if (errors.length) throw Error(ts.formatDiagnostics(errors, this.host))
    this.shapes.clear()
    for (const file of program.getRootFileNames().filter((file) => file.endsWith('.vue'))) {
      const key = normalized(file), edit = shapes.get(key), source = edit?.source ?? ts.sys.readFile(key)
      if (source !== undefined && program.getSourceFile(file)?.text.startsWith(source))
        this.shapes.set(key, edit ?? checkedShape(source, key))
    }
    this.accepted = program
    return program
  }
}
