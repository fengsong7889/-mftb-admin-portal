import { useState, useCallback } from 'react'
import { Modal, Upload, Table, Button, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { InboxOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { parseCategoryExcel, generateCategoryImportTemplate, type ParsedCategoryRow } from '../../../utils/categoryImport'

interface CategoryImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (rows: ParsedCategoryRow[]) => Promise<void>
  /** 現有分類列表，用於校驗重複 */
  existingCategories: Array<{ code: string; name: string }>
}

export default function CategoryImportModal({ open, onClose, onImport, existingCategories }: CategoryImportModalProps) {
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedCategoryRow[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setParsedRows([])
    setErrors([])
    try {
      const result = await parseCategoryExcel(file)
      setParsedRows(result.rows)
      setErrors(result.errors)
      if (result.rows.length === 0 && result.errors.length === 0) {
        message.warning('文件中未找到有效數據')
      }
    } catch {
      message.error('文件解析失敗，請確認文件格式為 .xlsx / .xls')
    } finally {
      setParsing(false)
    }
    return false // 阻止自動上傳
  }, [])

  const handleDownloadTemplate = () => {
    const url = generateCategoryImportTemplate()
    const a = document.createElement('a')
    a.href = url
    a.download = '分類導入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleConfirm = async () => {
    if (parsedRows.length === 0) {
      message.warning('無有效數據可導入')
      return
    }
    // 校驗編碼重複
    const existingCodes = new Set(existingCategories.map(c => c.code))
    const duplicateRows = parsedRows.filter(r => existingCodes.has(r.code))
    if (duplicateRows.length > 0) {
      message.error(`以下分類編碼已存在：${duplicateRows.map(r => r.code).join('、')}`)
      return
    }
    setImporting(true)
    try {
      await onImport(parsedRows)
      message.success(`成功導入 ${parsedRows.length} 條分類`)
      handleClose()
    } catch {
      // 錯誤由 onImport 處理
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setParsedRows([])
    setErrors([])
    onClose()
  }

  const columns: TableColumnsType<ParsedCategoryRow> = [
    { title: '分类编码', dataIndex: 'code', key: 'code', width: 120 },
    { title: '分类名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '上级分类编码', dataIndex: 'parentCode', key: 'parentCode', width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => (
        <Tag color={v === 'enabled' ? 'success' : 'default'}>
          {v === 'enabled' ? '启用' : '停用'}
        </Tag>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
  ]

  return (
    <Modal
      title="批量导入分类"
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnClose
      footer={
        parsedRows.length > 0
          ? (
            <Space>
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} loading={importing} onClick={handleConfirm}>
                確認導入（{parsedRows.length} 條）
              </Button>
            </Space>
          )
          : null
      }
    >
      {/* 模板下載 + 上傳區 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#595959' }}>
            請先下載模板，按模板格式填寫數據後上傳
          </span>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            下載導入模板
          </Button>
        </div>
        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          showUploadList={false}
          beforeUpload={handleFile}
          disabled={parsing || importing}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">{parsing ? '解析中…' : '點擊或拖拽 Excel 文件到此處'}</p>
          <p className="ant-upload-hint">支持 .xlsx / .xls 格式</p>
        </Upload.Dragger>
      </div>

      {/* 錯誤提示 */}
      {errors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#FF4D4F', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            <CloseCircleOutlined style={{ marginRight: 4 }} />
            解析發現 {errors.length} 個錯誤：
          </div>
          <div style={{ maxHeight: 120, overflow: 'auto', background: '#FFF2F0', border: '1px solid #FFCCC7', borderRadius: 6, padding: '8px 12px' }}>
            {errors.map((err, i) => (
              <div key={i} style={{ fontSize: 12, color: '#CF1322', lineHeight: 1.8 }}>{err}</div>
            ))}
          </div>
        </div>
      )}

      {/* 預覽表格 */}
      {parsedRows.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: '#52C41A', fontWeight: 600, marginBottom: 8 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            解析成功，共 {parsedRows.length} 條有效數據
          </div>
          <Table
            columns={columns}
            dataSource={parsedRows}
            rowKey="rowNo"
            size="small"
            pagination={parsedRows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
            scroll={{ y: 240 }}
          />
        </div>
      )}
    </Modal>
  )
}
