/**
 * 個人工作台 —— 全员进入產研交付的第一屏
 *
 * 设计口径（角色化改造后）：这一屏不是「把所有人都要处理的事平铺出来」，
 * 而是按「我是谁、我今天该看什么」编排。研发先看任务、测试先看批次、项目经理先看项目、
 * 业务方先看自己的提交。具体规则：
 * 1. 身份由菜单权限 + 后端角色标签 + 实际待办推导（见 workbenchLayout.deriveRdmIdentities）；
 * 2. 每个身份有一套推荐区块顺序，个人可显隐与排序（见 WorkbenchCustomize）；
 * 3. 区块候选集只包含本人有菜单权限的页面，配置动作不会扩权；
 * 4. 专业执行操作仍留在研发/测试/发布各自的工作台，本页只做概览与直达。
 *
 * 顶部横幅口径（本轮重设计）：横幅只回答「我在哪个身份上 + 现在该处理什么」——
 * 身份事实（日期/工号/部门/职位）、工作视图（解释首屏区块从哪来）、今日焦点（需要立即动手的少数几项）。
 * 不重复问候与姓名：首页工作台已经写过一句，侧边栏与页签也已经标出页名。
 * 原先放在横幅右侧的「研发/测试工作台」身份直达已撤销：那些页面在侧边栏菜单里就有，
 * 对应的内容块也能在「个性化配置」里开关，横幅再抄一遍等于把菜单钉死在第一屏。
 *
 * i18n：横幅文案已走 rdm.workbench.* 双语键；页面其余区块仍是存量硬编码，按棘轮分批清理。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Space, Spin, Tag, message } from 'antd'
import {
  AlertOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  HourglassOutlined,
  InboxOutlined,
  ProjectOutlined,
  ReloadOutlined,
  RightOutlined,
  RocketOutlined,
  SolutionOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import HelpPopover, { type HelpSection } from '../../components/HelpPopover'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchProjectPage,
  fetchRequirementPage,
  fetchTodoBoard,
  fetchWorkbench,
  fetchWorkbenchSummary,
  type RdmProjectListItem,
  type RdmRequirementRow,
  type RdmTodoBoard,
  type RdmWorkbenchData,
  type RdmWorkbenchSummary,
} from '../../api/rdm'
import {
  RDM_PROJECT_STATUS_COLOR,
  RDM_PROJECT_STATUS_LABEL,
  RDM_SCOPE,
  RDM_STAGE_LABEL,
  RDM_STAGE_ORDER,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  formatRdmReqNo,
  RDM_STATUS_STAGE,
  type RdmStatus,
} from '../../constants/rdm'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import {
  RDM_IDENTITY_LABEL,
  deriveRdmIdentities,
  useRdmWorkbenchLayout,
  type RdmSectionKey,
} from './workbenchLayout'
import { DEFAULT_IDENTITY_ICON, RDM_IDENTITY_ICON } from './workbenchSectionIcons'
import { MyDevTasksPanel, MyReleaseBatchesPanel, MyTestBatchesPanel, OpenIssuesPanel } from './WorkbenchPanels'
import WorkbenchCustomize from './WorkbenchCustomize'
import './index.css'

/**
 * 待办分组 → 落点路由（点击「查看全部」直达）
 * <p>pool 落需求池（分配与审批同属上游）；product 落需求清单的产品视角（清单只做执行）。
 * <p>intake 不能落清单的 todo：todo 查的是需求上的 PM/验收人/研发负责人字段，
 * 而审批人只存在于 OA 审批任务表，之前落 todo 会让审批人看到 3 条却点不进列表。
 */
const TODO_ROUTE: Record<string, string> = {
  pool: '/rdm-intake?scope=pool',
  product: '/rdm-requirement?scope=product',
  acceptance: '/rdm-acceptance',
}

