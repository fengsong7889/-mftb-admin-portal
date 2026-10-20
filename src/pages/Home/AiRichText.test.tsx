import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AiRichText from './AiRichText'

/**
 * AI 回复渲染锁。
 * <p>模型按 System Prompt 输出 Markdown（`**金額**`、编号列表），旧实现只替换 `\n`，
 * 用户看到的是满屏星号。这里钉住「星号必须变成加粗、列表必须成行」，同时保证不注入 HTML。
 */
describe('AiRichText', () => {
  it('把 **粗体** 渲染成 strong，而不是原样输出星号', () => {
    render(<AiRichText text="實際餘額：**9,998.36**" />)
    const strong = screen.getByText('9,998.36')
    expect(strong.tagName).toBe('STRONG')
    expect(document.body.textContent).not.toContain('**')
  })

  it('无序列表与有序列表各自成行，保留编号', () => {
    const { container } = render(<AiRichText text={'- 虛擬餘額：100\n- 實際餘額：200\n1. 第一項\n2. 第二項'} />)
    // 4 个列表项 → 4 个行容器（编号不被吃掉）
    const rows = Array.from(container.querySelectorAll('div')).filter((d) => d.style.display === 'flex')
    expect(rows).toHaveLength(4)
    expect(rows[2].textContent).toContain('1.')
    expect(rows[3].textContent).toContain('第二項')
    expect(document.body.textContent).not.toMatch(/^[-*] /m)
  })

  it('空文本不报错，普通文本原样展示', () => {
    const { rerender } = render(<AiRichText text="" />)
    expect(document.body.textContent).toBe('')
    rerender(<AiRichText text="純文字回覆" />)
    expect(document.body.textContent).toBe('純文字回覆')
  })

  /**
   * 模型输出结构化结果时爱用 markdown 表格，旧实现把 `| :--- |` 当正文直出（实测报出）。
   */
  it('markdown 表格渲染成真实 table，不剩分隔行', () => {
    const { container } = render(
      <AiRichText text={'| 集團 | 餘額 |\n| :--- | ---: |\n| 騰訊 | **9,998.20** |'} />,
    )
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('th')).toHaveLength(2)
    expect(table?.querySelectorAll('td')).toHaveLength(2)
    expect(document.body.textContent).not.toContain(':---')
    // 单元格内的 **粗体** 也要继续渲染
    expect(table?.querySelector('strong')?.textContent).toBe('9,998.20')
  })

  it('不注入 HTML：尖括号内容按纯文本渲染（避免 XSS 面）', () => {
    render(<AiRichText text={'<img src=x onerror=alert(1)>'} />)
    expect(document.querySelector('img')).toBeNull()
    expect(document.body.textContent).toContain('<img src=x')
  })
})
