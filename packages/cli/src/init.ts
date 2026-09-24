// init 交互向导：目录、模板、语言三个问题，以及创建后的结果卡片。
// 只在交互终端启用；非交互路径继续用 index.ts 的纯文本输出，保证脚本可用。
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TEMPLATE_INFO, TEMPLATES } from './project.js'
import { createStyle, promptSelect, promptText, type TuiOutput, type TuiStreams } from './tui.js'

export interface InitAnswers {
  destination?: string
  template?: string
  language?: string
}

const LANGUAGES = [
  { value: 'ts', label: 'TypeScript', hint: '构建前做类型检查' },
  { value: 'js', label: 'JavaScript', hint: '不检查类型，直接构建' },
]

export async function promptInit(
  streams: TuiStreams,
  defaults: InitAnswers,
  version: string,
): Promise<Required<InitAnswers>> {
  const style = createStyle(streams.output)
  streams.output.write(
    '\n  ' +
      style.bold(style.accent('澜音插件脚手架')) +
      '  ' +
      style.dim('v' + version) +
      '\n  ' +
      style.dim('生成单文件插件工程 · TypeScript / JavaScript · Vue / React') +
      '\n\n',
  )
  const destination =
    defaults.destination ??
    (await promptText(streams, {
      message: '插件目录',
      initial: 'my-ceru-plugin',
      validate: async (value) => {
        if (!value) return '请输入目录名'
        try {
          if ((await readdir(resolve(value))).length) return '目标目录非空：' + resolve(value)
        } catch {
          // 目录不存在时会新建，直接通过。
        }
        return undefined
      },
    }))
  const template =
    defaults.template ??
    (await promptSelect(streams, {
      message: '选择模板',
      choices: TEMPLATES.map((name) => ({ value: name, label: name, hint: TEMPLATE_INFO[name] })),
    }))
  const language =
    defaults.language ??
    (await promptSelect(streams, {
      message: '选择语言',
      choices: LANGUAGES,
    }))
  return { destination, template, language }
}

export function printInitSummary(output: TuiOutput, path: string, interactive: boolean): void {
  if (!interactive) {
    output.write(
      'Created ' +
        path +
        '\n\nNext:\n  cd ' +
        JSON.stringify(path) +
        '\n  npm install\n  npm run build\n\nShare only dist/plugin.js. A v2-compatible Host is required.\n',
    )
    return
  }
  const style = createStyle(output)
  const steps: Array<[string, string]> = [
    ['cd ' + JSON.stringify(path), ''],
    ['npm install', '安装模板依赖'],
    ['npm run dev', '启动 Electron 调试工作台'],
    ['npm run build', '产出 dist/plugin.js'],
  ]
  const width = Math.max(...steps.map(([command]) => command.length))
  output.write(
    '\n  ' + style.success('✔') + ' ' + style.bold('已创建') + ' ' + style.accent(path) + '\n',
  )
  output.write('\n  ' + style.bold('下一步') + '\n')
  for (const [command, note] of steps)
    output.write(
      '    ' + style.accent(command.padEnd(width)) + (note ? '  ' + style.dim(note) : '') + '\n',
    )
  output.write('\n  ' + style.dim('只分发 dist/plugin.js；安装需要 v2 兼容的澜音 Host。') + '\n\n')
}
