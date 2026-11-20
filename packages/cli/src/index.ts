import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import {
  createTemplate,
  generateSigningKeys,
  parseJsonStrict,
  PreparedIssuer,
  readArtifact,
  signArtifact,
} from '@shiqianjiang/ceru-plugin-issuer'
import { buildProject, scaffoldProject, TEMPLATES, typecheckProject, writeAtomic } from './project.js'
import { migrateProject } from './migrate.js'
import { testHooks } from './test-hooks.js'
import { testServices } from './test-services.js'
import {watchProject} from './dev.js'
import { printInitSummary, promptInit } from './init.js'
import { PromptCancelled } from './tui.js'
import { checkCompatibility, formatCompatibility } from './compatibility.js'
export { buildProject, loadProject, scaffoldProject, TEMPLATES } from './project.js'

const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version
const HELP =
  'Ceru Plugin CLI ' +
  VERSION +
  '\n\n' +
  '  init <directory> [--template ' +
  TEMPLATES.join('|') +
  '] [--lang ts|js]\n' +
  '  list-templates\n' +
  '  test-hooks [--project directory] [--config tests/hooks.json]  Build and run offline playback hook scenarios\n' +
  '  test-services [--project directory] [--config tests/services.json]  Run actions against local mockServices\n' +
  '  migrate [--project directory]\n' +
  '  typecheck [--project directory]  Check manifest, config types, TS and Vue without writing dist\n' +
  '  check-compat [--project directory] [--host profile.json] [--json]  Check host API, component libraries and region versions\n' +
  '  build [--project directory] [--out dist/plugin.js]\n' +
  '  dev [--project directory]  Watch and build for the desktop developer mode\n' +
  '  preview <plugin.js>  Check the artifact and print desktop preview instructions\n' +
  '  validate <plugin.js> [--trusted-key publisher.public.pem] [--json]\n' +
  '  keygen --out .keys/publisher\n' +
  '  sign <plugin.js> --key private.pem [--out signed.js] [--force]\n' +
  '  template <plugin.js> --key publisher.private.pem --issuer-key issuer.public.pem --out template.js [--policy policy.json]\n' +
  '  issue <template.js> --key issuer.private.pem --config delivery.json --out customer.js [--id delivery-id]\n\n' +
  'TypeScript is type-checked before build. Final output is one .js file.\n' +
  'v3 Host integration is required. Validation does not execute or sandbox plugin code.\n'

