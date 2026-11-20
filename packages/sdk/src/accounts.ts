import type { CredentialRef, OperationContext, Page, ResourceRef } from './index.js'
import type { MusicTrack, MusicPlaylist } from './music.js'

export interface AccountConnection { id: string; credential: CredentialRef }
export interface PluginAccountProfile { id: string; displayName: string; avatar?: string; vip?: boolean }
export interface AccountFormField { key: string; label: string; type: 'text' | 'password' | 'code'; optional?: boolean }
export interface AccountForm { fields: AccountFormField[] }
export interface AccountLoginResult {
  credential: string
  binding?: { origin: string; sendAs: 'bearer' | 'cookie' }
}
/** Public state supplied only to the custom QR view. No credential or login ticket. */
export type AccountQrViewState = {
  kind: 'qrcode'
  accountId: string
  status: 'waiting' | 'scanned'
  expiresAt: number
  image?: string
  url?: string
  origin?: string
}
export type AccountQrCode = ({ image: string; url?: never } | { url: string; image?: never }) & {
  /** Optional component/web view declared by this plugin. Omit for the Host template. */
  view?: string
  expiresInMs: number
  poll(operation: OperationContext): Promise<{ status: 'waiting' | 'scanned' | 'expired' } | ({ status: 'done' } & AccountLoginResult)>
}
export interface AccountOAuthOptions {
  authorizationUrl: string
  tokenUrl: string
  clientId: string
  scopes?: string[]
  resourceOrigin?: string
}
export interface AccountLoginReceipt { readonly completionId: string }
export type AccountListCapability = 'likes' | 'playlists' | 'history' | 'recommend'
export interface AccountPageRequest { cursor?:string; limit:number }
export interface AccountCollection<T> {
  list(account:AccountConnection, request:AccountPageRequest, operation:OperationContext): Promise<Page<T>>
}
export interface AccountBrowserOptions { url: string; until: {cookie: string} }
export interface AccountLoginRequest {
  method: 'form' | 'qrcode' | 'oauth' | 'browser'
  auth: {
    form(form: AccountForm): Promise<Record<string,string> | null>
    qrcode(options: AccountQrCode): Promise<AccountLoginResult | null>
    oauth(options: AccountOAuthOptions): Promise<AccountLoginReceipt | null>
    browser(options: AccountBrowserOptions): Promise<AccountLoginReceipt | null>
  }
}
export interface AccountImplementation {
  likes?: AccountCollection<MusicTrack> & {set?(account:AccountConnection, change:{ref:ResourceRef;liked:boolean}, operation:OperationContext):Promise<void>}
  playlists?: AccountCollection<MusicPlaylist>
  history?: AccountCollection<MusicTrack>
  recommend?: AccountCollection<MusicTrack>
  login(request: AccountLoginRequest, operation: OperationContext): Promise<AccountLoginResult | AccountLoginReceipt | null>
  profile(account: AccountConnection, operation: OperationContext): PluginAccountProfile | Promise<PluginAccountProfile>
  validate?(account: AccountConnection, operation: OperationContext): { valid: boolean } | Promise<{ valid: boolean }>
  logout?(account: AccountConnection, operation: OperationContext): void | Promise<void>
}
export function assertAccountForm(value: unknown): asserts value is AccountForm {
  const form = value as AccountForm
  if (!Array.isArray(form?.fields) || !form.fields.length || form.fields.length > 8) throw Error('Invalid account form')
  const keys = new Set<string>()
  for (const field of form.fields) {
    if (!field || typeof field.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(field.key) ||
      ['constructor','prototype'].includes(field.key) || keys.has(field.key) ||
      typeof field.label !== 'string' || !field.label.trim() || field.label.length > 100 ||
      !['text','code','password'].includes(field.type) || (field.optional !== undefined && typeof field.optional !== 'boolean')) throw Error('Invalid account field')
    keys.add(field.key)
  }
}
export type AccountSummary = {
  signedIn: boolean
  displayName: string
  avatarUrl?: string
  badge?: string
}

export function assertAccountSummary(value: unknown): asserts value is AccountSummary {
  const account = value as AccountSummary
  if (
    !account ||
    typeof account !== 'object' ||
    Array.isArray(account) ||
    typeof account.signedIn !== 'boolean' ||
    typeof account.displayName !== 'string' ||
    !account.displayName.length ||
    account.displayName.length > 200 ||
    (account.badge !== undefined &&
      (typeof account.badge !== 'string' || account.badge.length > 80))
  )
    throw new Error('Invalid account summary')
  if (
    account.avatarUrl !== undefined &&
    (typeof account.avatarUrl !== 'string' ||
      account.avatarUrl.length > 8192 ||
      !/^https?:\/\//i.test(account.avatarUrl))
  )
    throw new Error('Invalid account avatar URL')
}
