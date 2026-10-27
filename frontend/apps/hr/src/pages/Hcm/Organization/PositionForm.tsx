/**
 * 崗位與編制新增 / 編輯 / 詳情（/hcm-org-position-form 与 /hcm-org-position-detail）
 *
 * 兩個下拉都有前置條件：組織必須啟用、職位必須啟用，停用項在下拉裡直接置灰，
 * 免得使用者選完才被後端拒絕。編制數 0 的含義是「尚未核定」，不是「不需要人」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, InputNumber, Select, Switch, Tag, message } from 'antd'
import { SaveOutlined, LayoutOutlined, ApartmentOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createPosition,
  getPosition,
  jobGradeOptions,
  unitTree,
  updatePosition,
  type OrgJobGrade,
  type OrgPosition,
  type OrgUnitNode,
} from '@/api/hcmOrganization'
import { CardTitle, FormHeader, UpdatedFooter, cardStyle, formatTimestamp, grid3 } from './shared'

function flattenUnits(nodes: OrgUnitNode[], depth = 0): Array<{ value: number; label: string; disabled?: boolean }> {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}(${node.code})`, disabled: node.status !== 1 },
    ...flattenUnits(node.children ?? [], depth + 1),
  ])
}

export default function HcmOrgPositionForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isDetail = window.location.hash.includes('/hcm-org-position-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<OrgPosition>()
  const [units, setUnits] = useState<OrgUnitNode[]>([])
  const [grades, setGrades] = useState<OrgJobGrade[]>([])
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => {
    unitTree({}).then(setUnits).catch(() => setUnits([]))
    jobGradeOptions().then(setGrades).catch(() => setGrades([]))
  }, [])

  const unitOptions = useMemo(() => flattenUnits(units), [units])

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getPosition(id)
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
        await updatePosition(id, values)
      } else {
        await createPosition(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-org-position')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail
    ? t('hcmOrg.position.detailTitle')
    : isEdit ? t('hcmOrg.position.editTitle') : t('hcmOrg.position.addTitle')

  return (
    <div className="content-area">
      <FormHeader
        title={title}
        onBack={() => navigate('/hcm-org-position')}
        extra={isDetail ? <Tag color="blue">{t('hcmOrg.position.headcountHintShort')}</Tag> : undefined}
      />

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ status: 1, sortOrder: 0, headcount: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<LayoutOutlined />} title={t('hcmOrg.position.basicInfo')} />
          <div style={grid3}>
            <Form.Item name="code" label={t('hcmOrg.position.code')} rules={[{ required: true, message: t('hcmOrg.position.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('hcmOrg.position.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmOrg.position.name')} rules={[{ required: true, message: t('hcmOrg.position.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmOrg.position.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="unitId" label={t('hcmOrg.position.unit')} rules={[{ required: true, message: t('hcmOrg.position.unitRequired') }]}>
              <Select showSearch optionFilterProp="label" placeholder={t('hcmOrg.position.unitPlaceholder')} options={unitOptions} />
            </Form.Item>
            <Form.Item name="jobGradeId" label={t('hcmOrg.position.jobGrade')} rules={[{ required: true, message: t('hcmOrg.position.jobGradeRequired') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.position.jobGradePlaceholder')}
                options={grades.map((item) => ({
                  value: item.id as number,
                  label: `${item.name}(${item.code})`,
                  disabled: item.status !== 1,
                }))}
              />
            </Form.Item>
            <Form.Item name="headcount" label={t('hcmOrg.position.headcount')}>
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
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
          <CardTitle icon={<ApartmentOutlined />} title={t('hcmOrg.position.headcountSection')} tone="orange" />
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('hcmOrg.position.headcountHint')}
          </div>
        </div>
      </Form>

      {isDetail && <UpdatedFooter by={updatedBy} at={updatedAt} />}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-org-position')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
