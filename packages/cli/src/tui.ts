// 无依赖的终端界面基础件：颜色降级、行内输入、方向键选择与取消处理。
// 仅由 init 向导在 TTY 中调用，调用方负责判断是否具备交互条件。
// 颜色按 NO_COLOR / FORCE_COLOR / 终端能力降级，非 TTY 输出退化为纯文本。
import { emitKeypressEvents } from 'node:readline'

export interface TuiInput {
  isTTY?: boolean
  setRawMode?(mode: boolean): void
  resume?(): void
  pause?(): void
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
}

export interface TuiOutput {
  isTTY?: boolean
  columns?: number
  hasColors?(count?: number): boolean
  write(chunk: string): unknown
}

export interface TuiStreams {
  input: TuiInput
  output: TuiOutput
}

export interface Key {
  name?: string
  ctrl?: boolean
  meta?: boolean
}

export class PromptCancelled extends Error {
  constructor() {
    super('Prompt cancelled')
    this.name = 'PromptCancelled'
  }
}

export interface Style {
  bold(text: string): string
  dim(text: string): string
  accent(text: string): string
  success(text: string): string
  error(text: string): string
}

const CLEAR_LINE = '\r\u001b[2K'
const CLEAR_DOWN = '\u001b[0J'
const RESET = '\u001b[0m'

// 终端显示宽度：忽略 ANSI 序列，全角字符按两列计。
function displayWidth(text: string): number {
  let width = 0
  for (const char of text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')) {
    const code = char.codePointAt(0) ?? 0
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    width += wide ? 2 : 1
  }
  return width
}

// 窄终端下截断长文本，避免行内重绘错位。
function clampText(text: string, max: number | undefined): string {
  if (max === undefined || displayWidth(text) <= max) return text
  let result = ''
  for (const char of text) {
    if (displayWidth(result + char) > max - 1) break
    result += char
  }
  return result + '…'
}

// 16 色码，以及 256 色终端上更柔和的等价色。
const PALETTE = {
  16: { accent: '36', success: '32', error: '31', dim: '90' },
  256: { accent: '38;5;45', success: '38;5;42', error: '38;5;203', dim: '38;5;245' },
}

function colorDepth(output: TuiOutput): 0 | 16 | 256 {
  if ('NO_COLOR' in process.env) return 0
  const forced = process.env.FORCE_COLOR
  if (forced === '0') return 0
  if (forced) return forced === '1' ? 16 : 256
  if (!output.isTTY || process.env.TERM === 'dumb') return 0
  return output.hasColors?.(256) ? 256 : 16
}

export function createStyle(output: TuiOutput): Style {
  const depth = colorDepth(output)
  const codes = depth === 256 ? PALETTE[256] : PALETTE[16]
  const paint =
    (code: string) =>
    (text: string): string =>
      depth === 0 ? text : '\u001b[' + code + 'm' + text + RESET
  return {
    bold: paint('1'),
    dim: paint(codes.dim),
    accent: paint(codes.accent),
    success: paint(codes.success),
    error: paint(codes.error),
  }
}

// 原始模式按“会话”切换：一次向导里只进出一次，prompt 之间保持不变。
// Windows 上 libuv 每次切换控制台模式都会重启读取；会话中反复 toggle 或 pause
// 会让下一次输入落进行模式缓冲（方向键被行编辑吃掉，只剩回车有效）。
let rawSession: TuiInput | undefined
let rawRestore: NodeJS.Immediate | undefined

// 进程异常退出时的兜底：只恢复控制台模式，不再碰流。
function restoreRawOnExit(): void {
  const input = rawSession
  if (!input) return
  rawSession = undefined
  if (input.isTTY === true && typeof input.setRawMode === 'function') input.setRawMode(false)
}

function leaveRawMode(): void {
  const input = rawSession
  if (!input) return
  rawSession = undefined
  process.off('exit', restoreRawOnExit)
  if (input.isTTY === true && typeof input.setRawMode === 'function') input.setRawMode(false)
  // 停掉挂起的读取：否则 stdin 的读取句柄会让事件循环一直存活，进程无法正常退出。
  input.pause?.()
}

// 提问之间的间隙不立刻退出原始模式：连续 prompt 沿用同一次 raw 会话。
function leaveRawModeSoon(): void {
  if (!rawSession || rawRestore) return
  rawRestore = setImmediate(() => {
    rawRestore = undefined
    leaveRawMode()
  })
}

function enterRawMode(input: TuiInput): void {
  if (rawRestore) {
    clearImmediate(rawRestore)
    rawRestore = undefined
    // 同一次会话：原始模式还没退出，直接接着用。
    if (rawSession === input) return
  } else if (rawSession === input) {
    return
  }
  leaveRawMode()
  rawSession = input
  if (input.isTTY === true && typeof input.setRawMode === 'function') input.setRawMode(true)
  input.resume?.()
  process.once('exit', restoreRawOnExit)
}

// 接管按键：进入原始模式并监听 keypress；返回的清理函数恢复终端状态。
function listen(streams: TuiStreams, onKey: (text: string, key: Key) => void): () => void {
  const { input } = streams
  emitKeypressEvents(input as unknown as NodeJS.ReadableStream)
  enterRawMode(input)
  const handler = (text: string, key: Key) => onKey(typeof text === 'string' ? text : '', key ?? {})
  input.on('keypress', handler)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    input.off('keypress', handler)
    leaveRawModeSoon()
  }
  return close
}

