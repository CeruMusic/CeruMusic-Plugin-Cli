import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject, scaffoldProject } from '../packages/cli/dist/project.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

for (const language of ['ts', 'js']) {
  test(`generated ${language} library follows the current account before playback`, async () => {
    const project = await mkdtemp(join(process.cwd(), '.test-tmp-'))
    let current = { connectionId: 'restored', expired: false }
    const runtime = new NodePluginSandbox(async (method, data) => {
      assert.equal(method, 'accounts.current')
      assert.equal(data.accountId, 'catalog')
      return current
    }, () => {})
    const action = name => runtime.invoke('action', name, '', [{}])
    try {
      await scaffoldProject(project, { template: 'connected-library', language })
      const artifact = readArtifact(await readFile((await buildProject(project)).path))
      assert.deepEqual({ ...artifact.header.manifest.ui.pages.find(page => page.id === 'connected').when },
        { selectedSource: 'catalog', predicate: 'connection.visible' })
      await runtime.start(artifact)
      for (const [account, visible, enter] of [
        [current, true, true],
        [{ connectionId: 'second', expired: false }, true, true],
        [{ connectionId: 'second', expired: true }, false, { login: { accountId: 'catalog', connectionId: 'second' } }],
        [null, false, { login: { accountId: 'catalog' } }],
      ]) {
        current = account
        assert.equal(await action('connection.visible'), visible)
        assert.equal((await action('account.summary')).signedIn, visible)
        assert.deepEqual(await action('catalog.enter'), enter)
      }
    } finally {
      runtime.dispose()
      await rm(project, { recursive: true, force: true, maxRetries: 3 })
    }
  })
}
