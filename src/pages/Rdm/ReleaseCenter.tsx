/**
 * 發布中心 —— 發布批次列表與狀態追蹤
 *
 * 变更影响：前端（新增完整列表页）
 * 安全边界：仅前端展示层，数据来源于后端 /rdm/release-batch 接口
 * 测试计划：列表加载、筛选条件、创建弹窗表单校验
 * 回滚方案：恢复占位组件
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, DatePicker, Form, Input, Progress, Select, Space, Table, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloudUploadOutlined,
  PlusOutlined, ReloadOutlined,
  RocketOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchReleaseBatches,
  type RdmReleaseBatchListItem,
} from '../../api/rdm'
import { fetchEmployeeIdOptions } from '../../api/employee'
import {
  RDM_RELEASE_BATCH_STATUS,
  RDM_RELEASE_BATCH_STATUS_COLOR,
  RDM_RELEASE_BATCH_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

const { RangePicker } = DatePicker

/** 状态选项（搜索筛选器） */
const STATUS_OPTIONS = Object.entries(RDM_RELEASE_BATCH_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}))

/**
 * 列配置元数据（§E.3 列表页必须可显隐/调序）。
 * key/title 与下方 columns 逐字对应（注意发布负责人列的 key 是 owner、不是 dataIndex），
 * 新增/改名列时两处同步，否则该列不会出现在字段设置面板。
 */
const COLUMN_META = [
  { key: 'batchNo', title: '批次號' },
  { key: 'versionTag', title: '版本標識' },
  { key: 'projectName', title: '關聯項目' },
  { key: 'scope', title: '範圍摘要' },
  { key: 'owner', title: '發布負責人' },
  { key: 'planTime', title: '計劃時間' },
  { key: 'status', title: '狀態' },
  { key: 'progress', title: '部署進度' },
  { key: 'action', title: '操作' },
]

