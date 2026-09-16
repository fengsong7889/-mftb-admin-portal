/**
 * 免赔登记 — 接通真实后端 API
 */
import { Alert, Button, Form, Input, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import type { CompensationRow, WaiveDTO } from '../../../api/eamCompensation'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

interface Values { reason: string }

interface Props {
  record?: CompensationRow
  loading?: boolean
  canEdit?: boolean
  onSubmit: (dto: WaiveDTO) => void
  onBack: () => void
}

export default function CompensationWaive({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!canEdit || record.status !== 'pending' || record.reviewRequired > 0) {
    return <Alert type="warning" showIcon message="当前记录不允许免赔" />
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      onSubmit({ waiveReason: values.reason })
    } catch { /* validation */ }
  }

  return <>
    <ReturnHeader title={`免赔 · ${record.compNo}`} onBack={onBack} />
    <div className="return-summary">{record.assetName} · 原持有人 {record.holderName} · 损失类型 {record.damageType === 'damage' ? '损坏' : '遗失'}</div>
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading}>
        <ReturnSection title="免赔原因">
          <Alert className="claim-notice" showIcon type="warning" message="免赔必须说明原因，不强迫选择员工。" />
          <Form.Item name="reason" label="免赔理由" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={4} maxLength={500} placeholder="说明免赔的具体原因，如自然损耗、不可抗力、公司承担等" />
          </Form.Item>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>确认免赔</Button>
    </div>
  </>
}
