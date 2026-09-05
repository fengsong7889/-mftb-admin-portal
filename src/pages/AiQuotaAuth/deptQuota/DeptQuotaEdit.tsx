import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Radio, Select, Slider, Switch, Tag, Tree, Tooltip, message, Spin } from 'antd'
import type { TreeDataNode } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, TeamOutlined,
  FundOutlined, PoweroffOutlined,
} from '@ant-design/icons'
import { fetchModels, fetchDeptOptions, type AiModel, type DeptOption } from '../../../api'
import { fetchDeptQuotaDetail, saveDeptQuota, type DeptQuotaRequest,
  type QuotaPeriod, type QuotaType, type OverLimitAction, type AllocateMode, type Currency } from '../../../api/deptQuota'
import {
  buildDeptTree,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL,
  ALLOCATE_MODE_LABEL,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
} from './deptQuotaStore'

/** 格式化時間為 YYYY-MM-DD HH:mm:ss */
const nowText = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

/**
 * 部門額度 — 新增 / 編輯獨立頁（參考部門模型權控，取消彈窗）
 * 分區：基础信息 → 適用部門（樹狀穿梭框） → 額度配置（分配方式/周期/類型/限額/軟提醒/超額動作） → 狀態配置
 * 路由：/ai-dept-quota-edit（新增）、/ai-dept-quota-edit?id=xxx（編輯）
 */
