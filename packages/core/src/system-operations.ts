import { publicLink, type OperationInputs, type SystemOperationName } from '@shiqianjiang/ceru-plugin-sdk'

export const SYSTEM_OPERATIONS = {
  'link.open': { intercept: 'links.intercept', cancelable: true, hookTimeoutMs: 3000, defaultIn: 'renderer', announce: true },
  'notification.show': { intercept: 'notifications.intercept', cancelable: true, hookTimeoutMs: 3000, defaultIn: 'renderer', announce: false },
} as const
export function isSystemOperation(name: unknown): name is SystemOperationName {
  return name === 'link.open' || name === 'notification.show'
}
type Input = OperationInputs[SystemOperationName]
export function systemInput(name: SystemOperationName, value: unknown, original?: Input): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid system operation')
  if (name === 'link.open') {
    if (Object.keys(value).some(key => !['url','from'].includes(key)) || !('url' in value) || !('from' in value)) throw Error('Invalid link input')
    const url = publicLink(value.url), from = value.from
    if (!url || !['paste','drop','deeplink'].includes(String(from)) || (original && 'from' in original && from !== original.from)) throw Error('Invalid public link')
    return {url, from: from as OperationInputs['link.open']['from']}
  }
  const row = value as OperationInputs['notification.show']
  if (Object.keys(value).some(key => !['title','body','level'].includes(key)) ||
      typeof row.title !== 'string' || row.title.length > 512 || typeof row.body !== 'string' || row.body.length > 8192 ||
      !['info','success','warning','error'].includes(row.level)) throw Error('Invalid notification input')
  return {title:row.title,body:row.body,level:row.level}
}
