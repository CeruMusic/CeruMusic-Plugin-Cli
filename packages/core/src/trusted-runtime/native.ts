import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'

export interface NativeFile { name: string; path: string; sha256: string }
export const sha256 = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')

/** Only current-platform resources enter this private, newly created directory. */
export async function extractNative(artifact: Artifact, directory: string, nodeApiModules: readonly string[]): Promise<NativeFile[]> {
  const declarations = artifact.header.manifest.entry.native ?? []
  const declaredNames = declarations.map(item => item.name)
  if (nodeApiModules.length !== declaredNames.length || new Set(nodeApiModules).size !== declaredNames.length ||
      !declaredNames.every(name => nodeApiModules.includes(name)))
    throw Error('Exact Node-API native declarations must be verified by the host')
  const platform = process.platform + '-' + process.arch
  const names = new Set<string>()
  const result: NativeFile[] = []
  for (const declaration of declarations) {
    const name = declaration.name
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.node$/.test(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || names.has(name.toLowerCase()))
      throw Error('Invalid or duplicate native filename')
    names.add(name.toLowerCase())
    const resourceId = Object.hasOwn(declaration.platforms, platform) && declaration.platforms[platform]
    if (!resourceId) throw Error('Native module does not support current platform: ' + platform)
    const resource = Object.hasOwn(artifact.resources, resourceId) && artifact.resources[resourceId]
    if (!resource || resource.type !== 'base64' || !resource.value ||
        !/^sha256:[a-f0-9]{64}$/.test(resource.sha256 ?? '')) throw Error('Invalid native resource: ' + resourceId)
    const bytes = Buffer.from(resource.value, 'base64')
    if (bytes.toString('base64') !== resource.value || sha256(bytes) !== resource.sha256)
      throw Error('Native resource SHA-256 mismatch: ' + resourceId)
    const path = join(directory, name)
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
    if (sha256(await readFile(path)) !== resource.sha256) throw Error('Extracted native SHA-256 mismatch: ' + name)
    result.push({ name, path, sha256: resource.sha256! })
  }
  return result
}
