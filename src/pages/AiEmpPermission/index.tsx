import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Pagination, Popover, Select, Table, Tag, TreeSelect, message } from 'antd'
import type { Dayjs } from 'dayjs'
import type { DataNode } from 'antd/es/tree'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  flattenDepts,
  MOCK_DEPT_TREE,
  SOURCE_TAG_COLOR,
  QUOTA_STATUS_LABEL,
  QUOTA_STATUS_COLOR,
  calcQuotaStatus,
  type EmpPermissionSummary,
  type EmpQuotaGrant,
  type PermissionSource,
  type QuotaStatus,
} from '../../api/mock/aiEmpPermissionMock'
import { fetchEmpPermissionList } from '../../api/empPermission'

/* ══════════ 展示常量 ══════════ */

const QUOTA_TYPE_LABEL: Record<string, string> = { token: 'tokens', request: 'requests', currency: '元' }
const QUOTA_PERIOD_LABEL: Record<string, string> = { daily: '日', monthly: '月' }

/** 額度狀態篩選選項 */
const QUOTA_STATUS_OPTIONS: { label: string; value: QuotaStatus }[] = [
  { label: '正常', value: 'normal' },
  { label: '已用完', value: 'exhausted' },
  { label: '凍結', value: 'frozen' },
]

/** 來源篩選選項 */
const SOURCE_OPTIONS: { label: string; value: PermissionSource }[] = [
  { label: '部門配置', value: 'department' },
  { label: '職位配置', value: 'position' },
  { label: '角色配置', value: 'role' },
  { label: '審批授予', value: 'approval' },
]

/** 額度分組：按 quotaType + quotaPeriod 分組合併同類額度 */
interface QuotaGroup { key: string; unit: string; period: string; total: number; used: number }

function groupQuotas(grants: EmpQuotaGrant[]): QuotaGroup[] {
  const active = grants.filter((g) => g.status === 1)
  if (!active.length) return []
  const map = new Map<string, QuotaGroup>()
  active.forEach((g) => {
    const key = `${g.quotaType}_${g.quotaPeriod}`
    if (!map.has(key)) {
      map.set(key, { key, unit: QUOTA_TYPE_LABEL[g.quotaType], period: QUOTA_PERIOD_LABEL[g.quotaPeriod], total: 0, used: 0 })
    }
    const group = map.get(key)!
    group.total += g.quotaValue
    group.used += Math.min(g.usedValue, g.quotaValue)
  })
  return [...map.values()]
}

/* ══════════ 部門樹 ══════════ */

