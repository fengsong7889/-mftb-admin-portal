/**
 * 需求列表 —— 多视角（我提的/待我处理/需求池/产品受理/研发交付/待验收/全部）
 *
 * 单一列表组件按 scope 渲染不同列与操作，避免 6 个近似页面各自演化。
 * 需求池视角额外提供批量分配产品经理能力（技术负责人视角）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ExportOutlined,
  FileAddOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchRequirementPage,
  fetchScopeCounts,
  urgeRequirement,
  withdrawRequirement,
  type RdmRequirementRow,
} from '../../api/rdm'
import { exportRequirementRows } from './requirementExport'
import {
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_SCOPE,
  RDM_SCOPE_LABEL,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  type RdmScope,
  type RdmStatus,
} from '../../constants/rdm'
import { ComplexityTag, PriorityTag, StatusTag, TypeTag } from './components/Tags'
import './index.css'

/** 列表可切换的视角顺序 */
const SCOPE_ORDER: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.POOL,
  RDM_SCOPE.PRODUCT,
  RDM_SCOPE.DELIVERY,
  RDM_SCOPE.ACCEPTANCE,
  RDM_SCOPE.ALL,
]

/** 可撤回的状态（草稿/待审批） */
const WITHDRAWABLE: string[] = [RDM_STATUS.DRAFT, RDM_STATUS.INTAKE_PENDING]

interface RequirementListProps {
  /** 固定视角（菜单入口传入）；不传则默认「我提的需求」并允许切 Tab */
  scope?: RdmScope
  /** 是否允许切换 Tab（菜单页固定视角时关闭） */
  switchable?: boolean
}

