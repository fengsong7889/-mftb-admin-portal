/**
 * 參保方案新增 / 編輯（/hcm-payroll-benefit-plan-form）
 *
 * 费率一律填小数（10.5% 填 0.105）：百分比与小数混填是这类表单最常见的错，
 * 输入框下方直接写明换算，服务端也会拒绝 >1 的值。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Switch, message } from 'antd'
import { SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  JURISDICTION_OPTIONS,
  PAYROLL_CURRENCIES,
  PLAN_TYPE_OPTIONS,
  createBenefitPlan,
  getBenefitPlan,
  updateBenefitPlan,
  type PayrollBenefitPlan,
} from '@/api/payroll'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface PlanFormValues {
  code: string
  name: string
  nameEn?: string
  planType: string
  jurisdiction: string
  employerRatio: number
  employeeRatio: number
  minBase?: number
  maxBase?: number
  currency: string
  effectiveFrom: Dayjs
  effectiveTo?: Dayjs | null
  status: number
  remark?: string
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

export default function HcmPayrollBenefitPlanForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isEdit = !!id

  const [form] = Form.useForm<PlanFormValues>()
  const [saving, setSaving] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getBenefitPlan(id)
    form.setFieldsValue({
      code: detail.code,
      name: detail.name,
      nameEn: detail.nameEn ?? undefined,
      planType: detail.planType,
      jurisdiction: detail.jurisdiction,
      employerRatio: Number(detail.employerRatio),
      employeeRatio: Number(detail.employeeRatio),
      minBase: detail.minBase != null ? Number(detail.minBase) : undefined,
      maxBase: detail.maxBase != null ? Number(detail.maxBase) : undefined,
      currency: detail.currency,
      effectiveFrom: toDayjs(detail.effectiveFrom) as Dayjs,
      effectiveTo: toDayjs(detail.effectiveTo),
      status: detail.status ?? 1,
      remark: detail.remark ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: PayrollBenefitPlan = {
      code: values.code,
      name: values.name,
      nameEn: values.nameEn,
      planType: values.planType,
      jurisdiction: values.jurisdiction,
      employerRatio: values.employerRatio.toFixed(4),
      employeeRatio: values.employeeRatio.toFixed(4),
      minBase: values.minBase != null ? Number(values.minBase).toFixed(4) : null,
      maxBase: values.maxBase != null ? Number(values.maxBase).toFixed(4) : null,
      currency: values.currency,
      effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
      effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
      status: values.status,
      remark: values.remark,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateBenefitPlan(id, payload)
      } else {
        await createBenefitPlan(payload)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-payroll-benefit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <FormHeader
        title={isEdit ? t('payroll.benefit.editPlanTitle') : t('payroll.benefit.addPlanTitle')}
        onBack={() => navigate('/hcm-payroll-benefit')}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('payroll.benefit.ratioHint')}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          planType: 'SOCIAL_INSURANCE',
          jurisdiction: 'CN',
          currency: 'CNY',
          status: 1,
          employerRatio: 0,
          employeeRatio: 0,
          effectiveFrom: dayjs(),
        }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<SafetyCertificateOutlined />} title={t('payroll.benefit.section')} />
          <div style={grid3}>
            <Form.Item name="code" label={t('payroll.benefit.code')} rules={[{ required: true, message: t('payroll.benefit.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('payroll.benefit.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('payroll.benefit.name')} rules={[{ required: true, message: t('payroll.benefit.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('payroll.component.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="planType" label={t('payroll.benefit.planType')} rules={[{ required: true }]}>
              <Select options={[...PLAN_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('payroll.benefit.jurisdiction')} rules={[{ required: true, message: t('payroll.benefit.jurisdictionRequired') }]}>
              <Select options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="currency" label={t('payroll.component.currency')} rules={[{ required: true, message: t('payroll.standard.currencyRequired') }]}>
              <Select options={[...PAYROLL_CURRENCIES]} />
            </Form.Item>
            <Form.Item
              name="employerRatio" label={t('payroll.benefit.employerRatio')}
              rules={[{ required: true, message: t('payroll.benefit.ratioRequired') }]}
              extra={t('payroll.benefit.ratioExtra')}
            >
              <InputNumber min={0} max={1} step={0.0001} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="employeeRatio" label={t('payroll.benefit.employeeRatio')}
              rules={[{ required: true, message: t('payroll.benefit.ratioRequired') }]}
              extra={t('payroll.benefit.ratioExtra')}
            >
              <InputNumber min={0} max={1} step={0.0001} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}>
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
            <Form.Item name="minBase" label={t('payroll.benefit.minBase')}>
              <InputNumber min={0} precision={4} style={{ width: '100%' }} placeholder={t('payroll.benefit.baseHint')} />
            </Form.Item>
            <Form.Item
              name="maxBase" label={t('payroll.benefit.maxBase')}
              dependencies={['minBase']}
              rules={[({ getFieldValue }) => ({
                validator(_, value) {
                  const min = getFieldValue('minBase') as number | undefined
                  if (value == null || min == null || value >= min) return Promise.resolve()
                  return Promise.reject(new Error(t('payroll.benefit.baseRangeError')))
                },
              })]}
            >
              <InputNumber min={0} precision={4} style={{ width: '100%' }} placeholder={t('payroll.benefit.baseHint')} />
            </Form.Item>
            <Form.Item name="effectiveFrom" label={t('payroll.standard.effectiveFrom')} rules={[{ required: true, message: t('payroll.standard.effectiveFromRequired') }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveTo" label={t('payroll.standard.effectiveTo')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('payroll.standard.effectiveToHint')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate('/hcm-payroll-benefit')}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
