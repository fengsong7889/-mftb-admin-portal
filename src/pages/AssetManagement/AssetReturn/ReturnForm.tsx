/**
 * 归还登记表单 — 接通真实后端 API
 *
 * 支持从领用(claimId)、借用(borrowId)或资产(assetId)入口进入。
 */
import { Alert, Button, DatePicker, Descriptions, Form, Input, Radio, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { ReturnHeader, ReturnSection } from './ReturnLayout'
import type { ReturnRegisterDTO } from '../../../api/eamReturn'

const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '损坏', lost: '遗失' }

interface Values {
  date: Dayjs
  condition: 'normal' | 'damaged' | 'lost'
  reason: string
  conditionNote?: string
  actualReturneeName?: string
}

interface Props {
  claimId?: number
  borrowId?: number
  assetId?: number
  operatorName?: string
  canEdit?: boolean
  loading?: boolean
  onSubmit: (dto: ReturnRegisterDTO) => void
  onBack: () => void
}

export default function ReturnForm({ claimId, borrowId, assetId, operatorName, canEdit = true, loading = false, onSubmit, onBack }: Props) {
  const { user } = useAuth()
  const [form] = Form.useForm<Values>()
  const condition = Form.useWatch('condition', form) ?? 'normal'
  const hasSource = claimId != null || borrowId != null || assetId != null

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const dto: ReturnRegisterDTO = {
        claimId,
        borrowId,
        returnDate: values.date.format('YYYY-MM-DD'),
        assetCondition: values.condition,
        returnReason: values.reason,
        conditionNote: values.conditionNote,
        actualReturneeName: values.actualReturneeName || user?.name,
      }
      await onSubmit(dto)
    } catch {
      // validation failed
    }
  }

  if (!canEdit) {
    return <Alert type="warning" showIcon message="无归还办理权限" description="请联系管理员分配归还管理权限。" />
  }

  const sourceLabel = claimId ? `领用单 #${claimId}` : borrowId ? `借用单 #${borrowId}` : assetId ? `资产 #${assetId}` : '直接登记'

  return <>
    <ReturnHeader title="归还登记" onBack={onBack} />
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs(), condition: 'normal' }}>
        <ReturnSection title="来源信息">
          <Descriptions column={3} items={[
            { key: 'source', label: '归还来源', children: sourceLabel },
            { key: 'operator', label: '验收操作人', children: operatorName || user?.name || '—' },
          ]} />
          {!hasSource && <Alert className="claim-notice" showIcon type="info" message="未指定来源，请在列表中选择领用/借用记录进入归还，或从资产台账发起。" />}
        </ReturnSection>

        <ReturnSection title="归还信息">
          <div className="return-grid">
            <Form.Item name="date" label="业务归还日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualReturneeName" label="实际归还人（如代办）">
              <Input allowClear placeholder="默认当前操作人" />
            </Form.Item>
          </div>
        </ReturnSection>

        <ReturnSection title="验收状况">
          <Form.Item name="condition" label="资产状况" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid"
              options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Alert className="claim-notice" showIcon
            type={condition === 'normal' ? 'success' : 'warning'}
            message={condition === 'normal' ? '正常收回：解除占用，资产恢复可使用。'
              : condition === 'damaged' ? '损坏收回：资产进入待处置；自动建立待定责记录，不默认员工有责。'
              : '遗失结案：保留历史责任证据，不登记虚假入库位置。'} />
          <Form.Item name="reason" label={condition === 'normal' ? '归还说明' : '异常说明'} rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea maxLength={500} showCount rows={3} />
          </Form.Item>
          {condition !== 'normal' && (
            <Form.Item name="conditionNote" label="状况备注">
              <Input.TextArea maxLength={500} rows={2} placeholder="补充损坏/遗失的具体情况" />
            </Form.Item>
          )}
        </ReturnSection>
      </Form>
    </Spin>

    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} disabled={!hasSource} onClick={handleSubmit}>
        确认归还
      </Button>
    </div>
  </>
}
