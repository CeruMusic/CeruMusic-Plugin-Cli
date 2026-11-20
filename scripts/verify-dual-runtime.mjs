import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

if (!process.argv[2] || !process.env.npm_execpath)
  throw Error(
    'npm run verify:dual-runtime -- <frozen-v2-checkout> (build and pack both worktrees first)',
  )
const old = resolve(process.argv[2]),
  current = fileURLToPath(new URL('../', import.meta.url)),
  root = await mkdtemp(join(tmpdir(), 'ceru-dual-runtime-'))
const scope = '@shiqianjiang/ceru-plugin-',
  legacy = 'ceru-plugin-core-v2'
let stopPackedBuild
const deps = {},
  files = {},
  workers = []
const samples = 4410,
  audio = Buffer.alloc(44 + samples * 2)
audio.write('RIFF')
audio.writeUInt32LE(audio.length - 8, 4)
audio.write('WAVEfmt ', 8)
audio.writeUInt32LE(16, 16)
audio.writeUInt16LE(1, 20)
audio.writeUInt16LE(1, 22)
audio.writeUInt32LE(44100, 24)
audio.writeUInt32LE(88200, 28)
audio.writeUInt16LE(2, 32)
audio.writeUInt16LE(16, 34)
audio.write('data', 36)
audio.writeUInt32LE(samples * 2, 40)
for (let frame = 0; frame < samples; frame++)
  audio.writeInt16LE(
    Math.round(1024 * Math.sin((frame * 2 * Math.PI * 440) / 44100)),
    44 + frame * 2,
  )
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'audio/wav' })
  response.end(audio)
})
try {
  await mkdir(join(root, 'vendor'))
  for (const [tree, version, names] of [
    [old, '0.3.16', ['core', 'sdk', 'issuer']],
    [current, '3.0.0', ['core', 'sdk', 'issuer', 'cli']],
  ]) {
    for (const name of names) {
      const file = 'shiqianjiang-ceru-plugin-' + name + '-' + version + '.tgz'
      await copyFile(join(tree, 'artifacts', file), join(root, 'vendor', file))
      files[name + version] = 'file:vendor/' + file
      if (version === '3.0.0') deps[scope + name] = files[name + version]
    }
  }
  deps[legacy] = files['core0.3.16']
  const overrides = {
    [legacy]: { [scope + 'sdk']: files['sdk0.3.16'], [scope + 'issuer']: files['issuer0.3.16'] },
  }
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies: deps, overrides }),
  )
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'install',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  )
  const local = createRequire(join(root, 'package.json')),
    load = (file) => import(pathToFileURL(file).href)
  stopPackedBuild = createRequire(local.resolve(scope + 'cli'))('esbuild').stop
  const pkg = async (file) =>
    JSON.parse(await readFile(join(dirname(file), '../package.json'), 'utf8'))
  const generations = []
  for (const [name, version] of [
    [legacy, '0.3.16'],
    [scope + 'core', '3.0.0'],
  ]) {
    const file = local.resolve(name),
      runtime = createRequire(file),
      issuer = runtime.resolve(scope + 'issuer')
    for (const entry of [
      file,
      issuer,
      runtime.resolve(scope + 'sdk'),
      createRequire(issuer).resolve(scope + 'sdk'),
    ])
      assert.equal((await pkg(entry)).version, version)
    const { NodePluginSandbox } = await load(local.resolve(name + '/node'))
    generations.push({ NodePluginSandbox, issuer: await load(issuer) })
  }
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const previewUrl = 'http://127.0.0.1:' + server.address().port + '/preview.wav'
  const project = join(root, 'source'),
    cli = await load(local.resolve(scope + 'cli'))
  await cli.scaffoldProject(project, { template: 'source', language: 'ts' })
  const configFile = join(project, 'ceru.plugin.json'),
    config = JSON.parse(await readFile(configFile, 'utf8'))
  config.config.previewUrl = previewUrl
  await writeFile(configFile, JSON.stringify(config))
  execFileSync(
    process.execPath,
    [join(dirname(local.resolve(scope + 'cli')), 'bin.js'), 'build', '--project', project],
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  )
  const hookProject=join(root,'hook-author'), bin=join(dirname(local.resolve(scope+'cli')),'bin.js')
  const command=(args,cwd=root)=>execFileSync(process.execPath,[bin,...args],{cwd,windowsHide:true,encoding:'utf8'})
  command(['init',hookProject,'--template','playback-hook','--lang','ts'])
  const scenarioOutput=command(['test-hooks'],hookProject)
  const scenarios = JSON.parse(await readFile(join(hookProject,'tests/hooks.json'),'utf8'))
  for (const scenario of scenarios) assert.ok(scenarioOutput.includes('PASS ' + scenario.name),scenario.name)
  assert.ok(scenarioOutput.includes(scenarios.length + ' hook scenarios passed'))
  command(['validate','dist/plugin.js'],hookProject)
  console.log('Packed CLI: generated TS hook project, ' + scenarios.length + ' worker scenarios, and artifact validation passed.')
  const inputs = [
    await readFile(join(old, 'test/fixtures/v2-compat/earliest-source.js')),
    await readFile(join(project, 'dist/plugin.js')),
  ]
  for (let index = 0; index < 2; index++) {
    const { issuer, NodePluginSandbox } = generations[index],
      artifact = issuer.readArtifact(inputs[index])
    assert.equal(generations[1].issuer.sniffManifestVersion(inputs[index]), index + 2)
    assert.throws(() => generations[1 - index].issuer.readArtifact(inputs[index]))
    const worker = new NodePluginSandbox(
      async (method) => {
        if (method === 'config.get') return artifact.header.manifest.config
        throw Error('Unexpected ' + method)
      },
      () => {},
    )
    workers.push(worker)
    await worker.start(artifact)
  }
  const [oldPage, page] = await Promise.all(
    workers.map((worker, index) =>
      worker.invoke('provider', index ? 'catalog' : 'early', 'tracks.search', [
        { query: index ? 'Morning' : '第一首歌', limit: 10 },
      ]),
    ),
  )
  const [oldTrack] = oldPage.items,
    [track] = page.items
  assert.equal(oldTrack.title, '第一首歌')
  assert.equal(track.title, 'Morning Light')
  const [url, lyrics, oldLyrics] = await Promise.all([
    workers[1].invoke('provider', 'catalog', 'tracks.resolve', [track.ref, {}]),
    workers[1].invoke('provider', 'catalog', 'tracks.lyrics', [track.ref]),
    workers[0].invoke('provider', 'early', 'tracks.lyrics', [oldTrack.ref]),
  ])
  assert.equal(url.url, previewUrl)
  assert.deepEqual(Buffer.from(await (await fetch(url.url)).arrayBuffer()), audio)
  assert.equal(lyrics.lines[0].text, 'Morning Light')
  assert.equal(oldLyrics.lines[0].text, '第一行')
  const projectToMigrate = join(root, 'migrated-source')
  const frozenCli = await load(join(old, 'packages/cli/dist/index.js'))
  await frozenCli.scaffoldProject(projectToMigrate, { template: 'source', language: 'js' })
  const originalBuild = await frozenCli.buildProject(projectToMigrate)
  const originalArtifact = generations[0].issuer.readArtifact(await readFile(originalBuild.path))
  const originalLogic = await readFile(join(projectToMigrate, 'src/index.js'))
  await cli.runCli(['migrate', '--project', projectToMigrate])
  assert.deepEqual(await readFile(join(projectToMigrate, 'src/index.js')), originalLogic)
  const migratedBuild = await cli.buildProject(projectToMigrate, { out: 'dist/migrated.js' })
  const migratedArtifact = generations[1].issuer.readArtifact(await readFile(migratedBuild.path))
  assert.equal(migratedArtifact.header.manifest.id, originalArtifact.header.manifest.id)
  const observations = []
  for (const [index, artifact] of [originalArtifact, migratedArtifact].entries()) {
    const worker = new generations[index].NodePluginSandbox(async (method) => {
      assert.equal(method, 'config.get')
      return artifact.header.manifest.config
    }, () => {})
    workers.push(worker)
    await worker.start(artifact)
    const result = await worker.invoke('provider', 'catalog', 'tracks.search', [{ query: 'rain', limit: 5 }])
    const resolution = await worker.invoke('provider', 'catalog', 'tracks.resolve', [result.items[0].ref, '128k'])
    observations.push({ result, ok: resolution.ok, error: resolution.error?.code })
  }
  assert.equal(observations[0].result.items[0].title, 'Rainy Afternoon')
  assert.deepEqual(observations[1], observations[0])
  console.log('Migrated frozen source template: same ID, unchanged source, identical worker search and resolve behavior.')
  console.log(
    'Packed v2 + v3: isolated Core/issuer/SDK versions, concurrent workers, search, WAV bytes and lyrics verified.',
  )
} finally {
  await stopPackedBuild?.()
  for (const worker of workers) worker.dispose()
  server.closeAllConnections()
  if (server.listening) await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
