/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 纪要正文下载：长图 PNG / A4 分页 PDF，全部在浏览器里完成。
 *
 * <p>为什么不走后端出 PDF：正文卡（MinutesContentCard 的 .mm-document）本身就是渲染好的
 * 文件版式，且配色钉死浅色，截当前节点等于「所见即所得」。后端另起一条渲染链路要把
 * 中文字体、分页、缓存、读权限重验全部再造一遍，收益只有「文件更小」，代价是又一处真源。
 *
 * <p>依赖口径：html-to-image 走 foreignObject 由浏览器原生渲染，文字不会重影错位
 * （html2canvas 自行重放布局，小字号会糊），jsPDF 只负责把位图按页拼起来。
 * 两者都是动态 import，不进首包——不点下载的人不该背这几兆。
 *
 * <p>克隆盒子的两个坑都已有对策：① 原节点已解析成像素的居中 margin 会被内联进克隆，
 * 导致内容右移右缘裁（captureOptions 归零）；② 浏览器 clientHeight 向下取整，
 * 差的那一像素会裁掉正文最后一行（measure 向上取整）。
 */

/** A4 竖版与页边距（mm）：纸面按内容宽等比缩放，页边距留给打印 */
const A4_PAGE = { width: 210, height: 297, marginX: 12, marginY: 14 }

/** 截图倍率：2x 已约合 260 DPI；3x 在长纪要上会把 canvas 推到浏览器面积上限而静默产出空图 */
const PIXEL_RATIO = 2

export type MinutesExportKind = 'image' | 'pdf'

/** 一页对应的原文纵向区间（CSS px，end 不含下一页内容） */
export interface PageSlice { start: number; end: number }

/**
 * 按区块边界贪心分页，单位与入参一致（CSS px）。
 *
 * <p>不变量：每页高度 ≤ pageHeight，且区间连续覆盖 [0, totalHeight]——
 * 宁可在一块超高内容里硬切，也不能让超出页高的部分被裁掉后凭空消失。
 * <p>偏好：能装下就继续装，落点取「本页装得下的最后一个区块起点」，
 * 于是章节标题不会和它自己的表格分家；剩下的内容一页装得下时不再找边界，
 * 免得为了排版整齐造出一张只有两行的尾页。
 */
export function planPages(blockTops: number[], totalHeight: number, pageHeight: number): PageSlice[] {
  if (totalHeight <= 0 || pageHeight <= 0) return []
  const tops = [...new Set(blockTops.map(value => Math.round(value)))]
    .filter(value => value > 0 && value < totalHeight)
    .sort((a, b) => a - b)
  const pages: PageSlice[] = []
  let cursor = 0
  while (cursor < totalHeight) {
    if (totalHeight - cursor <= pageHeight) {
      pages.push({ start: cursor, end: totalHeight })
      break
    }
    const limit = cursor + pageHeight
    let candidate = 0
    for (const top of tops) {
      if (top <= cursor) continue
      if (top > limit) break
      candidate = top
    }
    const end = candidate > cursor ? candidate : limit
    pages.push({ start: cursor, end })
    cursor = end
  }
  return pages
}

/** 纪要标题会带「／」「：」等字符，直接拼进文件名在 Windows 上会落盘失败 */
export function safeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"'<>|[\]\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
  return cleaned || 'meeting_minutes'
}

/** 区块起点：正文的顶层子节点（抬头、01~05 章节、落款、单号行）相对文档顶部的距离 */
function childTops(node: HTMLElement): number[] {
  const top = node.getBoundingClientRect().top
  return Array.from(node.children).map(child => child.getBoundingClientRect().top - top)
}

/**
 * 截图期间临时摘掉祖先链上的 hidden。
 *
 * <p>查看页切 Tab 用的是 hidden 属性（只隐藏不卸载，切回来才不用重渲染整篇正文），
 * 而 display:none 的节点被 html-to-image 克隆后量不到尺寸，会产出一张空图。
 * 因此这里不改 React 状态（改状态要等重渲染，截图时机不可控），而是直接摘掉再装回。
 */
