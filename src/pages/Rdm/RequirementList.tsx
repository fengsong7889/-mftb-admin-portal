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
 * <p>B2 锚点收敛过渡期：新锚点 rdm-requirement:view_all / :dispatch 与旧锚点**并行生效**
 * （口径与后端 RdmAccessGuard 一致），等存量授权平移完成、rdm-intake 退役后才是唯一依据。
 * 前端判定只决定按钮显隐，不是安全边界。
 *
 * 写操作按钮改为「行状态 + 授权」驱动（之前按视角驱动，导致无权角色在需求池
 * 也能看到分配按钮，点了才被后端拒）。
 */
/**
 * 需求列表——拆分为两个职责页后仍共用一份底层实现。
 *
 * 历史背景：同一个列表以前同时服务「需求清单 / 提交需求 / 需求管理」三个菜单，
 * 只靠 defaultScope 换预选项。列、看板、偏好键完全重叠，用户看不出三页职责差异；
 * 需求池的「全部需求」把未准入需求也一并返出来，与「审批全部通过才进需求管理」的
 * 业务口径对不上。
 *
 * 拆分后两个职责页（pageRole）：
 * - intake：提交侧，只看自己提的 + 待自己审的，展示「審批流程編號 (XQSP)」、
 *   「需求編號（未准入时显示尚未生成）」与「審批狀態」；提/重提/撤回/编辑草稿留在本侧。
 * - management：治理侧，只展示已准入需求（未准入行前端隐藏且顶横幅告知数量）；
 *   分配/认领/开始分析留在本侧；不提供提/审批，避免与提交侧交叉。
 *
 * 需求清单旧入口（pageRole=legacy）保留至阶段二菜单迁移完成，行为与拆前一致。
 *
 * 【UI 分界不是安全边界】：服务端仍然自己校提出人/当前审批人/资源相关人，
 * 前端隐藏行与隐藏按钮只为了职责表达，不作为权限控制。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, Modal, Segmented, Select, Space, Spin, Table, Tag, Tooltip, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  FileAddOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchRequirementPage,
  fetchScopeCounts,
  fetchRequirementStats,
  fetchProductOptions,
  fetchProjectPage,
  claimRequirement,
  submitRequirement,
  urgeRequirement,
  withdrawRequirement,
  type RdmProjectListItem,
  type RdmRequirementRow,
} from '../../api/rdm'
import { fetchDepartments } from '../../api/department'
import { fetchEmployeeIdOptions } from '../../api/employee'
import { buildDeptTree, type DeptNode } from '../Attendance/deptTree'
import { exportRequirementRows } from './requirementExport'
import RequirementKanban from './components/RequirementKanban'
import {
  RDM_FLOW_VERSION_LABEL,
  RDM_KANBAN_SIZE,
  RDM_PRE_ADMISSION_STATUS,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_REQUIREMENT_KIND_LABEL,
  RDM_SCOPE,
  RDM_SCOPE_LABEL,
  RDM_STATUS,
  RDM_ACCEPTANCE_OPEN_STATUS,
  RDM_STATUS_LABEL,
  RDM_TERMINAL_STATUS,
  formatRdmReqNo,
  type RdmScope,
  type RdmStatus,
} from '../../constants/rdm'
import { ComplexityTag, PriorityTag, StatusTag, TypeTag } from './components/Tags'
import { EXECUTION_SCOPES, PERSONAL_SCOPES, resolveActiveScope } from './requirementScopes'
import './index.css'

/**
 * 拆分阶段一的页面角色。
 * - legacy：需求清单旧行为，未拆分前兼容使用（阶段二菜单迁移后删除）。
 * - intake：提交需求侧（我的提交 + 待我审批）。
 * - management：需求管理侧（已准入需求的统筹与分配）。
 */
export type RequirementListRole = 'legacy' | 'intake' | 'management'

/**
 * 准入前状态：这些行属提交侧，不会进入治理侧列表。
 * 口径与后端 RdmRequirementQuery 的 SCOPE_ALL 收口共用 constants/rdm 的同一名列表；
 * 服务端已不再把准入前需求返到治理侧，本侧过滤保留为双保险（正常应为 no-op）。
 */
const PRE_ADMISSION_STATUSES: RdmStatus[] = RDM_PRE_ADMISSION_STATUS

