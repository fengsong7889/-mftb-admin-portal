/**
 * 找回复核 — 接通真实后端 API
 */
import { Alert, Button, Form, Input, InputNumber, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import type { CompensationRow, ReviewDTO } from '../../../api/eamCompensation'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

function formatMoney(cents: number): string {
  return `MOP ${(cents / 100).toFixed(2)}`
}

interface Values { newAmount: number; reason: string }

interface Props {
  record?: CompensationRow
  loading?: boolean
  canEdit?: boolean
  onSubmit: (dto: ReviewDTO) => void
  onBack: () => void
}

export default function CompensationReview({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!canEdit || !record.reviewRequired) {
    return <Alert type="warning" showIcon message="当前记录不需要复核" />
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (values.newAmount < 0) return
      onSubmit({ newAmount: values.newAmount, reason: values.reason })
    } catch { /* validation */ }
  }

  return <>
    <ReturnHeader title={`找回复核 · ${record.compNo}`} onBack={onBack} />
    <div className="return-summary">{record.assetName} · 原应赔 {formatMoney(record.amount)} · 已收 {formatMoney(record.netPaid)}</div>
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading}>
        <ReturnSection title="复核信息">
          <Alert className="claim-notice" showIcon type="warning" message="保留原始赔付记录，不改写历史事实。复核后调整应赔金额，已收超过复核金额时进入退款流程。" />
          <div className="return-grid">
            <Form.Item name="newAmount" label="复核后应赔金额（分）" rules={[{ required: true }, { validator: (_, v) => v >= 0 ? Promise.resolve() : Promise.reject(new Error('金额不能为负')) }]}>
              <InputNumber min={0} step={10000} addonAfter="分" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="调整理由" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={4} maxLength={500} placeholder="说明为何调整金额，如资产实际价值、折旧、维修成本等" />
          </Form.Item>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>确认复核</Button>
    </div>
  </>
}
