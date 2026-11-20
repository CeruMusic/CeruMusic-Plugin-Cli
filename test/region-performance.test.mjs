import assert from 'node:assert/strict'
import test from 'node:test'
import { frameHealth } from '../packages/core/runtime/region-performance.mjs'

function probe() {
  const health = frameHealth()
  let time = 0
  health.sample(time,0)
  return {reset: () => { health.reset(); health.sample(time,0) }, frames(interval,count,duration=interval) {
    const transitions = []
    for (let index = 0; index < count; index++) {
      time += interval
      const state = health.sample(time,duration)
      if (state) transitions.push(state)
    }
    return transitions
  }}
}
test('40ms frames warn at two seconds, fall back at ten and never notify per frame', () => {
  const meter = probe()
  assert.deepEqual(meter.frames(40,49),[])
  assert.deepEqual(meter.frames(40,1),['warning'])
  assert.deepEqual(meter.frames(40,199),[])
  assert.deepEqual(meter.frames(40,1),['fallback'])
})
test('moderate frames only warn; recovery and hiding break consecutive slow windows', () => {
  const meter = probe()
  assert.deepEqual(meter.frames(25,480),['warning'])
  assert.deepEqual(meter.frames(20,50),['recovered'])
  assert.deepEqual(meter.frames(40,225),['warning'])
  meter.reset()
  assert.deepEqual(meter.frames(40,25),[])
  assert.deepEqual(meter.frames(20,50),[])
})

test('one suspended frame cannot establish ten seconds of slow rendering', () => {
  const meter = probe()
  assert.deepEqual(meter.frames(40,75),['warning'])
  assert.deepEqual(meter.frames(12000,1,2),['recovered'])
  assert.deepEqual(meter.frames(40,25),[])
})

test('a compositor delivering ten frames per second does not blame a cheap region', () => {
  const meter = probe()
  assert.deepEqual(meter.frames(100,150,2),[])
  assert.deepEqual(meter.frames(100,20,25),['warning'])
  assert.deepEqual(meter.frames(100,10,2),['recovered'])
})

test('a plugin blocking for a full second per frame cannot evade the watchdog as a suspended tab', () => {
  const meter = probe()
  assert.deepEqual(meter.frames(1000,10,1000),['warning','fallback'])
})