async function jsOutput(path: string, bytes: Uint8Array, force: boolean): Promise<void> {
  if (extname(path) !== '.js') throw new Error('Output must be .js containing compiled JavaScript')
  await writeAtomic(resolve(path), bytes, force)
  console.log('Wrote ' + resolve(path) + ' (' + bytes.length + ' bytes)')
}
export async function runCli(argv = process.argv.slice(2)): Promise<void | string> {
  const { values: flags, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      template: { type: 'string' },
      lang: { type: 'string' },
      project: { type: 'string' },
      host: { type: 'string' },
      'no-open': { type: 'boolean' },
      out: { type: 'string' },
      key: { type: 'string' },
      'issuer-key': { type: 'string', multiple: true },
      'trusted-key': { type: 'string', multiple: true },
      policy: { type: 'string' },
      config: { type: 'string' },
      id: { type: 'string' },
      force: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  })
  if (flags.version) {
    console.log(VERSION)
    return
  }
  const command = positionals[0]
  if (flags.help || !command) {
    console.log(HELP)
    return
  }
  if (command === 'list-templates') {
    console.log(TEMPLATES.join('\n'))
    return
  }
  if (positionals.length > 2)
    throw new Error('Unexpected arguments: ' + positionals.slice(2).join(' '))
  const required = (name: 'out' | 'key' | 'config') => {
    const v = flags[name]
    if (!v) throw new Error('--' + name + ' is required')
    return v
  }
  if (command === 'test-hooks') return testHooks(flags.project ?? positionals[1] ?? '.', flags.config)
  if (command === 'test-services') return testServices(flags.project ?? positionals[1] ?? '.', flags.config)
  if (command === 'migrate') return migrateProject(flags.project ?? positionals[1] ?? '.')
  if (command === 'check-compat') {
    const result = await checkCompatibility(flags.project ?? positionals[1] ?? '.', flags.host)
    console.log(flags.json ? JSON.stringify(result, null, 2) : formatCompatibility(result))
    if (!result.compatible) process.exitCode = 1
    return
  }
  if (command === 'init') {
    let destination = positionals[1]
    let template = flags.template
    let language = flags.lang
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    if (interactive && (!destination || !template || !language)) {
      try {
        const answers = await promptInit(
          { input: process.stdin, output: process.stdout },
          { destination, template, language },
          VERSION,
        )
        destination = answers.destination
        template = answers.template
        language = answers.language
      } catch (error) {
        if (error instanceof PromptCancelled) {
          // 用户主动取消（Ctrl+C / Esc）：正常退出即可，别让 npm 当成失败报一堆 error。
          process.exitCode = 0
          return
        }
        throw error
      }
    }
    if (!destination) throw new Error('Specify a project directory')
    const path = await scaffoldProject(destination, { template, language })
    printInitSummary(process.stdout, path, interactive)
    return path
  }
  if (command === 'typecheck') {
    await typecheckProject(flags.project ?? positionals[1] ?? '.')
    console.log('Typecheck passed. No distribution artifact was written.')
    return
  }
  if (command === 'build') {
    const output = await buildProject(flags.project ?? '.', { out: flags.out })
    console.log('Built ' + output.path + ' (' + output.bytes + ' bytes)')
    return
  }
  if (command === 'dev') {
    const controller=new AbortController(), stop=()=>controller.abort()
    process.once('SIGINT',stop);process.once('SIGTERM',stop)
    try {await watchProject(flags.project ?? '.',controller.signal)} finally {process.off('SIGINT',stop);process.off('SIGTERM',stop)}
    return
  }
  if (command === 'preview') {
    if (!positionals[1]) throw new Error('An artifact file is required')
    const file = resolve(positionals[1])
    const { header } = readArtifact(await readFile(file))
    console.log('插件 ' + header.manifest.id + ' 已校验。请在澜音「设置 → 插件管理 → 管理设置 → 插件开发者模式」添加此文件：' + file)
    return
  }
  if (command === 'keygen') {
    const prefix = resolve(required('out'))
    for (const suffix of ['.private.pem', '.public.pem']) {
      try {
        await stat(prefix + suffix)
        throw new Error('Key already exists: ' + prefix + suffix)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const keys = generateSigningKeys()
    await writeAtomic(prefix + '.private.pem', keys.privateKey, false, 0o600)
    await writeAtomic(prefix + '.public.pem', keys.publicKey)
    console.log(
      'Created ' +
        prefix +
        '.private.pem and .public.pem. Keep the private key outside source control.',
    )
    return
  }
  const input = positionals[1]
  if (!input) throw new Error('An input .js file is required\n\n' + HELP)
  const bytes = await readFile(input)
  if (command === 'validate') {
    const keys = flags['trusted-key']
      ? await Promise.all(flags['trusted-key'].map((path) => readFile(path, 'utf8')))
      : undefined
    const result = readArtifact(bytes, { trustedPublicKeys: keys })
    const summary = {
      id: result.header.manifest.id,
      version: result.header.manifest.version,
      manifestVersion: result.header.manifest.manifestVersion,
      bytes: bytes.length,
      modules: Object.keys(result.modules),
      resources: Object.keys(result.resources),
      sourceFormat: result.sourceFormat,
      migrationWarnings: result.migrationWarnings,
      signature: result.signatureStatus,
      codeDigest: result.codeDigest,
      templateDigest: result.templateDigest,
      personalized: !!result.header.delivery,
    }
    console.log(
      flags.json
        ? JSON.stringify(summary, null, 2)
        : 'Valid Ceru v3 artifact\n' + JSON.stringify(summary, null, 2),
    )
    return
  }
  if (command === 'sign') {
    const output = flags.out ?? input
    await jsOutput(
      output,
      signArtifact(bytes, await readFile(required('key'), 'utf8')),
      resolve(output) === resolve(input) || flags.force,
    )
    return
  }
  if (command === 'template') {
    if (!flags['issuer-key']?.length) throw new Error('--issuer-key is required')
    const output = createTemplate(bytes, {
      privateKey: await readFile(required('key'), 'utf8'),
      issuerPublicKeys: await Promise.all(
        flags['issuer-key'].map((path) => readFile(path, 'utf8')),
      ),
      personalizationSchema: flags.policy
        ? parseJsonStrict(await readFile(flags.policy, 'utf8'))
        : undefined,
    })
    await jsOutput(required('out'), output, flags.force)
    return
  }
  if (command === 'issue') {
    const issuer = new PreparedIssuer(bytes, {
      issuerPrivateKey: await readFile(required('key'), 'utf8'),
    })
    const data = parseJsonStrict(await readFile(required('config'), 'utf8'))
    await jsOutput(required('out'), issuer.issue(data, { deliveryId: flags.id }), flags.force)
    return
  }
  throw new Error('Unknown command: ' + command + '\n\n' + HELP)
}
