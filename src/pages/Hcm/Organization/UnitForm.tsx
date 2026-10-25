/**
 * 管理組織新增 / 編輯 / 詳情（/hcm-org-unit-form 与 /hcm-org-unit-detail）
 *
 * 兩條硬規則在這裡落到界面：
 * 1. 組織必須落在一個啟用中的法人下——選了法人才能選上級，換法人要清空上級（禁止跨法人掛樹）；
 * 2. 上級下拉裡不能出現自己與自己的下級——後端有環檢測，前端先把不可能的選項藏掉，
 *    讓使用者不必靠報錯去試。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Select, Switch, Tag, TreeSelect, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, ApartmentOutlined, SettingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  UNIT_TYPE_OPTIONS,
  createUnit,
  getUnit,
  listLegalEntities,
  unitTree,
  updateUnit,
  type OrgLegalEntity,
  type OrgUnitNode,
} from '../../../api/hcmOrganization'

interface UnitFormValues {
  legalEntityId: number
  parentId?: number | null
  code: string
  name: string
  nameEn?: string
  unitType: string
  leaderName?: string
  sortOrder?: number
  status?: number
  remark?: string
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed',
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function CardTitle({ icon, title, tone }: { icon: React.ReactNode; title: string; tone: 'blue' | 'orange' }) {
  const palette = tone === 'blue' ? { bg: '#e6f7ff', color: '#1890ff' } : { bg: '#fff7e6', color: '#fa8c16' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, color: palette.color, display: 'inline-flex' }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

/** 把组织树转成 TreeSelect 选项，并剔除自身子树（禁止把自己挂到自己下级） */
interface UnitTreeOption {
  value: number
  title: string
  children?: UnitTreeOption[]
}

function toTreeOptions(nodes: OrgUnitNode[], excludeId?: number | null): UnitTreeOption[] {
  return nodes
    .filter((node) => node.id !== excludeId)
    .map((node) => ({
      value: node.id,
      title: `${node.name}(${node.code})`,
      children: node.children?.length ? toTreeOptions(node.children, excludeId) : undefined,
    }))
}

export default function HcmOrgUnitForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const presetParentId = params.get('parentId') ? Number(params.get('parentId')) : null
  const presetLegalEntityId = params.get('legalEntityId') ? Number(params.get('legalEntityId')) : null
  const isDetail = window.location.hash.includes('/hcm-org-unit-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<UnitFormValues>()
  const [legalEntities, setLegalEntities] = useState<OrgLegalEntity[]>([])
  const [units, setUnits] = useState<OrgUnitNode[]>([])
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const legalEntityId = Form.useWatch('legalEntityId', form)

  const loadUnits = useCallback(async (entityId?: number) => {
    if (!entityId) {
      setUnits([])
      return
    }
    setUnits(await unitTree({ legalEntityId: entityId }))
  }, [])

  useEffect(() => {
    listLegalEntities({ page: 1, size: 200 })
      .then((res) => setLegalEntities(res.records ?? []))
      .catch(() => setLegalEntities([]))
  }, [])

  useEffect(() => {
    if (!id) {
      if (presetLegalEntityId) {
        form.setFieldsValue({ legalEntityId: presetLegalEntityId, parentId: presetParentId })
        void loadUnits(presetLegalEntityId)
      }
      return
    }
    void (async () => {
      const detail = await getUnit(id)
      form.setFieldsValue({
        legalEntityId: detail.legalEntityId,
        parentId: detail.parentId ?? undefined,
        code: detail.code,
        name: detail.name,
        nameEn: detail.nameEn ?? undefined,
        unitType: detail.unitType,
        leaderName: detail.leaderName ?? undefined,
        sortOrder: detail.sortOrder,
        status: detail.status,
        remark: detail.remark ?? undefined,
      })
      setUpdatedBy(detail.legalEntityName ?? '')
      setUpdatedAt(detail.path ?? '')
      await loadUnits(detail.legalEntityId)
    })()
  }, [id, form, loadUnits, presetLegalEntityId, presetParentId])

  const treeOptions = useMemo(() => toTreeOptions(units, id), [units, id])

  const handleLegalEntityChange = () => {
    // 换法人必须清空上级：跨法人的父子关系后端会直接拒绝，留在表单里只会误导
    form.setFieldsValue({ parentId: undefined })
    void loadUnits(form.getFieldValue('legalEntityId'))
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateUnit(id, values)
      } else {
        await createUnit(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-org-unit')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail ? t('hcmOrg.unit.detailTitle') : isEdit ? t('hcmOrg.unit.editTitle') : t('hcmOrg.unit.addTitle')

  return (
    <div className="content-area">
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/hcm-org-unit')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
            {isDetail && <Tag color="blue">{updatedBy}</Tag>}
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ unitType: 'DEPARTMENT', status: 1, sortOrder: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<ApartmentOutlined />} title={t('hcmOrg.unit.basicInfo')} tone="blue" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="legalEntityId" label={t('hcmOrg.unit.legalEntity')} rules={[{ required: true, message: t('hcmOrg.unit.legalEntityRequired') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.unit.legalEntityPlaceholder')}
                onChange={handleLegalEntityChange}
                options={legalEntities.map((item) => ({
                  value: item.id as number,
                  label: `${item.name}(${item.code})`,
                  disabled: item.status !== 1,
                }))}
              />
            </Form.Item>
            <Form.Item name="parentId" label={t('hcmOrg.unit.parent')}>
              <TreeSelect
                allowClear
                treeDefaultExpandAll
                placeholder={legalEntityId ? t('hcmOrg.unit.parentPlaceholder') : t('hcmOrg.unit.parentNeedLegal')}
                disabled={!legalEntityId}
                treeData={treeOptions}
              />
            </Form.Item>
            <Form.Item name="unitType" label={t('hcmOrg.unit.unitType')} rules={[{ required: true, message: t('hcmOrg.unit.unitTypeRequired') }]}>
              <Select options={[...UNIT_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item name="code" label={t('hcmOrg.unit.code')} rules={[{ required: true, message: t('hcmOrg.unit.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('hcmOrg.unit.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmOrg.unit.name')} rules={[{ required: true, message: t('hcmOrg.unit.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmOrg.unit.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="leaderName" label={t('hcmOrg.unit.leaderName')}>
              <Input maxLength={64} placeholder={t('hcmOrg.unit.leaderNamePlaceholder')} />
            </Form.Item>
            <Form.Item name="sortOrder" label={t('hcmOrg.sortOrder')}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} valuePropName="checked" getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)} getValueProps={(value: number) => ({ checked: value === 1 })}>
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<SettingOutlined />} title={t('hcmOrg.unit.extraInfo')} tone="orange" />
          <Form.Item name="remark" label={t('hcmOrg.remark')}>
            <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hcmOrg.unit.pathHint')}</div>
        </div>
      </Form>

      {isDetail && (
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hcmOrg.unit.path')}：<span style={{ color: '#595959' }}>{updatedAt || '-'}</span></span>
        </div>
      )}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-org-unit')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
