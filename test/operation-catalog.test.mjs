import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'
import {OPERATION_CATALOG} from '../packages/core/dist/operation-catalog.js'
import {listOperationTools, toolInput} from '../packages/core/dist/operation-tools.js'

test('all operation schemas compile and public tool schemas agree with runtime validation', () => {
  const ajv=new Ajv({strict:false,validateFormats:false})
  for (const [name, entry] of Object.entries(OPERATION_CATALOG)) {
    assert.ok(entry.observe, name)
    ajv.compile(entry.inputSchema);ajv.compile(entry.outputSchema)
  }
  const track={ref:{kind:'track',providerId:'demo',id:'one'},title:'One',metadata:{artists:['Artist']}}
  const playlist={id:'list-1',name:'Playlist',location:'local'}
  const samples={
    'track.like':{track,liked:true},'player.play':{track},'player.next':{reason:'user'},'player.pause':{},'player.resume':{},'player.previous':{},
    'player.seek':{positionMs:12},'player.setVolume':{volume:0.5},'player.setMode':{mode:'single'},
    'queue.add':{tracks:[track],position:'next'},'queue.remove':{tracks:[track]},'queue.clear':{},'download.create':{tracks:[track],quality:'320k'},
    'share.create':{track},
    'notification.show':{title:'Notice',body:'Hello',level:'info'},
    'link.open':{url:'https://example.test/list',from:'paste'},'window.close':{},
    'playlist.create':{name:'Playlist',location:'local'},'playlist.delete':{playlist},
    'playlist.addTracks':{playlist,tracks:[track]},'playlist.removeTracks':{playlist,tracks:[track]},
    'playlist.import':{value:'https://example.test/playlist'},'playlist.export':{playlist,format:'cmpl'},
  }
  for (const tool of listOperationTools()) {
    assert.ok(OPERATION_CATALOG[tool.name])
    const validate=ajv.compile(tool.inputSchema)
    assert.equal(validate(samples[tool.name]),true,JSON.stringify(validate.errors))
    assert.deepEqual(toolInput(tool.name,samples[tool.name]),samples[tool.name])
  }
  assert.throws(()=>toolInput('player.next',{reason:'error'}))
  assert.throws(()=>toolInput('player.play',{track,queueIndex:1}))
  assert.throws(()=>toolInput('queue.clear',{tracks:[track]}))
  assert.throws(()=>toolInput('player.play',{track,hidden:'ignored'}))
  assert.throws(()=>toolInput('queue.add',{tracks:[track],position:'end',connectionId:'secret'}))
  assert.throws(()=>toolInput('queue.add',{tracks:[{...track,ref:{...track.ref,providerId:'private'}}],position:'end'}))
  assert.throws(()=>toolInput('share.create',{track:{...track,ref:{...track.ref,providerId:'local'}}}))
  for(const url of ['file:///private','https://example.test/?access_token=private','cerumusic://plugin/add/link?url=https://example.test/plugin.js'])
    assert.throws(()=>toolInput('link.open',{url,from:'paste'}))
  assert.throws(()=>toolInput('window.close',{force:true}))
  assert.throws(()=>toolInput('notification.show',{title:'Notice',body:'hello',level:'silent'}))
})
