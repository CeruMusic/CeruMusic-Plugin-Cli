import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const source = resolve(process.argv[2] || '../CeruMusic-Plugin-Template/templates')
const destination = resolve('packages/cli/templates')
const files = []
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Template snapshots cannot contain symlinks')
    const path = join(dir, item.name)
    if (
      ['node_modules', '.git', '.keys', 'dist'].includes(item.name) ||
      /private\.pem$|^\.env$|^\.npmrc$/.test(item.name)
    )
      throw new Error('Do not distribute generated files or secrets: ' + path)
    if (item.isDirectory()) await scan(path)
    else
      files.push({
        path: relative(source, path).replaceAll('\\', '/'),
        bytes: await readFile(path),
      })
  }
}
await scan(source)
files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
const hash = createHash('sha256')
for (const file of files) {
  hash.update(file.path + '\0').update(file.bytes)
  const target = join(destination, file.path)
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, file.bytes)
}
const manifest = {
  version: 1,
  source: 'https://github.com/CeruMusic/CeruMusic-Plugin-Template',
  digest: 'sha256:' + hash.digest('hex'),
  files: files.map((f) => f.path),
}
await writeFile(join(destination, 'snapshot.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Synced ' + files.length + ' template files (' + manifest.digest + ')')
