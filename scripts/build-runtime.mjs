import { build } from 'esbuild'
import { mkdir, writeFile, readFile, unlink, copyFile } from 'node:fs/promises'
import { MANIFEST_SCHEMA } from '../packages/issuer/dist/index.js'
import { HOST_ICON_NAMES } from '../packages/sdk/dist/index.js'
await import('../packages/sdk/scripts/prepare-package.mjs')
await build({
  entryPoints: ['packages/cli/runtime/sandbox.ts'],
  bundle: true,
  write: true,
  outfile: 'packages/cli/assets/sandbox.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
})
await mkdir('packages/core/assets', { recursive: true })
await build({
  entryPoints: ['packages/core/runtime/node-globals.ts'],
  bundle: true,
  outfile: 'packages/core/assets/node-globals.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
})
await copyFile('packages/cli/assets/sandbox.js', 'packages/core/assets/sandbox.js')
await copyFile('packages/cli/assets/catalog.json', 'packages/core/assets/catalog.json')
await build({
  stdin: {
    contents:
      "export * from './packages/sdk/src/music.ts'; export * from './packages/sdk/src/native-view.ts'; export * from './packages/sdk/src/accounts.ts'; export * from './packages/sdk/src/navigation.ts'; export * from './packages/sdk/src/permissions.ts'; export * from './packages/core/src/surface.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  outfile: 'packages/cli/assets/core-contracts.js',
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
})
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
manifest.properties.contributes.properties.providers.items.properties.icon.oneOf[0].properties.name =
  {
    type: 'string',
    examples: HOST_ICON_NAMES,
    description: 'Host built-in icon name; no icon file is embedded into the plugin.',
  }
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
  required: ['manifest', 'entries'],
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
