/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/** 纪要正文下载回归：分页几何、隐藏阅读面的临时摘除、两种格式的落盘调用与无正文兜底。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { message } from 'antd'
import i18n from '@/i18n'
import MinutesExportButton from './MinutesExportButton'
import { exportMinutes, planPages, safeFileName } from './minutesExport'

const capture = vi.hoisted(() => ({ toPng: vi.fn(), toJpeg: vi.fn() }))
const pdf = vi.hoisted(() => ({
  ctor: vi.fn(), addPage: vi.fn(), save: vi.fn(), addImage: vi.fn(),
  saveGraphicsState: vi.fn(), restoreGraphicsState: vi.fn(), rect: vi.fn(), clip: vi.fn(),
}))
const downloads = vi.hoisted(() => ({ names: [] as string[] }))

vi.mock('html-to-image', () => ({ toPng: capture.toPng, toJpeg: capture.toJpeg }))
vi.mock('jspdf', () => ({
  default: function mockJsPDF(this: unknown, options: unknown) {
    pdf.ctor(options)
    return {
      addPage: pdf.addPage, addImage: pdf.addImage, save: pdf.save,
      saveGraphicsState: pdf.saveGraphicsState, restoreGraphicsState: pdf.restoreGraphicsState,
      rect: pdf.rect, clip: pdf.clip,
    }
  },
}))

/** jsdom 的 getBoundingClientRect 恒返回全 0，几何断言必须先伪造尺寸（否则分页算不出任何一页） */
const rects = new Map<Element, { top: number; width: number; height: number }>()

/** 必须用 this 取元素：getBoundingClientRect 调用时不传参，把它当形参接会变成永远查不到尺寸 */
function rectOf(this: Element) {
  const box = rects.get(this) ?? { top: 0, width: 0, height: 0 }
  return {
    ...box, x: 0, y: box.top, left: 0, right: box.width, bottom: box.top + box.height, toJSON: () => ({}),
  } as DOMRect
}

/** 正文挂在 hidden 的阅读面下（切 Tab 只隐藏不卸载），与查看页的真实 DOM 形状保持一致 */
function buildDocument(height: number, blockTops: number[]) {
  const surface = document.createElement('div')
  surface.className = 'mm-reading-surface'
  surface.setAttribute('hidden', '')
  const doc = document.createElement('article')
  doc.className = 'mm-document'
  surface.appendChild(doc)
  document.body.appendChild(surface)
  rects.set(doc, { top: 0, width: 960, height })
  blockTops.forEach(top => {
    const block = document.createElement('section')
    doc.appendChild(block)
    rects.set(block, { top, width: 960, height: 100 })
  })
  return { surface, doc }
}

