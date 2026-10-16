/**
 * 項目總覽 —— V3 分批交付項目列表與統計
 *
 * 佈局順序（AGENTS.md 強制 / check:stat-order）：search-section → 統計卡 → action-section → Table
 *
 * 任務30 強化：
 * 1. URL 保留篩選與分頁（keyword/status/pmUserId/pageNo/pageSize 同步 Hash query，刷新/返回不丟）；
 * 2. 負責人 pmUserId 真正進入查詢參數（此前只收集不查）；
 * 3. 三張統計卡可下鑽（點擊按該口徑過濾清單，再點取消）；
 * 4. 統計失敗不回零（保留上次值 + 明確錯誤態）；
 * 5. 全量報告導出（export-bundle 全量 + ExcelJS 多 Sheet，帶當前 filters，導出前校 reconciliation）；
 * 6. 暫停/恢復真調後端（updateProject，先取 version 做乐观锁）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchExportBundle,
  fetchProjectDetail,
  fetchProjectPage,
  fetchProjectStats,
  updateProject,
  type RdmFactQuery,
  type RdmProjectListItem,
  type RdmProjectQuery,
  type RdmProjectStatsCard,
} from '../../api/rdm'
import { fetchEmployees, type EmployeeItem } from '../../api/employee'
import { exportProjectBundle } from './projectExport'
import {
  RDM_PROJECT_STATUS_COLOR,
  RDM_PROJECT_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

/** 進度狀態下拉選項（從常量生成，禁止硬編碼） */
const STATUS_OPTIONS = Object.entries(RDM_PROJECT_STATUS_LABEL).map(([value, label]) => ({ value, label }))

/** 分頁默認值 */
const DEFAULT_PAGE_SIZE = 20

/** 下鑽口徑（點擊統計卡過濾清單） */
type DrillKey = 'inProgress' | 'attention' | 'pending'

/** 各下鑽口徑的客戶端判定（在當前 filters 結果集內再按口徑收窄） */
const DRILL_PREDICATE: Record<DrillKey, (r: RdmProjectListItem) => boolean> = {
  inProgress: r => r.status === 'in_progress',
  attention: r => !!r.riskFlag || r.blockedCount > 0 || !!r.overdueFlag,
  pending: r => r.pendingDecisionCount > 0,
}
const DRILL_LABEL: Record<DrillKey, string> = {
  inProgress: '進行中項目',
  attention: '需關注項目',
  pending: '待裁決事項',
}

/**
 * 列配置元數據（§E.3 列表頁必須可顯隱/調序）。
 * key/title 與下方 columns 逐字對應，新增/改名列時兩處同步，否則該列不會出現在字段設置面板。
 */
const COLUMN_META = [
  { key: 'name', title: '項目及目標' },
  { key: 'pmUserName', title: '負責人' },
  { key: 'delivery', title: '交付進度' },
  { key: 'remaining', title: '剩餘工作' },
  { key: 'nextDeliveryDate', title: '下次交付' },
  { key: 'blockDecision', title: '阻塞/待裁決' },
  { key: 'status', title: '進度狀態' },
  { key: 'updatedAt', title: '更新時間' },
  { key: 'action', title: '操作' },
]

