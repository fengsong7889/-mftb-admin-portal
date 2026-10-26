/**
 * 薪酬標準新增 / 編輯（/hcm-payroll-standard-form?employmentId=xxx）
 *
 * 日期生效是这张表的性格：同一雇佣同一时间只能有一段标准，
 * 调薪的正确做法是「结束上一段 + 新开一段」，而不是直接把金额改掉（否则历史工资单无法重现）。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, message } from 'antd'
import { SaveOutlined, WalletOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  CHANGE_TYPE_OPTIONS,
  PAYROLL_CURRENCIES,
  createStandard,
  getStandard,
  updateStandard,
  type PayrollSalaryStandard,
} from '@/api/payroll'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface StandardFormValues {
  baseAmount: number
  currency: string
  changeType: string
  effectiveFrom: Dayjs
  effectiveTo?: Dayjs | null
  seqNo: number
  reason?: string
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

export default function HcmPayrollStandardForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const employmentId = params.get('employmentId') ? Number(params.get('employmentId')) : null
  const isEdit = !!id

  const [form] = Form.useForm<StandardFormValues>()
  const [saving, setSaving] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getStandard(id)
    form.setFieldsValue({
      baseAmount: Number(detail.baseAmount),
      currency: detail.currency,
      changeType: detail.changeType ?? 'ADJUST',
      effectiveFrom: toDayjs(detail.effectiveFrom) as Dayjs,
      effectiveTo: toDayjs(detail.effectiveTo),
      seqNo: detail.seqNo ?? 1,
      reason: detail.reason ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const backTarget = employmentId ? `/hcm-payroll-standard?employmentId=${employmentId}` : '/hcm-payroll-standard'

  const handleSubmit = async () => {
    if (!employmentId) {
      message.warning(t('payroll.standard.needEmployment'))
      return
    }
    const values = await form.validateFields()
    const payload: PayrollSalaryStandard = {
      employmentId,
      // DECIMAL(18,4)：用字符串提交，避免前端浮点在 0.1+0.2 这类值上失真
      baseAmount: Number(values.baseAmount).toFixed(4),
      currency: values.currency,
      changeType: values.changeType,
      effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
      effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
      seqNo: values.seqNo,
      reason: values.reason,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateStandard(id, payload)
      } else {
        await createStandard(payload)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate(backTarget)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <FormHeader
        title={isEdit ? t('payroll.standard.editTitle') : t('payroll.standard.addTitle')}
        onBack={() => navigate(backTarget)}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('payroll.standard.ruleHint')}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ currency: 'CNY', changeType: 'ADJUST', seqNo: 1, effectiveFrom: dayjs() }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<WalletOutlined />} title={t('payroll.standard.section')} />
          <div style={grid3}>
            <Form.Item
              name="baseAmount"
              label={t('payroll.standard.baseAmount')}
              rules={[{ required: true, message: t('payroll.standard.baseAmountRequired') }]}
            >
              <InputNumber min={0} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="currency" label={t('payroll.component.currency')} rules={[{ required: true, message: t('payroll.standard.currencyRequired') }]}>
              <Select options={[...PAYROLL_CURRENCIES]} />
            </Form.Item>
            <Form.Item name="changeType" label={t('payroll.standard.changeType')} rules={[{ required: true }]}>
              <Select options={[...CHANGE_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item
              name="effectiveFrom"
              label={t('payroll.standard.effectiveFrom')}
              rules={[{ required: true, message: t('payroll.standard.effectiveFromRequired') }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveTo" label={t('payroll.standard.effectiveTo')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('payroll.standard.effectiveToHint')} />
            </Form.Item>
            <Form.Item name="seqNo" label={t('hcmPerson.seqNo')} rules={[{ required: true, message: t('hcmPerson.seqNoRequired') }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="reason" label={t('payroll.standard.reason')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate(backTarget)}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