/** 構建 TreeSelect 用的樹形數據 */
function buildDeptTreeData(): DataNode[] {
  const flat = flattenDepts(MOCK_DEPT_TREE)
  const nodeMap = new Map<number, DataNode>()
  flat.forEach((f) => nodeMap.set(f.id, { key: f.id, title: f.name, children: [] }))
  const roots: DataNode[] = []
  flat.forEach((f) => {
    const node = nodeMap.get(f.id)!
    if (f.parentId != null) {
      const parent = nodeMap.get(f.parentId)
      if (parent) parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/* ══════════ 組件 ══════════ */

/**
 * 員工AI權額管理 — 列表頁
 * 一行一個員工，聚合展示模型數量與額度概況；點擊詳情/編輯進入對應模式
 */
export default function AiEmpPermission() {
  const navigate = useNavigate()

  /* ── 數據 ── */
  const [data, setData] = useState<EmpPermissionSummary[]>([])
  const [loading, setLoading] = useState(false)

  /* ── 搜索 ── */
  const [queryName, setQueryName] = useState('')
  const [queryDept, setQueryDept] = useState<number | undefined>(undefined)
  const [querySource, setQuerySource] = useState<PermissionSource | undefined>(undefined)
  const [queryQuotaStatus, setQueryQuotaStatus] = useState<QuotaStatus | undefined>(undefined)
  const [queryUpdatedBy, setQueryUpdatedBy] = useState('')
  const [queryUpdateTime, setQueryUpdateTime] = useState<[Dayjs, Dayjs] | null>(null)
  const [applied, setApplied] = useState({
    name: '', dept: undefined as number | undefined,
    source: undefined as PermissionSource | undefined,
    quotaStatus: undefined as QuotaStatus | undefined,
    updatedBy: '', updateTime: null as [Dayjs, Dayjs] | null,
  })

  const reload = useCallback(() => {
    setLoading(true)
    fetchEmpPermissionList({
      queryName: applied.name || undefined,
      queryDept: applied.dept != null ? String(applied.dept) : undefined,
      queryUpdatedBy: applied.updatedBy || undefined,
      queryUpdateTimeStart: applied.updateTime?.[0]?.format('YYYY-MM-DD') ?? undefined,
      queryUpdateTimeEnd: applied.updateTime?.[1]?.format('YYYY-MM-DD') ?? undefined,
    })
      .then(setData)
      .catch(() => { message.error('加載數據失敗'); setData([]) })
      .finally(() => setLoading(false))
  }, [applied])

  useEffect(() => { reload() }, [reload])

  const handleSearch = () => setApplied({
    name: queryName.trim(), dept: queryDept,
    source: querySource, quotaStatus: queryQuotaStatus,
    updatedBy: queryUpdatedBy.trim(), updateTime: queryUpdateTime,
  })
  const handleReset = () => {
    setQueryName(''); setQueryDept(undefined); setQuerySource(undefined); setQueryQuotaStatus(undefined)
    setQueryUpdatedBy(''); setQueryUpdateTime(null)
    setApplied({ name: '', dept: undefined, source: undefined, quotaStatus: undefined, updatedBy: '', updateTime: null })
  }

  /** 部門樹形選項 */
  const deptTreeData = useMemo(() => buildDeptTreeData(), [])

  /** 過濾邏輯 */
  const filtered = useMemo(() => data.filter((row) => {
    if (applied.name && !row.employeeName.toLowerCase().includes(applied.name.toLowerCase())
        && !row.empId.toLowerCase().includes(applied.name.toLowerCase())) return false
    if (applied.dept && row.deptId !== applied.dept) return false
    if (applied.source) {
      const hasSource = row.modelPermissions.some((m) => m.source === applied.source)
        || row.quotaGrants.some((q) => q.source === applied.source)
      if (!hasSource) return false
    }
    if (applied.quotaStatus) {
      if (calcQuotaStatus(row.quotaGrants) !== applied.quotaStatus) return false
    }
    if (applied.updatedBy && !row.lastUpdatedBy.includes(applied.updatedBy)) return false
    if (applied.updateTime) {
      const rowDate = row.lastUpdatedAt.slice(0, 10)
      if (rowDate < applied.updateTime[0].format('YYYY-MM-DD') || rowDate > applied.updateTime[1].format('YYYY-MM-DD')) return false
    }
    return true
  }), [data, applied])

  /* ── 列定義 ── */
  const columns: ColumnsType<EmpPermissionSummary> = [
    {
      title: '員工', key: 'employee', width: 140,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.empId}</div>
        </div>
      ),
    },
    { title: '所屬部門', dataIndex: 'department', width: 120, ellipsis: true },
    {
      title: '職位', key: 'position', width: 150,
      render: (_, r) => (
        <span>{r.position}<span style={{ color: '#8C8C8C', marginLeft: 4 }}>({r.jobLevel})</span></span>
      ),
    },
    {
      title: '授權模型', key: 'models', width: 240,
      render: (_, r) => {
        const active = r.modelPermissions.filter((m) => m.status === 1)
        if (!active.length) return <span style={{ color: '#BFBFBF' }}>--</span>
        const show = active.slice(0, 3)
        const rest = active.slice(3)
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {show.map((m) => (
              <Tag key={m.modelId} color={SOURCE_TAG_COLOR[m.source]} style={{ margin: 0, fontSize: 12 }}>
                {m.modelName}
              </Tag>
            ))}
            {rest.length > 0 && (
              <Popover
                trigger="click"
                title="全部授權模型"
                content={
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 320 }}>
                    {active.map((m) => (
                      <Tag key={m.modelId} color={SOURCE_TAG_COLOR[m.source]} style={{ margin: 0, fontSize: 12 }}>
                        {m.modelName}
                      </Tag>
                    ))}
                  </div>
                }
              >
                <Tag style={{ margin: 0, fontSize: 12, color: '#1890FF', cursor: 'pointer', borderColor: '#91CAFF' }}>
                  +{rest.length}
                </Tag>
              </Popover>
            )}
          </div>
        )
      },
    },
    {
      title: '授予額度', key: 'quota', width: 220,
      render: (_, r) => {
        const groups = groupQuotas(r.quotaGrants)
        if (!groups.length) return <span style={{ color: '#BFBFBF' }}>--</span>
        const show = groups.slice(0, 2)
        const rest = groups.slice(2)
        const fmtLine = (g: QuotaGroup) => {
          const pct = g.total > 0 ? Math.floor((g.used / g.total) * 100) : 0
          const color = pct >= 90 ? '#FF4D4F' : pct >= 70 ? '#FAAD14' : '#52C41A'
          return (
            <div key={g.key} style={{ fontSize: 12, lineHeight: '20px' }}>
              <span style={{ fontWeight: 600, color }}>{g.used.toLocaleString()}</span>
              <span style={{ color: '#BFBFBF', margin: '0 2px' }}>/</span>
              <span>{g.total.toLocaleString()}</span>
              <span style={{ color: '#8C8C8C', marginLeft: 3, fontSize: 11 }}>{g.unit}/{g.period}</span>
            </div>
          )
        }
        return (
          <div>
            {show.map(fmtLine)}
            {rest.length > 0 && (
              <Popover
                trigger="click"
                title="全部授予額度"
                content={<div style={{ maxWidth: 260 }}>{groups.map(fmtLine)}</div>}
              >
                <span style={{ fontSize: 12, color: '#E8720C', cursor: 'pointer' }}>+{rest.length} 更多</span>
              </Popover>
            )}
          </div>
        )
      },
    },
    {
      title: '額度狀態', key: 'quotaStatus', width: 100, align: 'center',
      render: (_, r) => {
        const status = calcQuotaStatus(r.quotaGrants)
        return <Tag color={QUOTA_STATUS_COLOR[status]}>{QUOTA_STATUS_LABEL[status]}</Tag>
      },
    },
    {
      title: '最後更新人', dataIndex: 'lastUpdatedBy', width: 100, ellipsis: true,
    },
    {
      title: '最後更新時間', dataIndex: 'lastUpdatedAt', width: 150,
      render: (v: string) => v ? v.slice(0, 16) : '--',
    },
    {
      title: '操作', key: 'action', width: 110, align: 'center', fixed: 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Button type="link" size="small" onClick={() => navigate(`/ai-emp-permission-detail?empId=${r.employeeId}`)}>
            詳情
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/ai-emp-permission-detail?empId=${r.employeeId}&mode=edit`)}>
            編輯
          </Button>
        </div>
      ),
    },
  ]

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'employee', title: '員工' },
    { key: 'department', title: '所屬部門' },
    { key: 'position', title: '職位' },
    { key: 'models', title: '授權模型' },
    { key: 'quota', title: '授予額度' },
    { key: 'quotaStatus', title: '額度狀態' },
    { key: 'lastUpdatedBy', title: '最後更新人' },
    { key: 'lastUpdatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent } = useColumnConfig('ai-emp-permission', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

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
            <TreeSelect
              value={queryDept}
              placeholder="全部"
              allowClear
              treeData={deptTreeData}
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              onChange={(v) => setQueryDept(v)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label="額度狀態">
            <Select
              value={queryQuotaStatus}
              placeholder="全部"
              allowClear
              options={QUOTA_STATUS_OPTIONS}
              onChange={(v) => setQueryQuotaStatus(v)}
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item label="授權來源">
            <Select
              value={querySource}
              placeholder="全部"
              allowClear
              options={SOURCE_OPTIONS}
              onChange={(v) => setQuerySource(v)}
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item label="最後更新人">
            <Input
              value={queryUpdatedBy}
              placeholder="操作人姓名"
              allowClear
              onChange={(e) => setQueryUpdatedBy(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="最後更新時間">
            <DatePicker.RangePicker
              value={queryUpdateTime}
              onChange={(v) => setQueryUpdateTime(v as [Dayjs, Dayjs] | null)}
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
          scroll={{ x: 1500 }}
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
