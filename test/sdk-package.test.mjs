import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const workspace = fileURLToPath(new URL('../', import.meta.url))

test('packed SDK exposes Guest, share, storage and desktop contracts to an isolated consumer', async () => {
  const npmCli = process.env.npm_execpath
  assert.ok(npmCli, 'Run this test through npm test or npm run test:sdk-package')
  const consumer = await mkdtemp(join(tmpdir(), 'ceru-sdk-package-'))
  const run = (args, cwd = consumer) => {
    const result = spawnSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message)
    return result.stdout
  }
  const packed = JSON.parse(
    run(
      [npmCli, 'pack', '--json', '--pack-destination', consumer],
      join(workspace, 'packages/sdk'),
    ),
  )[0]
  const files = new Set(packed.files.map((file) => file.path))
  for (const file of [
    'dist/guests.js',
    'dist/guests.d.ts',
    'dist/share.js',
    'dist/share.d.ts',
    'dist/storage.js',
    'dist/storage.d.ts',
    'dist/host-modules.d.cts',
  ])
    assert.ok(files.has(file), 'Missing packed file: ' + file)

  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  run([
    npmCli,
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--prefer-offline',
    join(consumer, packed.filename),
  ])
  const installed = JSON.parse(
    await readFile(
      join(consumer, 'node_modules/@shiqianjiang/ceru-plugin-sdk/package.json'),
      'utf8',
    ),
  )
  assert.equal(installed.version, packed.version)

  await writeFile(
    join(consumer, 'index.ts'),
    `
import {
  definePlugin, defineGuestAdapter, defineManifest,
  type PluginContext, type OperationContext,
  type GuestInfo, type GuestProvider, type GuestAPI, type GuestBootstrapAPI,
  type ShareMusicInfo, type ShareResolverContext, type ShareResolver, type ShareResolverEntry,
  type PluginStorageAPI, type PluginStorageReadKey, type PluginStorageWriteKey
} from '@shiqianjiang/ceru-plugin-sdk'
import type { GuestInfo as SubpathGuest, GuestBootstrapAPI as SubpathBootstrap } from '@shiqianjiang/ceru-plugin-sdk/guests'
import type { ShareResolverEntry as SubpathShare } from '@shiqianjiang/ceru-plugin-sdk/share'
import type { PluginStorageAPI as SubpathStorage } from '@shiqianjiang/ceru-plugin-sdk/storage'
import hostHttp from '@ceru/http'
const httpClient: PluginContext['http'] = hostHttp

const guest: GuestInfo = {
  id: 'guest', adapterId: 'legacy', name: 'Demo', version: '1.0.0',
  state: 'ready', selected: false, providers: []
}
const fromSubpath: SubpathGuest = guest
const factory: ShareResolverEntry<{ endpoint: string }> = (ctx) => ({
  async musicUrl(_source, _info, _quality) { return ctx.config.endpoint }
})
const shareFromSubpath: SubpathShare<{ endpoint: string }> = factory

defineGuestAdapter((ctx) => {
  const api: GuestBootstrapAPI & SubpathBootstrap = ctx
  api.ready({ providers: [{ id: 'demo', name: ctx.scriptInfo.name, qualities: [], protocols: [] }] })
  return api.handle(async (_method, input, operation) => {
    operation.signal.throwIfAborted()
    return input
  })
})

definePlugin((ctx) => {
  const guests: GuestAPI = ctx.guests
  const storage: PluginStorageAPI & SubpathStorage = ctx.storage
  ctx.actions.register('demo', async (_input, operation) => {
    const imported: GuestInfo | null = await guests.import('legacy')
    await guests.select(imported?.id ?? null)
    if (imported) await guests.remove(imported.id)
    const value: { count: number } | null = await storage.get<{ count: number }>({ pluginId: 'example.owner', key: 'summary' })
    await storage.set({ key: 'summary', readableBy: ['example.reader'] }, value)
    await storage.delete('old')
    await ctx.ui.playlistImport.open({ title: 'Import playlist' })
    const result = await ctx.ui.pluginUpdate.request({ version: '1.1.0', url: 'https://example.com/plugin.js' })
    // @ts-expect-error Read access cannot set another plugin's reader policy.
    storage.get({ key: 'summary', readableBy: '*' })
    // @ts-expect-error Reader policies are a wildcard or plugin IDs, not numbers.
    storage.set({ key: 'summary', readableBy: 42 }, null)
    return { queued: result.queued ?? false }
  })
})

defineManifest({
  manifestVersion: 2, id: 'example.demo', name: 'Demo', version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'main' }, share: { entry: 'share', configKeys: ['endpoint'] } },
  contributes: {
    commands: [{ id: 'demo', title: 'Demo', description: 'Description', action: 'demo' }],
    guestAdapters: [{
      id: 'legacy', title: 'Legacy', extensions: ['js'], format: 'legacy',
      compatibilityProfile: 'legacy@1', bootstrap: 'guest', runtime: 'ceru-js@1',
      projectableProtocols: [],
      badge: { label: 'Legacy', backgroundColor: '#000000', textColor: '#ffffff' }
    }]
  }
})
`,
  )
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        lib: ['ES2022', 'DOM'],
      },
      files: ['index.ts'],
    }),
  )
  run([
    resolve(workspace, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(consumer, 'tsconfig.json'),
  ])
  run([
    resolve(workspace, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(consumer, 'tsconfig.json'),
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
  ])
  run([
    '--input-type=module',
    '-e',
    `
    import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk';
    await import('@shiqianjiang/ceru-plugin-sdk/guests');
    await import('@shiqianjiang/ceru-plugin-sdk/share');
    await import('@shiqianjiang/ceru-plugin-sdk/storage');
    if (typeof definePlugin !== 'function') throw new Error('Broken SDK root export');
  `,
  ])
})
