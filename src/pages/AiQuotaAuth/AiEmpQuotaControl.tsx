import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Divider, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Table, Tabs, Tag, Transfer, message } from 'antd'
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
  const { t } = useTranslation()
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
        message.success(t('aiQuotaAuth.posStrategyAdded'))
      } else if (editingStrategy) {
        persistPosStrategies(posStrategies.map((s) => (s.id === editingStrategy.id ? { ...s, ...values, updatedBy: 'admin', updatedAt: new Date().toISOString() } : s)))
        message.success(t('aiQuotaAuth.posStrategySaved'))
      }
      setEditingStrategy(null)
    })
  }

  const handleStrategyDelete = (row: PositionQuotaStrategy) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeleteStrategy'),
      content: t('aiQuotaAuth.deleteStrategyContent', { name: row.ruleName }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        persistPosStrategies(posStrategies.filter((s) => s.id !== row.id))
        message.success(t('aiQuotaAuth.strategyDeleted'))
      },
    })
  }

  const handleStrategyToggleStatus = (row: PositionQuotaStrategy) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? t('aiQuotaAuth.disableText') : t('aiQuotaAuth.enableText')
    Modal.confirm({
      title: toDisable ? t('aiQuotaAuth.confirmDisable') : t('aiQuotaAuth.confirmEnable'),
      content: toDisable ? t('aiQuotaAuth.disableContent', { name: row.ruleName }) : t('aiQuotaAuth.enableContent', { name: row.ruleName }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => {
        persistPosStrategies(posStrategies.map((s) => (s.id === row.id ? { ...s, status: toDisable ? 0 : 1 } : s)))
        message.success(toDisable ? t('aiQuotaAuth.strategyDisabled') : t('aiQuotaAuth.strategyEnabled'))
      },
    })
  }

  /* ── 表格列定义（职位额度） ── */
  const posColumnMeta = [
    { key: 'ruleName', title: t('aiQuotaAuth.ruleNameCol') },
    { key: 'sequences', title: t('aiQuotaAuth.sequencesCol') },
    { key: 'jobLevels', title: t('aiQuotaAuth.jobLevelCol') },
    { key: 'matchedCount', title: t('aiQuotaAuth.matchedEmpCol') },
    { key: 'period', title: t('aiQuotaAuth.periodCol') },
    { key: 'quotaType', title: t('aiQuotaAuth.quotaTypeCol') },
    { key: 'quotaValue', title: t('aiQuotaAuth.quotaValueCol') },
    { key: 'currency', title: t('aiQuotaAuth.currencyCol') },
    { key: 'softThreshold', title: t('aiQuotaAuth.softThresholdCol') },
    { key: 'description', title: t('aiQuotaAuth.descCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('aiQuotaAuth.actionCol') },
  ]
  const { configComponent: posConfigComponent } = useColumnConfig('ai-emp-quota-position', posColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const posColumns: ColumnsType<PositionQuotaStrategy> = [
    { title: t('aiQuotaAuth.ruleNameCol'), dataIndex: 'ruleName', width: 160 },
    {
      title: t('aiQuotaAuth.sequencesCol'), dataIndex: 'sequences', width: 150,
      render: (v: string[]) => (v.length ? v.map((s) => <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]}>{POSITION_SEQUENCE[s] ?? s}</Tag>) : '-'),
    },
    {
      title: t('aiQuotaAuth.jobLevelCol'), dataIndex: 'jobLevels', width: 150,
      render: (v: string[]) => (v.length ? v.map((l) => <Tag key={l}>{l}</Tag>) : '-'),
    },
    {
      title: t('aiQuotaAuth.matchedEmpCol'), key: 'matchedCount', width: 110, align: 'center',
      render: (_: unknown, row: PositionQuotaStrategy) => {
        const count = matchEmployeesByRule(row).length
        return <Tag color={count > 0 ? 'blue' : 'default'}>{t('aiQuotaAuth.matchedPeople', { count })}</Tag>
      },
    },
    { title: t('aiQuotaAuth.periodCol'), dataIndex: 'period', width: 90, align: 'center', render: (v: QuotaPeriod) => QUOTA_PERIOD_LABEL[v] },
    { title: t('aiQuotaAuth.quotaTypeCol'), dataIndex: 'quotaType', width: 90, align: 'center', render: (v: QuotaType) => QUOTA_TYPE_LABEL[v] },
    { title: t('aiQuotaAuth.quotaValueCol'), dataIndex: 'quotaValue', width: 100, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: t('aiQuotaAuth.currencyCol'), dataIndex: 'currency', width: 90, align: 'center' },
    { title: t('aiQuotaAuth.softThresholdCol'), dataIndex: 'softThreshold', width: 100, align: 'center', render: (v: number) => `${v}%` },
    { title: t('aiQuotaAuth.descCol'), dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PositionQuotaStrategy) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handleStrategyToggleStatus(row)}
        />
      ),
    },
    { title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('aiQuotaAuth.actionCol'), key: 'action', width: 160, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => setPreviewRule(row)}>{t('aiQuotaAuth.previewBtn')}</Button>
          <Button type="link" onClick={() => openStrategyForm(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleStrategyDelete(row)}>{t('common.delete')}</Button>
        </Space>
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
            {t('aiQuotaAuth.posQuotaAlert')}
            <span style={{ color: '#8C8C8C' }}>{t('aiQuotaAuth.posQuotaAlertHint')}</span>
          </span>
        }
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.ruleNameCol')}>
            <Input value={posNameQuery} placeholder={t('aiQuotaAuth.ruleNamePh')} allowClear onChange={(e) => setPosNameQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.sequencesCol')}>
            <Select value={posSeqFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear onChange={(v) => setPosSeqFilter(v)} options={POSITION_SEQUENCE_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}>
            <Select
              value={posStatusFilter}
              placeholder={t('aiQuotaAuth.allOption')}
              allowClear
              onChange={(v) => setPosStatusFilter(v)}
              options={[{ value: 1, label: t('aiQuotaAuth.enableText') }, { value: 0, label: t('aiQuotaAuth.disableText') }]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setPosNameQuery('')
                setPosSeqFilter(undefined)
                setPosStatusFilter(undefined)
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>{t('aiQuotaAuth.posStrategyCount', { count: filteredStrategies.length })}</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openStrategyForm('new')}>{t('common.add')}</Button>
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
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.totalStrategies', { total }) }}
      />

      {/* 新增/编辑职位额度策略弹窗 */}
      <Modal
        title={editingStrategy === 'new' ? t('aiQuotaAuth.addPosStrategy') : t('aiQuotaAuth.editPosStrategy')}
        open={editingStrategy !== null}
        onOk={handleStrategySave}
        onCancel={() => setEditingStrategy(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnHidden
      >
        <Form form={positionForm} layout="vertical">
          <Form.Item name="ruleName" label={t('aiQuotaAuth.ruleNameCol')} rules={[{ required: true, message: t('aiQuotaAuth.ruleNameRequired') }]}>
            <Input placeholder={t('aiQuotaAuth.ruleNameExample')} allowClear />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="sequences" label={t('aiQuotaAuth.sequencesCol')} rules={[{ required: true, message: t('aiQuotaAuth.selectSequences'), type: 'array', min: 1 }]}>
              <Select mode="multiple" placeholder={t('aiQuotaAuth.selectSequencesMulti')} allowClear options={POSITION_SEQUENCE_OPTIONS} />
            </Form.Item>
            <Form.Item name="jobLevels" label={t('aiQuotaAuth.jobLevelCol')} rules={[{ required: true, message: t('aiQuotaAuth.selectJobLevels'), type: 'array', min: 1 }]}>
              <Select mode="multiple" placeholder={t('aiQuotaAuth.selectJobLevelsMulti')} allowClear options={POSITION_RANK_OPTIONS} />
            </Form.Item>
          </div>

          <Divider orientation="left">{t('aiQuotaAuth.quotaConfigDivider')}</Divider>

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
            <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel')} rules={[{ required: true }]}>
              <Select options={[{ value: 'CNY', label: t('aiQuotaAuth.cnyOption') }, { value: 'USD', label: t('aiQuotaAuth.usdOption') }]} />
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
          <Form.Item name="description" label={t('aiQuotaAuth.descCol')}>
            <Input.TextArea rows={2} placeholder={t('aiQuotaAuth.descPh')} maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="status" label={t('aiQuotaAuth.statusCol')} rules={[{ required: true }]} getValueProps={(v) => ({ checked: v === 1 })} getValueFromEvent={(checked) => (checked ? 1 : 0)}>
            <Switch checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            <div style={{ marginBottom: 4 }}>{t('aiQuotaAuth.posStrategyNote')}</div>
            <div>{t('aiQuotaAuth.posStrategyNote1')}</div>
            <div>{t('aiQuotaAuth.posStrategyNote2')}</div>
            <div>{t('aiQuotaAuth.posStrategyNote3')}</div>
          </div>
        </Form>
      </Modal>

      {/* 预览匹配员工弹窗 */}
      <Modal
        title={`${t('aiQuotaAuth.previewMatchEmp')} — ${previewRule?.ruleName || ''}`}
        open={previewRule !== null}
        onCancel={() => setPreviewRule(null)}
        footer={<Button onClick={() => setPreviewRule(null)}>{t('aiQuotaAuth.closeBtn')}</Button>}
        width={680}
        destroyOnHidden
      >
        {previewRule && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#595959' }}>
              {t('aiQuotaAuth.matchCondition')}
              {previewRule.sequences.map((s) => <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ marginRight: 4 }}>{POSITION_SEQUENCE[s] ?? s}</Tag>)}
              {' + '}
              {previewRule.jobLevels.map((l) => <Tag key={l} style={{ marginRight: 4 }}>{l}</Tag>)}
            </div>
            {previewMatchedEmployees.length > 0 ? (
              <Table
                rowKey="empId"
                size="small"
                columns={[
                  { title: t('aiQuotaAuth.empIdCol'), dataIndex: 'empId', width: 90 },
                  { title: t('aiQuotaAuth.empNameCol'), dataIndex: 'name', width: 100 },
                  { title: t('aiQuotaAuth.empDeptCol'), dataIndex: 'department', ellipsis: true },
                  { title: t('aiQuotaAuth.empPosCol'), dataIndex: 'position', ellipsis: true },
                  { title: t('aiQuotaAuth.empSeqCol'), dataIndex: 'sequence', width: 70, align: 'center', render: (v: string) => v ? <Tag color={POSITION_SEQUENCE_TAG_COLOR[v]}>{POSITION_SEQUENCE[v] ?? v}</Tag> : '-' },
                  { title: t('aiQuotaAuth.empJobLevelCol'), dataIndex: 'jobLevel', width: 70, align: 'center', render: (v: string) => v || '-' },
                ]}
                dataSource={previewMatchedEmployees}
                pagination={previewMatchedEmployees.length > 10 ? { pageSize: 10, size: 'small' } : false}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#8C8C8C' }}>
                {t('aiQuotaAuth.noMatchEmp')}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              {t('aiQuotaAuth.matchedEmpCount', { count: previewMatchedEmployees.length })}
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
      message.success(t('aiQuotaAuth.roleStrategySaved'))
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
    { key: 'name', title: t('aiQuotaAuth.roleNameCol') },
    { key: 'description', title: t('aiQuotaAuth.descCol') },
    { key: 'employeeCount', title: t('aiQuotaAuth.bindEmpCount') },
    { key: 'quota', title: t('aiQuotaAuth.quotaConfigCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('aiQuotaAuth.actionCol') },
  ]
  const { configComponent: roleConfigComponent } = useColumnConfig('ai-emp-quota-role', roleColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const roleColumns: ColumnsType<RoleItem> = [
    { title: t('aiQuotaAuth.roleNameCol'), dataIndex: 'name', width: 180 },
    { title: t('aiQuotaAuth.descCol'), dataIndex: 'description', ellipsis: true },
    { title: t('aiQuotaAuth.bindEmpCount'), dataIndex: 'userCount', width: 110, align: 'center', render: (v: number) => t('aiQuotaAuth.personUnit', { count: v }) },
    {
      title: t('aiQuotaAuth.quotaConfigCol'), key: 'quota', width: 200,
      render: (_, row) => {
        const strategies = JSON.parse(localStorage.getItem('role_quota_strategies') || '[]')
        const match = strategies.find((s: any) => s.roleName === row.name)
        return match ? (
          <Tag color="success">
            {match.quotaValue} {QUOTA_TYPE_LABEL[match.quotaType as QuotaType]} / {QUOTA_PERIOD_LABEL[match.period as QuotaPeriod]}
          </Tag>
        ) : <Tag>{t('aiQuotaAuth.notConfigured')}</Tag>
      },
    },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (v: number) => (
        <Switch
          checked={v === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          disabled
        />
      ),
    },
    { title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('aiQuotaAuth.actionCol'), key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleRoleQuotaConfig(row)}>{t('aiQuotaAuth.configBtn')}</Button>
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
        message={t('aiQuotaAuth.roleQuotaAlert')}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.roleNameCol')}>
            <Input value={roleQuery} placeholder={t('aiQuotaAuth.roleNamePh')} allowClear onChange={(e) => setRoleQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}>
            <Select
              value={statusFilter}
              placeholder={t('aiQuotaAuth.allOption')}
              allowClear
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 1, label: t('aiQuotaAuth.enableText') },
                { value: 0, label: t('aiQuotaAuth.disableText') },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setRoleQuery('')
                setStatusFilter(undefined)
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('aiQuotaAuth.roleCount', { count: filteredRoles.length })}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleQuotaCreate}>{t('common.add')}</Button>
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
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.totalRoles', { total }) }}
      />

      {/* 角色额度配置弹窗 */}
      <Modal
        title={t('aiQuotaAuth.addRoleStrategy')}
        open={roleQuota !== null}
        onOk={handleRoleQuotaSave}
        onCancel={() => setRoleQuota(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnHidden
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roleName" label={t('aiQuotaAuth.roleNameCol')} rules={[{ required: true, message: t('aiQuotaAuth.roleNameRequired') }]}>
            <Input placeholder={t('aiQuotaAuth.roleNamePh')} allowClear onChange={(e) => setRoleQuota((prev) => prev ? { ...prev, roleName: e.target.value } : prev)} />
          </Form.Item>

          <Form.Item name="employeeIds" label={t('aiQuotaAuth.bindEmpLabel')} rules={[{ required: true, message: t('aiQuotaAuth.bindEmpRequired'), type: 'array', min: 1 }]}>
            <Transfer
              dataSource={employeeTransferData}
              titles={[t('aiQuotaAuth.availableEmp'), t('aiQuotaAuth.selectedEmp')]}
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

          <Divider orientation="left">{t('aiQuotaAuth.quotaConfigDivider')}</Divider>

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
            <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel')} rules={[{ required: true }]}>
              <Select options={[{ value: 'CNY', label: t('aiQuotaAuth.cnyOption') }, { value: 'USD', label: t('aiQuotaAuth.usdOption') }]} />
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
          <div style={{ fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
            {t('aiQuotaAuth.roleQuotaNote')}
          </div>
        </Form>
      </Modal>
    </>
  )

  const tabItems = [
    { key: 'position', label: t('aiQuotaAuth.posQuotaTab'), children: positionContent },
    { key: 'role', label: t('aiQuotaAuth.roleQuotaTab'), children: roleContent },
  ]

  return (
    <div className="content-area">
      <Tabs defaultActiveKey="position" items={tabItems} />
    </div>
  )
}
