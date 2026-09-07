import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Pagination, Select, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, ExportOutlined, TeamOutlined, SafetyCertificateOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchMockEmpPermissions,
  SOURCE_TAG_COLOR,
  type EmpPermissionSummary,
  type EmpQuotaGrant,
  type PermissionSource,
} from '../../api/mock/aiEmpPermissionMock'

/* ══════════ 展示常量 ══════════ */

const QUOTA_TYPE_LABEL: Record<string, string> = { token: 'tokens', request: 'requests' }
const QUOTA_PERIOD_LABEL: Record<string, string> = { daily: '日', monthly: '月' }

/** 額度概况文本 */
function quotaSummaryText(grants: EmpQuotaGrant[]): string {
  if (!grants.length) return '--'
  return grants
    .filter((g) => g.status === 1)
    .map((g) => {
      const val = g.quotaValue.toLocaleString()
      const unit = QUOTA_TYPE_LABEL[g.quotaType]
      const period = QUOTA_PERIOD_LABEL[g.quotaPeriod]
      const eff = g.effectiveType === 'temporary' ? ` · 至${g.expireAt?.slice(0, 10) ?? '--'}` : ' · 永久'
      return `${val} ${unit}/${period}${eff}`
    })
    .join('；') || '--'
}

/** 額度狀態 */
function quotaStatusTag(grants: EmpQuotaGrant[]): { text: string; color: string } | null {
  const active = grants.filter((g) => g.status === 1)
  if (!active.length) return { text: '無額度', color: 'default' }
  const hasExpired = active.some((g) => g.effectiveType === 'temporary' && g.expireAt && new Date(g.expireAt) < new Date())
  if (hasExpired) return { text: '已過期', color: 'error' }
  const nearLimit = active.some((g) => g.quotaValue > 0 && (g.usedValue / g.quotaValue) >= 0.9)
  if (nearLimit) return { text: '即將用盡', color: 'warning' }
  return { text: '正常', color: 'success' }
}

/** 來源篩選選項 */
const SOURCE_OPTIONS: { label: string; value: PermissionSource }[] = [
  { label: '部門配置', value: 'department' },
  { label: '職位配置', value: 'position' },
  { label: '角色配置', value: 'role' },
  { label: '審批授予', value: 'approval' },
]

/* ══════════ 組件 ══════════ */

/**
 * 員工AI權限 — 列表頁
 * 一行一個員工，聚合展示模型數量與額度概況；點擊詳情進入完整權限管理頁
 */
