/**
 * 雇傭關係新增 / 編輯（/hcm-person-employment-form）
 *
 * 兩個硬規則在界面先表達：同一法人同期不得重疊（跨法人可並行），
 * 結束日期留空表示無固定期限——不是"忘了填"。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, Select, message } from 'antd'
import { SaveOutlined, ApartmentOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { createEmployment, getEmployment, updateEmployment, EMPLOYMENT_TYPE_OPTIONS, type HrEmployment } from '../../../api/hcmPerson'
import { JURISDICTION_OPTIONS, listLegalEntities, type OrgLegalEntity } from '../../../api/hcmOrganization'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface EmploymentFormValues {
  legalEntityId: number
  employmentNo?: string
  employmentType: string
  jurisdiction: string
  startDate: Dayjs
  endDate?: Dayjs | null
  remark?: string
}

/** 後端 LocalDate 可能是 [y,m,d]/毫秒/字串三種形態 */
function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

export default function HcmEmploymentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const personId = params.get('personId') ? Number(params.get('personId')) : null
  const isEdit = !!id

  const [form] = Form.useForm<EmploymentFormValues>()
  const [legalEntities, setLegalEntities] = useState<OrgLegalEntity[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listLegalEntities({ page: 1, size: 200, status: 1 })
      .then((res) => setLegalEntities(res.records ?? []))
      .catch(() => setLegalEntities([]))
  }, [])

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getEmployment(id)
    form.setFieldsValue({
      legalEntityId: detail.legalEntityId,
      employmentNo: detail.employmentNo ?? undefined,
      employmentType: detail.employmentType ?? 'FULL_TIME',
      jurisdiction: detail.jurisdiction ?? 'CN',
      startDate: toDayjs(detail.startDate) as Dayjs,
      endDate: toDayjs(detail.endDate),
      remark: detail.remark ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const handleSubmit = async () => {
    if (!personId && !isEdit) {
      message.warning(t('hcmPerson.employmentPersonMissing'))
      return
    }
    const values = await form.validateFields()
    const payload: HrEmployment = {
      personId: personId as number,
      legalEntityId: values.legalEntityId,
      employmentNo: values.employmentNo,
      employmentType: values.employmentType,
      jurisdiction: values.jurisdiction,
      startDate: values.startDate.format('YYYY-MM-DD'),
      endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : null,
      remark: values.remark,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateEmployment(id, payload)
      } else {
        await createEmployment(payload)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate(`/hcm-person-detail?id=${payload.personId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <FormHeader
        title={isEdit ? t('hcmPerson.editEmployment') : t('hcmPerson.addEmployment')}
        onBack={() => navigate(personId ? `/hcm-person-detail?id=${personId}` : '/hcm-person')}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ employmentType: 'FULL_TIME', jurisdiction: 'CN' }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<ApartmentOutlined />} title={t('hcmPerson.employmentSection')} />
          <div style={grid3}>
            <Form.Item name="legalEntityId" label={t('hcmOrg.unit.legalEntity')} rules={[{ required: true, message: t('hcmOrg.unit.legalEntityRequired') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.unit.legalEntityPlaceholder')}
                options={legalEntities.map((item) => ({
                  value: item.id as number,
                  label: `${item.name}(${item.code})`,
                }))}
              />
            </Form.Item>
            <Form.Item name="employmentNo" label={t('hcmPerson.employmentNo')}>
              <Input maxLength={32} />
            </Form.Item>
            <Form.Item name="employmentType" label={t('hcmPerson.employmentType')} rules={[{ required: true, message: t('hcmPerson.employmentTypeRequired') }]}>
              <Select options={[...EMPLOYMENT_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('hcmOrg.legal.jurisdiction')} rules={[{ required: true, message: t('hcmOrg.legal.jurisdictionRequired') }]}>
              <Select options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="startDate" label={t('hcmPerson.startDate')} rules={[{ required: true, message: t('hcmPerson.startDateRequired') }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endDate" label={t('hcmPerson.endDate')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('hcmPerson.openEndedHint')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('hcmPerson.employmentHint')}
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate(personId ? `/hcm-person-detail?id=${personId}` : '/hcm-person')}>
          {t('common.cancel')}
        </Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
