import { watch } from 'node:fs'
import { resolve, relative } from 'node:path'
import { buildProject, loadProject } from './project.js'
import { VueWatchTypes } from './watch-vue-types.js'
import type { WatchComponentCache } from './component.js'

export async function watchProject(
  project: string,
  signal: AbortSignal,
  report: (message: string) => void = console.log,
) {
  const { root, config } = await loadProject(project)
  const out = resolve(root, config.output ?? 'dist/plugin.js')
  let timer: ReturnType<typeof setTimeout> | undefined, current: Promise<void> | undefined
  const changes = new Set<string>(['ceru.plugin.json'])
  const componentCache: WatchComponentCache = new Map()
  let types: VueWatchTypes | undefined
  const rebuild = () => {
    if (!current)
      current = (async () => {
        while (changes.size && !signal.aborted) {
          const files = [...changes]
          changes.clear()
          if (files.some((file) => !file.endsWith('.vue'))) {
            types = undefined
            componentCache.clear()
          }
          try {
            const result = await buildProject(
              root,
              {},
              (root, declarations) => {
                types ??= new VueWatchTypes(root)
                return types.check(declarations, files)
              },
              () => !changes.size && !signal.aborted,
              componentCache,
            )
            if (!changes.size && !signal.aborted) report('CERU_BUILD_READY ' + result.path)
          } catch (error) {
            if (!signal.aborted) report('CERU_ERROR ' + String(error))
          }
        }
      })().finally(() => {
        current = undefined
      })
    return current
  }
  signal.throwIfAborted()
  const watcher = watch(root, { recursive: true, signal }, (_event, file) => {
    if (!file) return
    const name = relative(root, resolve(root, file.toString())).replaceAll('\\', '/')
    if (
      /^(node_modules|dist|\.git|\.keys|\.ceru-dev)(\/|$)/.test(name) ||
      resolve(root, name) === out ||
      name.includes('.tmp')
    )
      return
    changes.add(name)
    clearTimeout(timer)
    timer = setTimeout(rebuild, 40)
  })
  try {
    report('在 CeruMusic 设置 → 插件管理 → 管理设置 → 插件开发者模式 中添加此文件：' + out)
    const closed = new Promise<void>((done, reject) => {
      watcher.once('close', done)
      watcher.once('error', reject)
    })
    await rebuild()
    await closed
  } finally {
    clearTimeout(timer)
    watcher.close()
    await current
  }
}
