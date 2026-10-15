/**
 * 項目總覽 —— V3 分批交付項目列表與統計
 *
 * 佈局順序（AGENTS.md 強制）：search-section → 統計卡 → action-section → Table
 * 統計卡口徑跟隨搜索條件，條件變更時重新觸發計數動畫。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Input,
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
  DownOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import {
  fetchProjectPage,
  fetchProjectStats,
  type RdmProjectListItem,
  type RdmProjectQuery,
  type RdmProjectStatsCard,
} from '../../api/rdm'
import {
  RDM_PROJECT_STATUS,
  RDM_PROJECT_STATUS_COLOR,
  RDM_PROJECT_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

/** 進度狀態下拉選項（從常量生成，禁止硬編碼） */
const STATUS_OPTIONS = Object.entries(RDM_PROJECT_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}))

/** 分頁默認值 */
const DEFAULT_PAGE_SIZE = 20

export default function ProjectOverview() {
  const navigate = useNavigate()

  // ── 搜索條件 ──
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [pmKeyword, setPmKeyword] = useState('')

  // ── 已提交的查詢參數（只有點「查詢」才更新，避免輸入過程中反覆發請求） ──
  const [queryParams, setQueryParams] = useState<RdmProjectQuery>({ pageNo: 1, pageSize: DEFAULT_PAGE_SIZE })

  // ── 列表數據 ──
  const [rows, setRows] = useState<RdmProjectListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 統計卡數據 ──
  const [stats, setStats] = useState<RdmProjectStatsCard>({ inProgressCount: 0, attentionCount: 0, pendingDecisionCount: 0 })
  const [statsLoading, setStatsLoading] = useState(false)

  // ── 統計動畫 key（查詢條件變更時觸發重新計數動畫） ──
  const [statsAnimKey, setStatsAnimKey] = useState(0)

  // ── 排序 ──
  const [sortField, setSortField] = useState<string>('updatedAt')
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend')

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

  // ── 載入統計卡 ──
  const loadStats = useCallback(async (params: RdmProjectQuery) => {
    setStatsLoading(true)
    try {
      const res = await fetchProjectStats(params)
      setStats(res)
    } catch {
      // 統計載入失敗不阻斷主列表，靜默降級為零
      setStats({ inProgressCount: 0, attentionCount: 0, pendingDecisionCount: 0 })
    } finally {
      setStatsLoading(false)
    }
  }, [])

  // ── 首次載入 & 查詢參數變更時自動拉取 ──
  useEffect(() => {
    loadList(queryParams)
    loadStats(queryParams)
  }, [queryParams, loadList, loadStats])

  // ── 查詢按鈕 ──
  const handleSearch = () => {
    setQueryParams(prev => ({
      ...prev,
      keyword: keyword.trim() || undefined,
      status,
      pageNo: 1,
    }))
    setStatsAnimKey(k => k + 1)
  }

  // ── 重置按鈕 ──
  const handleReset = () => {
    setKeyword('')
    setStatus(undefined)
    setPmKeyword('')
    setQueryParams({ pageNo: 1, pageSize: DEFAULT_PAGE_SIZE })
    setStatsAnimKey(k => k + 1)
  }

  // ── 分頁變更 ──
  const handlePageChange = (page: number, pageSize: number) => {
    setQueryParams(prev => ({ ...prev, pageNo: page, pageSize }))
  }

  // ── 表格排序變更 ──
  const handleTableChange = (_pagination: unknown, _filters: unknown, sorter: unknown) => {
    const s = sorter as { field?: string; order?: 'ascend' | 'descend' | null }
    if (s.field && s.order) {
      setSortField(s.field)
      setSortOrder(s.order)
    } else {
      setSortField('updatedAt')
      setSortOrder('descend')
    }
  }

  // ── 排序後的數據（前端排序，因後端分頁接口已返回有序數據） ──
  const sortedRows = useMemo(() => {
    if (!rows.length) return rows
    const sorted = [...rows]
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
  }, [rows, sortField, sortOrder])

  // ── 行操作下拉菜單 ──
  const getRowMenuItems = (record: RdmProjectListItem) => [
    {
      key: 'edit',
      label: '編輯項目',
      onClick: () => navigate(`/rdm-project-detail?id=${record.id}&mode=edit`),
    },
    {
      key: 'pause',
      label: record.pausedFlag ? '恢復推進' : '暫停項目',
      onClick: () => message.info(record.pausedFlag ? '已恢復推進' : '已暫停項目'),
    },
  ]

  // ── 表格列定義 ──
  const columns: TableColumnsType<RdmProjectListItem> = [
    {
      title: '項目及目標',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (name: string, record) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontWeight: 600, color: '#262626', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => navigate(`/rdm-project-detail?id=${record.id}`)}
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
    {
      title: '負責人',
      dataIndex: 'pmUserName',
      key: 'pmUserName',
      width: 100,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '交付進度',
      key: 'delivery',
      width: 180,
      render: (_, record) => (
        <span
          style={{ color: '#1890FF', cursor: 'pointer', fontSize: 13 }}
          onClick={() => navigate(`/rdm-project-detail?id=${record.id}`)}
        >
          已交付 <b>{record.deliveredCount}</b> 項／承諾 <b>{record.totalDeliveryCount}</b> 項
        </span>
      ),
    },
    {
      title: '剩餘工作',
      key: 'remaining',
      width: 130,
      render: (_, record) => {
        const remaining = record.totalDeliveryCount - record.deliveredCount
        if (remaining <= 0) return <span style={{ color: '#52C41A' }}>全部完成</span>
        return (
          <span style={{ fontSize: 13, color: '#595959' }}>
            {record.blockedCount > 0 && (
              <Tag color="error" style={{ marginRight: 4 }}>阻塞 {record.blockedCount}</Tag>
            )}
            另有 {remaining} 項
          </span>
        )
      },
    },
    {
      title: '下次交付',
      dataIndex: 'nextDeliveryDate',
      key: 'nextDeliveryDate',
      width: 120,
      render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span>,
    },
    {
      title: '阻塞/待裁決',
      key: 'blockDecision',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.blockedCount > 0 && <Tag color="error" style={{ margin: 0 }}>{record.blockedCount} 阻塞</Tag>}
          {record.pendingDecisionCount > 0 && <Tag color="purple" style={{ margin: 0 }}>{record.pendingDecisionCount} 待裁決</Tag>}
          {record.blockedCount === 0 && record.pendingDecisionCount === 0 && <span style={{ color: '#52C41A', fontSize: 12 }}>正常</span>}
        </Space>
      ),
    },
    {
      title: '進度狀態',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: string, record) => (
        <Space size={4}>
          <Tag color={RDM_PROJECT_STATUS_COLOR[v] ?? 'default'} style={{ margin: 0 }}>
            {RDM_PROJECT_STATUS_LABEL[v] ?? v}
          </Tag>
          {record.pausedFlag && <Tag color="warning" style={{ margin: 0 }}>已暫停</Tag>}
          {record.riskFlag && <Tag color="error" style={{ margin: 0 }}>風險</Tag>}
        </Space>
      ),
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 120,
      sorter: true,
      defaultSortOrder: 'descend',
      render: (v?: string) => v?.slice(0, 10) || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-project-detail?id=${record.id}`)}>詳情</Button>
          <Dropdown menu={{ items: getRowMenuItems(record) }} trigger={['click']}>
            <Button type="link" size="small">更多 <DownOutlined /></Button>
          </Dropdown>
        </Space>
      ),
    },
  ]

  const tableWidth = columns.reduce((sum, col) => sum + Number(col.width ?? 120), 0)

  return (
    <div className="content-area">
      {/* ── 錯誤橫幅 ── */}
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={error}
          action={<Button size="small" onClick={() => loadList(queryParams)}>重試</Button>}
        />
      )}

      {/* ── 搜索區（必須在統計卡之前） ── */}
      <div className="search-section">
        <div className="search-fields">
          <div className="search-field">
            <label>項目關鍵詞</label>
            <Input
              placeholder="項目名稱 / 編號 / 目標"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            />
          </div>
          <div className="search-field">
            <label>負責人</label>
            <Input
              placeholder="負責人姓名"
              value={pmKeyword}
              onChange={e => setPmKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </div>
          <div className="search-field">
            <label>進度狀態</label>
            <Select
              placeholder="全部狀態"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <div className="search-actions">
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </div>
        </div>
      </div>

      {/* ── 統計卡片（必須在搜索區之後、action-section 之前） ── */}
      <div style={{ marginBottom: 16 }}>
        {statsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <StatCards
            animationKey={statsAnimKey}
            items={[
              {
                key: 'inProgress',
                icon: <SyncOutlined spin />,
                value: stats.inProgressCount,
                label: '進行中項目',
                color: 'info',
              },
              {
                key: 'attention',
                icon: <AlertOutlined />,
                value: stats.attentionCount,
                label: '需關注項目',
                color: 'brand',
              },
              {
                key: 'pending',
                icon: <ClockCircleOutlined />,
                value: stats.pendingDecisionCount,
                label: '待裁決事項',
                color: 'system',
              },
            ]}
          />
        )}
      </div>

      {/* ── 操作區 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/rdm-project-detail?mode=create')}
          >
            新增項目
          </Button>
        </div>
        <div className="action-section-right" />
      </div>

      {/* ── 數據表格 ── */}
      <Table<RdmProjectListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={sortedRows}
        tableLayout="fixed"
        scroll={{ x: tableWidth }}
        onChange={handleTableChange}
        onRow={record => ({
          onClick: (e) => {
            // 避免操作按鈕點擊時觸發行跳轉
            const target = e.target as HTMLElement
            if (target.closest('button') || target.closest('.ant-dropdown')) return
            navigate(`/rdm-project-detail?id=${record.id}`)
          },
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: error
            ? <Empty description="載入失敗" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            : <Empty description="暫無項目數據" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
        }}
        pagination={{
          current: queryParams.pageNo,
          pageSize: queryParams.pageSize,
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
