import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Upload, Table, Button, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { InboxOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { parseCategoryExcel, generateCategoryImportTemplate, type ParsedCategoryRow } from '../../../utils/categoryImport'

/**
 * 资产分类批量导入弹窗
 *
 * 流程：下载模板 → 上传 Excel → 解析并预览 → 校验编码重复 → 确认导入。
 * 解析与模板生成逻辑位于 `utils/categoryImport`。
 */
interface CategoryImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (rows: ParsedCategoryRow[]) => Promise<void>
  /** 现有分类列表，用于校验重复 */
  existingCategories: Array<{ code: string; name: string }>
}

/**
 * 资产分类批量导入弹窗组件
 *
 * @param props 见 {@link CategoryImportModalProps}
 */
export default function CategoryImportModal({ open, onClose, onImport, existingCategories }: CategoryImportModalProps) {
  const { t } = useTranslation()
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedCategoryRow[]>([])
  const [errors, setErrors] = useState<string[]>([])

  /** 处理上传文件：解析 Excel 并回填预览数据；返回 false 阻止 antd 自动上传 */
  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setParsedRows([])
    setErrors([])
    try {
      const result = await parseCategoryExcel(file)
      setParsedRows(result.rows)
      setErrors(result.errors)
      if (result.rows.length === 0 && result.errors.length === 0) {
        message.warning(t('asset.noValidData'))
      }
    } catch {
      message.error(t('asset.parseFailed'))
    } finally {
      setParsing(false)
    }
    return false // 阻止自动上传
  }, [t])

  /** 下载导入模板（xlsx） */
  const handleDownloadTemplate = async () => {
    const url = await generateCategoryImportTemplate()
    const a = document.createElement('a')
    a.href = url
    a.download = t('asset.categoryImportTemplate')
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 确认导入：校验编码重复后回调 onImport */
  const handleConfirm = async () => {
    if (parsedRows.length === 0) {
      message.warning(t('asset.noDataToImport'))
      return
    }
    // 校验编码重复
    const existingCodes = new Set(existingCategories.map(c => c.code))
    const duplicateRows = parsedRows.filter(r => existingCodes.has(r.code))
    if (duplicateRows.length > 0) {
      message.error(t('asset.duplicateCodes', { codes: duplicateRows.map(r => r.code).join('、') }))
      return
    }
    setImporting(true)
    try {
      await onImport(parsedRows)
      message.success(t('asset.importSuccess', { count: parsedRows.length }))
      handleClose()
    } catch {
      // 错误由 onImport 处理
    } finally {
      setImporting(false)
    }
  }

  /** 关闭弹窗并重置内部状态 */
  const handleClose = () => {
    setParsedRows([])
    setErrors([])
    onClose()
  }

  const columns: TableColumnsType<ParsedCategoryRow> = [
    { title: t('asset.colCatCode'), dataIndex: 'code', key: 'code', width: 120 },
    { title: t('asset.colCatName'), dataIndex: 'name', key: 'name', width: 140 },
    {
      title: t('asset.colParentCode'), dataIndex: 'parentCode', key: 'parentCode', width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => (
        <Tag color={v === 'enabled' ? 'success' : 'default'}>
          {v === 'enabled' ? t('asset.statusEnabled') : t('asset.statusDisabled')}
        </Tag>
      ),
    },
    { title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
  ]

  return (
    <Modal
      title={t('asset.batchImportTitle')}
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnClose
      footer={
        parsedRows.length > 0
          ? (
            <Space>
              <Button onClick={handleClose}>{t('common.cancel')}</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} loading={importing} onClick={handleConfirm}>
                {t('asset.confirmImport', { count: parsedRows.length })}
              </Button>
            </Space>
          )
          : null
      }
    >
      {/* 模板下载 + 上传区 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('asset.templateHint')}
          </span>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            {t('asset.downloadTemplate')}
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
          <p className="ant-upload-text">{parsing ? t('asset.parsingText') : t('asset.clickOrDragUpload')}</p>
          <p className="ant-upload-hint">{t('asset.formatHint')}</p>
        </Upload.Dragger>
      </div>

      {/* 错误提示 */}
      {errors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#FF4D4F', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            <CloseCircleOutlined style={{ marginRight: 4 }} />
            {t('asset.parseErrorsFound', { count: errors.length })}
          </div>
          <div style={{ maxHeight: 120, overflow: 'auto', background: '#FFF2F0', border: '1px solid #FFCCC7', borderRadius: 6, padding: '8px 12px' }}>
            {errors.map((err, i) => (
              <div key={i} style={{ fontSize: 12, color: '#CF1322', lineHeight: 1.8 }}>{err}</div>
            ))}
          </div>
        </div>
      )}

      {/* 预览表格 */}
      {parsedRows.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: '#52C41A', fontWeight: 600, marginBottom: 8 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            {t('asset.parseSuccessTotal', { count: parsedRows.length })}
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
