import type { CallableOperation, OperationTool } from '@shiqianjiang/ceru-plugin-sdk/services'
import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'
import {likeInput, libraryInput, isLibraryOperation, playbackInput, downloadInput, shareInput, shareResult, systemInput, isSystemOperation, windowCloseInput} from './operation-bus.js'
import {OPERATION_CATALOG} from './operation-catalog.js'

const object=(properties:JsonObject,optional:string[]=[]):JsonObject=>({type:'object',properties,required:Object.keys(properties).filter(key=>!optional.includes(key)),additionalProperties:false})
const track=object({ref:object({kind:{const:'track'},providerId:{type:'string',pattern:'^[A-Za-z0-9._-]{1,128}$'},id:{type:'string',minLength:1,maxLength:512}}),title:{type:'string',maxLength:512},metadata:object({artists:{type:'array',maxItems:32,items:{type:'string',maxLength:256}}})})
const tools:Record<CallableOperation,[string,JsonObject,OperationTool['permission']]>= {
  'player.play':['播放指定歌曲',object({track}),'player.control'],
  'player.next':['播放下一首',object({reason:{const:'user'}}),'player.control'],
  'queue.add':['添加歌曲到播放队列',OPERATION_CATALOG['queue.add'].inputSchema,'player.control'],
  'queue.remove':['从播放队列移除歌曲',OPERATION_CATALOG['queue.remove'].inputSchema,'player.control'],
  'queue.clear':['清空播放队列',object({}),'player.control'],
  'download.create':['创建歌曲下载任务',object({tracks:{type:'array',items:track,minItems:1,maxItems:100},quality:{type:'string',pattern:'^[\\w.-]{1,64}$'},directory:{type:'string',pattern:'^[a-f0-9-]{36}$'}},['directory']),'downloads.create'],
  'track.like':['设置歌曲的收藏状态',object({track,liked:{type:'boolean'}}),'library.write'],
  'playlist.create':['创建歌单',OPERATION_CATALOG['playlist.create'].inputSchema,'library.write'],
  'playlist.delete':['删除歌单',OPERATION_CATALOG['playlist.delete'].inputSchema,'library.delete'],
  'playlist.addTracks':['添加歌曲到歌单',OPERATION_CATALOG['playlist.addTracks'].inputSchema,'library.write'],
  'playlist.removeTracks':['从歌单移除歌曲',OPERATION_CATALOG['playlist.removeTracks'].inputSchema,'library.delete'],
  'playlist.import':['导入歌单',OPERATION_CATALOG['playlist.import'].inputSchema,'library.write'],
  'playlist.export':['导出歌单',OPERATION_CATALOG['playlist.export'].inputSchema,'library.read'],
  'share.create':['生成歌曲分享链接',object({track}),'sharing.publish'],
  'notification.show':['显示软件内文字提示',OPERATION_CATALOG['notification.show'].inputSchema,null],
  'link.open':['处理公开链接',OPERATION_CATALOG['link.open'].inputSchema,'external.open'],
  'window.close':['按用户设置关闭主窗口',object({}),'window.control'],
  'player.pause':['暂停播放',object({}),'player.control'],
  'player.resume':['继续播放',object({}),'player.control'],
  'player.previous':['播放上一首',object({}),'player.control'],
  'player.seek':['跳转到指定毫秒位置',object({positionMs:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}}),'player.control'],
  'player.setVolume':['设置音量',object({volume:{type:'number',minimum:0,maximum:1}}),'player.control'],
  'player.setMode':['设置播放模式',object({mode:{enum:['sequence','single','random']}}),'player.control'],
}
export function operationTool(name:unknown):OperationTool {
  if (typeof name!=='string' || !Object.hasOwn(tools,name)) throw Error('Operation is not callable')
  const key=name as CallableOperation, [description,inputSchema,permission]=tools[key]
  return {name:key,description,inputSchema:structuredClone(inputSchema),outputSchema:structuredClone(OPERATION_CATALOG[key].outputSchema),permission}
}
export const listOperationTools=()=>Object.keys(tools).map(operationTool)
export function toolResult(name:CallableOperation,value:unknown):void {
  if(name==='share.create') { shareResult(name,value); return }
  if(value!==null) throw Error('Expected null operation result')
}
function validateToolSchema(schema:JsonObject,value:unknown):void {
  const invalid=()=>{throw Error('Invalid operation tool input')}
  if ('const' in schema && value!==schema.const) invalid()
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) invalid()
  if (schema.type==='object') {
    if (!value || typeof value!=='object' || Array.isArray(value)) return invalid()
    const properties=schema.properties as Record<string,JsonObject>
    if ((schema.required as string[]).some(key=>!Object.hasOwn(value,key))) invalid()
    for (const [key,entry] of Object.entries(value)) {
      if (!Object.hasOwn(properties,key)) invalid()
      validateToolSchema(properties[key],entry)
    }
  } else if (schema.type==='array') {
    if (!Array.isArray(value) || value.length<Number(schema.minItems??0) || value.length>Number(schema.maxItems??Infinity)) return invalid()
    for (const entry of value) validateToolSchema(schema.items as JsonObject,entry)
  } else if (schema.type==='string') {
    if (typeof value!=='string' || value.length<Number(schema.minLength??0) || value.length>Number(schema.maxLength??Infinity) || (typeof schema.pattern==='string' && !new RegExp(schema.pattern).test(value))) invalid()
  } else if (schema.type==='number' || schema.type==='integer') {
    if (typeof value!=='number' || !Number.isFinite(value) || (schema.type==='integer'&&!Number.isSafeInteger(value)) || value<Number(schema.minimum??-Infinity) || value>Number(schema.maximum??Infinity)) invalid()
  } else if (schema.type==='boolean' && typeof value!=='boolean') invalid()
}
export function toolInput(name:CallableOperation,value:unknown) {
  validateToolSchema(operationTool(name).inputSchema,value)
  if(isSystemOperation(name)) return systemInput(name,value)
  if(name==='window.close') return windowCloseInput(name,value)
  if (name==='track.like') {
    const input=likeInput(name,value)
    if (['private','local'].includes(input.track.ref.providerId)) throw Error('Operation requires a public track')
    return input
  }
  if (isLibraryOperation(name)) {
    const input = libraryInput(name,value)
    if ('tracks' in input && input.tracks.some(track=>['private','local'].includes(track.ref.providerId))) throw Error('Operation requires a public track')
    return input
  }
  if (name==='player.next' && (!value || typeof value!=='object' || !('reason' in value) || value.reason!=='user' || Object.keys(value).length!==1)) throw Error('Tools may only request a user advance')
  if (name==='player.play' && value && typeof value==='object' && 'queueIndex' in value) throw Error('Play tools select a public track, not a queue index')
  if (name==='queue.clear' && (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length)) throw Error('Expected empty queue clear input')
  const input = name==='share.create'?shareInput(name,value):name==='download.create'?downloadInput(name,value):playbackInput(name,value)
  if (name==='download.create' && 'tracks' in input && (!input.tracks?.length || input.tracks.length>100)) throw Error('Expected 1 to 100 download tracks')
  const selected = 'track' in input ? [input.track] : 'tracks' in input ? input.tracks ?? [] : []
  if (selected.some(track=>track && ['private','local'].includes(track.ref.providerId))) throw Error('Operation requires a public track')
  return input
}
