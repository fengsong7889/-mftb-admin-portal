/**
 * 需求清单 —— 需求全生命周期的唯一操作台
 *
 * 由原先「需求台賬 / 需求池·分配 / 產品需求處理 / 交付中需求」四个页面收敛而来：
 * 其中「產品需求處理」与「交付中需求」只是同一个组件套不同 scope 初始值
 * （菜单入口还把 Tab 锁死），作为菜单删除；可见性隔离本来也不靠它们，
 * 真实防线在查询层的 applyRelatedOnly。
 *
 * 因此两个维度都留在页内、不再上浮为菜单：
 * - 视角（scope）：顶部 Tab 是唯一入口，且以 URL `?scope=` 为单一数据源，
 *   这样深链、前进后退、分享链接都对；菜单入口只能“预选”默认视角，无权锁死 Tab；
 * - 形态（view）：表格精查/批量操作 ⇄ 看板扫视堵点，偏好记在本地。
 *
 * 需求池（rdm-intake）也共用本组件，只是换一组视角 Tab：它管上游的审批与分配，本清单只管执行。
 * 全量可见性与分配权都锁在需求池这个窄权限菜单上（canSeeAll 认 rdm-intake:view，
 * MENU_DISPATCHER 认 rdm-intake:edit）—— 看不到单子就分不出去，两者天然同侧；
 * 而台账是“人人可看”的宽权限，只到自己相关的切片为止，不会顺带看到全公司需求。
 *
 * 写操作按钮改为「行状态 + 授权」驱动（之前按视角驱动，导致无权角色在需求池
 * 也能看到分配按钮，点了才被后端拒）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, Modal, Segmented, Select, Space, Spin, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  FileAddOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchRequirementPage,
  fetchScopeCounts,
  fetchRequirementStats,
  fetchProductOptions,
  claimRequirement,
  submitRequirement,
  urgeRequirement,
  withdrawRequirement,
  type RdmRequirementRow,
} from '../../api/rdm'
import { fetchDepartments } from '../../api/department'
import { exportRequirementRows } from './requirementExport'
import RequirementKanban from './components/RequirementKanban'
import {
  RDM_KANBAN_SIZE,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_SCOPE,
  RDM_SCOPE_LABEL,
  RDM_STATUS,
  RDM_ACCEPTANCE_OPEN_STATUS,
  RDM_STATUS_LABEL,
  RDM_TERMINAL_STATUS,
  type RdmScope,
  type RdmStatus,
} from '../../constants/rdm'
import { ComplexityTag, PriorityTag, StatusTag, TypeTag } from './components/Tags'
import './index.css'

/**
 * 全部合法视角（用于校验 URL 上的 ?scope=）。
 * <p>不等于清单页展示的视角：需求池/全部需求/待我驗收各有独立菜单，
 * 但作为数据切片仍会被菜单入口与深链使用（如 /rdm-intake 预选 pool）。
 */
const VALID_SCOPES: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.APPROVING,
  RDM_SCOPE.POOL,
  RDM_SCOPE.PRODUCT,
  RDM_SCOPE.DELIVERY,
  RDM_SCOPE.ACCEPTANCE,
  RDM_SCOPE.ALL,
]

/**
 * 需求清单（执行侧）默认展示的视角。
 * <p>只放“已落到我手上要执行”的切片：
 * - 需求池·待分配 / 待我審批 / 全部需求 → 属于上游审批与分配环节，在「需求池」菜单；
 * - 待我驗收 → 「需求驗收」菜单。
 * <p>动线是：提出 → 准入審批 → 进需求池 → 分配 → 才进入本清单执行。
 */
const EXECUTION_SCOPES: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.PRODUCT,
  RDM_SCOPE.DELIVERY,
]

/**
 * 可撤回的状态：只有「待审批」。
 * <p>以前把草稿也算进去，草稿行会顶着一个必被服务端拒的「撤回」按钮（服务端只允许 intake_pending）。
 */
