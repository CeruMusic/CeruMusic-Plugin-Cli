import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url)),
  artifacts = join(root, 'artifacts')
const packages = JSON.parse(await readFile(join(artifacts, 'pack-summary.json'), 'utf8'))
const expected = ['sdk', 'issuer', 'core', 'cli']
  .map((name) => '@shiqianjiang/ceru-plugin-' + name)
  .concat('create-ceru-plugin')
if (packages.length !== 5 || expected.some((name) => !packages.some((item) => item.name === name)))
  throw Error('先运行 npm run pack:all')
const version = packages[0].version,
  files = {},
  dependencies = {}
for (const item of packages) {
  if (
    item.version !== version ||
    item.filename !== basename(item.filename) ||
    !item.filename.endsWith('.tgz')
  )
    throw Error('Unexpected package ' + item.name)
  const digest = createHash('sha512')
    .update(await readFile(join(artifacts, item.filename)))
    .digest('base64')
  if (item.integrity !== 'sha512-' + digest) throw Error('Pack content changed: ' + item.filename)
  files[item.name] = { file: item.filename, integrity: item.integrity }
  dependencies[item.name] = 'file:vendor/' + item.filename
}
const guides = ["ROUTER.md","LIFECYCLE.md","OPERATIONS.md","HOOKS-AND-EVENTS.md","COMPONENT-VIEWS.md","HOST-SERVICES.md","MANIFEST-V3.md","REGIONS-AND-SKINS.md","ACCOUNTS.md","SERVER-AND-STREAMS.md","SERVER-AND-STREAMS-HISTORY.md","RUNTIME-VALIDATION.md","COMPATIBILITY.md"]
const support = [
  ['scripts/devkit/create.mjs', 'create.mjs'],
  ['scripts/devkit/README.md', 'README.md'],
  ...guides.map(name => ['docs/' + name, 'docs/' + name]),
]
const fingerprint = createHash('sha256').update(JSON.stringify(files))
for (const [source, destination] of support) {
  fingerprint.update(destination).update(createHash('sha256').update(await readFile(join(root,source))).digest())
}
const out = process.argv[2]
  ? resolve(process.argv[2])
  : join(
      artifacts,
      'ceru-devkit-' +
        version +
        '-' +
        fingerprint.digest('hex').slice(0, 12),
    )
await mkdir(out)
await mkdir(join(out, 'vendor'))
for (const item of packages)
  await copyFile(
    join(artifacts, item.filename),
    join(out, 'vendor', item.filename),
    constants.COPYFILE_EXCL,
  )
await mkdir(join(out, 'docs'))
for (const [source, destination] of support)
  await copyFile(join(root, source), join(out, destination), constants.COPYFILE_EXCL)
const save = (name, data) =>
  writeFile(join(out, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
await save('packages.json', files)
await save('package.json', {
  name: 'ceru-local-devkit',
  version,
  private: true,
  type: 'module',
  engines: { node: '>=22.12.0' },
  scripts: { create: 'node create.mjs', templates: 'ceru-plugin list-templates' },
  dependencies,
})
console.log(out)
