import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scaffoldProject, buildProject } from '../packages/cli/dist/project.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

test('the documented music consumer builds and plays only an authorized, playable result', async () => {
  const guide = await readFile(new URL('../docs/HOST-SERVICES.md', import.meta.url), 'utf8')
  const example = guide.split('#### 示例：搜索本地音源并播放第一首')[1].split(/^#/m)[0]
  const snippet = language => {
    const block = example.match(new RegExp('```' + language + '\\r?\\n([\\s\\S]*?)\\r?\\n```'))
    assert.ok(block, 'Missing documented ' + language + ' example')
    return block[1]
  }
  const project = await mkdtemp(join(process.cwd(), '.test-tmp-'))
  const ref = { kind: 'track', pluginId: 'host', providerId: 'local', id: 'fixture' }
  const available = [{ id: 'local', available: true }]
  const results = [{ ref: { ...ref, id: 'unplayable' }, playable: false }, { ref, title: '测试歌曲' }]
  try {
    await scaffoldProject(project, { template: 'source', language: 'ts' })
    await writeFile(join(project, 'ceru.plugin.json'), snippet('json'))
    await writeFile(join(project, 'src/index.ts'), snippet('ts'))
    const artifact = readArtifact(await readFile((await buildProject(project)).path))
    for (const [read, sources, items, control, expected, calls] of [
      [false, available, results, true, '未获搜索授权', ['musicRead']],
      [true, [], results, true, '本地音源不可用', ['musicRead', 'music.sources']],
      [true, available, [], true, '没有匹配曲目', ['musicRead', 'music.sources', 'music.search']],
      [true, available, results, false, '未获播放授权', ['musicRead', 'music.sources', 'music.search', 'musicControl']],
      [true, available, results, true, '测试歌曲', ['musicRead', 'music.sources', 'music.search', 'musicControl', 'music.play']],
    ]) {
      const seen = []
      const worker = new NodePluginSandbox(async (method, data) => {
        if (method === 'permissions.requestGroup') {
          seen.push(data.group)
          return { status: (data.group === 'musicRead' ? read : control) ? 'granted' : 'denied' }
        }
        seen.push(method)
        if (method === 'music.sources') return sources
        if (method === 'music.search') {
          assert.deepEqual(data.args.slice(0, 2), ['local', { query: '测试', kinds: ['track'], filters: {}, limit: 10 }])
          assert.equal(data.args[2].permissionKey, 'lookup')
          return { items }
        }
        assert.equal(method, 'music.play')
        assert.deepEqual(data.args[0], ref)
        assert.equal(data.args[1].permissionKey, 'listen')
        return null
      }, () => {})
      try {
        await worker.start(artifact)
        assert.equal(await worker.invoke('action', 'play-first', '', [{}]), expected)
        assert.deepEqual(seen, calls)
      } finally { worker.dispose() }
    }
  } finally { await rm(project, { recursive: true, force: true, maxRetries: 3 }) }
})
