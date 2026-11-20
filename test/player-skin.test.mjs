import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildProject, scaffoldProject } from '../packages/cli/dist/project.js'
import { readArtifact } from '../packages/issuer/dist/index.js'
import { PLAYER_REGIONS, parsePlayerRegion } from '../packages/sdk/dist/index.js'
import { createWebSurfaceDocument } from '../packages/core/dist/surface-document.js'
import { VueWatchTypes } from '../packages/cli/dist/watch-vue-types.js'

test('region-only skin types keep Vue template diagnostics without loading TDesign declarations', async () => {
  const root = await mkdtemp(join(process.cwd(), '.test-tmp-'))
  try {
    await scaffoldProject(root, {template:'player-skin',language:'ts'})
    const types = new VueWatchTypes(root)
    const check = (_, declarations) => {
      const program = types.check(declarations,['src/Artwork.vue'])
      assert.ok(!program.getSourceFiles().some(file => file.fileName.includes('/tdesign-vue-next/')))
      return program
    }
    await buildProject(root,{},check)
    const artwork = join(root,'src/Artwork.vue'), source = await readFile(artwork,'utf8')
    await writeFile(artwork,source.replace(':artwork="props.artwork"', ':artwork="props.missingArtwork"'))
    await assert.rejects(buildProject(root,{},check), /missingArtwork/)
  } finally { await rm(root,{recursive:true,force:true,maxRetries:3}) }
})

test('region names default to version one and preserve future contract versions', () => {
  for (const name of PLAYER_REGIONS) {
    assert.deepEqual(parsePlayerRegion(name), { name, version: 1 })
    assert.deepEqual(parsePlayerRegion(name + '@2'), { name, version: 2 })
  }
  for (const name of ['player.artwork@0', 'player.stage@1.2', 'player.typo', 'desktopLyric@01', 'desktopLyric@9007199254740992']) assert.equal(parsePlayerRegion(name), null)
})

for (const language of ['ts', 'js']) test('build player skin from ' + language + ' snapshot', async () => {
  const root = await mkdtemp(join(process.cwd(), '.test-tmp-'))
  try {
    await scaffoldProject(root, { template: 'player-skin', language })
    const { path } = await buildProject(root, { development: true })
    const artifact = readArtifact(await readFile(path))
    const { entry, ui } = artifact.header.manifest
    assert.deepEqual(ui.skins[0].regions, ['player.lyrics', 'player.artwork', 'player.background'])
    for (const region of ui.regions) {
      const view = entry.views.find(item => item.id === region.view)
      assert.equal(view.kind, 'component')
      assert.match(artifact.modules[view.module], /useRegion/)
      assert.ok(artifact.modules[view.module].includes(region.region))
      const document = await createWebSurfaceDocument(artifact, view.id, 'test', {}, undefined, region.region + '@1')
      assert.deepEqual(document.init.mount, { kind: 'region', name: region.region, version: 1, props: {} })
      for (const unsupported of [region.region + '@2', 'player.stage', 'desktopLyric'])
        await assert.rejects(createWebSurfaceDocument(artifact, view.id, 'test', {}, undefined, unsupported), /unsupported player region/)
    }
    const configPath = join(root, 'ceru.plugin.json')
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(config.entries['view.lyrics'], 'src/BuiltinLyrics.vue')
    const release = await buildProject(root)
    const builtin = readArtifact(await readFile(release.path))
    assert.match(builtin.modules['view.lyrics'], /__ceruDeps\.sdk\["useHostComponents"\]/)
    assert.match(builtin.modules['view.lyrics'], /\bLyricAdapter\b/)
    assert.match(builtin.modules['view.lyrics'], /\bAmlLyricPlayer\b/)
    assert.match(builtin.modules['view.artwork'], /__ceruDeps\.sdk\["useHostComponents"\]/)
    assert.match(builtin.modules['view.artwork'], /\bVinylRecord\b/)
    assert.match(builtin.modules['view.artwork'], /\bSquareCover\b/)
    assert.doesNotMatch(JSON.stringify(builtin), /lyric-scroll-container|yrc-word|--yrc-mask-x|label-shine|ceru-hc-vinyl-disc|visualizer-canvas/)
    config.entries['view.lyrics'] = 'src/Lyrics.vue'
    await writeFile(configPath, JSON.stringify(config))
    const custom = readArtifact(await readFile((await buildProject(root)).path))
    assert.match(custom.modules['view.lyrics'], /aria-current/)
    assert.doesNotMatch(custom.modules['view.lyrics'], /\bLyricAdapter\b/)
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
