/**
 * 续借登记 — 接通真实后端 API
 */
import { Alert, Button, DatePicker, Descriptions, Form, InputNumber, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { BorrowRow } from '../../../api/eamBorrow'
import AssetParameters from '../../../components/AssetParameters'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

interface Values { dueDate: Dayjs; extendDays: number }

interface Props {
  record?: BorrowRow
  loading?: boolean
  canEdit?: boolean
  onSubmit: (newDueDate: string) => void
  onBack: () => void
}

export default function BorrowRenew({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<Values>()

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      onSubmit(values.dueDate.format('YYYY-MM-DD'))
    } catch { /* validation */ }
  }

  if (!canEdit) return <Alert type="warning" showIcon message="无借用办理权限" />

  return <>
    <ReturnHeader title={`续借 · ${record.borrowNo}`} onBack={onBack} />
    <Spin spinning={loading}>
      <ReturnSection title="续借信息">
        <Descriptions bordered column={2} items={[
          { key: 'no', label: '借用单号', children: record.borrowNo },
          { key: 'asset', label: t('asset.colAssetName'), children: `${record.assetName} (${record.assetNo})` },
          { key: 'holder', label: '借用人', children: record.holderName },
          { key: 'department', label: '部门', children: record.department },
          { key: 'start', label: '借出日期', children: record.startDate },
          { key: 'old', label: '原到期日期', children: record.dueDate },
        ]} />
        <AssetParameters asset={record} current />
        <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ dueDate: dayjs(record.dueDate).add(7, 'day'), extendDays: 7 }} style={{ marginTop: 16 }}>
          <div className="return-grid">
            <Form.Item name="dueDate" label="新到期日期" rules={[{ required: true }, { validator: (_, d: Dayjs) => d && d.isAfter(record.dueDate, 'day') && !d.isBefore(dayjs(), 'day') ? Promise.resolve() : Promise.reject(new Error('须晚于原到期日且不早于今天')) }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="extendDays" label="延长天数（参考）">
              <InputNumber min={1} max={365} disabled />
            </Form.Item>
          </div>
          {record.status === 'overdue' && <Alert type="warning" showIcon message="当前已逾期，续借后逾期状态自动解除。" />}
        </Form>
      </ReturnSection>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>确认续借</Button>
    </div>
  </>
}
