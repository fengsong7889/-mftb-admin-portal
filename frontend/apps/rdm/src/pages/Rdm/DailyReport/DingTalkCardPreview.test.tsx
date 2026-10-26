import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DingTalkCardPreview from './DingTalkCardPreview'

/**
 * 卡片预览组件单测。
 *
 * <p>钉住三件事：
 * <ol>
 *   <li><b>预览不泄露 markdown 源码</b>：`**` 必须变成加粗，不能原样显示（否则等于没做可视化）；</li>
 *   <li><b>固定版式有按钮、模板模式没有</b>：这正是两种模式的真实差异，预览说反了会误导配置；</li>
 *   <li><b>三种行型各归其位</b>：列表项有圆点、引用块用弱化样式、空行留白。</li>
 * </ol>
 */
describe('DingTalkCardPreview', () => {
  const CONTENT = [
    '**在途 6｜逾期 2**',
    '',
    '🔴 **需關注 1 個項目**',
    '- 🔴 **E2E 驗收項目** 交付 3/10',
    '> 完整明細請看完整日報',
  ].join('\n')

  it('fixed 模式：标题、加粗正文与底部按钮都在，且不泄露 ** 源码', () => {
    render(
      <DingTalkCardPreview
        title="產研交付日報 10-22 晨報｜逾期 2"
        content={CONTENT}
        mode="fixed"
        buttonText="查看完整日報"
        timeText="09:00"
      />,
    )

    expect(screen.getByText('產研交付日報 10-22 晨報｜逾期 2')).toBeInTheDocument()
    expect(screen.getByText('在途 6｜逾期 2').tagName).toBe('STRONG')
    expect(screen.getByText('查看完整日報')).toBeInTheDocument()
    // 源码泄露会让预览退回「一堆星号」
    expect(screen.queryByText(/\*\*/)).toBeNull()
  })

  it('列表项与引用块分别渲染，引用不混进正文', () => {
    const { container } = render(
      <DingTalkCardPreview title="標題" content={CONTENT} mode="fixed" buttonText="查看" />,
    )

    expect(container.querySelectorAll('.rdm-dingtalk-preview__item')).toHaveLength(1)
    expect(container.querySelectorAll('.rdm-dingtalk-preview__quote')).toHaveLength(1)
    // 空行必须留出间隔，否则整块会挤成一坨
    expect(container.querySelectorAll('.rdm-dingtalk-preview__gap').length).toBeGreaterThan(0)
  })

  it('template 模式：不画卡片按钮，并说明是纯文字气泡', () => {
    const { container } = render(
      <DingTalkCardPreview title="標題" content="正文" mode="template" buttonText="不該出現的按鈕" />,
    )

    expect(screen.queryByText('不該出現的按鈕')).toBeNull()
    expect(container.querySelector('.rdm-dingtalk-preview__button')).toBeNull()
    expect(container.querySelector('.rdm-dingtalk-preview__hint')).not.toBeNull()
  })
})
