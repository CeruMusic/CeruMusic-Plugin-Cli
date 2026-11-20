import type {HookOperationName, JsonObject} from '@shiqianjiang/ceru-plugin-sdk'
import {operationEventPermission} from '@shiqianjiang/ceru-plugin-sdk'
import {PLAYBACK_OPERATIONS, RESOLVE_OPERATIONS, ACCOUNT_OPERATIONS, SEARCH_OPERATIONS, LIBRARY_OPERATIONS, WINDOW_OPERATIONS, LYRIC_OPERATIONS, DOWNLOAD_OPERATIONS, SHARING_OPERATIONS, SYSTEM_OPERATIONS} from './operation-bus.js'

const text = (maxLength: number, minLength = 0): JsonObject => ({type:'string', minLength, maxLength})
const enumeration = (...values: string[]): JsonObject => ({type:'string', enum:values})
const integer = (maximum = Number.MAX_SAFE_INTEGER): JsonObject => ({type:'integer', minimum:0, maximum})
const object = (properties: JsonObject, optional: string[] = []): JsonObject => ({type:'object', properties, required:Object.keys(properties).filter(key=>!optional.includes(key)), additionalProperties:false})
const array = (items: JsonObject, maxItems = 1000): JsonObject => ({type:'array', items, maxItems})
const nullable = (schema: JsonObject): JsonObject => ({anyOf:[schema,{type:'null'}]})
const ref = object({kind:{const:'track'},providerId:{...text(128,1),pattern:'^[A-Za-z0-9._-]+$'},id:text(512,1)})
export const operationTrackSchema = object({ref,title:text(512),metadata:object({artists:array(text(256),32)})})
const tracks = array(operationTrackSchema)
const playlist = object({id:text(256,1),name:text(512,1),location:enumeration('local','cloud','both')})
const milliseconds:JsonObject={type:'number',minimum:0}
const word = object({startTimeMs:milliseconds,endTimeMs:milliseconds,text:text(65536),translation:text(65536),romanization:text(65536)},['translation','romanization'])
const subline = object({text:text(65536),language:text(128),words:array(word,10000)},['language','words'])
const line = object({startTimeMs:milliseconds,endTimeMs:milliseconds,text:text(65536),translation:text(65536),romanization:text(65536),translations:array(subline,16),romanizations:array(subline,16),words:array(word,10000),isBackground:{type:'boolean'},isDuet:{type:'boolean'}},['endTimeMs','translation','romanization','translations','romanizations','words','isBackground','isDuet'])
const lyric = nullable(object({format:{const:'crlyric'},version:{const:1},track:ref,offsetMs:{type:'number'},plainText:text(1048576),lines:array(line,20000)},['plainText']))
const resultItem = object({ref:object({kind:enumeration('track','playlist'),providerId:text(128,1),id:text(256,1)}),title:text(512),subtitle:text(512),metadata:object({artists:array(text(256),32)})},['subtitle','metadata'])
const empty = object({})
const inputs: Record<HookOperationName, JsonObject> = {
  'player.play':object({track:operationTrackSchema,queueIndex:integer()},['queueIndex']),
  'player.pause':empty,'player.resume':empty,'player.previous':empty,
  'player.next':object({reason:enumeration('user','ended','error'),track:operationTrackSchema},['track']),
  'player.error':object({track:operationTrackSchema,error:enumeration('resolve','start','media','playback')}),
  'player.queueEnded':object({tracks},['tracks']),
  'player.seek':object({positionMs:integer()}),
  'player.setVolume':object({volume:{type:'number',minimum:0,maximum:1}}),
  'player.setMode':object({mode:enumeration('sequence','single','random')}),
  'player.resolve':object({track:operationTrackSchema,quality:{...text(64),pattern:'^[\\w.-]*$'}}),
  'queue.add':object({tracks:{...tracks,minItems:1},position:enumeration('next','end')}),
  'queue.remove':object({tracks}), 'queue.clear':object({tracks},['tracks']), 'queue.shuffle':object({items:tracks}),
  'track.like':object({track:operationTrackSchema,liked:{type:'boolean'}}),
  'playlist.create':object({name:text(512,1),location:enumeration('local','cloud')}),
  'playlist.delete':object({playlist}),
  'playlist.addTracks':object({playlist,tracks}), 'playlist.removeTracks':object({playlist,tracks}),
  'playlist.import':object({value:text(4096,1),importerId:{...text(257,3),pattern:'^[\\w.-]{1,128}:[\\w.-]{1,128}$'}},['importerId']),
  'playlist.export':object({playlist,format:enumeration('cmpl','cpl')}),
  'search.query':object({query:text(4096,1),sourceId:{...text(128,1),pattern:'^[\\w.-]+$'},kinds:{...array(text(64,1),32),minItems:1}}),
  'search.suggest':object({query:text(4096,1),items:array(text(512,1),100)}),
  'search.results':object({query:text(4096,1),sourceId:text(128,1),page:object({kind:enumeration('track','playlist'),items:array(resultItem,500)})}),
  'account.switch':object({pluginId:text(128,1),accountId:text(128,1),fromConnectionId:nullable(text(128,1)),connectionId:text(128,1)}),
  'lyrics.load':object({track:operationTrackSchema}), 'lyrics.transform':object({track:operationTrackSchema,lyric}),
  'download.create':object({tracks,quality:{...text(64,1),pattern:'^[\\w.-]+$'},directory:{type:'string',pattern:'^[a-f0-9-]{36}$'}},['directory']),
  'download.filename':object({track:operationTrackSchema,name:text(255,1)}),
  'share.create':object({track:operationTrackSchema}),
  'link.open':object({url:{...text(8192,1),format:'uri'},from:enumeration('paste','drop','deeplink')}),
  'notification.show':object({title:text(512),body:text(8192),level:enumeration('info','success','warning','error')}),
  'window.close':empty,
}
const operations = {...PLAYBACK_OPERATIONS,...RESOLVE_OPERATIONS,...ACCOUNT_OPERATIONS,...SEARCH_OPERATIONS,...LIBRARY_OPERATIONS,...WINDOW_OPERATIONS,...LYRIC_OPERATIONS,...DOWNLOAD_OPERATIONS,...SHARING_OPERATIONS,...SYSTEM_OPERATIONS}
export const OPERATION_CATALOG = Object.fromEntries(Object.entries(operations).map(([key, entry]) => {
  const name = key as HookOperationName
  const outputSchema = name === 'player.resolve' ? object({ok:{type:'boolean'}}) : name.startsWith('lyrics.') ? lyric : name === 'share.create' ? nullable(object({id:text(4096,1),url:{...text(8192,1),format:'uri'},template:text(16384)},['template'])) : {type:'null'}
  return [name, {...entry, observe:operationEventPermission(name+':done'), inputSchema:inputs[name], outputSchema}]
})) as Record<HookOperationName, (typeof operations)[HookOperationName] & {observe:ReturnType<typeof operationEventPermission>;inputSchema:JsonObject;outputSchema:JsonObject}>
