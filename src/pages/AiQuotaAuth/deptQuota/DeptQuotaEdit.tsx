import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Radio, Select, Tag, Tree, message } from 'antd'
import type { TreeDataNode } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  TeamOutlined,
} from '@ant-design/icons'
import { fetchModels, fetchDeptOptions, type AiModel, type DeptOption } from '../../../api'
import { fetchDeptQuotaDetail, saveDeptQuota, type DeptQuotaRequest,
  type QuotaPeriod, type QuotaType, type OverLimitAction, type AllocateMode, type Currency } from '../../../api/deptQuota'
import {
  buildDeptTree,
  QUOTA_PERIOD_LABEL,
  ALLOCATE_MODE_LABEL,
} from './deptQuotaStore'
import { EditPageHeader, SectionCard, StatusConfigSection, FormFooter, LoadingSpinner, BasicInfoFormSection, QuotaConfigSection, nowText, fmtQuota } from '../components'
import { useTranslation } from 'react-i18next'

/**
 * 部門額度 — 新增 / 編輯獨立頁（參考部門模型權控，取消彈窗）
 * 分區：基础信息 → 適用部門（樹狀穿梭框） → 額度配置（分配方式/周期/類型/限額/軟提醒/超額動作） → 狀態配置
 * 路由：/ai-dept-quota-edit（新增）、/ai-dept-quota-edit?id=xxx（編輯）
 */
