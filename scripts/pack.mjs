import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('artifacts')
await mkdir(output, { recursive: true })
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run with npm run pack:all')
const summaries = []
for (const name of ['sdk', 'issuer', 'cli', 'create']) {
  const result = spawnSync(
    process.execPath,
    [npmCli, 'pack', '--json', '--pack-destination', output],
    {
      cwd: resolve('packages', name),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const [summary] = JSON.parse(result.stdout)
  for (const file of summary.files) {
    if (/private\.pem$|(^|\/)\.env$|(^|\/)\.npmrc$|node_modules\//.test(file.path)) {
      throw new Error('Sensitive/unexpected package file: ' + file.path)
    }
  }
  summaries.push(summary)
  console.log(
    summary.name +
      '@' +
      summary.version +
      ': ' +
      summary.filename +
      ' (' +
      summary.entryCount +
      ' files)',
  )
}
await writeFile(resolve(output, 'pack-summary.json'), JSON.stringify(summaries, null, 2) + '\n')
