import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { satisfies, valid, validRange } from 'semver'
import { parseJsonStrict } from '@shiqianjiang/ceru-plugin-issuer'
import { parsePlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'

export interface HostCompatibility {
  schemaVersion: 1
  hostApi: string
  logicRuntime: string
  componentLibraries: Record<'vue' | 'tdesign-vue-next', string>
  regions: string[]
  appVersion?: string
}
export interface CompatibilityIssue {
  level: 'error' | 'warning'
  code: string
  message: string
}
const object = (value: any): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function readHostCompatibility(value: unknown): HostCompatibility {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !valid(value.hostApi) ||
    typeof value.logicRuntime !== 'string' ||
    !value.logicRuntime ||
    !object(value.componentLibraries) ||
    !['vue', 'tdesign-vue-next'].every((name) => valid(value.componentLibraries[name])) ||
    !Array.isArray(value.regions) ||
    !value.regions.every((name) => typeof name === 'string' && parsePlayerRegion(name))
  )
    throw Error(
      'Invalid host compatibility profile (schemaVersion, hostApi, logicRuntime, componentLibraries, regions)',
    )
  return {
    schemaVersion: 1,
    hostApi: value.hostApi,
    logicRuntime: value.logicRuntime,
    componentLibraries: {
      vue: value.componentLibraries.vue,
      'tdesign-vue-next': value.componentLibraries['tdesign-vue-next'],
    },
    regions: [...value.regions],
    ...(typeof value.appVersion === 'string' && valid(value.appVersion)
      ? { appVersion: value.appVersion }
      : {}),
  }
}

/** Read declarations only: do not import plugin/config code or run installation scripts. */
export async function checkCompatibility(project = '.', hostFile?: string) {
  const root = resolve(project)
  const profilePath = hostFile
    ? resolve(hostFile)
    : new URL('../assets/compatibility.json', import.meta.url)
  const profileText = await readFile(profilePath, 'utf8')
  if (profileText.length > 64 * 1024) throw Error('Host compatibility profile is too large')
  const host = readHostCompatibility(parseJsonStrict(profileText))
  const source = parseJsonStrict(await readFile(resolve(root, 'ceru.plugin.json'), 'utf8')) as any
  const manifest = source?.manifest
  if (!object(manifest) || !object(manifest.engines))
    throw Error('Missing manifest.engines in ceru.plugin.json')
  const issues: CompatibilityIssue[] = []
  const issue = (level: CompatibilityIssue['level'], code: string, message: string) =>
    issues.push({ level, code, message })
  const checkRange = (name: string, version: string, range: unknown) => {
    if (typeof range !== 'string' || !validRange(range))
      issue('error', 'invalid-range', `${name}: invalid version range ${String(range)}`)
    else if (!satisfies(version, range))
      issue('error', 'version-mismatch', `${name}: host ${version} does not satisfy ${range}`)
  }
  checkRange('hostApi', host.hostApi, manifest.engines.hostApi)
  if (manifest.engines.logicRuntime !== host.logicRuntime)
    issue(
      'error',
      'logic-runtime',
      `logicRuntime: host ${host.logicRuntime}, project ${String(manifest.engines.logicRuntime)}`,
    )
  const views = manifest.entry?.views ?? []
  if (!Array.isArray(views)) throw Error('manifest.entry.views must be an array')
  const componentViews = views.filter((view) => view?.kind === 'component')
  if (componentViews.length) {
    const pkg = parseJsonStrict(await readFile(resolve(root, 'package.json'), 'utf8')) as any
    const requireProject = createRequire(resolve(root, 'package.json'))
    const sdkEntry = createRequire(import.meta.url).resolve('@shiqianjiang/ceru-plugin-sdk')
    const sdk = JSON.parse(await readFile(resolve(dirname(sdkEntry), '../package.json'), 'utf8'))
    for (const name of ['vue', 'tdesign-vue-next'] as const) {
      checkRange(`SDK peer ${name}`, host.componentLibraries[name], sdk.peerDependencies?.[name])
      const range =
        pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name]
      if (range === undefined)
        issue(
          'warning',
          'missing-declaration',
          `${name}: declare the host library as a development dependency for editor/types support`,
        )
      else checkRange(name, host.componentLibraries[name], range)
      try {
        const installed = JSON.parse(
          await readFile(requireProject.resolve(name + '/package.json'), 'utf8'),
        ).version
        if (!valid(installed)) throw Error('Invalid installed version')
        if (installed !== host.componentLibraries[name])
          issue(
            'warning',
            'types-runtime-differ',
            `${name}: local types ${installed}, host runtime ${host.componentLibraries[name]}; run typecheck and test against this host`,
          )
      } catch {
        issue(
          'warning',
          'dependency-unavailable',
          `${name}: local package unavailable; install project dependencies before typecheck`,
        )
      }
    }
  }
  const regions = manifest.ui?.regions ?? []
  if (!Array.isArray(regions)) throw Error('manifest.ui.regions must be an array')
  for (const entry of regions) {
    const requested = typeof entry?.region === 'string' ? parsePlayerRegion(entry.region) : null
    if (
      !requested ||
      !host.regions.some((name) => {
        const supported = parsePlayerRegion(name)!
        return supported.name === requested.name && supported.version === requested.version
      })
    )
      issue(
        'error',
        'region-unavailable',
        `Region ${String(entry?.region)} is not supported by this host`,
      )
  }
  return {
    compatible: !issues.some((item) => item.level === 'error'),
    target: hostFile ? 'host-profile' : 'bundled-runtime-reference',
    host,
    pluginId: manifest.id,
    componentViews: componentViews.length,
    issues,
  }
}

export function formatCompatibility(result: Awaited<ReturnType<typeof checkCompatibility>>) {
  return [
    `${result.compatible ? 'Compatible declarations' : 'Incompatible declarations'}: ${result.pluginId}`,
    `Target: ${result.target}; host API ${result.host.hostApi}; ${result.host.logicRuntime}`,
    ...result.issues.map((item) => `${item.level.toUpperCase()} [${item.code}] ${item.message}`),
    'This checks declared versions and regions only. Run typecheck/build and verify in the target desktop.',
    ...(result.target === 'bundled-runtime-reference'
      ? [
          'No desktop profile supplied; this is the bundled runtime reference, not a detected installation.',
        ]
      : []),
  ].join('\n')
}
