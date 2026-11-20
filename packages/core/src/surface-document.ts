import { readFile } from 'node:fs/promises'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
import type { JsonObject, UISlotName } from '@shiqianjiang/ceru-plugin-sdk'
import { parsePlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'

let assets: Promise<[string, { full: string; component: string }]> | undefined
let componentRuntime: Promise<string> | undefined
const script = (source: string) =>
  '<script src="data:text/javascript;base64,' +
  Buffer.from(source).toString('base64') +
  '"></script>'

async function loadComponentRuntime() {
  const packed = document.getElementById('ceru-component-runtime')!
  const binary = atob(packed.textContent!)
  packed.remove()
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const blob = new Blob([await new Response(stream).arrayBuffer()], { type: 'text/javascript' })
  await new Promise<void>((done, fail) => {
    const reader = new FileReader()
    reader.onerror = () => fail(reader.error)
    reader.onload = () => {
      const element = document.createElement('script')
      element.onload = () => { element.remove(); done() }
      element.onerror = () => fail(Error('Unable to load host component runtime'))
      element.src = reader.result as string
      document.head.append(element)
    }
    reader.readAsDataURL(blob)
  })
}

/** Self-contained iframe document; the shared runtime reports mounted content via resize events. */
export async function createWebSurfaceDocument(
  artifact: Artifact,
  surfaceId: string,
  sessionId: string,
  props: JsonObject = {},
  slot?: UISlotName,
  region?: string,
  desktopLibrary?: Readonly<{ factory: string; styles: string }>,
) {
  const surface = artifact.header.manifest.entry.views?.find((item) => item.id === surfaceId)
  if (!surface || (surface.kind !== 'web' && surface.kind !== 'component')) throw new Error('Unknown web Surface: ' + surfaceId)
  if (slot !== undefined && (surface.kind !== 'component' || !artifact.header.manifest.ui?.slots?.some(item => item.slot === slot && item.view === surfaceId))) throw Error('Undeclared component slot: ' + slot)
  const contract = region === undefined ? null : parsePlayerRegion(region)
  if (region !== undefined && (!contract || contract.version !== 1 || slot !== undefined || surface.kind !== 'component' || !artifact.header.manifest.ui?.regions?.some(item => {
    const declared = parsePlayerRegion(item.region)
    return declared?.name === contract.name && declared.version === contract.version && item.view === surfaceId
  }))) throw Error('Undeclared or unsupported player region: ' + region)
  const code = artifact.modules[surface.module]
  if (!code) throw new Error('Missing Surface entry: ' + surface.module)
  assets ??= Promise.all([
    readFile(new URL('../assets/sandbox.js', import.meta.url), 'utf8').then(script),
    readFile(new URL('../assets/catalog.json', import.meta.url), 'utf8').then(full => {
      const catalog = JSON.parse(full)
      return { full, component: JSON.stringify({ ...catalog, assets: {} }) }
    }),
  ])
  const [runtime, catalog] = await assets
  const desktopArgs = desktopLibrary && surface.kind === 'component'
    ? ',' + desktopLibrary.factory + ',' + JSON.stringify(desktopLibrary.styles) : ''

  return {
    ...(surface.kind === 'component' ? { componentSource: 'export default (' + code + ');\n' } : {}),
    title:
      surface.title ??
      artifact.header.manifest.provides?.actions?.find((item) => item.view === surfaceId)
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
      runtime +
      (surface.kind === 'component' ? (await (componentRuntime ??= readFile(new URL('../assets/component-view.js.gz', import.meta.url)).then(bytes => '<script id="ceru-component-runtime" type="application/octet-stream">' + bytes.toString('base64') + '</script>'))) + script('const runtimeReady=('+loadComponentRuntime.toString()+')();globalThis.__ceruStart(async (...args)=>{await runtimeReady;return __ceruComponentView.mount('+code+','+JSON.stringify(surfaceId)+','+JSON.stringify(sessionId)+desktopArgs+')(...args)});') : script('globalThis.__ceruStart(' + code + ');')),
    init: {
      generation: sessionId,
      mode: 'production',
      kind: 'web',
      viewKind: surface.kind,
      manifest: { ...artifact.header.manifest, config: {} },
      resources: artifact.resources,
      catalog: JSON.parse(surface.kind === 'component' ? catalog.component : catalog.full),
      mount: contract ? { kind: 'region', ...contract, props } : slot === undefined ? { kind: 'page', props } : { kind: 'slot', slot, props },
    } as unknown as JsonObject,
  }
}
