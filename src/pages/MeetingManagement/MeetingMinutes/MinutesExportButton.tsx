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
import { DownloadOutlined, FileImageOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { exportMinutes, type MinutesExportKind } from './minutesExport'

interface Props {
  /** 取当前正在阅读的正文节点；返回 null 表示此刻没有可下载的文件 */
  getTarget: () => HTMLElement | null
  /** 文件名主干（纪要编号 + 会议主题），落盘前清洗非法字符 */
  fileBase: string
}

/**
 * 「下載」下拉：长图给微信/钉钉直接发，PDF 给归档与打印。
 * 与「刷新」并排放在阅读工具行——这一行本来就是「我怎么看这份文档」的控件区。
 *
 * <p>几何与编码都在 minutesExport.ts，这里只管按钮状态与提示口径：
 * 下载件是「此刻这一版」的快照，之后改正文或作废链接都追不回已发出去的文件，
 * 所以成功提示要把「当前阅读版本」说出来，不能只报「下载成功」。
 */
export default function MinutesExportButton({ getTarget, fileBase }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<MinutesExportKind>()

  const items: MenuProps['items'] = [
    { key: 'image', icon: <FileImageOutlined />, label: t('meeting.minutes.downloadImage', { defaultValue: '長圖圖片（PNG）' }) },
    { key: 'pdf', icon: <FilePdfOutlined />, label: t('meeting.minutes.downloadPdf', { defaultValue: 'PDF 文件（A4 分頁）' }) },
  ]

  const run = async (kind: MinutesExportKind) => {
    const node = getTarget()
    if (!node) {
      message.warning(t('meeting.minutes.downloadNoBody', { defaultValue: '正文尚未載入，請切回「紀要正文」後再試' }))
      return
    }
    setBusy(kind)
    try {
      await exportMinutes(node, kind, fileBase)
      message.success(t('meeting.minutes.downloadDone', { defaultValue: '已下載當前閱讀版本的正文快照' }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('meeting.minutes.downloadFailed', { defaultValue: '下載失敗，請重試' }))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Dropdown
      trigger={['click']}
      disabled={!!busy}
      menu={{ items, onClick: ({ key }) => void run(key as MinutesExportKind) }}
    >
      <Button size="small" icon={<DownloadOutlined />} loading={!!busy}>
        {t('meeting.minutes.download', { defaultValue: '下載' })}
      </Button>
    </Dropdown>
  )
}
