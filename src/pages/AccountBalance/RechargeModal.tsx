import { useState, useEffect } from 'react'
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
  InputNumber,
  Tooltip,
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
  const [form] = Form.useForm()
  const [groupId, setGroupId] = useState<string>('')
  const [directAmount, setDirectAmount] = useState<string>('')
  const [actualPayMethod, setActualPayMethod] = useState<string>('corporate')
  const [actualAmount, setActualAmount] = useState<string>('')
  const [bankAmount, setBankAmount] = useState<string>('')
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
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
        message.warning('請填寫直觀賬戶充值金額')
        return
      }
      console.log('充值表单数据：', { ...values, directAmount, actualAmount, bankAmount, remark, uploadedFiles })
      message.success('充值提交成功！')
      onClose()
    } catch {
      // 表单校验未通过
    }
  }

  /** 模拟文件上传 */
  const handleUpload = (info: any) => {
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
          推廣金充值
        </div>
        <button className="recharge-close-btn" onClick={onClose}>
          <CloseOutlined />
        </button>
      </div>

      <Form form={form} layout="vertical" className="recharge-form" requiredMark>
        {/* 基本信息 */}
        <div className="recharge-section">
          <div className="recharge-section-title">基本信息</div>
          <div className="recharge-row">
            <Form.Item
              label="集團ID"
              name="groupId"
              rules={[{ required: true, message: '請選擇集團ID' }]}
              className="recharge-col"
            >
              <Select
                placeholder="請選擇集團ID"
                options={groupIdOptions}
                showSearch
                onChange={(val) => {
                  setGroupId(val)
                  const opt = groupIdOptions.find((o) => o.value === val)
                  if (opt) form.setFieldsValue({ groupName: opt.label })
                }}
              />
            </Form.Item>
            <Form.Item label="集團名稱" name="groupName" className="recharge-col">
              <Input disabled placeholder="選擇集團ID後自動填充" className="recharge-disabled-input" />
            </Form.Item>
          </div>

          <Form.Item
            label="所屬品類"
            name="category"
            rules={[{ required: true, message: '請選擇所屬品類' }]}
          >
            <Radio.Group>
              <Radio value="1mFood">@1mFood</Radio>
              <Radio value="meat">@2肉排</Radio>
              <Radio value="other">@3其它</Radio>
            </Radio.Group>
          </Form.Item>

          <div className="recharge-row">
            <Form.Item
              label="業務類型"
              name="businessType"
              rules={[{ required: true, message: '請選擇業務類型' }]}
              className="recharge-col"
            >
              <Radio.Group>
                <Radio value="delivery">@到家</Radio>
                <Radio value="store">@到店</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              label="業務類別"
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
          <div className="recharge-section-title">充值金額</div>
          <Form.Item
            label={
              <span>
                直觀賬戶充值
                <Tooltip title="此欄位不可為空，請輸入充值金額">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                </Tooltip>
              </span>
            }
            required
            className="recharge-amount-item"
          >
            <Input
              placeholder="請輸入充值金額"
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

          <Form.Item label="歸還ID" name="returnId">
            <Select placeholder="快速選擇ID" options={returnIdOptions} allowClear />
          </Form.Item>

          <Form.Item label="是否實收" name="isActual" valuePropName="checked">
            <Checkbox>是</Checkbox>
          </Form.Item>

          <div className="recharge-row">
            <Form.Item label="實收賬戶充值" name="actualPayMethod" className="recharge-col-sm">
              <Select
                options={actualPayOptions}
                value={actualPayMethod}
                onChange={setActualPayMethod}
              />
            </Form.Item>
            <Form.Item label=" " className="recharge-col">
              <Input
                placeholder="請輸入實收金額"
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
              label="銀行轉賬"
              className="recharge-amount-item"
            >
              <Input
                placeholder="請輸入銀行轉賬金額"
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
            合併處理
            <span className="recharge-section-desc">上傳合同憑證、付款憑證</span>
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
                  <span>上傳</span>
                </div>
              </Upload>
            )}
          </div>
          {uploadedFiles.length > 0 && (
            <div className="recharge-upload-tip">
              已上傳 {uploadedFiles.length} 個文件，支持 PNG / JPG / PDF 格式
            </div>
          )}
        </div>

        {/* 備註信息 */}
        <div className="recharge-section">
          <div className="recharge-section-title">付款建議</div>
          <div className="recharge-remark-wrap">
            <textarea
              className="recharge-remark"
              placeholder="本次充值需要注意的事項可在此進行描述，限制200字！"
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
          返回
        </Button>
        <Button type="primary" className="recharge-btn-confirm" onClick={handleConfirm}>
          確認
        </Button>
      </div>
    </Modal>
  )
}
