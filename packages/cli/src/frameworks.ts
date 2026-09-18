import { readFile, realpath } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute, sep, extname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { build, type Plugin } from 'esbuild'
import { parse as parseSfc, compileScript, compileStyleAsync } from '@vue/compiler-sfc'
import { transformAsync } from '@babel/core'
import vueJsx from '@vue/babel-plugin-jsx'
import { parse as parseHtml, serialize } from 'parse5'
import { parse as parseJs } from 'acorn'

const mime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}
const loaders: Record<string, 'dataurl'> = Object.fromEntries(
  Object.keys(mime).map((key) => [key, 'dataurl']),
)
function styleCode(css: string, id: string): string {
  return (
    '\nif (typeof document !== "undefined" && !document.querySelector(' +
    JSON.stringify('style[data-ceru-style="' + id + '"]') +
    ')) { const s=document.createElement("style");s.dataset.ceruStyle=' +
    JSON.stringify(id) +
    ';s.textContent=' +
    JSON.stringify(css) +
    ';document.head.append(s); }\n'
  )
}
async function cssBundle(css: string, directory: string): Promise<string> {
  const result = await build({
    stdin: { contents: css, loader: 'css', resolveDir: directory },
    bundle: true,
    write: false,
    outfile: 'style.css',
    loader: loaders,
    logLevel: 'silent',
    plugins: [
      {
        name: 'local-css-only',
        setup(ctx) {
          ctx.onResolve({ filter: /^https?:\/\// }, () => ({
            errors: [
              { text: 'Remote CSS resources must be downloaded and included at build time' },
            ],
          }))
        },
      },
    ],
  })
  if (result.outputFiles.length !== 1) throw new Error('CSS emitted an external resource')
  return result.outputFiles[0].text
}
/** Side-effect stylesheet imports must survive single-file builds (React/Vue/vanilla). */
export function stylesheetPlugin(): Plugin {
  return {
    name: 'ceru-inline-stylesheets',
    setup(ctx) {
      ctx.onLoad({ filter: /\.css$/ }, async (args) => {
        const css = await cssBundle(await readFile(args.path, 'utf8'), dirname(args.path))
        const id = createHash('sha256').update(css).digest('hex').slice(0, 16)
        return {
          contents: 'export default ' + JSON.stringify(css) + ';' + styleCode(css, id),
          loader: 'js',
          resolveDir: dirname(args.path),
        }
      })
    },
  }
}
export function vuePlugin(root: string, framework?: string): Plugin {
  return {
    name: 'ceru-vue',
    setup(ctx) {
      ctx.onLoad({ filter: /\.vue$/ }, async (args) => {
        const original = await readFile(args.path, 'utf8')
        let parsed = parseSfc(original, { filename: args.path, sourceMap: true })
        if (parsed.errors.length) throw new Error(parsed.errors.map(String).join('\n'))
        if (!parsed.descriptor.script && !parsed.descriptor.scriptSetup)
          parsed = parseSfc('<script>export default {}</script>\n' + original, {
            filename: args.path,
          })
        const descriptor = parsed.descriptor
        if (
          descriptor.script?.src ||
          descriptor.template?.src ||
          descriptor.styles.some((s) => s.src)
        )
          throw new Error('Use local imports instead of SFC src attributes')
        const id = createHash('sha256').update(original).digest('hex').slice(0, 12)
        const compiled = compileScript(descriptor, {
          id,
          inlineTemplate: true,
          genDefaultAs: '__ceru_component',
        })
        let contents = compiled.content
        for (const style of descriptor.styles) {
          const result = await compileStyleAsync({
            filename: args.path,
            source: style.content,
            id: 'data-v-' + id,
            scoped: style.scoped,
            preprocessLang: style.lang as any,
            preprocessCustomRequire: createRequire(resolve(root, 'package.json')),
          })
          if (result.errors.length) throw new Error(result.errors.map(String).join('\n'))
          contents += styleCode(
            await cssBundle(result.code, dirname(args.path)),
            id + String(descriptor.styles.indexOf(style)),
          )
        }
        if (descriptor.styles.some((s) => s.scoped))
          contents += '\n__ceru_component.__scopeId = ' + JSON.stringify('data-v-' + id) + ';'
        contents += '\nexport default __ceru_component;\n'
        if (compiled.map)
          contents +=
            '//# sourceMappingURL=data:application/json;base64,' +
            Buffer.from(JSON.stringify(compiled.map)).toString('base64')
        return {
          contents,
          loader:
            descriptor.scriptSetup?.lang === 'tsx' || descriptor.script?.lang === 'tsx'
              ? 'tsx'
              : 'ts',
          resolveDir: dirname(args.path),
        }
      })
      if (framework === 'vue')
        ctx.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
          const source = await readFile(args.path, 'utf8')
          const result = await transformAsync(source, {
            filename: args.path,
            babelrc: false,
            configFile: false,
            sourceMaps: 'inline',
            parserOpts: {
              plugins: ['jsx', ...(args.path.endsWith('.tsx') ? ['typescript' as const] : [])],
            },
            plugins: [(vueJsx as any).default ?? vueJsx],
          })
          return { contents: result?.code ?? source, loader: 'ts', resolveDir: dirname(args.path) }
        })
    },
  }
}
async function localFile(directory: string, base: string, input: string): Promise<string> {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(input))
    throw new Error('External/ambiguous web-dist resource: ' + input)
  const clean = decodeURIComponent(input.split(/[?#]/)[0])
  const path = await realpath(
    clean.startsWith('/') ? resolve(directory, '.' + clean) : resolve(base, clean),
  )
  const rel = relative(directory, path)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('web-dist resource escapes its directory')
  return path
}
async function dataUrl(path: string): Promise<string> {
  const bytes = await readFile(path)
  if (bytes.length > 8 * 1024 * 1024) throw new Error('web-dist asset is too large')
  const type = mime[extname(path).toLowerCase()]
  if (!type) throw new Error('Unsupported static asset: ' + path)
  return 'data:' + type + ';base64,' + bytes.toString('base64')
}
/** Convert a local, already-built SPA into a Surface entry. No uploaded HTML is executed by the CLI. */
export async function webDistEntry(
  directoryInput: string,
): Promise<{ plugin: Plugin; entry: string }> {
  const directory = await realpath(directoryInput)
  const document: any = parseHtml(await readFile(resolve(directory, 'index.html'), 'utf8'))
  const scripts: { file?: string; code?: string }[] = []
  const styles: string[] = []
  let body: any
  async function walk(node: any): Promise<void> {
    if (node.tagName === 'body') body = node
    const next = []
    for (const child of node.childNodes ?? []) {
      const attrs: Record<string, string> = Object.fromEntries(
        (child.attrs ?? []).map((a: any) => [a.name, a.value]),
      )
      if (['base', 'iframe', 'object', 'embed'].includes(child.tagName))
        throw new Error('Unsupported web-dist element: ' + child.tagName)
      if (Object.keys(attrs).some((key) => /^on/i.test(key)))
        throw new Error('Use JS event listeners instead of inline HTML event handlers')
      if (child.tagName === 'script') {
        if (attrs.type && !['module', 'text/javascript'].includes(attrs.type)) continue
        scripts.push(
          attrs.src
            ? { file: await localFile(directory, directory, attrs.src) }
            : { code: (child.childNodes ?? []).map((n: any) => n.value ?? '').join('') },
        )
        continue
      }
      if (child.tagName === 'link') {
        if (attrs.rel === 'stylesheet') {
          const path = await localFile(directory, directory, attrs.href)
          styles.push(await cssBundle(await readFile(path, 'utf8'), dirname(path)))
        }
        continue
      }
      if (child.tagName === 'style') {
        styles.push(
          await cssBundle(
            (child.childNodes ?? []).map((n: any) => n.value ?? '').join(''),
            directory,
          ),
        )
        continue
      }
      for (const attr of child.attrs ?? []) {
        if (['src', 'poster'].includes(attr.name) && !attr.value.startsWith('data:'))
          attr.value = await dataUrl(await localFile(directory, directory, attr.value))
        if (attr.name === 'srcset')
          throw new Error('Inline srcset assets in the web build before packing')
      }
      await walk(child)
      next.push(child)
    }
    node.childNodes = next
  }
  await walk(document)
  if (!body) throw new Error('web-dist/index.html must have a body')
  const html = serialize(body)
  const entry = 'ceru-web-dist-entry'
  const plugin: Plugin = {
    name: 'ceru-web-dist',
    setup(ctx) {
      ctx.onResolve({ filter: /^ceru-web-dist-/ }, (args) => ({
        path: args.path,
        namespace: 'ceru-web-dist',
      }))
      ctx.onLoad({ filter: /.*/, namespace: 'ceru-web-dist' }, (args) => {
        if (args.path === entry)
          return {
            contents:
              'export default async function(ctx) { globalThis.ceru = ctx; ctx.root.innerHTML = ' +
              JSON.stringify(html) +
              ';\n' +
              styleCode(styles.join('\n'), 'web-dist') +
              '\n' +
              scripts
                .map((_script, i) => 'await import("ceru-web-dist-script-' + i + '");')
                .join('\n') +
              '\nreturn () => { ctx.root.replaceChildren(); }; }',
            loader: 'js',
            resolveDir: directory,
          }
        const index = Number(args.path.slice('ceru-web-dist-script-'.length))
        const script = scripts[index]
        if (!script) throw new Error('Unknown web-dist script')
        return script.file
          ? {
              contents: 'import ' + JSON.stringify(script.file) + ';',
              loader: 'js',
              resolveDir: directory,
            }
          : { contents: script.code ?? '', loader: 'js', resolveDir: directory }
      })
      ctx.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
        const rel = relative(directory, args.path)
        if (rel.startsWith('..') || isAbsolute(rel)) return
        let source = await readFile(args.path, 'utf8')
        const tree: any = parseJs(source, { ecmaVersion: 'latest', sourceType: 'module' })
        const replacements: { start: number; end: number; text: string }[] = []
        const stack = [tree]
        while (stack.length) {
          const node = stack.pop()
          if (
            node.type === 'Literal' &&
            typeof node.value === 'string' &&
            mime[extname(node.value.split(/[?#]/)[0]).toLowerCase()] &&
            !/^(?:[a-z]+:|\/\/)/i.test(node.value)
          ) {
            try {
              replacements.push({
                start: node.start,
                end: node.end,
                text: JSON.stringify(
                  await dataUrl(await localFile(directory, dirname(args.path), node.value)),
                ),
              })
            } catch {}
          }
          for (const value of Object.values(node)) {
            if (Array.isArray(value))
              for (const item of value) {
                if (item && typeof item === 'object' && 'type' in item) stack.push(item)
              }
            else if (value && typeof value === 'object' && 'type' in value) stack.push(value)
          }
        }
        for (const replacement of replacements.sort((a, b) => b.start - a.start))
          source =
            source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end)
        return { contents: source, loader: 'js', resolveDir: dirname(args.path) }
      })
    },
  }
  return { plugin, entry }
}
