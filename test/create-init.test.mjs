import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { printInitSummary, promptInit } from '../packages/cli/dist/init.js'
import { PromptCancelled, promptSelect, promptText } from '../packages/cli/dist/tui.js'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const cli = resolve(workspace, 'packages/cli/dist/bin.js')

// 模拟交互终端：isTTY 为真但不进入真实原始模式，按键用文本序列注入。
function fakeTerminal() {
  const input = new PassThrough()
  input.isTTY = true
  const rawModes = []
  input.setRawMode = (mode) => rawModes.push(mode)
  const chunks = []
  const output = {
    isTTY: false,
    write: (chunk) => {
      chunks.push(String(chunk))
      return true
    },
  }
  return { input, output, rawModes, text: () => chunks.join('') }
}

const tick = () => new Promise((done) => setImmediate(done))
const settle = () => new Promise((done) => setTimeout(done, 20))

test('select renders hints and moves with arrow keys and number shortcuts', async () => {
  const terminal = fakeTerminal()
  const pending = promptSelect(terminal, {
    message: '选择模板',
    choices: [
      { value: 'source', label: 'source', hint: '本地搜索 demo' },
      { value: 'vue', label: 'vue', hint: 'Vue 单文件组件' },
    ],
  })
  await tick()
  terminal.input.write('\u001b[A')
  await tick()
  const rendered = terminal.text()
  assert.ok(rendered.includes('本地搜索 demo'), rendered)
  terminal.input.write('2')
  await tick()
  terminal.input.write('\r')
  await tick()
  assert.equal(await pending, 'vue')
  await tick()
  assert.deepEqual(
    terminal.rawModes,
    [true, false],
    'raw mode is entered once and restored after the prompt',
  )
  assert.ok(terminal.text().includes('✔ 选择模板  vue'), terminal.text())
})

test('select cancels on Ctrl+C and restores the terminal', async () => {
  const terminal = fakeTerminal()
  const pending = promptSelect(terminal, {
    message: '选择语言',
    choices: [{ value: 'ts', label: 'TypeScript' }],
  })
  await tick()
  terminal.input.write('\u0003')
  await assert.rejects(pending, (error) => error instanceof PromptCancelled)
  await tick()
  assert.equal(terminal.rawModes.at(-1), false)
  assert.ok(terminal.text().includes('已取消'), terminal.text())
})

test('text prompt keeps the default, edits with backspace and re-asks after a rejected value', async () => {
  const terminal = fakeTerminal()
  const pending = promptText(terminal, {
    message: '插件目录',
    initial: 'my-ceru-plugin',
    validate: (value) => (value === 'taken' ? '目录非空，请换一个' : undefined),
  })
  await tick()
  terminal.input.write('taken\r')
  await settle()
  assert.ok(terminal.text().includes('目录非空，请换一个'), terminal.text())
  terminal.input.write('demo2')
  await tick()
  terminal.input.write('\u007f')
  await tick()
  terminal.input.write('3\r')
  await settle()
  assert.equal(await pending, 'demo3')

  const empty = fakeTerminal()
  const fallback = promptText(empty, { message: '插件目录', initial: 'my-ceru-plugin' })
  await tick()
  empty.input.write('\r')
  assert.equal(await fallback, 'my-ceru-plugin')
})

test('init wizard collects directory, template and language from one session', async () => {
  const terminal = fakeTerminal()
  const pending = promptInit(terminal, {}, '0.0.0-test')
  await tick()
  terminal.input.write('my-thing\r')
  await settle()
  terminal.input.write('\u001b[B\r')
  await settle()
  terminal.input.write('\u001b[B\r')
  await settle()
  assert.deepEqual(await pending, {
    destination: 'my-thing',
    template: 'connected-library',
    language: 'js',
  })
  // 连续提问共用一次原始模式会话：来回切换会让 Windows 上下一次输入落进行模式缓冲。
  await tick()
  assert.deepEqual(terminal.rawModes, [true, false], 'raw mode is toggled once per session')
  const rendered = terminal.text()
  assert.ok(rendered.includes('v0.0.0-test'), rendered)
  assert.ok(rendered.includes('连接表单与状态更新 demo'), rendered)
  assert.ok(rendered.includes('✔ 选择语言  JavaScript'), rendered)
})

test('init wizard only asks for values that were not passed as flags', async () => {
  const terminal = fakeTerminal()
  const pending = promptInit(
    terminal,
    { destination: 'from-flag', template: 'react' },
    '0.0.0-test',
  )
  await tick()
  terminal.input.write('\r')
  await settle()
  assert.deepEqual(await pending, {
    destination: 'from-flag',
    template: 'react',
    language: 'ts',
  })
  const rendered = terminal.text()
  assert.ok(!rendered.includes('插件目录'), 'the given directory is not asked again')
  assert.ok(!rendered.includes('选择模板'), 'the given template is not asked again')
})

test('init summary keeps plain output for scripts and a step card for terminals', () => {
  const lines = []
  const output = { write: (chunk) => lines.push(String(chunk)) }
  printInitSummary(output, '/tmp/demo', false)
  const plain = lines.join('')
  assert.ok(plain.includes('Created /tmp/demo'), plain)
  assert.ok(plain.includes('Share only dist/plugin.js'), plain)
  assert.ok(!plain.includes('\u001b['), plain)

  lines.length = 0
  printInitSummary(output, '/tmp/demo', true)
  const card = lines.join('')
  assert.ok(card.includes('/tmp/demo'), card)
  assert.ok(card.includes('npm run dev'), card)
  assert.ok(card.includes('dist/plugin.js'), card)
})

test('init with all flags never opens the wizard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-create-'))
  const directory = join(root, 'cli-init')
  try {
    const result = spawnSync(
      process.execPath,
      [cli, 'init', directory, '--template', 'source', '--lang', 'js'],
      { encoding: 'utf8', cwd: workspace },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes('Created'), result.stdout)
    assert.ok(!result.stdout.includes('选择模板'), result.stdout)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
