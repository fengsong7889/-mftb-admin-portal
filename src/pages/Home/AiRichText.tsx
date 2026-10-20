import { Fragment, type ReactNode } from 'react'

/**
 * AI 回复的轻量结构化渲染。
 * <p>为什么要它：模型按 System Prompt 输出 Markdown（`**金额**`、`- 列表`、编号列表），
 * 而旧实现只做 `\\n` 替换，用户看到的是满屏星号（AI 深度测试实测暴露）。
 * <p>约束：不引入 markdown 等新依赖（§K.2 禁止新渲染框架），也不直出 HTML 字符串 ——
 * 这里只把文本切成 React 节点，天然无 XSS 面。
 */

/** 行内 **粗体** 切段；其余内容按纯文本渲染 */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return parts.filter((p) => p !== '').map((p, i) => {
    const bold = /^\*\*(.+)\*\*$/.exec(p)
    if (bold) {
      return <strong key={`${keyPrefix}-${i}`} style={{ color: '#E8720C', fontWeight: 600 }}>{bold[1]}</strong>
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{p}</Fragment>
  })
}

/** 把一行表格文本拆成单元格（容忍首尾多出的 | 与空格） */
function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** 对齐行（| :--- | ---: |）：用来判断一个行块是不是表格 */
const ALIGN_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/

/**
 * GFM 表格渲染：模型给结构化结果时最爱用表格，而旧实现连 `| :--- |` 都当普通文本输出（实测）。
 * 只识别「表头行 + 对齐行 + 数据行」这种最少歧义的形态，渲染成真实 <table> 节点，不拼 HTML 字符串。
 */
function renderTable(block: string[], key: number) {
  const header = splitCells(block[0])
  const body = block.slice(2).map(splitCells)
  return (
    <table key={key} style={{ borderCollapse: 'collapse', margin: '8px 0', fontSize: 13 }}>
      <thead>
        <tr>
          {header.map((cell, i) => (
            <th key={i} style={{ border: '1px solid #e8eaed', background: '#FAFAFA', padding: '4px 10px', textAlign: 'left', fontWeight: 600 }}>
              {renderInline(cell, `th-${key}-${i}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {header.map((_, c) => (
              <td key={c} style={{ border: '1px solid #f0f0f0', padding: '4px 10px', color: '#595959' }}>
                {renderInline(row[c] ?? '', `td-${key}-${r}-${c}`)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AiRichText({ text }: { text: string }) {
  if (!text) return null
  const lines = text.replace(/\\r\\n/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 表格块：当前行含 | 且下一行是对齐行
    if (line.includes('|') && i + 1 < lines.length && ALIGN_ROW.test(lines[i + 1])) {
      let j = i
      while (j < lines.length && lines[j].includes('|')) j += 1
      nodes.push(renderTable(lines.slice(i, j), i))
      i = j
      continue
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line)
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    if (ul) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: 4 }}>
          <span aria-hidden="true" style={{ color: '#8C8C8C' }}>•</span>
          <span style={{ flex: 1 }}>{renderInline(ul[1], `ul-${i}`)}</span>
        </div>,
      )
    } else if (ol) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: 4 }}>
          <span style={{ color: '#8C8C8C', minWidth: 16, textAlign: 'right' }}>{ol[1]}.</span>
          <span style={{ flex: 1 }}>{renderInline(ol[2], `ol-${i}`)}</span>
        </div>,
      )
    } else if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 8 }} />)
    } else {
      nodes.push(<div key={i}>{renderInline(line, `ln-${i}`)}</div>)
    }
    i += 1
  }
  return <>{nodes}</>
}
