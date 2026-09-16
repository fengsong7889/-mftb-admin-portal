/**
 * 借用登记表单 — 接通真实后端 API
 */
import { Alert, Button, DatePicker, Form, Input, InputNumber, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'
import type { BorrowRegisterDTO } from '../../../api/eamBorrow'

interface Values { assetId: number; holderId: number; department: string; startDate: Dayjs; dueDate: Dayjs; purpose: string }

interface Props {
  operatorName?: string
  canEdit?: boolean
  loading?: boolean
  onSubmit: (dto: BorrowRegisterDTO) => void
  onBack: () => void
}

export default function BorrowForm({ operatorName: _operatorName, canEdit = true, loading = false, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onSubmit({
        assetId: values.assetId,
        holderId: values.holderId,
        department: values.department,
        startDate: values.startDate.format('YYYY-MM-DD'),
        dueDate: values.dueDate.format('YYYY-MM-DD'),
        purpose: values.purpose,
      })
    } catch { /* validation */ }
  }

  if (!canEdit) {
    return <Alert type="warning" showIcon message="无借用办理权限" />
  }

  return <>
    <ReturnHeader title="借用登记" onBack={onBack} />
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ startDate: dayjs(), dueDate: dayjs().add(7, 'day') }}>
        <ReturnSection title="资产与借用人">
          <div className="return-grid">
            <Form.Item name="assetId" label="资产 ID" rules={[{ required: true, message: '请输入可借用的资产 ID' }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="输入资产 ID" />
            </Form.Item>
            <Form.Item name="holderId" label="借用人 ID" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="输入 sys_user.id" />
            </Form.Item>
            <Form.Item name="department" label="借用部门" rules={[{ required: true }]}>
              <Input placeholder="输入借用部门" />
            </Form.Item>
          </div>
        </ReturnSection>
        <ReturnSection title="借用期限与用途">
          <div className="return-grid">
            <Form.Item name="startDate" label="借出日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="dueDate" label="到期日期" rules={[{ required: true }, { validator: (_, d: Dayjs) => {
              const start = form.getFieldValue('startDate')
              return d && start && d.isAfter(start, 'day') ? Promise.resolve() : Promise.reject(new Error('到期日期须晚于借出日期'))
            } }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="purpose" label="借用用途" rules={[{ required: true, whitespace: true }]}>
              <Input maxLength={100} />
            </Form.Item>
          </div>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>确认借用</Button>
    </div>
  </>
}
