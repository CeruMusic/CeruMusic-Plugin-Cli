import { parse } from 'acorn'

type Node = { type: string; [key: string]: any }
const restricted = new Set([
  'ipcRenderer',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'eval',
  'Function',
])
const globals = new Set(['window', 'globalThis', 'self'])
const regionRestricted = new Set(['Worker', 'SharedWorker', 'WebAssembly'])
function memberName(node: Node) {
  if (node.type !== 'MemberExpression') return undefined
  return node.computed
    ? node.property.type === 'Literal'
      ? node.property.value
      : undefined
    : node.property.name
}
export function assertComponentPolicy(source: string, region = false): void {
  const isRestricted = (name: string) => restricted.has(name) || (region && regionRestricted.has(name))
  const nodes: Node[] = [parse('(' + source + '\n)', { ecmaVersion: 'latest' })]
  while (nodes.length) {
    const node = nodes.pop()!
    const member = memberName(node),
      owner = node.object?.name
    const forbidden =
      node.type === 'ImportExpression'
        ? 'dynamic import'
        : node.type === 'Identifier' && isRestricted(node.name)
          ? node.name
          : isRestricted(member)
            ? member
            : globals.has(owner) && ['api', 'electron'].includes(member)
              ? owner + '.' + member
              : owner === 'document' && member === 'cookie'
                ? 'document.cookie'
                : ['Element', 'Node'].includes(owner) && member === 'prototype'
                  ? owner + '.prototype'
                  : node.type === 'CallExpression' &&
                      node.callee.object?.name === 'Object' &&
                      memberName(node.callee) === 'defineProperty' &&
                      globals.has(node.arguments[0]?.name)
                    ? 'Object.defineProperty(window)'
                    : undefined
    if (forbidden) throw Error('Component policy rejects ' + forbidden)
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const element of child) if (element?.type) nodes.push(element)
      } else if (child?.type) nodes.push(child)
    }
  }
}
