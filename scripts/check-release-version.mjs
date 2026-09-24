import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 发布门禁：确认 tag 版本与 5 个待发布包的版本、内部精确依赖一致。
// 用法：node scripts/check-release-version.mjs v0.3.7（缺省读 GITHUB_REF_NAME）
const directories = ['sdk', 'issuer', 'core', 'cli', 'create']
const kinds = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

const reference = process.argv[2] || process.env.GITHUB_REF_NAME
if (!reference) throw new Error('缺少版本来源：传入 tag 或设置 GITHUB_REF_NAME')
const version = reference.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error('发布 tag 必须是 v<semver>，收到 ' + reference)

const manifests = []
for (const directory of directories) {
  const path = resolve('packages', directory, 'package.json')
  manifests.push({ path, record: JSON.parse(await readFile(path, 'utf8')) })
}
const published = new Set(manifests.map(({ record }) => record.name))
const problems = []
for (const { path, record } of manifests) {
  if (record.version !== version)
    problems.push(path + ': version ' + record.version + ' ≠ ' + version)
  if (record.private === true) problems.push(path + ': private 包不能发布')
  for (const kind of kinds)
    for (const [dependency, range] of Object.entries(record[kind] ?? {}))
      if (published.has(dependency) && range !== version)
        problems.push(
          path +
            ': ' +
            kind +
            '.' +
            dependency +
            ' 是 ' +
            range +
            '，内部依赖必须精确指向 ' +
            version,
        )
}
if (problems.length) {
  console.error('tag ' + reference + ' 与包元数据不一致：')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('tag ' + reference + '：' + manifests.length + ' 个待发布包的版本与内部依赖一致')