const WITHDRAWABLE: string[] = [RDM_STATUS.INTAKE_PENDING]

/**
 * 提出人可自助提交的状态：草稿与准入驳回。
 * <p>走 /rdm/requirement/{id}/submit（只要求 create），不占用通用流转的 edit 产品处理权。
 */
const SELF_SUBMITTABLE: string[] = [RDM_STATUS.DRAFT, RDM_STATUS.INTAKE_REJECTED]

/**
 * 列表筛选条件。
 * <p>后四项是「需求查询」这类全量检索页才展开的条件（提出部门/产品经理/仅逾期），
 * 后端 RdmRequirementQuery 早就支持，只是前端一直没暴露。
 */
interface RequirementFilters {
  keyword?: string
  reqType?: string
  priority?: string
  status?: string
  deptId?: number
  pmUserId?: number
  overdueOnly?: boolean
}

/** 视图形态偏好存储键（PM 习惯看板、业务/技术习惯表格，不应每次回来重选） */
const VIEW_STORAGE_KEY = 'rdm-requirement:view'

type ViewMode = 'table' | 'kanban'

interface RequirementListProps {
  /**
   * 进入时的默认视角（供「需求池」这类独立菜单入口使用）。
   * <p>只是预选：URL 上有 `?scope=` 时以 URL 为准。
   */
  defaultScope?: RdmScope
  /**
   * 顶部展示的视角 Tab（不传则用执行侧默认集）。
   * <p>同一个列表组件服务两种职责页：执行侧（需求清单）只给与自己相关的切片，
   * 分配侧（需求池）给「待分配 / 待我審批 / 全部需求」。
   * <p>传空数组表示不展示 Tab（单一切片页），此时页面会用当前视角名作标题。
   */
  scopeTabs?: readonly RdmScope[]
  /**
   * 是否展示全量检索条件（提出部门 / 产品经理 / 仅看逾期）。
   * <p>「需求池」需要：它要在全公司范围内找待分配的单子并按部门收敛。
   */
  advancedFilters?: boolean
}

/** 读偏好：隐私模式下 localStorage 会抛，不能因为读偏好失败让整个页面打不开 */
function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'table'
  } catch {
    return 'table'
  }
}

