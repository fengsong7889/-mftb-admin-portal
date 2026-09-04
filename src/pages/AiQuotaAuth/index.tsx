import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  fetchMockProviders,
  fetchMockModels,
  fetchMockDeptAuths,
  fetchMockEmployeeOverrides,
  fetchMockQuotaPolicies,
  fetchMockRouteStrategies,
  fetchMockAccountWhitelists,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  OVER_LIMIT_ACTION_LABEL,
  QUOTA_SCOPE_LABEL,
  PROVIDER_TYPE_LABEL,
  CURRENCY_SYMBOL,
  contextLengthText,
} from '../../api/mock/aiPlatformMock'
import type {
  AiProvider,
  AiModel,
  DeptModelAuth,
  EmployeeModelOverride,
  QuotaPolicy,
  RouteStrategy,
  AccountWhitelist,
  QuotaPeriod,
  QuotaType,
  OverLimitAction,
  QuotaScopeType,
  ProviderType,
} from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/* ────────────────── 展示常量 ────────────────── */

/** 超限動作 Tag 顏色 */
const OVER_LIMIT_TAG: Record<OverLimitAction, string> = { reject: 'error', approve: 'purple', downgrade: 'processing' }

/** 額度策略表單值 */
interface QuotaFormValues {
  name: string
  scopeType: QuotaScopeType
  scopeName: string
  period: QuotaPeriod
  quotaType: QuotaType
  quotaValue: number
  currency: 'CNY' | 'USD'
  softThreshold: number
  overLimitAction: OverLimitAction
  downgradeModelId?: string | null
}

