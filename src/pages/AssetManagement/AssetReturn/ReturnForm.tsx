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

const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }

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
    return <Alert type="warning" showIcon message="無歸還辦理權限" description="請聯繫管理員分配歸還管理權限。" />
  }

  const sourceLabel = claimId ? `領用單 #${claimId}` : borrowId ? `借用單 #${borrowId}` : assetId ? `資產 #${assetId}` : '直接登記'

  return <>
    <ReturnHeader title="歸還登記" onBack={onBack} />
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs(), condition: 'normal' }}>
        <ReturnSection title="来源信息">
          <Descriptions column={3} items={[
            { key: 'source', label: '歸還來源', children: sourceLabel },
            { key: 'operator', label: '驗收操作人', children: operatorName || user?.name || '—' },
          ]} />
          {!hasSource && <Alert className="claim-notice" showIcon type="info" message="未指定來源，請在列表中選擇領用/借用記錄進入歸還，或從資產台賬發起。" />}
        </ReturnSection>

        <ReturnSection title="歸還信息">
          <div className="return-grid">
            <Form.Item name="date" label="業務歸還日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualReturneeName" label="實際歸還人（如代辦）">
              <Input allowClear placeholder="默認當前操作人" />
            </Form.Item>
          </div>
        </ReturnSection>

        <ReturnSection title="驗收狀況">
          <Form.Item name="condition" label="資產狀況" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid"
              options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Alert className="claim-notice" showIcon
            type={condition === 'normal' ? 'success' : 'warning'}
            message={condition === 'normal' ? '正常收回：解除佔用，資產恢復可使用。'
              : condition === 'damaged' ? '損壞收回：資產進入待處置；自動建立待定責記錄，不默認員工有責。'
              : '遺失結案：保留歷史責任證據，不登記虛假入庫位置。'} />
          <Form.Item name="reason" label={condition === 'normal' ? '歸還說明' : '異常說明'} rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea maxLength={500} showCount rows={3} />
          </Form.Item>
          {condition !== 'normal' && (
            <Form.Item name="conditionNote" label="狀況備註">
              <Input.TextArea maxLength={500} rows={2} placeholder="補充損壞/遺失的具體情況" />
            </Form.Item>
          )}
        </ReturnSection>
      </Form>
    </Spin>

    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} disabled={!hasSource} onClick={handleSubmit}>
        確認歸還
      </Button>
    </div>
  </>
}
