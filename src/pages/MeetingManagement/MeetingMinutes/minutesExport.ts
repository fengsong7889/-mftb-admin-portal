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
 * <p>阶段三把这套分页/截图能力上提到了 `@/utils/documentExport`，这里只留纪要专属的
 * 文件名主干与 jsPDF 图像别名。为什么不各自留一份实现：分页算法、克隆 margin、
 * clientHeight 取整这三处都踩过坑并写了对策，复制就等于让下一个改分页的人只改对一处，
 * 而「导出文本 = 页面文本」这条同源约束会在两个模块的断页差异上飘开。
 *
 * <p>为什么不走后端出 PDF：正文卡（MinutesContentCard 的 .mm-document）本身就是渲染好的
 * 文件版式，且配色钉死浅色，截当前节点等于「所见即所得」。后端另起一条渲染链路要把
 * 中文字体、分页、缓存、读权限重验全部再造一遍，收益只有「文件更小」，代价是又一处真源。
 *
 * <p>本文件保留为薄转发（而不是让调用方直接改 import 路径）的理由：纪要导出已有测试钉住
 * `minutesExport` 这个名字与签名，改测试不如留一层稳定门面——它也是「纪要专属默认值」的家。
 */

// planPages 纯算法可直接转发；safeFileName 不行——它的兜底默认值属于「这份文档叫什么」，
// 直接 re-export 会把纪要的 'meeting_minutes' 换成共享层的 'document'，
// 已上线模块的下载文件名随之改变（既有测试正是钉住这一点）。
import { exportDocument, safeFileName as baseSafeFileName, type DocumentExportKind, type PageSlice } from '@/utils/documentExport'

export type MinutesExportKind = DocumentExportKind
export type { PageSlice }
export { planPages } from '@/utils/documentExport'

/** 纪要专属兜底文件名：标题被清洗成空串时仍然落到 meeting_minutes.* */
export function safeFileName(value: string, fallback = 'meeting_minutes'): string {
  return baseSafeFileName(value, fallback)
}

/**
 * 把当前正在阅读的纪要正文导出为文件。
 *
 * <p>默认文件名主干与图像别名保持纪要专属：图像别名如果和绩效导出件共用，
 * jsPDF 会把两个文档的位图当成同一份图形资源复用，出来的 PDF 是「换了标题的另一份内容」。
 */
export async function exportMinutes(
  node: HTMLElement,
  kind: MinutesExportKind,
  fileBase: string,
): Promise<void> {
  await exportDocument(node, kind, fileBase, { alias: 'mm-minutes', fallbackName: 'meeting_minutes' })
}
