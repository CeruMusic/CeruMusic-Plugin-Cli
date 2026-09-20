import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const workspace = fileURLToPath(new URL('../', import.meta.url))

test('CLI reports the version from its package metadata', async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(workspace, 'packages/cli/package.json'), 'utf8'),
  )
  const result = spawnSync(
    process.execPath,
    [resolve(workspace, 'packages/cli/dist/bin.js'), '--version'],
    {
      cwd: workspace,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.equal(result.stdout.trim(), packageJson.version)
})
