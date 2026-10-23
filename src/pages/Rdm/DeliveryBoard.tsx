/**
 * 研发交付 —— UI 设计 / 前端 / 后端 / 测试 的日常工作台
 *
 * 设计口径：研发人员进来只关心三件事——我有什么任务、今天该交什么、进度怎么报。
 * 因此默认筛选「未完成」，逾期与阻塞置顶；上报走行内展开面板（不弹窗，避免打断录入）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Empty, Input, InputNumber, Modal, Progress, Segmented, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { rdmTableLocale } from './components/tableLocale'
import { deriveRdmColumnMeta } from './rdmColumnMeta'
import GanttChart from './components/GanttChart'
import { useAuth } from '../../contexts/AuthContext'
import {
  addCrossDeliveryDependency,
  fetchBlockedTasks,
  fetchDeliveryItems,
  fetchMyTasks,
  fetchReqTasks,
  reportTask,
  type RdmBlockedTaskInfo,
  type RdmDeliveryItemListItem,
  type RdmTaskItem,
} from '../../api/rdm'
import {
  RDM_BLOCK_POINT,
  RDM_BLOCK_POINT_COLOR,
  RDM_BLOCK_POINT_LABEL,
  RDM_DELIVERY_ITEM_STATUS_COLOR,
  RDM_DELIVERY_ITEM_STATUS_LABEL,
  RDM_DEP_TYPE,
  RDM_DEP_TYPE_LABEL,
  RDM_TASK_ACTION,
  RDM_TASK_ACTION_LABEL,
  RDM_TASK_STATUS,
  RDM_TASK_STATUS_COLOR,
  RDM_TASK_STATUS_LABEL,
  RDM_STATUS_LABEL,
  type RdmTaskAction,
  type RdmTaskStatus,
  type RdmStatus,
} from '../../constants/rdm'
import { useTaskTypeDict } from '../../hooks/useTaskTypeDict'
import './index.css'

/** 视角筛选 */
const VIEW_OPTIONS = [
  { label: '未完成', value: 'open' },
  { label: '進行中', value: RDM_TASK_STATUS.DOING },
  { label: '已完成', value: RDM_TASK_STATUS.DONE },
  { label: '全部', value: 'all' },
]

/** 视图模式（阶段 5）：任务列表 / 甘特与关键路径；资源负载已升级为独立菜单「團隊負載」（/rdm-resource-load） */
const MODE_OPTIONS = [
  { label: '任務列表', value: 'task' },
  { label: '甘特與關鍵路徑', value: 'gantt' },
]

/** V3：任务分组视角（按任务 / 按交付项） */
const GROUP_MODE_OPTIONS = [
  { label: '按任務', value: 'task' },
  { label: '按交付項', value: 'deliveryItem' },
]