export default function ProjectOverview() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── URL 是篩選/分頁的單一事實源（刷新/返回不丟條件） ──
  const keyword = searchParams.get('keyword') ?? ''
  const status = searchParams.get('status') ?? undefined
  const pmUserId = searchParams.get('pmUserId') ? Number(searchParams.get('pmUserId')) : undefined
  const pmName = searchParams.get('pmName') ?? ''
  const pageNo = Number(searchParams.get('pageNo') ?? 1)
  const pageSize = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)
  const drill = (searchParams.get('drill') as DrillKey | null) ?? null

  // ── 搜索草稿（輸入過程不入 URL，點「查詢」才提交） ──
  const [keywordDraft, setKeywordDraft] = useState(keyword)
  const [statusDraft, setStatusDraft] = useState<string | undefined>(status)
  const [pmDraft, setPmDraft] = useState<{ value: number; label: string } | undefined>(
    pmUserId ? { value: pmUserId, label: pmName || `#${pmUserId}` } : undefined,
  )
  const [pmOptions, setPmOptions] = useState<{ value: number; label: string }[]>([])
  const [pmSearching, setPmSearching] = useState(false)

  // ── 列表數據 ──
  const [rows, setRows] = useState<RdmProjectListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 統計卡數據（失敗保留上次值，不回零） ──
  const [stats, setStats] = useState<RdmProjectStatsCard | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const lastGoodStats = useRef<RdmProjectStatsCard | null>(null)
  const [statsAnimKey, setStatsAnimKey] = useState(0)

  const [exporting, setExporting] = useState(false)

  // ── 提交到 URL（合併式更新，未傳的鍵保留） ──
  const commitQuery = useCallback((patch: Record<string, string | number | undefined | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k)
        else next.set(k, String(v))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  // ── 由 URL 派生的查詢參數（fetchProjectPage / stats / export-bundle 共用同一組 filters） ──
  const queryParams = useMemo<RdmProjectQuery>(
    () => ({ keyword: keyword || undefined, status, pmUserId, pageNo, pageSize }),
    [keyword, status, pmUserId, pageNo, pageSize],
  )

  // ── 載入列表 ──
  const loadList = useCallback(async (params: RdmProjectQuery) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchProjectPage(params)
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setError('項目列表載入失敗，請重試')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 載入統計卡（失敗不回零：保留 lastGoodStats，僅標記錯誤態） ──
  const loadStats = useCallback(async (params: RdmProjectQuery) => {
    setStatsLoading(true)
    try {
      const res = await fetchProjectStats(params)
      lastGoodStats.current = res
      setStats(res)
      setStatsError(false)
    } catch {
      // 不靜默歸零：有上次值就沿用，沒有就保持 null（卡片渲染「—」明確錯誤態）
      setStats(lastGoodStats.current)
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList(queryParams)
    loadStats(queryParams)
  }, [queryParams, loadList, loadStats])

  // ── 負責人搜索（員工接口，labelInValue → pmUserId 進查詢） ──
  const handlePmSearch = useCallback(async (kw: string) => {
    setPmSearching(true)
    try {
      const res = await fetchEmployees({ page: 1, size: 20, keyword: kw || undefined })
      setPmOptions((res.records ?? []).map((e: EmployeeItem) => ({ value: e.id, label: e.name })))
    } catch {
      setPmOptions([])
    } finally {
      setPmSearching(false)
    }
  }, [])

  // ── 查詢 ──
  const handleSearch = () => {
    commitQuery({ keyword: keywordDraft.trim(), status: statusDraft, pmUserId: pmDraft?.value, pmName: pmDraft?.label, pageNo: 1 })
    setStatsAnimKey(k => k + 1)
  }

  // ── 重置 ──
  const handleReset = () => {
    setKeywordDraft('')
    setStatusDraft(undefined)
    setPmDraft(undefined)
    setSearchParams(new URLSearchParams(), { replace: true })
    setStatsAnimKey(k => k + 1)
  }

  // ── 分頁 ──
  /** §E.4：每页条数变化时必须重置到第 1 页，否则会从越界页码发起空结果查询 */
  const handlePageChange = (page: number, size: number) =>
    commitQuery({ pageNo: size !== pageSize ? 1 : page, pageSize: size })

  // ── 卡片下鑽（再點同口徑取消） ──
  const handleDrill = (key: DrillKey) => {
    commitQuery({ drill: drill === key ? undefined : key, pageNo: 1 })
  }

  // ── 暫停 / 恢復（真調後端；RdmProjectListItem 無 version，先取詳情拿乐观锁版本） ──
  const handleTogglePause = (record: RdmProjectListItem) => {
    const nextPaused = !record.pausedFlag
    Modal.confirm({
      title: nextPaused ? '確認暫停項目' : '確認恢復推進',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: nextPaused
        ? `暫停「${record.name}」後，該項目不再計入推進口徑，確定繼續嗎？`
        : `恢復「${record.name}」推進，確定繼續嗎？`,
      okText: nextPaused ? '確認暫停' : '確認恢復',
      okType: nextPaused ? 'danger' : 'primary',
      cancelText: '取消',
      onOk: async () => {
        try {
          const detail = await fetchProjectDetail(record.id)
          await updateProject(record.id, { pausedFlag: nextPaused, expectedVersion: detail.version })
          message.success(nextPaused ? '已暫停項目' : '已恢復推進')
          loadList(queryParams)
          loadStats(queryParams)
        } catch {
          // request.ts 已统一弹后端失败原因，这里不再双弹
        }
      },
    })
  }

  // ── 全量導出（export-bundle 全量 + ExcelJS；帶當前 filters；導出前校 reconciliation） ──
  const buildFilterLabel = () => {
    const parts: string[] = []
    if (keyword) parts.push(`關鍵詞=${keyword}`)
    if (status) parts.push(`狀態=${RDM_PROJECT_STATUS_LABEL[status] ?? status}`)
    if (pmUserId) parts.push(`負責人=${pmName || `#${pmUserId}`}`)
    return parts.length ? parts.join('，') : '全部項目（無篩選）'
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const factQuery: RdmFactQuery = { keyword: keyword || undefined, status, pmUserId, includeTodos: true, includeItems: true }
      const bundle = await fetchExportBundle(factQuery)
      if (!bundle) {
        message.error('導出數據載入失敗（後端不可用），請重試')
        return
      }
      const rec = bundle.reconciliation
      const doExport = () => exportProjectBundle(bundle, buildFilterLabel())
        .then(() => message.success('全量報告已導出（含全部項目/交付項/待辦，非當前頁）'))
        .catch(() => message.error('導出失敗，請重試'))
      // 對賬不一致：給出提示而非靜默導出（仍允許用戶確認後導出，但明示口徑風險）
      if (!rec.consistent || rec.mismatches.length > 0) {
        Modal.confirm({
          title: '對賬口徑不一致',
          className: 'custom-confirm-modal',
          icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
          content: (
            <div>
              <div style={{ marginBottom: 8 }}>導出前對賬發現 <b>{rec.mismatches.length || '若干'}</b> 處不一致，導出數字可能與逐行口徑存在偏差：</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#CF1322' }}>
                {(rec.mismatches.length ? rec.mismatches : ['對賬未通過']).slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <div style={{ marginTop: 8, color: '#8C8C8C' }}>仍要導出嗎？</div>
            </div>
          ),
          okText: '仍要導出',
          okType: 'danger',
          cancelText: '取消',
          onOk: doExport,
        })
      } else {
        await doExport()
      }
    } finally {
      setExporting(false)
    }
  }

  // ── 行操作下拉菜單 ──
  const getRowMenuItems = (record: RdmProjectListItem) => [
    { key: 'edit', label: '編輯項目', onClick: () => navigate(`/rdm-project-detail?id=${record.id}&mode=edit&${searchParams.toString()}`) },
    { key: 'pause', label: record.pausedFlag ? '恢復推進' : '暫停項目', onClick: () => handleTogglePause(record) },
  ]

  // ── 下鑽過濾後的行（在當前 filters 結果集內按口徑收窄） ──
  const visibleRows = useMemo(() => (drill ? rows.filter(DRILL_PREDICATE[drill]) : rows), [rows, drill])

  // ── 表格排序 ──
  const [sortField, setSortField] = useState<string>('updatedAt')
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend')
  const handleTableChange = (_p: unknown, _f: unknown, sorter: unknown) => {
    const s = sorter as { field?: string; order?: 'ascend' | 'descend' | null }
    if (s.field && s.order) { setSortField(s.field); setSortOrder(s.order) }
    else { setSortField('updatedAt'); setSortOrder('descend') }
  }
  const sortedRows = useMemo(() => {
    if (!visibleRows.length) return visibleRows
    const sorted = [...visibleRows]
    sorted.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortField]
      const bv = (b as unknown as Record<string, unknown>)[sortField]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = String(av).localeCompare(String(bv))
      return sortOrder === 'ascend' ? cmp : -cmp
    })
    return sorted
  }, [visibleRows, sortField, sortOrder])

  // ── 統計卡數值（無數據渲染「—」，不回零） ──
  const statVal = (v: number | undefined) => (stats ? (v ?? 0) : '—')

  const columns: TableColumnsType<RdmProjectListItem> = [
    {
      title: '項目及目標', dataIndex: 'name', key: 'name', width: 280,
      render: (name: string, record) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontWeight: 600, color: '#262626', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}
            title={name}
          >
            {name}
          </div>
          {record.objective && (
            <div style={{ fontSize: 12, color: '#8C8C8C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }} title={record.objective}>
              {record.objective}
            </div>
          )}
        </div>
      ),
    },
    { title: '負責人', dataIndex: 'pmUserName', key: 'pmUserName', width: 100, render: (v?: string | null) => v || '-' },
    {
      title: '交付進度', key: 'delivery', width: 180,
      render: (_, record) => (
        <span style={{ color: '#1890FF', cursor: 'pointer', fontSize: 13 }} onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}>
          已交付 <b>{record.deliveredCount}</b> 項／承諾 <b>{record.totalDeliveryCount}</b> 項
        </span>
      ),
    },
    {
      title: '剩餘工作', key: 'remaining', width: 130,
      render: (_, record) => {
        const remaining = record.totalDeliveryCount - record.deliveredCount
        if (remaining <= 0) return <span style={{ color: '#52C41A' }}>全部完成</span>
        return (
          <span style={{ fontSize: 13, color: '#595959' }}>
            {record.blockedCount > 0 && <Tag color="error" style={{ marginRight: 4 }}>阻塞 {record.blockedCount}</Tag>}
            另有 {remaining} 項
          </span>
        )
      },
    },
    { title: '下次交付', dataIndex: 'nextDeliveryDate', key: 'nextDeliveryDate', width: 120, render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span> },
    {
      title: '阻塞/待裁決', key: 'blockDecision', width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.blockedCount > 0 && <Tag color="error" style={{ margin: 0 }}>{record.blockedCount} 阻塞</Tag>}
          {record.pendingDecisionCount > 0 && <Tag color="purple" style={{ margin: 0 }}>{record.pendingDecisionCount} 待裁決</Tag>}
          {record.blockedCount === 0 && record.pendingDecisionCount === 0 && <span style={{ color: '#52C41A', fontSize: 12 }}>正常</span>}
        </Space>
      ),
    },
    {
      title: '進度狀態', dataIndex: 'status', key: 'status', width: 110,
      render: (v: string, record) => (
        <Space size={4}>
          <Tag color={RDM_PROJECT_STATUS_COLOR[v] ?? 'default'} style={{ margin: 0 }}>{RDM_PROJECT_STATUS_LABEL[v] ?? v}</Tag>
          {record.pausedFlag && <Tag color="warning" style={{ margin: 0 }}>已暫停</Tag>}
          {record.riskFlag && <Tag color="error" style={{ margin: 0 }}>風險</Tag>}
        </Space>
      ),
    },
    { title: '更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 120, sorter: true, defaultSortOrder: 'descend', render: (v?: string) => v?.slice(0, 10) || '-' },
    {
      title: '操作', key: 'action', width: 130, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}>詳情</Button>
          {/* §B.9 操作列禁止图标，「更多」保持纯文字（Dropdown 靠点击） */}
          <Dropdown menu={{ items: getRowMenuItems(record) }} trigger={['click']}>
            <Button type="link" size="small">更多</Button>
          </Dropdown>
        </Space>
      ),
    },
  ]

  // §E.3 列配置：字段设置面板放操作区右侧，首列与操作列锁定
  const { configComponent, applyConfig } = useColumnConfig('rdm-project-overview', COLUMN_META, [
    { key: 'name', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const visibleColumns = applyConfig(columns)
  // 横向滚动宽度按「当前可见列」累计，隐藏列不再撑出空白
  const tableWidth = visibleColumns.reduce((sum, col) => sum + Number(col.width ?? 120), 0)
  const canManageGrayscale = hasPermission('rdm-delivery-release:edit')
  const canManageMigration = hasPermission('rdm-delivery:edit')

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error" showIcon closable style={{ marginBottom: 12 }} message={error}
          action={<Button size="small" onClick={() => loadList(queryParams)}>重試</Button>}
        />
      )}

      {/* ── 搜索區（必須在統計卡之前）：§E.1 由 .search-section + Form layout="inline" 提供 4 列 grid ── */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="項目關鍵詞">
            <Input
              placeholder="項目名稱 / 編號 / 目標"
              value={keywordDraft}
              onChange={e => setKeywordDraft(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            />
          </Form.Item>
          <Form.Item label="負責人">
            <Select
              showSearch
              labelInValue
              placeholder="搜索負責人姓名"
              value={pmDraft}
              filterOption={false}
              onSearch={handlePmSearch}
              onChange={(v) => { setPmDraft(v as { value: number; label: string } | undefined) }}
              onFocus={() => { if (!pmOptions.length) handlePmSearch('') }}
              notFoundContent={pmSearching ? <Spin size="small" /> : null}
              options={pmOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item label="進度狀態">
            <Select
              placeholder="全部狀態"
              value={statusDraft}
              onChange={setStatusDraft}
              options={STATUS_OPTIONS}
              allowClear
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

      {/* ── 統計卡片（必須在搜索區之後、action-section 之前）：可下鑽 ── */}
      <div style={{ marginBottom: 16 }}>
        {statsError && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 8 }}
            message={stats ? '統計載入失敗，以下為上次成功口徑（未回零）' : '統計載入失敗，暫無可用口徑'}
          />
        )}
        {statsLoading && !stats ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <StatCards
            animationKey={statsAnimKey}
            /* §B.7：數據指標卡固定 4 格 grid，3 张卡不得拉伸铺满整行 */
            columns={4}
            items={[
              {
                key: 'inProgress', icon: <SyncOutlined spin />, value: statVal(stats?.inProgressCount),
                label: '進行中項目', color: 'info', active: drill === 'inProgress',
                title: '點擊下鑽：僅看進行中項目', onClick: () => handleDrill('inProgress'),
              },
              {
                key: 'attention', icon: <AlertOutlined />, value: statVal(stats?.attentionCount),
                label: '需關注項目', color: 'brand', active: drill === 'attention',
                title: '點擊下鑽：僅看風險/阻塞/逾期項目', onClick: () => handleDrill('attention'),
              },
              {
                key: 'pending', icon: <ClockCircleOutlined />, value: statVal(stats?.pendingDecisionCount),
                label: '待裁決事項', color: 'system', active: drill === 'pending',
                title: '點擊下鑽：僅看待裁決項目', onClick: () => handleDrill('pending'),
              },
            ]}
          />
        )}
      </div>

      {/* ── 操作區：§E.2 導出/批量类在左，新增与字段设置在右 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>導出全量報告</Button>
          {canManageMigration && (
            <Button icon={<SwapOutlined />} onClick={() => navigate('/rdm-stock-migration')}>存量遷移</Button>
          )}
          {canManageGrayscale && (
            <Button icon={<ControlOutlined />} onClick={() => navigate('/rdm-grayscale')}>灰度管理</Button>
          )}
          {drill && (
            <Tag color="blue" closable onClose={() => commitQuery({ drill: undefined })}>
              下鑽：{DRILL_LABEL[drill]}（{visibleRows.length}）
            </Tag>
          )}
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/rdm-project-detail?mode=create&${searchParams.toString()}`)}>
            新增項目
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ── 數據表格 ── */}
      <Table<RdmProjectListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={visibleColumns}
        dataSource={sortedRows}
        tableLayout="fixed"
        scroll={{ x: tableWidth }}
        onChange={handleTableChange}
        onRow={record => ({
          onClick: (e) => {
            const target = e.target as HTMLElement
            if (target.closest('button') || target.closest('.ant-dropdown')) return
            navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)
          },
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: error
            ? <Empty description="載入失敗" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            : <Empty description="暫無項目數據" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
        }}
        pagination={{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 個項目`,
          onChange: handlePageChange,
        }}
      />
    </div>
  )
}
