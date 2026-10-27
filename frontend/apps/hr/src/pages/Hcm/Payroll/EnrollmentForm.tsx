/**
 * 人員參保新增 / 編輯（/hcm-payroll-enrollment-form?employmentId=xxx）
 *
 * 參保挂在雇佣上：同一人可能多法人并行，社保/公积金必须按雇佣分别缴。
 * 页面只让填基数，雇主与雇员金额由服务端按方案费率算好并快照，避免前端自己算出现两套口径。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, message } from 'antd'
import { SaveOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  createEnrollment,
  getEnrollment,
  listBenefitPlans,
  updateEnrollment,
  type PayrollBenefitPlan,
  type PayrollEnrollment,
} from '@/api/payroll'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface EnrollmentFormValues {
  planId: number
  baseAmount: number
  effectiveFrom: Dayjs
  effectiveTo?: Dayjs | null
  seqNo: number
  stopReason?: string
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

export default function HcmPayrollEnrollmentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const employmentId = params.get('employmentId') ? Number(params.get('employmentId')) : null
  const isEdit = !!id

  const [form] = Form.useForm<EnrollmentFormValues>()
  const [plans, setPlans] = useState<PayrollBenefitPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<PayrollBenefitPlan | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPlans = useCallback(async () => {
    const res = await listBenefitPlans({ page: 1, size: 200, status: 1 })
    setPlans(res.records ?? [])
  }, [])

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getEnrollment(id)
    form.setFieldsValue({
      planId: detail.planId,
      baseAmount: Number(detail.baseAmount),
      effectiveFrom: toDayjs(detail.effectiveFrom) as Dayjs,
      effectiveTo: toDayjs(detail.effectiveTo),
      seqNo: detail.seqNo ?? 1,
      stopReason: detail.stopReason ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadPlans()
    void loadDetail()
  }, [loadPlans, loadDetail])

  const baseAmount = Form.useWatch('baseAmount', form)
  const planId = Form.useWatch('planId', form)

  useEffect(() => {
    setSelectedPlan(plans.find((item) => item.id === planId) ?? null)
  }, [plans, planId])

  // 预览：与服务端同一口径（基数 × 方案费率，两位小数四舍五入），只作提示不提交
  const preview = useMemo(() => {
    if (!selectedPlan || baseAmount == null) return null
    const employee = Math.round(baseAmount * Number(selectedPlan.employeeRatio) * 100) / 100
    const employer = Math.round(baseAmount * Number(selectedPlan.employerRatio) * 100) / 100
    return { employee, employer, currency: selectedPlan.currency }
  }, [selectedPlan, baseAmount])

  const backTarget = employmentId
    ? `/hcm-payroll-benefit?tab=enrollment&employmentId=${employmentId}`
    : '/hcm-payroll-benefit?tab=enrollment'

  const handleSubmit = async () => {
    if (!employmentId) {
      message.warning(t('payroll.standard.needEmployment'))
      return
    }
    const values = await form.validateFields()
    const payload: PayrollEnrollment = {
      employmentId,
      planId: values.planId,
      baseAmount: Number(values.baseAmount).toFixed(4),
      effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
      effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
      seqNo: values.seqNo,
      stopReason: values.stopReason,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateEnrollment(id, payload)
      } else {
        await createEnrollment(payload)
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
        title={isEdit ? t('payroll.enrollment.editTitle') : t('payroll.enrollment.addTitle')}
        onBack={() => navigate(backTarget)}
      />

      {!employmentId ? (
        <Alert
          type="info"
          showIcon
          message={t('payroll.standard.needEmployment')}
          description={t('payroll.enrollment.needEmploymentHint')}
          action={(
            <Button type="primary" onClick={() => navigate('/hcm-person')}>
              {t('payroll.standard.goPerson')}
            </Button>
          )}
        />
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('payroll.enrollment.ruleHint', { employmentId })}
          />

          <Form
            form={form}
            layout="vertical"
            initialValues={{ effectiveFrom: dayjs(), seqNo: 1 }}
          >
            <div style={cardStyle}>
              <CardTitle icon={<TeamOutlined />} title={t('payroll.enrollment.section')} />
              <div style={grid3}>
                <Form.Item name="planId" label={t('payroll.enrollment.plan')} rules={[{ required: true, message: t('payroll.enrollment.planRequired') }]}>
                  <Select
                    showSearch optionFilterProp="label"
                    placeholder={t('payroll.enrollment.planPlaceholder')}
                    options={plans.map((item) => ({
                      value: item.id as number,
                      label: `${item.name}（${item.code}｜${item.jurisdiction}）`,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="baseAmount" label={t('payroll.enrollment.baseAmount')}
                  rules={[{ required: true, message: t('payroll.enrollment.baseRequired') }]}
                  extra={selectedPlan
                    ? t('payroll.enrollment.baseRangeExtra', {
                      min: selectedPlan.minBase ?? '-',
                      max: selectedPlan.maxBase ?? '-',
                      currency: selectedPlan.currency,
                    })
                    : undefined}
                >
                  <InputNumber min={0} precision={4} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="seqNo" label={t('hcmPerson.seqNo')} rules={[{ required: true, message: t('hcmPerson.seqNoRequired') }]}>
                  <InputNumber min={1} max={999} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="effectiveFrom" label={t('payroll.enrollment.effectiveFrom')} rules={[{ required: true, message: t('payroll.standard.effectiveFromRequired') }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="effectiveTo" label={t('payroll.enrollment.effectiveTo')}>
                  <DatePicker style={{ width: '100%' }} placeholder={t('payroll.enrollment.effectiveToHint')} />
                </Form.Item>
                <Form.Item name="stopReason" label={t('payroll.enrollment.stopReason')}>
                  <Input maxLength={200} />
                </Form.Item>
              </div>
              {preview ? (
                <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.9 }}>
                  {t('payroll.enrollment.preview', {
                    employee: preview.employee.toFixed(2),
                    employer: preview.employer.toFixed(2),
                    currency: preview.currency,
                  })}
                </div>
              ) : null}
            </div>
          </Form>

          <div className="form-footer">
            <Button onClick={() => navigate(backTarget)}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
              {t('common.save')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
