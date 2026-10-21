/**
 * 提測工作台 —— 測試批次列表與操作
 *
 * QA 團隊的主要工作區：查看所有提測批次，按狀態篩選，接收/退回/錄入結果/發起復測。
 * 統計卡片跟隨搜索條件動態變化（AGENTS.md §E.8：統計卡片必須在搜索區下方）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, DatePicker, Form, Input, Modal,
  Select, Space, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import EmployeeSelect from '../MeetingManagement/EmployeeSelect'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { rdmTableLocale } from './components/tableLocale'
import {
  fetchTestBatches, acceptTestBatch, returnTestBatch,
  type RdmTestBatchListItem, type RdmTestBatchQuery,
} from '../../api/rdm'
import {
  RDM_TEST_BATCH_STATUS, RDM_TEST_BATCH_STATUS_LABEL, RDM_TEST_BATCH_STATUS_COLOR,
} from '../../constants/rdm'
import './index.css'

const { RangePicker } = DatePicker
const { TextArea } = Input

/**
 * 列配置元数据（§E.3 列表页必须可显隐/调序）。
 * key/title 与下方 columns 逐字对应，新增/改名列时两处同步。
 */
const COLUMN_META = [
  { key: 'batchNo', title: '批次號' },
  { key: 'deliveryItemTitles', title: '交付範圍' },
  { key: 'req', title: '需求' },
  { key: 'testEnv', title: '環境' },
  { key: 'testLeadUserName', title: '測試負責人' },
  { key: 'status', title: '狀態' },
  { key: 'roundNo', title: '輪次' },
  { key: 'planEndTime', title: '計劃結束' },
  { key: 'ratio', title: '通過/總數' },
  { key: 'action', title: '操作' },
]

