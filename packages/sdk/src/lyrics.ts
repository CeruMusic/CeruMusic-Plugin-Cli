import type { CrLyric } from './music.js'
import type { ResourceRef, OperationContext } from './index.js'

export type LyricInputFormat =
  | 'auto'
  | 'lrc'
  | 'enhanced-lrc'
  | 'yrc'
  | 'qrc'
  | 'krc'
  | 'ttml'
  | 'plain'
export type LyricExportFormat = 'lrc' | 'enhanced-lrc' | 'yrc' | 'ttml'
export interface LyricParseRequest {
  track: ResourceRef
  format: LyricInputFormat
  text: string
  translation?: string
  romanization?: string
}
export interface LyricExportRequest {
  document: CrLyric
  format: LyricExportFormat
}
export interface LyricExportResult {
  format: LyricExportFormat
  text: string
  mime: 'text/plain'
  extension: 'lrc' | 'yrc' | 'ttml'
}
/** Parsing/decryption/serialization belongs to plugins, not the player or download manager. */
export interface LyricConverter {
  parse(request: LyricParseRequest, operation: OperationContext): Promise<CrLyric>
  export(request: LyricExportRequest, operation: OperationContext): Promise<LyricExportResult>
}
