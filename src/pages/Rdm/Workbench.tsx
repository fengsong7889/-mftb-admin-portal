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
 * i18n：本轮按高效开发模式只交界面，文案暂沿用繁中硬编码（待界面确认后的第二阶段统一抽键）。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Space, Spin, Tag, message } from 'antd'
import {
  AlertOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  InboxOutlined,
  ProjectOutlined,
  RightOutlined,
  RocketOutlined,
  SolutionOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
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
  type RdmIdentity,
  type RdmSectionKey,
} from './workbenchLayout'
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
 * 审批待办的落点：有「提需求」菜单授权的人落该页的「待我審批」视角；
 * <p>准入审批人常常是申请人的上级主管，不是产品总监 —— 他们未必持有分配侧授权，
 * 把所有人都固定落需求池会让他们点「查看全部」直接进不来。这类人走 OA 中心的待我审批，
 * 那边本来就是审批的单一事实源（准入审批已接 OA 回调）。
 * <p>v3.11 菜单拆分后必须改认 rdm-intake-approval：「待我審批」视角已从需求池整块移走，
 * 再跳 /rdm-intake?scope=approving 会落在一个没有对应页签的视角上。
 */
function intakeTodoRoute(canOpenApproval: boolean): string {
  return canOpenApproval ? '/rdm-intake-approval?scope=approving' : '/oa-requests'
}

/** 待办分组图标与主色 */
const TODO_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  intake: { icon: <AuditOutlined />, color: '#E8720C', bg: '#FFF7E6' },
  pool: { icon: <InboxOutlined />, color: '#FA8C16', bg: '#FFF7F0' },
  product: { icon: <SolutionOutlined />, color: '#722ED1', bg: '#F9F0FF' },
  acceptance: { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED' },
}

/**
 * 主身份的直达入口（hero 右侧主按钮）。
 * <p>每个身份只留一个「今天干活去哪儿」的按钮，其余靠区块里的「查看全部」跳转，
 * 否则会退化成把整条菜单抄一遍。menuKey 再次校验，避免推荐与授权不一致时点出 403。
 */
const PRIMARY_ENTRY: Partial<Record<RdmIdentity, { label: string; path: string; menuKey: string }>> = {
  developer: { label: '研發工作台', path: '/rdm-delivery', menuKey: 'rdm-delivery-board' },
  tester: { label: '測試工作台', path: '/rdm-test', menuKey: 'rdm-delivery-test' },
  releaser: { label: '發布中心', path: '/rdm-release', menuKey: 'rdm-delivery-release' },
  acceptor: { label: '驗收中心', path: '/rdm-acceptance', menuKey: 'rdm-acceptance' },
  product: { label: '需求跟進清單', path: '/rdm-requirement?scope=product', menuKey: 'rdm-requirement' },
  dispatcher: { label: '認領/分配', path: '/rdm-intake?scope=pool', menuKey: 'rdm-intake' },
  projectMgr: { label: '項目總覽', path: '/rdm-project', menuKey: 'rdm-dashboard-project' },
  approver: { label: '待我審批', path: '/rdm-intake-approval?scope=approving', menuKey: 'rdm-intake-approval' },
  submitter: { label: '我的提交', path: '/rdm-requirement?scope=mine', menuKey: 'rdm-requirement' },
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
  [RDM_STATUS.DRAFT]: '仍是草稿，補充內容後提交才会開始流轉',
  [RDM_STATUS.INTAKE_REJECTED]: '准入審批被駁回，修改後可重新提交',
  [RDM_STATUS.REJECTED]: '產品駁回了需求，可查看理由後決定是否重開',
  [RDM_STATUS.ON_HOLD]: '需求被挂起暂缓，確認是否仍需推進',
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
  const { user, hasMenuPermission, hasPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RdmWorkbenchData | null>(null)
  /** 我提的需求（含草稿与被驳回的），走列表接口 scope=mine，与待办分区不同口径 */
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
  const primaryEntry = PRIMARY_ENTRY[identities[0] ?? 'submitter']

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
          <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
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
          <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
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
          <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
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
      {/* ── 顶部欢迎区：身份可见 + 主入口只有一个 ── */}
      <div className="rdm-hero">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="rdm-hero-title">
              <RocketOutlined style={{ color: '#E8720C' }} />
              個人工作台
              <Tag color="orange" style={{ margin: 0 }}>產研交付</Tag>
            </div>
            <div className="rdm-hero-sub">
              {identity.name}
              {identity.deptName ? ` · ${identity.deptName}` : ''}
              {' · 我的角色：'}{identity.roleNames.join(' / ')}
            </div>
            {/* 工作台视图名：解释「为什么我看到的是这几块」，与配置面板口径一致 */}
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', marginRight: 6 }}>工作台視圖</span>
              {identities.map(id => (
                <Tag key={id} style={{ margin: '0 4px 0 0' }}>{RDM_IDENTITY_LABEL[id]}</Tag>
              ))}
            </div>
          </div>
          <div className="rdm-hero-actions">
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={() => navigate('/rdm-submit')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 20px', boxShadow: '0 2px 6px rgba(232,114,12,0.3)',
              }}
            >
              我要提需求
            </Button>
            {primaryEntry && hasMenuPermission(primaryEntry.menuKey) && (
              <Button icon={<ThunderboltOutlined />} onClick={() => navigate(primaryEntry.path)}>
                {primaryEntry.label}
              </Button>
            )}
            <Button icon={<AlertOutlined />} onClick={() => navigate('/rdm-dashboard')}>
              全局看板
            </Button>
            <WorkbenchCustomize layout={layout} />
          </div>
        </div>
      </div>

      {/* ── 按个人布局渲染区块（未上屏的面板不取数）── */}
      {layout.visibleKeys.map(key => (
        <Fragment key={key}>{sections[key] ?? null}</Fragment>
      ))}
    </div>
  )
}
