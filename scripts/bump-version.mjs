import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 一次性 bump 工具：把 5 个待发布包的 version 与内部精确依赖统一改到目标版本。
// 用法：node scripts/bump-version.mjs 0.3.15
const version = process.argv[2]
if (!version) throw new Error('用法：node scripts/bump-version.mjs <version>')
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error('版本必须是 semver，收到 ' + version)

const directories = ['sdk', 'issuer', 'core', 'cli', 'create']
const kinds = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

const manifests = []
for (const directory of directories) {
  const path = resolve('packages', directory, 'package.json')
  manifests.push({ path, record: JSON.parse(await readFile(path, 'utf8')) })
}
const published = new Set(manifests.map(({ record }) => record.name))

let changes = 0
for (const { path, record } of manifests) {
  if (record.version !== version) {
    console.log(path + ': version ' + record.version + ' -> ' + version)
    record.version = version
    changes++
  }
  for (const kind of kinds) {
    for (const [dependency, range] of Object.entries(record[kind] ?? {})) {
      if (!published.has(dependency) || range === version) continue
      console.log(path + ': ' + kind + '.' + dependency + ' ' + range + ' -> ' + version)
      record[kind][dependency] = version
      changes++
    }
  }
  await writeFile(path, JSON.stringify(record, null, 2) + '\n')
}
console.log('完成 ' + changes + ' 处修改')
