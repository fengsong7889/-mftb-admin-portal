/**
 * 分發矩陣規則 —— 新增/編輯獨立頁（AGENTS.md §9.1：禁止用行內編輯承載新增/編輯）
 *
 * 為什麼從行內編輯改成獨立頁：
 * 1. 行內編輯把「匹配範圍 / 匹配對象 / 產品經理 / 容量」擠進表格單元格，1440 下看不清全貌；
 * 2. 保存失敗只有一個全局 toast，字段級錯誤無處定位；
 * 3. 獨立頁可刷新、可分享、可前進後退，和其余配置頁保持一致。
 *
 * 匹配對象必須存真值編碼（menuKey / systemCode / deptId / reqType）：後端按 scope_value 精確比對。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, InputNumber, Select, Space, Spin, Switch, TreeSelect, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RdmFormHeader from '../components/RdmFormHeader'
import { fetchDepartments } from '@/api/department'
import { buildDeptTree, type DeptNode } from '../../Attendance/deptTree'
import {
  fetchProductOptions,
  fetchRoutingRules,
  saveRoutingRule,
  type RdmProductOption,
  type RdmRoutingRow,
} from '@/api/rdm'
import { RDM_REQ_TYPE_LABEL } from '@/constants/rdm'
import { PORTAL_SYSTEM_ICONS } from '@/constants/portalSystems'
import { keyToPath } from '@/constants/menuDataSource'
import '../index.css'

interface FormValues {
  priority: number
  scopeType: string
  scopeValue: string | number
  pmUserId: number
  backupPmName?: string
  loadCapacity: number
  enabled: boolean
}

/** 匹配對象候選（非部門維度）：值與標籤都取後端比對用的真值 */
function scopeValueOptions(scopeType: string): { value: string; label: string }[] {
  switch (scopeType) {
    case 'SYSTEM':
      return Object.keys(PORTAL_SYSTEM_ICONS).map(code => ({ value: code, label: code }))
    case 'MENU':
      return Object.keys(keyToPath).map(key => ({ value: key, label: key }))
    case 'TYPE':
      return Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))
    default:
      return []
  }
}

/** 在部门树里按 id 找标题（TreeSelect onSelect 之外的兜底，避免 labelList 为空时存成 id） */
function findDeptTitle(nodes: DeptNode[], id: number): string {
  for (const node of nodes) {
    if (Number(node.value) === id) return String(node.title ?? '')
    const children = (node as unknown as { children?: DeptNode[] }).children
    if (children?.length) {
      const found = findDeptTitle(children, id)
      if (found) return found
    }
  }
  return ''
}

