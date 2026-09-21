/**
 * 发起盘点（独立表单页，遵循 form-page-style）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Form, Input, Select, TreeSelect, Radio, Modal, message, Space } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, AimOutlined, FileSearchOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import {
  fetchInventoryOptions, searchInventoryEmployees, previewInventory, createInventoryTask, newInventoryRequestKey,
  type InventoryOptions, type InventoryScope, type InventoryPreviewResult, type InventoryEmployeeOption,
} from '../../../api/eamInventory'
import { ASSET_STATUS_LABEL } from './inventoryMeta'

interface Props {
  onBack: () => void
  onCreated: (taskId: number) => void
}

interface TreeNode { title: string; value: number; children?: TreeNode[] }

function buildTree(items: { id: number; parentId?: number; name: string }[]): TreeNode[] {
  const byParent = new Map<number, typeof items>()
  for (const it of items) {
    const pid = it.parentId ?? 0
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(it)
  }
  const walk = (pid: number): TreeNode[] => (byParent.get(pid) || [])
    .map(it => ({ title: it.name, value: it.id, children: walk(it.id) }))
  return walk(0)
}

export default function InventoryCreate({ onBack, onCreated }: Props) {
  const { t } = useTranslation()
  const { numericOptions } = useCompanyBrand()
  const [form] = Form.useForm()
  const [options, setOptions] = useState<InventoryOptions>({ locations: [], departments: [], categories: [], statuses: [] })
  const [ownerOptions, setOwnerOptions] = useState<{ label: string; value: number }[]>([])
  const ownerCache = useRef<Map<number, InventoryEmployeeOption>>(new Map())
  const [scopeMode, setScopeMode] = useState<'CONDITION' | 'ALL'>('CONDITION')
  const [preview, setPreview] = useState<InventoryPreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchInventoryOptions().then(setOptions).catch(() => undefined)
  }, [])

  const locationTree = useMemo(() => buildTree(options.locations), [options.locations])
  const categoryTree = useMemo(() => buildTree(options.categories), [options.categories])
  const departmentTree = useMemo(() => buildTree(options.departments), [options.departments])

  const handleOwnerSearch = useCallback(async (keyword: string) => {
    const list = await searchInventoryEmployees(keyword)
    list.forEach(e => ownerCache.current.set(e.id, e))
    setOwnerOptions(list.map(e => ({ value: e.id, label: `${e.name}（${e.empId || '-'}）` })))
  }, [])

  /** 由表单值构造范围 */
  const currentScope = (): InventoryScope => {
    const v = form.getFieldsValue()
    return {
      scopeMode,
      locationIds: scopeMode === 'CONDITION' ? (v.locationIds || []) : undefined,
      categoryIds: scopeMode === 'CONDITION' ? (v.categoryIds || []) : undefined,
      departmentId: scopeMode === 'CONDITION' ? (v.departmentId ?? undefined) : undefined,
      companyBrand: scopeMode === 'CONDITION' ? (v.companyBrand ?? undefined) : undefined,
      statuses: v.statuses?.length ? v.statuses : undefined,
    }
  }

  const invalidatePreview = () => setPreview(null)

  const handlePreview = async () => {
    const scope = currentScope()
    if (scopeMode === 'CONDITION') {
      const has = (scope.locationIds?.length || scope.categoryIds?.length || scope.departmentId || scope.companyBrand)
      if (!has) { message.warning(t('asset.invPreviewTip', { defaultValue: '請先選擇至少一項範圍條件' })); return }
    }
    setPreviewing(true)
    try {
      const res = await previewInventory(scope)
      if (res.total === 0) { message.warning(t('asset.noItemsChecked', { defaultValue: '應盤清單為空，請調整範圍' })); setPreview(null); return }
      setPreview(res)
    } catch {
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  const handleSubmit = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch { return }
    if (!preview) { message.warning(t('asset.invPreviewTip', { defaultValue: '請先預覽並確認應盤清單後再發起' })); return }
    const owner = ownerCache.current.get(values.ownerId)
    Modal.confirm({
      title: t('asset.invConfirmStart', { defaultValue: '確認發起盤點？' }),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('asset.colTaskName')}：</span><b>{values.taskName}</b></div>
          <div className="confirm-info-row"><span>{t('asset.invOwnerLabel')}：</span><b>{owner ? `${owner.name}（${owner.empId || '-'}）` : t('common.currentOperator', { defaultValue: '當前操作員' })}</b></div>
          <div className="confirm-info-row"><span>{t('asset.invRangeSummary')}：</span><b>{scopeMode === 'ALL' ? t('asset.invScopeAll') : preview.scopeSummary.locationNames?.join('、') || preview.scopeSummary.categoryNames?.join('、') || t('asset.invScopeCondition')}</b></div>
          <div className="confirm-info-row"><span>{t('asset.invPreviewTotal')}：</span><b>{preview.total}</b></div>
        </div>
      ),
      okText: t('asset.invConfirmStart', { defaultValue: '確認發起' }),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          const res = await createInventoryTask({
            taskName: values.taskName,
            ownerId: values.ownerId ?? null,
            remark: values.remark || undefined,
            scope: currentScope(),
            scopeHash: preview.scopeHash,
            requestKey: newInventoryRequestKey(),
          })
          message.success(t('asset.inventoryCreated', { taskNo: res.taskNo, defaultValue: '盤點任務已創建' }))
          onCreated(res.id)
        } catch { /* 拦截器提示 */ } finally { setSubmitting(false) }
      },
    })
  }

  const cardStyle = { border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } as const

  return (
    <>
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              {t('common.back', { defaultValue: '返回' })}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.invCreateTitle', { defaultValue: '發起盤點' })}</h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" onValuesChange={invalidatePreview}>
        {/* 基础信息 */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSearchOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.basicInfo', { defaultValue: '基礎信息' })}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('asset.colTaskName')} name="taskName" rules={[{ required: true, message: t('asset.taskNameRequired', { defaultValue: '請輸入任務名稱' }) }]}>
              <Input placeholder={t('asset.taskNamePh', { defaultValue: '請輸入盤點任務名稱' })} allowClear maxLength={200} />
            </Form.Item>
            <Form.Item label={t('asset.invOwnerLabel')} name="ownerId">
              <Select showSearch filterOption={false} allowClear onSearch={handleOwnerSearch}
                placeholder={t('asset.invOwnerPh')} options={ownerOptions} notFoundContent={t('common.noData')} />
            </Form.Item>
            <Form.Item label={t('asset.colRemark')} name="remark">
              <Input placeholder={t('asset.remarkPh', { defaultValue: '備註（選填）' })} allowClear maxLength={500} />
            </Form.Item>
          </div>
        </div>

        {/* 盘点范围 */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AimOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.invScopeMode', { defaultValue: '盤點範圍' })}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <Space>
              <Button icon={<InboxOutlined />} loading={previewing} onClick={handlePreview}>{t('asset.invPreviewBtn', { defaultValue: '預覽應盤清單' })}</Button>
              {preview && <span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('asset.invPreviewTotal')}：<b style={{ color: '#E8720C' }}>{preview.total}</b></span>}
            </Space>
          </div>

          <Form.Item label={t('asset.invScopeModeLabel', { defaultValue: '盤點方式' })} style={{ marginBottom: 12 }}>
            <Radio.Group value={scopeMode} onChange={e => { setScopeMode(e.target.value); invalidatePreview() }}>
              <Radio.Button value="CONDITION">{t('asset.invScopeCondition', { defaultValue: '按條件盤點' })}</Radio.Button>
              <Radio.Button value="ALL">{t('asset.invScopeAll', { defaultValue: '全部適用資產' })}</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('asset.invScopeLocations', { defaultValue: '存放倉庫' })} name="locationIds">
              <TreeSelect treeCheckable showSearch treeNodeFilterProp="title" allowClear disabled={scopeMode === 'ALL'}
                placeholder={t('common.all')} treeData={locationTree} maxTagCount="responsive" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('asset.invScopeCategories', { defaultValue: '資產分類' })} name="categoryIds">
              <TreeSelect treeCheckable showSearch treeNodeFilterProp="title" allowClear disabled={scopeMode === 'ALL'}
                placeholder={t('common.all')} treeData={categoryTree} maxTagCount="responsive" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('asset.invScopeDepartment', { defaultValue: '資產歸屬部門' })} name="departmentId">
              <TreeSelect showSearch treeNodeFilterProp="title" allowClear disabled={scopeMode === 'ALL'}
                placeholder={t('common.all')} treeData={departmentTree} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('asset.invScopeCompanyBrand', { defaultValue: '所屬品牌' })} name="companyBrand">
              <Select allowClear disabled={scopeMode === 'ALL'} placeholder={t('common.all')} options={numericOptions} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('asset.invScopeStatuses', { defaultValue: '資產狀態' })} name="statuses" initialValue={['idle', 'in_use', 'in_repair', 'pending_inspection']}>
              <Select mode="multiple" allowClear placeholder={t('common.all')} maxTagCount="responsive" style={{ width: '100%' }}
                options={['idle', 'in_use', 'in_repair', 'pending_inspection', 'lost'].map(s => ({ value: s, label: ASSET_STATUS_LABEL[s] }))} />
            </Form.Item>
          </div>
          {scopeMode === 'ALL' && (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{t('asset.invPreviewTip', { defaultValue: '全盤將按所選狀態快照全部適用資產' })}</div>
          )}
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<PlusOutlined />} loading={submitting} disabled={!preview} onClick={handleSubmit}>
          {t('asset.btnNewInventory')}
        </Button>
      </div>
    </>
  )
}
