import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popover, Progress, Select, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
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
      title: '確認刪除該額度策略？',
      content: `刪除後「${row.name}」立即失效，關聯的 ${row.deptNames.length || row.deptIds.length} 個部門員工不再受此限額約束。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteDeptQuota(row.id).then(() => {
          message.success(`策略「${row.name}」已刪除`)
          reload()
        })
      },
    })
  }

  /* ── 啟停（二次確認） ── */
  const handleToggle = (row: DeptQuotaVO) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該額度策略？`,
      content: `${actionText}後「${row.name}」關聯的部門員工${toDisable ? '不再受此限額約束' : '將恢復限額約束'}。`,
      okText: '確認',
      cancelText: '取消',
      onOk: () => {
        toggleDeptQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(`策略「${row.name}」已${actionText}`)
          reload()
        })
      },
    })
  }

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'configCode', title: '配置ID' },
    { key: 'name', title: '策略名稱' },
    { key: 'deptNames', title: '適用部門' },
    { key: 'totalEmployeeCount', title: '覆蓋人數' },
    { key: 'allocateMode', title: '額度分配' },
    { key: 'quota', title: '限額' },
    { key: 'usage', title: '本期用量' },
    { key: 'softThreshold', title: '軟提醒' },
    { key: 'overLimitAction', title: '超額動作' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent, applyConfig } = useColumnConfig('ai-dept-quota', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<DeptQuotaVO> = [
    {
      key: 'configCode', title: '配置ID', dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'name', title: '策略名稱', dataIndex: 'name', width: 180 },
    {
      key: 'deptNames', title: '適用部門', dataIndex: 'deptNames', width: 240,
      render: (v: string[]) => (
        v.length ? (
          <span>
            {v.slice(0, 3).map((name) => (
              <Tag key={name} style={{ marginRight: 4, marginBottom: 2 }}>{name}</Tag>
            ))}
            {v.length > 3 && (
              <Popover
                content={<div style={{ maxWidth: 300 }}>{v.map((name) => <Tag key={name} style={{ marginRight: 4, marginBottom: 4 }}>{name}</Tag>)}</div>}
                title={`全部部門（${v.length}）`}
                trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{v.length - 3}</Tag>
              </Popover>
            )}
          </span>
        ) : <span style={{ color: '#BFBFBF' }}>--</span>
      ),
    },
    { key: 'totalEmployeeCount', title: '覆蓋人數', dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => `${v.toLocaleString()} 人` },
    {
      key: 'allocateMode', title: '額度分配', dataIndex: 'allocateMode', width: 120, align: 'center',
      render: (v: DeptQuotaVO['allocateMode']) => (
        <Tag color={v === 'per_capita' ? 'blue' : 'default'}>{ALLOCATE_MODE_LABEL[v]}</Tag>
      ),
    },
    {
      key: 'quota', title: '限額', width: 180, align: 'right',
      render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{quotaText(row)}</span>,
    },
    {
      key: 'usage', title: '本期用量', width: 200,
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
    { key: 'softThreshold', title: '軟提醒', dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: '超額動作', dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: DeptQuotaVO['overLimitAction'], row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>
          {OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}
        </Tag>
      ),
    },
    {
      key: 'status', title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => (
        <Switch checked={row.status === 1} checkedChildren="啟用" unCheckedChildren="停用" onChange={() => handleToggle(row)} />
      ),
    },
    { key: 'updatedBy', title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: '操作', width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleDetail(row)}>詳情</Button>
          <Button type="link" onClick={() => handleEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="策略名稱">
            <Input value={queryName} placeholder="請輸入策略名稱" allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label="適用部門">
            <Select
              value={queryDept}
              placeholder="全部"
              allowClear
              showSearch
              optionFilterProp="label"
              options={deptOptions.map((d) => ({ value: d.deptId, label: d.deptName }))}
              onChange={(v) => setQueryDept(v)}
            />
          </Form.Item>
          <Form.Item label="限額周期">
            <Select
              value={queryPeriod}
              placeholder="全部"
              allowClear
              options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={(v) => setQueryPeriod(v)}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              value={queryStatus}
              placeholder="全部"
              allowClear
              options={[{ value: 1, label: '啟用' }, { value: 0, label: '停用' }]}
              onChange={(v) => setQueryStatus(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="每條策略可關聯多個部門，共享同一套額度規則。網關在每次請求前校驗用量：達到軟提醒閾值時通知員工與主管，超出限額則按「超額動作」處理（拒絕 / 審批 / 降級）。"
      />

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>
            共 {policies.length} 條策略，覆蓋 {totalDeptCount} 個部門 {totalEmployeeCount.toLocaleString()} 人
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新增</Button>
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
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條策略` }}
      />
    </div>
  )
}
