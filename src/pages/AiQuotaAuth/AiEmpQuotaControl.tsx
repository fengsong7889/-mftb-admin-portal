import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Divider, Form, Input, InputNumber, Modal, Radio, Select, Switch, Table, Tabs, Tag, Transfer, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons'
import {
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
} from '../../api/mock/aiPlatformMock'
import type { QuotaPeriod, QuotaType, OverLimitAction } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../api/position'
import { fetchRoles, type RoleItem } from '../../api/role'
import { fetchEmployees, type EmployeeItem } from '../../api/employee'

/**
 * 员工额度控制 - 按职位和角色两种授权方式融合页
 * Tab1 按职位额度：以「规则」维度按职级序列 + 职级批量配置额度（如 M序列 R3+ 日限额 10000 tokens）
 * Tab2 角色额度：创建角色 + 选员工 + 配额度
 */

/** 职位额度策略（规则） */
interface PositionQuotaStrategy {
  id: string
  ruleName: string
  sequences: string[]
  jobLevels: string[]
  period: QuotaPeriod
  quotaType: QuotaType
  quotaValue: number
  currency: string
  softThreshold: number
  overLimitAction: OverLimitAction
  description: string
  status: number
  createdAt: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

const POS_STRATEGY_STORAGE_KEY = 'pos_quota_strategies'

export default function AiEmpQuotaControl() {
  /* ── 基础数据 ── */
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchRoles(),
      fetchEmployees({ page: 1, size: 200 }),
    ]).then(([r, e]) => {
      if (!cancelled) {
        setRoles(r)
        setEmployees(e.records || [])
      }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /* ── Transfer 数据源（员工选择） ── */
  const employeeTransferData = useMemo(() => employees.map((e) => ({
    key: e.empId,
    title: `${e.name}（${e.empId}）`,
    description: [e.department, e.position].filter(Boolean).join(' / '),
  })), [employees])

  /* ═══════════ Tab1: 按职位额度 ═══════════ */
  const [posStrategies, setPosStrategies] = useState<PositionQuotaStrategy[]>(() => {
    try { return JSON.parse(localStorage.getItem(POS_STRATEGY_STORAGE_KEY) || '[]') as PositionQuotaStrategy[] } catch { return [] }
  })

  const persistPosStrategies = (next: PositionQuotaStrategy[]) => {
    setPosStrategies(next)
    localStorage.setItem(POS_STRATEGY_STORAGE_KEY, JSON.stringify(next))
  }

  /* ── 查询过滤 ── */
  const [posNameQuery, setPosNameQuery] = useState('')
  const [posSeqFilter, setPosSeqFilter] = useState<string | undefined>(undefined)
  const [posStatusFilter, setPosStatusFilter] = useState<number | undefined>(undefined)

  const filteredStrategies = useMemo(() => posStrategies.filter((s) => {
    if (posNameQuery && !s.ruleName.toLowerCase().includes(posNameQuery.toLowerCase())) return false
    if (posSeqFilter && !s.sequences.includes(posSeqFilter)) return false
    if (posStatusFilter !== undefined && s.status !== posStatusFilter) return false
    return true
  }), [posStrategies, posNameQuery, posSeqFilter, posStatusFilter])

  /* ── 职位规则匹配员工（自动按 sequence + jobLevel 匹配） ── */
  const matchEmployeesByRule = (rule: PositionQuotaStrategy) =>
    employees.filter((e) => e.sequence && rule.sequences.includes(e.sequence) && e.jobLevel && rule.jobLevels.includes(e.jobLevel))

  /* ── 预览匹配员工弹窗状态 ── */
  const [previewRule, setPreviewRule] = useState<PositionQuotaStrategy | null>(null)
  const previewMatchedEmployees = useMemo(
    () => (previewRule ? matchEmployeesByRule(previewRule) : []),
    [previewRule, employees],
  )

  /* ── 新增/编辑弹窗 ── */
  const [editingStrategy, setEditingStrategy] = useState<PositionQuotaStrategy | 'new' | null>(null)
  const [positionForm] = Form.useForm()

  const openStrategyForm = (strategy: PositionQuotaStrategy | 'new') => {
    setEditingStrategy(strategy)
    if (strategy === 'new') {
      positionForm.resetFields()
      positionForm.setFieldsValue({
        ruleName: '',
        sequences: [],
        jobLevels: [],
        period: 'daily',
        quotaType: 'token',
        quotaValue: 1000,
        currency: 'CNY',
        softThreshold: 80,
        overLimitAction: 'reject',
        description: '',
        status: 1,
      })
    } else {
      positionForm.setFieldsValue({ ...strategy })
    }
  }

  const handleStrategySave = () => {
    positionForm.validateFields().then((values) => {
      if (editingStrategy === 'new') {
        const newItem: PositionQuotaStrategy = { id: `ps${Date.now()}`, createdAt: new Date().toISOString(), ...values, updatedBy: 'admin', updatedAt: new Date().toISOString() }
        persistPosStrategies([...posStrategies, newItem])
        message.success('职位额度策略已新增，匹配的职位自动生效')
      } else if (editingStrategy) {
        persistPosStrategies(posStrategies.map((s) => (s.id === editingStrategy.id ? { ...s, ...values, updatedBy: 'admin', updatedAt: new Date().toISOString() } : s)))
        message.success('职位额度策略已保存')
      }
      setEditingStrategy(null)
    })
  }

  const handleStrategyDelete = (row: PositionQuotaStrategy) => {
    Modal.confirm({
      title: '确认删除该职位额度策略？',
      content: `删除后「${row.ruleName}」立即失效，匹配的职位不再受该限额约束。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        persistPosStrategies(posStrategies.filter((s) => s.id !== row.id))
        message.success('策略已删除')
      },
    })
  }

  const handleStrategyToggleStatus = (row: PositionQuotaStrategy) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '启用'
    Modal.confirm({
      title: `确认${actionText}该策略？`,
      content: `${actionText}后「${row.ruleName}」将${toDisable ? '不再生效' : '恢复生效'}`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        persistPosStrategies(posStrategies.map((s) => (s.id === row.id ? { ...s, status: toDisable ? 0 : 1 } : s)))
        message.success(`策略已${actionText}`)
      },
    })
  }

  /* ── 表格列定义（职位额度） ── */
  const posColumnMeta = [
    { key: 'ruleName', title: '规则名称' },
    { key: 'sequences', title: '职级序列' },
    { key: 'jobLevels', title: '职级' },
    { key: 'matchedCount', title: '匹配员工数' },
    { key: 'period', title: '限制周期' },
    { key: 'quotaType', title: '限额类型' },
    { key: 'quotaValue', title: '限额值' },
    { key: 'currency', title: '计价币种' },
    { key: 'softThreshold', title: '软限额提醒' },
    { key: 'description', title: '描述' },
    { key: 'status', title: '状态' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: posConfigComponent } = useColumnConfig('ai-emp-quota-position', posColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const posColumns: ColumnsType<PositionQuotaStrategy> = [
    { title: '规则名称', dataIndex: 'ruleName', width: 160 },
    {
      title: '职级序列', dataIndex: 'sequences', width: 150,
      render: (v: string[]) => (v.length ? v.map((s) => <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]}>{POSITION_SEQUENCE[s] ?? s}</Tag>) : '-'),
    },
    {
      title: '职级', dataIndex: 'jobLevels', width: 150,
      render: (v: string[]) => (v.length ? v.map((l) => <Tag key={l}>{l}</Tag>) : '-'),
    },
    {
      title: '匹配员工数', key: 'matchedCount', width: 110, align: 'center',
      render: (_: unknown, row: PositionQuotaStrategy) => {
        const count = matchEmployeesByRule(row).length
        return <Tag color={count > 0 ? 'blue' : 'default'}>{count} 人</Tag>
      },
    },
    { title: '限制周期', dataIndex: 'period', width: 90, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    { title: '限额类型', dataIndex: 'quotaType', width: 90, align: 'center', render: (v: QuotaType) => QUOTA_TYPE_LABEL[v] },
    { title: '限额值', dataIndex: 'quotaValue', width: 100, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '计价币种', dataIndex: 'currency', width: 90, align: 'center' },
    { title: '软限额提醒', dataIndex: 'softThreshold', width: 100, align: 'center', render: (v: number) => `${v}%` },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PositionQuotaStrategy) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => handleStrategyToggleStatus(row)}
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 160, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setPreviewRule(row)}>预览</Button>
          <Button type="link" onClick={() => openStrategyForm(row)}>编辑</Button>
          <Button type="link" danger onClick={() => handleStrategyDelete(row)}>删除</Button>
        </>
      ),
    },
  ]

  const positionContent = (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            按职位额度以规则维度根据职级序列和职级批量配置访问限额，系统根据每位员工的职位自动匹配序列与职级，自动生效对应额度。
            <span style={{ color: '#8C8C8C' }}>无需手动分配员工，「匹配员工数」列实时展示当前规则影响的员工范围。</span>
          </span>
        }
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="规则名称">
            <Input value={posNameQuery} placeholder="请输入规则名称" allowClear onChange={(e) => setPosNameQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label="职级序列">
            <Select value={posSeqFilter} placeholder="全部" allowClear onChange={(v) => setPosSeqFilter(v)} options={POSITION_SEQUENCE_OPTIONS} />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              value={posStatusFilter}
              placeholder="全部"
              allowClear
              onChange={(v) => setPosStatusFilter(v)}
              options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setPosNameQuery('')
                setPosSeqFilter(undefined)
                setPosStatusFilter(undefined)
              }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>共 {filteredStrategies.length} 条职位额度策略</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openStrategyForm('new')}>新增</Button>
          {posConfigComponent}
        </div>
      </div>

      {/* 职位额度策略列表 */}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={posColumns}
        dataSource={filteredStrategies}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条策略` }}
      />

      {/* 新增/编辑职位额度策略弹窗 */}
      <Modal
        title={editingStrategy === 'new' ? '新增职位额度策略' : '编辑职位额度策略'}
        open={editingStrategy !== null}
        onOk={handleStrategySave}
        onCancel={() => setEditingStrategy(null)}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={positionForm} layout="vertical">
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如：M序列 R3 及以上日限额" allowClear />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="sequences" label="职级序列" rules={[{ required: true, message: '请选择职级序列', type: 'array', min: 1 }]}>
              <Select mode="multiple" placeholder="请选择职级序列（可多选）" allowClear options={POSITION_SEQUENCE_OPTIONS} />
            </Form.Item>
            <Form.Item name="jobLevels" label="职级" rules={[{ required: true, message: '请选择职级', type: 'array', min: 1 }]}>
              <Select mode="multiple" placeholder="请选择职级（可多选）" allowClear options={POSITION_RANK_OPTIONS} />
            </Form.Item>
          </div>

          <Divider orientation="left">额度配置</Divider>

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
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="请输入策略描述（选填）" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]} getValueProps={(v) => ({ checked: v === 1 })} getValueFromEvent={(checked) => (checked ? 1 : 0)}>
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            <div style={{ marginBottom: 4 }}>职位额度将与角色额度同时生效，系统按以下规则计算员工最终额度：</div>
            <div>• 同一员工符合多条职位规则时，取限额值最大的规则生效</div>
            <div>• 职位额度与角色额度同时存在时，取两者中较大的值（职位优先）</div>
            <div>• 员工个人覆盖额度优先级最高，覆盖职位和角色额度</div>
          </div>
        </Form>
      </Modal>

      {/* 预览匹配员工弹窗 */}
      <Modal
        title={`预览匹配员工 — ${previewRule?.ruleName || ''}`}
        open={previewRule !== null}
        onCancel={() => setPreviewRule(null)}
        footer={<Button onClick={() => setPreviewRule(null)}>关闭</Button>}
        width={680}
        destroyOnHidden
      >
        {previewRule && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#595959' }}>
              匹配条件：
              {previewRule.sequences.map((s) => <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ marginRight: 4 }}>{POSITION_SEQUENCE[s] ?? s}</Tag>)}
              {' + '}
              {previewRule.jobLevels.map((l) => <Tag key={l} style={{ marginRight: 4 }}>{l}</Tag>)}
            </div>
            {previewMatchedEmployees.length > 0 ? (
              <Table
                rowKey="empId"
                size="small"
                columns={[
                  { title: '工号', dataIndex: 'empId', width: 90 },
                  { title: '姓名', dataIndex: 'name', width: 100 },
                  { title: '部门', dataIndex: 'department', ellipsis: true },
                  { title: '职位', dataIndex: 'position', ellipsis: true },
                  { title: '序列', dataIndex: 'sequence', width: 70, align: 'center', render: (v: string) => v ? <Tag color={POSITION_SEQUENCE_TAG_COLOR[v]}>{POSITION_SEQUENCE[v] ?? v}</Tag> : '-' },
                  { title: '职级', dataIndex: 'jobLevel', width: 70, align: 'center', render: (v: string) => v || '-' },
                ]}
                dataSource={previewMatchedEmployees}
                pagination={previewMatchedEmployees.length > 10 ? { pageSize: 10, size: 'small' } : false}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#8C8C8C' }}>
                当前无员工匹配该规则（可能员工职位尚未配置序列/职级）
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              共匹配 <strong style={{ color: '#1890FF' }}>{previewMatchedEmployees.length}</strong> 名员工，系统将自动按此规则生效额度限制。
            </div>
          </>
        )}
      </Modal>
    </>
  )

  /* ═══════════ Tab2: 角色额度 ═══════════ */
  const [roleQuery, setRoleQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined)

  const filteredRoles = useMemo(() => roles.filter((r) => {
    if (roleQuery && !r.name.toLowerCase().includes(roleQuery.toLowerCase())) return false
    if (statusFilter !== undefined && r.status !== statusFilter) return false
    return true
  }), [roles, roleQuery, statusFilter])

  const [roleQuota, setRoleQuota] = useState<RoleQuotaConfig | null>(null)
  const [roleForm] = Form.useForm()
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])

  interface RoleQuotaConfig {
    roleName: string
    employeeIds: string[]
    period: QuotaPeriod
    quotaType: QuotaType
    quotaValue: number
    currency: string
    softThreshold: number
    overLimitAction: OverLimitAction
  }

  const handleRoleQuotaCreate = () => {
    roleForm.resetFields()
    roleForm.setFieldsValue({
      period: 'daily',
      quotaType: 'token',
      quotaValue: 1000,
      currency: 'CNY',
      softThreshold: 80,
      overLimitAction: 'reject',
      roleName: '',
      employeeIds: []
    })
    setSelectedEmployees([])
    setRoleQuota({ roleName: '', employeeIds: [], period: 'daily', quotaType: 'token', quotaValue: 1000, currency: 'CNY', softThreshold: 80, overLimitAction: 'reject' })
  }

  const handleRoleQuotaSave = () => {
    roleForm.validateFields().then((values) => {
      // 简化处理：保存到 localStorage
      const quotaStrategy = { ...values, createdAt: new Date().toISOString() }
      const oldStrategies = JSON.parse(localStorage.getItem('role_quota_strategies') || '[]')
      localStorage.setItem('role_quota_strategies', JSON.stringify([...oldStrategies, quotaStrategy]))
      message.success('角色额度策略已保存')
      setRoleQuota(null)
    })
  }

  /** 点击已有角色「配置」：预填角色名称并打开弹窗 */
  const handleRoleQuotaConfig = (row: RoleItem) => {
    roleForm.resetFields()
    roleForm.setFieldsValue({
      roleName: row.name,
      period: 'daily',
      quotaType: 'token',
      quotaValue: 1000,
      currency: 'CNY',
      softThreshold: 80,
      overLimitAction: 'reject',
      employeeIds: [],
    })
    setSelectedEmployees([])
    setRoleQuota({ roleName: row.name, employeeIds: [], period: 'daily', quotaType: 'token', quotaValue: 1000, currency: 'CNY', softThreshold: 80, overLimitAction: 'reject' })
  }

  /* ── 表格列定义（角色额度） ── */
  const roleColumnMeta = [
    { key: 'name', title: '角色名称' },
    { key: 'description', title: '描述' },
    { key: 'employeeCount', title: '绑定员工数' },
    { key: 'quota', title: '额度配置' },
    { key: 'status', title: '状态' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: roleConfigComponent } = useColumnConfig('ai-emp-quota-role', roleColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const roleColumns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'name', width: 180 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '绑定员工数', dataIndex: 'userCount', width: 110, align: 'center', render: (v: number) => `${v}人` },
    {
      title: '额度配置', key: 'quota', width: 200,
      render: (_, row) => {
        const strategies = JSON.parse(localStorage.getItem('role_quota_strategies') || '[]')
        const match = strategies.find((s: any) => s.roleName === row.name)
        return match ? (
          <Tag color="success">
            {match.quotaValue} {QUOTA_TYPE_LABEL[match.quotaType as QuotaType]} / {QUOTA_PERIOD_LABEL[match.period as QuotaPeriod]}
          </Tag>
        ) : <Tag>未配置</Tag>
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (v: number) => (
        <Switch
          checked={v === 1}
          checkedChildren="启用"
          unCheckedChildren="停用"
          disabled
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleRoleQuotaConfig(row)}>配置</Button>
        </>
      ),
    },
  ]

  const roleContent = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="角色额度为特定角色批量配置访问限额，适合为相似岗位的员工统一设定额度标准"
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="角色名称">
            <Input value={roleQuery} placeholder="请输入角色名称" allowClear onChange={(e) => setRoleQuery(e.target.value)} />
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
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setRoleQuery('')
                setStatusFilter(undefined)
              }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            共 {filteredRoles.length} 个角色
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleQuotaCreate}>新增</Button>
          {roleConfigComponent}
        </div>
      </div>

      {/* 角色列表表格 */}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={roleColumns}
        dataSource={filteredRoles}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个角色` }}
      />

      {/* 角色额度配置弹窗 */}
      <Modal
        title="新增角色额度策略"
        open={roleQuota !== null}
        onOk={handleRoleQuotaSave}
        onCancel={() => setRoleQuota(null)}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roleName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="请输入角色名称" allowClear onChange={(e) => setRoleQuota((prev) => prev ? { ...prev, roleName: e.target.value } : prev)} />
          </Form.Item>

          <Form.Item name="employeeIds" label="绑定员工" rules={[{ required: true, message: '请绑定至少一个员工', type: 'array', min: 1 }]}>
            <Transfer
              dataSource={employeeTransferData}
              titles={['可选员工', '已选员工']}
              targetKeys={selectedEmployees}
              listStyle={{ width: 300, height: 280 }}
              showSearch
              filterOption={(input, item) => (item?.title ?? '').toLowerCase().includes(input.toLowerCase())}
              render={(item) => `${item.title}${item.description ? ` · ${item.description}` : ''}`}
              onChange={(targetKeys) => {
                const keys = targetKeys as string[]
                setSelectedEmployees(keys)
                roleForm.setFieldsValue({ employeeIds: keys })
              }}
            />
          </Form.Item>

          <Divider orientation="left">额度配置</Divider>

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
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            角色额度将与个人级别配额同时生效（先到先限）；达到软提醒阈值时通知员工与主管。
          </div>
        </Form>
      </Modal>
    </>
  )

  const tabItems = [
    { key: 'position', label: '按职位额度', children: positionContent },
    { key: 'role', label: '角色额度', children: roleContent },
  ]

  return (
    <div className="content-area">
      <Tabs defaultActiveKey="position" items={tabItems} />
    </div>
  )
}