beforeEach(() => {
  void i18n.changeLanguage('zh-TW')
  rects.clear()
  downloads.names.length = 0
  // 四个 mock 都住在模块作用域，不显式清空会跨用例累加调用次数（失败重试时尤其迷惑）
  capture.toPng.mockReset().mockResolvedValue('data:image/png;base64,AAA')
  capture.toJpeg.mockReset().mockResolvedValue('data:image/jpeg;base64,AAA')
  pdf.ctor.mockClear()
  pdf.addPage.mockClear()
  pdf.addImage.mockClear()
  pdf.save.mockClear()
  pdf.saveGraphicsState.mockClear()
  pdf.restoreGraphicsState.mockClear()
  pdf.rect.mockClear()
  pdf.clip.mockClear()
  // rect(...).clip() 是链式调用：rect 必须把带 clip 的对象还回去
  pdf.rect.mockImplementation(() => ({ clip: pdf.clip }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(rectOf)
  // jsdom 不实现导航：不拦截 click，落盘会打出 "Not implemented: navigation" 噪声而不是失败
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.names.push(this.download)
  })
  vi.spyOn(message, 'warning')
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('planPages', () => {
  it('落点取本页装得下的最后一个区块起点，剩下的内容能一页装完就不再拆', () => {
    // 页高 1000：第一页只能装到 700；剩下 800 已不足一页，不再把 1200 当分页点造出尾页
    expect(planPages([400, 700, 1200], 1500, 1000)).toEqual([
      { start: 0, end: 700 }, { start: 700, end: 1500 },
    ])
  })

  it('单块超高时在块内硬切，区间必须连续覆盖全文（否则超出页高的内容会被裁掉后凭空消失）', () => {
    const pages = planPages([100], 2600, 1000)
    expect(pages).toEqual([
      { start: 0, end: 100 }, { start: 100, end: 1100 }, { start: 1100, end: 2100 }, { start: 2100, end: 2600 },
    ])
    pages.forEach((page, index) => {
      expect(page.end - page.start).toBeLessThanOrEqual(1000)
      expect(page.start).toBe(index === 0 ? 0 : pages[index - 1].end)
    })
    expect(pages.at(-1)!.end).toBe(2600)
  })

  it('边界去重、忽略 0 与超出总高的边界，空文档不产生页', () => {
    expect(planPages([0, 500, 500, 9999], 800, 1000)).toEqual([{ start: 0, end: 800 }])
    expect(planPages([], 0, 1000)).toEqual([])
  })
})

describe('safeFileName', () => {
  it('清洗分隔符与空白，标题里的斜杠不会让 Windows 落盘失败', () => {
    expect(safeFileName('會議紀要_MJ2026/11:06 業務需求對接')).toBe('會議紀要_MJ2026_11_06_業務需求對接')
    expect(safeFileName('///')).toBe('meeting_minutes')
  })
})

describe('exportMinutes', () => {
  it('PDF 每页画整张长图靠负偏移取本页切片，切片高度当 h 会把全图压扁', async () => {
    const { doc, surface } = buildDocument(3000, [1000, 1800, 2600])
    await exportMinutes(doc, 'pdf', '會議紀要_MJ1')

    // 186mm 内容宽 / 960px => 0.19375 mm/px；页内容高 269mm => 1388.39px
    expect(capture.toJpeg).toHaveBeenCalledTimes(1)
    expect(capture.toPng).not.toHaveBeenCalled()
    // 克隆盒子的两个关键入参必须钉住：宽高与 PDF 缩放同一份测量；
    // margin 只能归零在克隆上，否则内容整体右移右缘被裁（资产标签列印同款坑）
    expect(capture.toJpeg).toHaveBeenCalledWith(doc, expect.objectContaining({
      pixelRatio: 2, width: 960, height: 3000, style: { margin: '0' },
    }))
    expect(pdf.ctor).toHaveBeenCalledWith(expect.objectContaining({ unit: 'mm', format: 'a4' }))
    expect(pdf.addPage).toHaveBeenCalledTimes(2)
    expect(pdf.addImage).toHaveBeenCalledTimes(3)
    // h 恒为整图高度（3000px × 0.19375 = 581.25mm）：jsPDF 会把整图缩放进 w×h 矩形，
    // 传切片高度就把全图压扁——这是「被拉伸」的根因，渲染验证过才钉进断言
    expect(pdf.addImage.mock.calls[0].slice(2, 6)).toEqual([12, 14, 186, expect.closeTo(581.25, 6)])
    expect(pdf.addImage.mock.calls[1].slice(2, 6)).toEqual([12, expect.closeTo(-179.75, 6), 186, expect.closeTo(581.25, 6)])
    expect(pdf.addImage.mock.calls[2].slice(2, 6)).toEqual([12, expect.closeTo(-334.75, 6), 186, expect.closeTo(581.25, 6)])
    // alias 必须相同：否则 jsPDF 每页重新嵌一份位图，文件成倍变大
    expect(pdf.addImage.mock.calls.map(call => call[6])).toEqual(['mm-minutes', 'mm-minutes', 'mm-minutes'])
    // 每页先裁到内容区再画图：不裁的话长图从负偏移探出页眉，上一页末行会漏进本页页眉
    expect(pdf.rect).toHaveBeenCalledTimes(3)
    expect(pdf.rect).toHaveBeenCalledWith(12, 14, 186, 269, null)
    expect(pdf.clip).toHaveBeenCalledTimes(3)
    expect(pdf.saveGraphicsState).toHaveBeenCalledTimes(3)
    expect(pdf.restoreGraphicsState).toHaveBeenCalledTimes(3)
    expect(pdf.save).toHaveBeenCalledWith('會議紀要_MJ1.pdf')
    expect(surface.hasAttribute('hidden')).toBe(true)
  })

  it('截图期间临时摘掉祖先的 hidden，截完原样装回（display:none 的节点会截出空图）', async () => {
    const { doc, surface } = buildDocument(1200, [])
    const observed: boolean[] = []
    capture.toJpeg.mockImplementation(async (node: HTMLElement) => {
      observed.push(node.parentElement!.hasAttribute('hidden'))
      return 'data:image/jpeg;base64,AAA'
    })
    await exportMinutes(doc, 'pdf', 'x')
    expect(observed).toEqual([false])
    expect(surface.getAttribute('hidden')).toBe('')
  })

  it('长图直接落盘 PNG，不经过 jsPDF', async () => {
    const { doc } = buildDocument(1200, [])
    await exportMinutes(doc, 'image', '會議紀要_MJ2')
    expect(capture.toPng).toHaveBeenCalledWith(doc, expect.objectContaining({
      pixelRatio: 2, width: 960, height: 1200, style: { margin: '0' },
    }))
    expect(pdf.save).not.toHaveBeenCalled()
    expect(downloads.names).toEqual(['會議紀要_MJ2.png'])
  })

  it('导出失败时把异常抛给调用方提示，不把空文件当成成功', async () => {
    const { doc } = buildDocument(1200, [])
    capture.toPng.mockRejectedValue(new Error('canvas 超限'))
    await expect(exportMinutes(doc, 'image', 'x')).rejects.toThrow('canvas 超限')
    expect(downloads.names).toEqual([])
  })
})

describe('MinutesExportButton', () => {
  it('展开菜单给出长图与 PDF 两个出口', async () => {
    render(<MinutesExportButton getTarget={() => buildDocument(1200, []).doc} fileBase="會議紀要_MJ3" />)
    fireEvent.click(screen.getByRole('button', { name: /下載/ }))
    expect(await screen.findByText('長圖圖片（PNG）')).toBeInTheDocument()
    expect(screen.getByText('PDF 文件（A4 分頁）')).toBeInTheDocument()
  })

  it('取不到正文时只提示不截图，避免产出一份空白文件', async () => {
    render(<MinutesExportButton getTarget={() => null} fileBase="x" />)
    fireEvent.click(screen.getByRole('button', { name: /下載/ }))
    fireEvent.click(await screen.findByText('長圖圖片（PNG）'))
    await waitFor(() => expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('正文尚未載入')))
    expect(capture.toPng).not.toHaveBeenCalled()
    expect(downloads.names).toEqual([])
  })
})
