import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { watchProject } from '../packages/cli/dist/dev.js'
import { scaffoldProject } from '../packages/cli/dist/project.js'

for (const [template,view] of [['page-extension','Search.vue'],['player-skin','Artwork.vue']]) test(`${template} watch keeps the last artifact after invalid edits and recovers without restarting`, async () => {
  const root = await mkdtemp(join(process.cwd(), '.test-tmp-')),
    controller = new AbortController(),
    messages = []
  let run
  async function next(prefix, index = 0) {
    const end = Date.now() + 30000
    while (!messages.slice(index).some((message) => message.startsWith(prefix)) && Date.now() < end)
      await delay(25)
    assert.ok(
      messages.slice(index).some((message) => message.startsWith(prefix)),
      messages.join('\n'),
    )
  }
  try {
    await scaffoldProject(root, { template, language: 'ts' })
    const child = join(root, 'src/WatchChild.vue'), parent = join(root, 'src/WatchParent.vue')
    const childSource = '<script setup lang="ts">defineProps<{ count: number }>()</script><template><slot name="detail" :value="count" /></template>'
    await writeFile(child, childSource)
    await writeFile(parent, '<script setup lang="ts">import WatchChild from "./WatchChild.vue"</script><template><WatchChild :count="42"><template #detail="{value}">{{ value.toFixed(0) }}</template></WatchChild></template>')
    run = watchProject(root, controller.signal, (message) => messages.push(message))
    await next('CERU_BUILD_READY ')
    const output = join(root, 'dist/plugin.js'),
      file = join(root, 'src',view),
      original = await readFile(file, 'utf8'),
      initial = await readFile(output, 'utf8'),
      index = messages.length
    const badType = original.replace(
      '<script setup lang="ts">',
      '<script setup lang="ts">\nconst invalid: number = "bad"',
    )
    assert.notEqual(original, badType)
    await writeFile(file, badType)
    await next('CERU_ERROR ', index)
    assert.match(messages.at(-1), /not assignable/)
    assert.equal(await readFile(output, 'utf8'), initial)
    const invalidTemplate = original.replace(
      '<template>',
      '<template><p>{{ missingTemplateValue }}</p>',
    )
    assert.notEqual(original, invalidTemplate)
    const beforeTemplateError = messages.length
    await writeFile(file, invalidTemplate)
    await next('CERU_ERROR ', beforeTemplateError)
    assert.match(messages.at(-1), /missingTemplateValue/)
    assert.equal(await readFile(output, 'utf8'), initial)
    const afterTypeError = messages.length
    await writeFile(file, '<template><section></template>')
    await next('CERU_ERROR ', afterTypeError)
    assert.equal(await readFile(output, 'utf8'), initial)
    const afterError = messages.length
    await writeFile(file, original.replace('</template>', '<span>热重载验收</span></template>'))
    await next('CERU_BUILD_READY ', afterError)
    assert.notEqual(await readFile(output, 'utf8'), initial)
    const valid = await readFile(output, 'utf8'), beforePropEdit = messages.length
    await writeFile(child, childSource.replace('count: number', 'count: string'))
    await next('CERU_ERROR ', beforePropEdit)
    assert.match(messages.at(-1), /WatchParent\.vue.*not assignable/s)
    const beforeUnrelatedEdit = messages.length
    await writeFile(file, original)
    await next('CERU_ERROR ', beforeUnrelatedEdit)
    assert.match(messages.at(-1), /WatchParent\.vue.*not assignable/s)
    assert.equal(await readFile(output, 'utf8'), valid)
    const beforeRepair = messages.length
    await writeFile(child, childSource)
    await next('CERU_BUILD_READY ', beforeRepair)
    assert.equal(await readFile(output, 'utf8'), initial)
    const beforeSlotEdit = messages.length
    await writeFile(child, childSource.replace(':value="count"', ':value="String(count)"'))
    await next('CERU_ERROR ', beforeSlotEdit)
    assert.match(messages.at(-1), /WatchParent\.vue.*toFixed/s)
    assert.equal(await readFile(output, 'utf8'), initial)
    const beforeSlotRepair = messages.length
    await writeFile(child, childSource)
    await next('CERU_BUILD_READY ', beforeSlotRepair)
    const extra = join(root, 'src/NewView.vue'), beforeAdd = messages.length
    await writeFile(extra, '<script setup lang="ts">const bad: number = "no"</script><template>{{ bad }}</template>')
    await next('CERU_ERROR ', beforeAdd)
    assert.match(messages.at(-1), /NewView\.vue.*not assignable/s)
    assert.equal(await readFile(output, 'utf8'), initial)
    const beforeDelete = messages.length
    await unlink(extra)
    await next('CERU_BUILD_READY ', beforeDelete)
    assert.equal(await readFile(output, 'utf8'), initial)
  } finally {
    controller.abort()
    await run
    await rm(root, { recursive: true, force: true, maxRetries: 4 })
  }
})
