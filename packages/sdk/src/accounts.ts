/** Public account presentation. Credentials and platform login flows remain in plugin logic. */
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