export default function RequirementList({ scope, switchable = true }: RequirementListProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialScope = (scope ?? searchParams.get('scope') ?? RDM_SCOPE.MINE) as RdmScope

  const [activeScope, setActiveScope] = useState<string>(initialScope)
  const [rows, setRows] = useState<RdmRequirementRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [filters, setFilters] = useState<{ keyword?: string; reqType?: string; priority?: string; status?: string }>({})

  const isPoolView = activeScope === RDM_SCOPE.POOL

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRequirementPage({ page, size, scope: activeScope, ...filters })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      message.error('需求列表載入失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size, activeScope, filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetchScopeCounts().then(setCounts).catch(() => setCounts({}))
  }, [activeScope])

  /** 切换视角时重置分页与选中 */
  const switchScope = (key: string) => {
    setActiveScope(key)
    setPage(1)
    setSelectedKeys([])
  }

  const handleUrge = async (id: number) => {
    try {
      await urgeRequirement(id)
      message.success('已催辦，將提醒當前處理人')
    } catch (err) {
      // 催办是静默请求，不在这里说就等于点了没反应
      message.error(err instanceof Error && err.message ? err.message : '催辦失敗，請重試')
    }
  }

  /**
   * 撤回为草稿：先二次确认再调接口。
   * <p>以前这里只弹一句「已撤回」不调任何接口，用户看到成功提示但数据没动，比报错更难排查。
   */
  const handleWithdraw = (row: RdmRequirementRow) => {
    Modal.confirm({
      title: '確認撤回該需求？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求編號：</span><b>{row.reqNo}</b></div>
          <div className="confirm-info-row"><span>標題：</span><b>{row.title}</b></div>
          <div className="confirm-info-row"><span>撤回後：</span><b>退回草稿，可修改後重新提交（準入審批會重新發起）</b></div>
        </div>
      ),
      okText: '確認撤回',
      cancelText: '取消',
      onOk: async () => {
        try {
          await withdrawRequirement(row.id)
          message.success('已撤回為草稿')
          void load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '撤回失敗，請重試')
          throw err
        }
      },
    })
  }

  /** 导出当前筛选后的台账（前端生成，与页面同一份数据） */
  const handleExport = async () => {
    if (rows.length === 0) {
      message.warning('當前列表沒有數據，請先調整篩選條件')
      return
    }
    try {
      await exportRequirementRows(rows, RDM_SCOPE_LABEL[activeScope as RdmScope] ?? activeScope)
      message.success(`已導出 ${rows.length} 條需求`)
    } catch {
      message.error('導出失敗，請重試')
    }
  }

  const columnMeta = useMemo(() => ([
    { key: 'reqNo', title: '需求編號' },
    { key: 'title', title: '需求標題' },
    { key: 'reqType', title: '需求類型' },
    { key: 'priority', title: '優先級' },
    { key: 'complexity', title: '規模' },
    { key: 'status', title: '當前狀態' },
    { key: 'submitter', title: '提出人/部門' },
    { key: 'pmName', title: '產品經理' },
    { key: 'currentHandler', title: '當前處理人' },
    { key: 'submitTime', title: '提交時間' },
    { key: 'expectDate', title: '期望完成' },
    { key: 'planReleaseDate', title: '計劃上線' },
    { key: 'stay', title: '當前停留' },
    { key: 'action', title: '操作' },
  ]), [])

  const { configComponent, applyConfig } = useColumnConfig('rdm-requirement', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<RdmRequirementRow> = [
    {
      title: '序號', key: 'index', width: 56, align: 'center', fixed: 'left',
      render: (_, __, i) => (page - 1) * size + i + 1,
    },
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 148 },
    {
      title: '需求標題', dataIndex: 'title', key: 'title', width: 260, fixed: 'left',
      render: (v: string, r) => (
        <Space size={4}>
          <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>{v}</a>
          {r.blockedFlag && <Tag color="purple" style={{ margin: 0 }}>阻塞</Tag>}
        </Space>
      ),
    },
    {
      title: '需求類型', dataIndex: 'reqType', key: 'reqType', width: 100,
      render: (v: string) => <TypeTag reqType={v} />,
    },
    {
      title: '優先級', dataIndex: 'priority', key: 'priority', width: 110,
      render: (v: string) => <PriorityTag priority={v} />,
    },
    {
      title: '規模', dataIndex: 'complexity', key: 'complexity', width: 80,
      render: (v?: string | null) => <ComplexityTag complexity={v} />,
    },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string, r) => <StatusTag status={v} overdue={r.overdueFlag ?? false} />,
    },
    {
      title: '提出人/部門', key: 'submitter', width: 140,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div>{r.submitterName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.submitDeptName ?? '-'}</div>
        </div>
      ),
    },
    {
      title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 100,
      render: (v?: string | null) => v ?? <span style={{ color: '#FF4D4F' }}>未分配</span>,
    },
    { title: '當前處理人', dataIndex: 'currentHandler', key: 'currentHandler', width: 100, render: (v?: string | null) => v ?? '-' },
    {
      title: '提交時間', dataIndex: 'submitTime', key: 'submitTime', width: 150,
      render: (v?: string | null) => <span style={{ whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'}</span>,
    },
    { title: '期望完成', dataIndex: 'expectDate', key: 'expectDate', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '計劃上線', dataIndex: 'planReleaseDate', key: 'planReleaseDate', width: 110, render: (v?: string | null) => v ?? '-' },
    {
      title: '當前停留', key: 'stay', width: 96,
      render: (_, r) => {
        const days = Math.round((r.stayHours ?? 0) / 24)
        if (!days) return '-'
        return (
          <span style={{ color: r.overdueFlag ? '#CF1322' : days > 3 ? '#D46B08' : '#595959' }}>
            {days} 天
          </span>
        )
      },
    },
    {
      title: '操作', key: 'action', width: 170, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>詳情</Button>
          <span className="action-split">|</span>
          {isPoolView ? (
            <Button
              type="link"
              size="small"
              onClick={() => navigate(`/rdm-assign?ids=${r.id}&from=${activeScope}`)}
            >
              分配
            </Button>
          ) : (
            <Button type="link" size="small" onClick={() => handleUrge(r.id)}>催辦</Button>
          )}
          {WITHDRAWABLE.includes(r.status) && (
            <>
              <span className="action-split">|</span>
              <Button type="link" size="small" danger onClick={() => handleWithdraw(r)}>撤回</Button>
            </>
          )}
          {r.status === RDM_STATUS.UAT_PENDING && (
            <>
              <span className="action-split">|</span>
              <Button type="link" size="small" style={{ color: '#52C41A' }} onClick={() => navigate(`/rdm-acceptance-form?id=${r.id}`)}>驗收</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  const rowSelection = isPoolView
    ? { selectedRowKeys: selectedKeys, onChange: (keys: React.Key[]) => setSelectedKeys(keys as number[]) }
    : undefined

  return (
    <div className="content-area">
      {/* ── 视角 Tab ── */}
      {switchable ? (
        <Tabs
          activeKey={activeScope}
          onChange={switchScope}
          items={SCOPE_ORDER.map(key => ({
            key,
            label: `${RDM_SCOPE_LABEL[key]}${counts[key] != null ? ` (${counts[key]})` : ''}`,
          }))}
        />
      ) : (
        <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 600, color: '#262626' }}>
          {RDM_SCOPE_LABEL[activeScope as RdmScope]}
        </div>
      )}

      {/* ── 搜索区 ── */}
      <SearchBar
        filters={filters}
        onSearch={v => { setFilters(v); setPage(1) }}
        onReset={() => { setFilters({}); setPage(1) }}
      />

      {/* ── 操作区 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-submit')}>
            我要提需求
          </Button>
          {isPoolView && (
            <Button
              icon={<UserSwitchOutlined />}
              disabled={selectedKeys.length === 0}
              onClick={() => navigate(`/rdm-assign?ids=${selectedKeys.join(',')}&from=${activeScope}`)}
            >
              批量分配{selectedKeys.length ? `（${selectedKeys.length}）` : ''}
            </Button>
          )}
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      {isPoolView && rows.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="需求池視角：勾選後可批量分配產品經理；分配即通知對方，超 24 小時未受理將自動升級提醒技術負責人。"
        />
      )}

      <Table<RdmRequirementRow>
        className="nowrap-table"
        rowKey="id"
        columns={applyConfig(columns) as TableColumnsType<RdmRequirementRow>}
        dataSource={rows}
        loading={loading}
        rowSelection={rowSelection}
        scroll={{ x: 1700 }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
          // 改每页条数必须回第 1 页，否则会停在越界页码上显示空列表
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />

      {/* 分配产品经理已改为独立页 /rdm-assign（§9.1 禁弹窗承载表单） */}
    </div>
  )
}

/**
 * 台账搜索区。
 * <p>必须用 antd `Form layout="inline"` 包裹：全局样式是把
 * `.search-section .ant-form-inline` 设成 4 列 grid 的，之前用 `Space` 拼装
 * 根本命不中该规则（变成一行左对齐胶囊串），且控件写死了宽度。</p>
 */
function SearchBar({ filters, onSearch, onReset }: {
  filters: { keyword?: string; reqType?: string; priority?: string; status?: string }
  onSearch: (v: { keyword?: string; reqType?: string; priority?: string; status?: string }) => void
  onReset: () => void
}) {
  const [form] = Form.useForm<{ keyword?: string; reqType?: string; priority?: string; status?: string }>()

  const statusOptions = (Object.keys(RDM_STATUS_LABEL) as RdmStatus[]).map(k => ({
    value: k,
    label: RDM_STATUS_LABEL[k],
  }))

  const submit = () => onSearch(form.getFieldsValue())

  return (
    <div className="search-section">
      <Form form={form} layout="inline" initialValues={filters} onFinish={submit}>
        <Form.Item label="需求關鍵字" name="keyword">
          <Input allowClear placeholder="標題 / 編號 / 提出人" onPressEnter={submit} />
        </Form.Item>
        <Form.Item label="需求類型" name="reqType">
          <Select
            allowClear
            placeholder="全部"
            options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item label="優先級" name="priority">
          <Select
            allowClear
            placeholder="全部"
            options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item label="需求狀態" name="status">
          <Select allowClear showSearch placeholder="全部" options={statusOptions} />
        </Form.Item>
        <Form.Item>
          <div className="search-actions">
            <Button type="primary" icon={<SearchOutlined />} onClick={submit}>查詢</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                form.resetFields()
                onReset()
              }}
            >
              重置
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
