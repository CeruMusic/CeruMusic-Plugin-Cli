import type { DownloadOperationName, OperationInputs, OperationTrack } from '@shiqianjiang/ceru-plugin-sdk'

const operation={intercept:'downloads.intercept',hookTimeoutMs:3000,defaultIn:'main'} as const
export const DOWNLOAD_OPERATIONS={
  'download.create':{...operation,cancelable:true,announce:true},
  'download.filename':{...operation,cancelable:false,announce:false},
} as const
export function isDownloadOperation(name:unknown):name is DownloadOperationName {
  return name==='download.create' || name==='download.filename'
}
type Input=OperationInputs[DownloadOperationName]
const key=(track:OperationTrack)=>JSON.stringify([track.ref.providerId,track.ref.id])
function track(value:any):OperationTrack {
  if(!value || value.ref?.kind!=='track' || typeof value.ref.providerId!=='string' || !/^[\w.-]{1,128}$/.test(value.ref.providerId) || value.ref.providerId==='local' || typeof value.ref.id!=='string' || !/^[\w.-]{1,256}$/.test(value.ref.id) || typeof value.title!=='string' || value.title.length>512 || !Array.isArray(value.metadata?.artists) || value.metadata.artists.length>32 || !value.metadata.artists.every((artist:unknown)=>typeof artist==='string'&&artist.length<=256)) throw Error('Invalid download track')
  return {ref:{kind:'track',providerId:value.ref.providerId,id:value.ref.id},title:value.title,metadata:{artists:[...value.metadata.artists]}}
}
export function downloadInput(name:DownloadOperationName,value:unknown,original?:Input):Input {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Invalid download input')
  if(name==='download.create') {
    const input=value as OperationInputs['download.create']
    if(Object.keys(input).some(key=>!['tracks','quality','directory'].includes(key)) || !Array.isArray(input.tracks) || input.tracks.length>1000 || typeof input.quality!=='string' || !/^[\w.-]{1,64}$/.test(input.quality) || (input.directory!==undefined && !/^[a-f0-9-]{36}$/.test(input.directory))) throw Error('Invalid download request')
    const initial=original && 'tracks' in original?original:undefined
    if(initial && input.directory!==initial.directory) throw Error('Cannot change download directory')
    const remaining=new Map<string,OperationTrack[]>()
    for(const item of initial?.tracks??[]) { const row=remaining.get(key(item))??[];row.push(item);remaining.set(key(item),row) }
    const tracks=Array.from(input.tracks,item=>{
      const clean=track(item)
      if(!initial)return clean
      const selected=remaining.get(key(clean))?.shift()
      if(!selected)throw Error('Cannot add or duplicate download tracks')
      return selected
    })
    return {tracks,quality:input.quality,...(input.directory===undefined?{}:{directory:input.directory})}
  }
  const input=value as OperationInputs['download.filename'], selected=track(input.track)
  if(Object.keys(input).some(key=>key!=='track'&&key!=='name') || typeof input.name!=='string' || !input.name || input.name.length>255 || /[\\/:*?"<>|\u0000-\u001f]/.test(input.name) || /[. ]$/.test(input.name) || /^\./.test(input.name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(input.name)) throw Error('Invalid download filename')
  if(original && 'name' in original && (key(selected)!==key(original.track) || input.name.split('.').at(-1)!==original.name.split('.').at(-1))) throw Error('Cannot change download track or file format')
  return {track:original && 'name' in original?original.track:selected,name:input.name}
}