export default function RoutingConfigForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ruleId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const isEdit = ruleId != null

  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<RdmRoutingRow | null>(null)
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])

  const scopeType = Form.useWatch('scopeType', form) ?? 'SYSTEM'
  const valueOptions = useMemo(() => scopeValueOptions(scopeType), [scopeType])
  const scopeOptions = useMemo(() => [
    { value: 'SYSTEM', label: t('rdm.routingForm.scopeSystem') },
    { value: 'MENU', label: t('rdm.routingForm.scopeMenu') },
    { value: 'DEPT', label: t('rdm.routingForm.scopeDept') },
    { value: 'TYPE', label: t('rdm.routingForm.scopeTypeReq') },
  ], [t])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchRoutingRules(),
      fetchProductOptions().catch(() => [] as RdmProductOption[]),
      fetchDepartments().then(list => buildDeptTree(list ?? [])).catch(() => [] as DeptNode[]),
    ])
      .then(([rules, pms, tree]) => {
        if (cancelled) return
        setPmOptions(pms ?? [])
        setDeptTree(tree ?? [])
        if (!isEdit) {
          form.setFieldsValue({
            priority: (rules?.length ?? 0) + 1,
            scopeType: 'SYSTEM',
            pmUserId: pms?.[0]?.userId,
            loadCapacity: 8,
            enabled: true,
          })
          return
        }
        const row = (rules ?? []).find(r => r.id === ruleId)
        if (!row) {
          setError(t('rdm.routingForm.notFound'))
          return
        }
        setCurrent(row)
        form.setFieldsValue({
          priority: row.priority,
          scopeType: row.scopeType,
          scopeValue: row.scopeType === 'DEPT' ? Number(row.scopeValue) : row.scopeValue,
          pmUserId: row.pmUserId,
          backupPmName: row.backupPmName ?? undefined,
          loadCapacity: row.loadCapacity,
          enabled: row.enabled,
        })
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error && err.message ? err.message : t('rdm.routingForm.loadFail'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [form, isEdit, ruleId, t])

  const handleSubmit = useCallback(async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const pm = pmOptions.find(p => p.userId === values.pmUserId)
    const scopeValue = String(values.scopeValue ?? '').trim()
    const scopeName = values.scopeType === 'DEPT'
      ? findDeptTitle(deptTree, Number(scopeValue))
      : (valueOptions.find(o => o.value === scopeValue)?.label ?? scopeValue)
    setSaving(true)
    try {
      await saveRoutingRule({
        id: isEdit ? ruleId : null,
        scopeType: values.scopeType,
        scopeValue,
        scopeName,
        pmUserId: values.pmUserId,
        pmName: pm?.name ?? current?.pmName ?? '',
        backupPmName: values.backupPmName ?? null,
        loadCapacity: values.loadCapacity,
        activeCount: current?.activeCount ?? 0,
        priority: values.priority,
        enabled: values.enabled,
      })
      message.success(t(isEdit ? 'rdm.routingForm.savedEdit' : 'rdm.routingForm.savedAdd'))
      navigate('/rdm-config-routing')
    } catch (err) {
      // 接口是 SILENT，不会全局弹错；这里必须显式给出后端原因
      message.error(err instanceof Error && err.message ? err.message : t('rdm.routingForm.saveFail'))
    } finally {
      setSaving(false)
    }
  }, [current, deptTree, form, isEdit, navigate, pmOptions, ruleId, t, valueOptions])

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return (
      <div className="content-area">
        <RdmFormHeader
          title={isEdit ? t('rdm.routingForm.editTitle') : t('rdm.routingForm.addTitle')}
          onBack={() => navigate('/rdm-config-routing')}
          backText={t('common.back')}
        />
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => navigate('/rdm-config-routing')}>{t('common.back')}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={isEdit ? t('rdm.routingForm.editTitle') : t('rdm.routingForm.addTitle')}
        onBack={() => navigate('/rdm-config-routing')}
        backText={t('common.back')}
        meta={t('rdm.routingForm.meta')}
      />

      <Form form={form} layout="vertical">
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">{t('rdm.routingForm.sectionMatch')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="priority"
              label={t('rdm.routingForm.priority')}
              rules={[{ required: true, message: t('rdm.routingForm.priorityRequired') }]}
              extra={t('rdm.routingForm.priorityExtra')}
            >
              <InputNumber min={1} max={999} style={{ width: '100%' }} placeholder={t('rdm.routingForm.priorityPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="scopeType"
              label={t('rdm.routingForm.scopeType')}
              rules={[{ required: true, message: t('rdm.routingForm.scopeTypeRequired') }]}
            >
              <Select
                options={scopeOptions}
                onChange={() => form.setFieldValue('scopeValue', undefined)}
              />
            </Form.Item>
            <Form.Item
              name="scopeValue"
              label={t('rdm.routingForm.scopeValue')}
              rules={[{ required: true, message: t('rdm.routingForm.scopeValueRequired') }]}
              extra={t('rdm.routingForm.scopeValueExtra')}
            >
              {scopeType === 'DEPT' ? (
                <TreeSelect
                  treeData={deptTree}
                  showSearch
                  treeNodeFilterProp="title"
                  placeholder={t('rdm.routingForm.deptPlaceholder')}
                  style={{ width: '100%' }}
                />
              ) : (
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('rdm.routingForm.scopePlaceholder')}
                  options={valueOptions}
                />
              )}
            </Form.Item>
          </div>
        </div>

        <div className="rdm-form-section">
          <div className="rdm-form-section-title">{t('rdm.routingForm.sectionAssignee')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="pmUserId"
              label={t('rdm.routingForm.pm')}
              rules={[{ required: true, message: t('rdm.routingForm.pmRequired') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('rdm.routingForm.pmPlaceholder')}
                options={pmOptions.map(pm => ({
                  value: pm.userId,
                  label: `${pm.name}${pm.empNo ? `（${pm.empNo}）` : ''}`,
                }))}
              />
            </Form.Item>
            <Form.Item name="backupPmName" label={t('rdm.routingForm.backup')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('rdm.routingForm.backupPlaceholder')}
                options={pmOptions.map(pm => ({ value: pm.name, label: pm.name }))}
              />
            </Form.Item>
            <Form.Item
              name="loadCapacity"
              label={t('rdm.routingForm.capacity')}
              rules={[{ required: true, message: t('rdm.routingForm.capacityRequired') }]}
            >
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label={t('rdm.routingForm.enabled')} valuePropName="checked">
              <Switch checkedChildren={t('rdm.routingForm.enabledOn')} unCheckedChildren={t('rdm.routingForm.enabledOff')} />
            </Form.Item>
          </div>
          {current && (
            <Alert
              type="info"
              showIcon
              message={t('rdm.routingForm.inUse', { count: current.activeCount })}
            />
          )}
        </div>
      </Form>

      <div className="form-footer">
        <Space size={12}>
          <Button onClick={() => navigate('/rdm-config-routing')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSubmit()}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </div>
  )
}
