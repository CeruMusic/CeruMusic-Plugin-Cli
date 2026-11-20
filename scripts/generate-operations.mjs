import { readFile, writeFile } from 'node:fs/promises'
import {OPERATION_CATALOG} from '../packages/core/dist/operation-catalog.js'
import {listOperationTools} from '../packages/core/dist/operation-tools.js'

const doc = new URL('../docs/OPERATIONS.md', import.meta.url)
const yes = (value) => value ? '是' : '否'
const code = (value) => '`' + value + '`'
const callablePermission = name => {
  const tool = listOperationTools().find(tool=>tool.name===name)
  return tool ? tool.permission ?? '无需额外权限' : '宿主入口'
}
const lines = [
  '# v3 插件操作目录', '',
  '此页由 npm run docs:operations 从 Core 操作目录生成，请勿手改。表中列出工具链支持的操作；桌面是否触发还取决于宿主版本及对应入口。', '',
  '| 操作 | 拦截权限 | 完成事件权限 | 可取消 | 处理器时限 | 默认执行位置 | 提示用户 | 主动调用权限 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...Object.entries(OPERATION_CATALOG).map(([name, entry]) => '| ' + [code(name), code(entry.intercept), code(entry.observe), yes(entry.cancelable), entry.hookTimeoutMs + ' ms', code(entry.defaultIn), yes(entry.announce), callablePermission(name)].join(' | ') + ' |'), '',
  '开发、离线测试与桌面调试请见[播放与队列拦截指南](HOOKS-AND-EVENTS.md)。', '',
  '## 输入和结果的 JSON Schema', '',
  '以下描述可序列化字段。跨字段约束、原操作身份、公开链接安全检查和撤权检查继续由宿主运行时执行。`private` 歌曲引用是短期句柄，主动调用工具只接受公开歌曲。', '',
  ...Object.entries(OPERATION_CATALOG).flatMap(([name, entry]) => ['### '+code(name), '', '```json', JSON.stringify({input:entry.inputSchema,output:entry.outputSchema},null,2), '```','']),
]
const output = lines.join('\n')
if (process.argv.includes('--check')) {
  if ((await readFile(doc, 'utf8')).replaceAll('\r\n', '\n') !== output) throw Error('操作目录已改变，请运行 npm run docs:operations')
} else await writeFile(doc, output)
