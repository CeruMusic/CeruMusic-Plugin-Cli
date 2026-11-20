import { MusicRegistry } from '@shiqianjiang/ceru-plugin-core/music'
import type { HostServices } from '@shiqianjiang/ceru-plugin-core/dispatch'
import type { ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export function developmentMusic() {
  const registry = new MusicRegistry()
  const ref: ResourceRef = { id: 'sample', providerId: 'dev', scope: 'provider', kind: 'track' }
  const track = {
    ref,
    title: 'Development Track',
    metadata: { artists: ['Ceru'] },
    capabilities: ['play'],
  }
  const empty = { items: [] }
  registry.register(
    {
      pluginId: 'development',
      providerId: 'dev',
      runtime: 3,
      declaration: { id: 'dev', name: '开发示例音源', protocols: ['tracks.search'] },
      methods: [
        'tracks.search',
        'tracks.suggest',
        'tracks.hotSearch',
        'tracks.resolve',
        'tracks.lyrics',
        'tracks.artwork',
        'playlists.search',
        'playlists.categories',
        'playlists.list',
        'playlists.get',
        'charts.list',
        'charts.getTracks',
      ],
    },
    async (method, args) => {
      if (method === 'tracks.search')
        return {
          items: track.title.toLowerCase().includes(args[0].query.toLowerCase()) ? [track] : [],
        }
      if (method === 'tracks.suggest' || method === 'tracks.hotSearch') return [track.title]
      if (method === 'tracks.resolve')
        return { ok: false, error: { code: 'UNSUPPORTED', message: '开发示例不提供真实媒体' } }
      if (method === 'tracks.lyrics')
        return {
          format: 'crlyric',
          version: 1,
          track: ref,
          offsetMs: 0,
          lines: [],
          plainText: track.title,
        }
      if (method === 'tracks.artwork') return undefined
      return empty
    },
  )
  const handle =
    (method: Parameters<MusicRegistry['invoke']>[0]): HostServices['music.search'] =>
    (data, ctx) =>
      registry.invoke(method, data.args, ctx.pluginId, {
        id: 'dev',
        deadlineAt: Date.now() + 30000,
        signal: ctx.signal!,
      })
  return {
    'music.sources': handle('music.sources'),
    'music.search': handle('music.search'),
    'music.suggest': handle('music.suggest'),
    'music.hotSearch': handle('music.hotSearch'),
    'music.tracks.resolve': handle('music.tracks.resolve'),
    'music.tracks.lyrics': handle('music.tracks.lyrics'),
    'music.tracks.artwork': handle('music.tracks.artwork'),
    'music.playlists.search': handle('music.playlists.search'),
    'music.playlists.categories': handle('music.playlists.categories'),
    'music.playlists.list': handle('music.playlists.list'),
    'music.playlists.get': handle('music.playlists.get'),
    'music.charts.list': handle('music.charts.list'),
    'music.charts.getTracks': handle('music.charts.getTracks'),
    'music.importers.list': handle('music.importers.list'),
    'music.importers.parse': handle('music.importers.parse'),
    'music.play': async () => {
      throw Error('开发示例不连接播放器，请在桌面宿主试听')
    },
    'music.enqueue': async () => {
      throw Error('开发示例不连接播放队列，请在桌面宿主验证')
    },
  } satisfies Pick<HostServices, Extract<keyof HostServices, `music.${string}`>>
}
