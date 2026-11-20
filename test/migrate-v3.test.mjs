import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProject } from '../packages/cli/dist/index.js'
import { migrateProject } from '../packages/cli/dist/migrate.js'
import { readArtifact } from '../packages/issuer/dist/index.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'

const template = {
  manifestVersion: 2,
  id: 'test.migration',
  name: 'Metadata',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main', activation: ['onCommand:display'] } },
  contributes: { commands: [{ id: 'display', action: 'open', title: 'Open' }] },
  permissions: [],
}

test('manifest-only migration preserves plugin id, source, config and action registration', async (context) => {
  const dir = await mkdtemp(join(fileURLToPath(new URL('../', import.meta.url)), '.test-tmp-'))
  context.after(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'src'))
  const file = join(dir, 'ceru.plugin.json'),
    code = "export default function(ctx){ctx.actions.register('open',()=>ctx.host.apiVersion)}"
  await writeFile(join(dir, 'src/index.js'), code)
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        module: 'NodeNext',
        target: 'ES2022',
        skipLibCheck: true,
      },
      include: ['src'],
    }),
  )
  const before = {
    manifest: template,
    config: { preserve: 1 },
    entries: { 'logic.main': 'src/index.js' },
  }
  await writeFile(file, JSON.stringify(before))
  await migrateProject(dir)
  const migrated = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(migrated.manifest.id, template.id)
  assert.deepEqual(migrated.config, before.config)
  assert.deepEqual(migrated.entries, before.entries)
  assert.equal(await readFile(join(dir, 'src/index.js'), 'utf8'), code)
  assert.deepEqual(migrated.manifest.entry.logic.activation, ['onCommand:open'])
  assert.deepEqual(migrated.manifest.provides.actions, [{ id: 'open', title: 'Open' }])
  const artifact = readArtifact(await readFile((await buildProject(dir)).path))
  const worker = new NodePluginSandbox(
    async () => null,
    () => {},
  )
  try {
    await worker.start(artifact)
    assert.equal(await worker.invoke('action', 'open', '', [{}]), '3.0.0')
  } finally {
    worker.dispose()
  }
  migrated.manifest.entry.logic.module = './src/index.js'
  delete migrated.entries
  await writeFile(file, JSON.stringify(migrated))
  assert.ok(readArtifact(await readFile((await buildProject(dir)).path)).modules['logic.main'])
  before.manifest = {
    ...template,
    modules: { surfaces: [{ id: 'legacy', kind: 'schema', entry: 'resource' }] },
  }
  const original = JSON.stringify(before)
  await writeFile(file, original)
  await assert.rejects(migrateProject(dir), /schema views/)
  assert.equal(await readFile(file, 'utf8'), original)
})
