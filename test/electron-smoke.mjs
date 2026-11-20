import { spawnSync } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [desktopRoot, archive] = process.argv.slice(2)
if (!desktopRoot || !archive) throw Error('Usage: node test/electron-smoke.mjs <desktop-source-directory> <packaged-app.asar>')
const script = resolve(desktopRoot, 'scripts/test-electron-runtime.mjs')
const asar = resolve(archive)
if (!(await stat(asar)).isFile()) throw Error('Expected a packaged app.asar file')
const toolchain = fileURLToPath(new URL('../',import.meta.url))
const result = spawnSync(process.execPath, [script, asar, '--cli', toolchain], {cwd:resolve(desktopRoot), stdio:'inherit', windowsHide:true})
if(result.error) throw result.error
process.exitCode = result.status ?? 1
