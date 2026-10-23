import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Modal, Space, Table, Tag, Tooltip, Upload, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { RDM_STATUS_LABEL } from '../../../constants/rdm'
import { RDM_IMPORT_TEMPLATE_NAME } from '../../../constants/rdmImport'
import {
  generateRequirementImportTemplate,
  parseRequirementImportExcel,
  type ParsedRdmImportRow,
  type RdmImportRowError,
} from '../rdmImport'

/**
 * 需求存量导入弹窗。
 *
 * 流程：下载模板 → 上传 Excel → 本地解析与行级校验 → 预览 → 确认导入。
 *
 * 这里的校验只是 UX 拦截：人员、项目、迭代、云效编号唯一性必须由后端重新判定，
 * 前端没有权威数据，不能把本地结果当作安全边界。
 */
interface RequirementImportModalProps {
  open: boolean
  onClose: () => void
  /**
   * 确认导入。
   * <p>返回 failed>0 表示服务端整批拒绝：弹窗保留已解析数据并展示逐行原因，不关闭；
   * 抛错则由页面统一提示。
   */
  onImport: (rows: ParsedRdmImportRow[]) => Promise<RequirementImportOutcome | void>
}

/** 导入结果（与服务端逐行结果对齐） */
export interface RequirementImportOutcome {
  imported: number
  skipped: number
  failed: number
  /** 失败行的人话描述，已包含 Excel 行号 */
  messages: string[]
}

