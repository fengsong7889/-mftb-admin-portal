import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Form,
  Input,
  Select,
  Radio,
  Checkbox,
  Button,
  Upload,
  message,
  Tooltip,
  type UploadFile,
} from 'antd'
import {
  CloseOutlined,
  UploadOutlined,
  FilePdfOutlined,
  FolderOutlined,
  FileImageOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'

/** 集團ID选项 */
const groupIdOptions = [
  { label: '20261298121911', value: '20261298121911' },
  { label: '20261298121912', value: '20261298121912' },
  { label: '20261298121913', value: '20261298121913' },
]

/** 歸還ID选项 */
const returnIdOptions = [
  { label: '快速選擇ID', value: '' },
  { label: 'RID-20260101', value: 'RID-20260101' },
  { label: 'RID-20260102', value: 'RID-20260102' },
]

/** 實收賬戶充值方式 */
const actualPayOptions = [
  { label: '對公轉帳', value: 'corporate' },
  { label: '銀行轉賬', value: 'bank' },
  { label: '混合支付', value: 'mixed' },
]

interface RechargeModalProps {
  open: boolean
  onClose: () => void
  /** 传入当前行的集团信息，用于回填 */
  record?: {
    groupId?: string
    groupName?: string
    brand?: string
  } | null
}

export default function RechargeModal({ open, onClose, record }: RechargeModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [_groupId, setGroupId] = useState<string>('')
  const [directAmount, setDirectAmount] = useState<string>('')
  const [actualPayMethod, setActualPayMethod] = useState<string>('corporate')
  const [actualAmount, setActualAmount] = useState<string>('')
  const [bankAmount, setBankAmount] = useState<string>('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([])
  const [remark, setRemark] = useState('')

  /** 弹窗打开时回填数据 */
  useEffect(() => {
    if (open && record) {
      setGroupId(record.groupId || '')
      form.setFieldsValue({
        groupId: record.groupId,
        groupName: record.groupName,
        category: '1mFood',
        businessType: 'delivery',
        businessCategory: 'takeout',
        returnId: '',
        isActual: true,
        actualPayMethod: 'corporate',
      })
    }
    if (!open) {
      form.resetFields()
      setGroupId('')
      setDirectAmount('')
      setActualAmount('')
      setBankAmount('')
      setUploadedFiles([])
      setRemark('')
    }
  }, [open, record, form])

  /** 确认提交 */
  const handleConfirm = async () => {
    try {
      const values = await form.validateFields()
      if (!directAmount) {
        message.warning(t('accountBalance.fillVisualAmount'))
        return
      }
      message.success(t('accountBalance.rechargeSuccess'))
      onClose()
    } catch {
      // 表单校验未通过
    }
  }

  /** 模拟文件上传 */
  const handleUpload = (info: { file: { status?: string; name: string; uid?: string }; fileList: UploadFile[] }) => {
    const newFile = {
      uid: info.file?.uid || Date.now().toString(),
      name: info.file?.name || `憑證_${uploadedFiles.length + 1}.png`,
      status: 'done' as const,
      url: '#',
    }
    setUploadedFiles((prev) => [...prev, newFile])
  }

  const removeFile = (uid: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.uid !== uid))
  }

  /** 获取文件图标 */
  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
    if (name.match(/\.(png|jpg|jpeg|gif)$/i)) return <FileImageOutlined style={{ fontSize: 28, color: '#1976D2' }} />
    return <FolderOutlined style={{ fontSize: 28, color: '#FB8C00' }} />
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={680}
      className="recharge-modal"
      maskClosable={false}
      destroyOnClose
    >
      {/* 弹窗头部 */}
      <div className="recharge-header">
        <div className="recharge-title">
          <span className="recharge-title-icon">💰</span>
          {t('accountBalance.rechargeModalTitle')}
        </div>
        <button className="recharge-close-btn" onClick={onClose}>
          <CloseOutlined />
        </button>
      </div>

      <Form form={form} layout="vertical" className="recharge-form" requiredMark>
        {/* 基本信息 */}
        <div className="recharge-section">
          <div className="recharge-section-title">{t('accountBalance.basicInfo')}</div>
          <div className="recharge-row">
            <Form.Item
              label={t('accountBalance.colGroupId')}
              name="groupId"
              rules={[{ required: true, message: t('accountBalance.selectGroupId') }]}
              className="recharge-col"
            >
              <Select
                placeholder={t('accountBalance.selectGroupId')}
                options={groupIdOptions}
                showSearch
                onChange={(val) => {
                  setGroupId(val)
                  const opt = groupIdOptions.find((o) => o.value === val)
                  if (opt) form.setFieldsValue({ groupName: opt.label })
                }}
              />
            </Form.Item>
            <Form.Item label={t('accountBalance.colGroupName')} name="groupName" className="recharge-col">
              <Input disabled placeholder={t('accountBalance.autoFillAfterGroupId')} className="recharge-disabled-input" />
            </Form.Item>
          </div>

          <Form.Item
            label={t('accountBalance.category')}
            name="category"
            rules={[{ required: true, message: t('accountBalance.selectCategory') }]}
          >
            <Radio.Group>
              <Radio value="1mFood">@1mFood</Radio>
              <Radio value="meat">@2肉排</Radio>
              <Radio value="other">@3其它</Radio>
            </Radio.Group>
          </Form.Item>

          <div className="recharge-row">
            <Form.Item
              label={t('accountBalance.businessType')}
              name="businessType"
              rules={[{ required: true, message: t('accountBalance.selectBusinessType') }]}
              className="recharge-col"
            >
              <Radio.Group>
                <Radio value="delivery">@到家</Radio>
                <Radio value="store">@到店</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              label={t('accountBalance.businessCategory')}
              name="businessCategory"
              className="recharge-col"
            >
              <Radio.Group>
                <Radio value="takeout">@外賣</Radio>
              </Radio.Group>
            </Form.Item>
          </div>
        </div>

        {/* 充值金额 */}
        <div className="recharge-section">
          <div className="recharge-section-title">{t('accountBalance.rechargeAmount')}</div>
          <Form.Item
            label={
              <span>
                {t('accountBalance.visualRecharge')}
                <Tooltip title={t('accountBalance.visualRechargeTooltip')}>
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                </Tooltip>
              </span>
            }
            required
            className="recharge-amount-item"
          >
            <Input
              placeholder={t('accountBalance.enterRechargeAmount')}
              value={directAmount}
              onChange={(e) => setDirectAmount(e.target.value)}
              className="recharge-amount-input"
              suffix={
                directAmount ? (
                  <span className="recharge-amount-preview">{directAmount}</span>
                ) : null
              }
            />
            {directAmount && (
              <div className="recharge-amount-hint">
                推薦零紙幣值元紙鈔分
              </div>
            )}
          </Form.Item>

          <Form.Item label={t('accountBalance.returnId')} name="returnId">
            <Select placeholder={t('accountBalance.quickSelectId')} options={returnIdOptions} allowClear />
          </Form.Item>

          <Form.Item label={t('accountBalance.isActual')} name="isActual" valuePropName="checked">
            <Checkbox>{t('accountBalance.yes')}</Checkbox>
          </Form.Item>

          <div className="recharge-row">
            <Form.Item label={t('accountBalance.actualPayLabel')} name="actualPayMethod" className="recharge-col-sm">
              <Select
                options={actualPayOptions}
                value={actualPayMethod}
                onChange={setActualPayMethod}
              />
            </Form.Item>
            <Form.Item label=" " className="recharge-col">
              <Input
                placeholder={t('accountBalance.enterActualAmount')}
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                className="recharge-amount-input"
                suffix={
                  actualAmount ? (
                    <span className="recharge-amount-preview recharge-amount-green">{actualAmount}</span>
                  ) : null
                }
              />
            </Form.Item>
          </div>

          {/* 銀行轉賬 - 仅在選擇對公轉帳或銀行轉賬時顯示 */}
          {(actualPayMethod === 'corporate' || actualPayMethod === 'bank') && (
            <Form.Item
              label={t('accountBalance.bankTransfer')}
              className="recharge-amount-item"
            >
              <Input
                placeholder={t('accountBalance.enterBankAmount')}
                value={bankAmount}
                onChange={(e) => setBankAmount(e.target.value)}
                className="recharge-amount-input"
                suffix={
                  bankAmount ? (
                    <span className="recharge-amount-preview">{bankAmount}</span>
                  ) : null
                }
              />
              {bankAmount && (
                <div className="recharge-amount-hint">
                  推薦零紙幣萬元抵消部分
                </div>
              )}
            </Form.Item>
          )}
        </div>

        {/* 上傳合同憑證 */}
        <div className="recharge-section">
          <div className="recharge-section-title">
            {t('accountBalance.mergedProcessing')}
            <span className="recharge-section-desc">{t('accountBalance.mergedProcessingDesc')}</span>
          </div>
          <div className="recharge-upload-area">
            {uploadedFiles.map((file) => (
              <div key={file.uid} className="recharge-upload-card">
                {getFileIcon(file.name)}
                <span className="recharge-upload-name">{file.name.length > 8 ? file.name.slice(0, 8) + '...' : file.name}</span>
                <button className="recharge-upload-remove" onClick={() => removeFile(file.uid)}>
                  <CloseOutlined />
                </button>
              </div>
            ))}
            {uploadedFiles.length < 4 && (
              <Upload
                accept=".png,.jpg,.jpeg,.pdf"
                showUploadList={false}
                beforeUpload={() => false}
                onChange={handleUpload}
              >
                <div className="recharge-upload-add">
                  <UploadOutlined style={{ fontSize: 24, color: '#B0B0B0' }} />
                  <span>{t('accountBalance.upload')}</span>
                </div>
              </Upload>
            )}
          </div>
          {uploadedFiles.length > 0 && (
            <div className="recharge-upload-tip">
              {t('accountBalance.uploadedFilesTip', { count: uploadedFiles.length })}
            </div>
          )}
        </div>

        {/* 備註信息 */}
        <div className="recharge-section">
          <div className="recharge-section-title">{t('accountBalance.paymentAdvice')}</div>
          <div className="recharge-remark-wrap">
            <textarea
              className="recharge-remark"
              placeholder={t('accountBalance.remarkPlaceholder')}
              maxLength={200}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
            />
            <span className="recharge-remark-count">{remark.length}/200</span>
          </div>
        </div>
      </Form>

      {/* 底部操作按钮 */}
      <div className="recharge-footer">
        <Button className="recharge-btn-cancel" onClick={onClose}>
          {t('accountBalance.rechargeBack')}
        </Button>
        <Button type="primary" className="recharge-btn-confirm" onClick={handleConfirm}>
          {t('accountBalance.rechargeConfirm')}
        </Button>
      </div>
    </Modal>
  )
}
