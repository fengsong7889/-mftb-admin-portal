/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState } from 'react'
import { Button, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import { DownloadOutlined, FileImageOutlined, FilePdfOutlined, FileWordOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { exportCpmReportDocx } from '@/api/cpm'
import { documentFileName, exportDocument, type DocumentExportKind } from '@/utils/documentExport'

/** 三个出口：两种浏览器端位图导出 + 一种服务端 .docx */
type ExportKind = DocumentExportKind | 'docx'

interface Props {
  /** 取当前正在阅读的文档节点；返回 null 表示此刻没有可下载的文件 */
  getTarget: () => HTMLElement | null
  /** 文件名主干（周期 + 版本），落盘前由共享层清洗非法字符 */
  fileBase: string
  /** 服务端 Word 导出的报告身份；草稿没有冻结快照，缺 reportId 时不给这个出口 */
  reportId?: number | null
  /** 正在阅读的版本：导出必须跟着版本走，否则「导出的」和「看的」不是同一版 */
  revisionNo?: number | null
}

/**
 * 汇报下载入口（长图 / PDF / Word）。
 *
 * 为什么 Word 单独走后端而另两个走浏览器：.docx 的价值在于**可再加工**，
 * 内容由服务端从冻结快照重新排版，字体由打开方渲染，不需要往镜像里塞十几兆中文字体；
 * 长图与 PDF 的价值在于**和屏幕上完全一样**，截当前节点就是所见即所得。
 * 两条链路各守一个诉求，不是为了少写代码把它们合成一条。
 *
 * <p>成功提示必须说清「导的是哪一版」：文件一旦发出去就追不回来，
 * 只报「下载成功」会让人以为之后补录的投入也会在里面。
 */
export default function CpmExportButton({ getTarget, fileBase, reportId, revisionNo }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<ExportKind>()

  const items: MenuProps['items'] = [
    { key: 'image', icon: <FileImageOutlined />, label: t('cpm.export.image', { defaultValue: '長圖圖片（PNG）' }) },
    { key: 'pdf', icon: <FilePdfOutlined />, label: t('cpm.export.pdf', { defaultValue: 'PDF 文件（A4 分頁）' }) },
    ...(reportId ? [{ key: 'docx', icon: <FileWordOutlined />, label: t('cpm.export.docx', { defaultValue: 'Word 文件（.docx）' }) }] : []),
  ]

  const run = async (kind: ExportKind) => {
    setBusy(kind)
    try {
      if (kind === 'docx') {
        if (!reportId) return
        const blob = await exportCpmReportDocx(reportId, revisionNo ?? undefined)
        saveBlob(blob, documentFileName(fileBase, 'docx', 'cpm_report'))
      } else {
        const node = getTarget()
        if (!node) {
          message.warning(t('cpm.export.notReady', { defaultValue: '匯報正文尚未載入，請稍後再試' }))
          return
        }
        await exportDocument(node, kind, fileBase, { alias: 'cpm-document', fallbackName: 'cpm_report' })
      }
      message.success(kind === 'docx'
        ? t('cpm.export.docxDone', { no: revisionNo ?? 1, defaultValue: '已下載 V{{no}} 的 Word 版（服務端按凍結快照排版）' })
        : t('cpm.export.done', { defaultValue: '已下載當前閱讀版本的正文快照' }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('cpm.export.failed', { defaultValue: '下載失敗，請重試' }))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Dropdown trigger={['click']} disabled={!!busy} menu={{ items, onClick: ({ key }) => void run(key as ExportKind) }}>
      <Button icon={<DownloadOutlined />} loading={!!busy}>{t('cpm.export.button', { defaultValue: '導出' })}</Button>
    </Dropdown>
  )
}

/**
 * blob 落盘：必须先 revokeObjectURL，否则每次导出都在堆里留一份完整文件，
 * 连点几次导出就能把标签页内存吃光（大 PDF 尤其明显）。
 */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
