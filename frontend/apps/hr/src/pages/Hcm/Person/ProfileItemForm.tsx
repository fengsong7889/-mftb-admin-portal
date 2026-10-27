/**
 * 档案扩展项新增 / 编辑（/hcm-person-profile-form）
 *
 * 五类（教育/履历/资质/奖励/处分）共用一张表单：字段语义相同（标题/机构/角色/证书号/起止/证据），
 * 类型由入口固定，避免用户在同一条记录里来回切换类型导致字段含义漂移。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, Select, Switch, message } from 'antd'
import { SaveOutlined, ProfileOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  PROFILE_ITEM_TYPES,
  createProfileItem,
  getProfileItem,
  updateProfileItem,
  type PersonProfileItem,
} from '@/api/hcmPerson'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface ProfileFormValues {
  itemType: string
  title: string
  orgName?: string
  roleTitle?: string
  certNo?: string
  startDate?: Dayjs
  endDate?: Dayjs
  evidenceUrl?: string
  evidenceName?: string
  verifyStatus?: number
  remark?: string
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

export default function HcmProfileItemForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const personId = params.get('personId') ? Number(params.get('personId')) : null
  const presetType = params.get('itemType') || 'EDUCATION'
  const isEdit = !!id

  const [form] = Form.useForm<ProfileFormValues>()
  const [saving, setSaving] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getProfileItem(id)
    form.setFieldsValue({
      itemType: detail.itemType,
      title: detail.title,
      orgName: detail.orgName ?? undefined,
      roleTitle: detail.roleTitle ?? undefined,
      certNo: detail.certNo ?? undefined,
      startDate: toDayjs(detail.startDate),
      endDate: toDayjs(detail.endDate),
      evidenceUrl: detail.evidenceUrl ?? undefined,
      evidenceName: detail.evidenceName ?? undefined,
      verifyStatus: detail.verifyStatus ?? 0,
      remark: detail.remark ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const backTarget = personId ? `/hcm-person-detail?id=${personId}` : '/hcm-person'

  const handleSubmit = async () => {
    if (!personId && !isEdit) {
      message.warning(t('hcmPerson.profilePersonMissing'))
      return
    }
    const values = await form.validateFields()
    const payload: PersonProfileItem = {
      personId: personId as number,
      itemType: values.itemType,
      title: values.title,
      orgName: values.orgName,
      roleTitle: values.roleTitle,
      certNo: values.certNo,
      startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
      endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : null,
      evidenceUrl: values.evidenceUrl,
      evidenceName: values.evidenceName,
      verifyStatus: values.verifyStatus === 1 ? 1 : 0,
      remark: values.remark,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateProfileItem(id, payload)
      } else {
        await createProfileItem(payload)
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
        title={isEdit ? t('hcmPerson.editProfileItem') : t('hcmPerson.addProfileItem')}
        onBack={() => navigate(backTarget)}
      />

      <Form form={form} layout="vertical" initialValues={{ itemType: presetType, verifyStatus: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<ProfileOutlined />} title={t('hcmPerson.profileSection')} />
          <div style={grid3}>
            <Form.Item name="itemType" label={t('hcmPerson.profileType')} rules={[{ required: true }]}>
              <Select options={PROFILE_ITEM_TYPES.map((item) => ({ value: item.value, label: item.label }))} />
            </Form.Item>
            <Form.Item name="title" label={t('hcmPerson.profileTitle')} rules={[{ required: true, message: t('hcmPerson.profileTitleRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="orgName" label={t('hcmPerson.profileOrg')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="roleTitle" label={t('hcmPerson.profileRole')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="certNo" label={t('hcmPerson.profileCertNo')}>
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="startDate" label={t('hcmPerson.startDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endDate" label={t('hcmPerson.endDate')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('hcmPerson.openEndedHint')} />
            </Form.Item>
            <Form.Item
              name="verifyStatus"
              label={t('hcmPerson.profileVerify')}
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}
            >
              <Switch checkedChildren={t('hcmOrg.legal.verified')} unCheckedChildren={t('hcmOrg.legal.pendingVerify')} />
            </Form.Item>
            <Form.Item name="evidenceUrl" label={t('employeeDetail.colEvidenceUrl')}>
              <Input maxLength={500} />
            </Form.Item>
            <Form.Item name="evidenceName" label={t('employeeDetail.colEvidenceName')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
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