export default function AiEmpPermission() {
  const navigate = useNavigate()

  /* ── 數據 ── */
  const [data, setData] = useState<EmpPermissionSummary[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    fetchMockEmpPermissions()
      .then(setData)
      .catch(() => { message.error('加載數據失敗'); setData([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  /* ── 搜索 ── */
  const [queryName, setQueryName] = useState('')
  const [queryDept, setQueryDept] = useState<string | undefined>(undefined)
  const [querySource, setQuerySource] = useState<PermissionSource | undefined>(undefined)
  const [applied, setApplied] = useState({ name: '', dept: undefined as string | undefined, source: undefined as PermissionSource | undefined })

  const handleSearch = () => setApplied({ name: queryName.trim(), dept: queryDept, source: querySource })
  const handleReset = () => {
    setQueryName(''); setQueryDept(undefined); setQuerySource(undefined)
    setApplied({ name: '', dept: undefined, source: undefined })
  }

  /** 部門選項（從數據中提取） */
  const deptOptions = useMemo(() => {
    const set = new Set<string>()
    data.forEach((d) => set.add(d.department))
    return [...set].map((n) => ({ value: n, label: n }))
  }, [data])

  /** 過濾邏輯 */
  const filtered = useMemo(() => data.filter((row) => {
    if (applied.name && !row.employeeName.toLowerCase().includes(applied.name.toLowerCase())
        && !row.empId.toLowerCase().includes(applied.name.toLowerCase())) return false
    if (applied.dept && row.department !== applied.dept) return false
    if (applied.source) {
      const hasSource = row.modelPermissions.some((m) => m.source === applied.source)
        || row.quotaGrants.some((q) => q.source === applied.source)
      if (!hasSource) return false
    }
    return true
  }), [data, applied])

  /* ── 列定義 ── */
  const columns: ColumnsType<EmpPermissionSummary> = [
    {
      title: '員工', key: 'employee', width: 180,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.empId} · {r.department}</div>
        </div>
      ),
    },
    { title: '職位', dataIndex: 'position', width: 130, ellipsis: true },
    {
      title: '可用模型', key: 'models', width: 260,
      render: (_, r) => {
        const active = r.modelPermissions.filter((m) => m.status === 1)
        if (!active.length) return <span style={{ color: '#BFBFBF' }}>--</span>
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {active.slice(0, 3).map((m) => (
              <Tag key={m.modelId} color={SOURCE_TAG_COLOR[m.source]} style={{ margin: 0, fontSize: 12 }}>
                {m.modelName}
              </Tag>
            ))}
            {active.length > 3 && (
              <Tag style={{ margin: 0, fontSize: 12, color: '#8C8C8C' }}>+{active.length - 3}</Tag>
            )}
          </div>
        )
      },
    },
    {
      title: '額度概況', key: 'quota', width: 260, ellipsis: true,
      render: (_, r) => (
        <span style={{ fontSize: 13, color: '#595959' }}>{quotaSummaryText(r.quotaGrants)}</span>
      ),
    },
    {
      title: '額度狀態', key: 'quotaStatus', width: 100, align: 'center',
      render: (_, r) => {
        const s = quotaStatusTag(r.quotaGrants)
        return s ? <Tag color={s.color}>{s.text}</Tag> : <span style={{ color: '#BFBFBF' }}>--</span>
      },
    },
    {
      title: '最近授予', dataIndex: 'lastGrantedAt', width: 120,
      render: (v: string) => v ? v.slice(0, 10) : '--',
    },
    {
      title: '操作', key: 'action', width: 100, align: 'center', fixed: 'right',
      render: (_, r) => (
        <Button type="link" onClick={() => navigate(`/ai-emp-permission-detail?empId=${r.employeeId}`)}>
          詳情
        </Button>
      ),
    },
  ]

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'employee', title: '員工' },
    { key: 'position', title: '職位' },
    { key: 'models', title: '可用模型' },
    { key: 'quota', title: '額度概況' },
    { key: 'quotaStatus', title: '額度狀態' },
    { key: 'lastGrantedAt', title: '最近授予' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent } = useColumnConfig('ai-emp-permission', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 統計 ── */
  const stats = useMemo(() => ({
    totalEmployees: filtered.length,
    totalModels: new Set(filtered.flatMap((r) => r.modelPermissions.filter((m) => m.status === 1).map((m) => m.modelId))).size,
    withQuota: filtered.filter((r) => r.quotaGrants.some((q) => q.status === 1)).length,
  }), [filtered])

  /* ── 分頁 ── */
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  return (
    <div className="content-area">
      {/* ====== 搜索區域 ====== */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="員工">
            <Input
              value={queryName}
              placeholder="姓名 / 工號"
              allowClear
              onChange={(e) => setQueryName(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="部門">
            <Select
              value={queryDept}
              placeholder="全部"
              allowClear
              options={deptOptions}
              onChange={(v) => setQueryDept(v)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="授權來源">
            <Select
              value={querySource}
              placeholder="全部"
              allowClear
              options={SOURCE_OPTIONS}
              onChange={(v) => setQuerySource(v)}
              style={{ width: '100%' }}
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

      {/* ====== 統計摘要 ====== */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{
          flex: 1, padding: '16px 20px', borderRadius: 10,
          background: '#E6F7FF', border: '1px solid rgba(24,144,255,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(24,144,255,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <TeamOutlined style={{ color: '#1890FF', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>員工總數</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>{stats.totalEmployees}</div>
          </div>
        </div>
        <div style={{
          flex: 1, padding: '16px 20px', borderRadius: 10,
          background: '#F6FFED', border: '1px solid rgba(82,196,26,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(82,196,26,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <AppstoreOutlined style={{ color: '#52C41A', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>已授權模型</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{stats.totalModels}</div>
          </div>
        </div>
        <div style={{
          flex: 1, padding: '16px 20px', borderRadius: 10,
          background: '#FFF7E6', border: '1px solid rgba(232,114,12,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(232,114,12,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <SafetyCertificateOutlined style={{ color: '#E8720C', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>有額度員工</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>{stats.withQuota}</div>
          </div>
        </div>
      </div>

      {/* ====== 操作按鈕區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>導出</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <div className="table-section">
        <Table<EmpPermissionSummary>
          rowKey="employeeId"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </div>

      {/* ====== 分頁 ====== */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={filtered.length}
            showSizeChanger
            pageSizeOptions={['10', '20', '50']}
            showTotal={(total) => `共 ${total} 條`}
            onChange={(p, ps) => { setPage(p); setPageSize(ps) }}
          />
        </div>
      )}
    </div>
  )
}
