import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Popover, Radio, Select, Switch, Table, Tag, Transfer, message } from 'antd'
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
    description: `${d.employeeCount} 人`,
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
      message.success('额度策略已保存，网关将在每次请求前检查额度')
    })
  }

  const handlePolicyDelete = (row: QuotaPolicy) => {
    Modal.confirm({
      title: '确认删除该额度策略？',
      content: `删除后「${row.name}」立即失效，关联的员工不再受限额约束。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setPolicies((prev) => prev.filter((p) => p.id !== row.id))
        message.success('策略已删除')
      },
    })
  }

  const handlePolicyToggle = (row: QuotaPolicy) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該額度策略？`,
      content: `${actionText}後「${row.name}」將${toDisable ? '不再生效' : '恢復生效'}，關聯的员工${toDisable ? '不再受' : '將受'}限額約束`,
      okText: '確認',
      cancelText: '取消',
      onOk: () => {
        setPolicies((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: toDisable ? 0 : 1 } : p)))
        message.success(`${row.name} 已${actionText}`)
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
    { key: 'name', title: '策略名称' },
    { key: 'scope', title: '适用部门' },
    { key: 'period', title: '周期' },
    { key: 'quota', title: '限额' },
    { key: 'soft', title: '软提醒' },
    { key: 'overLimitAction', title: '超额动作' },
    { key: 'status', title: '状态' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent: policyConfigComponent } = useColumnConfig('ai-quota-policy', policyColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（额度策略） ── */
  const policyColumns: ColumnsType<QuotaPolicy> = [
    { title: '策略名称', dataIndex: 'name', width: 170 },
    {
      title: '適用部門', key: 'scope', width: 260,
      render: (_, row) => {
        if (row.scopeType === 'company') return <Tag color="default">全員</Tag>
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
                title={`全部部門（${names.length}）`}
                trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{names.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    { title: '周期', dataIndex: 'period', width: 70, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    {
      title: '限额', key: 'quota', width: 160, align: 'right',
      render: (_, row) => {
        if (row.quotaType === 'cost') return `${CURRENCY_SYMBOL[row.currency]}${row.quotaValue.toLocaleString()} / ${QUOTA_PERIOD_LABEL[row.period]}`
        return `${row.quotaValue.toLocaleString()} ${QUOTA_TYPE_LABEL[row.quotaType]} / ${QUOTA_PERIOD_LABEL[row.period]}`
      },
    },
    { title: '软提醒', key: 'soft', width: 90, align: 'center', render: (_, row) => `${row.softThreshold}%` },
    {
      title: '超额动作', dataIndex: 'overLimitAction', width: 110, align: 'center',
      render: (v: OverLimitAction) => <span style={{ color: OVER_LIMIT_TAG[v], fontWeight: 600 }}>{OVER_LIMIT_ACTION_LABEL[v]}</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: QuotaPolicy) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handlePolicyToggle(row)}
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 120, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => openPolicyForm(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handlePolicyDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  /* ── 表格列（路由策略） ── */
  const strategyColumns: ColumnsType<RouteStrategy> = [
    {
      title: '策略名稱', dataIndex: 'name', width: 160,
      render: (v: string, row) => (
        <span>
          {v}
          {row.isDefault && <Tag color="processing" style={{ marginLeft: 8 }}>默認</Tag>}
        </span>
      ),
    },
    { title: '說明', dataIndex: 'desc', ellipsis: true },
    {
      title: '模型池優先順序', dataIndex: 'modelPool', width: 340,
      render: (v: string[]) => v.map((id, i) => (
        <Tag key={id} style={{ marginRight: 4, color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
          {i + 1}. {modelName[id] ?? id}
        </Tag>
      )),
    },
    {
      title: '操作', key: 'action', width: 110, align: 'center',
      render: (_, row) => (row.isDefault
        ? <span style={{ color: '#BFBFBF' }}>當前默認</span>
        : <Button type="link" onClick={() => handleSetDefault(row)}>設為默認</Button>),
    },
  ]

  const handleSetDefault = (row: RouteStrategy) => {
    setStrategies((prev) => prev.map((s) => ({ ...s, isDefault: s.id === row.id })))
    message.success(`「${row.name}」已設為默認路由策略，網關將按該模型池順序調度`)
  }

  /* ── 额度策略模块 ── */
  const quotaContent = (
    <>
      {/* 额度策略查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="策略名称">
            <Input value={policyQuery} placeholder="请输入策略名称" allowClear onChange={(e) => setPolicyQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              value={statusFilter}
              placeholder="全部"
              allowClear
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 1, label: '启用' },
                { value: 0, label: '停用' },
              ]}
            />
          </Form.Item>
          <Form.Item label="周期">
            <Select
              value={periodFilter}
              placeholder="全部"
              allowClear
              onChange={(v) => setPeriodFilter(v)}
              options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          {quotaScope !== 'dept' && (
            <Form.Item label="部门">
              <Select
                value={deptFilter}
                placeholder="全部"
                allowClear
                showSearch
                options={allDepts.map((d) => ({ value: d.deptName, label: d.deptName }))}
                onChange={(v) => setDeptFilter(v)}
              />
            </Form.Item>
          )}
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setPolicyQuery('')
                setStatusFilter(undefined)
                setDeptFilter(undefined)
                setPeriodFilter(undefined)
              }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：左侧统计文字，右侧新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            {quotaScope === 'dept' ? `部門額度共 ${filteredPolicies.length} 條`
              : quotaScope === 'employee' ? `員工額度共 ${filteredPolicies.length} 條`
              : `額度策略共 ${filteredPolicies.length} 條`}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPolicyForm('new')}>新增</Button>
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
        message="智能路由策略"
        description="「智能路由」在员工已授权的模型范围内按模型池顺序调度；故障时自动切换到池内下一个模型并记录切换日志。"
      />

      {/* 操作区：左侧统计文字 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            共 {strategies.length} 套路由策略，當前默認：{strategies.find((s) => s.isDefault)?.name ?? '--'}
          </span>
        </div>
      </div>

      <Table rowKey="id" size="middle" loading={loading} columns={strategyColumns} dataSource={strategies} pagination={false} />

      {/* 路由策略说明 */}
      <div style={{ marginTop: 24, fontSize: 14, color: '#8C8C8C' }}>
        <p><strong>路由策略说明：</strong></p>
        <ul style={{ marginLeft: 20, lineHeight: 1.8 }}>
          <li>默认模式（Auto）：根据成本优先策略智能调度模型</li>
          <li>成本优先（Cost）：优先使用价格较低的模型</li>
          <li>性能优先（Performance）：优先使用响应速度较快的模型</li>
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
        title={editingPolicy === 'new' ? '新增额度策略' : '编辑额度策略'}
        open={editingPolicy !== null}
        onOk={handlePolicySave}
        onCancel={() => setEditingPolicy(null)}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={policyForm} layout="vertical" initialValues={{ scopeType: 'company', period: 'daily', quotaType: 'token', currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1 }}>
          <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
            <Input placeholder="如：普通员工日限额" />
          </Form.Item>
          {quotaScope !== 'dept' && (
            <Form.Item label="適用對象"><Input disabled value="全員" /></Form.Item>
          )}
          {quotaScope === 'dept' && (
            <Form.Item
              name="deptIds"
              label="適用部門"
              rules={[{ required: true, message: '请选择至少一个部门', type: 'array', min: 1 }]}
            >
              <Transfer
                dataSource={transferDataSource}
                titles={['可选部门', '已选部门']}
                listStyle={{ width: 300, height: 280 }}
                showSearch
                filterOption={(input, item) => (item?.title ?? '').toLowerCase().includes(input.toLowerCase())}
                render={(item) => `${item.title}（${item.description}）`}
              />
            </Form.Item>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="限额周期" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label="限额类型" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="quotaValue" label="限额值" rules={[{ required: true, message: '请输入限额值' }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="currency" label="计价币种" rules={[{ required: true }]}>
              <Select options={[{ value: 'CNY', label: 'CNY（人民币）' }, { value: 'USD', label: 'USD（美元）' }]} />
            </Form.Item>
          </div>
          <Form.Item name="softThreshold" label="软限额提醒阈值（达到后通知员工与主管）" rules={[{ required: true }]}>
            <Radio.Group options={[{ value: 60, label: '60%' }, { value: 80, label: '80%' }, { value: 90, label: '90%' }]} />
          </Form.Item>
          <Form.Item name="overLimitAction" label="超额后动作" rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Radio value="reject">拒绝请求：直接提示「额度已用完」</Radio>
                <Radio value="approve">进入审批：员工可申请临时提升额度，主管审批</Radio>
                <Radio value="downgrade">自动降级：切换到更便宜的模型继续对话</Radio>
              </div>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value={1}>啟用</Radio>
              <Radio value={0}>停用</Radio>
            </Radio.Group>
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            额度由网关在每次请求前检查（员工级与部门级同时生效，先到先限）；达到软提醒阈值时通知员工与主管。
          </div>
        </Form>
      </Modal>
    </div>
  )
}
