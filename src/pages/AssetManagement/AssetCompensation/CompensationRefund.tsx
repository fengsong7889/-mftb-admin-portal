/**
 * 退款登记 — 接通真实后端 API
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

export default function CompensationRefund({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  const overpaid = record.netPaid - record.amount

  if (!canEdit || record.status !== 'refund_pending') {
    return <Alert type="warning" showIcon message="当前记录不允许退款" />
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (values.amount <= 0 || values.amount > overpaid) {
        message.error(`退款金额必须大于零且不超过超收余额 ${formatMoney(overpaid)}`)
        return
      }
      onSubmit({
        type: 'refund',
        amount: values.amount,
        paymentDate: values.date.format('YYYY-MM-DD'),
        reason: values.reason,
      })
    } catch { /* validation */ }
  }

  return <>
    <ReturnHeader title={`退款 · ${record.compNo}`} onBack={onBack} />
    <div className="return-summary">应赔 {formatMoney(record.amount)} · 已收 {formatMoney(record.netPaid)} · 超收 {formatMoney(overpaid)}</div>
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs() }}>
        <ReturnSection title="退款信息">
          <Alert className="claim-notice" showIcon type="error" message="只登记已发生的退款，不执行实际转账。退款金额不得超过超收余额。" />
          <div className="return-grid">
            <Form.Item name="amount" label="退款金额（分）" rules={[{ required: true }, { validator: (_, v) => v > 0 && v <= overpaid ? Promise.resolve() : Promise.reject(new Error(`金额须介于 1 和 ${overpaid} 之间`)) }]}>
              <InputNumber min={1} step={10000} addonAfter="分" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="date" label="业务日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="退款原因" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>确认退款</Button>
    </div>
  </>
}
