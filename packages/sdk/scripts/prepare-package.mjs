import { access, copyFile, readFile, writeFile, unlink } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
await copyFile(new URL('src/host-modules.d.cts', root), new URL('dist/host-modules.d.cts', root))
await unlink(new URL('dist/host-modules.d.ts', root)).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})
const index = new URL('dist/index.d.ts', root)
const declarations = await readFile(index, 'utf8')
const reference = '/// <reference path="./host-modules.d.cts" />'
const body = declarations.replace(
  /^\/\/\/ <reference path="\.\/host-modules\.d\.(?:cts|ts)" \/>\r?\n/gm,
  '',
)
const prepared = reference + '\n' + body
if (prepared !== declarations) await writeFile(index, prepared)

// Check the package boundary before publishing, not just the TypeScript source tree.
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
for (const entry of Object.values(pkg.exports)) {
  for (const target of new Set(Object.values(entry))) {
    await access(new URL(target, root))
  }
}
