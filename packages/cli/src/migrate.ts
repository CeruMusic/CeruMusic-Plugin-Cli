import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseJsonStrict, validateManifest } from '@shiqianjiang/ceru-plugin-issuer'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'
import { writeAtomic } from './project.js'

function checkFields(value: Record<string, unknown>, fields: string[], label: string) {
  for (const key of Object.keys(value))
    if (!fields.includes(key)) throw new Error('Cannot migrate unknown ' + label + '.' + key)
}

export function migrateManifest(source: Record<string, any>): PluginManifest {
  if (source.manifestVersion !== 2) throw new Error('Expected a v2 manifest')
  const { modules, contributes = {}, engines, permissions, ...metadata } = source
  if (!modules || !engines) throw new Error('Missing v2 modules or engines')
  checkFields(modules, ['logic', 'share', 'surfaces'], 'modules')
  checkFields(
    contributes,
    [
      'providers',
      'playlistImporters',
      'lyricConverters',
      'accountItems',
      'commands',
      'guestAdapters',
      'sidebarItems',
      'settingsPages',
      'homeSections',
      'playlistSections',
      'uiExtensions',
      'menus',
      'styles',
    ],
    'contributes',
  )
  if (modules.surfaces?.some((view: any) => view.kind === 'schema'))
    throw new Error(
      'modules.surfaces: convert schema views to native or web views first; project left unchanged',
    )
  if (contributes.accountItems?.length)
    throw new Error(
      'contributes.accountItems: implement the v3 account login methods first; project left unchanged',
    )
  const renameEntry = ({ entry, ...options }: Record<string, any>) => ({
    ...options,
    module: entry,
  })
  const actionIds = new Map<string, string>(
    (contributes.commands ?? []).map((item: any) => [item.id, item.action]),
  )
  const entry: Record<string, any> = {}
  for (const key of ['logic', 'share']) if (modules[key]) entry[key] = renameEntry(modules[key])
  if (entry.logic?.activation)
    entry.logic.activation = entry.logic.activation.map((event: string) =>
      event.startsWith('onCommand:')
        ? 'onCommand:' + (actionIds.get(event.slice(10)) ?? event.slice(10))
        : event,
    )
  if (modules.surfaces) entry.views = modules.surfaces.map(renameEntry)
  const provides: Record<string, any> = {},
    ui: Record<string, any> = {}
  for (const key of ['providers', 'lyricConverters', 'guestAdapters'])
    if (contributes[key]) provides[key] = contributes[key]
  if (contributes.playlistImporters) provides.importers = contributes.playlistImporters
  if (contributes.commands)
    provides.actions = contributes.commands.map(({ action, ...item }: any) => ({
      ...item,
      id: action,
    }))
  const pages = [
    ...(contributes.sidebarItems ?? []).map((item: any) => ({
      ...item,
      mount: 'sidebar',
      group: ['discover', 'library', 'tools'].includes(item.group) ? item.group : 'tools',
    })),
    ...(contributes.settingsPages ?? []).map((item: any) => ({ ...item, mount: 'settings' })),
    ...(contributes.playlistSections ?? []).map((item: any) => ({
      ...item,
      mount: 'playlist-section',
    })),
    ...(contributes.homeSections ?? [])
      .filter((item: any) => item.kind === 'custom')
      .map(({ kind, providerIds, ...item }: any) => ({ ...item, mount: 'home-tab' })),
  ]
  if (pages.length) ui.pages = pages
  if (contributes.homeSections)
    ui.homeSections = contributes.homeSections.filter((item: any) => item.kind !== 'custom')
  if (contributes.uiExtensions) ui.slots = contributes.uiExtensions
  if (contributes.styles) ui.styles = contributes.styles
  if (contributes.menus)
    ui.menus = contributes.menus.map((item: any) => ({
      ...item,
      commandId: actionIds.get(item.commandId) ?? item.commandId,
    }))
  const { uiSchema, ...runtime } = engines
  const manifest = {
    ...metadata,
    manifestVersion: 3,
    engines: { ...runtime, hostApi: '^3.0.0' },
    entry,
    ...(Object.keys(provides).length ? { provides } : {}),
    ...(permissions ? { uses: { permissions } } : {}),
    ...(Object.keys(ui).length ? { ui } : {}),
  }
  validateManifest(manifest)
  return manifest
}

export async function migrateProject(directory: string): Promise<void> {
  const file = resolve(directory, 'ceru.plugin.json')
  const config = parseJsonStrict(await readFile(file, 'utf8'))
  config.manifest = migrateManifest(config.manifest)
  await writeAtomic(file, JSON.stringify(config, null, 2) + '\n', true)
  console.log(
    'Migrated manifest only. Review provider methods: search/resolve/lyrics → tracks.*, categories/list → playlists.*, share → sharing.describe. Plugin source and dependencies were not modified.',
  )
}
