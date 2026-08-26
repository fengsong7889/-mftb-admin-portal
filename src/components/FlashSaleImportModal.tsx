import { useState } from 'react'
import { Modal, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { parseFlashSaleExcel } from '../utils/flashSaleImport'
import type { ParsedFlashSaleExcel } from '../utils/flashSaleImport'

/**
 * 秒杀 Excel 批量导入弹窗（登记/统计/总览共用）
 * 浏览器端解析 xlsx -> 回调 onParsed 由页面调用对应导入 API
 */
export default function FlashSaleImportModal({ open, onClose, hint, onParsed }: {
  open: boolean
  onClose: () => void
  hint: string
  onParsed: (parsed: ParsedFlashSaleExcel) => Promise<void>
}) {
  const [parsing, setParsing] = useState(false)

  const handleFile = async (file: File) => {
    setParsing(true)
    try {
      const parsed = await parseFlashSaleExcel(file)
      const hasData = parsed.registerRows.length > 0 || parsed.statsRows.length > 0 || parsed.summaryByPeriod.length > 0
      if (!hasData) {
        message.warning('未解析到有效數據，請確認使用秒殺數據分析 Excel 模板')
        return
      }
      await onParsed(parsed)
      onClose()
    } catch {
      message.error('文件解析失敗，請確認文件格式為 .xlsx / .xls')
    } finally {
      setParsing(false)
    }
  }

  return (
    <Modal
      title="批量導入"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Upload.Dragger
        accept=".xlsx,.xls"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => { handleFile(file); return false }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">{parsing ? '解析中…' : '點擊或拖拽文件到此處上傳'}</p>
        <p className="ant-upload-hint">{hint}</p>
      </Upload.Dragger>
    </Modal>
  )
}
