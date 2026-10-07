/**
 * 研发交付 —— UI 设计 / 前端 / 后端 / 测试 的日常工作台
 *
 * 设计口径：研发人员进来只关心三件事——我有什么任务、今天该交什么、进度怎么报。
 * 因此默认筛选「未完成」，逾期与阻塞置顶；上报走行内展开面板（不弹窗，避免打断录入）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, InputNumber, Progress, Segmented, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import GanttChart from './components/GanttChart'
import WorkloadPanel from './components/WorkloadPanel'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchMyTasks,
  reportTask,
  type RdmTaskItem,
} from '../../api/rdm'
import {
  RDM_TASK_ACTION,
  RDM_TASK_ACTION_LABEL,
  RDM_TASK_STATUS,
  RDM_TASK_STATUS_COLOR,
  RDM_TASK_STATUS_LABEL,
  RDM_TASK_TYPE_COLOR,
  RDM_TASK_TYPE_LABEL,
  RDM_STATUS_LABEL,
  type RdmTaskAction,
  type RdmTaskStatus,
  type RdmTaskType,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

/** 视角筛选 */
const VIEW_OPTIONS = [
  { label: '未完成', value: 'open' },
  { label: '進行中', value: RDM_TASK_STATUS.DOING },
  { label: '已完成', value: RDM_TASK_STATUS.DONE },
  { label: '全部', value: 'all' },
]

/** 视图模式（阶段 5）：任务列表 / 甘特与关键路径 / 资源负载 */
const MODE_OPTIONS = [
  { label: '任務列表', value: 'task' },
  { label: '甘特與關鍵路徑', value: 'gantt' },
  { label: '資源負載', value: 'load' },
]

