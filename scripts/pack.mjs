import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('artifacts')
await mkdir(output, { recursive: true })
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run with npm run pack:all')
const summaries = []
for (const name of ['sdk', 'issuer', 'core', 'cli', 'create']) {
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
  if (name === 'core') {
    const bundle = await readFile(resolve('packages/core/assets/component-view.js'), 'utf8')
    if (/lyric-scroll-container|--yrc-mask-x|yrc-word|visualizer-canvas|label-shine|ceru-hc-vinyl-disc/.test(bundle)) throw Error('Desktop player implementation in Core runtime')
    if (summary.files.some(file => /(?:^|\/)(?:LyricAdapter\.vue|lyric-adapter\.(?:js|css|d\.ts))$/.test(file.path))) throw Error('Desktop lyric assets in Core package')
  }
  for (const file of summary.files) {
    if (name === 'cli' && /^assets\/(?:electron(?:-app\/|\.cjs$)|(?:playground|native-view|core-contracts|sandbox)\.js$|index\.html$|style\.css$)/.test(file.path)) {
      throw new Error('Obsolete preview asset in v3 CLI: ' + file.path)
    }
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
