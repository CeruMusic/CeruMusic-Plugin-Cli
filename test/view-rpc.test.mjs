import assert from 'node:assert/strict'
import test from 'node:test'
import {CONTRACT} from '../packages/core/dist/contract.js'

test('overlay requests use only owned declared presentations and bounded object payloads',()=>{
  const manifest={entry:{views:[{id:'form',presentation:{kind:'modal'}},{id:'inline'}]},ui:{pages:[{id:'edit',view:'form'}]}}
  const check=(method,...args)=>CONTRACT[method].validate({args},manifest)
  check('ui.pages.open','edit',{title:'编辑'});check('ui.pages.close','edit');check('ui.views.setState','inline',{})
  for(const args of [['inline'],['unknown'],['edit',[]],['edit',null],['form',{value:'中'.repeat(90000)}]])assert.throws(()=>check('ui.pages.open',...args))
  assert.throws(()=>check('ui.views.setState','edit',{}));assert.throws(()=>check('ui.pages.close','edit',{}))
})