/**
 * 审批待办的落点：有「提需求」菜单授权的人落该页；
 * <p>准入审批人常常是申请人的上级主管，不是产品总监 —— 他们未必持有分配侧授权，
 * 把所有人都固定落需求池会让他们点「查看全部」直接进不来。这类人走 OA 中心的待我审批，
 * 那边本来就是审批的单一事实源（准入审批已接 OA 回调）。
 * <p>v3.11 菜单拆分后必须改认 rdm-intake-approval：「待我審批」视角已从需求池整块移走。
 * <p>不再带 ?scope=approving：该页已改为单一合并视角（本人提交的 ∪ 待本人審批的），
 * 旧参数会被 resolveActiveScope 判为本页没有的视角并回落，带上只会让人误以为还能切回单切片。
 */
function intakeTodoRoute(canOpenApproval: boolean): string {
  return canOpenApproval ? '/rdm-intake-approval' : '/oa-requests'
}

/** 待办分组图标与主色 */
const TODO_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  intake: { icon: <AuditOutlined />, color: '#E8720C', bg: '#FFF7E6' },
  pool: { icon: <InboxOutlined />, color: '#FA8C16', bg: '#FFF7F0' },
  product: { icon: <SolutionOutlined />, color: '#722ED1', bg: '#F9F0FF' },
  acceptance: { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED' },
}

/**
 * 横幅上「工作视图」那一排身份标签的说明。
 * <p>为什么用 HelpPopover 而不是 Tooltip：这是「定义 + 依据 + 怎么改」的多句说明，
 * 悬停即隐的白底长文本读不完（见 AGENTS.md「问号/提示说明规范」）。
 * <p>做成工厂而不是模块常量：文案要走 i18n，模块顶层求值时拿不到 t。
 */
function identityHelpSections(t: TFunction): HelpSection[] {
  return [
    { tone: 'info', label: t('rdm.workbench.identityHelpFromTitle', { defaultValue: '身份怎麼來' }), body: t('rdm.workbench.identityHelpFromBody', { defaultValue: '由你持有的菜單權限與後端角色標籤推導，不是另設的一套權限。' }) },
    { tone: 'neutral', label: t('rdm.workbench.identityHelpScopeTitle', { defaultValue: '身份決定什麼' }), body: t('rdm.workbench.identityHelpScopeBody', { defaultValue: '只決定首屏區塊的推薦順序與默認顯隱；多身份者拿到的是幾個角色區塊的合集。' }) },
    { tone: 'warn', label: t('rdm.workbench.identityHelpAdjustTitle', { defaultValue: '想調整看這裡' }), body: t('rdm.workbench.identityHelpAdjustBody', { defaultValue: '右上「個性化配置」可開關、排序區塊；關掉的區塊不再渲染，也不會再打它的接口。' }) },
    { tone: 'success', label: t('rdm.workbench.identityHelpSafeTitle', { defaultValue: '不影響權限' }), body: t('rdm.workbench.identityHelpSafeBody', { defaultValue: '能進哪個頁面仍由後端鑒權與數據範圍決定，這裡不會擴權。' }) },
  ]
}

/** 今日焦点 chips 的语义配色，取值限定在 §A.1 已登记令牌 */
type FocusTone = 'brand' | 'purple' | 'danger' | 'warn'

interface FocusItem {
  key: string
  label: string
  value: number
  tone: FocusTone
  icon: React.ReactNode
  /** 点击落点的候选区块（按优先级取第一个已上屏的） */
  targets: RdmSectionKey[]
}

/**
 * 提出人自己还得再动一次手的状态。
 * <p>口径只从提出人视角列：草稿是没提交完，intake_rejected / rejected 是被打回要改，
 * on_hold 是产品暂缓但要提出人确认是否还做。技术侧的评审/开发等待不该出现在这里，
 * 否则业务方会以为球还在自己手上。
 */
const SUBMITTER_ACTION_STATUS: string[] = [
  RDM_STATUS.DRAFT,
  RDM_STATUS.INTAKE_REJECTED,
  RDM_STATUS.REJECTED,
  RDM_STATUS.ON_HOLD,
]