/** 拆分阶段列配置页的偏好存储键（与旧清单页隔离，避免一页改列另一页也跟着变） */
const COLUMN_PAGE_KEY: Record<RequirementListRole, string> = {
  legacy: 'rdm-requirement-v3',
  intake: 'rdm-requirement-intake-v1',
  management: 'rdm-requirement-management-v1',
}

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
  /** 提出人用户 ID */
  submitterUserId?: number
  /** V3：所属项目 */
  projectId?: number
  /** V3：需求种类 */
  requirementKind?: string
  /** V3：流程版本 */
  flowVersion?: number
}

/** 视图形态偏好存储键（PM 习惯看板、业务/技术习惯表格，不应每次回来重选） */
const VIEW_STORAGE_KEY = 'rdm-requirement:view'

/** 视图栏收起偏好存储键（同一组件服务三个职责页，偏好共用一份） */
const RAIL_STORAGE_KEY = 'rdm-requirement:rail'

type ViewMode = 'table' | 'kanban'

interface RequirementListProps {
  /**
   * 页面角色（阶段一拆分）：
   * - legacy：旧行为，需求清单菜单拆前使用。
   * - intake：提交侧（默认 mine + approving），展示审批流程编号与需求编号列；
   *   提供提/重提/撤回/编辑草稿，不提供分配与认领。
   * - management：治理侧（默认 pool + product + todo + all），仅展示已准入需求（未准入行
   *   前端隐藏 + 顶横幅告知），提供分配/认领/开始分析；不提供提/审批。
   */
  pageRole?: RequirementListRole
  /**
   * 进入时的默认视角（供菜单入口预选）。
   * <p>URL 上有 `?scope=` 时以 URL 为准。
   */
  defaultScope?: RdmScope
  /**
   * 顶部展示的视角 Tab（不传则用默认集）。
   * <p>同一个列表组件服务多种职责页：不同页展示不同的 Tab 集。
   * 传空数组表示不展示 Tab（单一切片页），此时页面会用当前视角名作标题。
   */
  scopeTabs?: readonly RdmScope[]
  /**
   * 是否展示全量检索条件（提出部门 / 产品经理 / 仅看逾期）。
   * <p>治理侧需要：它要在全公司范围内找待分配的单子并按部门收敛。
   */
  advancedFilters?: boolean
  /**
   * 极简模式：隐藏视图栏、视图切换（表格/看板）、导出、统计卡。
   * <p>用于「认领/分配」页面——它只管待分配需求的中转，不需要多视图和导出。
   */
  minimal?: boolean
}

/** 读偏好：隐私模式下 localStorage 会抛，不能因为读偏好失败让整个页面打不开 */
function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'table'
  } catch {
    return 'table'
  }
}

/** 视图栏默认收起状态：未存过偏好时按视口宽度决定（窄屏先把宽度留给表格） */
function readStoredRail(): boolean {
  try {
    const saved = localStorage.getItem(RAIL_STORAGE_KEY)
    if (saved != null) return saved === '1'
  } catch {
    // 读不到偏好就走默认值，不影响页面可用
  }
  return typeof window !== 'undefined' && window.innerWidth < 1440
}