export default function DeliveryBoard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  // 任务类型字典（业务可配置）：类型标签/颜色从接口取，未知 code 兑底原文
  const { labelOf: taskTypeLabelOf, colorOf: taskTypeColorOf } = useTaskTypeDict()
  const { hasPermission, user } = useAuth()
  /** 管理员不受「只看自己」限制：本页展示全部任务（服务端 scope=all 亦会二次校验） */
  const isAdmin = user?.role === 'admin'
  /** 两个视图共用一个页面：新建路由会撞 MenuTabs 的非菜单页名兜底表上限（已达 20/20） */
  const [mode, setMode] = useState('task')
  const [view, setView] = useState('open')
  const [rows, setRows] = useState<RdmTaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [progress, setProgress] = useState<number>(50)
  const [actualHours, setActualHours] = useState<number | null>(null)
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  /** V3：任务分组视角 */
  const [groupMode, setGroupMode] = useState<'task' | 'deliveryItem'>('task')
  /** V3：交付项列表（按交付项分组时用） */
  const [deliveryItems, setDeliveryItems] = useState<RdmDeliveryItemListItem[]>([])
  const [deliveryItemsLoading, setDeliveryItemsLoading] = useState(false)

  /** Batch2：跨交付项依赖弹窗 */
  const [depModalOpen, setDepModalOpen] = useState(false)
  const [depSuccTask, setDepSuccTask] = useState<RdmTaskItem | null>(null)
  const [depItems, setDepItems] = useState<RdmDeliveryItemListItem[]>([])
  const [depItemsLoading, setDepItemsLoading] = useState(false)
  const [depPredItemId, setDepPredItemId] = useState<number | undefined>()
  const [depPredTasks, setDepPredTasks] = useState<RdmTaskItem[]>([])
  const [depPredTasksLoading, setDepPredTasksLoading] = useState(false)
  const [depPredTaskId, setDepPredTaskId] = useState<number | undefined>()
  const [depBlockPoint, setDepBlockPoint] = useState<string>(RDM_BLOCK_POINT.START)
  const [depType, setDepType] = useState<string>(RDM_DEP_TYPE.FS)
  const [depSubmitting, setDepSubmitting] = useState(false)

  /** Batch2：交付项阻塞任务映射（按交付项分组视图用） */
  const [blockedMap, setBlockedMap] = useState<Record<number, RdmBlockedTaskInfo[]>>({})
  const [expandedBlockedId, setExpandedBlockedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const status = view === 'open' || view === 'all' ? undefined : view
      const list = await fetchMyTasks(status, isAdmin ? 'all' : undefined)
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
  }, [view, isAdmin])

  useEffect(() => { void load() }, [load])

  /** V3：按交付项分组时拉取交付项列表 */
  useEffect(() => {
    if (groupMode !== 'deliveryItem') { setDeliveryItems([]); return }
    setDeliveryItemsLoading(true)
    fetchDeliveryItems({ pageNo: 1, pageSize: 200 })
      .then(res => setDeliveryItems(res.records ?? []))
      .catch(() => setDeliveryItems([]))
      .finally(() => setDeliveryItemsLoading(false))
  }, [groupMode])

  /** V3：按交付项分组的任务 */
  const groupedByDeliveryItem = useMemo(() => {
    if (groupMode !== 'deliveryItem' || deliveryItems.length === 0) return null
    const map = new Map<number | 'none', { item?: RdmDeliveryItemListItem; tasks: RdmTaskItem[] }>()
    // 初始化每个交付项的分组
    deliveryItems.forEach(di => map.set(di.id, { item: di, tasks: [] }))
    map.set('none', { tasks: [] })
    // 分配任务到对应分组
    rows.forEach(task => {
      const key = task.deliveryItemId ?? 'none'
      const group = map.get(key)
      if (group) group.tasks.push(task)
      else map.get('none')!.tasks.push(task)
    })
    return [...map.entries()].filter(([, g]) => g.tasks.length > 0 || g.item)
  }, [groupMode, deliveryItems, rows])

  /** Batch2：按交付项分组时，拉每个交付项的阻塞任务（后端不可用时降级为空） */
  useEffect(() => {
    if (groupMode !== 'deliveryItem' || deliveryItems.length === 0) { setBlockedMap({}); return }
    let cancelled = false
    Promise.all(deliveryItems.map(di =>
      fetchBlockedTasks(di.id).catch(() => [] as RdmBlockedTaskInfo[]).then(list => [di.id, list] as const)
    )).then(entries => {
      if (cancelled) return
      const map: Record<number, RdmBlockedTaskInfo[]> = {}
      entries.forEach(([id, list]) => { if (list.length > 0) map[id] = list })
      setBlockedMap(map)
    }).catch(() => { if (!cancelled) setBlockedMap({}) })
    return () => { cancelled = true }
  }, [groupMode, deliveryItems])

  /** Batch2：打开「添加跨交付项依赖」弹窗 */
  const openDepModal = (task: RdmTaskItem) => {
    setDepSuccTask(task)
    setDepPredItemId(undefined)
    setDepPredTaskId(undefined)
    setDepPredTasks([])
    setDepBlockPoint(RDM_BLOCK_POINT.START)
    setDepType(RDM_DEP_TYPE.FS)
    setDepModalOpen(true)
    setDepItemsLoading(true)
    fetchDeliveryItems({ pageNo: 1, pageSize: 200 })
      .then(res => setDepItems((res.records ?? []).filter(di => di.id !== task.deliveryItemId)))
      .catch(() => setDepItems([]))
      .finally(() => setDepItemsLoading(false))
  }

  /** Batch2：选定前置交付项后拉其任务 */
  const handlePredItemChange = (itemId: number) => {
    setDepPredItemId(itemId)
    setDepPredTaskId(undefined)
    const item = depItems.find(di => di.id === itemId)
    if (!item) { setDepPredTasks([]); return }
    setDepPredTasksLoading(true)
    fetchReqTasks(item.reqId)
      .then(tasks => setDepPredTasks((tasks ?? []).filter(t => t.deliveryItemId === itemId)))
      .catch(() => setDepPredTasks([]))
      .finally(() => setDepPredTasksLoading(false))
  }

  /** Batch2：提交跨交付项依赖 */
  const submitDep = async () => {
    if (!depSuccTask || !depPredTaskId) {
      message.warning('請選擇前置交付項與前置任務')
      return
    }
    setDepSubmitting(true)
    try {
      await addCrossDeliveryDependency({
        predTaskId: depPredTaskId,
        succTaskId: depSuccTask.id,
        depType,
        blockPoint: depBlockPoint,
      })
      message.success('跨交付項依賴已添加')
      setDepModalOpen(false)
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '添加依賴失敗，請重試')
    } finally {
      setDepSubmitting(false)
    }
  }

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
    /*
     * 完成与阻塞都必须先有说明：服务端本来就要求「完成必須填寫交付說明或交付物連結」，
     * 之前界面让「完成」按钮直发请求，用户点了只收到一句报错，
     * 不知道要在哪里补、甚至以为上报坏了。现在就地展开面板并说清缺什么。
     */
    if ((action === RDM_TASK_ACTION.BLOCK || action === RDM_TASK_ACTION.DONE) && !remark.trim()) {
      setExpandedId(task.id)
      setProgress(task.progress ?? 0)
      message.warning(action === RDM_TASK_ACTION.DONE
        ? '完成任務必須填寫交付說明或交付物連結（作為驗收與績效依據）'
        : '標記阻塞必須填寫阻塞原因')
      return
    }
    /*
     * 完成與阻塞會寫入驗收與績效依據的事實，按 §B.3 必須二次確認（custom-confirm-modal）；
     * 開始/解除阻塞只是可立即改回的狀態推進，不再加確認以免干擾填報節奏。
     * 順序固定為「校驗 → 弹確認框 → 調接口」，不得先弹框後校驗。
     */
    if (action === RDM_TASK_ACTION.DONE || action === RDM_TASK_ACTION.BLOCK) {
      const confirmed = await new Promise<boolean>(resolve => {
        Modal.confirm({
          title: action === RDM_TASK_ACTION.DONE ? '確認完成該任務？' : '確認標記阻塞？',
          className: 'custom-confirm-modal',
          icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
          content: (
            <div className="confirm-info-card">
              <div className="confirm-info-row"><span>任務：</span><b>{task.taskNo}</b></div>
              <div className="confirm-info-row"><span>所屬需求：</span><b>{task.reqTitle ?? '-'}</b></div>
              <div className="confirm-info-row"><span>上報進度：</span><b>{action === RDM_TASK_ACTION.DONE ? '100%' : `${progress}%`}</b></div>
              <div className="confirm-info-row"><span>實際工時：</span><b>{actualHours ?? 0} h</b></div>
              <div className="confirm-info-row">
                <span>{action === RDM_TASK_ACTION.DONE ? '交付說明：' : '阻塞原因：'}</span><b>{remark}</b>
              </div>
            </div>
          ),
          okText: '確認上報',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) {
        return
      }
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
      // request.ts 已统一弹后端失败原因，此处不再双弹（§G.4）
      console.error('任務上報失敗', task.id, action)
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<RdmTaskItem> = [
    { title: '任務編號', dataIndex: 'taskNo', key: 'taskNo', width: 100, ellipsis: true },
    {
      title: '任務標題', dataIndex: 'title', key: 'title', width: 170, ellipsis: true,
      render: (v: string, r) => (
        <div className="rdm-table-title">
          <a className="rdm-table-title__link" title={v} href={`#/rdm-detail?id=${r.reqId}`}>{v}</a>
          {r.overdue && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
          {r.deliveryItemId != null && (
            <Tag className="rdm-v3-di-tag" color="geekblue" style={{ margin: 0 }} title={r.deliveryItemTitle ?? undefined}>
              <a onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${r.deliveryItemId}`)}>
                {r.deliveryItemTitle ?? `交付項 #${r.deliveryItemId}`}
              </a>
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '類型', dataIndex: 'taskType', key: 'taskType', width: 90,
      render: (v: string) => {
        const color = taskTypeColorOf(v)
        return <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>{taskTypeLabelOf(v)}</Tag>
      },
    },
    {
      title: '所屬需求', key: 'req', width: 150, ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div className="rdm-table-title__link" title={r.reqTitle ?? undefined} style={{ color: '#262626' }}>{r.reqTitle ?? '-'}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {r.reqNo}
            {r.reqStatus ? ` · ${RDM_STATUS_LABEL[r.reqStatus as RdmStatus] ?? r.reqStatus}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 120,
      render: (v: string, r) => (
        <div className="rdm-task-status">
          <Tag color={RDM_TASK_STATUS_COLOR[v as RdmTaskStatus] ?? 'default'} style={{ margin: 0 }}>
            {RDM_TASK_STATUS_LABEL[v as RdmTaskStatus] ?? v}
          </Tag>
          {/* 阻塞不能只报「阻塞中」：不显示原因就只能点进详情找卡点是谁、卡在哪 */}
          {v === RDM_TASK_STATUS.BLOCKED && r.blockedReason && (
            <div className="rdm-task-status__block" title={r.blockedReason}>
              <WarningOutlined /> {r.blockedReason}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '進度', key: 'progress', width: 140,
      render: (_, r) => {
        const pct = r.progress ?? 0
        const done = r.status === RDM_TASK_STATUS.DONE
        const blocked = r.status === RDM_TASK_STATUS.BLOCKED
        return (
          <div className="rdm-task-progress">
            <div className="rdm-task-progress__line">
              <Progress
                percent={pct}
                size="small"
                showInfo={false}
                strokeColor={done ? '#52C41A' : blocked ? '#FA8C16' : r.overdue ? '#FF4D4F' : '#E8720C'}
                style={{ width: 78, margin: 0 }}
              />
              <span className="rdm-task-progress__pct">{pct}%</span>
            </div>
            {/* 缺报不等于 0：工时与进度必须分开展示，否则「0% 未填報」会被读成这活没花时间 */}
            <div className={`rdm-task-progress__hours${r.actualHoursReported ? '' : ' is-missing'}`}>
              {r.actualHoursReported
                ? t('rdm.deliveryBoard.progressHours', { actual: r.actualHours ?? 0, plan: r.planHours ?? '-', defaultValue: '工時 {{actual}} / {{plan}}h' })
                : t('rdm.deliveryBoard.progressHoursMissing', { plan: r.planHours ?? '-', defaultValue: '未填工時 · 計劃 {{plan}}h' })}
            </div>
          </div>
        )
      },
    },
    {
      title: '計劃完成', dataIndex: 'planFinishDate', key: 'planFinishDate', width: 110,
      render: (v?: string | null) => <span style={{ color: v && dayjs(v).isBefore(dayjs(), 'day') ? '#CF1322' : '#595959' }}>{v ?? '-'}</span>,
    },
    { title: '迭代', dataIndex: 'iterationCode', key: 'iterationCode', width: 100, ellipsis: true, render: (v?: string | null) => v ?? '-' },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      // §B.9：操作列只用纯文字 + 竖线分隔，禁止图标；危险动作（阻塞）放最后
      render: (_, r) => {
        const actions = [
          r.status !== RDM_TASK_STATUS.DONE && (
            <Button key="report" type="link" size="small"
              onClick={() => { setExpandedId(expandedId === r.id ? null : r.id); setProgress(r.progress ?? 0); setActualHours(null); setRemark('') }}>
              上報進度
            </Button>
          ),
          r.status === RDM_TASK_STATUS.TODO && (
            <Button key="start" type="link" size="small" onClick={() => handleReport(r, RDM_TASK_ACTION.START)}>開始</Button>
          ),
          r.status === RDM_TASK_STATUS.BLOCKED ? (
            <Button key="unblock" type="link" size="small" onClick={() => handleReport(r, RDM_TASK_ACTION.UNBLOCK)}>解除阻塞</Button>
          ) : (
            <Button key="block" type="link" size="small" danger onClick={() => setExpandedId(r.id)}>阻塞</Button>
          ),
        ].filter(Boolean)
        return <Space size={0} split={<span className="action-split">|</span>}>{actions}</Space>
      },
    },
  ]

  /** 任务上报的行内展开面板：分组视图与平铺视图共用同一份配置，避免两处逻辑漂移 */
  const expandableConfig = {
    expandedRowKeys: expandedId ? [expandedId] : [],
    showExpandColumn: false,
    expandedRowRender: (r: RdmTaskItem) => (
      <div className="rdm-action-panel" style={{ margin: '4px 0 8px' }}>
        <div className="rdm-action-panel-title">
          上報進度：{r.taskNo}
          {r.status === RDM_TASK_STATUS.BLOCKED && r.blockedReason && (
            <span className="rdm-action-panel-blocked">
              <WarningOutlined /> {t('rdm.deliveryBoard.blockReason', { reason: r.blockedReason, defaultValue: '阻塞原因：{{reason}}' })}
            </span>
          )}
        </div>
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
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="完成/阻塞必填：交付說明或阻塞原因" style={{ width: 260 }} />
          </span>
          {/*
           * 不再单独提供「完成」：进度填到 100% 并确认就是完成，避免同一个结果有两个入口，
           * 也避免两个按钮都能点、用户分不清该点哪个。计划起止时间属于排期修正，走编辑页。
           */}
          <Space>
            <Button type="primary" size="small" loading={saving}
              onClick={() => handleReport(r, progress >= 100 ? RDM_TASK_ACTION.DONE : RDM_TASK_ACTION.START)}>
              {progress >= 100
                ? t('rdm.deliveryBoard.reportAndDone', { defaultValue: '上報並完成' })
                : t('rdm.deliveryBoard.reportProgress', { defaultValue: '開始 / 上報進度' })}
            </Button>
            {r.status === RDM_TASK_STATUS.BLOCKED ? (
              <Button size="small" loading={saving} onClick={() => handleReport(r, RDM_TASK_ACTION.UNBLOCK)}
              >{t('rdm.deliveryBoard.unblock', { defaultValue: '解除阻塞' })}</Button>
            ) : (
              <Button size="small" danger loading={saving} onClick={() => handleReport(r, RDM_TASK_ACTION.BLOCK)}
              >{t('rdm.deliveryBoard.block', { defaultValue: '標記阻塞' })}</Button>
            )}
            <Button size="small" onClick={() => setExpandedId(null)}>取消</Button>
          </Space>
        </Space>
        {progress >= 100 && (
          <div className="rdm-action-panel-hint">
            {t('rdm.deliveryBoard.doneAtHundred', { defaultValue: '進度 100% 上報後，二次確認即把任務標記為已完成，必須填寫交付說明' })}
          </div>
        )}
        {/* Batch2：前置依賴（跨交付項） */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #E8EAED' }}>
          <Space size={8} wrap>
            <LinkOutlined style={{ color: '#2F54EB' }} />
            <span style={{ fontSize: 12, color: '#595959' }}>前置依賴</span>
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openDepModal(r)}>添加跨交付項依賴</Button>
          </Space>
        </div>
      </div>
    ),
  }

  /**
   * 列配置（§E.3）：本工作台一行信息密度高（需求/工时/迭代/类型都挤在一张表），
   * 不同角色关心的列差别很大（研发看进度、协调人看交付项），必须能自己收起不看的列。
   * 候选清单从 columns 派生，不手写，避免和真实列漂移。
   */
  const columnMeta = useMemo(() => deriveRdmColumnMeta(columns), [columns])
  const { configComponent, applyConfig } = useColumnConfig('rdm-delivery-board-task', columnMeta, [
    { key: 'taskNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const visibleColumns = applyConfig(columns) as TableColumnsType<RdmTaskItem>

  /** 渲染任务表：paged=true 为平铺视图（分页），false 为分组内嵌视图（不分页） */
  const renderTaskTable = (data: RdmTaskItem[], paged: boolean, extraLoading = false) => (
    <Table<RdmTaskItem>
      className="nowrap-table"
      rowKey="id"
      rowClassName={r => (r.status === RDM_TASK_STATUS.BLOCKED ? 'rdm-task-row--blocked' : '')}
      loading={loading || extraLoading}
      locale={rdmTableLocale(loading || extraLoading, '暫無任務數據')}
      columns={visibleColumns}
      dataSource={data}
      scroll={{ x: 1140 }}
      expandable={expandableConfig}
      pagination={paged ? {
        // 客户端分页用 defaultPageSize：写死 pageSize 会变成受控常量，
        // 用户选 20/50 会被下一次渲染打回 10（“每页条数”选了没反应）
        defaultPageSize: 10,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: t => `共 ${t} 條`,
      } : false}
    />
  )

  return (
    <div className="content-area">
      {isAdmin && mode === 'task' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('rdm.deliveryBoard.adminScopeHint')}
        />
      )}

      {/* 頁面說明横幅：不屬統計卡，按 §E.8 留在搜索區上方（僅任務形態需要這段口徑說明） */}
      {mode === 'task' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="任務全部完成後，需求才會沿當前狀態可走的路徑聯動（需求尚在排期/設計階段時不會直接跳到驗收，必須先在需求詳情逐段流轉）；實際工時用於產出量化與績效對接，請如實填報。"
        />
      )}

      {/* 視圖/形態切換屬於篩選的一部分（§E.8）：統一放進 .search-section，不再與操作按鈕擠在同一行 */}
      <div className="search-section">
        <Space size={12} wrap>
          <Segmented value={mode} onChange={v => setMode(v as string)} options={MODE_OPTIONS} />
          {mode === 'task' && (
            <Segmented value={view} onChange={v => setView(v as string)} options={VIEW_OPTIONS} />
          )}
          {mode === 'task' && (
            <Segmented
              className="rdm-v3-group-toggle"
              value={groupMode}
              onChange={v => setGroupMode(v as 'task' | 'deliveryItem')}
              options={GROUP_MODE_OPTIONS}
            />
          )}
        </Space>
      </div>

      {mode === 'gantt' && <GanttChart editable={hasPermission('rdm-requirement:edit') || hasPermission('rdm-delivery-board:edit')} />}

      {mode !== 'task' ? null : (
      <>
      {/* 統計卡：必須在搜索區下方、操作區上方（§E.8） */}
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

      {/* 操作區：中性動作在左，新增類在右（§E.2），不得插在統計卡之前 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          {/*
            跳转类按钮按目标菜单权限隐藏。
            受限角色（例如只授「研發工作台」）能看到这些按钮，点下去直接进 403 页，
            是「暴露了做不到的动作」——比不显示更差：用户会以为系统坏了或自己没权限被针对。
            hasPermission 已内置 admin 直通，不会削弱管理员可用性。
          */}
          {hasPermission('rdm-delivery-iteration:view') && (
            <Button onClick={() => navigate('/rdm-iteration')}>迭代排期</Button>
          )}
          {hasPermission('rdm-requirement:view') && (
            <Button onClick={() => navigate('/rdm-requirement?scope=delivery')}>查看交付中需求</Button>
          )}
          {hasPermission('rdm-resource-load:view') && (
            <Button onClick={() => navigate('/rdm-resource-load')}>{t('rdm.deliveryBoard.btnTeamLoad')}</Button>
          )}
        </div>
        <div className="action-section-right">
          {hasPermission('rdm-delivery-board:create') && (
            <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-task')}>新增任務</Button>
          )}
          {configComponent}
        </div>
      </div>

      {groupMode === 'deliveryItem' && groupedByDeliveryItem ? (
        <div className="rdm-v3-groups">
          {groupedByDeliveryItem.map(([key, g]) => (
            <div className="rdm-v3-group" key={String(key)}>
              <div className="rdm-v3-group-head">
                <span className="rdm-v3-group-title">{g.item ? g.item.title : '未關聯交付項'}</span>
                {g.item && (
                  <Tag color={RDM_DELIVERY_ITEM_STATUS_COLOR[g.item.status] ?? 'default'} style={{ margin: 0 }}>
                    {RDM_DELIVERY_ITEM_STATUS_LABEL[g.item.status] ?? g.item.status}
                  </Tag>
                )}
                {g.item?.coordinatorUserName && (
                  <span className="rdm-v3-group-coord">協調人：{g.item.coordinatorUserName}</span>
                )}
                <span className="rdm-v3-group-count">{g.tasks.length} 個任務</span>
                {g.item && (blockedMap[g.item.id]?.length ?? 0) > 0 && (
                  <Badge count={blockedMap[g.item.id].length} size="small">
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<WarningOutlined />}
                      onClick={() => setExpandedBlockedId(expandedBlockedId === g.item!.id ? null : g.item!.id)}
                    >
                      阻塞項
                    </Button>
                  </Badge>
                )}
                {g.item && (
                  <Button type="link" size="small" onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${g.item!.id}`)}>交付項詳情</Button>
                )}
              </div>
              {g.item && expandedBlockedId === g.item.id && (blockedMap[g.item.id]?.length ?? 0) > 0 && (
                <div style={{ margin: '0 0 8px', padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#D46B08', marginBottom: 6 }}>
                    <WarningOutlined /> 被前置依賴阻塞的任務（{blockedMap[g.item.id].length}）
                  </div>
                  {blockedMap[g.item.id].map(bt => (
                    <div key={bt.taskId} style={{ fontSize: 12, color: '#595959', lineHeight: 1.9 }}>
                      · {bt.taskTitle}
                      <Tag color={RDM_BLOCK_POINT_COLOR[bt.blockPoint] ?? 'orange'} style={{ margin: '0 6px' }}>
                        {RDM_BLOCK_POINT_LABEL[bt.blockPoint] ?? bt.blockPoint}
                      </Tag>
                      待 <a onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${bt.predDeliveryItemId}`)}>{bt.predDeliveryItemTitle}</a>
                      {bt.reason && <span style={{ color: '#8C8C8C' }}>（{bt.reason}）</span>}
                    </div>
                  ))}
                </div>
              )}
              {renderTaskTable(g.tasks, false, deliveryItemsLoading)}
            </div>
          ))}
        </div>
      ) : (
        renderTaskTable(rows, true)
      )}
      </>
      )}

      {/* Batch2：添加跨交付項依賴 */}
      <Modal
        title="添加跨交付項依賴"
        open={depModalOpen}
        onCancel={() => setDepModalOpen(false)}
        onOk={submitDep}
        okText="添加"
        cancelText="取消"
        confirmLoading={depSubmitting}
        okButtonProps={{ disabled: !depPredTaskId }}
      >
        {depSuccTask && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={<span>後置任務：<b>{depSuccTask.taskNo}</b> {depSuccTask.title}</span>}
          />
        )}
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>前置交付項</div>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              loading={depItemsLoading}
              placeholder="選擇前置交付項"
              value={depPredItemId}
              onChange={handlePredItemChange}
              notFoundContent={depItemsLoading ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無其他交付項" />}
              options={depItems.map(di => ({ value: di.id, label: `${di.itemNo} · ${di.title}` }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>前置任務</div>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              disabled={!depPredItemId}
              loading={depPredTasksLoading}
              placeholder={depPredItemId ? '選擇前置任務' : '請先選擇前置交付項'}
              value={depPredTaskId}
              onChange={setDepPredTaskId}
              notFoundContent={depPredTasksLoading ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="該交付項下暫無任務" />}
              options={depPredTasks.map(t => ({ value: t.id, label: `${t.taskNo} · ${t.title}` }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>阻斷點</div>
              <Select
                style={{ width: '100%' }}
                value={depBlockPoint}
                onChange={setDepBlockPoint}
                options={Object.values(RDM_BLOCK_POINT).map(bp => ({ value: bp, label: RDM_BLOCK_POINT_LABEL[bp] ?? bp }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>依賴類型</div>
              <Select
                style={{ width: '100%' }}
                value={depType}
                onChange={setDepType}
                options={Object.values(RDM_DEP_TYPE).map(dt => ({ value: dt, label: RDM_DEP_TYPE_LABEL[dt] ?? dt }))}
              />
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  )
}