export default function RequirementList({
  defaultScope,
  scopeTabs = EXECUTION_SCOPES,
  advancedFilters = false,
}: RequirementListProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission, user } = useAuth()

  // 视角单一数据源是 URL；菜单入口只给默认值。非法值（手改地址栏）退回默认视角，
  // 不能让页面停在查不到数据的条件上
  const scopeParam = searchParams.get('scope')
  const activeScope: RdmScope =
    scopeParam && (VALID_SCOPES as string[]).includes(scopeParam)
      ? (scopeParam as RdmScope)
      : (defaultScope ?? RDM_SCOPE.MINE)
  const isPoolView = activeScope === RDM_SCOPE.POOL

  const [view, setView] = useState<ViewMode>(readStoredView)
  const [rows, setRows] = useState<RdmRequirementRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [counts, setCounts] = useState<Record<string, number>>({})
  /** 看板信号卡（服务端统计结果） */
  const [stats, setStats] = useState<Record<string, number>>({})
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [filters, setFilters] = useState<RequirementFilters>({})

  /**
   * 分配权只认 `rdm-intake:edit`（后端 MENU_DISPATCHER 就是这个）。
   * <p>故意不再 OR 上 `rdm-requirement:edit`：菜单收敛后需求清单也带了 edit，
   * 但那是受理/PRD/评审的需求侧处理权，不是分配权；一并认就会把刚刚
   * 修掉的“无分配权也看到分配按钮”重新引进来。
   */
  const canDispatch = hasPermission('rdm-intake:edit')

  /**
   * 认领资格只认受理权（rdm-requirement:edit）。
   * <p>不要求分配权：否则产品经理只能等着被分配，需求池就会堆成无人认领的积压区。
   */
  const canClaim = hasPermission('rdm-requirement:edit')

  /** 认领：服务端条件更新保证只有一人成功，抢到前必须二次确认 */
  const handleClaim = (row: RdmRequirementRow) => {
    Modal.confirm({
      title: '確認認領該需求？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求編號：</span><b>{row.reqNo}</b></div>
          <div className="confirm-info-row"><span>標題：</span><b>{row.title}</b></div>
          <div className="confirm-info-row">
            <span>認領後：</span><b>你成為受理人，需求離開需求池並通知提出人；若已被他人搶先，會提示失敗</b>
          </div>
        </div>
      ),
      okText: '確認認領',
      cancelText: '取消',
      onOk: async () => {
        try {
          await claimRequirement(row.id)
          message.success('已認領該需求')
          void load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '認領失敗，請刷新後重試')
          throw err
        }
      },
    })
  }

  /** 看板按列铺开、不翻页，所以一次拉固定上限；表格走分页 */
  const querySize = view === 'kanban' ? RDM_KANBAN_SIZE : size
  const kanbanTruncated = view === 'kanban' && total > RDM_KANBAN_SIZE

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRequirementPage({
        page: view === 'kanban' ? 1 : page,
        size: querySize,
        scope: activeScope,
        ...filters,
      })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      message.error('需求清單載入失敗')
    } finally {
      setLoading(false)
    }
  }, [view, page, querySize, activeScope, filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetchScopeCounts().then(setCounts).catch(() => setCounts({}))
  }, [activeScope])

  /**
   * 看板信号卡：服务端按当前筛选条件出数，只在看板视图下取。
   *
   * 以前是对已加载的 rows 做 filter().length，而看板一次只拉 RDM_KANBAN_SIZE 条，
   * 需求一多四个数字就永远停在上限，看起来像「逾期只有 60 条」。
   */
  useEffect(() => {
    if (view !== 'kanban') return
    let alive = true
    fetchRequirementStats({ scope: activeScope, ...filters })
      .then(s => { if (alive) setStats(s) })
      .catch(() => { if (alive) setStats({}) })
    return () => { alive = false }
  }, [view, activeScope, filters])

  /** 切换视角：写回 URL（而不是另存一份 state），否则刷新就丢，也无法从工作台深链带进来 */
  const switchScope = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('scope', key)
    setSearchParams(next, { replace: true })
    setPage(1)
    setSelectedKeys([])
    /*
     * 立刻丢掉上一个视角的数据。看板统计卡与表格行数是同一份 rows 算出来的，
     * 请求期间不清就会让用户拿旧视角的数字去做判断（表格有 loading 遮罩，
     * 但统计卡没遮，看上去就是“逾期 2 / 范围内 4”这种对不上的组合）。
     */
    setRows([])
    setTotal(0)
  }

  const switchView = (v: ViewMode) => {
    setView(v)
    setSelectedKeys([])
    setPage(1)
    // 两种视图拉的数量不同（表格分页、看板一次拉 100 条），不清会短暂跨口径
    setRows([])
    setTotal(0)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {
      // 存不上只是下次不记住偏好，不该影响本次切换
    }
  }

  /**
   * 分配页的返回地址：带上当前路径 + 视角，而不是只带 scope。
   * <p>需求池与需求清单共用本组件，从哪个入口进就该回哪个入口，
   * 否则分配完会落在另一个菜单上，侧边栏高亮也跟着跳。HashRouter 下必须用
   * react-router 的 location.pathname（window.location.pathname 永远是 /）。
   */
  const assignBack = encodeURIComponent(`${location.pathname}?scope=${activeScope}`)

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
   * 自助提交 / 修改后重提：先二次确认再调接口。
   * <p>提交会真正发起准入审批（服务端同事务创建本轮准入单），所以必须可确认，不能点了就走。
   */
  const handleSelfSubmit = (row: RdmRequirementRow) => {
    const resubmit = row.status === RDM_STATUS.INTAKE_REJECTED
    Modal.confirm({
      title: resubmit ? '確認重新提交該需求？' : '確認提交該需求？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求編號：</span><b>{row.reqNo}</b></div>
          <div className="confirm-info-row"><span>標題：</span><b>{row.title}</b></div>
          <div className="confirm-info-row">
            <span>提交後：</span>
            <b>{resubmit ? '发起新的一轮准入审批（旧单已终态，不会沿用）' : '进入准入审批，由上级或指定人审批后送達技术部'}</b>
          </div>
        </div>
      ),
      okText: '確認提交',
      cancelText: '取消',
      onOk: async () => {
        try {
          await submitRequirement(row.id)
          message.success(resubmit ? '已重新提交，等待审批' : '已提交，等待审批')
          void load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '提交失敗，請重試')
          throw err
        }
      },
    })
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

  /**
   * 导出当前视角已加载的需求（前端生成，与页面同一份数据）。
   * <p>表格只载入了当前页、看板只载入了前 N 条，而用户点「导出」时心里想的
   * 通常是“这个视角的全部”，所以跳不过时必须明确告知少了多少，不能只报成功。
   */
  const handleExport = async () => {
    if (rows.length === 0) {
      message.warning('當前列表沒有數據，請先調整篩選條件')
      return
    }
    try {
      await exportRequirementRows(rows, RDM_SCOPE_LABEL[activeScope] ?? activeScope)
      if (rows.length < total) {
        message.warning(
          `已導出 ${rows.length} 條（共 ${total} 條），僅含當前${view === 'kanban' ? '看板載入' : '頁'}的資料。`
          + '需導出全部請先縮小篩選條件，或放大每頁條數。',
        )
      } else {
        message.success(`已導出 ${rows.length} 條需求`)
      }
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
      title: '操作', key: 'action', width: 196, fixed: 'right',
      /**
       * 动作由「这一行的状态 + 我的权限」决定，不再由「当前从哪个 Tab 看」决定。
       * <p>同一个需求在需求池、待我处理、全部需求里是同一行，可做的事不该因为入口而变；
       * 之前正是这条按视角分支的逻辑，让无分配权的角色在需求池里也看到分配按钮。
       */
      render: (_, r) => {
        const status = r.status as RdmStatus
        const assignable = canDispatch && status === RDM_STATUS.POOL
        const actions: React.ReactNode[] = []
        // 无人认领的池内需求才提供认领，已分配的单走「改派」
        if (canClaim && status === RDM_STATUS.POOL && !r.pmName) {
          actions.push(
            <Button key="claim" type="link" size="small" onClick={() => handleClaim(r)}>認領</Button>,
          )
        }
        if (assignable) {
          actions.push(
            <Button key="assign" type="link" size="small"
              onClick={() => navigate(`/rdm-assign?ids=${r.id}&back=${assignBack}`)}
            >
              分配
            </Button>,
          )
        }
        // 终态不再提供催办；可分配的行用分配动作代替催办入口
        if (!assignable && !RDM_TERMINAL_STATUS.includes(status)) {
          actions.push(<Button key="urge" type="link" size="small" onClick={() => handleUrge(r.id)}>催辦</Button>)
        }
        if (WITHDRAWABLE.includes(r.status)) {
          actions.push(
            <Button key="withdraw" type="link" size="small" danger onClick={() => handleWithdraw(r)}>撤回</Button>,
          )
        }
        // 自助提交只对提出人本人开（服务端同样会拒），否则列表上会出现点了必报错的按钮
        if (SELF_SUBMITTABLE.includes(r.status) && !!user?.empId && r.submitterEmpNo === user.empId) {
          actions.push(
            <Button key="submit" type="link" size="small" onClick={() => handleSelfSubmit(r)}>
              {r.status === RDM_STATUS.INTAKE_REJECTED ? '重提' : '提交'}
            </Button>,
          )
        }
        if (RDM_ACCEPTANCE_OPEN_STATUS.includes(status)) {
          actions.push(
            <Button key="accept" type="link" size="small" style={{ color: '#52C41A' }}
              onClick={() => navigate(`/rdm-acceptance-form?id=${r.id}`)}
            >
              {/* 与详情页同一文案：已上线后的验收是正式业务验收，不是上线前预验 */}
              {status === RDM_STATUS.RELEASED || status === RDM_STATUS.VERIFIED ? '業務驗收（已上線）' : '驗收'}
            </Button>,
          )
        }
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>詳情</Button>
            {actions}
          </Space>
        )
      },
    },
  ]

  /** 批量勾选只对“有分配权 + 停在需求池视角 + 表格视图”有意义：看板卡片无法勾选，
   *  列设置在看板下也没有列可设 —— 两者在不满足时直接隐藏，而不是留一个永远点不动的按钮 */
  const canBatchAssign = canDispatch && isPoolView && view === 'table'
  const rowSelection = canBatchAssign
    ? { selectedRowKeys: selectedKeys, onChange: (keys: React.Key[]) => setSelectedKeys(keys as number[]) }
    : undefined

  /** 看板信号卡数据：服务端口径，缺失时显示 0 而不是回退到本页行数 */
  const kanbanStats = {
    total: stats.total ?? 0,
    overdue: stats.overdue ?? 0,
    toAccept: stats.toAccept ?? 0,
    pool: stats.pool ?? 0,
  }

  return (
    <div className="content-area">
      {/* ── 视图形态切换：表格精查 ⇄ 看板扫视 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <Segmented
          value={view}
          onChange={v => switchView(v as ViewMode)}
          options={[
            { label: '表格視圖', value: 'table' },
            { label: '看板視圖', value: 'kanban' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      {/* ── 视角入口：由调用方（哪个职责页）决定展示哪几个视角；
          不展示 Tab 时必须用视角名作标题，否则页面就是一张不知所以的表 ── */}
      {scopeTabs.length > 0 ? (
        <Tabs
          activeKey={activeScope}
          onChange={switchScope}
          items={scopeTabs.map(key => ({
            key,
            label: `${RDM_SCOPE_LABEL[key]}${counts[key] != null ? ` (${counts[key]})` : ''}`,
          }))}
        />
      ) : (
        <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 600, color: '#262626' }}>
          {RDM_SCOPE_LABEL[activeScope]}
        </div>
      )}

      {/* 看板是扫视场景，需要信号卡给出分母与堵点；表格视角靠 Tab 计数 + 筛选，不再多占一行 */}
      {view === 'kanban' && (
        <div style={{ marginBottom: 16 }}>
          <StatCards
            items={[
              { key: 'total', icon: <FileAddOutlined />, value: kanbanStats.total, label: '範圍內需求', color: 'info' },
              { key: 'pool', icon: <UserAddOutlined />, value: kanbanStats.pool, label: '待分配', color: 'brand' },
              { key: 'overdue', icon: <AlertOutlined />, value: kanbanStats.overdue, label: '逾期需求', color: 'system' },
              { key: 'accept', icon: <CheckCircleOutlined />, value: kanbanStats.toAccept, label: '待驗收', color: 'success' },
            ]}
          />
        </div>
      )}

      {/* ── 搜索区 ── */}
      <SearchBar
        advanced={advancedFilters}
        onSearch={v => { setFilters(v); setPage(1) }}
        onReset={() => { setFilters({}); setPage(1) }}
      />

      {/* ── 操作区：新增类主操作在右（components.css 规定 right 只放「新增」与「列配置」），
          批量分配/导出等数据操作在左 ── */}
      <div className="action-section">
        <div className="action-section-left">
          {canBatchAssign && (
            <Button
              icon={<UserSwitchOutlined />}
              disabled={selectedKeys.length === 0}
              onClick={() => navigate(`/rdm-assign?ids=${selectedKeys.join(',')}&back=${assignBack}`)}
            >
              批量分配{selectedKeys.length ? `（${selectedKeys.length}）` : ''}
            </Button>
          )}
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-submit')}>
            我要提需求
          </Button>
          {/* 列配置只作用于表格；看板视图下没有可配置的列 */}
          {view === 'table' ? configComponent : null}
        </div>
      </div>

      {canBatchAssign && rows.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="需求池視角：勾選後可批量分配產品經理；分配即通知對方，超 24 小時未受理將自動升級提醒技術負責人。"
        />
      )}

      {/* 分配产品经理统一走独立页 /rdm-assign（§9.1 禁弹窗承载表单） */}
      {view === 'table' ? (
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
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <RequirementKanban
          rows={rows}
          onOpen={id => navigate(`/rdm-detail?id=${id}`)}
          limitHint={kanbanTruncated
            ? `已顯示前 ${RDM_KANBAN_SIZE} 條（共 ${total} 條），請縮小篩選範圍或切回表格視圖翻頁。`
            : undefined}
        />
      )}
    </div>
  )
}

