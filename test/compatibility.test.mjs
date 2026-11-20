import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { checkCompatibility, readHostCompatibility } from '../packages/cli/dist/compatibility.js'
import { scaffoldProject } from '../packages/cli/dist/project.js'

const host = {
  schemaVersion: 1,
  hostApi: '3.0.0',
  logicRuntime: 'ceru-js@1',
  componentLibraries: { vue: '3.5.43', 'tdesign-vue-next': '1.15.4' },
  regions: ['player.lyrics@1'],
}
async function fixture(run, component = true) {
  const root = await mkdtemp(join(tmpdir(), 'ceru-compat-'))
  const config = {
    manifest: {
      id: 'compat.test',
      engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
      entry: {
        views: component ? [{ id: 'view', kind: 'component' }] : [{ id: 'view', kind: 'web' }],
      },
    },
  }
  const pkg = { devDependencies: { vue: '^3.5.21', 'tdesign-vue-next': '^1.15.2' } }
  const save = async () => {
    await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify(config))
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  }
  const profile = join(root, 'host.json')
  await writeFile(profile, JSON.stringify(host))
  await save()
  try {
    await run({ root, config, pkg, save, profile })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('component compatibility reports unavailable local types without pretending to run them', () =>
  fixture(async ({ root, profile }) => {
    const result = await checkCompatibility(root, profile)
    assert.equal(result.compatible, true)
    assert.equal(result.componentViews, 1)
    assert.equal(result.target, 'host-profile')
    assert.equal(result.issues.filter((issue) => issue.code === 'dependency-unavailable').length, 2)
  }))

test('host API and logic runtime mismatches are blocking and machine readable', () =>
  fixture(async ({ root, config, save, profile }) => {
    config.manifest.engines = { hostApi: '^4.0.0', logicRuntime: 'ceru-js@2' }
    await save()
    const result = await checkCompatibility(root, profile)
    assert.equal(result.compatible, false)
    assert.deepEqual(
      result.issues.filter((issue) => issue.level === 'error').map((issue) => issue.code),
      ['version-mismatch', 'logic-runtime'],
    )
  }))

test('component dependency ranges reject incompatible host versions', () =>
  fixture(async ({ root, pkg, save, profile }) => {
    pkg.devDependencies.vue = '^4.0.0'
    pkg.devDependencies['tdesign-vue-next'] = '^2.0.0'
    await save()
    const result = await checkCompatibility(root, profile)
    assert.equal(result.compatible, false)
    assert.equal(result.issues.filter((issue) => issue.code === 'version-mismatch').length, 2)
  }))

test('standalone web views do not incorrectly require host component versions', () =>
  fixture(async ({ root, pkg, save, profile }) => {
    pkg.devDependencies.vue = '^4.0.0'
    await save()
    const result = await checkCompatibility(root, profile)
    assert.equal(result.componentViews, 0)
    assert.equal(result.compatible, true)
    assert.deepEqual(result.issues, [])
  }, false))

test('region revisions use exact contracts and accept the omitted @1 suffix', () =>
  fixture(async ({ root, config, save, profile }) => {
    config.manifest.ui = { regions: [{ region: 'player.lyrics' }] }
    await save()
    assert.equal((await checkCompatibility(root, profile)).compatible, true)
    config.manifest.ui.regions[0].region = 'player.lyrics@2'
    await save()
    assert.equal(
      (await checkCompatibility(root, profile)).issues.find(
        (issue) => issue.code === 'region-unavailable',
      ).level,
      'error',
    )
  }))

test('invalid profile versions and unsupported profile formats fail clearly', () => {
  for (const invalid of [
    { ...host, schemaVersion: 2 },
    { ...host, hostApi: '3' },
    { ...host, componentLibraries: {} },
    { ...host, regions: ['invalid'] },
  ])
    assert.throws(() => readHostCompatibility(invalid), /Invalid host compatibility profile/)
})

test('reports only public compatibility fields from the supplied host profile', () => {
  const profile = readHostCompatibility({
    ...host,
    credentials: 'not-for-output',
    appVersion: '2.5.0',
  })
  assert.equal(profile.credentials, undefined)
  assert.equal(profile.appVersion, '2.5.0')
  assert.notEqual(profile.regions, host.regions)
})

test('invalid dependency ranges do not silently pass', () =>
  fixture(async ({ root, pkg, save, profile }) => {
    pkg.devDependencies.vue = 'banana'
    await save()
    assert.equal(
      (await checkCompatibility(root, profile)).issues.find(
        (issue) => issue.code === 'invalid-range',
      ).level,
      'error',
    )
  }))

test('SDK supported versions still constrain wildcard project dependency ranges', () =>
  fixture(async ({ root, pkg, save, profile }) => {
    pkg.devDependencies.vue = '*'
    await save()
    await writeFile(
      profile,
      JSON.stringify({ ...host, componentLibraries: { ...host.componentLibraries, vue: '4.0.0' } }),
    )
    const result = await checkCompatibility(root, profile)
    assert.equal(result.compatible, false)
    assert.match(result.issues.find((issue) => issue.level === 'error').message, /SDK peer vue/)
  }))

test('CLI emits parseable JSON and nonzero status for incompatible declarations', () =>
  fixture(async ({ root, config, save, profile }) => {
    config.manifest.engines.hostApi = '^4.0.0'
    await save()
    const result = spawnSync(
      process.execPath,
      [
        resolve('packages/cli/dist/bin.js'),
        'check-compat',
        '--project',
        root,
        '--host',
        profile,
        '--json',
      ],
      { encoding: 'utf8', windowsHide: true },
    )
    assert.equal(result.status, 1, result.stderr)
    assert.equal(JSON.parse(result.stdout).compatible, false)
    assert.equal(JSON.parse(result.stdout).target, 'host-profile')
  }))

test('compatibility checks never evaluate config references or package scripts', () =>
  fixture(async ({ root, config, pkg, save, profile }) => {
    config.config = '@./missing-and-never-executed.ts'
    pkg.scripts = { preinstall: 'exit 92' }
    await save()
    const before = await readFile(join(root, 'ceru.plugin.json'), 'utf8')
    assert.equal((await checkCompatibility(root, profile)).compatible, true)
    assert.equal(await readFile(join(root, 'ceru.plugin.json'), 'utf8'), before)
  }))

test('new component scaffolds include compatibility command and bundled reference metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-compat-scaffold-'))
  try {
    await scaffoldProject(root, { template: 'player-skin', language: 'ts' })
    assert.equal(
      JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).scripts['check:compat'],
      'ceru-plugin check-compat',
    )
    const result = await checkCompatibility(root)
    assert.equal(result.target, 'bundled-runtime-reference')
    assert.equal(result.compatible, true)
    assert.equal(result.host.regions.length, 7)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('page and skin scaffolds accept the desktop Vue version as well as the toolkit reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-desktop-compat-'))
  try {
    for (const template of ['page-extension', 'player-skin']) {
      for (const language of ['js', 'ts']) {
        const project = join(root, template + '-' + language)
        await scaffoldProject(project, { template, language })
        for (const vue of ['3.5.21', '3.5.43']) {
          const profile = join(root, 'host.json')
          await writeFile(profile, JSON.stringify({
            ...host,
            componentLibraries: { ...host.componentLibraries, vue },
            regions: ['player.lyrics@1', 'player.artwork@1', 'player.background@1'],
          }))
          const result = await checkCompatibility(project, profile)
          assert.equal(result.compatible, true, JSON.stringify({ template, language, vue, issues: result.issues }))
        }
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
