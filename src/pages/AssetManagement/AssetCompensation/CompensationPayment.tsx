/**
 * 收款登记 — 接通真实后端 API
 */
import { Alert, Button, DatePicker, Form, Input, InputNumber, Spin, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { CompensationRow, PaymentDTO } from '../../../api/eamCompensation'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

function formatMoney(cents: number): string {
  return `MOP ${(cents / 100).toFixed(2)}`
}

interface Values { amount: number; date: Dayjs; reason: string }

interface Props {
  record?: CompensationRow
  loading?: boolean
  canEdit?: boolean
  onSubmit: (dto: PaymentDTO) => void
  onBack: () => void
}

export default function CompensationPayment({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  const remaining = record.amount - record.netPaid

  if (!canEdit || !['confirmed', 'partially_paid'].includes(record.status) || record.reviewRequired > 0) {
    return <Alert type="warning" showIcon message="当前记录不允许收款" />
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (values.amount <= 0 || values.amount > remaining) {
        message.error(`金额必须大于零且不超过未收余额 ${formatMoney(remaining)}`)
        return
      }
      onSubmit({
        type: 'payment',
        amount: values.amount,
        paymentDate: values.date.format('YYYY-MM-DD'),
        reason: values.reason,
      })
    } catch { /* validation */ }
  }

  return <>
    <ReturnHeader title={`收款 · ${record.compNo}`} onBack={onBack} />
    <div className="return-summary">应赔 {formatMoney(record.amount)} · 已收 {formatMoney(record.netPaid)} · 未收 {formatMoney(remaining)}</div>
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs() }}>
        <ReturnSection title="收款信息">
          <Alert className="claim-notice" showIcon type="info" message="只登记已发生的收款，不执行实际支付。每次收款单独保存金额、日期和操作人。" />
          <div className="return-grid">
            <Form.Item name="amount" label="收款金额（分）" rules={[{ required: true }, { validator: (_, v) => v > 0 && v <= remaining ? Promise.resolve() : Promise.reject(new Error(`金额须介于 1 和 ${remaining} 之间`)) }]}>
              <InputNumber min={1} step={10000} addonAfter="分" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="date" label="业务日期" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="收款说明" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>确认收款</Button>
    </div>
  </>
}