async function withVisibleAncestors<T>(node: HTMLElement, run: () => Promise<T>): Promise<T> {
  const restored: HTMLElement[] = []
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hasAttribute('hidden')) {
      ancestor.removeAttribute('hidden')
      restored.push(ancestor)
    }
  }
  try {
    return await run()
  } finally {
    restored.forEach(ancestor => ancestor.setAttribute('hidden', ''))
  }
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/**
 * 量一次、处处用：foreignObject 尺寸、克隆盒子、PDF 缩放共用同一份测量。
 * html-to-image 默认自己用 clientWidth 量，这里显式传入，避免「量的是 A、画的是 B」的口径漂移。
 */
function measure(node: HTMLElement): { width: number; height: number } {
  const rect = node.getBoundingClientRect()
  // 宽取整（影响 PDF 缩放，误差 ≤1px）；高向上取整（clientHeight 本来就向下取整，
  // 不补这一像素会把正文最后一行裁掉半行）
  return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.ceil(rect.height)) }
}

/**
 * 截图参数。
 *
 * <p>margin 归零只作用于克隆：原节点的 `margin: 0 auto` 在浏览器里已解析成具体像素
 * （宽屏下 margin-left ≈ 300px），html-to-image 会把这份 computed 样式原样内联到克隆上，
 * 克隆在 foreignObject 里再吃一遍就整体右移、右缘被裁——资产标签列印踩过的同一个坑。
 * 归零必须下在克隆而不是真实 DOM：动真实节点截图期间会肉眼可见地跳一下。
 */
function captureOptions(size: { width: number; height: number }) {
  return {
    pixelRatio: PIXEL_RATIO,
    backgroundColor: '#ffffff',
    width: size.width,
    height: size.height,
    style: { margin: '0' } as Partial<CSSStyleDeclaration>,
  }
}

/**
 * 把当前正在阅读的正文导出为文件。
 *
 * <p>PDF 的每一页都画同一张长图，只是纵向偏移不同。两个坑都有渲染验证钉住：
 * ① h 必须是**整图高度**——jsPDF 会把整张图缩放进给定的 w×h 矩形，传切片高度
 * 就把全图压扁（「被拉伸」的根因）；靠负偏移让本页区间落在内容区。
 * ② 长图探出页框的部分要显式 clip 到内容区，否则上一页的末行会漏进本页页眉。
 * 传 alias 让 jsPDF 复用同一份图像数据，否则每页都会嵌一遍，文件成倍变大。
 */
export async function exportMinutes(node: HTMLElement, kind: MinutesExportKind, fileBase: string): Promise<void> {
  await withVisibleAncestors(node, async () => {
    const size = measure(node)
    const htmlToImage = await import('html-to-image')

    if (kind === 'image') {
      const dataUrl = await htmlToImage.toPng(node, captureOptions(size))
      downloadDataUrl(dataUrl, `${safeFileName(fileBase)}.png`)
      return
    }

    const contentWidth = A4_PAGE.width - A4_PAGE.marginX * 2
    const contentHeight = A4_PAGE.height - A4_PAGE.marginY * 2
    const scale = contentWidth / size.width
    const pages = planPages(childTops(node), size.height, contentHeight / scale)
    // JPEG 而非 PNG：jsPDF 对 JPEG 直接走 DCTDecode 内嵌，不再重编码，PDF 体积可控
    const image = await htmlToImage.toJpeg(node, { ...captureOptions(size), quality: 0.95 })
    const { default: JsPDF } = await import('jspdf')
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage()
      pdf.saveGraphicsState()
      // 裁剪到内容区：长图从负偏移画起会探出页眉，不裁的话上一页的末行会漏进本页页眉
      pdf.rect(A4_PAGE.marginX, A4_PAGE.marginY, contentWidth, contentHeight, null).clip()
      pdf.addImage(
        image, 'JPEG',
        A4_PAGE.marginX, A4_PAGE.marginY - page.start * scale,
        contentWidth, size.height * scale,
        'mm-minutes',
      )
      pdf.restoreGraphicsState()
    })
    pdf.save(`${safeFileName(fileBase)}.pdf`)
  })
}
