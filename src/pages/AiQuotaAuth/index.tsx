import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  Space,
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
  downgradeExemptQuota?: number | null
}

export default function AiQuotaAuth() {
  const { t } = useTranslation()
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
      message.warning(t('aiQuotaAuth.dataResidencyWarning'))
      return
    }
    setDeptAuths((prev) => prev.map((d) => (d.deptId === selectedDeptId ? { ...d, modelIds: [...draftModelIds], dataResidency: draftResidency } : d)))
    message.success(t('aiQuotaAuth.deptAuthSaved', { name: dept.deptName }))
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
      message.success(t('aiQuotaAuth.overrideSaved'))
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
        downgradeExemptQuota: policy.downgradeExemptQuota,
      })
    }
  }

  const handlePolicySave = () => {
    policyForm.validateFields().then((values) => {
      const payload = { ...values } as QuotaFormValues
      if (editingPolicy === 'new') {
        setPolicies((prev) => [...prev, { id: `p${Date.now()}`, status: 1, downgradeModelId: payload.overLimitAction === 'downgrade' ? (payload.downgradeModelId ?? null) : null, downgradeExemptQuota: payload.overLimitAction === 'downgrade' ? (payload.downgradeExemptQuota ?? null) : null, ...payload }])
      } else if (editingPolicy) {
        setPolicies((prev) => prev.map((p) => (p.id === editingPolicy.id ? { ...p, ...payload, downgradeModelId: payload.overLimitAction === 'downgrade' ? (payload.downgradeModelId ?? null) : null, downgradeExemptQuota: payload.overLimitAction === 'downgrade' ? (payload.downgradeExemptQuota ?? null) : null } : p)))
      }
      setEditingPolicy(null)
      message.success(t('aiQuotaAuth.quotaSaved'))
    })
  }

  const handlePolicyDelete = (row: QuotaPolicy) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeletePolicy'),
      content: t('aiQuotaAuth.deletePolicyContent', { name: row.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setPolicies((prev) => prev.filter((p) => p.id !== row.id))
        message.success(t('aiQuotaAuth.strategyDeleted'))
      },
    })
  }

  /* ── 列字段配置（員工覆蓋） ── */
  const overrideColumnMeta = [
    { key: 'employee', title: t('aiQuotaAuth.employeeCol') },
    { key: 'deptName', title: t('aiQuotaAuth.deptLabel') },
    { key: 'extraModelIds', title: t('aiQuotaAuth.extraAuthModelsCol') },
    { key: 'remark', title: t('aiQuotaAuth.remarkCol') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent: overrideConfigComponent } = useColumnConfig('ai-quota-auth-override', overrideColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 列字段配置（額度策略） ── */
  const policyColumnMeta = [
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'scope', title: t('aiQuotaAuth.scopeCol') },
    { key: 'period', title: t('aiQuotaAuth.periodShortCol') },
    { key: 'quota', title: t('aiQuotaAuth.quotaShortCol') },
    { key: 'soft', title: t('aiQuotaAuth.softAlertCol') },
    { key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'action', title: t('common.action') },
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
    message.success(t('aiQuotaAuth.routeUpdated'))
  }

  /* ── Tab4: 賬號白名單 ── */
  const handleWhitelistChange = (modelId: string, accounts: string[]) => {
    setWhitelists((prev) => prev.map((w) => (w.modelId === modelId ? { ...w, accounts } : w)))
    message.success(t('aiQuotaAuth.whitelistSaved'))
  }

  /* ── 表格列 ── */
  const overrideColumns: ColumnsType<EmployeeModelOverride> = [
    { title: t('aiQuotaAuth.employeeCol'), key: 'employee', width: 160, render: (_, row) => `${row.empName}（${row.empId}）` },
    { title: t('aiQuotaAuth.deptLabel'), dataIndex: 'deptName', width: 100 },
    {
      title: t('aiQuotaAuth.extraAuthModelsCol'), dataIndex: 'extraModelIds', width: 280,
      render: (v: string[]) => (v.length ? v.map((id) => <Tag key={id} color="orange">{modelName[id] ?? id}</Tag>) : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: t('aiQuotaAuth.remarkCol'), dataIndex: 'remark', ellipsis: true },
    {
      title: t('common.action'), key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleOverrideEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => { setOverrides((prev) => prev.filter((o) => o.username !== row.username)); message.success(t('aiQuotaAuth.overrideRemoved')) }}>{t('common.remove')}</Button>
        </Space>
      ),
    },
  ]

  const policyColumns: ColumnsType<QuotaPolicy> = [
    { title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 170 },
    {
      title: t('aiQuotaAuth.scopeCol'), key: 'scope', width: 150,
      render: (_, row) => <span>{QUOTA_SCOPE_LABEL[row.scopeType]}{row.scopeType !== 'company' ? ` · ${row.scopeName}` : ''}</span>,
    },
    { title: t('aiQuotaAuth.periodShortCol'), dataIndex: 'period', width: 70, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    {
      title: t('aiQuotaAuth.quotaShortCol'), key: 'quota', width: 160, align: 'right',
      render: (_, row) => {
        if (row.quotaType === 'cost') return `${CURRENCY_SYMBOL[row.currency]}${row.quotaValue.toLocaleString()} / ${QUOTA_PERIOD_LABEL[row.period]}`
        return `${row.quotaValue.toLocaleString()} ${QUOTA_TYPE_LABEL[row.quotaType]} / ${QUOTA_PERIOD_LABEL[row.period]}`
      },
    },
    { title: t('aiQuotaAuth.softAlertCol'), key: 'soft', width: 90, align: 'center', render: (_, row) => `${row.softThreshold}%` },
    {
      title: t('aiQuotaAuth.overLimitCol'), dataIndex: 'overLimitAction', width: 110, align: 'center',
      render: (v: OverLimitAction, row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>
          {OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? row.downgradeModelId}` : ''}
        </Tag>
      ),
    },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} onChange={() => handlePolicyToggle(row)} />,
    },
    {
      title: t('common.action'), key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => openPolicyForm(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handlePolicyDelete(row)}>{t('common.delete')}</Button>
        </Space>
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
            label: t('aiQuotaAuth.modelAuthTab'),
            children: (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
                  {/* 部門列表 */}
                  <div style={{ border: '1px solid #F0F0F0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #F0F0F0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TeamOutlined style={{ color: '#E8720C' }} />{t('aiQuotaAuth.deptLabel')}
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
                          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('aiQuotaAuth.personCount', { count: d.employeeCount })}</span>
                        </div>
                        {d.dataResidency && <Tag color="purple" style={{ marginTop: 4 }}>{t('aiQuotaAuth.dataResidencyTag')}</Tag>}
                      </div>
                    ))}
                  </div>

                  {/* 授權矩陣 */}
                  <div style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 20, background: '#fff' }}>
                    {selectedDeptId ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{deptAuths.find((d) => d.deptId === selectedDeptId)?.deptName} · {t('aiQuotaAuth.availableModels')}</div>
                          <Button type="primary" onClick={handleDeptAuthSave}>{t('common.save')}</Button>
                        </div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Switch size="small" checked={draftResidency} onChange={setDraftResidency} />
                          <span style={{ fontSize: 13 }}>{t('aiQuotaAuth.dataResidencyHint')}</span>
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
                                    {PROVIDER_TYPE_LABEL[modelProviderType[m.id]]} · {contextLengthText(m.contextLength)} {t('aiQuotaAuth.contextSuffix')}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </Checkbox.Group>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12 }}>
                          {t('aiQuotaAuth.deptAuthNote')}
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '60px 0', textAlign: 'center', color: '#8C8C8C' }}>{t('aiQuotaAuth.selectDeptHint')}</div>
                    )}
                  </div>
                </div>

                {/* 員工覆蓋 */}
                <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', margin: '24px 0 12px' }}>{t('aiQuotaAuth.overrideSectionTitle')}</div>
                <div className="action-section">
                  <div className="action-section-right">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info(t('aiQuotaAuth.newOverrideHint'))}>{t('common.add')}</Button>
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
            label: t('aiQuotaAuth.quotaStrategyTab'),
            children: (
              <>
                <div className="search-section">
                  <Form layout="inline">
                    <Form.Item label={t('aiQuotaAuth.strategyNameCol')}>
                      <Input value={policyQuery} placeholder={t('aiQuotaAuth.strategyNamePh')} allowClear onChange={(e) => setPolicyQuery(e.target.value)} />
                    </Form.Item>
                    <Form.Item>
                      <div className="search-actions">
                        <Button type="primary" icon={<SearchOutlined />}>{t('common.query')}</Button>
                        <Button icon={<ReloadOutlined />} onClick={() => setPolicyQuery('')}>{t('common.reset')}</Button>
                      </div>
                    </Form.Item>
                  </Form>
                </div>
                <div className="action-section">
                  <div className="action-section-right">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openPolicyForm('new')}>{t('common.add')}</Button>
                    {policyConfigComponent}
                  </div>
                </div>
                <Table rowKey="id" size="middle" loading={loading} columns={policyColumns} dataSource={filteredPolicies} pagination={false} />
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12 }}>
                  {t('aiQuotaAuth.quotaPolicyNote')}
                </div>
              </>
            ),
          },

          /* ── Tab3: 路由策略 ── */
          {
            key: 'route',
            label: t('aiQuotaAuth.routeTab'),
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={t('aiQuotaAuth.autoRouteAlert')}
                  description={t('aiQuotaAuth.autoRouteDesc')}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {strategies.map((s) => (
                    <div key={s.id} style={{ border: `1px solid ${s.isDefault ? '#E8720C55' : '#F0F0F0'}`, borderRadius: 8, padding: 20, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>
                          {s.name}
                          {s.isDefault && <Tag color="orange" style={{ marginLeft: 8 }}>{t('aiQuotaAuth.defaultTag')}</Tag>}
                        </div>
                        <Radio checked={s.isDefault} onChange={() => handleDefaultStrategy(s.id as 'cost' | 'performance')}>{t('aiQuotaAuth.setDefaultBtn')}</Radio>
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
            label: t('aiQuotaAuth.whitelistTab'),
            children: (
              <>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={t('aiQuotaAuth.whitelistAlertTitle')}
                  description={t('aiQuotaAuth.whitelistAlertDesc')}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {whitelists.map((w) => (
                    <div key={w.modelId} style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 20, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{modelName[w.modelId] ?? w.modelId}</div>
                        <Tag color={w.accounts.length ? 'warning' : 'success'}>{w.accounts.length ? t('aiQuotaAuth.limitedAccounts', { count: w.accounts.length }) : t('aiQuotaAuth.allAccountsAvailable')}</Tag>
                      </div>
                      <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder={t('aiQuotaAuth.whitelistPlaceholder')}
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
        title={t('aiQuotaAuth.editOverrideTitle')}
        open={editingOverride !== null}
        onOk={handleOverrideSave}
        onCancel={() => setEditingOverride(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={overrideForm} layout="vertical">
          <Form.Item name="username" label={t('aiQuotaAuth.accountLabel')}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="extraModelIds" label={t('aiQuotaAuth.extraAuthLabel')}>
            <Select
              mode="multiple"
              placeholder={t('aiQuotaAuth.selectModelPh')}
              allowClear
              options={models.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </Form.Item>
          <Form.Item name="remark" label={t('aiQuotaAuth.remarkCol')}>
            <Input placeholder={t('aiQuotaAuth.remarkPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 額度策略新增/編輯彈窗 */}
      <Modal
        title={editingPolicy === 'new' ? t('aiQuotaAuth.addQuotaStrategy') : t('aiQuotaAuth.editQuotaStrategy')}
        open={editingPolicy !== null}
        onOk={handlePolicySave}
        onCancel={() => setEditingPolicy(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
        destroyOnHidden
      >
        <Form form={policyForm} layout="vertical" initialValues={{ scopeType: 'company', period: 'daily', quotaType: 'token', currency: 'CNY', softThreshold: 80, overLimitAction: 'reject' }}>
          <Form.Item name="name" label={t('aiQuotaAuth.strategyNameCol')} rules={[{ required: true, message: t('aiQuotaAuth.strategyNamePh') }]}>
            <Input placeholder={t('aiQuotaAuth.strategyNameExample')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="scopeType" label={t('aiQuotaAuth.scopeTypeLabel')} rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.scopeType !== cur.scopeType}
            >
              {({ getFieldValue }) => getFieldValue('scopeType') === 'company' ? (
                <Form.Item label={t('aiQuotaAuth.scopeTargetLabel')}><Input disabled value={t('aiQuotaAuth.allStaff')} /></Form.Item>
              ) : (
                <Form.Item name="scopeName" label={t('aiQuotaAuth.scopeTargetLabel')} rules={[{ required: true, message: t('aiQuotaAuth.scopeTargetRequired') }]}>
                  <Input placeholder={getFieldValue('scopeType') === 'dept' ? t('aiQuotaAuth.scopeDeptExample') : t('aiQuotaAuth.scopeEmpExample')} />
                </Form.Item>
              )}
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label={t('aiQuotaAuth.quotaPeriodLabel')} rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label={t('aiQuotaAuth.quotaTypeLabel')} rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="quotaValue" label={t('aiQuotaAuth.quotaValueLabel')} rules={[{ required: true, message: t('aiQuotaAuth.quotaValueRequired') }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.quotaType !== cur.quotaType}
            >
              {({ getFieldValue }) => getFieldValue('quotaType') === 'cost' ? (
                <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel')} rules={[{ required: true }]}>
                  <Select options={[{ value: 'CNY', label: t('aiQuotaAuth.cnyOption') }, { value: 'USD', label: t('aiQuotaAuth.usdOption') }]} />
                </Form.Item>
              ) : (
                <Form.Item label={t('aiQuotaAuth.softThresholdPercent')}><Input disabled value={t('aiQuotaAuth.seeBelow')} /></Form.Item>
              )}
            </Form.Item>
          </div>
          <Form.Item name="softThreshold" label={t('aiQuotaAuth.softThresholdLabel')} rules={[{ required: true }]}>
            <Radio.Group options={[{ value: 60, label: '60%' }, { value: 80, label: '80%' }, { value: 90, label: '90%' }]} />
          </Form.Item>
          <Form.Item name="overLimitAction" label={t('aiQuotaAuth.overLimitLabel')} rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Radio value="reject">{t('aiQuotaAuth.overLimitReject')}</Radio>
                <Radio value="approve">{t('aiQuotaAuth.overLimitApprove')}</Radio>
                <Radio value="downgrade">{t('aiQuotaAuth.overLimitDowngrade')}</Radio>
              </div>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.overLimitAction !== cur.overLimitAction}
          >
            {({ getFieldValue }) => getFieldValue('overLimitAction') === 'downgrade' ? (
              <>
                <Form.Item name="downgradeModelId" label={t('aiQuotaAuth.downgradeTargetModel')} rules={[{ required: true, message: t('aiQuotaAuth.selectDowngradeModel') }]}>
                  <Select placeholder={t('aiQuotaAuth.selectDowngradeModel')} options={models.map((m) => ({ value: m.id, label: m.displayName }))} />
                </Form.Item>
                <Form.Item name="downgradeExemptQuota" label={t('aiQuotaAuth.downgradeExemptQuota')} tooltip={t('aiQuotaAuth.downgradeExemptTooltip')}>
                  <InputNumber min={0} style={{ width: '100%' }} placeholder={t('aiQuotaAuth.noExemptQuotaPh')} />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