/**
 * 需求检索区。
 * <p>必须用 antd `Form layout="inline"` 包裹：全局样式是把
 * `.search-section .ant-form-inline` 设成 4 列 grid 的，之前用 `Space` 拼装
 * 根本命不中该规则（变成一行左对齐胶囊串），且控件写死了宽度。</p>
 * <p>故意不把表单 initialValues 绑到父组件的 filters 上：antd 的 resetFields() 是
 * “回到 initialValues”，绑上去会让【重置】变成“恢复到上次查询条件”，
 * 搜索框里的关键字清不掉、但表格已变成未过滤的 4 条（界面与数据不一致）。
 * 表单值只在查询时单向同步给父组件，切视角不重建本组件所以条件自然保留。
 * <p>advanced=true 多给三个跨部门检索条件（提出部门/产品经理/仅看逾期），
 * 下拉数据只在需要时才拉，避免清单页与需求池白白多两个请求。
 */
function SearchBar({ onSearch, onReset, advanced = false }: {
  onSearch: (v: RequirementFilters) => void
  onReset: () => void
  advanced?: boolean
}) {
  const [form] = Form.useForm<RequirementFilters>()
  const [deptOptions, setDeptOptions] = useState<{ value: number; label: string }[]>([])
  const [pmOptions, setPmOptions] = useState<{ value: number; label: string }[]>([])

  useEffect(() => {
    if (!advanced) return
    fetchDepartments()
      .then(list => setDeptOptions(list.map(d => ({ value: d.id, label: d.name }))))
      .catch(() => setDeptOptions([]))
    fetchProductOptions()
      .then(list => setPmOptions(list.map(p => ({ value: p.userId, label: p.name }))))
      .catch(() => setPmOptions([]))
  }, [advanced])

  const statusOptions = (Object.keys(RDM_STATUS_LABEL) as RdmStatus[]).map(k => ({
    value: k,
    label: RDM_STATUS_LABEL[k],
  }))

  const submit = () => onSearch(form.getFieldsValue())

  return (
    <div className="search-section">
      <Form form={form} layout="inline" onFinish={submit}>
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
        {advanced && (
          <Form.Item label="提出部門" name="deptId">
            <Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={deptOptions} />
          </Form.Item>
        )}
        {advanced && (
          <Form.Item label="產品經理" name="pmUserId">
            <Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={pmOptions} />
          </Form.Item>
        )}
        {advanced && (
          <Form.Item name="overdueOnly" valuePropName="checked">
            <Checkbox>僅看逾期</Checkbox>
          </Form.Item>
        )}
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