export default function DeliveryBoard() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  /** 三个视图共用一个页面：新建路由会撞 MenuTabs 的非菜单页名兜底表上限（已达 20/20） */
  const [mode, setMode] = useState('task')
  const [view, setView] = useState('open')
  const [rows, setRows] = useState<RdmTaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [progress, setProgress] = useState<number>(50)
  const [actualHours, setActualHours] = useState<number | null>(null)
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const status = view === 'open' || view === 'all' ? undefined : view
      const list = await fetchMyTasks(status)
      // 未完成视角下，逾期与阻塞的任务置顶，避免被列表淹没
      const sorted = [...list].sort((a, b) => {
        const rank = (t: RdmTaskItem) => (t.status === RDM_TASK_STATUS.BLOCKED ? 0 : t.overdue ? 1 : t.status === RDM_TASK_STATUS.DOING ? 2 : 3)
        return rank(a) - rank(b)
      })
      setRows(view === 'open' ? sorted.filter(t => t.status !== RDM_TASK_STATUS.DONE && t.status !== RDM_TASK_STATUS.CANCELLED) : sorted)
    } catch {
      message.error('任務載入失敗')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    total: rows.length,
    doing: rows.filter(r => r.status === RDM_TASK_STATUS.DOING).length,
    blocked: rows.filter(r => r.status === RDM_TASK_STATUS.BLOCKED).length,
    overdue: rows.filter(r => r.overdue).length,
    done: rows.filter(r => r.status === RDM_TASK_STATUS.DONE).length,
    hours: rows.reduce((sum, r) => sum + (r.actualHours ?? 0), 0),
  }), [rows])

  /** 上报任务动作（开始/完成/阻塞/解除），完成后自动收起面板 */
  const handleReport = async (task: RdmTaskItem, action: RdmTaskAction) => {
    if (action === RDM_TASK_ACTION.BLOCK && !remark.trim()) {
      message.warning('標記阻塞必須填寫阻塞原因')
      return
    }
    setSaving(true)
    try {
      await reportTask(task.id, {
        action,
        progress: action === RDM_TASK_ACTION.DONE ? 100 : progress,
        actualHours: actualHours ?? undefined,
        remark: remark || undefined,
      })
      message.success(`已上報：${RDM_TASK_ACTION_LABEL[action]}`)
      setExpandedId(null)
      setRemark('')
      setActualHours(null)
      await load()
    } catch {
      message.error('上報失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<RdmTaskItem> = [
    { title: '任務編號', dataIndex: 'taskNo', key: 'taskNo', width: 150 },
    {
      title: '任務標題', dataIndex: 'title', key: 'title', width: 240,
      render: (v: string, r) => (
        <Space size={4}>
          <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>
          {r.overdue && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
        </Space>
      ),
    },
    {
      title: '類型', dataIndex: 'taskType', key: 'taskType', width: 100,
      render: (v: string) => {
        const color = RDM_TASK_TYPE_COLOR[v as RdmTaskType] ?? '#8C8C8C'
        return <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>{RDM_TASK_TYPE_LABEL[v as RdmTaskType] ?? v}</Tag>
      },
    },
    {
      title: '所屬需求', key: 'req', width: 220,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div>{r.reqTitle ?? '-'}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {r.reqNo}
            {r.reqStatus ? ` · ${RDM_STATUS_LABEL[r.reqStatus as RdmStatus] ?? r.reqStatus}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => (
        <Tag color={RDM_TASK_STATUS_COLOR[v as RdmTaskStatus] ?? 'default'} style={{ margin: 0 }}>
          {RDM_TASK_STATUS_LABEL[v as RdmTaskStatus] ?? v}
        </Tag>
      ),
    },
    {
      title: '進度', key: 'progress', width: 130,
      render: (_, r) => (
        <Space size={6}>
          <Progress percent={r.progress ?? 0} size="small" style={{ width: 66 }} />
          {/* 缺报不等于 0：本工作台是研发看自己负载的地方，显示 0 会被当成“这活没花时间” */}
          <span style={{ fontSize: 12, color: r.actualHoursReported ? '#8C8C8C' : '#FA8C16' }}>
            {r.actualHoursReported ? `${r.actualHours ?? 0}/${r.planHours ?? '-'}h` : `未填報 / ${r.planHours ?? '-'}h`}
          </span>
        </Space>
      ),
    },
    {
      title: '計劃完成', dataIndex: 'planFinishDate', key: 'planFinishDate', width: 120,
      render: (v?: string | null) => <span style={{ color: v && dayjs(v).isBefore(dayjs(), 'day') ? '#CF1322' : '#595959' }}>{v ?? '-'}</span>,
    },
    { title: '迭代', dataIndex: 'iterationCode', key: 'iterationCode', width: 110, render: (v?: string | null) => v ?? '-' },
    {
      title: '操作', key: 'action', width: 230, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          {r.status !== RDM_TASK_STATUS.DONE && (
            <>
              <Button type="link" size="small" onClick={() => { setExpandedId(expandedId === r.id ? null : r.id); setProgress(r.progress ?? 0); setActualHours(null); setRemark('') }}>
                上報進度
              </Button>
              <span className="action-split">|</span>
            </>
          )}
          {r.status === RDM_TASK_STATUS.TODO && (
            <>
              <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleReport(r, RDM_TASK_ACTION.START)}>開始</Button>
              <span className="action-split">|</span>
            </>
          )}
          {r.status === RDM_TASK_STATUS.DOING && (
            <>
              <Button type="link" size="small" style={{ color: '#52C41A' }} icon={<CheckCircleOutlined />} onClick={() => handleReport(r, RDM_TASK_ACTION.DONE)}>完成</Button>
              <span className="action-split">|</span>
            </>
          )}
          {r.status === RDM_TASK_STATUS.BLOCKED ? (
            <Button type="link" size="small" onClick={() => handleReport(r, RDM_TASK_ACTION.UNBLOCK)}>解除阻塞</Button>
          ) : (
            <Button type="link" size="small" danger icon={<PauseCircleOutlined />} onClick={() => setExpandedId(r.id)}>阻塞</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Space size={12} wrap>
          <Segmented value={mode} onChange={v => setMode(v as string)} options={MODE_OPTIONS} />
          {mode === 'task' && (
            <Segmented value={view} onChange={v => setView(v as string)} options={VIEW_OPTIONS} />
          )}
        </Space>
        <Space size={8} wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-iteration')}>迭代排期</Button>
          <Button onClick={() => navigate('/rdm-requirement?scope=delivery')}>查看交付中需求</Button>
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-task')}>新增任務</Button>
        </Space>
      </div>

      {mode === 'gantt' && <GanttChart editable={hasPermission('rdm-requirement:edit') || hasPermission('rdm-delivery-board:edit')} />}

      {mode === 'load' && <WorkloadPanel />}

      {mode !== 'task' ? null : (
      <>
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={view}
          items={[
            { key: 'total', icon: <FileAddOutlined />, value: stats.total, label: '範圍內任務', color: 'info' },
            { key: 'doing', icon: <PlayCircleOutlined />, value: stats.doing, label: '進行中', color: 'brand' },
            { key: 'blocked', icon: <PauseCircleOutlined />, value: stats.blocked, label: '阻塞中', color: 'system' },
            { key: 'overdue', icon: <AlertOutlined />, value: stats.overdue, label: '已逾期', color: 'system' },
            { key: 'done', icon: <CheckCircleOutlined />, value: stats.done, label: '已完成', color: 'success' },
            { key: 'hours', icon: <ClockCircleOutlined />, value: Number(stats.hours.toFixed(1)), decimals: 1, suffix: ' h', label: '實際工時合計', color: 'info' },
          ]}
        />
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="任務全部完成後，需求才會沿當前狀態可走的路徑聯動（需求尚在排期/設計階段時不會直接跳到驗收，必須先在需求詳情逐段流轉）；實際工時用於產出量化與績效對接，請如實填報。"
      />

      <Table<RdmTaskItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1500 }}
        expandable={{
          expandedRowKeys: expandedId ? [expandedId] : [],
          showExpandColumn: false,
          expandedRowRender: (r) => (
            <div className="rdm-action-panel" style={{ margin: '4px 0 8px' }}>
              <div className="rdm-action-panel-title">上報進度：{r.taskNo}</div>
              <Space size={12} wrap align="end">
                <span>
                  <span style={{ fontSize: 12, color: '#595959', marginRight: 6 }}>進度 %</span>
                  <InputNumber min={0} max={100} value={progress} onChange={v => setProgress(v ?? 0)} style={{ width: 80 }} />
                </span>
                <span>
                  <span style={{ fontSize: 12, color: '#595959', marginRight: 6 }}>實際工時</span>
                  <InputNumber min={0} step={0.5} value={actualHours} onChange={setActualHours} placeholder="選填" style={{ width: 90 }} />
                </span>
                <span style={{ minWidth: 260 }}>
                  <span style={{ fontSize: 12, color: '#595959', marginRight: 6 }}>說明 / 阻塞原因</span>
                  <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="阻塞時必填；可寫依賴方或風險" style={{ width: 260 }} />
                </span>
                {/* 计划起止时间属于排期修正，走任务编辑页；此处只报进度与工时 */}
                <Space>
                  <Button type="primary" size="small" loading={saving} onClick={() => handleReport(r, RDM_TASK_ACTION.START)}>開始 / 上報進度</Button>
                  <Button size="small" style={{ color: '#52C41A', borderColor: '#52C41A' }} loading={saving} onClick={() => handleReport(r, RDM_TASK_ACTION.DONE)}>完成</Button>
                  <Button size="small" danger loading={saving} onClick={() => handleReport(r, RDM_TASK_ACTION.BLOCK)}>標記阻塞</Button>
                  <Button size="small" onClick={() => setExpandedId(null)}>取消</Button>
                </Space>
              </Space>
            </div>
          ),
        }}
        pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條` }}
      />
      </>
      )}
    </div>
  )
}