export default function DeptQuotaEdit() {
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
              message.error('額度策略不存在或已刪除')
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
              status: policy.status,
            })
            setSelectedDeptIds(policy.deptIds)
          }).catch(() => { message.error('加載詳情失敗') })
        }
      })
      .catch(() => { if (!cancelled) message.error('加載數據失敗') })
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

  /** 限額值輸入框單位後綴 */
  const valueUnit = useMemo(() => {
    if (!quotaType) return ''
    if (quotaType === 'cost') return currency === 'USD' ? 'USD' : 'CNY'
    return QUOTA_TYPE_UNIT[quotaType]
  }, [quotaType, currency])

  /** 限額文案（含幣種符號 / 單位） */
  const fmtQuota = (val: number, qt: QuotaType, cur: Currency): string => {
    if (qt === 'cost') return `${CURRENCY_SYMBOL[cur]}${val.toLocaleString()}`
    return `${val.toLocaleString()} ${QUOTA_TYPE_UNIT[qt]}`.trim()
  }

  /** 降級目標模型下拉（僅超額動作=自動降級時使用） */
  const modelOptions = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.name })),
    [models],
  )

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (selectedDeptIds.length === 0) {
      message.warning('請至少選擇一個部門')
      return
    }
    if (values.overLimitAction === 'downgrade' && !values.downgradeModelId) {
      message.warning('超額動作為「自動降級」時，請選擇降級目標模型')
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
        status: (values.status ?? 1) as number,
      }
      await saveDeptQuota(payload)
      message.success(isEdit ? '額度策略已更新' : '額度策略已創建')
      navigate('/ai-dept-quota')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-dept-quota')

  if (loading && !deptOptions.length && !isEdit) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  /* ── 實時額度解讀（提升可理解性） ── */
  const deptLabel = selectedDeptIds.length
    ? deptOptions.filter((d) => selectedDeptIds.includes(d.deptId)).map((d) => d.deptName).join('、')
    : '（尚未選擇部門）'
  const quotaReadable = quotaValue && quotaType && period
    ? (allocateMode === 'per_capita'
        ? `每人獨立 ${fmtQuota(quotaValue, quotaType, currency ?? 'CNY')} / ${QUOTA_PERIOD_LABEL[period]}，${selectedEmployeeCount} 人合計上限 ${fmtQuota(quotaValue * selectedEmployeeCount, quotaType, currency ?? 'CNY')}`
        : `${selectedEmployeeCount} 人共享 ${fmtQuota(quotaValue, quotaType, currency ?? 'CNY')} / ${QUOTA_PERIOD_LABEL[period]}`)
    : '（請完善限額類型、周期與限額值）'

  return (
    <div className="content-area">
      {/* 頁面頭部（全局統一：橙色頂條 + 橙色返回按鈕） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯部門額度' : '新增部門額度'}
            </h2>
          </div>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          allocateMode: 'total', period: 'monthly', quotaType: 'token',
          currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1,
        }}
      >
        {/* ═══ 分区 1：基础信息 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="策略名稱" rules={[{ required: true, message: '請輸入策略名稱' }]}>
              <Input placeholder="如：研發部月度 Token 總額" maxLength={50} allowClear />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input placeholder="請輸入策略用途說明（選填）" maxLength={200} allowClear />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：适用部门（树状 + 编码 + 编码搜索） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用部門</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>穿梭框 · 樹結構</Tag>
            <Tooltip title="一條額度策略可關聯多個部門，共享同一套限額規則；重名部門可通過層級與編碼區分">
              <span style={{ fontSize: 12, color: '#8C8C8C', cursor: 'help' }}>穿梭框 · 含編碼</span>
            </Tooltip>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 穿梭框：左側樹結構 + 右側已選列表 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左側：部門樹 */}
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 360 }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>可選部門（{deptOptions.length}）</span>
                <a onClick={() => {
                  // 全选：将所有未入选的部门加入勾选
                  const unchecked = deptOptions.map((d) => d.deptId).filter((id) => !selectedDeptIds.includes(id))
                  setCheckedDeptIds(unchecked)
                }} style={{ fontSize: 12 }}>全選</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Input placeholder="搜索部門名稱或編碼" allowClear size="small" value={deptSearchKw} onChange={(e) => setDeptSearchKw(e.target.value)} />
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
                    message.warning('所選部門已添加，無需重複添加')
                    setCheckedDeptIds([])
                    return
                  }
                  const skipped = checkedDeptIds.length - newIds.length
                  setSelectedDeptIds((prev) => [...new Set([...prev, ...newIds])])
                  setCheckedDeptIds([])
                  if (skipped > 0) message.warning(`已跳過 ${skipped} 個已添加的部門`)
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
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>已選部門（{selectedDeptIds.length}）</span>
                <a onClick={() => setSelectedDeptIds([])} style={{ fontSize: 12 }}>清空</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedDeptIds.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>請從左側選擇部門</div>
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
                共 <strong>{selectedDeptIds.length}</strong> 個部門，<strong>{selectedEmployeeCount}</strong> 人
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 3：额度配置（核心） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FundOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>額度配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>核心</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>網關在每次請求前校驗用量，按此規則限制與提醒</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 額度分配方式 */}
          <Form.Item name="allocateMode" label="額度分配方式" rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['total', 'per_capita'] as AllocateMode[]).map((mode) => {
                  const active = allocateMode === mode
                  const desc = mode === 'total'
                    ? '所選部門全體員工共用一個額度池，適合統一預算管控'
                    : '每位員工獨立享有等額額度，防止個別員工超支'
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

          {/* 限額周期 + 限額類型 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="period" label="限額周期" rules={[{ required: true }]} extra="週期結束自動重置用量（如按月則每月 1 日歸零）">
              <Radio.Group optionType="button" buttonStyle="solid"
                options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label="限額類型" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>

          {/* 限額值 + 軟限額提醒閾值（並排展示） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="quotaValue" label="限額值" rules={[{ required: true, message: '請輸入限額值' }]}>
              <InputNumber<number>
                min={1}
                style={{ width: '100%' }}
                placeholder={quotaType === 'cost' ? '如：600' : quotaType === 'request' ? '如：5000' : '如：200000000'}
                addonAfter={valueUnit}
                formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(`${v ?? ''}`.replace(/,/g, ''))}
              />
            </Form.Item>
            <Form.Item
              name="softThreshold"
              label={<span>軟限額提醒閾值 <span style={{ color: '#8C8C8C', fontWeight: 400, fontSize: 12 }}>（達此比例時通知，不阻斷）</span></span>}
            >
              <Slider min={10} max={100} step={5} marks={{ 50: '50%', 80: '80%', 100: '100%' }}
                tooltip={{ formatter: (v) => `${v}%` }} />
            </Form.Item>
          </div>

          {/* 計價幣種（僅費用類型時） */}
          {quotaType === 'cost' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Form.Item name="currency" label="計價幣種" rules={[{ required: true }]}>
                <Select options={CURRENCY_OPTIONS} />
              </Form.Item>
            </div>
          )}

          {/* 超額動作 */}
          <Form.Item name="overLimitAction" label="超出限額後動作" rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {(['reject', 'approve', 'downgrade'] as OverLimitAction[]).map((act) => {
                  const active = overLimitAction === act
                  const desc = act === 'reject' ? '直接攔截並返回配額不足'
                    : act === 'approve' ? '轉主管審批，可臨時提額'
                    : '自動切換到更輕量 / 便宜的模型'
                  return (
                    <label key={act} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                      padding: '12px 14px', borderRadius: 8,
                      border: `1px solid ${active ? '#E8720C' : '#e8eaed'}`,
                      background: active ? '#FFF7E6' : '#fff', transition: 'all 0.2s',
                    }}>
                      <Radio value={act} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{OVER_LIMIT_ACTION_LABEL[act]}</div>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </Radio.Group>
          </Form.Item>

          {/* 降級目標模型（僅自動降級時） */}
          {overLimitAction === 'downgrade' && (
            <Form.Item name="downgradeModelId" label="降級目標模型" rules={[{ required: true, message: '請選擇降級目標模型' }]}
              extra="超出限額後，該部門請求自動路由到此模型（通常為更輕量 / 更便宜的模型）">
              <Select showSearch optionFilterProp="label" placeholder="選擇降級後使用的模型" options={modelOptions} />
            </Form.Item>
          )}

          {/* 實時額度解讀 */}
          <div style={{
            marginTop: 4, padding: '14px 16px', borderRadius: 8,
            background: 'linear-gradient(135deg, #FFF7E6, #FFFBF0)', border: '1px solid #FFE7BA',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#E8720C', marginBottom: 8 }}>額度解讀（實時）</div>
            <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.9 }}>
              <div>· 適用：<strong style={{ color: '#262626' }}>{deptLabel}</strong></div>
              <div>· 額度：{quotaReadable}</div>
              <div>· 提醒：用量達 <strong style={{ color: '#FAAD14' }}>{softThreshold ?? 80}%</strong> 時通知員工與主管（不阻斷）</div>
              <div>· 超額：<strong style={{ color: '#FF4D4F' }}>{OVER_LIMIT_ACTION_LABEL[overLimitAction ?? 'reject']}</strong>
                {overLimitAction === 'downgrade' ? '到更輕量模型' : ''}</div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 4：状态配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>状态配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
            <Form.Item
              name="status"
              label="啟用狀態"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 1 : 0}
              getValueProps={(value) => ({ checked: value === 1 })}
              style={{ marginBottom: 0 }}
              extra="停用後該策略關聯的部門員工不再受此限額約束"
            >
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 底部操作按鈕（全局統一：取消 + 保存） */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  )
}