export default function DeptQuotaEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')
  const isEdit = !!quotaId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([])
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>([])
  /** 左侧树勾选的部门（待确认，点击箭头后才移入右侧） */
  const [checkedDeptIds, setCheckedDeptIds] = useState<number[]>([])
  const [deptSearchKw, setDeptSearchKw] = useState('')

  /**
   * 一次性加載：模型列表 + 部門選項 +（編輯模式）策略詳情。
   * 合併為單個 effect，避免「詳情先於部門返回」導致部門回填丟失的競態。
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      fetchDeptOptions().catch(() => [] as DeptOption[]),
    ])
      .then(([modelList, depts]) => {
        if (cancelled) return
        setModels(modelList)
        setDeptOptions(depts)

        if (quotaId) {
          // 從後端 API 載入詳情
          fetchDeptQuotaDetail(Number(quotaId)).then((policy) => {
            if (!policy) {
              message.error(t('aiQuotaAuth.strategyNotFound'))
              navigate('/ai-dept-quota')
              return
            }
            form.setFieldsValue({
              name: policy.name,
              description: policy.description ?? '',
              allocateMode: policy.allocateMode,
              period: policy.period,
              quotaType: policy.quotaType,
              quotaValue: policy.quotaValue,
              currency: policy.currency,
              softThreshold: policy.softThreshold,
              overLimitAction: policy.overLimitAction,
              downgradeModelId: policy.downgradeModelId ?? undefined,
              downgradeExemptQuota: policy.downgradeExemptQuota ?? undefined,
              status: policy.status,
            })
            setSelectedDeptIds(policy.deptIds)
          }).catch(() => { message.error(t('aiQuotaAuth.loadDetailFailed')) })
        }
      })
      .catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDataFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, form, navigate])

  /* ── 表單聯動（實時預覽） ── */
  const allocateMode = Form.useWatch('allocateMode', form) as AllocateMode | undefined
  const period = Form.useWatch('period', form) as QuotaPeriod | undefined
  const quotaType = Form.useWatch('quotaType', form) as QuotaType | undefined
  const quotaValue = Form.useWatch('quotaValue', form) as number | undefined
  const currency = Form.useWatch('currency', form) as Currency | undefined
  const softThreshold = Form.useWatch('softThreshold', form) as number | undefined
  const overLimitAction = Form.useWatch('overLimitAction', form) as OverLimitAction | undefined

  /** 部門樹原始數據 */
  const deptTreeRaw = useMemo(() => buildDeptTree(deptOptions), [deptOptions])
  /** 部門樹數據（已選部門標記 disabled，防止重複勾選） */
  const deptTree = useMemo(() => {
    const selectedSet = new Set(selectedDeptIds)
    const markDisabled = (nodes: typeof deptTreeRaw): typeof deptTreeRaw =>
      nodes.map((n) => ({
        ...n,
        disabled: selectedSet.has(n.value),
        children: n.children ? markDisabled(n.children) : undefined,
      }))
    return markDisabled(deptTreeRaw)
  }, [deptTreeRaw, selectedDeptIds])
  const deptRootKeys = useMemo(() => deptTree.map((n) => n.value), [deptTree])

  /** 已選部門人數合計 */
  const selectedEmployeeCount = deptOptions
    .filter((d) => selectedDeptIds.includes(d.deptId))
    .reduce((s, d) => s + d.employeeCount, 0)

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (selectedDeptIds.length === 0) {
      message.warning(t('aiQuotaAuth.selectDeptWarning'))
      return
    }
    if (values.overLimitAction === 'downgrade' && !values.downgradeModelId) {
      message.warning(t('aiQuotaAuth.downgradeWarning'))
      return
    }

    const now = nowText()
    const matched = deptOptions.filter((d) => selectedDeptIds.includes(d.deptId))

    const base = {
      name: String(values.name).trim(),
      description: (values.description ?? '') as string,
      deptIds: selectedDeptIds,
      deptNames: matched.map((d) => d.deptName),
      totalEmployeeCount: matched.reduce((s, d) => s + d.employeeCount, 0),
      allocateMode: values.allocateMode as AllocateMode,
      period: values.period as QuotaPeriod,
      quotaType: values.quotaType as QuotaType,
      quotaValue: Number(values.quotaValue),
      currency: (values.currency ?? 'CNY') as Currency,
      softThreshold: (values.softThreshold ?? 80) as number,
      overLimitAction: values.overLimitAction as OverLimitAction,
      downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
      status: (values.status ?? 1) as number,
      updatedBy: 'admin',
      updatedAt: now,
    }

    setSaving(true)
    try {
      const payload: DeptQuotaRequest = {
        ...(isEdit && quotaId ? { id: Number(quotaId) } : {}),
        name: String(values.name).trim(),
        description: (values.description ?? '') as string,
        deptIds: selectedDeptIds,
        deptNames: matched.map((d) => d.deptName),
        totalEmployeeCount: matched.reduce((s, d) => s + d.employeeCount, 0),
        allocateMode: String(values.allocateMode),
        period: String(values.period),
        quotaType: String(values.quotaType),
        quotaValue: Number(values.quotaValue),
        currency: String(values.currency ?? 'CNY'),
        softThreshold: (values.softThreshold ?? 80) as number,
        overLimitAction: String(values.overLimitAction),
        downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
        downgradeExemptQuota: values.overLimitAction === 'downgrade' ? (values.downgradeExemptQuota ?? null) : null,
        status: (values.status ?? 1) as number,
      }
      await saveDeptQuota(payload)
      message.success(isEdit ? t('aiQuotaAuth.quotaUpdated') : t('aiQuotaAuth.quotaCreated'))
      navigate('/ai-dept-quota')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-dept-quota')

  if (loading && !deptOptions.length && !isEdit) {
    return <LoadingSpinner />
  }

  /* ── 實時額度解讀（提升可理解性） ── */
  const deptLabel = selectedDeptIds.length
    ? deptOptions.filter((d) => selectedDeptIds.includes(d.deptId)).map((d) => d.deptName).join('、')
    : t('aiQuotaAuth.noDeptSelected')
  const quotaReadable = quotaValue && quotaType && period
    ? (allocateMode === 'per_capita'
        ? t('aiQuotaAuth.quotaPerCapita', { quota: fmtQuota(quotaValue, quotaType, currency ?? 'CNY'), period: QUOTA_PERIOD_LABEL[period], count: selectedEmployeeCount, total: fmtQuota(quotaValue * selectedEmployeeCount, quotaType, currency ?? 'CNY') })
        : t('aiQuotaAuth.quotaShared', { count: selectedEmployeeCount, quota: fmtQuota(quotaValue, quotaType, currency ?? 'CNY'), period: QUOTA_PERIOD_LABEL[period] }))
    : t('aiQuotaAuth.quotaIncomplete')

  return (
    <div className="content-area">
      {/* 頁面頭部 */}
      <EditPageHeader
        title={t(isEdit ? 'aiQuotaAuth.editDeptQuota' : 'aiQuotaAuth.addDeptQuota')}
        onBack={handleBack}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          allocateMode: 'total', period: 'monthly', quotaType: 'token',
          currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1,
        }}
      >
        {/* ═══ 分区 1：基础信息 ═══ */}
        <BasicInfoFormSection namePlaceholder={t('aiQuotaAuth.strategyNamePh2')} descPlaceholder={t('aiQuotaAuth.descPhEdit')} />

        {/* ═══ 分区 2：适用部门 ═══ */}
        <SectionCard
          header={{
            icon: <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
            iconBg: '#e6f7ff',
            title: t('aiQuotaAuth.applicableDeptSection'),
            tag: t('aiQuotaAuth.transferTreeTag'),
            tagColor: 'blue',
            note: t('aiQuotaAuth.transferWithCode'),
            tooltip: t('aiQuotaAuth.deptQuotaTooltip'),
          }}
        >

          {/* 穿梭框：左側樹結構 + 右側已選列表 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左側：部門樹 */}
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 360 }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.availableDepts')}（{deptOptions.length}）</span>
                <a onClick={() => {
                  // 全选：将所有未入选的部门加入勾选
                  const unchecked = deptOptions.map((d) => d.deptId).filter((id) => !selectedDeptIds.includes(id))
                  setCheckedDeptIds(unchecked)
                }} style={{ fontSize: 12 }}>{t('aiQuotaAuth.selectAll')}</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Input placeholder={t('aiQuotaAuth.searchDeptPh')} allowClear size="small" value={deptSearchKw} onChange={(e) => setDeptSearchKw(e.target.value)} />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
                <Tree
                  checkable
                  defaultExpandedKeys={deptRootKeys}
                  checkedKeys={checkedDeptIds}
                  onCheck={(keys) => {
                    // 過濾已選部門，避免 disabled 節點殘留在 checkedDeptIds 中
                    const raw = Array.isArray(keys) ? keys : keys.checked
                    setCheckedDeptIds((raw as number[]).filter((id) => !selectedDeptIds.includes(id)))
                  }}
                  treeData={deptTree as unknown as TreeDataNode[]}
                  fieldNames={{ key: 'value', title: 'title', children: 'children' }}
                  filterTreeNode={(node) => {
                    if (!deptSearchKw) return false
                    const kw = deptSearchKw.toLowerCase()
                    const n = node as unknown as { deptCode?: string; deptName?: string }
                    return (n.deptCode ?? '').toLowerCase().includes(kw) || (n.deptName ?? '').toLowerCase().includes(kw)
                  }}
                />
              </div>
            </div>

            {/* 中間：操作按鈕 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <Button type="primary" size="small" icon={<span style={{ fontSize: 16 }}>›</span>}
                onClick={() => {
                  // 將勾選部門移入右側（去重 + 過濾已選）
                  const newIds = checkedDeptIds.filter((id) => !selectedDeptIds.includes(id))
                  if (newIds.length === 0) {
                    message.warning(t('aiQuotaAuth.deptAlreadyAdded'))
                    setCheckedDeptIds([])
                    return
                  }
                  const skipped = checkedDeptIds.length - newIds.length
                  setSelectedDeptIds((prev) => [...new Set([...prev, ...newIds])])
                  setCheckedDeptIds([])
                  if (skipped > 0) message.warning(t('aiQuotaAuth.deptSkipped', { count: skipped }))
                }}
                disabled={checkedDeptIds.length === 0}
                style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }} />
              <Button size="small" icon={<span style={{ fontSize: 16 }}>‹</span>}
                onClick={() => setSelectedDeptIds([])} disabled={selectedDeptIds.length === 0} />
            </div>

            {/* 右側：已選部門 */}
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 360 }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.selectedDepts')}（{selectedDeptIds.length}）</span>
                <a onClick={() => setSelectedDeptIds([])} style={{ fontSize: 12 }}>{t('aiQuotaAuth.clearBtn')}</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedDeptIds.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>{t('aiQuotaAuth.selectDeptPlease')}</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedDeptIds.map((id) => {
                      const dept = deptOptions.find((d) => d.deptId === id)
                      if (!dept) return null
                      return (
                        <Tag key={id} closable onClose={() => setSelectedDeptIds((prev) => prev.filter((x) => x !== id))} style={{ fontSize: 12, margin: 0 }}>
                          {dept.deptName}（{dept.deptCode ?? '-'}）
                        </Tag>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{
                padding: '8px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '0 0 8px 8px', fontSize: 12, color: '#595959',
              }}>
                {t('aiQuotaAuth.deptsCount', {
                                  count: <strong>{selectedDeptIds.length}</strong>,
                                  empCount: <strong>{selectedEmployeeCount}</strong>,
                                })}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ═══ 分区 3：额度配置 ═══ */}
        <QuotaConfigSection
          interpretPrefix={
            <>
              <div>· {t('aiQuotaAuth.quotaApplyLabel')}：<strong style={{ color: '#262626' }}>{deptLabel}</strong></div>
              <div>· {t('aiQuotaAuth.quotaLimitLabel')}：{quotaReadable}</div>
            </>
          }
          models={models}
          periodExtraKey="aiQuotaAuth.periodExtra"
          downgradeModelExtraKey="aiQuotaAuth.downgradeModelExtra"
          showDowngradeExempt
          quotaType={quotaType}
          currency={currency}
          overLimitAction={overLimitAction}
          softThreshold={softThreshold}
          allocateModeSlot={
            <Form.Item name="allocateMode" label={t('aiQuotaAuth.allocateModeLabel')} rules={[{ required: true }]}>
              <Radio.Group>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {(['total', 'per_capita'] as AllocateMode[]).map((mode) => {
                    const active = allocateMode === mode
                    const desc = mode === 'total'
                      ? t('aiQuotaAuth.allocateModeTotalDesc')
                      : t('aiQuotaAuth.allocateModePerCapitaDesc')
                    return (
                      <label key={mode} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                        padding: '12px 14px', borderRadius: 8,
                        border: `1px solid ${active ? '#E8720C' : '#e8eaed'}`,
                        background: active ? '#FFF7E6' : '#fff', transition: 'all 0.2s',
                      }}>
                        <Radio value={mode} style={{ marginTop: 2 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{ALLOCATE_MODE_LABEL[mode]}</div>
                          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </Radio.Group>
            </Form.Item>
          }
        />

        {/* ═══ 分区 4：状态配置 ═══ */}
        <StatusConfigSection extra={t('aiQuotaAuth.statusExtra')} />
      </Form>

      {/* 底部操作按鈕 */}
      <FormFooter onCancel={handleBack} onSave={handleSave} saving={saving} />
    </div>
  )
}
