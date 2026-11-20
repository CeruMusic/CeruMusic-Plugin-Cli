import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { createDispatcher, type HostServices } from '@shiqianjiang/ceru-plugin-core/dispatch'
import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import { parseJsonStrict } from '@shiqianjiang/ceru-plugin-issuer'
import { buildProject } from './project.js'
import { developmentPluginServices, readMockServices } from './dev-plugin-services.js'

export async function testServices(project: string, fixture = 'tests/services.json', report = console.log) {
  const path = resolve(project, fixture)
  if ((await stat(path)).size > 1024 * 1024) throw Error('Service fixture must be at most 1 MiB')
  const cases = parseJsonStrict(await readFile(path, 'utf8'))
  if (!Array.isArray(cases) || !cases.length || cases.length > 100) throw Error('Expected 1–100 service scenarios')
  const mocks = await readMockServices(project)
  const built = await buildProject(project)
  const { artifact } = readPluginArtifact(await readFile(built.path))
  const manifest = artifact.header.manifest
  for (const [index, scenario] of cases.entries()) {
    const label = scenario?.name ?? 'case ' + (index + 1)
    if (!scenario || !manifest.provides?.actions?.some(action => action.id === scenario.action) ||
        typeof scenario.granted !== 'boolean' || Object.hasOwn(scenario, 'expect') === Object.hasOwn(scenario, 'error') ||
        (Object.hasOwn(scenario, 'error') && (typeof scenario.error !== 'string' || !scenario.error)))
      throw Error('Invalid service scenario: ' + label)
    const services = developmentPluginServices(manifest, mocks)
    const dispatch = createDispatcher(services as HostServices, {
      manifest, pluginId: manifest.id, log: {debug() {}, info() {}, warn() {}, error() {}},
      async authorize(key, permission) {
        if (permission !== 'services.consume' || !scenario.granted ||
            !manifest.uses?.permissions?.some(item => item.key === key && item.name === permission))
          throw Error('Permission denied: ' + permission)
      },
    })
    const worker = new NodePluginSandbox(dispatch, () => {})
    try {
      await worker.start(artifact)
      const action = worker.invoke('action', scenario.action, '', [scenario.input ?? null])
      if (Object.hasOwn(scenario, 'error')) await assert.rejects(action, { message: `[action:${scenario.action}] ${scenario.error}` })
      else assert.deepEqual(await action, structuredClone(scenario.expect))
      report('PASS ' + label)
    } catch (error) {
      throw Error('Service scenario “' + label + '” failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally { worker.dispose() }
  }
  report(cases.length + ' service scenarios passed (local mock; no desktop or real provider).')
}
