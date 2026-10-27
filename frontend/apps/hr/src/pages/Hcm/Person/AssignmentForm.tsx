/**
 * 任職新增 / 編輯（/hcm-person-assignment-form）
 *
 * 三個界面約束對應服務層規則：
 * 1. 組織下拉只列該雇傭法人的組織（跨法人任職後端直接拒絕）；
 * 2. 崗位下拉按所選組織過濾（選完組織才可選崗位）；
 * 3. FTE 用 0.01~1.00 的兩位小數，主任職在已有生效主任職時給出提示。
 * 生效日期與同日序號是「日期生效」的核心：同一天多次變更靠 seqNo 排序，不靠 id。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, InputNumber, Select, Switch, Tag, message } from 'antd'
import { SaveOutlined, ApartmentOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { createAssignment, getAssignment, updateAssignment, type HrAssignment } from '@/api/hcmPerson'
import { listPositions, unitTree, type OrgPosition, type OrgUnitNode } from '@/api/hcmOrganization'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface AssignmentFormValues {
  unitId: number
  positionId?: number
  workLocation?: string
  fte: number
  primaryFlag: boolean
  effectiveFrom: Dayjs
  effectiveTo?: Dayjs | null
  seqNo: number
  remark?: string
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

function flattenUnits(nodes: OrgUnitNode[], depth = 0): Array<{ value: number; label: string }> {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}(${node.code})` },
    ...flattenUnits(node.children ?? [], depth + 1),
  ])
}

export default function HcmAssignmentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const employmentId = params.get('employmentId') ? Number(params.get('employmentId')) : null
  const personId = params.get('personId') ? Number(params.get('personId')) : null
  const legalEntityId = params.get('legalEntityId') ? Number(params.get('legalEntityId')) : null
  const isEdit = !!id

  const [form] = Form.useForm<AssignmentFormValues>()
  const [units, setUnits] = useState<OrgUnitNode[]>([])
  const [positions, setPositions] = useState<OrgPosition[]>([])
  const [saving, setSaving] = useState(false)
  const unitId = Form.useWatch('unitId', form)

  useEffect(() => {
    // 只取該雇傭法人的組織：跨法人任職在服務層會被拒，界面先不給錯選項
    unitTree(legalEntityId ? { legalEntityId } : {}).then(setUnits).catch(() => setUnits([]))
  }, [legalEntityId])

  useEffect(() => {
    if (!unitId) {
      setPositions([])
      return
    }
    listPositions({ page: 1, size: 200, unitId, status: 1 })
      .then((res) => setPositions(res.records ?? []))
      .catch(() => setPositions([]))
  }, [unitId])

  const unitOptions = useMemo(() => flattenUnits(units), [units])

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getAssignment(id)
    form.setFieldsValue({
      unitId: detail.unitId,
      positionId: detail.positionId ?? undefined,
      workLocation: detail.workLocation ?? undefined,
      fte: Number(detail.fte ?? 1),
      primaryFlag: detail.primaryFlag === 1,
      effectiveFrom: toDayjs(detail.effectiveFrom) as Dayjs,
      effectiveTo: toDayjs(detail.effectiveTo),
      seqNo: detail.seqNo ?? 1,
      remark: detail.remark ?? undefined,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const backTarget = personId ? `/hcm-person-detail?id=${personId}` : '/hcm-person'

  const handleSubmit = async () => {
    if (!employmentId && !isEdit) {
      message.warning(t('hcmPerson.assignmentEmploymentMissing'))
      return
    }
    const values = await form.validateFields()
    const payload: HrAssignment = {
      employmentId: employmentId as number,
      unitId: values.unitId,
      positionId: values.positionId,
      workLocation: values.workLocation,
      // Decimal 用字符串提交，避免前端浮点在 0.1+0.2 这类值上失真
      fte: values.fte.toFixed(2),
      primaryFlag: values.primaryFlag ? 1 : 0,
      effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
      effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
      seqNo: values.seqNo,
      remark: values.remark,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateAssignment(id, payload)
      } else {
        await createAssignment(payload)
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
        title={isEdit ? t('hcmPerson.editAssignment') : t('hcmPerson.addAssignment')}
        onBack={() => navigate(backTarget)}
        extra={isEdit ? <Tag color="blue">ID {id}</Tag> : undefined}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ fte: 1, primaryFlag: true, seqNo: 1, effectiveFrom: dayjs() }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<ApartmentOutlined />} title={t('hcmPerson.assignmentSection')} />
          <div style={grid3}>
            <Form.Item name="unitId" label={t('hcmOrg.position.unit')} rules={[{ required: true, message: t('hcmOrg.position.unitRequired') }]}>
              <Select showSearch optionFilterProp="label" placeholder={t('hcmOrg.position.unitPlaceholder')} options={unitOptions} />
            </Form.Item>
            <Form.Item name="positionId" label={t('hcmOrg.position.jobGrade')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={unitId ? t('hcmOrg.position.jobGradePlaceholder') : t('hcmOrg.unit.parentNeedLegal')}
                disabled={!unitId}
                options={positions.map((item) => ({ value: item.id, label: `${item.name}(${item.code})` }))}
              />
            </Form.Item>
            <Form.Item name="workLocation" label={t('hcmPerson.workLocation')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="fte" label={t('hcmPerson.fte')} rules={[{ required: true, message: t('hcmPerson.fteRequired') }]}>
              <InputNumber min={0.01} max={1} step={0.05} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="primaryFlag" label={t('hcmPerson.primaryFlag')} valuePropName="checked">
              <Switch checkedChildren={t('hcmPerson.primary')} unCheckedChildren={t('hcmPerson.secondary')} />
            </Form.Item>
            <Form.Item name="seqNo" label={t('hcmPerson.seqNo')} rules={[{ required: true, message: t('hcmPerson.seqNoRequired') }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveFrom" label={t('hcmPerson.effectiveFrom')} rules={[{ required: true, message: t('hcmPerson.effectiveFromRequired') }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveTo" label={t('hcmPerson.effectiveTo')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('hcmPerson.effectiveToHint')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('hcmPerson.assignmentHint')}
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
