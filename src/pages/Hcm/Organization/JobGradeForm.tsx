/**
 * 職位職級新增 / 編輯 / 詳情（/hcm-org-job-grade-form 与 /hcm-org-job-grade-detail）
 *
 * 兩個硬規則：
 * 1. 職位必須掛在啟用中的職務族下——族停用後不能再掛新職位（後端同樣拒絕）；
 * 2. 職級序號從 1 起，同族內越大層級越高；0 或負數會讓層級比較失去意義。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, InputNumber, Select, Switch, Tag, message } from 'antd'
import { SaveOutlined, TagsOutlined, ApartmentOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createJobGrade,
  getJobGrade,
  listJobFamilies,
  updateJobGrade,
  type OrgJobFamily,
  type OrgJobGrade,
} from '../../../api/hcmOrganization'
import { CardTitle, FormHeader, UpdatedFooter, cardStyle, formatTimestamp, grid3 } from './shared'

export default function HcmOrgJobGradeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isDetail = window.location.hash.includes('/hcm-org-job-grade-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<OrgJobGrade>()
  const [families, setFamilies] = useState<OrgJobFamily[]>([])
  const [familyName, setFamilyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => {
    listJobFamilies({ page: 1, size: 200 })
      .then((res) => setFamilies(res.records ?? []))
      .catch(() => setFamilies([]))
  }, [])

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getJobGrade(id)
    form.setFieldsValue(detail)
    setUpdatedBy(detail.updatedBy ?? '')
    setUpdatedAt(formatTimestamp(detail.updatedAt))
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    const current = form.getFieldValue('jobFamilyId')
    const matched = families.find((item) => item.id === current)
    setFamilyName(matched ? `${matched.name}(${matched.code})` : '')
  }, [families, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateJobGrade(id, values)
      } else {
        await createJobGrade(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-org-job-grade')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail
    ? t('hcmOrg.job.grade.detailTitle')
    : isEdit ? t('hcmOrg.job.grade.editTitle') : t('hcmOrg.job.grade.addTitle')

  return (
    <div className="content-area">
      <FormHeader
        title={title}
        onBack={() => navigate('/hcm-org-job-grade')}
        extra={isDetail && familyName ? <Tag color="blue">{familyName}</Tag> : undefined}
      />

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ status: 1, sortOrder: 0, gradeLevel: 1 }}>
        <div style={cardStyle}>
          <CardTitle icon={<TagsOutlined />} title={t('hcmOrg.job.grade.basicInfo')} />
          <div style={grid3}>
            <Form.Item name="jobFamilyId" label={t('hcmOrg.job.grade.jobFamily')} rules={[{ required: true, message: t('hcmOrg.job.grade.familyRequired') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.job.grade.familyPlaceholder')}
                options={families.map((item) => ({
                  value: item.id as number,
                  label: `${item.name}(${item.code})`,
                  disabled: item.status !== 1,
                }))}
              />
            </Form.Item>
            <Form.Item name="code" label={t('hcmOrg.job.grade.code')} rules={[{ required: true, message: t('hcmOrg.job.grade.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('hcmOrg.job.grade.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmOrg.job.grade.name')} rules={[{ required: true, message: t('hcmOrg.job.grade.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmOrg.job.grade.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item
              name="gradeLevel"
              label={t('hcmOrg.job.grade.gradeLevel')}
              rules={[{ required: true, message: t('hcmOrg.job.grade.gradeLevelRequired') }]}
            >
              <InputNumber min={1} max={99} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="sortOrder" label={t('hcmOrg.sortOrder')}>
              <Input type="number" />
            </Form.Item>
            <Form.Item
              name="status"
              label={t('hcmOrg.status')}
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}
            >
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<ApartmentOutlined />} title={t('hcmOrg.job.grade.ruleSection')} tone="orange" />
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('hcmOrg.job.grade.gradeLevelHint')}
          </div>
        </div>
      </Form>

      {isDetail && <UpdatedFooter by={updatedBy} at={updatedAt} />}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-org-job-grade')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
