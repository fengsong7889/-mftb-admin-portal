import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popover, Progress, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchDeptOptions, fetchModels, type DeptOption, type AiModel } from '../../../api'
import { fetchDeptQuotas, deleteDeptQuota, toggleDeptQuotaStatus, type DeptQuotaVO, type QuotaPeriod } from '../../../api/deptQuota'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  usagePercent,
  usageColor,
  usedText,
  quotaText,
  QUOTA_PERIOD_LABEL,
  ALLOCATE_MODE_LABEL,
  OVER_LIMIT_ACTION_LABEL,
  OVER_LIMIT_TAG,
} from './deptQuotaStore'

/**
 * 部門額度 — 列表頁（獨立菜單 ai-dept-quota）
 * 參考部門模型權控：列表 → 獨立新增/編輯頁（/ai-dept-quota-edit）→ 獨立詳情頁（/ai-dept-quota-detail）
 */
export default function AiDeptQuotaList() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /* ── 基礎數據 ── */
  const [policies, setPolicies] = useState<DeptQuotaVO[]>([])
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([])
  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(false)

  /** 從後端 API 載入部門額度列表 */
  const reload = () => {
    fetchDeptQuotas().then(setPolicies).catch(() => setPolicies([]))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchDeptOptions().catch(() => [] as DeptOption[]),
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
    ]).then(([depts, modelList]) => {
      if (cancelled) return
      setDeptOptions(depts)
      setModels(modelList)
      reload()
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 名稱（超額降級目標展示） */
  const modelName = useMemo(() => {
    const map: Record<number, string> = {}
    models.forEach((m) => { map[m.id] = m.name })
    return map
  }, [models])

  /* ── 查詢過濾 ── */
  const [queryName, setQueryName] = useState('')
  const [queryDept, setQueryDept] = useState<number | undefined>(undefined)
  const [queryPeriod, setQueryPeriod] = useState<QuotaPeriod | undefined>(undefined)
  const [queryStatus, setQueryStatus] = useState<number | undefined>(undefined)
  const [applied, setApplied] = useState({
    name: '', dept: undefined as number | undefined,
    period: undefined as QuotaPeriod | undefined, status: undefined as number | undefined,
  })

  const handleSearch = () => setApplied({ name: queryName.trim(), dept: queryDept, period: queryPeriod, status: queryStatus })
  const handleReset = () => {
    setQueryName(''); setQueryDept(undefined); setQueryPeriod(undefined); setQueryStatus(undefined)
    setApplied({ name: '', dept: undefined, period: undefined, status: undefined })
  }

  const filteredPolicies = useMemo(() => policies.filter((p) => {
    if (applied.name && !p.name.toLowerCase().includes(applied.name.toLowerCase())) return false
    if (applied.dept !== undefined && !p.deptIds.includes(applied.dept)) return false
    if (applied.period && p.period !== applied.period) return false
    if (applied.status !== undefined && p.status !== applied.status) return false
    return true
  }), [policies, applied])

  /* ── 統計 ── */
  const totalDeptCount = useMemo(
    () => new Set(policies.flatMap((p) => p.deptNames)).size,
    [policies],
  )
  const totalEmployeeCount = useMemo(() => policies.reduce((s, p) => s + p.totalEmployeeCount, 0), [policies])

  /* ── 導航至獨立頁面 ── */
  const handleCreate = () => navigate('/ai-dept-quota-edit?type=add')
  const handleEdit = (row: DeptQuotaVO) => navigate(`/ai-dept-quota-edit?id=${row.id}`)
  const handleDetail = (row: DeptQuotaVO) => navigate(`/ai-dept-quota-detail?id=${row.id}`)

  /* ── 刪除（二次確認） ── */
  const handleDelete = (row: DeptQuotaVO) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeleteQuotaPolicy'),
      content: t('aiQuotaAuth.deleteQuotaPolicyContent', { name: row.name, deptCount: row.deptNames.length || row.deptIds.length }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        deleteDeptQuota(row.id).then(() => {
          message.success(t('aiQuotaAuth.policyDeletedMsg', { name: row.name }))
          reload()
        })
      },
    })
  }

  /* ── 啟停（二次確認） ── */
  const handleToggle = (row: DeptQuotaVO) => {
    const toDisable = row.status === 1
    const action = toDisable ? t('aiQuotaAuth.disableText') : t('aiQuotaAuth.enableText')
    Modal.confirm({
      title: toDisable ? t('aiQuotaAuth.confirmDisableQuotaPolicy') : t('aiQuotaAuth.confirmEnableQuotaPolicy'),
      content: toDisable
        ? t('aiQuotaAuth.disableQuotaPolicyContent', { name: row.name })
        : t('aiQuotaAuth.enableQuotaPolicyContent', { name: row.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => {
        toggleDeptQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(t('aiQuotaAuth.policyToggledMsg', { name: row.name, action }))
          reload()
        })
      },
    })
  }

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'deptNames', title: t('aiQuotaAuth.deptNamesCol') },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol') },
    { key: 'allocateMode', title: t('aiQuotaAuth.quotaAllocCol') },
    { key: 'quota', title: t('aiQuotaAuth.limitCol') },
    { key: 'usage', title: t('aiQuotaAuth.currentUsageCol') },
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol') },
    { key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdaterCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdateAtCol') },
    { key: 'action', title: t('aiQuotaAuth.actionCol') },
  ]
  const { configComponent, applyConfig } = useColumnConfig('ai-dept-quota', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<DeptQuotaVO> = [
    {
      key: 'configCode', title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 180 },
    {
      key: 'deptNames', title: t('aiQuotaAuth.deptNamesCol'), dataIndex: 'deptNames', width: 240,
      render: (v: string[]) => (
        v.length ? (
          <span>
            {v.slice(0, 3).map((name) => (
              <Tag key={name} style={{ marginRight: 4, marginBottom: 2 }}>{name}</Tag>
            ))}
            {v.length > 3 && (
              <Popover
                content={<div style={{ maxWidth: 300 }}>{v.map((name) => <Tag key={name} style={{ marginRight: 4, marginBottom: 4 }}>{name}</Tag>)}</div>}
                title={t('aiQuotaAuth.allDeptPopover', { count: v.length })}
                trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{v.length - 3}</Tag>
              </Popover>
            )}
          </span>
        ) : <span style={{ color: '#BFBFBF' }}>--</span>
      ),
    },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol'), dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => t('aiQuotaAuth.personUnitRender', { count: v.toLocaleString() }) },
    {
      key: 'allocateMode', title: t('aiQuotaAuth.quotaAllocCol'), dataIndex: 'allocateMode', width: 120, align: 'center',
      render: (v: DeptQuotaVO['allocateMode']) => (
        <Tag color={v === 'per_capita' ? 'blue' : 'default'}>{ALLOCATE_MODE_LABEL[v]}</Tag>
      ),
    },
    {
      key: 'quota', title: t('aiQuotaAuth.limitCol'), width: 180, align: 'right',
      render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{quotaText(row)}</span>,
    },
    {
      key: 'usage', title: t('aiQuotaAuth.currentUsageCol'), width: 200,
      render: (_, row) => {
        const pct = usagePercent(row)
        return (
          <div>
            <Progress
              percent={Math.min(pct, 100)}
              size="small"
              showInfo={false}
              strokeColor={usageColor(row)}
              style={{ marginBottom: 2 }}
            />
            <div style={{ fontSize: 12, color: '#595959', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#8C8C8C' }}>{usedText(row)}</span>
              <span style={{ color: usageColor(row), fontWeight: 600 }}>{pct}%</span>
            </div>
          </div>
        )
      },
    },
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol'), dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol'), dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: DeptQuotaVO['overLimitAction'], row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>
          {OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}
        </Tag>
      ),
    },
    {
      key: 'status', title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => (
        <Switch checked={row.status === 1} checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} onChange={() => handleToggle(row)} />
      ),
    },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdaterCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdateAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: t('aiQuotaAuth.actionCol'), width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handleEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.strategyNameCol')}>
            <Input value={queryName} placeholder={t('aiQuotaAuth.strategyNamePh')} allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.deptNamesCol')}>
            <Select
              value={queryDept}
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={deptOptions.map((d) => ({ value: d.deptId, label: d.deptName }))}
              onChange={(v) => setQueryDept(v)}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.quotaPeriodFilter')}>
            <Select
              value={queryPeriod}
              placeholder={t('common.all')}
              allowClear
              options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={(v) => setQueryPeriod(v)}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}>
            <Select
              value={queryStatus}
              placeholder={t('common.all')}
              allowClear
              options={[{ value: 1, label: t('aiQuotaAuth.enableText') }, { value: 0, label: t('aiQuotaAuth.disableText') }]}
              onChange={(v) => setQueryStatus(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiQuotaAuth.deptQuotaAlertMsg')}
        description={<span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('aiQuotaAuth.deptQuotaAlertDesc')}</span>}
      />

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('aiQuotaAuth.deptQuotaStats', { count: policies.length, deptCount: totalDeptCount, empCount: totalEmployeeCount.toLocaleString() })}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>{t('common.add')}</Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={filteredPolicies}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.paginationTotalPolicy', { total }) }}
      />
    </div>
  )
}