export interface TextOptions {
  message: string
  /** 直接回车时采用的值，显示为灰色占位。 */
  initial?: string
  validate?(value: string): string | undefined | Promise<string | undefined>
}

export async function promptText(streams: TuiStreams, options: TextOptions): Promise<string> {
  const style = createStyle(streams.output)
  const suffix = options.initial ? '  ' + style.dim('(' + options.initial + ')') : ''
  const head =
    ' ' +
    style.accent('?') +
    ' ' +
    style.bold(options.message) +
    suffix +
    ' ' +
    style.accent('›') +
    ' '
  let value = ''
  const write = (line: string) => streams.output.write(CLEAR_LINE + line)
  // 已输入内容占满一行时不再覆盖本行，避免折行残影。
  const collapse = (line: string) =>
    streams.output.write(
      (streams.output.columns === undefined || displayWidth(head + value) < streams.output.columns
        ? CLEAR_LINE
        : '\n') + line,
    )
  return await new Promise<string>((resolve, reject) => {
    let settled = false
    let stop: () => void = () => {}
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      stop()
      done()
    }
    const cancel = () =>
      finish(() => {
        collapse(' ' + style.error('■') + ' ' + style.dim('已取消') + '\n')
        reject(new PromptCancelled())
      })
    const submit = async () => {
      const answer = (value.trim() || options.initial || '').trim()
      let problem: string | undefined
      try {
        problem = await options.validate?.(answer)
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error)
      }
      if (problem) {
        value = ''
        streams.output.write(
          '\n' + ' ' + style.error('✖') + ' ' + style.dim(problem) + '\n' + head,
        )
        return
      }
      finish(() => {
        collapse(
          ' ' +
            style.success('✔') +
            ' ' +
            style.dim(options.message) +
            '  ' +
            style.bold(answer) +
            '\n',
        )
        resolve(answer)
      })
    }
    stop = listen(streams, (text, key) => {
      if (key.ctrl && key.name === 'c') return cancel()
      if (key.name === 'escape') return cancel()
      if (key.name === 'return' || key.name === 'enter') {
        void submit()
        return
      }
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('')
        write(head + value)
        return
      }
      if (key.ctrl && key.name === 'u') {
        value = ''
        write(head + value)
        return
      }
      if (!text || key.ctrl || key.meta || /[\u0000-\u001f\u007f]/.test(text)) return
      value += text
      write(head + value)
    })
    write(head + value)
  })
}

export interface Choice<T> {
  value: T
  label: string
  hint?: string
}

export interface SelectOptions<T> {
  message: string
  choices: Choice<T>[]
  initial?: number
}

export async function promptSelect<T>(streams: TuiStreams, options: SelectOptions<T>): Promise<T> {
  const style = createStyle(streams.output)
  const choices = options.choices
  if (!choices.length) throw new Error('promptSelect requires at least one choice')
  const width = Math.max(...choices.map((choice) => choice.label.length))
  let active = Math.min(Math.max(options.initial ?? 0, 0), choices.length - 1)
  const columns = streams.output.columns
  const message = ' ' + style.accent('?') + ' ' + style.bold(options.message)
  const hint = '↑/↓ 移动 · 数字键跳转 · Enter 确认 · Ctrl+C 取消'
  const head =
    columns !== undefined && displayWidth(message + '  ' + hint) >= columns
      ? message
      : message + '  ' + style.dim(hint)
  const hintWidth =
    columns === undefined ? undefined : columns - 6 - String(choices.length).length - width
  const rows = () =>
    choices.map((choice, index) => {
      const current = index === active
      const label = choice.label.padEnd(width)
      const note = choice.hint && (hintWidth ?? 4) >= 4 ? clampText(choice.hint, hintWidth) : ''
      return (
        ' ' +
        (current ? style.accent('❯') : ' ') +
        ' ' +
        style.dim(String(index + 1) + '.') +
        ' ' +
        (current ? style.bold(style.accent(label)) : label) +
        (note ? '  ' + style.dim(note) : '')
      )
    })
  let drawn = false
  const draw = () => {
    if (drawn) streams.output.write('\u001b[' + choices.length + 'A')
    streams.output.write(
      rows()
        .map((row) => CLEAR_LINE + row + '\n')
        .join(''),
    )
    drawn = true
  }
  streams.output.write(head + '\n')
  draw()
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    let stop: () => void = () => {}
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      stop()
      streams.output.write('\u001b[' + (choices.length + 1) + 'A' + CLEAR_DOWN)
      done()
    }
    const cancel = () =>
      finish(() => {
        streams.output.write(' ' + style.error('■') + ' ' + style.dim('已取消') + '\n')
        reject(new PromptCancelled())
      })
    const confirm = (index: number) =>
      finish(() => {
        streams.output.write(
          ' ' +
            style.success('✔') +
            ' ' +
            style.dim(options.message) +
            '  ' +
            style.bold(choices[index].label) +
            '\n',
        )
        resolve(choices[index].value)
      })
    const move = (delta: number) => {
      active = (active + delta + choices.length) % choices.length
      draw()
    }
    stop = listen(streams, (text, key) => {
      if (key.ctrl && key.name === 'c') return cancel()
      if (key.name === 'escape') return cancel()
      if (key.name === 'up' || key.name === 'k') return move(-1)
      if (key.name === 'down' || key.name === 'j') return move(1)
      if (key.name === 'return' || key.name === 'enter') return confirm(active)
      if (/^[1-9]$/.test(text) && Number(text) <= choices.length) {
        active = Number(text) - 1
        draw()
      }
    })
  })
}
