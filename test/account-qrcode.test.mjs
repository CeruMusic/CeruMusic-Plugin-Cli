import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject, scaffoldProject } from '../packages/cli/dist/project.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

for (const language of ['ts', 'js']) {
  test(`${language} QR scaffold uses default, component or HTML inside the same login operation`, async () => {
    const project = await mkdtemp(join(process.cwd(), '.test-tmp-'))
    try {
      await scaffoldProject(project, { template: 'account-qrcode', language })
      const file = join(project, 'src/index.' + language)
      const original = await readFile(file, 'utf8')
      for (const view of [undefined, 'login', 'login-html']) {
        await writeFile(file, original.replace("const loginView = 'login'", 'const loginView = ' + JSON.stringify(view)))
        const artifact = readArtifact(await readFile((await buildProject(project)).path))
        // Components are factories consuming the host dependencies, not a second Vue runtime.
        assert.ok(artifact.modules['view.login'].length < 12000)
        let runtime, received
        runtime = new NodePluginSandbox(async (method, data) => {
          assert.equal(method, 'accounts.qrcode')
          received = data
          assert.equal(data.view, view)
          assert.equal(data.ticket, 'host-only-ticket')
          const statuses = []
          for (let attempt = 0; attempt < 11; attempt++) {
            const result = await runtime.invoke('account', 'demo', 'qrPoll', [{ ticket: data.ticket }])
            statuses.push(result.status)
            if (result.status === 'done') {
              assert.deepEqual(statuses, [...Array(5).fill('waiting'), ...Array(5).fill('scanned'), 'done'])
              return { credential: result.credential }
            }
          }
          assert.fail('Demo did not complete')
        }, () => {})
        try {
          await runtime.start(artifact)
          assert.deepEqual(await runtime.invoke('account', 'demo', 'login', [{ method: 'qrcode', ticket: 'host-only-ticket' }]), { credential: 'synthetic-demo-only' })
          assert.match(received.image, /^data:image\/png;base64,/)
          await assert.rejects(runtime.invoke('account', 'demo', 'qrPoll', [{ ticket: 'host-only-ticket' }]))
        } finally { runtime.dispose() }
      }
    } finally { await rm(project, { recursive: true, force: true, maxRetries: 3 }) }
  })
}
