import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { MANIFEST_SCHEMA } from '../packages/issuer/dist/index.js'
import { HOST_ICON_NAMES } from '../packages/sdk/dist/index.js'
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
const require = createRequire(import.meta.url)
const versions = Object.fromEntries(
  ['vue', 'react', 'react-dom'].map((name) => [name, require(name + '/package.json').version]),
)
const catalog = JSON.parse(await readFile('packages/cli/assets/catalog.json', 'utf8'))
catalog.libraries = versions
await writeFile('packages/cli/assets/catalog.json', JSON.stringify(catalog))
for (const [name, contents] of Object.entries({
  vue: "import * as Vue from 'vue'; import * as jsx from 'vue/jsx-runtime';globalThis.__ceruSharedModules.vue=Vue;globalThis.__ceruSharedModules['vue/jsx-runtime']=jsx;",
  react:
    "import * as React from 'react';import * as DOM from 'react-dom';import * as Client from 'react-dom/client';import * as JSX from 'react/jsx-runtime';import * as JSXDev from 'react/jsx-dev-runtime';Object.assign(globalThis.__ceruSharedModules,{react:React,'react-dom':DOM,'react-dom/client':Client,'react/jsx-runtime':JSX,'react/jsx-dev-runtime':JSXDev});",
})) {
  await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    outfile: 'packages/cli/assets/shared-' + name + '.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
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
    manifest,
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
