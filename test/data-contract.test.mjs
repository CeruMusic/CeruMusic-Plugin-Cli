import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult,
  assertResourceRef,
} from '../packages/sdk/dist/index.js'

test('v3 accepts real frozen 0.3.16 worker output from earliest-source.js', async () => {
  const { page, resolve, lyrics } = JSON.parse(
    await readFile(new URL('./fixtures/v2-wire/source-results.json', import.meta.url)),
  )
  assertContentPage(page)
  assertResourceRef(page.items[0].ref)
  assertResolveResult(resolve)
  assertLyricsDocument(lyrics)
  assert.deepEqual(lyrics.track, page.items[0].ref)
  assert.equal(lyrics.lines[0].text, '第一行')
})
