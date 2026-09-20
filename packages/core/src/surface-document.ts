import { readFile } from 'node:fs/promises'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

let assets: Promise<[string, string]> | undefined

/** Self-contained iframe document; the shared runtime reports mounted content via resize events. */
export async function createWebSurfaceDocument(
  artifact: Artifact,
  surfaceId: string,
  sessionId: string,
) {
  const surface = artifact.header.manifest.modules.surfaces?.find((item) => item.id === surfaceId)
  if (surface?.kind !== 'web') throw new Error('Unknown web Surface: ' + surfaceId)
  const code = artifact.modules[surface.entry]
  if (!code) throw new Error('Missing Surface entry: ' + surface.entry)
  assets ??= Promise.all([
    readFile(new URL('../assets/sandbox.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/catalog.json', import.meta.url), 'utf8'),
  ])
  const [runtime, catalog] = await assets
  const script = (source: string) =>
    '<script src="data:text/javascript;base64,' +
    Buffer.from(source).toString('base64') +
    '"></script>'
  return {
    title:
      surface.title ??
      artifact.header.manifest.contributes?.commands?.find((item) => item.view === surfaceId)
        ?.title ??
      artifact.header.manifest.name,
    presentation: {
      kind: 'drawer' as const,
      placement: 'right' as const,
      size: 480,
      ...surface.presentation,
    },
    html:
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'\">" +
      '<style>html,body{margin:0}</style><div id="plugin-root"></div>' +
      script(runtime) +
      script('globalThis.__ceruStart(' + code + ');'),
    init: {
      generation: sessionId,
      mode: 'production',
      kind: 'web',
      manifest: { ...artifact.header.manifest, config: {} },
      resources: artifact.resources,
      catalog: JSON.parse(catalog),
      mount: { kind: 'page' },
    } as unknown as JsonObject,
  }
}