export default function RequirementImportModal({ open, onClose, onImport }: RequirementImportModalProps) {
  const { t } = useTranslation()
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState<ParsedRdmImportRow[]>([])
  const [errors, setErrors] = useState<RdmImportRowError[]>([])
  const [fileName, setFileName] = useState('')

  /** 解析上传文件；返回 false 阻止 antd 自动上传到服务器 */
  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setRows([])
    setErrors([])
    setFileName(file.name)
    try {
      const result = await parseRequirementImportExcel(file)
      setRows(result.rows)
      setErrors(result.errors)
      if (result.rows.length === 0 && result.errors.length === 0) {
        message.warning(t('rdm.import.warnNoRows'))
      }
    } catch {
      setRows([])
      setErrors([{ rowNo: 0, message: t('rdm.import.warnParseFailed') }])
    } finally {
      setParsing(false)
    }
    return false
  }, [t])

  /** 下载空白模板（含状态字典页签） */
  const handleDownloadTemplate = async () => {
    const url = await generateRequirementImportTemplate()
    const a = document.createElement('a')
    a.href = url
    a.download = RDM_IMPORT_TEMPLATE_NAME
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    if (importing) return
    setRows([])
    setErrors([])
    setFileName('')
    onClose()
  }

  const handleConfirm = async () => {
    if (rows.length === 0) {
      message.warning(t('rdm.import.warnNothingToImport'))
      return
    }
    setImporting(true)
    try {
      const outcome = await onImport(rows)
      if (outcome && outcome.failed > 0) {
        // 服务端先全量校验再写入：失败时库里没有任何变动，保留弹窗让用户按行修正
        setErrors(outcome.messages.map((message, index) => ({ rowNo: index, message })))
        message.warning(t('rdm.import.warnValidationFailed', { count: outcome.failed }))
        return
      }
      const imported = outcome?.imported ?? rows.length
      const skipped = outcome?.skipped ?? 0
      message.success(skipped > 0
        ? t('rdm.import.successWithSkipped', { imported, skipped })
        : t('rdm.import.successImported', { imported }))
      handleClose()
    } catch {
      // 错误提示由调用方统一处理，弹窗保留已解析数据供用户修正后重试
    } finally {
      setImporting(false)
    }
  }

  /**
   * 移除预览中的某一行：只改本地待提交列表，不触发任何请求。
   * 行号保留 Excel 原值，删除后不重排，用户仍能对照原文件定位。
   */
  const handleRemoveRow = (row: ParsedRdmImportRow) => {
    if (rows.length <= 1) {
      message.warning(t('rdm.import.warnKeepAtLeastOne'))
      return
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.import.removeTitle'),
      content: t('rdm.import.removeContent', { rowNo: row.rowNo, title: row.title }),
      okText: t('rdm.import.removeOk'),
      cancelText: t('rdm.import.btnCancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        setRows(prev => prev.filter(item => item.rowNo !== row.rowNo))
      },
    })
  }

  /**
   * 移除按钮不可用的原因：
   * - 有错误行时整批本来就不可确认，此时移除只会让人误以为能「删掉错误」，先修文件；
   * - 只剩一条时必须保留，和后端「至少填写一行」的约束对齐。
   */
  const removeBlockedTip = errors.length > 0
    ? t('rdm.import.removeTipErrors')
    : rows.length <= 1
      ? t('rdm.import.removeTipLast')
      : ''

  const columns: TableColumnsType<ParsedRdmImportRow> = [
    { title: t('rdm.import.colRowNo'), dataIndex: 'rowNo', key: 'rowNo', width: 60 },
    { title: t('rdm.import.colTitle'), dataIndex: 'title', key: 'title', width: 240, ellipsis: true },
    { title: t('rdm.import.colExternalNo'), dataIndex: 'externalNo', key: 'externalNo', width: 130 },
    {
      title: t('rdm.import.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: ParsedRdmImportRow['status']) => <Tag color="blue">{RDM_STATUS_LABEL[value]}</Tag>,
    },
    { title: t('rdm.import.colProjectManager'), dataIndex: 'projectManager', key: 'projectManager', width: 120, render: (v?: string) => v || '-' },
    { title: t('rdm.import.colProductManager'), dataIndex: 'productManager', key: 'productManager', width: 120, render: (v?: string) => v || '-' },
    { title: t('rdm.import.colSubmitter'), dataIndex: 'submitter', key: 'submitter', width: 120, render: (v?: string) => v || '-' },
    { title: t('rdm.import.colProjectName'), dataIndex: 'projectName', key: 'projectName', width: 150, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('rdm.import.colIterationName'), dataIndex: 'iterationName', key: 'iterationName', width: 130, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('rdm.import.colDescription'), dataIndex: 'description', key: 'description', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t('rdm.import.colAction'),
      key: 'action',
      width: 80,
      // 表格列宽超过弹窗宽度，操作列固定在右侧，避免必须横向滚动才能移除
      fixed: 'right',
      render: (_: unknown, row: ParsedRdmImportRow) => (
        <Tooltip title={removeBlockedTip || undefined}>
          <span>
            <Button
              type="link"
              size="small"
              danger
              disabled={!!removeBlockedTip}
              onClick={() => handleRemoveRow(row)}
            >
              {t('rdm.import.btnRemove')}
            </Button>
          </span>
        </Tooltip>
      ),
    },
  ]

  return (
    <Modal
      title={t('rdm.import.modalTitle')}
      open={open}
      onCancel={handleClose}
      width={1000}
      destroyOnHidden
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={handleClose} disabled={importing}>{t('rdm.import.btnCancel')}</Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={importing}
            disabled={rows.length === 0 || errors.length > 0}
            onClick={handleConfirm}
          >
            {rows.length > 0 ? t('rdm.import.btnConfirmCount', { count: rows.length }) : t('rdm.import.btnConfirm')}
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('rdm.import.alertTitle')}
        description={t('rdm.import.alertDesc')}
      />

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('rdm.import.templateColumns')}
            {' '}
            {t('rdm.import.templateStatusHint')}
          </span>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            {t('rdm.import.btnDownloadTemplate')}
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
          <p className="ant-upload-text">
            {parsing ? t('rdm.import.uploadParsing') : fileName || t('rdm.import.uploadPlaceholder')}
          </p>
          <p className="ant-upload-hint">{t('rdm.import.uploadHint')}</p>
        </Upload.Dragger>
      </div>

      {errors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#FF4D4F', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            <CloseCircleOutlined style={{ marginRight: 4 }} />
            {t('rdm.import.errorCount', { count: errors.length })}
          </div>
          <div style={{
            maxHeight: 140,
            overflow: 'auto',
            background: '#FFF2F0',
            border: '1px solid #FFCCC7',
            borderRadius: 6,
            padding: '8px 12px',
          }}
          >
            {errors.map((item, index) => (
              <div key={`${item.rowNo}-${index}`} style={{ fontSize: 12, color: '#CF1322', lineHeight: 1.8 }}>
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: '#52C41A', fontWeight: 600, marginBottom: 8 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            {t('rdm.import.validCount', { count: rows.length })}
          </div>
          <Table
            columns={columns}
            dataSource={rows}
            rowKey="rowNo"
            size="small"
            pagination={rows.length > 10 ? { pageSize: 10, showSizeChanger: false, showTotal: count => t('rdm.import.totalCount', { count }) } : false}
            scroll={{ x: 1400, y: 260 }}
          />
        </div>
      )}
    </Modal>
  )
}