/** 上面每个状态该配一句「现在轮到你做什么」，只写状态名等于没提示 */
const SUBMITTER_ACTION_HINT: Record<string, string> = {
  [RDM_STATUS.DRAFT]: '仍是草稿，補充內容後提交才會開始流轉',
  [RDM_STATUS.INTAKE_REJECTED]: '準入審批被駁回，修改後可重新提交',
  [RDM_STATUS.REJECTED]: '產品駁回了需求，可查看理由後決定是否重開',
  [RDM_STATUS.ON_HOLD]: '需求被掛起暫緩，確認是否仍需推進',
}

/**
 * 六段进度（业务视角的折叠阶段）。
 * <p>为什么用状态反查阶段而不直接读接口 stage：草稿/驳回这类状态下 stage 可能为空，
 * 直接渲染会出现「一格都不亮」的进度条，业务方就以为需求没提交成功。
 */
function StageTrack({ status }: { status: string }) {
  const stage = RDM_STATUS_STAGE[status as RdmStatus]
  const currentIndex = stage ? RDM_STAGE_ORDER.indexOf(stage) : -1
  const finished = status === RDM_STATUS.CLOSED
  return (
    <div className="rdm-track-steps">
      {RDM_STAGE_ORDER.map((step, idx) => {
        const cls = finished || idx < currentIndex ? 'done' : idx === currentIndex ? 'current' : 'todo'
        return (
          <div key={step} className={`rdm-track-step ${cls}`} title={RDM_STAGE_LABEL[step]}>
            <span className="rdm-track-dot" />
            <span className="rdm-track-label">{RDM_STAGE_LABEL[step]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function RdmWorkbench() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, hasMenuPermission, hasPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RdmWorkbenchData | null>(null)
  /**
   * 我提的需求（含草稿与被驳回的），走列表接口 scope=mine（不带执行侧地板），与待办分区不同口径。
   * <p>工作台需要全状态来分「需要我補充」（草稿/被驳回）与「我的提交追蹤」，故取数不收窄；
   * 但各分区的「查看全部」深链改指「提需求」（/rdm-intake-approval，本人提交的合并视角），
   * 因为需求跟进清单已收窄为「已分配到产品」，草稿/待审批/待分配都不再在那里。
   */
  const [mineRows, setMineRows] = useState<RdmRequirementRow[]>([])
  /** V3：我參與的項目（PM 或成員） */
  const [myProjects, setMyProjects] = useState<RdmProjectListItem[]>([])
  /** Batch2：个人工作台聚合摘要（后端不可用时为 null，相关区块自动隐藏） */
  const [wbSummary, setWbSummary] = useState<RdmWorkbenchSummary | null>(null)
  /** V3：跨项目待办看板（id=0 哨兵）—— mine/waitingOthers/unassigned 三桶，total 已去重 */
  const [todoBoard, setTodoBoard] = useState<RdmTodoBoard | null>(null)

  const access = useMemo(
    () => ({ hasMenuPermission, hasPermission, isAdmin: user?.role === 'admin' }),
    [hasMenuPermission, hasPermission, user?.role],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 只读接口任一失败都不应把整页打成空白，所以各自单独兜底
      const [wb, mine, projects, summ, board] = await Promise.all([
        fetchWorkbench(),
        // 「待补充」走完整查询（size 拉满），不再从最近 6 条里筛，避免漏项
        fetchRequirementPage({ page: 1, size: 200, scope: RDM_SCOPE.MINE }).catch(() => null),
        fetchProjectPage({ pageNo: 1, pageSize: 8 }).catch(() => null),
        fetchWorkbenchSummary().catch(() => null),
        fetchTodoBoard(0).catch(() => null),
      ])
      setData(wb)
      setMineRows(mine?.records ?? [])
      setMyProjects(projects?.records ?? [])
      setWbSummary(summ)
      setTodoBoard(board)
    } catch {
      message.error('工作台數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * 身份与布局必须在 loading 分支 return 之前算完（Hook 不能条件调用）。
   * <p>数据未回来时只按菜单权限推导，roleNames 相关身份稍后补齐；
   * 这段计算是纯函数，多跑一次不影响请求次数。
   */
  const identities = deriveRdmIdentities({
    roleNames: data?.identity.roleNames,
    access,
    hasApprovalTodo: (data?.todos ?? []).some(group => group.key === 'intake' && group.total > 0),
  })
  const layout = useRdmWorkbenchLayout({ empId: user?.empId, identities, access })

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }
  if (!data) {
    return <div className="content-area"><Empty description="暫無數據" /></div>
  }

  const { identity, stats, todos } = data
  const recentActivity = data.recentActivity ?? []
  // 需要我补充：从我的提交里按提出人可动作的状态过滤，并把原因带上（无原因就不堵人）
  const needAction = mineRows.filter(r => SUBMITTER_ACTION_STATUS.includes(String(r.status)))
  const tracking = mineRows.filter(r => !SUBMITTER_ACTION_STATUS.includes(String(r.status)))

  /**
   * 横幅身份上下文：部门/工号以后端 workbench 接口为准，职位取登录态员工档案。
   * <p>头像、姓名、日期星期都不进横幅：首页工作台与顶部用户菜单已经写过，侧边栏与页签也已标出页名。
   * <p>系统角色标签（roleNames）同样不单独占一行：它和「工作視圖」是同一件事的两种口径，
   * 而工作视图是推导结果、直接对应首屏区块，两个口径并排只会让人对不上号。
   */
  const empNo = identity.empNo ?? user?.empId
  const deptName = identity.deptName ?? user?.department
  const position = user?.position
  // 只拼非空项，避免出现「· · 測試部」这种断头分隔符
  const contextBits = [deptName, empNo, position].filter((v): v is string => Boolean(v))

  /**
   * 今日焦点：只收「现在就该动手」的四项，与下方「需求指標/交付聚合指標」区块不同口径——
   * 那两个是六格全量计数且可被个人配置关掉，横幅这排保证任何时候都有下一步动作。
   */
  const focusItems: FocusItem[] = ([
    { key: 'todo', label: t('rdm.workbench.focusTodo', { defaultValue: '待我處理' }), value: stats.todoTotal, tone: 'brand', icon: <AuditOutlined />, targets: ['todo-board', 'role-todos'] },
    { key: 'waiting', label: t('rdm.workbench.focusWaiting', { defaultValue: '等待他人' }), value: todoBoard?.waitingOthersCount ?? 0, tone: 'purple', icon: <HourglassOutlined />, targets: ['todo-board'] },
    { key: 'supplement', label: t('rdm.workbench.focusSupplement', { defaultValue: '需要我補充' }), value: needAction.length, tone: 'danger', icon: <ExclamationCircleOutlined />, targets: ['need-action'] },
    { key: 'overdue', label: t('rdm.workbench.focusOverdue', { defaultValue: '逾期預警' }), value: stats.overdueTotal, tone: 'warn', icon: <AlertOutlined />, targets: ['role-todos', 'todo-board', 'my-tracking'] },
  ] as FocusItem[]).filter(item => item.value > 0)

  /** 落点必须真在屏上：区块被个人配置关掉时不给跳转，免得点了滚到空白 */
  const resolveFocusTarget = (targets: RdmSectionKey[]): RdmSectionKey | undefined =>
    targets.find(key => layout.visibleKeys.includes(key))

  const handleFocusJump = (key: RdmSectionKey) => {
    document.getElementById(`rdm-wb-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /**
   * 区块渲染表：key 与 workbenchLayout 的区块注册表一一对应。
   * <p>这里只是「创建元素」，未上屏的区块不会被挂载，其内部 useEffect 也不发请求，
   * 因此关掉某个角色面板就等于不打那次接口调用。
   */
  const sections: Record<RdmSectionKey, React.ReactNode> = {
    // ── 指标区 ──
    'metrics': (
      <div style={{ marginBottom: 16 }}>
        <StatCards
          items={[
            { key: 'mine', icon: <FileAddOutlined />, value: stats.mineTotal, label: '我提交的需求', color: 'brand' },
            { key: 'progress', icon: <ClockCircleOutlined />, value: stats.mineProgress, label: '我的進行中', color: 'info' },
            { key: 'todo', icon: <AuditOutlined />, value: stats.todoTotal, label: '待我處理', color: 'system' },
            { key: 'accept', icon: <CheckCircleOutlined />, value: stats.toAcceptTotal, label: '待我驗收', color: 'success' },
            { key: 'overdue', icon: <AlertOutlined />, value: stats.overdueTotal, label: '逾期預警', color: 'brand' },
            { key: 'delivered', icon: <RocketOutlined />, value: stats.deliveredTotal, label: '已交付需求', color: 'info' },
          ]}
        />
      </div>
    ),
    'delivery-metrics': wbSummary ? (
      <div style={{ marginBottom: 16 }}>
        <StatCards
          items={[
            { key: 'myProjects', icon: <ProjectOutlined />, value: wbSummary.myProjectCount, label: '我的項目數', color: 'info' },
            { key: 'myPending', icon: <ClockCircleOutlined />, value: wbSummary.myPendingTaskCount, label: '待辦任務數', color: 'system' },
            { key: 'myDelivery', icon: <RocketOutlined />, value: wbSummary.myDeliveryItemCount, label: '我的交付項數', color: 'brand' },
            { key: 'upcoming', icon: <AlertOutlined />, value: wbSummary.upcomingDeadlineCount, label: '近期到期數', color: 'success' },
          ]}
        />
      </div>
    ) : null,

    // ── 执行区（角色专属，各自取数）──
    'dev-tasks': <MyDevTasksPanel />,
    'test-batches': <MyTestBatchesPanel />,
    'issues': <OpenIssuesPanel />,
    'release-batches': <MyReleaseBatchesPanel />,

    // ── 待办区 ──
    'todo-board': todoBoard ? (
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><AuditOutlined /></span>
          我的待辦
          {/* 去重計數：用 todo-board 的 total（已去重），不用分組直接相加 */}
          <Tag color="blue" style={{ margin: 0 }}>{todoBoard.total}</Tag>
          {todoBoard.rawReasonHits > todoBoard.total && (
            <Tag color="default" style={{ margin: 0 }}>已去重 {todoBoard.rawReasonHits - todoBoard.total} 條</Tag>
          )}
          <span className="rdm-todo-hint">一條待辦可能命中多個原因，這裡按對象去重後計數</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([
            { key: 'mine', title: '我負責', count: todoBoard.mineCount, color: '#1890FF', bg: '#E6F7FF' },
            { key: 'waiting_others', title: '等待他人', count: todoBoard.waitingOthersCount, color: '#722ED1', bg: '#F9F0FF' },
            { key: 'unassigned', title: '未指派', count: todoBoard.unassignedCount, color: '#8C8C8C', bg: '#FAFAFA' },
          ] as const).map(bucket => {
            const items = todoBoard.todos.filter(t => t.bucket === bucket.key)
            return (
              <div key={bucket.key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: bucket.color }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: bucket.color }}>{bucket.title}</span>
                  <Tag color={bucket.count > 0 ? 'orange' : 'default'} style={{ margin: 0 }}>{bucket.count}</Tag>
                </div>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#BFBFBF', padding: '8px 0' }}>無</div>
                ) : items.slice(0, 6).map(item => (
                  <div
                    key={item.key}
                    onClick={() => { if (item.actionUrl) navigate(item.actionUrl) }}
                    style={{ padding: '6px 0', borderBottom: '1px dashed #f0f0f0', cursor: item.actionUrl ? 'pointer' : 'default' }}
                  >
                    <div style={{ fontSize: 13, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                      <span>{item.refNo}</span>
                      {item.responsibleName && <span> · {item.responsibleName}</span>}
                      {item.overdue && <span style={{ color: '#FF4D4F' }}> · 逾期{item.overdueWorkingDays ? ` ${item.overdueWorkingDays} 工作日` : ''}</span>}
                    </div>
                    {item.reasons.length > 0 && (
                      <div style={{ fontSize: 12, color: '#D46B08', marginTop: 2 }}>{item.reasons.join('；')}</div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    ) : null,
    'role-todos': (
      <>
        {todos.filter(group => group.total > 0).map(group => {
          const meta = TODO_ICON[group.key] ?? { icon: <InboxOutlined />, color: '#8C8C8C', bg: '#F5F5F5' }
          return (
            <div key={group.key} className="rdm-todo-group">
              <div className="rdm-todo-head">
                <div className="rdm-todo-title">
                  <span className="rdm-icon-block" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
                  {group.title}
                  <Tag color={group.total > 0 ? 'orange' : 'default'} style={{ margin: 0 }}>{group.total}</Tag>
                  <span className="rdm-todo-hint">{group.hint}</span>
                </div>
                <Button
                  type="link"
                  size="small"
                  onClick={() => navigate(TODO_ROUTE[group.key] ?? intakeTodoRoute(hasMenuPermission('rdm-intake-approval')))}
                >
                  查看全部 <RightOutlined style={{ fontSize: 11 }} />
                </Button>
              </div>
              <div className="rdm-todo-body">
                {group.items.slice(0, 4).map(item => (
                  <div key={item.id} className="rdm-todo-item">
                    <div className="rdm-todo-item-main">
                      <div
                        className="rdm-todo-item-title"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/rdm-detail?id=${item.id}`)}
                      >
                        {item.title}
                      </div>
                      <div className="rdm-todo-item-meta">
                        <span>{formatRdmReqNo(item.reqNo)}</span>
                        <span>提出人：{item.submitterName}</span>
                        {item.submitDeptName && <span>{item.submitDeptName}</span>}
                        {item.expectDate && <span>期望：{item.expectDate}</span>}
                        {/* V3：显示交付项进度 */}
                        {item.flowVersion === 3 && item.deliveryItemCount != null && item.deliveryItemCount > 0 && (
                          <span style={{ color: '#2F54EB', fontWeight: 500 }}>
                            交付項 {item.deliveryDoneCount ?? 0}/{item.deliveryItemCount}
                          </span>
                        )}
                        {item.stayHours != null && item.stayHours > 24 && (
                          <span style={{ color: '#D46B08' }}>
                            已停留 {Math.round(item.stayHours / 24)} 天
                          </span>
                        )}
                      </div>
                    </div>
                    <Space size={6}>
                      <TypeTag reqType={item.reqType} />
                      <PriorityTag priority={item.priority} />
                      <StatusTag status={item.status} overdue={item.overdueFlag ?? false} />
                    </Space>
                    <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${item.id}`)}>
                      處理
                    </Button>
                  </div>
                ))}
                {group.items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無待辦" />}
              </div>
            </div>
          )
        })}
      </>
    ),
    'need-action': needAction.length > 0 ? (
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><ExclamationCircleOutlined /></span>
          需要我補充
          <Tag color="red" style={{ margin: 0 }}>{needAction.length}</Tag>
          <span className="rdm-todo-hint">這些需求在等提出人補内容或做決定，不處理會停在原地</span>
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-intake-approval')}>
            查看全部 <RightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
        {needAction.map(row => (
          <div key={row.id} className="rdm-need-item">
            <div className="rdm-todo-item-main">
              <div
                className="rdm-todo-item-title"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/rdm-detail?id=${row.id}`)}
              >
                {row.title}
              </div>
              <div className="rdm-need-reason">
                {SUBMITTER_ACTION_HINT[String(row.status)] ?? '需求等待提出人處理'}
                {row.rejectReason ? `｜理由：${row.rejectReason}` : ''}
              </div>
              <div className="rdm-todo-item-meta">
                <span>{formatRdmReqNo(row.reqNo)}</span>
                {row.stayHours != null && row.stayHours > 24 && (
                  <span style={{ color: '#D46B08' }}>已停留 {Math.round(row.stayHours / 24)} 天</span>
                )}
              </div>
            </div>
            <StatusTag status={row.status} overdue={row.overdueFlag ?? false} />
            <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${row.id}`)}>
              去處理
            </Button>
          </div>
        ))}
      </div>
    ) : null,

    // ── 项目与追踪区 ──
    'my-projects': myProjects.length > 0 ? (
      <div className="rdm-v3-projects">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F0F5FF', color: '#2F54EB' }}><ProjectOutlined /></span>
          我的項目
          <Tag color="blue" style={{ margin: 0 }}>{myProjects.length}</Tag>
          <span className="rdm-todo-hint">分批交付項目進度一覽</span>
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-project')}>
            項目總覽 <RightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
        <div className="rdm-v3-project-scroll">
          {myProjects.slice(0, 4).map(proj => (
            <div
              key={proj.id}
              className="rdm-v3-project-card"
              onClick={() => navigate(`/rdm-project-detail?id=${proj.id}`)}
            >
              <div className="rdm-v3-project-card-head">
                <span className="rdm-v3-project-card-name" title={proj.name}>{proj.name}</span>
                <Tag color={RDM_PROJECT_STATUS_COLOR[proj.status] ?? 'default'} style={{ margin: 0 }}>
                  {RDM_PROJECT_STATUS_LABEL[proj.status] ?? proj.status}
                </Tag>
              </div>
              <div className="rdm-v3-project-card-meta">
                {(() => {
                  const brief = wbSummary?.projects.find(p => p.projectId === proj.id)
                  return <span>交付項 <b>{brief ? `${brief.deliveryItemCompleted}/${brief.deliveryItemTotal}` : `${proj.deliveredCount}/${proj.totalDeliveryCount}`}</b></span>
                })()}
                {proj.nextDeliveryDate && <span>下次交付：{proj.nextDeliveryDate}</span>}
              </div>
              {(proj.blockedCount > 0 || proj.pendingDecisionCount > 0) && (
                <div className="rdm-v3-project-card-warn">
                  {proj.blockedCount > 0 && <Tag color="error" style={{ margin: 0, fontSize: 11 }}>阻塞 {proj.blockedCount}</Tag>}
                  {proj.pendingDecisionCount > 0 && <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>待決策 {proj.pendingDecisionCount}</Tag>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    'my-tracking': (
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><RocketOutlined /></span>
          我的提交追蹤
          <span className="rdm-todo-hint">只看到自己提的需求，進展與責任人一目了然</span>
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-intake-approval')}>
            查看全部 <RightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
        {tracking.length === 0 ? (
          <div className="rdm-empty-hint">
            目前沒有正在推進的需求。
            <Button type="link" size="small" onClick={() => navigate('/rdm-submit')}>現在提一個需求</Button>
          </div>
        ) : tracking.map(row => (
          <div key={row.id} className="rdm-track-item">
            <div className="rdm-todo-item-main">
              <div
                className="rdm-todo-item-title"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/rdm-detail?id=${row.id}`)}
              >
                {row.title}
              </div>
              <StageTrack status={String(row.status)} />
              <div className="rdm-todo-item-meta">
                <span>{formatRdmReqNo(row.reqNo)}</span>
                <span>當前處理人：{row.currentHandler || RDM_STATUS_LABEL[row.status as RdmStatus] || '-'}</span>
                {row.promisedPrdDate && <span>承諾 PRD：{row.promisedPrdDate}</span>}
                {row.planReleaseDate && <span>計劃上線：{row.planReleaseDate}</span>}
                {row.expectDate && <span>業務期望：{row.expectDate}</span>}
                {typeof row.progress === 'number' && row.progress > 0 && <span>研發進度 {row.progress}%</span>}
              </div>
            </div>
            <Space size={6}>
              <PriorityTag priority={row.priority} />
              <StatusTag status={row.status} overdue={row.overdueFlag ?? false} />
            </Space>
            <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${row.id}`)}>
              詳情
            </Button>
          </div>
        ))}
      </div>
    ),
    'activity': recentActivity.length > 0 ? (
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
            <ClockCircleOutlined />
          </span>
          最近交付動態
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-intake-approval')}>
            查看我的需求進度
          </Button>
        </div>
        {recentActivity.slice(0, 6).map(node => (
          <div key={node.id} className="rdm-risk-item">
            <StatusTag status={node.status} />
            <span style={{ color: '#595959' }}>
              {node.operatorName} 將需求推進至「{RDM_STATUS_LABEL[node.status as RdmStatus] ?? node.statusLabel ?? '-'}」
            </span>
            <span style={{ marginLeft: 'auto', color: '#8C8C8C', fontSize: 12 }}>
              {dayjs(node.time).format('MM-DD HH:mm')}
            </span>
          </div>
        ))}
      </div>
    ) : null,
  }

  return (
    <div className="content-area">
      {/* ── 顶部横幅：上带「我的工作視圖 + 操作」，下带「今日焦點 + 身份上下文」 ── */}
      <header className="rdm-hero">
        <div className="rdm-hero-head">
          <div className="rdm-hero-block">
            <div className="rdm-hero-label">{t('rdm.workbench.viewLabel', { defaultValue: '我的工作視圖' })}</div>
            <div className="rdm-hero-views">
              {identities.map(id => (
                <span key={id} className="rdm-hero-viewchip">
                  {RDM_IDENTITY_ICON[id] ?? DEFAULT_IDENTITY_ICON}
                  {RDM_IDENTITY_LABEL[id]}
                </span>
              ))}
              <HelpPopover
                title={t('rdm.workbench.viewHelpTitle', { defaultValue: '工作視圖怎麼來的' })}
                ariaLabel={t('rdm.workbench.viewHelpAria', { defaultValue: '工作視圖說明' })}
                placement="bottomLeft"
                width={380}
                content={identityHelpSections(t)}
              />
            </div>
          </div>
          <div className="rdm-hero-actions">
            <Button
              type="primary"
              className="rdm-hero-primary"
              icon={<FileAddOutlined />}
              onClick={() => navigate('/rdm-submit')}
            >
              {t('rdm.workbench.submitRequirement', { defaultValue: '我要提需求' })}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={load}>{t('rdm.workbench.refresh', { defaultValue: '刷新' })}</Button>
            <WorkbenchCustomize layout={layout} />
          </div>
        </div>

        {/* 下带：左边回答「先处理哪个」（可点滚到对应区块），右边只补一句「算在谁头上」 */}
        <div className="rdm-hero-band">
          <div className="rdm-hero-focus">
            {focusItems.length === 0 ? (
              <span className="rdm-hero-calm"><CheckCircleOutlined /> {t('rdm.workbench.focusCalm', { defaultValue: '目前沒有需要你立即處理的事' })}</span>
            ) : (
              <>
                <span className="rdm-hero-label">{t('rdm.workbench.focusLabel', { defaultValue: '今日焦點' })}</span>
                {focusItems.map(item => {
                  const target = resolveFocusTarget(item.targets)
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`rdm-hero-chip rdm-hero-chip--${item.tone}${target ? ' rdm-hero-chip--jump' : ''}`}
                      onClick={target ? () => handleFocusJump(target) : undefined}
                      aria-label={target
                        ? t('rdm.workbench.focusAriaJump', { defaultValue: '{{label}} {{value}} 項，前往對應區塊', label: item.label, value: item.value })
                        : t('rdm.workbench.focusAria', { defaultValue: '{{label}} {{value}} 項', label: item.label, value: item.value })}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      <b>{item.value}</b>
                    </button>
                  )
                })}
              </>
            )}
          </div>
          <div className="rdm-hero-context">
            {contextBits.map((bit, idx) => (
              <span key={bit} className="rdm-hero-context-bit">
                {idx > 0 && <i className="rdm-hero-dot" />}
                <span>{bit}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── 按个人布局渲染区块（未上屏的面板不取数）；id 供横幅「今日焦點」滚动定位 ── */}
      {layout.visibleKeys.map(key => (
        <div key={key} id={`rdm-wb-${key}`}>{sections[key] ?? null}</div>
      ))}
    </div>
  )
}
