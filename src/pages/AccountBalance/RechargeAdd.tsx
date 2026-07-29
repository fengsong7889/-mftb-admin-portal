import { useState } from 'react'
import { Form, Input, Select, Radio, Button, Upload, message, InputNumber, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  UploadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  AccountBookOutlined,
  DollarOutlined,
  FileProtectOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'

/** 集團选项 */
const groupOptions = [
  { label: '20261298121911 - 亞述集團', value: '20261298121911', name: '亞述集團' },
  { label: '20261298121912 - 廣州酒家', value: '20261298121912', name: '廣州酒家' },
  { label: '20261298121913 - 海底撈', value: '20261298121913', name: '海底撈' },
]

/** BD选项 */
const bdOptions = [
  { label: '關山月(001)', value: '關山月(001)' },
  { label: '古月(002)', value: '古月(002)' },
  { label: '浩遠(003)', value: '浩遠(003)' },
]

/** 實收賬戶充值方式 */
const actualPayOptions = [
  { label: '對公轉賬', value: 'corporate' },
  { label: '混合支付', value: 'mixed' },
  { label: '營業額支付', value: 'revenue' },
]

/** 数字金额转中文大写 */
function amountToChinese(num: number): string {
  if (!num || num <= 0) return ''
  const digits = ['零', '壹', '貳', '叁', '肆', '伍', '陸', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '萬', '億']
  const intPart = Math.floor(num)
  const decPart = Math.round((num - intPart) * 100)
  const jiao = Math.floor(decPart / 10)
  const fen = decPart % 10

  let result = ''
  const intStr = String(intPart)
  const groups: number[][] = []
  for (let i = intStr.length; i > 0; i -= 4) {
    groups.unshift(intStr.slice(Math.max(0, i - 4), i).split('').map(Number))
  }
  groups.forEach((group, gi) => {
    let groupStr = ''
    let zeroFlag = false
    group.forEach((d, di) => {
      if (d === 0) { zeroFlag = true; return }
      if (zeroFlag) { groupStr += '零'; zeroFlag = false }
      groupStr += digits[d] + units[group.length - 1 - di]
    })
    if (groupStr) result += groupStr + bigUnits[groups.length - 1 - gi]
  })
  result += '元'
  if (jiao > 0) result += digits[jiao] + '角'
  if (fen > 0) result += digits[fen] + '分'
  return result
}

export default function RechargeAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || ''

  const [form] = Form.useForm()
  const [isActual, setIsActual] = useState(true)
  const [virtualAmount, setVirtualAmount] = useState<number>(0)
  const [bankAmount, setBankAmount] = useState<number>(0)
  const [contractFiles, setContractFiles] = useState<any[]>([])
  const [paymentFiles, setPaymentFiles] = useState<any[]>([])

  /** 提交 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!virtualAmount || virtualAmount <= 0) {
        message.warning('請填寫虛擬賬戶充值金額')
        return
      }
      if (contractFiles.length === 0) {
        message.warning('請上傳合同憑證')
        return
      }
      if (paymentFiles.length === 0) {
        message.warning('請上傳付款憑證')
        return
      }
      message.success('充值申請提交成功，等待審批！')
      navigate('/account-balance')
    } catch {
      // 表单校验未通过
    }
  }

  /** 文件上传前校验 */
  const beforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      message.error('僅支持 jpeg/jpg/png/PDF 格式')
      return Upload.LIST_IGNORE
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('文件大小不能超過 5MB')
      return Upload.LIST_IGNORE
    }
    return false
  }

  /** 渲染文件列表 */
  const renderFileList = (files: any[], setFiles: (f: any[]) => void) => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {files.map((file) => (
        <div key={file.uid} style={{
          width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', background: '#fafafa',
        }}>
          {file.name?.endsWith('.pdf')
            ? <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
            : <FileImageOutlined style={{ fontSize: 28, color: '#1976D2' }} />
          }
          <span style={{ fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          <Button type="text" size="small" danger
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setFiles(files.filter(f => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {files.length < 5 && (
        <Upload
          accept=".png,.jpg,.jpeg,.pdf"
          showUploadList={false}
          beforeUpload={beforeUpload}
          onChange={(info) => {
            if (info.file.status !== 'removed') {
              setFiles([...files, { uid: info.file.uid, name: info.file.name }])
            }
          }}
        >
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa',
            transition: 'all 0.3s',
          }}>
            <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: '#bfbfbf' }} />
            <span>上傳</span>
          </div>
        </Upload>
      )}
    </div>
  )

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/account-balance')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>推廣金充值</h2>
              <Tag color="blue" style={{ fontSize: 11 }}>充值申請</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical"
        initialValues={{
          groupId: groupIdParam || undefined,
          groupName: groupNameParam || undefined,
          brand: brandParam || 'mFood',
          businessType: 'delivery',
          businessChannel: 'takeout',
          isActual: true,
          actualPayMethod: 'corporate',
        }}
      >
        {/* 基础信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基礎信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="集團ID" name="groupId" rules={[{ required: true, message: '請選擇集團ID' }]}>
              <Select
                placeholder="請輸入或選擇集團ID"
                options={groupOptions}
                showSearch
                onChange={(val) => {
                  const opt = groupOptions.find(o => o.value === val)
                  if (opt) form.setFieldsValue({ groupName: opt.name })
                }}
              />
            </Form.Item>
            <Form.Item label="集團名稱" name="groupName">
              <Input disabled placeholder="選擇集團ID後自動填充" />
            </Form.Item>
          </div>

          <Form.Item label="所屬品牌" name="brand" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
            <Radio.Group>
              <Radio value="mFood">1mFood</Radio>
              <Radio value="flashBee">2閃蜂</Radio>
              <Radio value="other">3其它</Radio>
            </Radio.Group>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="業務類型" name="businessType" rules={[{ required: true, message: '請選擇業務類型' }]}>
              <Radio.Group>
                <Radio value="delivery">到家</Radio>
                <Radio value="store">到店</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="業務頻道" name="businessChannel" rules={[{ required: true, message: '請選擇業務頻道' }]}>
              <Radio.Group>
                <Radio value="takeout">外賣</Radio>
                <Radio value="dineIn">堂食</Radio>
              </Radio.Group>
            </Form.Item>
          </div>
        </div>

        {/* 充值金额 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>充值金額</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>金額配置</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item
            label={
              <span>
                虛擬賬戶充值
                <span style={{ fontSize: 12, color: '#E53935', marginLeft: 4 }}>*</span>
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <InputNumber
                placeholder="請輸入充值金額"
                min={0}
                precision={2}
                value={virtualAmount || undefined}
                onChange={(v) => setVirtualAmount(v || 0)}
                style={{ width: 280 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(v?.replace(/,/g, '') || 0)}
              />
              {virtualAmount > 0 && (
                <span style={{ color: '#E8720C', fontSize: 13, fontWeight: 500 }}>{amountToChinese(virtualAmount)}</span>
              )}
            </div>
            {!virtualAmount && <div style={{ color: '#E53935', fontSize: 12, marginTop: 4 }}>必填字段不可為空</div>}
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="歸屬BD" name="bd">
              <Select placeholder="請選擇BD" options={bdOptions} allowClear />
            </Form.Item>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
              <span style={{ fontSize: 12, color: '#E53935' }}>
                記錄該筆充值業績歸屬BD，沒有實收，則不會計算績效！
              </span>
            </div>
          </div>

          <Form.Item label="是否實收" name="isActual" rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => setIsActual(e.target.value)}>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
          <div style={{
            padding: '10px 14px', background: '#fff2f0', border: '1px solid #ffccc7',
            borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#595959', lineHeight: 1.8,
          }}>
            <span style={{ color: '#E53935', fontWeight: 500 }}>說明：</span>
            選擇【是】：將根據「實收賬戶充值」所填寫的金額向商家收取對應金額。<br />
            選擇【否】：無需向商家收費，該筆金額直接充值到商家虛擬賬戶。
          </div>

          {isActual && (
            <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <Form.Item label="實收賬戶充值" name="actualPayMethod" rules={[{ required: true, message: '請選擇充值方式' }]} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Select placeholder="請選擇" options={actualPayOptions} style={{ width: 200 }} />
                  <span style={{ color: '#8c8c8c', fontSize: 13 }}>優惠金額</span>
                  <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 15 }}>¥ 10,000</span>
                </div>
              </Form.Item>

              <Form.Item
                label="銀行轉賬"
                required
                style={{ marginBottom: 0 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <InputNumber
                    placeholder="請輸入銀行轉賬金額"
                    min={0}
                    precision={2}
                    value={bankAmount || undefined}
                    onChange={(v) => setBankAmount(v || 0)}
                    style={{ width: 280 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                  />
                  {bankAmount > 0 && (
                    <span style={{ color: '#E8720C', fontSize: 13, fontWeight: 500 }}>{amountToChinese(bankAmount)}</span>
                  )}
                </div>
              </Form.Item>
            </div>
          )}
        </div>

        {/* 凭证上传 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>相關憑證</span>
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>憑證上傳</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>支持 jpeg/jpg/png/PDF</span>
          </div>
          <Form.Item label="合同憑證" required>
            {renderFileList(contractFiles, setContractFiles)}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              限 jpeg/jpg/png/PDF 格式，5MB 內，最多可上傳 5 份
            </div>
          </Form.Item>

          <Form.Item label="付款憑證" required style={{ marginBottom: 0 }}>
            {renderFileList(paymentFiles, setPaymentFiles)}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              限 jpeg/jpg/png/PDF 格式，5MB 內，最多可上傳 5 份
            </div>
          </Form.Item>
        </div>

        {/* 备注信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>備註信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              placeholder="本次充值需要注意的事項可在此進行描述，限制200字！"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按鈕（取消/確認） */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit}>
          確認
        </Button>
      </div>
    </div>
  )
}
