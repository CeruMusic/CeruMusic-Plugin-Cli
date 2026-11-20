import assert from 'node:assert/strict'
import test from 'node:test'
import { projectPluginRoute, validatePluginRouteTarget } from '@shiqianjiang/ceru-plugin-sdk/navigation'

const manifest = {id:'example.routes',ui:{pages:[{id:'login'}]}}
test('named navigation binds plugin pages to the calling manifest', () => {
  const target = {name:'plugin-page',params:{pluginId:'example.routes',pageId:'login'},query:{tab:'status'}}
  assert.deepEqual(validatePluginRouteTarget(target,manifest),target)
  for (const invalid of [{...target,params:{...target.params,pluginId:'another'}},{...target,params:{...target.params,pageId:'absent'}},{path:'/home/local'},{name:'recognition-worker'},{name:'https://example.invalid'},{name:'list',params:{id:'C:/music/song.wav'}},{name:'list'}, {name:'search',query:{token:'secret'}}])
    assert.throws(()=>validatePluginRouteTarget(invalid,manifest))
})
test('route reports expose owner query only to the owner and omit internal payloads', () => {
  const params = {pluginId:'example.routes', pageId:'login'}
  assert.deepEqual(projectPluginRoute('plugin-page',params,{tab:'own'},'example.routes').query,{tab:'own'})
  assert.deepEqual(projectPluginRoute('plugin-page',params,{tab:'own'},'another').query,{})
  assert.deepEqual(projectPluginRoute('list',{id:'safe'},{source:'local',meta:'private',cover:'file:///private',resourceRef:'private'}),{name:'list',params:{id:'safe'},query:{source:'local'}})
  assert.equal(projectPluginRoute('desktop-lyric',{},{}),null)
})
