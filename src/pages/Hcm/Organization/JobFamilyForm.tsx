/**
 * 職務族新增 / 編輯 / 詳情（/hcm-org-job-family-form 与 /hcm-org-job-family-detail）
 *
 * 單模塊表單：編碼 + 中英文名 + 排序 + 狀態 + 備註。
 * 職務族不掛上級——族就是最上層，再往上只有「體系」這個概念，不建模。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Switch, message } from 'antd'
import { SaveOutlined, ClusterOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createJobFamily,
  getJobFamily,
  updateJobFamily,
  type OrgJobFamily,
} from '../../../api/hcmOrganization'
import { CardTitle, FormHeader, UpdatedFooter, cardStyle, formatTimestamp, grid3 } from './shared'

export default function HcmOrgJobFamilyForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isDetail = window.location.hash.includes('/hcm-org-job-family-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<OrgJobFamily>()
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getJobFamily(id)
    form.setFieldsValue(detail)
    setUpdatedBy(detail.updatedBy ?? '')
    setUpdatedAt(formatTimestamp(detail.updatedAt))
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateJobFamily(id, values)
      } else {
        await createJobFamily(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-org-job-family')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail
    ? t('hcmOrg.job.family.detailTitle')
    : isEdit ? t('hcmOrg.job.family.editTitle') : t('hcmOrg.job.family.addTitle')

  return (
    <div className="content-area">
      <FormHeader title={title} onBack={() => navigate('/hcm-org-job-family')} />

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ status: 1, sortOrder: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<ClusterOutlined />} title={t('hcmOrg.job.family.basicInfo')} />
          <div style={grid3}>
            <Form.Item name="code" label={t('hcmOrg.job.family.code')} rules={[{ required: true, message: t('hcmOrg.job.family.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('hcmOrg.job.family.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmOrg.job.family.name')} rules={[{ required: true, message: t('hcmOrg.job.family.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmOrg.job.family.nameEn')}>
              <Input maxLength={128} />
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
      </Form>

      {isDetail && <UpdatedFooter by={updatedBy} at={updatedAt} />}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-org-job-family')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
