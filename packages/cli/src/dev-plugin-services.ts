import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ServiceRouter } from '@shiqianjiang/ceru-plugin-core/services'
import { RPC } from '@shiqianjiang/ceru-plugin-core/contract'
import { parseJsonStrict } from '@shiqianjiang/ceru-plugin-issuer'
import type { HostServices } from '@shiqianjiang/ceru-plugin-core/dispatch'
import type { PluginManifest, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

export type MockService = {
  pluginId: string
  service: string
  version: string
  returns: Record<string, JsonValue>
}
export async function readMockServices(root: string): Promise<MockService[]> {
  try {
    const config = parseJsonStrict(await readFile(join(root, 'ceru.config.json'), 'utf8'))
    const rows = config.mockServices ?? []
    if (!Array.isArray(rows) || rows.length > 128) throw Error('Invalid mockServices')
    return rows as MockService[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
export function developmentPluginServices(
  manifest: PluginManifest,
  rows: MockService[],
): Partial<HostServices> {
  const router = new ServiceRouter(),
    grouped = new Map<string, MockService[]>()
  for (const row of rows) {
    if (
      !row ||
      !row.pluginId ||
      !row.service ||
      !row.version ||
      !row.returns ||
      typeof row.returns !== 'object' ||
      Array.isArray(row.returns)
    )
      throw Error('Invalid mock service')
    const group = grouped.get(row.pluginId) ?? []
    group.push(row)
    grouped.set(row.pluginId, group)
  }
  for (const [id, records] of grouped) {
    const mock = router.connect(
      {
        ...manifest,
        id,
        provides: {
          services: records.map((row) => ({
            id: row.service,
            version: row.version,
            methods: Object.keys(row.returns),
          })),
        },
        uses: {},
      },
      async (service, method) => records.find((row) => row.service === service)!.returns[method],
      () => {},
    )
    for (const row of records) mock.register(row.service, Object.keys(row.returns))
    mock.attach()
  }
  const missing = router.missing(manifest.uses?.plugins ?? [])
  if (missing) throw Error('Missing plugin dependency: ' + missing.pluginId + ' / ' + missing.service + ' ' + missing.version)
  const caller = router.connect(
    manifest,
    async () => {
      throw Error('Use the desktop Host to call the current plugin')
    },
    () => {},
  )
  return {
    [RPC.plugins.list]: async () => caller.list(),
    [RPC.plugins.use]: async (data) => caller.use(data.pluginId, data.service),
    [RPC.plugins.registerService]: async (data) => {
      caller.register(data.id, data.methods)
      return null
    },
    [RPC.plugins.invoke]: (data, ctx) =>
      caller.invoke(data.pluginId, data.service, data.method, data.input, ctx.signal!),
  }
}
