import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '@shiqianjiang/ceru-plugin-cli'

const root = dirname(fileURLToPath(import.meta.url)),
  [destination, ...options] = process.argv.slice(2)
if (!destination || destination.startsWith('-'))
  throw Error('npm run create -- <新目录> [--template playback-hook --lang ts]')
const files = JSON.parse(await readFile(join(root, 'packages.json'), 'utf8'))
for (const [name, entry] of Object.entries(files)) {
  if (basename(entry.file) !== entry.file || !entry.file.endsWith('.tgz'))
    throw Error('Invalid local package: ' + name)
  const hash = createHash('sha512')
    .update(await readFile(join(root, 'vendor', entry.file)))
    .digest('base64')
  if (entry.integrity !== 'sha512-' + hash) throw Error('本地依赖校验失败：' + name)
}
const project = await runCli(['init', resolve(destination), ...options])
if (typeof project === 'string') {
  const packageFile = join(project, 'package.json')
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
  const vendor = join(project, '.ceru-toolchain')
  await mkdir(vendor)
  for (const [name, entry] of Object.entries(files)) {
    if (name === 'create-ceru-plugin') continue
    await copyFile(
      join(root, 'vendor', entry.file),
      join(vendor, entry.file),
      constants.COPYFILE_EXCL,
    )
    const field = Object.hasOwn(pkg.dependencies ?? {}, name) ? 'dependencies' : 'devDependencies'
    pkg[field] ??= {}
    pkg[field][name] = 'file:.ceru-toolchain/' + entry.file
  }
  await writeFile(packageFile, JSON.stringify(pkg, null, 2) + '\n')
  console.log(
    '已绑定本地 v3 开发包。进入 ' +
      project +
      '，运行 npm install，再运行 npm run dev；播放拦截模板可先运行 npm test。',
  )
}