export default function AiQuotaAuth() {
  /* ── 基礎數據 ── */
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [models, setModels] = useState<AiModel[]>([])
  const [deptAuths, setDeptAuths] = useState<DeptModelAuth[]>([])
  const [overrides, setOverrides] = useState<EmployeeModelOverride[]>([])
  const [policies, setPolicies] = useState<QuotaPolicy[]>([])
  const [strategies, setStrategies] = useState<RouteStrategy[]>([])
  const [whitelists, setWhitelists] = useState<AccountWhitelist[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchMockProviders(),
      fetchMockModels(),
      fetchMockDeptAuths(),
      fetchMockEmployeeOverrides(),
      fetchMockQuotaPolicies(),
      fetchMockRouteStrategies(),
      fetchMockAccountWhitelists(),
    ]).then(([p, m, d, e, q, s, w]) => {
      if (cancelled) return
      setProviders(p)
      setModels(m)
      setDeptAuths(d)
      setOverrides(e)
      setPolicies(q)
      setStrategies(s)
      setWhitelists(w)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 顯示名 */
  const modelName = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[m.id] = m.displayName })
    return map
  }, [models])

  /** 模型 id → 供應商類型（用於「數據不出域」部門僅可勾選私有化模型的提示） */
  const modelProviderType = useMemo(() => {
    const map: Record<string, ProviderType> = {}
    providers.forEach((p) => { models.filter((m) => m.providerId === p.id).forEach((m) => { map[m.id] = p.type }) })
    return map
  }, [providers, models])

  /* ── Tab1: 部門模型授權 ── */
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [draftModelIds, setDraftModelIds] = useState<string[]>([])
  const [draftResidency, setDraftResidency] = useState(false)

  useEffect(() => {
    if (selectedDeptId) {
      const dept = deptAuths.find((d) => d.deptId === selectedDeptId)
      setDraftModelIds(dept ? [...dept.modelIds] : [])
      setDraftResidency(dept?.dataResidency ?? false)
    }
  }, [selectedDeptId, deptAuths])

  const handleDeptAuthSave = () => {
    if (!selectedDeptId) return
    const dept = deptAuths.find((d) => d.deptId === selectedDeptId)
    if (!dept) return
    // 數據不出域校驗：僅可勾選私有化模型
    if (draftResidency && draftModelIds.some((id) => modelProviderType[id] !== 'private')) {
      message.warning('該部門開啟了「數據不出域」，僅可勾選私有化部署的模型')
      return
    }
    setDeptAuths((prev) => prev.map((d) => (d.deptId === selectedDeptId ? { ...d, modelIds: [...draftModelIds], dataResidency: draftResidency } : d)))
    message.success(`${dept.deptName} 的模型授權已保存，模型選擇器將實時同步該部門員工可見的模型`)
  }

  /* ── Tab1: 員工覆蓋 ── */
  const [editingOverride, setEditingOverride] = useState<EmployeeModelOverride | null>(null)
  const [overrideForm] = Form.useForm()

  const handleOverrideEdit = (row: EmployeeModelOverride) => {
    setEditingOverride(row)
    overrideForm.setFieldsValue({ username: row.username, extraModelIds: row.extraModelIds, remark: row.remark })
  }

  const handleOverrideSave = () => {
    overrideForm.validateFields().then((values) => {
      setOverrides((prev) => prev.map((o) => (o.username === editingOverride?.username ? { ...o, ...values } : o)))
      setEditingOverride(null)
      message.success('員工額外授權已保存（在部門授權基礎上追加）')
    })
  }

  /* ── Tab2: 額度策略 ── */
  const [editingPolicy, setEditingPolicy] = useState<QuotaPolicy | 'new' | null>(null)
  const [policyForm] = Form.useForm()
  const [policyQuery, setPolicyQuery] = useState('')

  const openPolicyForm = (policy: QuotaPolicy | 'new') => {
    setEditingPolicy(policy)
    if (policy === 'new') {
      policyForm.resetFields()
    } else {
      policyForm.setFieldsValue({
        name: policy.name,
        scopeType: policy.scopeType,
        scopeName: policy.scopeName,
        period: policy.period,
        quotaType: policy.quotaType,
        quotaValue: policy.quotaValue,
        currency: policy.currency,
        softThreshold: policy.softThreshold,
        overLimitAction: policy.overLimitAction,
        downgradeModelId: policy.downgradeModelId,
      })
    }
  }

  const handlePolicySave = () => {
    policyForm.validateFields().then((values) => {
      const payload = { ...values } as QuotaFormValues
      if (editingPolicy === 'new') {
        setPolicies((prev) => [...prev, { id: `p${Date.now()}`, status: 1, downgradeModelId: payload.overLimitAction === 'downgrade' ? (payload.downgradeModelId ?? null) : null, ...payload }])
      } else if (editingPolicy) {
        setPolicies((prev) => prev.map((p) => (p.id === editingPolicy.id ? { ...p, ...payload, downgradeModelId: payload.overLimitAction === 'downgrade' ? (payload.downgradeModelId ?? null) : null } : p)))
      }
      setEditingPolicy(null)
      message.success('額度策略已保存，網關將在每次請求前檢查額度')
    })
  }

  const handlePolicyDelete = (row: QuotaPolicy) => {
    Modal.confirm({
      title: '確認刪除該額度策略？',
      content: `刪除後「${row.name}」立即失效，關聯的員工不再受限額約束。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setPolicies((prev) => prev.filter((p) => p.id !== row.id))
        message.success('策略已刪除')
      },
    })
  }

  /* ── 列字段配置（員工覆蓋） ── */
  const overrideColumnMeta = [
    { key: 'employee', title: '員工' },
    { key: 'deptName', title: '部門' },
    { key: 'extraModelIds', title: '額外授權模型' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent: overrideConfigComponent } = useColumnConfig('ai-quota-auth-override', overrideColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 列字段配置（額度策略） ── */
  const policyColumnMeta = [
    { key: 'name', title: '策略名稱' },
    { key: 'scope', title: '適用範圍' },
    { key: 'period', title: '週期' },
    { key: 'quota', title: '限額' },
    { key: 'soft', title: '軟提醒' },
    { key: 'overLimitAction', title: '超額動作' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent: policyConfigComponent } = useColumnConfig('ai-quota-auth-policy', policyColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const handlePolicyToggle = (row: QuotaPolicy) => {
    setPolicies((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: p.status === 1 ? 0 : 1 } : p)))
  }

  const filteredPolicies = useMemo(() => policies.filter((p) => !policyQuery || p.name.toLowerCase().includes(policyQuery.toLowerCase())), [policies, policyQuery])

  /* ── Tab3: 路由策略 ── */
  const handleMoveModel = (strategyId: 'cost' | 'performance', modelId: string, dir: -1 | 1) => {
    setStrategies((prev) => prev.map((s) => {
      if (s.id !== strategyId) return s
      const pool = [...s.modelPool]
      const index = pool.indexOf(modelId)
      const target = index + dir
      if (index < 0 || target < 0 || target >= pool.length) return s
      ;[pool[index], pool[target]] = [pool[target], pool[index]]
      return { ...s, modelPool: pool }
    }))
  }

  const handleDefaultStrategy = (strategyId: 'cost' | 'performance') => {
    setStrategies((prev) => prev.map((s) => ({ ...s, isDefault: s.id === strategyId })))
    message.success('預設路由策略已更新，Auto 模式默認按該策略調度')
  }

  /* ── Tab4: 賬號白名單 ── */
  const handleWhitelistChange = (modelId: string, accounts: string[]) => {
    setWhitelists((prev) => prev.map((w) => (w.modelId === modelId ? { ...w, accounts } : w)))
    message.success('白名單已保存（空 = 全部賬號可用）')
  }

  /* ── 表格列 ── */
  const overrideColumns: ColumnsType<EmployeeModelOverride> = [
    { title: '員工', key: 'employee', width: 160, render: (_, row) => `${row.empName}（${row.empId}）` },
    { title: '部門', dataIndex: 'deptName', width: 100 },
    {
      title: '額外授權模型', dataIndex: 'extraModelIds', width: 280,
      render: (v: string[]) => (v.length ? v.map((id) => <Tag key={id} color="orange">{modelName[id] ?? id}</Tag>) : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: '備註', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleOverrideEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => { setOverrides((prev) => prev.filter((o) => o.username !== row.username)); message.success('已移除該員工的額外授權') }}>移除</Button>
        </>
      ),
    },
  ]

  const policyColumns: ColumnsType<QuotaPolicy> = [
    { title: '策略名稱', dataIndex: 'name', width: 170 },
    {
      title: '適用範圍', key: 'scope', width: 150,
      render: (_, row) => <span>{QUOTA_SCOPE_LABEL[row.scopeType]}{row.scopeType !== 'company' ? ` · ${row.scopeName}` : ''}</span>,
    },
    { title: '週期', dataIndex: 'period', width: 70, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    {
      title: '限額', key: 'quota', width: 160, align: 'right',
      render: (_, row) => {
        if (row.quotaType === 'cost') return `${CURRENCY_SYMBOL[row.currency]}${row.quotaValue.toLocaleString()} / ${QUOTA_PERIOD_LABEL[row.period]}`
        return `${row.quotaValue.toLocaleString()} ${QUOTA_TYPE_LABEL[row.quotaType]} / ${QUOTA_PERIOD_LABEL[row.period]}`
      },
    },
    { title: '軟提醒', key: 'soft', width: 90, align: 'center', render: (_, row) => `${row.softThreshold}%` },
    {
      title: '超額動作', dataIndex: 'overLimitAction', width: 110, align: 'center',
      render: (v: OverLimitAction, row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>
          {OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? row.downgradeModelId}` : ''}
        </Tag>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren="啟用" unCheckedChildren="停用" onChange={() => handlePolicyToggle(row)} />,
    },
    {
      title: '操作', key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => openPolicyForm(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handlePolicyDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      <Tabs
        defaultActiveKey="auth"
        items={[
          /* ── Tab1: 模型授權 ── */
          {
            key: 'auth',
            label: '模型授權',
            children: (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
                  {/* 部門列表 */}
                  <div style={{ border: '1px solid #F0F0F0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #F0F0F0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TeamOutlined style={{ color: '#E8720C' }} />部門
                    </div>
                    {deptAuths.map((d) => (
                      <div
                        key={d.deptId}
                        onClick={() => setSelectedDeptId(d.deptId)}
                        style={{
                          padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #F5F5F5',
                          background: selectedDeptId === d.deptId ? 'linear-gradient(135deg, rgba(232,114,12,0.10), rgba(232,114,12,0.04))' : 'transparent',
                          borderLeft: selectedDeptId === d.deptId ? '3px solid #E8720C' : '3px solid transparent',
                          transition: 'all 0.25s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{d.deptName}</span>
                          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{d.employeeCount} 人</span>
                        </div>
                        {d.dataResidency && <Tag color="purple" style={{ marginTop: 4 }}>數據不出域</Tag>}
                      </div>
                    ))}
                  </div>

                  {/* 授權矩陣 */}
                  <div style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 20, background: '#fff' }}>
                    {selectedDeptId ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{deptAuths.find((d) => d.deptId === selectedDeptId)?.deptName} · 可用模型</div>
                          <Button type="primary" onClick={handleDeptAuthSave}>保存</Button>
                        </div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Switch size="small" checked={draftResidency} onChange={setDraftResidency} />
                          <span style={{ fontSize: 13 }}>數據不出域（開啟後僅可勾選私有化部署模型，敏感數據不出企業內網）</span>
                        </div>
                        <Checkbox.Group
                          value={draftModelIds}
                          onChange={(values) => setDraftModelIds(values as string[])}
                          style={{ width: '100%' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
                            {models.map((m) => (
                              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid #F0F0F0', borderRadius: 6, cursor: 'pointer' }}>
                                <Checkbox value={m.id} disabled={draftResidency && modelProviderType[m.id] !== 'private'} />
                                <span>
                                  <span style={{ fontWeight: 500 }}>{m.displayName}</span>
                                  <span style={{ fontSize: 11, color: '#8C8C8C', marginLeft: 6 }}>
                                    {PROVIDER_TYPE_LABEL[modelProviderType[m.id]]} · {contextLengthText(m.contextLength)} 上下文
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </Checkbox.Group>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12 }}>
                          部門授權為該部門員工的基礎權限；個別員工可在下方「員工覆蓋」中追加授權。模型選擇器僅展示已授權模型。
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '60px 0', textAlign: 'center', color: '#8C8C8C' }}>請選擇左側部門配置可用模型</div>
                    )}
                  </div>
                </div>

                {/* 員工覆蓋 */}
                <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', margin: '24px 0 12px' }}>員工覆蓋（額外授權）</div>
                <div className="action-section">
                  <div className="action-section-right">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('新增員工覆蓋將在後端網關落地後正式支持，當前為介面演示')}>新增</Button>
                    {overrideConfigComponent}
                  </div>
                </div>
                <Table rowKey="username" size="middle" loading={loading} columns={overrideColumns} dataSource={overrides} pagination={false} />
              </>
            ),
          },

          /* ── Tab2: 額度策略 ── */
          {
            key: 'quota',
            label: '額度策略',
            children: (
              <>
                <div className="search-section">
                  <Form layout="inline">
                    <Form.Item label="策略名稱">
                      <Input value={policyQuery} placeholder="請輸入策略名稱" allowClear onChange={(e) => setPolicyQuery(e.target.value)} />
                    </Form.Item>
                    <Form.Item>
                      <div className="search-actions">
                        <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
                        <Button icon={<ReloadOutlined />} onClick={() => setPolicyQuery('')}>重置</Button>
                      </div>
                    </Form.Item>
                  </Form>
                </div>
                <div className="action-section">
                  <div className="action-section-right">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openPolicyForm('new')}>新增</Button>
                    {policyConfigComponent}
                  </div>
                </div>
                <Table rowKey="id" size="middle" loading={loading} columns={policyColumns} dataSource={filteredPolicies} pagination={false} />
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12 }}>
                  額度由網關在每次請求前檢查（員工級與部門級同時生效，先到先限）；達到軟提醒閾值時通知員工與主管。
                </div>
              </>
            ),
          },

          /* ── Tab3: 路由策略 ── */
          {
            key: 'route',
            label: '路由策略',
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Auto 路由策略"
                  description="「智能路由」在員工已授權的模型範圍內按以下模型池順序調度；故障時自動切換到池內下一個模型並記錄切換日誌。"
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {strategies.map((s) => (
                    <div key={s.id} style={{ border: `1px solid ${s.isDefault ? '#E8720C55' : '#F0F0F0'}`, borderRadius: 8, padding: 20, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>
                          {s.name}
                          {s.isDefault && <Tag color="orange" style={{ marginLeft: 8 }}>預設</Tag>}
                        </div>
                        <Radio checked={s.isDefault} onChange={() => handleDefaultStrategy(s.id as 'cost' | 'performance')}>設為預設</Radio>
                      </div>
                      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>{s.desc}</div>
                      {s.modelPool.map((modelId, index) => (
                        <div key={modelId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: index === 0 ? '#FFF7E6' : '#FAFAFA', borderRadius: 6, marginBottom: 8 }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: index === 0 ? '#E8720C' : '#D9D9D9', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{index + 1}</span>
                          <span style={{ flex: 1 }}>{modelName[modelId] ?? modelId}</span>
                          <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => handleMoveModel(s.id as 'cost' | 'performance', modelId, -1)} />
                          <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === s.modelPool.length - 1} onClick={() => handleMoveModel(s.id as 'cost' | 'performance', modelId, 1)} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ),
          },

          /* ── Tab4: 賬號白名單 ── */
          {
            key: 'whitelist',
            label: '賬號白名單',
            children: (
              <>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="兜底白名單（過渡期保留）"
                  description="白名單為全賬號權限的最後一道閘門（空 = 全部賬號可用），由網關以登錄 JWT 服務端判定，防冒名。後端網關遷移完成後，本頁將接管「能耗管控」中的白名單配置，舊頁面隨之下線。"
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {whitelists.map((w) => (
                    <div key={w.modelId} style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 20, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{modelName[w.modelId] ?? w.modelId}</div>
                        <Tag color={w.accounts.length ? 'warning' : 'success'}>{w.accounts.length ? `限 ${w.accounts.length} 個賬號` : '全部賬號可用'}</Tag>
                      </div>
                      <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="輸入賬號後回車添加，留空表示全部賬號可用"
                        value={w.accounts}
                        onChange={(values) => handleWhitelistChange(w.modelId, values)}
                        open={false}
                        suffixIcon={<UserOutlined />}
                      />
                    </div>
                  ))}
                </div>
              </>
            ),
          },
        ]}
      />

      {/* 員工覆蓋編輯彈窗 */}
      <Modal
        title="編輯員工額外授權"
        open={editingOverride !== null}
        onOk={handleOverrideSave}
        onCancel={() => setEditingOverride(null)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={overrideForm} layout="vertical">
          <Form.Item name="username" label="賬號">
            <Input disabled />
          </Form.Item>
          <Form.Item name="extraModelIds" label="額外授權模型（在部門授權基礎上追加）">
            <Select
              mode="multiple"
              placeholder="請選擇模型"
              allowClear
              options={models.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="備註">
            <Input placeholder="請輸入備註" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 額度策略新增/編輯彈窗 */}
      <Modal
        title={editingPolicy === 'new' ? '新增額度策略' : '編輯額度策略'}
        open={editingPolicy !== null}
        onOk={handlePolicySave}
        onCancel={() => setEditingPolicy(null)}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnHidden
      >
        <Form form={policyForm} layout="vertical" initialValues={{ scopeType: 'company', period: 'daily', quotaType: 'token', currency: 'CNY', softThreshold: 80, overLimitAction: 'reject' }}>
          <Form.Item name="name" label="策略名稱" rules={[{ required: true, message: '請輸入策略名稱' }]}>
            <Input placeholder="如：普通員工日限額" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="scopeType" label="適用範圍類型" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.scopeType !== cur.scopeType}
            >
              {({ getFieldValue }) => getFieldValue('scopeType') === 'company' ? (
                <Form.Item label="適用對象"><Input disabled value="全員" /></Form.Item>
              ) : (
                <Form.Item name="scopeName" label="適用對象" rules={[{ required: true, message: '請輸入部門或員工' }]}>
                  <Input placeholder={getFieldValue('scopeType') === 'dept' ? '如：運營部' : '如：陳偉、劉陽等 5 人'} />
                </Form.Item>
              )}
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="限額週期" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label="限額類型" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="quotaValue" label="限額值" rules={[{ required: true, message: '請輸入限額值' }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.quotaType !== cur.quotaType}
            >
              {({ getFieldValue }) => getFieldValue('quotaType') === 'cost' ? (
                <Form.Item name="currency" label="計價幣種" rules={[{ required: true }]}>
                  <Select options={[{ value: 'CNY', label: 'CNY（人民幣）' }, { value: 'USD', label: 'USD（美元）' }]} />
                </Form.Item>
              ) : (
                <Form.Item label="軟提醒閾值（%）"><Input disabled value="見下方" /></Form.Item>
              )}
            </Form.Item>
          </div>
          <Form.Item name="softThreshold" label="軟限額提醒閾值（達到後通知員工與主管）" rules={[{ required: true }]}>
            <Radio.Group options={[{ value: 60, label: '60%' }, { value: 80, label: '80%' }, { value: 90, label: '90%' }]} />
          </Form.Item>
          <Form.Item name="overLimitAction" label="超額後動作" rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Radio value="reject">拒絕請求：直接提示「額度已用完」</Radio>
                <Radio value="approve">進入審批：員工可申請臨時提升額度，主管審批</Radio>
                <Radio value="downgrade">自動降級：切換到更便宜的模型繼續對話</Radio>
              </div>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.overLimitAction !== cur.overLimitAction}
          >
            {({ getFieldValue }) => getFieldValue('overLimitAction') === 'downgrade' ? (
              <Form.Item name="downgradeModelId" label="降級目標模型" rules={[{ required: true, message: '請選擇降級目標模型' }]}>
                <Select placeholder="請選擇降級目標模型" options={models.map((m) => ({ value: m.id, label: m.displayName }))} />
              </Form.Item>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