export default function ReleaseCenter() {
  const navigate = useNavigate()

  // ===== 列表状态 =====
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<RdmReleaseBatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [error, setError] = useState<string | null>(null)

  // ===== 筛选条件 =====
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  // 負責人筛选选项（创建表单已拆到独立页 ReleaseBatchCreate）
  const [employeeOptions, setEmployeeOptions] = useState<{ value: string; label: string }[]>([])

  // ===== 数据加载 =====
  const loadData = useCallback(async (pn = pageNo, ps = pageSize) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchReleaseBatches({
        keyword: keyword || undefined,
        status: statusFilter,
        releaseOwnerUserId: ownerFilter ? Number(ownerFilter) : undefined,
        pageNo: pn,
        pageSize: ps,
      })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布批次清單載入失敗')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter, ownerFilter, pageNo, pageSize])

  useEffect(() => { loadData() }, [loadData])

  // ===== 统计卡片 =====
  const stats = useMemo(() => {
    const planningCount = rows.filter(r =>
      r.status === RDM_RELEASE_BATCH_STATUS.PLANNING || r.status === RDM_RELEASE_BATCH_STATUS.CHECKING
    ).length
    const approvedCount = rows.filter(r => r.status === RDM_RELEASE_BATCH_STATUS.APPROVED).length
    const deployingCount = rows.filter(r =>
      r.status === RDM_RELEASE_BATCH_STATUS.DEPLOYING || r.status === RDM_RELEASE_BATCH_STATUS.VERIFYING
    ).length
    const releasedCount = rows.filter(r => r.status === RDM_RELEASE_BATCH_STATUS.RELEASED).length
    return { planningCount, approvedCount, deployingCount, releasedCount }
  }, [rows])

  // ===== 搜索 =====
  const handleSearch = () => {
    setPageNo(1)
    loadData(1, pageSize)
  }

  const handleReset = () => {
    setKeyword('')
    setStatusFilter(undefined)
    setOwnerFilter(undefined)
    setDateRange(null)
    setPageNo(1)
  }

  // ===== 創建發布批次：独立表单页（§9.1 禁止用 Modal 承载新增表单） =====
  const openCreatePage = () => navigate('/rdm-release-create')

  // ===== 表格列 =====
  const columns: TableColumnsType<RdmReleaseBatchListItem> = useMemo(() => [
    {
      title: '批次號', dataIndex: 'batchNo', key: 'batchNo', width: 160,
      render: (v: string, r) => (
        <a className="rdm-table-title__link" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>{v}</a>
      ),
    },
    {
      title: '版本標識', dataIndex: 'versionTag', key: 'versionTag', width: 130,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: '關聯項目', dataIndex: 'projectName', key: 'projectName', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: '範圍摘要', key: 'scope', width: 140,
      render: (_, r) => <span>{r.systemCount ?? 0} 個系統</span>,
    },
    { title: '發布負責人', dataIndex: 'releaseOwnerUserName', key: 'owner', width: 120, render: (v?: string) => v || '-' },
    {
      title: '計劃時間', dataIndex: 'planTime', key: 'planTime', width: 160,
      render: (v?: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => (
        <Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[v] ?? 'default'}>
          {RDM_RELEASE_BATCH_STATUS_LABEL[v] ?? v}
        </Tag>
      ),
    },
    {
      title: '部署進度', key: 'progress', width: 130,
      render: (_, r) => {
        const pct = r.systemCount > 0 ? Math.round((r.deployedCount / r.systemCount) * 100) : 0
        return (
          <Space size={4}>
            <Progress percent={pct} size="small" style={{ width: 60 }} showInfo={false} />
            <span style={{ fontSize: 12, color: '#595959' }}>{r.deployedCount}/{r.systemCount}</span>
          </Space>
        )
      },
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_, r) => {
        const actions: React.ReactNode[] = []
        const s = r.status
        if (s === RDM_RELEASE_BATCH_STATUS.PLANNING) {
          actions.push(<Button key="check" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>檢查</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.CHECKING) {
          actions.push(<Button key="apply" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>申請發布</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.APPROVED) {
          actions.push(<Button key="deploy" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>記錄部署</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.DEPLOYING) {
          actions.push(<Button key="deploy2" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>記錄部署</Button>)
          actions.push(<Button key="rb" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.VERIFYING) {
          actions.push(<Button key="verify" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>生產驗證</Button>)
          actions.push(<Button key="rb2" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.RELEASED) {
          actions.push(<Button key="rb3" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        actions.push(<Button key="detail" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>詳情</Button>)
        return <Space size={0} split={<span className="action-split">|</span>}>{actions}</Space>
      },
    },
  ], [navigate])

  const tableWidth = columns.reduce((sum, col) => sum + Number((col as { width?: number }).width ?? 120), 0)

  // §E.3 列配置：字段设置面板放操作区右侧，批次号锁头、操作列锁尾
  const { configComponent, applyConfig } = useColumnConfig('rdm-release-center', COLUMN_META, [
    { key: 'batchNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  return (
    <div className="content-area">
      {/* 錯誤橫幅 */}
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={error}
          action={<Button size="small" onClick={() => loadData()}>重試</Button>}
        />
      )}

      {/* ===== 搜索區：§E.1 控件宽度由 .search-section 统一给 100%，不得内联写死 ===== */}
      <div className="search-section">
        <Form layout="inline" style={{ width: '100%' }}>
          <Form.Item label="關鍵字">
            <Input
              placeholder="版本標識 / 批次號"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部狀態"
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              allowClear
              options={STATUS_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="負責人">
            <Select
              placeholder="發布負責人"
              value={ownerFilter}
              onChange={v => setOwnerFilter(v)}
              allowClear
              showSearch
              filterOption={false}
              onSearch={async (val) => {
                if (val.length >= 1) {
                  try {
                    setEmployeeOptions(await fetchEmployeeIdOptions(val))
                  } catch { /* ignore */ }
                }
              }}
              options={employeeOptions}
            />
          </Form.Item>
          <Form.Item label="計劃時間">
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
            />
          </Form.Item>
          <Form.Item label=" ">
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ===== 統計卡片（必須在搜索區下方）：§B.7 统一走 StatCards（计数控件动画 + hover） ===== */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={`${statusFilter ?? ''}-${keyword}-${rows.length}`}
          items={[
            { key: 'planning', icon: <ClockCircleOutlined />, color: 'info', value: stats.planningCount, label: '計劃中' },
            { key: 'approved', icon: <CheckCircleOutlined />, color: 'brand', value: stats.approvedCount, label: '待審批' },
            { key: 'deploying', icon: <CloudUploadOutlined />, color: 'system', value: stats.deployingCount, label: '部署中' },
            { key: 'released', icon: <RocketOutlined />, color: 'success', value: stats.releasedCount, label: '已發布' },
          ]}
        />
      </div>

      {/* ===== 操作區：§E.2 新增类在右，刷新等中性动作在左 ===== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreatePage}>創建發布批次</Button>
          {configComponent}
        </div>
      </div>

      {/* ===== 表格 ===== */}
      <Table<RdmReleaseBatchListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        tableLayout="fixed"
        scroll={{ x: tableWidth }}
        pagination={{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
          /* §E.4：每页条数变化时必须重置到第 1 页 */
          onChange: (p, s) => { setPageSize(s); setPageNo(s !== pageSize ? 1 : p) },
        }}
      />
    </div>
  )
}
