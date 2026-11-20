import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile, unlink, copyFile } from 'node:fs/promises'
import { MANIFEST_SCHEMA } from '../packages/issuer/dist/index.js'
import { HOST_ICON_NAMES, PLAYER_REGIONS } from '../packages/sdk/dist/index.js'
const runtimeRequire = createRequire(new URL('../packages/core/runtime/component-view.ts', import.meta.url))
const runtimeVersion = async name => JSON.parse(await readFile(runtimeRequire.resolve(name + '/package.json'), 'utf8')).version
const compatibility = JSON.stringify({
  schemaVersion: 1, hostApi: '3.0.0', logicRuntime: 'ceru-js@1',
  componentLibraries: { vue: await runtimeVersion('vue'), 'tdesign-vue-next': await runtimeVersion('tdesign-vue-next') },
  regions: PLAYER_REGIONS.map(name => name + '@1'),
}, null, 2) + '\n'
await mkdir('packages/core/assets', { recursive: true })
await writeFile('packages/core/assets/compatibility.json', compatibility)
await writeFile('packages/cli/assets/compatibility.json', compatibility)
for (const base of [
  'packages/sdk/dist/host-library',
  'packages/cli/dist/socket-broker',
  'packages/cli/dist/watch-project',
  'packages/core/dist/electron',
]) {
  for (const suffix of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
    await unlink(base + suffix).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
await import('../packages/sdk/scripts/prepare-package.mjs')
// The raw-Node child cannot read Electron ASAR paths. Keep its dependency
// closure in one asset which the host extracts into a private session directory.
await build({
  entryPoints: ['packages/core/src/trusted-runtime/runner.ts'],
  bundle: true,
  outfile: 'packages/core/assets/trusted-runner.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'inline',
})
await build({
  entryPoints: ['packages/core/runtime/sandbox.ts'],
  bundle: true,
  write: true,
  outfile: 'packages/core/assets/sandbox.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
})
await build({entryPoints:['packages/core/runtime/component-view.ts'],bundle:true,platform:'browser',format:'iife',globalName:'__ceruComponentView',target:'es2022',outfile:'packages/core/assets/component-view.js',minify:true,legalComments:'inline',loader:{'.css':'text','.less':'empty'},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'}})
// The normal renderer must share its exact Vue/SDK/TDesign instances. The
// standalone iframe asset above remains the strict-mode fallback.
await build({entryPoints:['packages/core/runtime/component-host.ts'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:'packages/core/dist/component-runtime.js',external:['vue','tdesign-vue-next','@shiqianjiang/ceru-plugin-sdk','@shiqianjiang/ceru-plugin-sdk/*','@applemusic-like-lyrics/core'],loader:{'.css':'text','.less':'empty'},legalComments:'inline'})
await mkdir('packages/core/assets', { recursive: true })
await writeFile('packages/core/assets/component-view.js.gz', gzipSync(await readFile('packages/core/assets/component-view.js'), { level: 9 }))
await build({
  entryPoints: ['packages/core/runtime/node-globals.ts'],
  bundle: true,
  outfile: 'packages/core/assets/node-globals.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
})
await copyFile('packages/cli/assets/catalog.json', 'packages/core/assets/catalog.json')
// Framework production runtimes belong to the plugin, never to the dev Host.
const catalog = JSON.parse(await readFile('packages/cli/assets/catalog.json', 'utf8'))
delete catalog.libraries
await writeFile('packages/cli/assets/catalog.json', JSON.stringify(catalog))
for (const name of ['shared-vue.js', 'shared-react.js']) {
  await unlink('packages/cli/assets/' + name).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
}
const manifest = structuredClone(MANIFEST_SCHEMA)
manifest.properties.provides.properties.providers.items.properties.icon.oneOf[0].properties.name = {
  type: 'string',
  examples: HOST_ICON_NAMES,
  description: 'Host built-in icon name; no icon file is embedded into the plugin.',
}
const pathOrId = { type: 'string', minLength: 1, maxLength: 4096 }
for (const key of ['logic', 'share', 'server'])
  manifest.properties.entry.properties[key].properties.module = pathOrId
manifest.properties.entry.properties.views.items.properties.module = pathOrId
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Ceru Plugin Build Configuration',
  type: 'object',
  properties: {
    $schema: {
      type: 'string',
      description: 'Optional editor schema reference; ignored by the build runtime.',
    },
    manifest,
    config: {
      oneOf: [
        {
          type: 'object',
          description: 'JSON-compatible defaults exposed through ctx.config.',
          additionalProperties: true,
        },
        {
          type: 'string',
          pattern: '^@.+',
          description:
            'Build-time JSON/JS/TS config reference, for example @./src/plugin.config.ts.',
        },
      ],
    },
    entries: {
      type: 'object',
      description: 'Map stable module IDs to TS/TSX/JS source files',
      additionalProperties: { type: 'string' },
    },
    resources: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          type: { enum: ['json', 'text', 'base64'] },
          mime: { type: 'string' },
        },
        required: ['path', 'type'],
        additionalProperties: false,
      },
    },
    output: { type: 'string', default: 'dist/plugin.js', pattern: '\\.js$' },
  },
  required: ['manifest'],
  additionalProperties: false,
}
schema.properties.output.pattern = '\\.(?:js|jsx)$'
schema.properties.framework = { enum: ['vanilla', 'vue', 'react'], default: 'vanilla' }
schema.properties.sharedLibraries = {
  deprecated: true,
  description:
    'Legacy field ignored since 0.1.2. Vue and React production runtimes are bundled into the plugin.',
  type: 'object',
  properties: {
    vue: { type: 'string' },
    react: { type: 'string' },
    'react-dom': { type: 'string' },
  },
  additionalProperties: false,
}
schema.properties.webDist = {
  type: 'object',
  description: 'Map a Surface entry ID to an already-built local HTML directory',
  additionalProperties: { type: 'string' },
}
await mkdir('packages/cli/schemas', { recursive: true })
await writeFile('packages/cli/schemas/config.schema.json', JSON.stringify(schema, null, 2) + '\n')
