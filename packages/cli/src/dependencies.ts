import type { Plugin } from 'esbuild'
import { parse } from 'acorn'
import { HOST_MODULE_NAMES } from '@shiqianjiang/ceru-plugin-sdk/catalog'

export const HOST_MODULES = new Set<string>(HOST_MODULE_NAMES)

/** Only explicitly named Host modules are replaced. All other packages go through esbuild. */
export function hostModulesPlugin(): Plugin {
  return {
    name: 'ceru-host-modules',
    setup(build) {
      build.onResolve({ filter: /^(?:ceru|@ceru\/[^/]+|lodash)$/ }, (args) => {
        if (!HOST_MODULES.has(args.path))
          return { errors: [{ text: 'Unknown Host module: ' + args.path }] }
        return { path: args.path, namespace: 'ceru-host' }
      })
      build.onLoad({ filter: /.*/, namespace: 'ceru-host' }, (args) => ({
        contents: 'module.exports = globalThis.__ceruRequire(' + JSON.stringify(args.path) + ')',
        loader: 'js',
      }))
    },
  }
}

/** Catch unresolved/dynamic CommonJS loading after bundling, including aliases. */
export function assertBundledDependencies(code: string): void {
  const tree = parse(code, { ecmaVersion: 2022, sourceType: 'script' }) as any
  const stack = [tree]
  while (stack.length) {
    const node = stack.pop()
    if (node.type === 'ImportExpression')
      throw new Error('Dynamic import remains in the output; use a static import')
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      (node.callee.name === 'require' || /^__require\d*$/.test(node.callee.name)) &&
      node.arguments.length
    ) {
      throw new Error(
        'Unresolved require() remains in the output. Use a literal local/package import, or a documented Host module.',
      )
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) stack.push(child)
      } else if (value && typeof value === 'object' && 'type' in value) stack.push(value)
    }
  }
}