export default function TestWorkbench() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  // 初始即 loading：避免 effect 置 true 前先闪一帧「暫無數據」
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RdmTestBatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 搜索條件
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [testLeadUserId, setTestLeadUserId] = useState<number | undefined>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  // 統計
  const [stats, setStats] = useState({ pending: 0, executing: 0, failed: 0, passed: 0, returned: 0 })

  // 退回 Modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnId, setReturnId] = useState<number | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)

  const buildQuery = useCallback((): RdmTestBatchQuery => {
    const q: RdmTestBatchQuery = { pageNo: page, pageSize }
    if (keyword.trim()) q.keyword = keyword.trim()
    if (statusFilter) q.status = statusFilter
    // 负责人筛选必须是 sys_user.id：原先的姓名输入框根本没进查询条件（死筛选）
    if (testLeadUserId) q.testLeadUserId = testLeadUserId
    // 計劃結束時間區間（yyyy-MM-dd，后端含起止当天）
    if (dateRange?.[0]) q.planEndFrom = dateRange[0].format('YYYY-MM-DD')
    if (dateRange?.[1]) q.planEndTo = dateRange[1].format('YYYY-MM-DD')
    return q
  }, [page, pageSize, keyword, statusFilter, testLeadUserId, dateRange])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTestBatches(buildQuery())
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
      // 統計各狀態數量（從全量推導）
      computeStats()
    } catch {
      message.error('提測批次載入失敗')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  /** 分別查詢各狀態的 total 來生成統計卡片 */
  const computeStats = async () => {
    try {
      const baseQ: RdmTestBatchQuery = {}
      if (keyword.trim()) baseQ.keyword = keyword.trim()
      if (testLeadUserId) baseQ.testLeadUserId = testLeadUserId
      if (dateRange?.[0]) baseQ.planEndFrom = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) baseQ.planEndTo = dateRange[1].format('YYYY-MM-DD')
      const [p, e, f, s, r] = await Promise.all([
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.PENDING, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.EXECUTING, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.FAILED, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.PASSED, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.RETURNED, pageSize: 1 }),
      ])
      setStats({ pending: p.total, executing: e.total, failed: f.total, passed: s.total, returned: r.total })
    } catch { /* 統計失敗不影響主列表 */ }
  }

  useEffect(() => { void loadData() }, [loadData])

  const handleSearch = () => { setPage(1); void loadData() }
  const handleReset = () => {
    setKeyword(''); setStatusFilter(undefined); setTestLeadUserId(undefined); setDateRange(null)
    setPage(1)
  }

  // ===== 操作 =====
  const handleAccept = (id: number) => {
    Modal.confirm({
      title: '確認接收',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: '接收後批次進入「已接收」狀態，可開始執行測試。',
      okText: '確認接收',
      cancelText: '取消',
      onOk: async () => {
        try {
          await acceptTestBatch(id)
          message.success('已接收提測批次')
          void loadData()
        } catch {
          // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（AGENTS §G.4）
        }
      },
    })
  }

  const handleReturn = (id: number) => {
    setReturnId(id); setReturnReason(''); setReturnOpen(true)
  }

  const confirmReturn = async () => {
    if (!returnReason.trim()) { message.warning('請填寫退回原因'); return }
    if (!returnId) return
    setReturnLoading(true)
    try {
      await returnTestBatch(returnId, { reason: returnReason.trim() })
      message.success('已退回提測批次')
      setReturnOpen(false)
      void loadData()
    } catch { message.error('退回失敗') }
    finally { setReturnLoading(false) }
  }

  // ===== 發起提測：独立表单页（§9.1 禁止用 Modal 承载新增表单） =====
  const openSubmitPage = () => navigate('/rdm-test-submit')

  // ===== 表格列 =====
  const columns: TableColumnsType<RdmTestBatchListItem> = useMemo(() => [
    {
      title: '批次號', dataIndex: 'batchNo', key: 'batchNo', width: 120,
      render: (v: string, r) => (
        <a className="rdm-table-title__link" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>{v}</a>
      ),
    },
    {
      title: '交付範圍', dataIndex: 'deliveryItemTitles', key: 'deliveryItemTitles', width: 150, ellipsis: true,
      render: (v: string[]) => v?.join('、') || '-',
    },
    {
      title: '需求', key: 'req', width: 160, ellipsis: true,
      render: (_, r) => <span>{r.reqNo} {r.reqTitle}</span>,
    },
    {
      title: '環境', dataIndex: 'testEnv', key: 'testEnv', width: 80,
      render: (v: string) => <Tag>{v?.toUpperCase() || '-'}</Tag>,
    },
    { title: '測試負責人', dataIndex: 'testLeadUserName', key: 'testLeadUserName', width: 100 },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={RDM_TEST_BATCH_STATUS_COLOR[v] || 'default'}>{RDM_TEST_BATCH_STATUS_LABEL[v] || v}</Tag>,
    },
    { title: '輪次', dataIndex: 'roundNo', key: 'roundNo', width: 60, align: 'center' },
    {
      title: '計劃結束', dataIndex: 'planEndTime', key: 'planEndTime', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '通過/總數', key: 'ratio', width: 90, align: 'center',
      render: (_, r) => {
        const color = r.totalCount === 0 ? '#8C8C8C' : r.passCount === r.totalCount ? '#52C41A' : r.passCount > 0 ? '#FA8C16' : '#FF4D4F'
        return <span style={{ color, fontWeight: 600 }}>{r.passCount}/{r.totalCount}</span>
      },
    },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right',
      render: (_, r) => {
        const actions: React.ReactNode[] = []
        if (r.status === RDM_TEST_BATCH_STATUS.PENDING) {
          actions.push(<Button key="accept" type="link" size="small" onClick={() => handleAccept(r.id)}>接收</Button>)
          actions.push(<Button key="return" type="link" size="small" danger onClick={() => handleReturn(r.id)}>退回</Button>)
        }
        if (r.status === RDM_TEST_BATCH_STATUS.EXECUTING || r.status === RDM_TEST_BATCH_STATUS.ACCEPTED) {
          actions.push(<Button key="exec" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>錄入結果</Button>)
          actions.push(<Button key="issue" type="link" size="small" onClick={() => navigate(`/rdm-issue?batchId=${r.id}&mode=create`)}>登記問題</Button>)
        }
        if (r.status === RDM_TEST_BATCH_STATUS.FAILED) {
          actions.push(<Button key="retest" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>復測</Button>)
        }
        actions.push(<Button key="detail" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>詳情</Button>)
        return <Space size={0} split={<span className="action-split">|</span>}>{actions}</Space>
      },
    },
  ], [navigate])

  const statusOptions = Object.entries(RDM_TEST_BATCH_STATUS_LABEL).map(([value, label]) => ({ value, label }))

  // §E.3 列配置：字段设置面板放操作区右侧，批次号锁头、操作列锁尾
  const { configComponent, applyConfig } = useColumnConfig('rdm-test-workbench', COLUMN_META, [
    { key: 'batchNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  return (
    <div className="content-area rdm-workspace">
      {/* ── 搜索區：§E.1 由 .search-section + Form layout="inline" 统一提供 4 列 grid（不得写死内联 grid） ── */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="關鍵詞">
            <Input
              placeholder="批次號 / 需求標題"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部狀態"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item label="測試負責人">
            <EmployeeSelect
              single
              placeholder="搜尋姓名或工號"
              value={testLeadUserId ? [testLeadUserId] : []}
              onChange={ids => setTestLeadUserId(ids[0])}
            />
          </Form.Item>
          <Form.Item label="計劃結束時間">
            <RangePicker
              value={dateRange}
              onChange={(v) => setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <div className="search-actions">
              <Button type="primary" onClick={handleSearch}>查詢</Button>
              <Button onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ── 統計卡片（必須在搜索區下方、操作區上方）：§B.7 统一走 StatCards（计数控件动画 + hover） ── */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={`${keyword}-${statusFilter}-${testLeadUserId}-${dateRange?.[0]?.format('YYYY-MM-DD') ?? ''}-${dateRange?.[1]?.format('YYYY-MM-DD') ?? ''}-${total}`}
          items={[
            { key: 'pending', icon: <ClockCircleOutlined />, color: 'brand', value: stats.pending, label: '待接收' },
            { key: 'executing', icon: <SyncOutlined spin />, color: 'info', value: stats.executing, label: '執行中' },
            { key: 'failed', icon: <CloseCircleOutlined />, color: 'danger', value: stats.failed, label: '待復測' },
            { key: 'returned', icon: <CloseCircleOutlined />, color: 'system', value: stats.returned, label: RDM_TEST_BATCH_STATUS_LABEL[RDM_TEST_BATCH_STATUS.RETURNED] },
            { key: 'passed', icon: <CheckCircleOutlined />, color: 'success', value: stats.passed, label: '已通過' },
          ]}
        />
      </div>

      {/* ── 操作區：§E.2 新增类在右，刷新等中性动作在左 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={openSubmitPage}>發起提測</Button>
          {configComponent}
        </div>
      </div>

      {/* ── 表格 ── */}
      <Table<RdmTestBatchListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        locale={rdmTableLocale(loading, t('common.noData'))}
        columns={applyConfig(columns)}
        dataSource={rows}
        scroll={{ x: 1110 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
          /* §E.4：每页条数变化时必须重置到第 1 页 */
          onChange: (p, s) => { setPageSize(s); setPage(s !== pageSize ? 1 : p) },
        }}
      />

      {/* ── 退回 Modal ── */}
      <Modal
        title="退回提測批次"
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={confirmReturn}
        confirmLoading={returnLoading}
        okText="確認退回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 12, color: '#595959', fontSize: 13 }}>
          退回後研發需修復問題再重新提測，請說明退回原因：
        </div>
        <TextArea
          rows={4}
          value={returnReason}
          onChange={e => setReturnReason(e.target.value)}
          placeholder="例：構建版本未包含最新修復，環境配置不完整…"
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  )
}