export default function RequirementList({
  pageRole = 'legacy',
  defaultScope,
  scopeTabs = EXECUTION_SCOPES,
  advancedFilters = false,
  minimal = false,
}: RequirementListProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission, user } = useAuth()
  // 只让本批次新增的文案走 i18n；RDM 其余硬编码繁中文案由整模块统一切换那一批一次性接，
  // 单点翻中一半反而会让页面出现两种语言来源，更难定位到底哪一份是真值
  const { t } = useTranslation()

  /** 拆分阶段一的侧划分。legacy 保持拆前行为，不过滤行也不拆列集。 */
  const isIntakeSide = pageRole === 'intake'
  const isManagementSide = pageRole === 'management'

  // 视角单一数据源是 URL；菜单入口只给默认值，且必须落在本页实际提供的 Tab 上。
  // 非法值或本页没有的视角（旧书签、菜单拆分前的链接）一律退回默认视角，
  // 不能让页面停在查不到数据、或视图栏里根本选不中的条件上
  const activeScope: RdmScope = resolveActiveScope(searchParams.get('scope'), scopeTabs, defaultScope)
  const isPoolView = activeScope === RDM_SCOPE.POOL

  const [view, setView] = useState<ViewMode>(readStoredView)
  /** 视图栏收起偏好：宽屏看列表时想多留宽度给表格，窄屏默认收起 */
  const [railCollapsed, setRailCollapsed] = useState<boolean>(readStoredRail)
  const [rows, setRows] = useState<RdmRequirementRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [counts, setCounts] = useState<Record<string, number>>({})
  /** 看板信号卡（服务端统计结果） */
  const [stats, setStats] = useState<Record<string, number>>({})
  /** 统计卡是否已取到数：未取到时显示占位符，不能把「还在加载/取数失败」渲染成 0 */
  const [statsReady, setStatsReady] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [filters, setFilters] = useState<RequirementFilters>({})

  /**
   * 分配权认 `rdm-intake:edit`（现行锚点，后端 MENU_DISPATCHER）与 `rdm-requirement:dispatch`（收敛后的新锚点）。
   * <p>两个锚点 OR 是有意为之，且必须与后端 RdmAccessGuard.canDispatch 一字不差：
   * 新锚点的动作已在 v3.14 登记到 rdm-requirement 可授集里，但存量授权还没平移，
   * 只认新锚点会让今天持有 intake:edit 的人看不到分配按钮（界面降权）。
   * <p>故意不再 OR 上 `rdm-requirement:edit`：菜单收敛后需求清单也带了 edit，
   * 但那是受理/PRD/评审的需求侧处理权，不是分配权；一并认就会把刚刚
   * 修掉的“无分配权也看到分配按钮”重新引进来。
   */
  const canDispatch = hasPermission('rdm-intake:edit') || hasPermission('rdm-requirement:dispatch')

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
          <div className="confirm-info-row"><span>需求編號：</span><b>{formatRdmReqNo(row.reqNo)}</b></div>
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
    setStatsReady(false)
    fetchRequirementStats({ scope: activeScope, ...filters })
      .then(s => { if (alive) { setStats(s); setStatsReady(true) } })
      .catch(() => { if (alive) { setStats({}); setStatsReady(false) } })
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

  /** 视图栏分组：只渲染调用方授权展示的切片，可见范围仍由服务端按 scope 收敛 */
  const railGroups = useMemo(() => {
    const personal = scopeTabs.filter(key => PERSONAL_SCOPES.includes(key))
    const governance = scopeTabs.filter(key => !PERSONAL_SCOPES.includes(key))
    return [
      { key: 'personal', label: '我的需求', items: personal },
      { key: 'governance', label: '治理視圖', items: governance },
    ]
  }, [scopeTabs])

  const toggleRail = () => {
    setRailCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // 存不上只是下次不记住偏好，不该影响本次展开/收起
      }
      return next
    })
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
          <div className="confirm-info-row"><span>需求編號：</span><b>{formatRdmReqNo(row.reqNo)}</b></div>
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
          <div className="confirm-info-row"><span>需求編號：</span><b>{formatRdmReqNo(row.reqNo)}</b></div>
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
    { key: 'title', title: '需求標題' },
    { key: 'status', title: '當前狀態' },
    { key: 'priority', title: '優先級' },
    { key: 'currentHandler', title: '當前處理人' },
    { key: 'submitter', title: '提出人' },
    { key: 'submitDeptName', title: '提出部門' },
    { key: 'planReleaseDate', title: '計劃上線' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'intakeFlowNo', title: '審批流程編號' },
    { key: 'admission', title: isIntakeSide ? '審批狀態' : '准入口徑' },
    { key: 'reqType', title: '需求類型' },
    { key: 'complexity', title: '規模' },
    { key: 'pmName', title: '產品經理' },
    { key: 'submitTime', title: '提交時間' },
    { key: 'expectDate', title: '期望完成' },
    { key: 'stay', title: '當前停留' },
    { key: 'projectName', title: '所屬項目' },
    { key: 'deliveryProgress', title: '交付進度' },
    { key: 'action', title: '操作' },
  ]), [isIntakeSide])

  /**
   * 默认展示列随页面角色变化：
   * - intake：審批流程編號 + 需求編號 + 審批狀態 均默认开（服务端已延迟发号：
   *   准入前需求編號列展「尚未生成」，流程號列展「未发起/免審批」，两列永不互填）。
   * - management：需求編號 + 准入口徑 默认开，審批流程編號默认关（可手动开启）。
   * - legacy：保持拆前默认。
   */
  const defaultColumnVisibility = useMemo(() => {
    if (isIntakeSide) {
      return [
        { key: 'title', visible: true, locked: 'head' as const },
        { key: 'intakeFlowNo', visible: true },
        { key: 'reqNo', visible: true },
        { key: 'admission', visible: true },
        { key: 'status', visible: true },
        { key: 'priority', visible: true },
        { key: 'submitter', visible: true },
        { key: 'submitDeptName', visible: true },
        { key: 'submitTime', visible: true },
        { key: 'currentHandler', visible: false },
        { key: 'planReleaseDate', visible: false },
        { key: 'reqType', visible: false },
        { key: 'complexity', visible: false },
        { key: 'pmName', visible: false },
        { key: 'expectDate', visible: false },
        { key: 'stay', visible: false },
        { key: 'projectName', visible: false },
        { key: 'deliveryProgress', visible: false },
        { key: 'action', visible: true, locked: 'tail' as const },
      ]
    }
    if (isManagementSide) {
      return [
        { key: 'title', visible: true, locked: 'head' as const },
        { key: 'reqNo', visible: true },
        { key: 'admission', visible: true },
        { key: 'status', visible: true },
        { key: 'priority', visible: true },
        { key: 'currentHandler', visible: true },
        { key: 'pmName', visible: true },
        { key: 'submitter', visible: true },
        { key: 'submitDeptName', visible: false },
        { key: 'planReleaseDate', visible: true },
        { key: 'intakeFlowNo', visible: false },
        { key: 'reqType', visible: false },
        { key: 'complexity', visible: false },
        { key: 'submitTime', visible: false },
        { key: 'expectDate', visible: false },
        { key: 'stay', visible: false },
        { key: 'projectName', visible: false },
        { key: 'deliveryProgress', visible: false },
        { key: 'action', visible: true, locked: 'tail' as const },
      ]
    }
    // legacy：拆前默认
    return [
      { key: 'title', visible: true, locked: 'head' as const },
      { key: 'status', visible: true },
      { key: 'priority', visible: true },
      { key: 'currentHandler', visible: true },
      { key: 'submitter', visible: true },
      { key: 'submitDeptName', visible: true },
      { key: 'planReleaseDate', visible: true },
      { key: 'reqNo', visible: true },
      { key: 'intakeFlowNo', visible: false },
      { key: 'admission', visible: false },
      { key: 'reqType', visible: false },
      { key: 'complexity', visible: false },
      { key: 'pmName', visible: false },
      { key: 'submitTime', visible: false },
      { key: 'expectDate', visible: false },
      { key: 'stay', visible: false },
      { key: 'projectName', visible: false },
      { key: 'deliveryProgress', visible: false },
      { key: 'action', visible: true, locked: 'tail' as const },
    ]
  }, [isIntakeSide, isManagementSide])

  /**
   * 列配置偏好页按角色隔离：
   * - intake/management 各自一份，一页改列不会传染另一页。
   * - legacy 仍用 rdm-requirement-v3，保持拆前习惯。
   */
  const { configComponent, applyConfig } = useColumnConfig(
    COLUMN_PAGE_KEY[pageRole],
    columnMeta,
    defaultColumnVisibility,
  )

  const columns: TableColumnsType<RdmRequirementRow> = [
    {
      title: '序號', key: 'index', width: 56, align: 'center', fixed: 'left',
      render: (_, __, i) => (page - 1) * size + i + 1,
    },
    {
      title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 148,
      // 延迟发号：准入前没有正式编号，必须给可见文案而不是留白（留白会被当成加载失败）
      render: (v?: string | null) => (
        <span style={v
          ? { fontFamily: 'ui-monospace, Menlo, monospace' }
          : { color: '#8C8C8C' }}>
          {formatRdmReqNo(v)}
        </span>
      ),
    },
    {
      title: '審批流程編號', dataIndex: 'intakeFlowNo', key: 'intakeFlowNo', width: 158,
      render: (v?: string | null, r?: RdmRequirementRow) => {
        if (!v) {
          // 未发起审批时的展示按侧侧划分，避免向用户保证不会存在的 OA 单号
          const notSubmitted = r && (r.status === RDM_STATUS.DRAFT || r.status === RDM_STATUS.INTAKE_REJECTED)
          if (isIntakeSide && notSubmitted) {
            return <span style={{ color: '#8C8C8C' }}>未发起</span>
          }
          if (r && r.status === RDM_STATUS.POOL && r.needApproval === 0) {
            // 免审批需求不会发起 OA 准入单，直接进池
            return <Tag color="green" style={{ margin: 0 }}>免審批</Tag>
          }
          return <span style={{ color: '#BFBFBF' }}>—</span>
        }
        return <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#E8720C' }}>{v}</span>
      },
    },
    {
      title: isIntakeSide ? '審批狀態' : '准入口徑', key: 'admission', width: 120,
      render: (_, r) => {
        const status = r.status as RdmStatus
        // 审批中/驳回/草稿 = 未准入；免审或已进入后续环节 = 已准入
        if (status === RDM_STATUS.DRAFT) {
          return <Tag style={{ margin: 0 }}>草稿</Tag>
        }
        if (status === RDM_STATUS.INTAKE_PENDING) {
          return <Tag color="processing" style={{ margin: 0 }}>審批中</Tag>
        }
        if (status === RDM_STATUS.INTAKE_REJECTED) {
          return <Tag color="error" style={{ margin: 0 }}>審批駁回</Tag>
        }
        if (r.needApproval === 0) {
          return <Tag color="green" style={{ margin: 0 }}>免審批</Tag>
        }
        return <Tag color="success" style={{ margin: 0 }}>已通過准入</Tag>
      },
    },
    {
      title: '需求標題', dataIndex: 'title', key: 'title', width: 300, fixed: 'left', ellipsis: true,
      render: (v: string, r) => (
        <div className="rdm-table-title">
          <a className="rdm-table-title__link" title={v} href={`#/rdm-detail?id=${r.id}&tab=activity`}>{v}</a>
          {r.blockedFlag && <Tag color="purple" style={{ margin: 0 }}>阻塞</Tag>}
        </div>
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
    { title: '提出人', dataIndex: 'submitterName', key: 'submitter', width: 110, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: '提出部門', dataIndex: 'submitDeptName', key: 'submitDeptName', width: 200, ellipsis: true, render: (v?: string | null) => v || '-' },
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
      title: '所屬項目', dataIndex: 'projectName', key: 'projectName', width: 150, ellipsis: true,
      render: (v?: string | null, r?: RdmRequirementRow) => {
        if (!v) return '-'
        return r?.projectId
          ? <a className="rdm-table-title__link" href={`#/rdm-project-detail?id=${r.projectId}`}>{v}</a>
          : <span>{v}</span>
      },
    },
    {
      title: '交付進度', key: 'deliveryProgress', width: 100,
      render: (_, r) => {
        if (r.flowVersion !== 3 || !r.deliveryItemCount) return '-'
        return (
          <span style={{ color: '#2F54EB', fontWeight: 500 }}>
            {r.deliveryDoneCount ?? 0}/{r.deliveryItemCount}
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
        // 阶段一拆分：治理侧才提供认领/分配；提交侧不提供
        const showGovernanceActions = !isIntakeSide
        const showSubmitterActions = !isManagementSide
        if (showGovernanceActions && canClaim && status === RDM_STATUS.POOL && !r.pmName) {
          actions.push(
            <Button key="claim" type="link" size="small" onClick={() => handleClaim(r)}>認領</Button>,
          )
        }
        if (showGovernanceActions && assignable) {
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
        if (showSubmitterActions && WITHDRAWABLE.includes(r.status)) {
          actions.push(
            <Button key="withdraw" type="link" size="small" danger onClick={() => handleWithdraw(r)}>撤回</Button>,
          )
        }
        // 自助提交只对提出人本人开（服务端同样会拒），否则列表上会出现点了必报错的按钮
        if (showSubmitterActions && SELF_SUBMITTABLE.includes(r.status) && !!user?.empId && r.submitterEmpNo === user.empId) {
          // 草稿先给「編輯」：没有它，存了草稿的人只能整张表单重填，保存草稿等于丢弃
          if (r.status === RDM_STATUS.DRAFT) {
            actions.push(
              <Button key="edit" type="link" size="small" onClick={() => navigate(`/rdm-submit?id=${r.id}`)}>編輯</Button>,
            )
          }
          actions.push(
            <Button key="submit" type="link" size="small" onClick={() => handleSelfSubmit(r)}>
              {r.status === RDM_STATUS.INTAKE_REJECTED ? '重提' : '提交'}
            </Button>,
          )
        }
        if (showGovernanceActions && RDM_ACCEPTANCE_OPEN_STATUS.includes(status)) {
          actions.push(
            <Button key="accept" type="link" size="small"
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

  const visibleColumns = applyConfig(columns) as TableColumnsType<RdmRequirementRow>
  const tableWidth = visibleColumns.reduce((sum, col) => sum + Number(col.width ?? 120), 0)

  /**
   * 治理侧仅展示已准入需求：未准入行隐藏并顶横幅告知。
   *
   * 拆分批次 1 后服务端 `RdmRequirementQuery` 已按准入口径收口（scope=all 排除
   * draft/intake_pending/intake_rejected），本侧过滤正常是 no-op；保留是为了防
   * 旧实例未升级时把未准入行透出来——前端隐藏不是安全边界，服务端仍会自己校资源相关人。
   */
  const visibleRows = useMemo(() => {
    if (!isManagementSide) return rows
    return rows.filter(r => !PRE_ADMISSION_STATUSES.includes(r.status as RdmStatus))
  }, [rows, isManagementSide])
  const hiddenPreAdmissionCount = isManagementSide ? rows.length - visibleRows.length : 0

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

  /**
   * 统计卡取值：未取到数时给占位符而不是 0。
   * <p>「逾期 0 / 待驗收 0」在取数中或取数失败时是假事实，会让人以为没有风险要处理。
   */
  const statValue = (v: number) => (statsReady ? v : '—')

  return (
    <div className="content-area rdm-workspace">
      <div className="rdm-workspace-body">
        {/* ── 视图栏：极简模式不需要多视图切换 ── */}
        {!minimal && scopeTabs.length > 0 && !railCollapsed && (
          <aside className="rdm-view-rail">
            <div className="rdm-view-rail-head">
              視圖
              <Tooltip title="收起視圖欄">
                <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={toggleRail} />
              </Tooltip>
            </div>
            {railGroups.map(group => group.items.length > 0 && (
              <div key={group.key} className="rdm-view-rail-group">
                <div className="rdm-view-rail-group-title">{group.label}</div>
                {group.items.map(key => (
                  <div
                    key={key}
                    className={`rdm-view-rail-item ${activeScope === key ? 'active' : ''}`}
                    onClick={() => switchScope(key)}
                  >
                    <span className="rdm-view-rail-item-label">{RDM_SCOPE_LABEL[key]}</span>
                    {counts[key] != null && <span className="rdm-view-rail-item-count">{counts[key]}</span>}
                  </div>
                ))}
              </div>
            ))}
            <div className="rdm-view-rail-foot">
              視圖只切換資料切片，不改變你的可見範圍與可執行動作
            </div>
          </aside>
        )}

        <div className="rdm-workspace-main">
          {/* ── 工具条：极简模式整条隐藏（无需视图切换/刷新） ── */}
          {!minimal && (
          <div className="rdm-workspace-toolbar">
            {!minimal && scopeTabs.length > 0 && railCollapsed && (
              <Tooltip title="展開視圖欄">
                <Button icon={<MenuUnfoldOutlined />} onClick={toggleRail}>視圖</Button>
              </Tooltip>
            )}
            {!minimal && (
              <Segmented
                value={view}
                onChange={v => switchView(v as ViewMode)}
                options={[
                  { label: '表格視圖', value: 'table' },
                  { label: '看板視圖', value: 'kanban' },
                ]}
              />
            )}
            {scopeTabs.length === 0 && (
              <span className="rdm-workspace-title">{RDM_SCOPE_LABEL[activeScope]}</span>
            )}
            <div style={{ flex: 1 }} />
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          </div>
          )}

          {/* ── 搜索区 ── */}
          <SearchBar
            advanced={advancedFilters}
            minimal={minimal}
            onSearch={v => { setFilters(v); setPage(1) }}
            onReset={() => { setFilters({}); setPage(1) }}
          />

          {/* 统计卡：极简模式不需要（认领/分配页只看待分配，无需全局信号卡） */}
          {!minimal && view === 'kanban' && (
            <div style={{ marginBottom: 16 }}>
              <StatCards
                animationKey={`${activeScope}-${JSON.stringify(filters)}`}
                items={[
                  { key: 'total', icon: <FileAddOutlined />, value: statValue(kanbanStats.total), label: '範圍內需求', color: 'info' },
                  { key: 'pool', icon: <UserAddOutlined />, value: statValue(kanbanStats.pool), label: '待分配', color: 'brand' },
                  { key: 'overdue', icon: <AlertOutlined />, value: statValue(kanbanStats.overdue), label: '逾期需求', color: 'system' },
                  { key: 'accept', icon: <CheckCircleOutlined />, value: statValue(kanbanStats.toAccept), label: '待驗收', color: 'success' },
                ]}
              />
            </div>
          )}

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
              {!minimal && (
                <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
              )}
            </div>
            <div className="action-section-right">
              {advancedFilters && (
                <Checkbox
                  checked={filters.overdueOnly ?? false}
                  onChange={e => {
                    const next = e.target.checked
                    setFilters(prev => ({ ...prev, overdueOnly: next }))
                    setPage(1)
                  }}
                  style={{ marginRight: 8 }}
                >
                  僅看逾期
                </Checkbox>
              )}
              {/* 拆分阶段一：「提需求」只留在提交侧；治理侧不重复提供入口，避免两页交叉 */}
              {!isManagementSide && (
                <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-submit')}>
                  提需求
                </Button>
              )}
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

          {/* 治理侧兼容期兜底：服务端已按准入口径收口，这里还看到准入前行只可能是旧实例未升级 */}
          {isManagementSide && hiddenPreAdmissionCount > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`本視圖已過濾 ${hiddenPreAdmissionCount} 條「未准入」需求（草稿 / 審批中 / 審批駁回），请前往「提交需求」菜单查看与处理审批。`}
              description={t('rdm.mgmtPreAdmissionFiltered')}
            />
          )}

          {/* 分配产品经理统一走独立页 /rdm-assign（§9.1 禁弹窗承载表单） */}
          {view === 'table' ? (
            <Table<RdmRequirementRow>
              className="nowrap-table"
              rowKey="id"
              columns={visibleColumns}
              tableLayout="fixed"
              dataSource={visibleRows}
              loading={loading}
              rowSelection={rowSelection}
              scroll={{ x: tableWidth + (canBatchAssign ? 32 : 0) }}
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
              rows={visibleRows}
              onOpen={id => navigate(`/rdm-detail?id=${id}&tab=activity`)}
              limitHint={kanbanTruncated
                ? `已顯示前 ${RDM_KANBAN_SIZE} 條（共 ${total} 條），請縮小篩選範圍或切回表格視圖翻頁。`
                : undefined}
            />
          )}
        </div>
      </div>
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
 * <p>advanced=true 多给三个跨部门检索条件（提出部门/产品经理/仅看逾期）。
 * 低频条件收进「更多篩選」：收起时一并清掉这些字段，避免留下看不见的过滤条件
 * 让人以为列表坏了。
 */
function SearchBar({ onSearch, onReset, advanced = false, minimal = false }: {
  onSearch: (v: RequirementFilters) => void
  onReset: () => void
  advanced?: boolean
  minimal?: boolean
}) {
  const [form] = Form.useForm<RequirementFilters>()
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])
  const [pmOptions, setPmOptions] = useState<{ value: number; label: string }[]>([])
  const [projectOptions, setProjectOptions] = useState<{ value: number; label: string }[]>([])
  const [empOptions, setEmpOptions] = useState<{ value: number; label: string }[]>([])
  const [empSearching, setEmpSearching] = useState(false)
  const empTimer = useRef<ReturnType<typeof setTimeout>>()
  /** 极简模式：查询条件全部展开，不需要收起 */
  const [more, setMore] = useState(minimal)

  useEffect(() => {
    if (advanced) {
      fetchDepartments()
        .then(list => setDeptTree(buildDeptTree(list ?? [])))
        .catch(() => setDeptTree([]))
      fetchProductOptions()
        .then(list => setPmOptions(list.map(p => ({ value: p.userId, label: p.name }))))
        .catch(() => setPmOptions([]))
    }
    // V3 筛选（所属项目）在所有路由可用，不依赖 advanced
    fetchProjectPage({ pageNo: 1, pageSize: 200 })
      .then(res => setProjectOptions((res.records ?? []).map((p: RdmProjectListItem) => ({ value: p.id, label: p.name }))))
      .catch(() => setProjectOptions([]))
  }, [advanced])

  const statusOptions = (Object.keys(RDM_STATUS_LABEL) as RdmStatus[]).map(k => ({
    value: k,
    label: RDM_STATUS_LABEL[k],
  }))

  const submit = () => onSearch(form.getFieldsValue())

  /** 提出人下拉搜索（防抖 300ms） */
  const handleEmpSearch = useCallback((kw: string) => {
    clearTimeout(empTimer.current)
    if (!kw.trim()) { setEmpOptions([]); return }
    empTimer.current = setTimeout(() => {
      setEmpSearching(true)
      fetchEmployeeIdOptions(kw.trim())
        .then(list => setEmpOptions(list.map(o => ({ value: Number(o.value), label: o.label }))))
        .catch(() => setEmpOptions([]))
        .finally(() => setEmpSearching(false))
    }, 300)
  }, [])

  /** 低频字段：收起时清空并立即重查，保证「看不见的条件」不存在 */
  const MORE_FIELDS: (keyof RequirementFilters)[] = advanced
    ? ['reqType', 'deptId', 'pmUserId', 'submitterUserId', 'projectId', 'requirementKind', 'flowVersion']
    : ['reqType', 'projectId', 'requirementKind', 'flowVersion']

  const toggleMore = () => {
    if (more) {
      form.setFieldsValue(
        MORE_FIELDS.reduce<Partial<RequirementFilters>>((acc, key) => ({ ...acc, [key]: undefined }), {}),
      )
      onSearch(form.getFieldsValue())
    }
    setMore(v => !v)
  }

  return (
    <div className="search-section">
      <Form form={form} layout="inline" onFinish={submit}>
        <Form.Item label="需求名稱/編號" name="keyword">
          <Input allowClear placeholder="標題或編號" onPressEnter={submit} />
        </Form.Item>
        <Form.Item label="需求提出人" name="submitterUserId">
          <Select
            allowClear
            showSearch
            placeholder="姓名或工號"
            filterOption={false}
            notFoundContent={empSearching ? '搜索中...' : '請輸入關鍵字搜索'}
            onSearch={handleEmpSearch}
            options={empOptions}
          />
        </Form.Item>
        {!minimal && (
          <Form.Item label="需求狀態" name="status">
            <Select allowClear showSearch placeholder="全部" options={statusOptions} />
          </Form.Item>
        )}
        <Form.Item label="優先級" name="priority">
          <Select
            allowClear
            placeholder="全部"
            options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        {more && (
          <Form.Item label="需求類型" name="reqType">
            <Select
              allowClear
              placeholder="全部"
              options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        )}
        {advanced && more && (
          <Form.Item label="提出部門" name="deptId">
            <TreeSelect
              treeData={deptTree}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="全部"
            />
          </Form.Item>
        )}
        {advanced && more && (
          <Form.Item label="產品經理" name="pmUserId">
            <Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={pmOptions} />
          </Form.Item>
        )}
        {more && projectOptions.length > 0 && (
          <Form.Item label="所屬項目" name="projectId">
            <Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={projectOptions} />
          </Form.Item>
        )}
        {more && (
          <Form.Item label="需求種類" name="requirementKind">
            <Select
              allowClear
              placeholder="全部"
              options={Object.entries(RDM_REQUIREMENT_KIND_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        )}
        {more && (
          <Form.Item label="流程版本" name="flowVersion">
            <Select
              allowClear
              placeholder="全部"
              options={Object.entries(RDM_FLOW_VERSION_LABEL).map(([value, label]) => ({ value: Number(value), label }))}
            />
          </Form.Item>
        )}
        <Form.Item>
          <div className="search-actions">
            <Button type="primary" icon={<SearchOutlined />} onClick={submit}>查詢</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                form.resetFields()
                setMore(false)
                onReset()
              }}
            >
              重置
            </Button>
            {!minimal && <Button type="link" onClick={toggleMore}>{more ? '收起篩選' : '更多篩選'}</Button>}
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
