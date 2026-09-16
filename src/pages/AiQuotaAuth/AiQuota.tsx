import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Popover, Radio, Select, Space, Switch, Table, Tag, Transfer, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  fetchMockQuotaPolicies,
  fetchMockRouteStrategies,
  fetchMockAccountWhitelists,
  fetchMockModels,
  fetchMockDeptOptions,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  OVER_LIMIT_ACTION_LABEL,
  QUOTA_SCOPE_LABEL,
  CURRENCY_SYMBOL,
} from '../../api/mock/aiPlatformMock'
import type { QuotaPolicy, RouteStrategy, AccountWhitelist, QuotaPeriod, QuotaType, OverLimitAction, QuotaScopeType, AiModel, DeptOption } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/* ────────────────── 展示常量 ────────────────── */

/** 超限動作 Tag 顏色 */
const OVER_LIMIT_TAG: Record<OverLimitAction, string> = { reject: 'error', approve: 'purple', downgrade: 'processing' }

export default function AiQuota({ fixedSection }: { fixedSection?: 'quota' | 'route' | 'quota-dept' | 'quota-emp' } = {}) {
  const { t } = useTranslation()
  /* ── 基础数据 ── */
  const [policies, setPolicies] = useState<QuotaPolicy[]>([])
  const [strategies, setStrategies] = useState<RouteStrategy[]>([])
  const [whitelists, setWhitelists] = useState<AccountWhitelist[]>([])
  const [models, setModels] = useState<AiModel[]>([])
  const [allDepts, setAllDepts] = useState<DeptOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchMockQuotaPolicies(), fetchMockRouteStrategies(), fetchMockAccountWhitelists(), fetchMockModels(), fetchMockDeptOptions()]).then(([q, s, w, m, d]) => {
      if (!cancelled) {
        setPolicies(q)
        setStrategies(s)
        setWhitelists(w)
        setModels(m)
        setAllDepts(d)
      }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 顯示名（路由策略模型池展示用） */
  const modelName = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[m.id] = m.displayName })
    return map
  }, [models])

  /* ── Transfer 數據源（部門選擇） ── */
  const transferDataSource = useMemo(() => allDepts.map((d) => ({
    key: d.deptId,
    title: d.deptName,
    description: t('aiQuotaAuth.transferDesc', { count: d.employeeCount }),
  })), [allDepts])

  /** 獨立菜單（部門額度 / 員工額度）進入時固定額度適用範圍 */
  const quotaScope: 'dept' | 'employee' | null =
    fixedSection === 'quota-dept' ? 'dept' : fixedSection === 'quota-emp' ? 'employee' : null

  /* ── Tab2: 额度策略 ── */
  const [editingPolicy, setEditingPolicy] = useState<QuotaPolicy | 'new' | null>(null)
  const [policyForm] = Form.useForm()
  const [policyQuery, setPolicyQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined)
  const [deptFilter, setDeptFilter] = useState<string | undefined>(undefined)
  const [periodFilter, setPeriodFilter] = useState<QuotaPeriod | undefined>(undefined)

  const openPolicyForm = (policy: QuotaPolicy | 'new') => {
    setEditingPolicy(policy)
    if (policy === 'new') {
      policyForm.resetFields()
      if (quotaScope) policyForm.setFieldsValue({ scopeType: quotaScope })
    } else {
      policyForm.setFieldsValue({ ...policy })
    }
  }

  const handlePolicySave = () => {
    policyForm.validateFields().then((values) => {
      const payload = values as QuotaPolicy
      if (editingPolicy === 'new') {
        setPolicies((prev) => [...prev, { ...payload, id: `p${Date.now()}`, status: 1, updatedBy: 'admin', updatedAt: new Date().toISOString() }])
      } else if (editingPolicy) {
        setPolicies((prev) => prev.map((p) => (p.id === editingPolicy.id ? { ...p, ...payload, updatedBy: 'admin', updatedAt: new Date().toISOString() } : p)))
      }
      setEditingPolicy(null)
      message.success(t('aiQuotaAuth.quotaPolicySaved'))
    })
  }

  const handlePolicyDelete = (row: QuotaPolicy) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeleteQuotaPolicy'),
      content: t('aiQuotaAuth.deleteQuotaPolicyContent', { name: row.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setPolicies((prev) => prev.filter((p) => p.id !== row.id))
        message.success(t('aiQuotaAuth.quotaPolicyDeleted'))
      },
    })
  }

  const handlePolicyToggle = (row: QuotaPolicy) => {
    const toDisable = row.status === 1
    const action = toDisable ? t('aiQuotaAuth.disableText') : t('aiQuotaAuth.enableText')
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDisableQuotaPolicy', { action }),
      content: t('aiQuotaAuth.disableQuotaPolicyContent', {
        action,
        name: row.name,
        effect: toDisable ? t('aiQuotaAuth.disableText') : t('aiQuotaAuth.enableText') + t('aiQuotaAuth.enableContent', { name: '' }).replace('「」', ''),
        limitEffect: toDisable ? t('aiQuotaAuth.overLimitReject2').split('：')[0] : t('aiQuotaAuth.overLimitApprove2').split('：')[0],
      }),
      okText: t('aiQuotaAuth.confirmOk'),
      cancelText: t('common.cancel'),
      onOk: () => {
        setPolicies((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: toDisable ? 0 : 1 } : p)))
        message.success(t('aiQuotaAuth.quotaPolicyToggled', { name: row.name, action }))
      },
    })
  }

  const filteredPolicies = useMemo(
    () => policies.filter((p) => {
      if (quotaScope && p.scopeType !== quotaScope) return false
      if (statusFilter !== undefined && p.status !== statusFilter) return false
      if (deptFilter && p.scopeType === 'dept' && p.scopeName !== deptFilter) return false
      if (periodFilter && p.period !== periodFilter) return false
      return !policyQuery || p.name.toLowerCase().includes(policyQuery.toLowerCase())
    }),
    [policies, policyQuery, quotaScope, statusFilter, deptFilter, periodFilter]
  )

  /* ── 列字段配置（额度策略） ── */
  const policyColumnMeta = [
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol2') },
    { key: 'scope', title: t('aiQuotaAuth.scopeDeptCol') },
    { key: 'period', title: t('aiQuotaAuth.periodCol2') },
    { key: 'quota', title: t('aiQuotaAuth.quotaShortCol2') },
    { key: 'soft', title: t('aiQuotaAuth.softAlertCol2') },
    { key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol2') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent: policyConfigComponent } = useColumnConfig('ai-quota-policy', policyColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（额度策略） ── */
  const policyColumns: ColumnsType<QuotaPolicy> = [
    { title: t('aiQuotaAuth.strategyNameCol2'), dataIndex: 'name', width: 170 },
    {
      title: t('aiQuotaAuth.scopeDeptCol'), key: 'scope', width: 260,
      render: (_, row) => {
        if (row.scopeType === 'company') return <Tag color="default">{t('aiQuotaAuth.allStaffTag')}</Tag>
        if (row.scopeType !== 'dept') return <Tag>{QUOTA_SCOPE_LABEL[row.scopeType]}</Tag>
        const names = row.deptNames ?? [row.scopeName]
        return (
          <span>
            {names.slice(0, 3).map((name) => (
              <Tag key={name} style={{ marginRight: 4, marginBottom: 2 }}>{name}</Tag>
            ))}
            {names.length > 3 && (
              <Popover
                content={
                  <div style={{ maxWidth: 300 }}>
                    {names.map((name) => (
                      <Tag key={name} style={{ marginRight: 4, marginBottom: 4 }}>{name}</Tag>
                    ))}
                  </div>
                }
                title={t('aiQuotaAuth.allDeptPopover', { count: names.length })}
                trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{names.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    { title: t('aiQuotaAuth.periodCol2'), dataIndex: 'period', width: 70, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    {
      title: t('aiQuotaAuth.quotaShortCol2'), key: 'quota', width: 160, align: 'right',
      render: (_, row) => {
        if (row.quotaType === 'cost') return `${CURRENCY_SYMBOL[row.currency]}${row.quotaValue.toLocaleString()} / ${QUOTA_PERIOD_LABEL[row.period]}`
        return `${row.quotaValue.toLocaleString()} ${QUOTA_TYPE_LABEL[row.quotaType]} / ${QUOTA_PERIOD_LABEL[row.period]}`
      },
    },
    { title: t('aiQuotaAuth.softAlertCol2'), key: 'soft', width: 90, align: 'center', render: (_, row) => `${row.softThreshold}%` },
    {
      title: t('aiQuotaAuth.overLimitCol2'), dataIndex: 'overLimitAction', width: 110, align: 'center',
      render: (v: OverLimitAction) => <span style={{ color: OVER_LIMIT_TAG[v], fontWeight: 600 }}>{OVER_LIMIT_ACTION_LABEL[v]}</span>,
    },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: QuotaPolicy) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handlePolicyToggle(row)}
        />
      ),
    },
    { title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('common.action'), key: 'action', width: 120, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => openPolicyForm(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handlePolicyDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  /* ── 表格列（路由策略） ── */
  const strategyColumns: ColumnsType<RouteStrategy> = [
    {
      title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 160,
      render: (v: string, row) => (
        <span>
          {v}
          {row.isDefault && <Tag color="processing" style={{ marginLeft: 8 }}>{t('aiQuotaAuth.defaultRouteTag')}</Tag>}
        </span>
      ),
    },
    { title: t('aiQuotaAuth.descCol2'), dataIndex: 'desc', ellipsis: true },
    {
      title: t('aiQuotaAuth.modelPoolOrderCol'), dataIndex: 'modelPool', width: 340,
      render: (v: string[]) => v.map((id, i) => (
        <Tag key={id} style={{ marginRight: 4, color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
          {i + 1}. {modelName[id] ?? id}
        </Tag>
      )),
    },
    {
      title: t('common.action'), key: 'action', width: 110, align: 'center',
      render: (_, row) => (row.isDefault
        ? <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.currentDefault')}</span>
        : <Button type="link" onClick={() => handleSetDefault(row)}>{t('aiQuotaAuth.setDefaultRoute')}</Button>),
    },
  ]

  const handleSetDefault = (row: RouteStrategy) => {
    setStrategies((prev) => prev.map((s) => ({ ...s, isDefault: s.id === row.id })))
    message.success(t('aiQuotaAuth.setDefaultSuccess', { name: row.name }))
  }

  /* ── 额度策略模块 ── */
  const quotaContent = (
    <>
      {/* 额度策略查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.policyNameLabel')}>
            <Input value={policyQuery} placeholder={t('aiQuotaAuth.strategyNamePh2')} allowClear onChange={(e) => setPolicyQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusFilterLabel')}>
            <Select
              value={statusFilter}
              placeholder={t('aiQuotaAuth.allOption')}
              allowClear
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 1, label: t('aiQuotaAuth.enabledFilterOption') },
                { value: 0, label: t('aiQuotaAuth.disabledFilterOption') },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.periodFilterLabel')}>
            <Select
              value={periodFilter}
              placeholder={t('aiQuotaAuth.allOption')}
              allowClear
              onChange={(v) => setPeriodFilter(v)}
              options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          {quotaScope !== 'dept' && (
            <Form.Item label={t('aiQuotaAuth.deptFilterLabel')}>
              <Select
                value={deptFilter}
                placeholder={t('aiQuotaAuth.allOption')}
                allowClear
                showSearch
                options={allDepts.map((d) => ({ value: d.deptName, label: d.deptName }))}
                onChange={(v) => setDeptFilter(v)}
              />
            </Form.Item>
          )}
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setPolicyQuery('')
                setStatusFilter(undefined)
                setDeptFilter(undefined)
                setPeriodFilter(undefined)
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：左侧统计文字，右侧新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            {quotaScope === 'dept' ? t('aiQuotaAuth.deptQuotaCount', { count: filteredPolicies.length })
              : quotaScope === 'employee' ? t('aiQuotaAuth.empQuotaCount', { count: filteredPolicies.length })
              : t('aiQuotaAuth.quotaStrategyCount', { count: filteredPolicies.length })}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPolicyForm('new')}>{t('common.add')}</Button>
          {policyConfigComponent}
        </div>
      </div>

      <Table rowKey="id" size="middle" loading={loading} columns={policyColumns} dataSource={filteredPolicies} pagination={false} />
    </>
  )

  /* ── 路由策略模块 ── */
  const routeContent = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiQuotaAuth.routeAlertTitle')}
        description={t('aiQuotaAuth.routeAlertDesc')}
      />

      {/* 操作区：左侧统计文字 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('aiQuotaAuth.routeSummary', { count: strategies.length, name: strategies.find((s) => s.isDefault)?.name ?? '--' })}
          </span>
        </div>
      </div>

      <Table rowKey="id" size="middle" loading={loading} columns={strategyColumns} dataSource={strategies} pagination={false} />

      {/* 路由策略说明 */}
      <div style={{ marginTop: 24, fontSize: 14, color: '#8C8C8C' }}>
        <p><strong>{t('aiQuotaAuth.routeNoteTitle')}</strong></p>
        <ul style={{ marginLeft: 20, lineHeight: 1.8 }}>
          <li>{t('aiQuotaAuth.routeNote1')}</li>
          <li>{t('aiQuotaAuth.routeNote2')}</li>
          <li>{t('aiQuotaAuth.routeNote3')}</li>
        </ul>
      </div>
    </>
  )

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜单界面顶部没有菜单名称；独立菜单进入时仅展示对应模块 */}
      {fixedSection === 'route' ? routeContent : fixedSection === undefined ? (<>{quotaContent}{routeContent}</>) : quotaContent}

      {/* 额度策略新增/编辑弹窗 */}
      <Modal
        title={editingPolicy === 'new' ? t('aiQuotaAuth.addQuotaPolicy') : t('aiQuotaAuth.editQuotaPolicy')}
        open={editingPolicy !== null}
        onOk={handlePolicySave}
        onCancel={() => setEditingPolicy(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnHidden
      >
        <Form form={policyForm} layout="vertical" initialValues={{ scopeType: 'company', period: 'daily', quotaType: 'token', currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1 }}>
          <Form.Item name="name" label={t('aiQuotaAuth.policyNameLabel')} rules={[{ required: true, message: t('aiQuotaAuth.policyNameRequired') }]}>
            <Input placeholder={t('aiQuotaAuth.policyNameExample')} />
          </Form.Item>
          {quotaScope !== 'dept' && (
            <Form.Item label={t('aiQuotaAuth.scopeTargetLabel2')}><Input disabled value={t('aiQuotaAuth.allStaffOption')} /></Form.Item>
          )}
          {quotaScope === 'dept' && (
            <Form.Item
              name="deptIds"
              label={t('aiQuotaAuth.applicableDeptLabel')}
              rules={[{ required: true, message: t('aiQuotaAuth.selectDeptRequired'), type: 'array', min: 1 }]}
            >
              <Transfer
                dataSource={transferDataSource}
                titles={[t('aiQuotaAuth.transferAvailable'), t('aiQuotaAuth.transferSelected')]}
                listStyle={{ width: 300, height: 280 }}
                showSearch
                filterOption={(input, item) => (item?.title ?? '').toLowerCase().includes(input.toLowerCase())}
                render={(item) => `${item.title}（${item.description}）`}
              />
            </Form.Item>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label={t('aiQuotaAuth.quotaPeriodLabel2')} rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label={t('aiQuotaAuth.quotaTypeLabel2')} rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="quotaValue" label={t('aiQuotaAuth.quotaValueLabel2')} rules={[{ required: true, message: t('aiQuotaAuth.quotaValueRequired2') }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel2')} rules={[{ required: true }]}>
              <Select options={[{ value: 'CNY', label: t('aiQuotaAuth.cnyOption') }, { value: 'USD', label: t('aiQuotaAuth.usdOption') }]} />
            </Form.Item>
          </div>
          <Form.Item name="softThreshold" label={t('aiQuotaAuth.softThresholdLabel2')} rules={[{ required: true }]}>
            <Radio.Group options={[{ value: 60, label: '60%' }, { value: 80, label: '80%' }, { value: 90, label: '90%' }]} />
          </Form.Item>
          <Form.Item name="overLimitAction" label={t('aiQuotaAuth.overLimitLabel2')} rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Radio value="reject">{t('aiQuotaAuth.overLimitReject2')}</Radio>
                <Radio value="approve">{t('aiQuotaAuth.overLimitApprove2')}</Radio>
                <Radio value="downgrade">{t('aiQuotaAuth.overLimitDowngrade2')}</Radio>
              </div>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="status" label={t('aiQuotaAuth.statusLabel')} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value={1}>{t('aiQuotaAuth.enableText')}</Radio>
              <Radio value={0}>{t('aiQuotaAuth.disableText')}</Radio>
            </Radio.Group>
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            {t('aiQuotaAuth.quotaPolicyNote2')}
          </div>
        </Form>
      </Modal>
    </div>
  )
}
