/**
 * 产研需求管理（RDM）API
 *
 * 后端对应 RdmRequirementController 等（/api/rdm/**）。
 * 读接口在后端不可用时降级到本地 Mock 数据（src/api/mock/rdmMock），便于界面先行验证；
 * 写接口默认绝不降级（见 canMockWrite）。
 */
import request, { isBackendUnavailable, SILENT_HEADER } from './request'
import type { PageResult } from './employee'
import type { ScoreBreakdownResult } from '../utils/rdmScore'
import { RDM_ACCEPT_RESULT, RDM_ACTION, RDM_STATUS } from '../constants/rdm'
import type {
  RdmAcceptResult,
  RdmAction,
  RdmActionField,
  RdmAnchorType,
  RdmComplexity,
  RdmIterationStatus,
  RdmPriority,
  RdmReqType,
  RdmRiskType,
  RdmRoleCode,
  RdmScope,
  RdmSourceChannel,
  RdmStage,
  RdmStatus,
} from '../constants/rdm'
import {
  mockAcceptanceHistory,
  mockAddComment,
  mockBatchAssign,
  mockCreateRequirement,
  mockDeleteRoutingRule,
  mockDashboard,
  mockFunctionPoints,
  mockGetRequirement,
  mockListRequirements,
  mockMenuTree,
  mockMetricTrend,
  mockPreviewScore,
  mockProductOptions,
  mockPrdDraft,
  mockQualityData,
  mockRiskSummary,
  mockSimilarRequirements,
  mockRoutingRules,
  mockSaveRoutingRule,
  mockSaveSla,
  mockScoreBoard,
  mockScoreRules,
  mockSetStatusEnabled,
  mockSetTransitionEnabled,
  mockScopeCounts,
  mockRequirementStats,
  mockSlaConfigs,
  mockStatusDefs,
  mockTransitions,
  mockTransition,
  mockWithdrawRequirement,
  mockVersionTrace,
  mockRequirementTrace,
  mockWeeklyReport,
  mockWorkbench,
} from './mock/rdmMock'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/**
 * 生成幂等 requestId（客户端生成，重试保持不变即可）。
 * <p>V3 写接口统一要求 requestId：服务端据此对同一逻辑操作去重，避免网络重试造成重复裁决/重复放行。
 * 优先 crypto.randomUUID，浏览器不支持时降级到时间戳+随机串。
 */
function genRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 若调用方未显式提供 requestId，则自动补一个（已有则原样保留，保证重试幂等）。
 * <p>expectedVersion 由调用方按读取到的 version 显式传入，此处绝不臆造。
 */
function withRequestId<T extends { requestId?: string }>(data: T): T {
  return data.requestId ? data : { ...data, requestId: genRequestId() }
}

/**
 * RDM 本地演示开关（默认关）。
 * <p>读接口降级无副作用，离线也能评审界面；写接口不行：真实写入失败被换成 mock 成功，
 * 用户会看到「已提交/已分配/已验收」而服务端一条记录都没落，这种假成功比报错更难发现
 *（实测曾靠它把“页面走得通”误当成“后端链路正常”）。
 * <p>演示环境需显式设 `VITE_RDM_DEMO=1`；它不是业务开关，不能用来掩盖后端故障。
 */
const DEMO_WRITE = (import.meta.env.VITE_RDM_DEMO as string | undefined) === '1'

/** 写请求是否允许降级到 mock：仅演示模式 + 后端确实不可用 */
function canMockWrite(err: unknown): boolean {
  return DEMO_WRITE && isBackendUnavailable(err)
}

/* ==================== 类型定义 ==================== */

/** 處理中人員快照（當前處理人聚合列） */
export interface RdmHandlerPerson {
  userId?: number | null
  name: string
  empNo?: string | null
}

/** 需求列表行 */
export interface RdmRequirementRow {
  id: number
  /**
   * 正式需求编号，**允许为 null**（需求提交/需求管理拆分 · 批次1）。
   * 只在首次准入成功（审批全部通过或服务端免审批命中）时生成；
   * 草稿 / 审批中 / 审批驳回阶段为 null，渲染时必须显示「尚未生成」而不是空串。
   * 不得用内部 id 或 XQSP 审批流程编号填充本字段。
   */
  reqNo: string | null
  title: string
  reqType: RdmReqType | string
  priority: RdmPriority | string
  complexity?: RdmComplexity | string | null
  status: RdmStatus | string
  stage?: RdmStage | string | null
  submitterName: string
  submitterEmpNo?: string | null
  submitDeptName?: string | null
  submitTime?: string | null
  pmName?: string | null
  pmEmpNo?: string | null
  devOwnerName?: string | null
  dispatcherName?: string | null
  currentHandler?: string | null
  /**
   * 當前處理人聚合：未完成任務（todo/doing/blocked）的負責人，按人去重。
   * 多人並行時全部返回；為空時列表回退展示 currentHandler（流程推演值）。
   */
  handlers?: RdmHandlerPerson[] | null
  expectDate?: string | null
  promisedPrdDate?: string | null
  planReleaseDate?: string | null
  actualReleaseDate?: string | null
  versionNo?: string | null
  /** 所属迭代编码（详情属性区用于判断「是否已进迭代产能对账」） */
  iterationCode?: string | null
  /** 业务验收人姓名（不传即提出人本人，界面据此显示实际签字人） */
  acceptorName?: string | null
  /** 业务验收人 sys_user.id（草稿续编要回填，否则保存会把指派的验收人重置成提交人） */
  acceptorUserId?: number | null
  /** 提交时指定的意向产品经理 id（需审批时先存意向，审批通过后才生效为受理人） */
  intentPmUserId?: number | null
  /** 分配时间（技术负责人派单动作的时间戳） */
  distributeTime?: string | null
  /** 产品受理时间 */
  acceptTime?: string | null
  /** 计划开发完成日期 */
  planDevDate?: string | null
  /** 挂起复审日期（暂缓到期后要有人确认是否继续） */
  onHoldUntil?: string | null
  progress?: number | null
  blockedFlag?: boolean | null
  blockedReason?: string | null
  overdueFlag?: boolean | null
  rejectReason?: string | null
  rejectCount?: number | null
  acceptanceResult?: RdmAcceptResult | string | null
  acceptanceScore?: number | null
  /** 当前状态停留小时数（逾期/风险判定依据） */
  stayHours?: number | null
  /**
   * 流程版本：1=历史记录（无五节点计划/PRD 定稿快照/工时明细），2=新链路，3=分批交付。
   * <p>发布闸门的检查项会据此跳过不适用的新口径，界面需要跟同一口径显示。
   */
  flowVersion?: number | null
  /** V3：所属项目 ID */
  projectId?: number | null
  /** V3：所属项目名称（列表行冗余，减少前端二次查询） */
  projectName?: string | null
  /** V3：需求种类 aggregate/execution */
  requirementKind?: string | null
  /** V3：结构化主需求 ID（执行需求指向其聚合父需求） */
  structureParentReqId?: number | null
  /** V3：结构化主需求编号 */
  structureParentReqNo?: string | null
  /** V3：交付项总数（后端冗余计数） */
  deliveryItemCount?: number | null
  /** V3：已完成交付项数 */
  deliveryDoneCount?: number | null
  /** 当前准入轮次（服务端裁决快照，与 rdm_intake_round 对齐） */
  intakeRoundNo?: number | null
  /** 本轮是否需审批（服务端裁决；1=需要 0=已命中免审策略） */
  needApproval?: number | null
  /** 本轮准入裁决: FORCE_APPROVE/APPROVE/EXEMPT */
  intakeMode?: string | null
  /** 命中策略名称/版本：免审也要能解释「凭什么是免审」 */
  intakePolicyName?: string | null
  intakePolicyVersion?: string | null
  /** 命中链路（逐行展示） */
  intakeExplain?: string[] | null
  updatedAt?: string | null
}

/** 需求关联对象（定位到系统/菜单/页面/功能点） */
export interface RdmTargetRef {
  anchorType: RdmAnchorType | string
  systemCode?: string | null
  systemName?: string | null
  menuKey?: string | null
  menuName?: string | null
  pagePath?: string | null
  anchorName?: string | null
  anchorDesc?: string | null
  screenshotUrl?: string | null
}

/** 工作项成员 */
export interface RdmRoleMember {
  userId: number
  empNo?: string | null
  name: string
  roleCode: RdmRoleCode | string
  joinTime?: string | null
  active?: boolean
}

/** 流转时间轴节点 */
export interface RdmTimelineNode {
  id: number
  status: RdmStatus | string
  statusLabel?: string | null
  actionCode?: RdmAction | string | null
  operatorName: string
  operatorRole?: RdmRoleCode | string | null
  time: string
  remark?: string | null
  /** 该状态停留小时数 */
  durationHours?: number | null
  overdue?: boolean
}

/** 评论 */
export interface RdmCommentItem {
  id: number
  content: string
  authorName: string
  authorRole?: RdmRoleCode | string | null
  createdAt: string
  /** 仅产研可见（业务方不可见内部讨论） */
  internal?: boolean
  mentionNames?: string[]
}

/** 附件 */
export interface RdmAttachmentItem {
  id: number
  fileName: string
  fileUrl: string
  fileType?: string | null
  fileSize?: number | null
  uploaderName?: string | null
  createdAt?: string | null
}

/** 准入审批节点（来源 OA 引擎） */
export interface RdmApprovalNode {
  nodeName: string
  approverName?: string | null
  /** pending/approved/rejected */
  status: string
  time?: string | null
  comment?: string | null
}

/** 验收信息 */
export interface RdmAcceptanceInfo {
  acceptNo?: string | null
  result?: RdmAcceptResult | string | null
  score?: number | null
  caseTotal?: number | null
  casePass?: number | null
  issues?: string | null
  acceptorName?: string | null
  acceptTime?: string | null
  opinion?: string | null
}

/** SLA 时效 */
export interface RdmSlaInfo {
  statusCode: RdmStatus | string
  slaHours: number
  warnHours?: number
  /** 剩余小时数，负值表示已逾期 */
  remainHours: number
  overdue: boolean
  escalateRole?: string | null
}

/** 需求详情 */
export interface RdmRequirementDetail extends RdmRequirementRow {
  description?: string | null
  expectResult?: string | null
  businessValue?: string | null
  sourceChannel?: RdmSourceChannel | string | null
  /** 准入审批单号（OA 引擎）：详情页据此跳审批中心，也是「审批与流转同源」的凭证 */
  intakeFlowNo?: string | null
  /** 质量口径计数（M3）：详情页要能直接看到返工与变更代价 */
  reworkCount?: number | null
  changeCount?: number | null
  rejectCount?: number | null
  reopenCount?: number | null
  /** 衍生来源需求编号（验收遗留事项自动转出的后续需求） */
  parentReqNo?: string | null
  targets: RdmTargetRef[]
  roles: RdmRoleMember[]
  timeline: RdmTimelineNode[]
  comments: RdmCommentItem[]
  attachments: RdmAttachmentItem[]
  approvalNodes: RdmApprovalNode[]
  acceptance?: RdmAcceptanceInfo | null
  sla?: RdmSlaInfo | null
  /** 当前登录人在本需求上的角色（后端权威） */
  myRole?: string | null
  /** 当前登录人可执行的流转动作（后端按 rdm_transition + 角色守卫计算，非空时优于本地推导） */
  allowedActions?: RdmAllowedAction[]
}

/** 可执行流转动作 */
export interface RdmAllowedAction {
  actionCode: RdmAction | string
  actionName: string
  toStatus: RdmStatus | string
  tone: 'primary' | 'success' | 'danger' | 'default'
  requiredFields: RdmActionField[]
}

/** 提交/编辑表单 */
export interface RdmRequirementForm {
  title: string
  reqType: RdmReqType | string
  priority: RdmPriority | string
  complexity?: RdmComplexity | string
  expectDate?: string
  description: string
  expectResult?: string
  businessValue?: string
  targets: RdmTargetRef[]
  /** PM=直接指定产品经理；POOL=提交技术部分发 */
  assignMode: 'PM' | 'POOL'
  pmUserId?: number
  /** 仅 mock 阶段用于列表回显；真实接口按 pmUserId 在后端回填姓名 */
  pmName?: string
  /** 是否免审批（管理岗或规则命中时由后端判定） */
  needApproval?: boolean
  /** 業務驗收人（不传默认提出人本人） */
  acceptorUserId?: number
  /** 附件（舆後端 RdmRequirementCreateDTO.attachments 对齐，storagePath 存 Base64 Data URL） */
  attachments?: { fileName: string; storagePath: string; fileType?: string; fileSize?: number }[]
  /** V3：流程版本（不传默认 V2） */
  flowVersion?: number
  /** V3：所属项目 ID */
  projectId?: number
  /** V3：需求种类 aggregate/execution */
  requirementKind?: string
  /** V3：结构化父需求 ID（执行需求指向聚合父需求） */
  structureParentReqId?: number
}

/** 状态流转请求 */
export interface RdmTransitionForm {
  actionCode: RdmAction | string
  remark?: string
  planDate?: string
  promisedDate?: string
  holdUntil?: string
  versionNo?: string
  score?: number
  pmUserId?: number
  pmName?: string
  blockReason?: string
  /** 所属迭代（提交排期时必填；dispatch/accept 选填，选了才能进迭代的产能对账与周报过滤） */
  iterationCode?: string
  /** 所属项目（归属体系改造）：dispatch/accept 选填，schedule 必填；服务端校验与迭代项目一致 */
  projectId?: number | null
}

/** 验收提交 */
export interface RdmAcceptanceForm {
  result: RdmAcceptResult | string
  /** 满意度 1~5；不通过时可缺省（拒收时要求打分没有意义），通过时由页面校验强制 */
  score?: number
  caseTotal?: number
  casePass?: number
  issues?: string
  opinion?: string
  /** 验收环境（prod/pre/uat），返工时用于复现 */
  testEnv?: string
  /** 逐条验收用例（M3）：后端落 rdm_acceptance_case，同时汇总 caseTotal/casePass */
  cases?: RdmAcceptanceCaseForm[]
  /** 有條件通過时是否把遗留事项转为后续需求（M3） */
  createFollowUp?: boolean
  /** 转后续需求的标题，留空则由服务端按需求标题生成 */
  followUpTitle?: string
}

/** 验收用例（提交态） */
export interface RdmAcceptanceCaseForm {
  title: string
  expect?: string
  actual?: string
  /**
   * 用例结论（表单草稿态可未填）。
   * <p>必须允许为空：给用例预选「通過」会让验收人什么都不改就能交“全部通过”，
   * 验收退化成盖章；未判定时由 validateAcceptance 拦住提交。
   */
  result?: string
  severity?: string
  remark?: string
  /** 证据附件（截图/记录）：上传接口返回的 Data URL 原样回传，服务端不落盘 */
  evidences?: RdmAcceptanceEvidencePayload[]
}

/** 验收证据附件：提交态（含 Base64 正文） */
export interface RdmAcceptanceEvidencePayload {
  name: string
  type: string
  size?: number
  dataUrl: string
}

/**
 * 验收证据附件：回显态。
 * <p>后端刻意不回 dataUrl 正文：一条用例可挂数张图，返工几轮累乘会把一次验收历史
 * 撑到几十 MB。正文由 fetchAcceptanceEvidence 按 index 单张取。
 */
export interface RdmAcceptanceEvidenceMeta {
  index: number
  name?: string | null
  type?: string | null
  size?: number | null
}

/**
 * 验收用例（返回态，带序号与缺陷统计）。
 * <p>evidences 与提交态不同构（只有元信息、没有正文），故用 Omit 挡掉继承。
 */
export interface RdmAcceptanceCase extends Omit<RdmAcceptanceCaseForm, 'evidences'> {
  /** 已落库的用例必有结论 */
  result: string
  id: number
  seq: number
  /** 证据附件元信息（不含正文） */
  evidences?: RdmAcceptanceEvidenceMeta[]
  acceptanceId?: number | null
}

/** 产品经理候选（含负载） */
export interface RdmProductOption {
  userId: number
  empNo: string
  name: string
  deptName?: string | null
  domains: string[]
  activeCount: number
  capacity: number
}

/** SLA 配置行（后端 RdmConfigVO.Sla 同构） */
export interface RdmSlaRow {
  id?: number
  statusCode: RdmStatus | string
  statusLabel: string
  priority?: RdmPriority | string | ''
  slaHours: number
  warnHours: number
  escalateRole: RdmRoleCode | string
  enabled: boolean
}

/** 菜单级联节点 */
export interface RdmMenuTreeNode {
  key: string
  title: string
  children?: RdmMenuTreeNode[]
}

/** 工作台待办分组 */
export interface RdmTodoGroup {
  key: string
  title: string
  hint?: string
  total: number
  items: RdmRequirementRow[]
}

/** 工作台数据 */
export interface RdmWorkbenchData {
  identity: { name: string; empNo?: string; deptName?: string; roleNames: string[] }
  todos: RdmTodoGroup[]
  stats: {
    mineTotal: number
    mineProgress: number
    todoTotal: number
    overdueTotal: number
    toAcceptTotal: number
    deliveredTotal: number
  }
  /** 最近动态（mock 阶段提供，真实接口以列表/详情时间轴为准） */
  recentActivity?: RdmTimelineNode[]
}

/**
 * 准入策略（阶段 2B）
 * <p>接口对应 RdmConfigController 的 /intake-policy；裁决、模拟、冲突拦截全部在服务端，
 * 前端只负责配置与解释展示，不能自己算「要不要审批」。
 */

/** 准入动作：强制需审批 / 需审批 / 免审直送 */
export type RdmIntakeMode = 'FORCE_APPROVE' | 'APPROVE' | 'EXEMPT'

export const RDM_INTAKE_MODE_LABEL: Record<RdmIntakeMode, string> = {
  FORCE_APPROVE: '強制需審批',
  APPROVE: '需審批',
  EXEMPT: '免審直送技術部',
}

export const RDM_INTAKE_MODE_COLOR: Record<RdmIntakeMode, string> = {
  FORCE_APPROVE: 'error',
  APPROVE: 'processing',
  EXEMPT: 'success',
}

/** 准入策略（rdm_intake_policy） */
export interface RdmIntakePolicy {
  id?: number
  name: string
  mode: RdmIntakeMode
  scopeDepts: string[]
  includeSubDept?: boolean
  scopeRoles: string[]
  scopeSystems: string[]
  scopeReqTypes: string[]
  approvalNodes: string[]
  dispatcherUserId?: number | null
  dispatcherName?: string | null
  priority: number
  effectiveFrom: string
  effectiveTo?: string | null
  version?: string
  enabled: boolean
  remark?: string | null
}

/** 一次准入裁决结果（与提交时写进需求的快照同源） */
export interface RdmIntakeDecision {
  needApproval: boolean
  mode: RdmIntakeMode
  policyId?: number | null
  policyName?: string | null
  policyVersion?: string | null
  approvalNodes: string[]
  dispatcherUserId?: number | null
  dispatcherName?: string | null
  explain: string[]
  abnormal?: boolean
  fallback?: boolean
}

/**
 * 准入策略列表。
 * <p>故意不做读降级：这是「谁能跳过公司准入」的安全配置，
 * 拿一份本地样例冒充真实策略比报错更危险（会让人误以为已经配好了）。
 */
export async function fetchIntakePolicies(): Promise<RdmIntakePolicy[]> {
  return request.get<unknown, RdmIntakePolicy[]>('/rdm/config/intake-policy', SILENT)
}

/** 保存准入策略（同优先级条件重叠、需审批无节点都会被服务端拒） */
export async function saveIntakePolicy(policy: RdmIntakePolicy): Promise<RdmIntakePolicy[]> {
  try {
    return await request.post<unknown, RdmIntakePolicy[]>('/rdm/config/intake-policy', policy, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return []
    throw err
  }
}

/** 删除准入策略（逻辑删，已发生轮次仍按快照保留命中策略与版本） */
export async function deleteIntakePolicy(id: number): Promise<RdmIntakePolicy[]> {
  try {
    return await request.delete<unknown, RdmIntakePolicy[]>(`/rdm/config/intake-policy/${id}`, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return []
    throw err
  }
}

/**
 * 准入规则模拟（不写库）。
 * <p>提交页的「審批要求（由系統判定）」与配置页的规则模拟共用本接口，
 * 保证界面展示与提交后真实落库的裁决是同一口径；不做降级，否则展示会变成假的。
 */
export async function simulateIntake(body: {
  empNo?: string
  reqType?: string
  systemCode?: string
}): Promise<RdmIntakeDecision> {
  return request.post<unknown, RdmIntakeDecision>('/rdm/config/intake-policy/simulate', body, SILENT)
}

/** 分发矩阵行 */
export interface RdmRoutingRow {
  id: number
  /** SYSTEM/MENU/DEPT/TYPE */
  scopeType: string
  scopeValue: string
  scopeName: string
  pmUserId: number
  pmName: string
  backupPmName?: string | null
  loadCapacity: number
  activeCount: number
  priority: number
  enabled: boolean
  /**
   * 仅前端使用：行内「新增規則」尚未落库的标记。
   * <p>为什么需要它：表格 rowKey 需要一个本地唯一值，以前直接用 Date.now() 当 id 并原样送给后端，
   * 后端看到 id 非空就走 UPDATE，影响 0 行却仍回「已保存」——新增规则永远存不下来。
   * 提交前必须把本标记去掉并把 id 置 null。
   */
  isNew?: boolean
}

/** 保存分发矩阵行的请求体：id 为 null/缺省 表示新增（后端按 null 走 INSERT，带 id 走 UPDATE） */
export type RdmRoutingSaveForm = Omit<RdmRoutingRow, 'id' | 'isNew'> & { id?: number | null }

/** 状态定义行 */
export interface RdmStatusDefRow {
  code: RdmStatus | string
  label: string
  stage: RdmStage | string
  sortNo: number
  finalFlag: boolean
  enabled: boolean
}

/** 流转规则行 */
export interface RdmTransitionRow {
  id: number
  fromStatus: RdmStatus | string
  toStatus: RdmStatus | string
  actionCode: RdmAction | string
  actionName: string
  allowedRoles: (RdmRoleCode | string)[]
  requiredFields: string[]
  enabled: boolean
}

/**
 * 风险条目（全局唯一口径，后端 RdmAnalyticsService.riskList 同构）。
 * <p>状态必须带上：风险中心页要告诉用户“卡在 PRD 还是卡在测试”，
 * 不带 status 就逼人再发一次请求反查，那又变成两套口径。
 */
export interface RdmRiskItem {
  riskType: RdmRiskType | string
  reqId: number
  /**
   * 允许为 null：`INTAKE_STUCK`（审批卡壳）行本身就是准入前需求，还没有正式编号。
   * 渲染必须走 `formatRdmReqNo`，不得直接当字符串拼接。
   */
  reqNo: string | null
  title: string
  status?: RdmStatus | string | null
  submitterName: string
  handler: string
  days: number
}

/** 全局看板数据 */
export interface RdmDashboardData {
  overview: {
    reqTotal: number
    submittedThisMonth: number
    deliveredThisMonth: number
    avgResponseHours: number
    avgDeliveryDays: number
    onTimeRate: number
    rejectRate: number
    overdueTotal: number
    blockedTotal: number
    unassignedTotal: number
    intakeStuckTotal: number
  }
  typeDist: { name: string; value: number }[]
  deptRank: { deptName: string; submitted: number; delivered: number; onTimeRate: number; avgDays: number }[]
  pmRank: { pmName: string; active: number; delivered: number; overdue: number; avgDays: number }[]
  stageDuration: { stage: RdmStage | string; avgHours: number }[]
  trend: { date: string; submitted: number; delivered: number }[]
  risks: RdmRiskItem[]
  board: { columns: { key: string; title: string; count: number; overdue: number }[] }
}

/** 列表查询条件（字段名与后端 RdmRequirementQuery 对齐） */
export interface RdmRequirementQuery {
  page?: number
  size?: number
  scope?: RdmScope | string
  keyword?: string
  reqType?: string
  priority?: string
  status?: string
  /** 提出部门 ID */
  deptId?: number
  /** 产品经理用户 ID */
  pmUserId?: number
  overdueOnly?: boolean
  /** 提出人用户 ID */
  submitterUserId?: number
  /** 當前處理人用户 ID：命中該人負責的未完成任務（todo/doing/blocked）所屬需求 */
  handlerUserId?: number
  /** V3：按所属项目过滤 */
  projectId?: number
  /** V3：按需求种类过滤 aggregate/execution */
  requirementKind?: string
  /**
   * 流程版本过滤（1/2/3）。
   * 提测、发布等 V3 专属入口必须传 3：服务端准入会拒 flow_version != 3 的需求，
   * 候选列表不同源过滤会造成「选得到、提交被拒」。
   */
  flowVersion?: number
  /**
   * 执行侧地板（需求跟进清单专用）：为真时服务端只返回「已分配到产品」的需求，
   * 排除准入前（草稿/待审批/审批驳回）与需求池（待分配）。
   * <p>准入前归「提需求」菜单、待分配归「认领/分配」菜单，跟进清单只看分配之后的执行进展。
   * 默认 false，不影响工作台「我的提交」等需要全状态的调用方。
   */
  executionOnly?: boolean
}

/* ==================== 查询 ==================== */

/** 需求分页列表 */
export async function fetchRequirementPage(query: RdmRequirementQuery): Promise<PageResult<RdmRequirementRow>> {
  try {
    return await request.get<unknown, PageResult<RdmRequirementRow>>('/rdm/requirement', { params: query, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) {
      const records = mockListRequirements(query)
      return { records, total: records.length }
    }
    throw err
  }
}

/** 各视角（Tab）数量。executionOnly=true 时按需求跟进清单的执行侧地板计数，与列表同口径 */
export async function fetchScopeCounts(executionOnly = false): Promise<Record<string, number>> {
  try {
    const config = executionOnly ? { params: { executionOnly: true }, ...SILENT } : SILENT
    return await request.get<unknown, Record<string, number>>('/rdm/requirement/scope-counts', config)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockScopeCounts()
    throw err
  }
}

/**
 * 看板信号卡统计（total/overdue/toAccept/pool）。
 *
 * 必须把列表的查询条件一起传上去：看板一次只拉固定上限条数，
 * 在前端对已加载的行做 filter().length 会把数字锁死在上限值。
 */
export async function fetchRequirementStats(
  query: Omit<RdmRequirementQuery, 'page' | 'size'>,
): Promise<Record<string, number>> {
  try {
    return await request.get<unknown, Record<string, number>>('/rdm/requirement/stats', { params: query, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockRequirementStats(query)
    throw err
  }
}

/** 需求详情 */
export async function fetchRequirementDetail(id: number): Promise<RdmRequirementDetail | null> {
  try {
    return await request.get<unknown, RdmRequirementDetail>(`/rdm/requirement/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockGetRequirement(id)
    throw err
  }
}

/** 当前登录人在该需求上可执行的流转动作 */
export async function fetchAllowedActions(id: number): Promise<RdmAllowedAction[]> {
  try {
    return await request.get<unknown, RdmAllowedAction[]>(`/rdm/requirement/${id}/actions`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 工作台待办聚合 */
export async function fetchWorkbench(): Promise<RdmWorkbenchData> {
  try {
    return await request.get<unknown, RdmWorkbenchData>('/rdm/workbench', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockWorkbench()
    throw err
  }
}

/** 全局看板数据 */
export async function fetchDashboard(period?: string): Promise<RdmDashboardData> {
  try {
    return await request.get<unknown, RdmDashboardData>('/rdm/analytics/overview', { params: { period }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockDashboard()
    throw err
  }
}

/** 产品经理候选（含负载） */
export async function fetchProductOptions(): Promise<RdmProductOption[]> {
  try {
    return await request.get<unknown, RdmProductOption[]>('/rdm/options/product-managers', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockProductOptions()
    throw err
  }
}

/** 系统 → 菜单 级联树 */
export async function fetchMenuTree(): Promise<RdmMenuTreeNode[]> {
  try {
    return await request.get<unknown, RdmMenuTreeNode[]>('/rdm/options/menu-tree', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockMenuTree()
    throw err
  }
}

/** 菜单下的功能点候选 */
export async function fetchFunctionPoints(menuKey?: string): Promise<{ key: string; title: string }[]> {
  if (!menuKey) return []
  try {
    return await request.get<unknown, { key: string; title: string }[]>('/rdm/options/function-points', {
      params: { menuKey },
      ...SILENT,
    })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFunctionPoints(menuKey)
    throw err
  }
}

/* ==================== 写入 ==================== */

/** 提交需求（mode=draft 存草稿） */
export async function createRequirement(form: RdmRequirementForm, mode: 'draft' | 'submit' = 'submit') {
  try {
    return await request.post<unknown, RdmRequirementRow>('/rdm/requirement', { ...form, mode }, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockCreateRequirement(form)
    throw err
  }
}

/**
 * 提出人自助提交 / 修改后重提（服务端按当前状态选 submit 或 resubmit）。
 * <p>不走通用流转接口：那个入口要求 rdm-requirement:edit（产品处理权），
 * 员工只该拿到 create 就能提交自己的需求。
 */
export async function submitRequirement(id: number, remark?: string): Promise<RdmRequirementRow> {
  return request.post<unknown, RdmRequirementRow>(`/rdm/requirement/${id}/submit`, { remark: remark || undefined })
}

/** 修改需求（仅草稿/驳回态可改） */
export async function updateRequirement(id: number, form: Partial<RdmRequirementForm>) {
  return request.put<unknown, RdmRequirementRow>(`/rdm/requirement/${id}`, form)
}

/** 状态流转 */
export async function transitionRequirement(id: number, form: RdmTransitionForm) {
  try {
    return await request.post<unknown, RdmRequirementRow>(`/rdm/requirement/${id}/transition`, form, SILENT)
  } catch (err) {
    if (canMockWrite(err)) {
      const mapped: Partial<RdmRequirementRow> = {}
      if (form.remark) mapped.rejectReason = form.remark
      if (form.planDate) mapped.planReleaseDate = form.planDate
      if (form.promisedDate) mapped.promisedPrdDate = form.promisedDate
      if (form.versionNo) mapped.versionNo = form.versionNo
      if (form.pmName) mapped.pmName = form.pmName
      return mockTransition(id, form.actionCode, mapped)
    }
    throw err
  }
}

/**
 * 调整迭代（归属体系改造）：属性变更而非状态流转，独立端点。
 * <p>后端会同步该需求下未完成任务的迭代归属（需求迭代与任务迭代同源），
 * 用于「研发 bug / 需求不足要放另外版本」场景（对齐 Jira Move to sprint）。
 */
export async function changeRequirementIteration(
  id: number,
  form: { projectId?: number | null; iterationCode: string; remark?: string },
) {
  return request.put<unknown, RdmRequirementRow>(`/rdm/requirement/${id}/iteration`, form)
}

/** 批量分配产品经理（需求池） */
export async function batchAssign(ids: number[], pm: { userId: number; name: string }) {
  try {
    return await request.post<unknown, void>('/rdm/requirement/batch-assign', { ids, pmUserId: pm.userId, pmName: pm.name }, SILENT)
  } catch (err) {
    if (canMockWrite(err)) {
      mockBatchAssign(ids, pm.name)
      return
    }
    throw err
  }
}

/**
 * 产品经理自需求池认领。
 * <p>服务端用条件更新保证只有一人抢成功，抢不到会回错文，界面上必须当成失败处理。
 */
export async function claimRequirement(id: number): Promise<void> {
  return request.post<unknown, void>(`/rdm/requirement/${id}/claim`, {}, SILENT)
}

/** 改派产品经理（旧受理人保留历史贡献，仅失去本单操作资格） */
export async function reassignPm(id: number, pm: { userId: number; name: string }, reason?: string): Promise<void> {
  return request.post<unknown, void>(`/rdm/requirement/${id}/reassign`,
    { pmUserId: pm.userId, pmName: pm.name, remark: reason }, SILENT)
}

/** 添加评论 */
export async function addComment(id: number, content: string, internal = false) {
  try {
    return await request.post<unknown, RdmCommentItem>(`/rdm/requirement/${id}/comment`, { content, internal }, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockAddComment(id, content)
    throw err
  }
}

/** 催办 */
export async function urgeRequirement(id: number) {
  try {
    return await request.post<unknown, void>(`/rdm/requirement/${id}/urge`, {}, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return
    throw err
  }
}

/**
 * 撤回为草稿（仅「待审批」且提出人本人可撤回，服务端会再校一次）。
 * <p>失败不静默：后端会拒（状态不符/非本人），错误必须回到界面上，
 * 不能像以前那样先弹「已撤回」再发现数据没动。
 */
export async function withdrawRequirement(id: number): Promise<void> {
  try {
    await request.post<unknown, void>(`/rdm/requirement/${id}/withdraw`, {}, SILENT)
  } catch (err) {
    if (canMockWrite(err)) {
      mockWithdrawRequirement(id)
      return
    }
    throw err
  }
}

/** 提交验收结果 */
export async function submitAcceptance(id: number, form: RdmAcceptanceForm) {
  try {
    return await request.post<unknown, void>(`/rdm/requirement/${id}/acceptance`, form, SILENT)
  } catch (err) {
    if (canMockWrite(err)) {
      mockTransition(id, form.result === RDM_ACCEPT_RESULT.FAIL ? RDM_ACTION.UAT_FAIL : RDM_ACTION.RELEASE, {
        acceptanceResult: form.result,
        acceptanceScore: form.score,
        status: form.result === RDM_ACCEPT_RESULT.FAIL ? RDM_STATUS.UAT_REJECTED : RDM_STATUS.RELEASED,
      })
      return
    }
    throw err
  }
}

/* ==================== 配置 ==================== */

/** 分发矩阵 */
export async function fetchRoutingRules(): Promise<RdmRoutingRow[]> {
  try {
    return await request.get<unknown, RdmRoutingRow[]>('/rdm/config/routing', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockRoutingRules()
    throw err
  }
}

/** 保存：POST /rdm/config/routing（id 为 null 时后端新增，否则按 id 更新） */
export async function saveRoutingRule(rowData: RdmRoutingSaveForm): Promise<RdmRoutingRow[]> {
  try {
    return await request.post<unknown, RdmRoutingRow[]>('/rdm/config/routing', rowData, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockSaveRoutingRule(rowData)
    throw err
  }
}

/**
 * 移除分发规则：DELETE /rdm/config/routing/{id}（服务端逻辑删）。
 * <p>必须有真接口：原先界面的「移除」只 filter 本地 state，刷新后规则又回来，
 * 而它仍然参与后端分发命中 —— 用户以为已下线，实际还在往那位产品经理派单。
 */
export async function deleteRoutingRule(id: number): Promise<RdmRoutingRow[]> {
  try {
    return await request.delete<unknown, RdmRoutingRow[]>(`/rdm/config/routing/${id}`, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockDeleteRoutingRule(id)
    throw err
  }
}

/** SLA 配置 */
export async function fetchSlaConfigs(): Promise<RdmSlaRow[]> {
  try {
    return await request.get<unknown, RdmSlaRow[]>('/rdm/config/sla', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockSlaConfigs()
    throw err
  }
}

/** 保存 SLA 行（新增/改值/启停） */
export async function saveSlaConfig(row: RdmSlaRow): Promise<RdmSlaRow[]> {
  try {
    return await request.put<unknown, RdmSlaRow[]>('/rdm/config/sla', row, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockSaveSla(row)
    throw err
  }
}

/** 启停流转规则（停用后详情页按钮立即消失） */
export async function setTransitionEnabled(id: number, enabled: boolean): Promise<RdmTransitionRow[]> {
  try {
    return await request.put<unknown, RdmTransitionRow[]>(`/rdm/config/transition/${id}/enabled?enabled=${enabled}`, {}, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockSetTransitionEnabled(id, enabled)
    throw err
  }
}

/** 启停状态定义（服务端会校验是否仍有需求停在該状态） */
export async function setStatusEnabled(code: string, enabled: boolean): Promise<RdmStatusDefRow[]> {
  try {
    return await request.put<unknown, RdmStatusDefRow[]>(`/rdm/config/status/${code}/enabled?enabled=${enabled}`, {}, SILENT)
  } catch (err) {
    if (canMockWrite(err)) return mockSetStatusEnabled(code, enabled)
    throw err
  }
}

/** 状态定义 */
export async function fetchStatusDefs(): Promise<RdmStatusDefRow[]> {
  try {
    return await request.get<unknown, RdmStatusDefRow[]>('/rdm/config/status', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockStatusDefs()
    throw err
  }
}

/** 流转规则 */
export async function fetchTransitions(): Promise<RdmTransitionRow[]> {
  try {
    return await request.get<unknown, RdmTransitionRow[]>('/rdm/config/transition', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockTransitions()
    throw err
  }
}

/** 附件上传结果（后端返回 Base64 Data URL，与 EAM 验收照片同一口径） */
export interface RdmUploadResult {
  name: string
  fileType: string
  fileSize: number
  dataUrl: string
}

/** 本地读数（后端不可用时的降级：原型仍可上传预览） */
function readFileLocally(file: File): Promise<RdmUploadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      name: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      dataUrl: String(reader.result ?? ''),
    })
    reader.onerror = () => reject(new Error('本地讀取失敗'))
    reader.readAsDataURL(file)
  })
}

/**
 * 附件/截图上传。
 * <p>单文件 5MB 上限与后端一致，先在前端拦住避免白跑一趟请求。
 */
export async function uploadAttachment(file: File): Promise<RdmUploadResult> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('文件大小不能超過 5MB')
  }
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await request.post<unknown, { name: string; fileType?: string; fileSize?: string; dataUrl: string }>(
      '/rdm/file/upload', fd,
    )
    return {
      name: res.name,
      fileType: res.fileType ?? file.type,
      fileSize: Number(res.fileSize ?? file.size) || file.size,
      dataUrl: res.dataUrl,
    }
  } catch (err) {
    // 真实上传失败不能回退成本地 Base64 并提示成功：那会让需求带上一个服务端根本不存在的主图
    if (canMockWrite(err)) return readFileLocally(file)
    throw err
  }
}

/* ==================== M2 交付过程（PRD / 评审 / 任务工时 / 迭代 / 变更） ==================== */

/** PRD（L2 产品需求） */
export interface RdmPrdItem {
  id: number
  prdNo: string
  reqId: number
  parentPrdId?: number | null
  title: string
  targetUsers?: string | null
  featureList?: string | null
  acceptanceCriteria?: string | null
  contentRich?: string | null
  prototypeUrl?: string | null
  status: string
  versionNo?: string | null
  authorName?: string | null
  reviewTime?: string | null
  reviewConclusion?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** 评审记录 */
export interface RdmReviewItem {
  id: number
  reviewNo: string
  reqId: number
  prdId?: number | null
  prdTitle?: string | null
  reviewType: string
  reviewTime?: string | null
  participants?: string | null
  participantIdList?: number[]
  conclusion: string
  conclusionDesc?: string | null
  affectsSchedule?: boolean
  createdBy?: string | null
  createdAt?: string | null
}

/** 执行任务 */
export interface RdmTaskItem {
  id: number
  taskNo: string
  reqId: number
  reqNo?: string | null
  reqTitle?: string | null
  reqStatus?: string | null
  prdId?: number | null
  /** V3：关联的交付项 ID */
  deliveryItemId?: number | null
  /** V3：关联的交付项标题（冗余，列表展示用） */
  deliveryItemTitle?: string | null
  taskType: string
  title: string
  content?: string | null
  ownerUserId?: number | null
  ownerName?: string | null
  ownerEmpNo?: string | null
  roleCode?: string | null
  status: string
  progress?: number | null
  planHours?: number | null
  actualHours?: number | null
  /** 实际工时是否已填报（缺报不等于 0） */
  actualHoursReported?: boolean | null
  planStartDate?: string | null
  planFinishDate?: string | null
  actualStartTime?: string | null
  actualFinishTime?: string | null
  blockedReason?: string | null
  iterationCode?: string | null
  overdue?: boolean
  createdAt?: string | null
}

/** 迭代 */
export interface RdmIterationItem {
  id: number
  code: string
  name: string
  /** 所属项目ID（sprint/version 必填，hotfix 可空；存量未补挂时为 null） */
  projectId?: number | null
  /** 所属项目名称（列表展示用，后端联表 rdm_project 取） */
  projectName?: string | null
  iterationType?: string
  startDate?: string
  endDate?: string
  capacityHours?: number
  ownerUserId?: number | null
  ownerName?: string | null
  status?: string
  remark?: string | null
  reqCount?: number
  taskCount?: number
  taskHours?: number
}

/** 需求变更 */
export interface RdmChangeItem {
  id: number
  changeNo: string
  reqId: number
  prdId?: number | null
  changeType: string
  afterContent: string
  reason: string
  impactDesc?: string | null
  affectsSchedule?: boolean
  addedHours?: number | null
  flowNo?: string | null
  approvalStatus: string
  applicantName?: string | null
  applyTime?: string | null
  decideTime?: string | null
  decideRemark?: string | null
}

/** 需求交付概览（PRD + 任务 + 评审 + 变更 + 工时汇总） */
export interface RdmDeliverySummary {
  reqId: number
  status: string
  prds: RdmPrdItem[]
  tasks: RdmTaskItem[]
  reviews: RdmReviewItem[]
  changes: RdmChangeItem[]
  /** 五节点计划（阶段 3） */
  milestones?: RdmMilestoneItem[]
  taskTotal?: number
  taskDone?: number
  taskBlocked?: number
  overallProgress?: number
  planHoursTotal?: number
  actualHoursTotal?: number
  /** 已完成但未填报工时的任务数（缺报不默认为 0） */
  unreportedHoursTasks?: number
  hoursByType?: { name: string; value: number }[]
}

/** 里程碑节点（初步计划/已批准基线/当前预测/实际） */
export interface RdmMilestoneItem {
  id?: number
  code: string
  name: string
  ownerUserId?: number | null
  ownerName?: string | null
  preliminaryDate?: string | null
  baselineDate?: string | null
  forecastDate?: string | null
  actualDate?: string | null
  status?: string
  naReason?: string | null
  sortOrder?: number
  /** 相对基线的偏差天数（正数=晚于基线） */
  slipDays?: number | null
  /** 基线已冻结：初步计划不可再改，只能改预测 */
  baselineLocked?: boolean
}

/** 里程碑节点表单行 */
export interface RdmMilestoneForm {
  code: string
  name?: string
  ownerUserId?: number | null
  preliminaryDate?: string
  forecastDate?: string
  status?: string
  naReason?: string
}

/** 工时明细行 */
export interface RdmWorkLogItem {
  id: number
  taskId: number
  userId: number
  userName?: string | null
  workDate: string
  hours: number
  remark?: string | null
  updatedBy?: string | null
}

/** PRD 定稿快照 */
export interface RdmPrdSnapshotItem {
  id: number
  prdId: number
  versionNo: string
  title?: string | null
  conclusion?: string | null
  conclusionDesc?: string | null
  reviewerNames?: string | null
  snapshotTime?: string | null
}

/** PRD 表单 */
export interface RdmPrdForm {
  id?: number
  reqId?: number
  parentPrdId?: number | null
  title: string
  targetUsers?: string
  featureList?: string
  acceptanceCriteria?: string
  contentRich?: string
  prototypeUrl?: string
  advanceRequirement?: boolean
  /** 已定稿的 PRD 只能以此方式修改（开新版本） */
  newVersion?: boolean
  /** 版本变更原因（newVersion 时必填） */
  changeReason?: string
}

/** 任务表单 */
export interface RdmTaskForm {
  id?: number
  reqId: number
  prdId?: number | null
  taskType: string
  title: string
  content?: string
  ownerUserId?: number
  planHours?: number
  planStartDate?: string
  planFinishDate?: string
  iterationCode?: string
}

/** 评审发起表单 */
export interface RdmReviewForm {
  reqId: number
  prdId?: number | null
  reviewType: string
  reviewTime?: string
  participantIds?: number[]
  conclusionDesc?: string
}

/** 变更申请表单 */
export interface RdmChangeForm {
  reqId: number
  prdId?: number | null
  changeType: string
  afterContent: string
  reason: string
  impactDesc?: string
  affectsSchedule?: boolean
  addedHours?: number
  newPlanReleaseDate?: string
}

/** 需求交付概览 */
export async function fetchDeliverySummary(reqId: number): Promise<RdmDeliverySummary | null> {
  try {
    return await request.get<unknown, RdmDeliverySummary>(`/rdm/delivery/requirement/${reqId}/summary`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/**
 * 以下列表接口在后端不可用时统一返回空数组：
 * M2 交付数据（PRD/任务/评审）没有合理的前端假数据可编，空态比假数据诚实。
 */
export async function fetchMyTasks(status?: string): Promise<RdmTaskItem[]> {
  try {
    return await request.get<unknown, RdmTaskItem[]>('/rdm/delivery/tasks/mine', { params: { status }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 需求下任务列表 */
export async function fetchReqTasks(reqId: number): Promise<RdmTaskItem[]> {
  try {
    return await request.get<unknown, RdmTaskItem[]>(`/rdm/delivery/requirement/${reqId}/tasks`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 迭代列表 */
export async function fetchIterations(): Promise<RdmIterationItem[]> {
  try {
    return await request.get<unknown, RdmIterationItem[]>('/rdm/delivery/iterations', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 保存任务 */
export function saveTask(form: RdmTaskForm) {
  return request.post<unknown, RdmTaskItem>('/rdm/delivery/task', form)
}

/** 任务负责人资格预检结果 */
export interface RdmTaskOwnerCheck {
  /** 负责人能否正常干活（在职启用且有研发交付权限） */
  able: boolean
  /** 是否会被保存硬拦下（离职/停用）；false = 只提醒不阻断 */
  hardBlocked?: boolean
  ownerName?: string | null
  /** 负责人所在部门（表单「所屬部門」自动带出用） */
  department?: string | null
  /** 提醒文案（null/undefined = 无需提醒） */
  warning?: string | null
}

/**
 * 预检任务负责人：选完人立刻告诉他「这人没交付权限」，
 * 但不再因此拦住保存（先排期、后补权限）。
 */
export async function checkTaskOwner(userId: number): Promise<RdmTaskOwnerCheck> {
  try {
    return await request.get<unknown, RdmTaskOwnerCheck>('/rdm/delivery/task/owner-check', { params: { userId }, ...SILENT })
  } catch (err) {
    // 后端不可用时降级为「不提醒」，不能因为预检失败就派不了活
    if (isBackendUnavailable(err)) return { able: true }
    throw err
  }
}

/** 上报任务进度与工时 */
export function reportTask(id: number, payload: { action: string; progress?: number; actualHours?: number; remark?: string }) {
  return request.post<unknown, RdmTaskItem>(`/rdm/delivery/task/${id}/progress`, payload)
}

/** 删除任务 */
export function deleteTask(id: number) {
  return request.delete<unknown, void>(`/rdm/delivery/task/${id}`)
}

/* ── 阶段 3：里程碑与定稿快照 ── */

/** 五节点计划 */
export async function fetchMilestones(reqId: number): Promise<RdmMilestoneItem[]> {
  try {
    return await request.get<unknown, RdmMilestoneItem[]>(`/rdm/delivery/requirement/${reqId}/milestones`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 保存节点计划（已冻结基线后只能改预测） */
export function saveMilestones(reqId: number, list: RdmMilestoneForm[]) {
  return request.put<unknown, RdmMilestoneItem[]>(`/rdm/delivery/requirement/${reqId}/milestones`, list)
}

/** 冻结基线 */
export function freezeMilestones(reqId: number) {
  return request.post<unknown, RdmMilestoneItem[]>(`/rdm/delivery/requirement/${reqId}/milestones/freeze`, {})
}

/** PRD 定稿快照（版本链） */
export async function fetchPrdSnapshots(prdId: number): Promise<RdmPrdSnapshotItem[]> {
  try {
    return await request.get<unknown, RdmPrdSnapshotItem[]>(`/rdm/delivery/prd/${prdId}/snapshots`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 填报工时明细（服务端仅允许任务负责人本人，同日多次会累加） */
export function saveWorkLogs(taskId: number, logs: { workDate: string; hours: number; remark?: string }[]) {
  return request.post<unknown, RdmWorkLogItem[]>(`/rdm/delivery/task/${taskId}/work-logs`, logs)
}

/* ── 阶段 4：发布放行（上线前质量闸门） ── */

/** 单项检查结果 */
export interface RdmReleaseCheck {
  code: string
  label: string
  /** 是否阻断上线 */
  blocking?: boolean | null
  passed?: boolean | null
  /** 已被豁免（必须留理由） */
  waived?: boolean | null
  /** 旧流程（V1）跳过，不参与新口径考核 */
  skipped?: boolean | null
  reason?: string | null
}

/** 放行单（含检查项快照） */
export interface RdmReleaseGate {
  id?: number
  releaseNo?: string
  reqId: number
  roundNo?: number
  env?: string
  versionNo?: string | null
  planTime?: string | null
  status?: string
  blockingCount?: number
  releasable?: boolean
  summary?: string | null
  applicantName?: string | null
  applyTime?: string | null
  gateName?: string | null
  decideTime?: string | null
  expireAt?: string | null
  expired?: boolean
  checks?: RdmReleaseCheck[]
}

/** 放行单表单 */
export interface RdmReleaseForm {
  env?: string
  versionNo?: string
  planTime?: string
  waivedCodes?: string[]
  waiveReason?: string
}

/** 检查项实时预览（不落库） */
export async function fetchReleaseCheck(reqId: number): Promise<RdmReleaseGate | null> {
  try {
    return await request.get<unknown, RdmReleaseGate>(`/rdm/release/requirement/${reqId}/check`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 放行单历史 */
export async function fetchReleases(reqId: number): Promise<RdmReleaseGate[]> {
  try {
    return await request.get<unknown, RdmReleaseGate[]>(`/rdm/release/requirement/${reqId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 发起放行单 */
export function applyRelease(reqId: number, form: RdmReleaseForm) {
  return request.post<unknown, RdmReleaseGate>(`/rdm/release/requirement/${reqId}/apply`, form)
}

/** 放行 / 驳回 */
export function decideRelease(id: number, form: { passed: boolean; summary?: string }) {
  return request.post<unknown, RdmReleaseGate>(`/rdm/release/${id}/decide`, form)
}

/* ── 阶段 5：依赖、甘特与负载 ── */

/** 甘特条（一个任务） */
export interface RdmScheduleBar {
  taskId: number
  taskNo?: string | null
  title: string
  taskType?: string | null
  status?: string | null
  progress?: number | null
  ownerUserId?: number | null
  ownerName?: string | null
  ownerMissing?: boolean | null
  planHours?: number | null
  actualHours?: number | null
  planStartDate?: string | null
  planFinishDate?: string | null
  earliestStart?: string | null
  earliestFinish?: string | null
  latestStart?: string | null
  latestFinish?: string | null
  slackDays?: number | null
  critical?: boolean | null
  durationDays?: number | null
  actualStartTime?: string | null
  actualFinishTime?: string | null
  overdue?: boolean | null
  predecessors?: number[]
}

/** 需求排程（甘特数据源） */
export interface RdmSchedulePlan {
  reqId: number
  reqNo?: string | null
  title?: string | null
  status?: string | null
  windowStart?: string | null
  windowEnd?: string | null
  workingDays?: number | null
  /** 历史脏数据成环：不给关键路径结论 */
  cyclic?: boolean | null
  criticalPath?: number[]
  forecastFinish?: string | null
  bars: RdmScheduleBar[]
  links: { id: number; predTaskId: number; succTaskId: number; depType?: string | null; lagDays?: number | null }[]
  milestones?: RdmScheduleMilestone[]
}

/** 里程碑菱形（与阶段 3 节点同一口径） */
export interface RdmScheduleMilestone {
  code: string
  name?: string | null
  ownerName?: string | null
  preliminaryDate?: string | null
  baselineDate?: string | null
  forecastDate?: string | null
  actualDate?: string | null
  status?: string | null
  slipDays?: number | null
}

/** 依赖行 */
export interface RdmScheduleDependency {
  id: number
  reqId: number
  predTaskId: number
  predTaskTitle?: string | null
  succTaskId: number
  succTaskTitle?: string | null
  depType?: string | null
  lagDays?: number | null
  createdBy?: string | null
}

/** 单日负载 */
export interface RdmWorkloadDay {
  day: string
  capacity?: number | null
  planned?: number | null
  actual?: number | null
  leave?: boolean | null
  weekend?: boolean | null
  overloaded?: boolean | null
}

/** 一人负载 */
export interface RdmWorkloadPerson {
  userId: number
  userName?: string | null
  empNo?: string | null
  totalCapacity?: number | null
  totalPlanned?: number | null
  totalActual?: number | null
  utilization?: number | null
  overloadedDays?: number | null
  reqCount?: number | null
  days: RdmWorkloadDay[]
}

/** 资源负载 */
export interface RdmWorkload {
  from: string
  to: string
  selfOnly?: boolean | null
  people: RdmWorkloadPerson[]
}

/** 工作日历条目 */
export interface RdmCalendarItem {
  id?: number
  userId: number
  userName?: string | null
  day: string
  dayType: string
  availableHours?: number | null
  reason?: string | null
}

/** 需求排程（甘特 + 关键路径） */
export async function fetchSchedulePlan(reqId: number): Promise<RdmSchedulePlan | null> {
  try {
    return await request.get<unknown, RdmSchedulePlan>(`/rdm/schedule/requirement/${reqId}/plan`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 需求下的依赖列表 */
export async function fetchDependencies(reqId: number): Promise<RdmScheduleDependency[]> {
  try {
    return await request.get<unknown, RdmScheduleDependency[]>(`/rdm/schedule/requirement/${reqId}/dependencies`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 新增依赖（成环会被服务端拒绝） */
export function addDependency(form: { reqId: number; predTaskId: number; succTaskId: number; lagDays?: number }) {
  return request.post<unknown, RdmScheduleDependency>('/rdm/schedule/dependencies', form)
}

/** 删除依赖 */
export function removeDependency(id: number) {
  return request.delete<unknown, void>(`/rdm/schedule/dependencies/${id}`)
}

/** 资源负载 */
export async function fetchWorkload(params?: { from?: string; to?: string; userId?: number }): Promise<RdmWorkload | null> {
  try {
    return await request.get<unknown, RdmWorkload>('/rdm/schedule/workload', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 某人的工作日历例外 */
export async function fetchCalendar(userId?: number): Promise<RdmCalendarItem[]> {
  try {
    return await request.get<unknown, RdmCalendarItem[]>('/rdm/schedule/calendar', { params: { userId }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 保存工作日历（请假/加班/自定义容量） */
export function saveCalendar(form: {
  userId?: number
  days?: { day: string; dayType: string; availableHours?: number; reason?: string }[]
  removeDays?: string[]
}) {
  return request.post<unknown, RdmCalendarItem[]>('/rdm/schedule/calendar', form)
}

/* ── 需求甘特图（阶段二：真实数据，对应后端 RdmScheduleVO.Gantt* / TaskPlan*）── */

/** 甘特图任务条（服务端裁决 canAdjust） */
export interface RdmGanttTask {
  id: number
  taskNo: string
  title: string
  taskType: string
  roleCode: string
  ownerUserId: number | null
  ownerName: string | null
  ownerEmpNo: string | null
  planStartDate: string | null
  planFinishDate: string | null
  status: string
  progress: number
  overdue: boolean
  planVersion: number
  canAdjust: boolean
  readOnlyReason?: string | null
}

/** 甘特图需求分组 */
export interface RdmGanttRequirement {
  id: number
  reqNo: string | null
  title: string
  status: string
  projectName?: string | null
  iterationName?: string | null
  spanStart: string | null
  spanEnd: string | null
  tasks: RdmGanttTask[]
  unscheduledRoles: string[]
}

/** 甘特图分页结果 */
export interface RdmGanttPage {
  mode: string
  total: number
  loaded: number
  requirements: RdmGanttRequirement[]
}

/** 甘特图查询条件（三视角 + 筛选 + 分页） */
export interface RdmGanttQuery {
  mode: 'personal' | 'single' | 'global'
  reqId?: number
  page?: number
  size?: number
  keyword?: string
  projectId?: number
  iterationCode?: string
  ownerUserId?: number
  taskType?: string
  status?: string
  onlyOverdue?: boolean
  onlyUnscheduled?: boolean
  onlyMine?: boolean
}

/** 拉取需求甘特图（全局视角由服务端 canSeeAll 裁决，无权会报错而非降级） */
export function fetchRdmGantt(params: RdmGanttQuery): Promise<RdmGanttPage> {
  return request.get<unknown, RdmGanttPage>('/rdm/schedule/gantt', { params })
}

/** 调期单项（携带期望版本做乐观锁） */
export interface RdmTaskPlanItem {
  taskId: number
  expectedPlanVersion: number
  planStartDate: string
  planFinishDate: string
}

/** 调期批量结果 */
export interface RdmTaskPlanResult {
  updated: number
  tasks: RdmGanttTask[]
}

/** 保存甘特图调期（整批原子 + 幂等 + 审计） */
export function saveRdmTaskPlans(clientRequestId: string, items: RdmTaskPlanItem[]): Promise<RdmTaskPlanResult> {
  return request.post<unknown, RdmTaskPlanResult>('/rdm/schedule/task-plans', { clientRequestId, items })
}

/* ── 团队负载（阶段 B-1：跨岗位统一只读负载聚合，对应后端 RdmResourceVO）── */

/** 负载状态（与后端 RdmResourceVO.LOAD_* 同源） */
export type RdmLoadStatus = 'available' | 'normal' | 'near_full' | 'overloaded' | 'data_incomplete'

/** 岗位角色（与后端 RdmResourceVO.ROLE_* 同源） */
export type RdmResourceRole = 'pm' | 'product' | 'dev' | 'designer' | 'qa' | 'ops' | 'pmo'

/** 单日负载 */
export interface RdmResourceDay {
  day: string
  capacity?: number | null
  planned?: number | null
  actual?: number | null
  leave?: boolean | null
  weekend?: boolean | null
  overloaded?: boolean | null
}

/** 一个人的跨岗位负载 */
export interface RdmResourcePerson {
  userId: number
  userName?: string | null
  empNo?: string | null
  dept?: string | null
  roles: RdmResourceRole[]
  /** 各岗位在途件数 */
  productReqs?: number | null
  devTasks?: number | null
  designTasks?: number | null
  testTasks?: number | null
  testBatches?: number | null
  coordItems?: number | null
  /** 工时口径 */
  totalCapacity?: number | null
  totalPlanned?: number | null
  totalActual?: number | null
  loadRate?: number | null
  overloadedDays?: number | null
  /** 数据完整性 */
  loadStatus: RdmLoadStatus
  hasOverdue?: boolean | null
  hasBlocked?: boolean | null
  dataIncompleteReason?: string | null
  days: RdmResourceDay[]
}

/** 统计卡（跟随筛选口径，服务端聚合） */
export interface RdmResourceSummary {
  total?: number | null
  available?: number | null
  overloaded?: number | null
  dataIncomplete?: number | null
}

/** 团队负载总览 */
export interface RdmResourceWorkload {
  from: string
  to: string
  selfOnly?: boolean | null
  people: RdmResourcePerson[]
  summary: RdmResourceSummary
}

/** 团队负载（默认今天起 2 周，含首尾最长 92 天；无全量权时服务端收敛为本人） */
export async function fetchResourceWorkload(params?: { from?: string; to?: string }): Promise<RdmResourceWorkload | null> {
  try {
    return await request.get<unknown, RdmResourceWorkload>('/rdm/resource/workload', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 资源名册成员（对应后端 RdmResourceMember） */
export interface RdmResourceMember {
  id?: number
  userId: number
  empNo?: string | null
  userName?: string | null
  dept?: string | null
  /** 岗位角色 JSON 数组字符串：pm/product/dev/designer/qa/ops/pmo */
  roleCodes?: string | null
  weeklyCapacityHours?: number | null
  status?: number
  remark?: string | null
}

/** 名册列表（含已移出，status 区分；需 rdm-resource-load:manage） */
export async function fetchResourceMembers(): Promise<RdmResourceMember[]> {
  try {
    return await request.get<unknown, RdmResourceMember[]>('/rdm/resource/members', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 纳入/编辑名册成员（按 userId upsert；roleCodes 传数组，后端序列化） */
export function saveResourceMember(form: {
  userId: number
  roleCodes?: string[]
  weeklyCapacityHours?: number
  remark?: string
  status?: number
}) {
  return request.post<unknown, RdmResourceMember>('/rdm/resource/members', form)
}

/** 移出名册（status=0，不物理删） */
export function removeResourceMember(id: number) {
  return request.delete<unknown, void>(`/rdm/resource/members/${id}`)
}

/* ── 待分配工作（阶段 B-3.1：真实需求池/未指派任务/待接收批次，只读）── */

/** 待分配来源类型（与后端 RdmResourceVO.UnassignedItem.source 同源） */
export type RdmUnassignedSource = 'requirement' | 'dev_task' | 'design_task' | 'test_batch'

/** 一条待分配单据（对应后端 UnassignedItem） */
export interface RdmUnassignedItem {
  source: RdmUnassignedSource
  itemId: number
  code?: string | null
  title?: string | null
  reqTitle?: string | null
  planHours?: number | null
  currentOwner?: string | null
  /** 排期乐观锁版本（任务回带，分派写回时回传做并发保护） */
  planVersion?: number | null
}

/** 待分配工作聚合（后端按来源分组） */
export interface RdmUnassigned {
  canDispatch?: boolean
  requirements?: RdmUnassignedItem[]
  devTasks?: RdmUnassignedItem[]
  designTasks?: RdmUnassignedItem[]
  testBatches?: RdmUnassignedItem[]
}

/** 待分配工作真实聚合（需 rdm-resource-load:dispatch；后端无权收敛为空） */
export async function fetchResourceUnassigned(): Promise<RdmUnassigned> {
  try {
    return await request.get<unknown, RdmUnassigned>('/rdm/resource/unassigned', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { canDispatch: false, requirements: [], devTasks: [], designTasks: [], testBatches: [] }
    }
    throw err
  }
}

/** 任务指派写回请求体（对应后端 RdmResourceDTO.Assign） */
export interface RdmAssignRequest {
  source: 'dev_task' | 'design_task' | 'requirement' | 'test_batch'
  itemId: number
  assigneeUserId: number
  expectedPlanVersion?: number | null
  clientRequestId?: string
}

/**
 * 从负载页把研发/设计任务指派给某人（仅换负责人）。
 * <p>后端带乐观锁（expectedPlanVersion 不匹配回 1006 CONFLICT）+ 幂等（clientRequestId）。
 * 失败按普通错误抛出（含 CONFLICT），由调用方提示刷新重试。
 */
export function assignResource(form: RdmAssignRequest) {
  return request.post<unknown, unknown>('/rdm/resource/assign', form)
}

/* ── 阶段 6：指标字典、快照重算、预算与 HR 建议 ── */

/** 单条指标定义（口径唯一出处，后端 constant/RdmMetricCatalog） */
export interface RdmMetricDefinition {
  code: string
  name: string
  formula: string
  source: string
  /** 是否可按历史时间回算 */
  recomputeable: boolean
  caveat?: string | null
  group?: string | null
}

/** 贡献分预算（含实时占用） */
export interface RdmScoreBudgetItem {
  id?: number
  periodCode: string
  deptId?: number | null
  deptName?: string | null
  scoreBudget: number
  warningRatio?: number | null
  remark?: string | null
  used?: number | null
  usedRatio?: number | null
  warning?: boolean | null
  over?: boolean | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/** HR 绩效建议行 */
export interface RdmHrSuggestionItem {
  id: number
  periodCode: string
  userId: number
  empNo?: string | null
  userName?: string | null
  deptId?: number | null
  deptName?: string | null
  totalScore: number
  recordCount?: number | null
  deliveredCount?: number | null
  avgAcceptanceScore?: number | null
  firstPassCount?: number | null
  budgetUsedRatio?: number | null
  overBudget?: boolean | null
  ruleVersion?: number | null
  status: string
  reviewerName?: string | null
  reviewTime?: string | null
  reviewRemark?: string | null
  pushedAt?: string | null
  generatedAt?: string | null
  actionable?: boolean | null
  blockedReason?: string | null
}

/** 指标字典 */
export async function fetchMetricCatalog(): Promise<RdmMetricDefinition[]> {
  try {
    return await request.get<unknown, RdmMetricDefinition[]>('/rdm/analytics/metrics', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 重算快照（口径变更后刷历史） */
export function recomputeSnapshot(from: string, to: string) {
  return request.post<unknown, number>('/rdm/analytics/snapshot/recompute', null, { params: { from, to } })
}

/** 周期预算与占用 */
export async function fetchScoreBudgets(periodCode?: string): Promise<RdmScoreBudgetItem[]> {
  try {
    return await request.get<unknown, RdmScoreBudgetItem[]>('/rdm/governance/budgets', { params: { periodCode }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 保存预算 */
export function saveScoreBudget(form: Partial<RdmScoreBudgetItem>) {
  return request.post<unknown, RdmScoreBudgetItem>('/rdm/governance/budget', form)
}

/** 删除预算 */
export function deleteScoreBudget(id: number) {
  return request.delete<unknown, void>(`/rdm/governance/budget/${id}`)
}

/** HR 建议清单 */
export async function fetchHrSuggestions(params?: { periodCode?: string; status?: string; deptId?: number }): Promise<RdmHrSuggestionItem[]> {
  try {
    return await request.get<unknown, RdmHrSuggestionItem[]>('/rdm/governance/suggestions', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 从积分流水聚合建议 */
export function generateHrSuggestions(periodCode?: string) {
  return request.post<unknown, number>('/rdm/governance/suggestions/generate', null, { params: { periodCode } })
}

/** 复核建议（确认/驳回） */
export function reviewHrSuggestion(id: number, form: { confirmed: boolean; remark?: string }) {
  return request.post<unknown, RdmHrSuggestionItem>(`/rdm/governance/suggestions/${id}/review`, form)
}

/** 推送已确认的建议 */
export function pushHrSuggestions(periodCode?: string) {
  return request.post<unknown, number>('/rdm/governance/push', null, { params: { periodCode } })
}

/** 撤回已推送的建议 */
export function withdrawHrSuggestion(id: number, reason: string) {
  return request.post<unknown, RdmHrSuggestionItem>(`/rdm/governance/suggestions/${id}/withdraw`, null, { params: { reason } })
}

/** 保存 PRD */
export function savePrd(form: RdmPrdForm) {
  return request.post<unknown, RdmPrdItem>('/rdm/delivery/prd', form)
}

/** 发起评审 */
export function createReview(form: RdmReviewForm) {
  return request.post<unknown, RdmReviewItem>('/rdm/delivery/review', form)
}

/** 录入评审结论 */
export function decideReview(id: number, payload: { passed: boolean; conclusionDesc?: string; remark?: string }) {
  return request.post<unknown, RdmReviewItem>(`/rdm/delivery/review/${id}/decision`, payload)
}

/** 发起需求变更（走 OA 审批） */
export function applyChange(form: RdmChangeForm) {
  return request.post<unknown, RdmChangeItem>('/rdm/delivery/change', form)
}

/** 迭代表单 */
export interface RdmIterationForm {
  id?: number
  /** 迭代編碼：系統發號，前端不傳（編輯時後端保留原碼） */
  code?: string
  name: string
  /** 所属项目ID：sprint/version 必传，hotfix 可空（服务端二次校验） */
  projectId?: number | null
  iterationType?: string
  startDate: string
  endDate: string
  capacityHours?: number
  ownerUserId?: number
  status?: string
  remark?: string
}

/** 保存迭代（新增/编辑，产能与起止由项目经理/技术负责人维护） */
export function saveIteration(form: RdmIterationForm) {
  return request.post<unknown, RdmIterationItem>('/rdm/delivery/iteration', form)
}

/**
 * 列表直改迭代状态。
 * <p>只上送状态一个字段：整条记录回写（走 saveIteration）会把列表快照里的旧产能/旧起止
 * 一起盖回去，别人刚改完就被这次点击还原，所以后端单独开只更新状态的端点。
 */
export function updateIterationStatus(id: number, status: RdmIterationStatus) {
  return request.patch<unknown, void>(`/rdm/delivery/iteration/${id}/status`, { status })
}

/* ==================== M3：验收历史、质量口径、版本追溯、周报 ==================== */

/** 一条验收记录（含第几次验收，attempt>1 即为返工） */
export interface RdmAcceptanceRecord {
  id: number
  acceptNo: string
  reqId: number
  attempt: number
  acceptorName?: string | null
  testEnv?: string | null
  result: string
  /** 验收阶段：pre_release 上线前预验收 / post_release 上线后业务验收 */
  stage?: string | null
  score?: number | null
  caseTotal?: number | null
  casePass?: number | null
  defectCount?: number | null
  issues?: string | null
  opinion?: string | null
  acceptTime?: string | null
  followUpReqNo?: string | null
  cases?: RdmAcceptanceCase[]
}

/** 质量口径（验收一次通过率/返工/缺陷/满意度） */
export interface RdmQualityData {
  summary: {
    acceptedTotal: number
    firstPassRate: number
    avgScore: number
    reworkTotal: number
    defectTotal: number
    majorDefectCount: number
    followUpTotal: number
    conditionalTotal: number
  }
  scoreDist: { name: string; value: number }[]
  defectBySeverity: { name: string; value: number }[]
  reworkRank: {
    reqId: number
    reqNo: string
    title: string
    reworkCount: number
    pmName?: string | null
    submitDeptName?: string | null
    lastRejectReason?: string | null
  }[]
  deptQuality: { deptName: string; accepted: number; firstPassRate: number; avgScore: number; defectCount: number }[]
}

/** 版本追溯（双向：版本→需求 / 需求→版本） */
export interface RdmVersionTrace {
  versionNo?: string | null
  releaseDate?: string | null
  releaseType?: string | null
  summary?: string | null
  commitHash?: string | null
  requirements: {
    reqId: number
    reqNo: string
    title: string
    status: string
    reqType?: string | null
    priority?: string | null
    submitDeptName?: string | null
    submitterName?: string | null
    pmName?: string | null
    planReleaseDate?: string | null
    actualReleaseDate?: string | null
    acceptanceResult?: string | null
    acceptanceScore?: number | null
    reworkCount?: number | null
  }[]
  stats: { total: number; released: number; acceptancePass: number; avgScore: number }
}

/** 周报 */
export interface RdmWeeklyReport {
  range: { startDate: string; endDate: string; label: string }
  summary: {
    submitted: number
    accepted: number
    scheduled: number
    released: number
    overdue: number
    blocked: number
    changes: number
    rework: number
    acceptancePass: number
    firstPassRate: number
    avgDeliveryDays: number
    onTimeRate: number
  }
  byDept: { deptName: string; submitted: number; delivered: number; overdue: number; avgDays: number }[]
  byPm: { pmName: string; active: number; delivered: number; overdue: number }[]
  released: { reqId: number; reqNo: string; title: string; versionNo?: string | null; pmName?: string | null; actualReleaseDate?: string | null; acceptanceScore?: number | null }[]
  /*
   * 风险行的 reqNo 可空：INTAKE_STUCK 是准入前需求，还没有正式编号（延迟发号）。
   * released/nextWeek 只会是准入后需求，保持非空。
   */
  risks: { reqId: number; reqNo: string | null; title: string; status: string; handler?: string | null; days: number; riskType: string }[]
  nextWeek: { reqId: number; reqNo: string; title: string; planReleaseDate?: string | null; status: string }[]
}

/** 历次验收（返工链路） */
export async function fetchAcceptanceHistory(reqId: number): Promise<RdmAcceptanceRecord[]> {
  try {
    return await request.get<unknown, RdmAcceptanceRecord[]>(`/rdm/requirement/${reqId}/acceptance-history`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockAcceptanceHistory(reqId)
    throw err
  }
}

/** 单张验收证据正文（Data URL）：按需取，不随验收历史批量下发 */
export async function fetchAcceptanceEvidence(
  reqId: number, caseId: number, index: number,
): Promise<{ name?: string | null; type?: string | null; dataUrl: string }> {
  return request.get<unknown, { name?: string | null; type?: string | null; dataUrl: string }>(
    `/rdm/requirement/${reqId}/acceptance/case/${caseId}/evidence/${index}`, SILENT,
  )
}

/** 质量口径看板 */
export async function fetchQualityData(): Promise<RdmQualityData> {
  try {
    return await request.get<unknown, RdmQualityData>('/rdm/analytics/quality', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockQualityData()
    throw err
  }
}

/** 版本 → 需求 */
export async function fetchVersionTrace(versionNo: string): Promise<RdmVersionTrace> {
  try {
    return await request.get<unknown, RdmVersionTrace>('/rdm/analytics/version-trace', { params: { versionNo }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockVersionTrace(versionNo)
    throw err
  }
}

/** 需求 → 版本 */
export async function fetchRequirementTrace(reqId: number): Promise<RdmVersionTrace> {
  try {
    return await request.get<unknown, RdmVersionTrace>(`/rdm/analytics/version-trace/requirement/${reqId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockRequirementTrace(reqId)
    throw err
  }
}

/** 周报 */
export async function fetchWeeklyReport(params: { startDate?: string; endDate?: string; iterationCode?: string }): Promise<RdmWeeklyReport> {
  try {
    return await request.get<unknown, RdmWeeklyReport>('/rdm/analytics/weekly-report', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockWeeklyReport(params)
    throw err
  }
}

/* ==================== M4：产出积分与绩效对接 ==================== */

/** 积分规则（带版本与生效日期，历史流水按当期版本冻结，避免“规则一改历史全变”） */
export interface RdmScoreRule {
  id: number
  ruleCode: string
  /** 适用需求类型（空=全部） */
  reqType?: string | null
  /** 适用角色（空=全部） */
  roleCode?: string | null
  complexityWeight?: number | null
  typeFactor?: number | null
  priorityBonus?: number | null
  onTimeBonus?: number | null
  latePenalty?: number | null
  firstPassBonus?: number | null
  reworkPenalty?: number | null
  acceptanceFactor?: number | null
  roleFactor?: number | null
  unitScore?: number | null
  /** 分配模式 each/split */
  allocMode?: string | null
  version: number
  effectiveFrom?: string | null
  enabled: boolean
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/**
 * 单条需求的积分明细
 *
 * 直接用引擎的输出类型作单一真值源：自己再定义一份会导致 mock、页面、后端三方字段漂移。
 */
export type RdmScoreBreakdown = ScoreBreakdownResult

/** 积分流水 */
export interface RdmScoreRecord {
  id: number
  reqId: number
  reqNo: string
  reqTitle: string
  userId: number
  userName: string
  empNo?: string | null
  deptName?: string | null
  roleCode: string
  reqType?: string | null
  priority?: string | null
  complexity?: string | null
  periodCode?: string | null
  score: number
  breakdown?: RdmScoreBreakdown | null
  /** 命中的规则版本（追溯用） */
  ruleVersion?: number | null
  /** 是否按时上线 */
  onTime?: boolean | null
  reworkCount?: number | null
  acceptanceScore?: number | null
  pushStatus?: string | null
  pushedAt?: string | null
  calculatedAt?: string | null
}

/** 个人产出汇总 */
export interface RdmPersonalScore {
  userId: number
  userName: string
  empNo: string
  deptName?: string | null
  periodCode?: string | null
  totalScore: number
  reqCount: number
  deliveredCount: number
  onTimeRate: number
  firstPassRate: number
  avgAcceptanceScore: number
  reworkCount: number
  pushStatus?: string | null
}

/** 产出看板数据 */
export interface RdmScoreBoardData {
  period: { code: string; name: string; startDate?: string | null; endDate?: string | null }
  /** 当前生效规则版本与口径（页面顶部必须标清楚） */
  ruleVersion: number
  ruleEffectiveFrom?: string | null
  allocMode: string
  summary: {
    personCount: number
    totalScore: number
    avgScore: number
    deliveredCount: number
    onTimeRate: number
    firstPassRate: number
    reworkTotal: number
    pushedCount: number
  }
  ranking: RdmPersonalScore[]
  deptRank: { deptName: string; totalScore: number; personCount: number; avgScore: number; onTimeRate: number }[]
  records: RdmScoreRecord[]
  /** 可选绩效周期（来自 hr_perf_cycle） */
  cycles: { code: string; name: string; startDate?: string | null; endDate?: string | null; status?: string | null }[]
}

/** 效能量快照点（日快照表取数，不实时重算） */
export interface RdmMetricPoint {
  statDate: string
  dimId?: number | null
  dimName?: string | null
  reqTotal: number
  submitted: number
  accepted: number
  released: number
  overdue: number
  avgResponseHours: number
  avgDeliveryDays: number
  onTimeRate: number
  rejectRate: number
  firstPassRate: number
  reworkCount: number
  changeCount: number
}

/** 试算请求体 */
export interface RdmScorePreviewRequest {
  reqId: number
  roleCode: string
  userId?: number
  rule?: Partial<RdmScoreRule>
}

/** 产出看板 */
export async function fetchScoreBoard(params: { periodCode?: string; deptId?: number; userId?: number }): Promise<RdmScoreBoardData> {
  try {
    return await request.get<unknown, RdmScoreBoardData>('/rdm/score/board', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockScoreBoard(params)
    throw err
  }
}

/** 积分规则列表 */
export async function fetchScoreRules(): Promise<RdmScoreRule[]> {
  try {
    return await request.get<unknown, RdmScoreRule[]>('/rdm/score/rules', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockScoreRules()
    throw err
  }
}

/** 保存积分规则（新增即升版本，不复用旧版本） */
export function saveScoreRule(rule: Partial<RdmScoreRule>) {
  return request.post<unknown, RdmScoreRule>('/rdm/score/rule', rule)
}

/** 启用/停用规则 */
export function setScoreRuleEnabled(id: number, enabled: boolean) {
  return request.post<unknown, RdmScoreRule[]>(`/rdm/score/rule/${id}/enabled`, null, { params: { enabled } })
}

/** 试算：看一条需求在某角色下怎么算出这个分 */
export async function previewScore(body: RdmScorePreviewRequest): Promise<RdmScoreRecord | null> {
  try {
    return await request.post<unknown, RdmScoreRecord>('/rdm/score/preview', body, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockPreviewScore(body)
    throw err
  }
}

/** 重算当期积分（规则调版后手动触发，不自动刷历史） */
export function recalcScore(periodCode?: string) {
  return request.post<unknown, number>('/rdm/score/recalc', null, { params: { periodCode } })
}

/** 推送建议值到绩效周期（不直接入考核单，HR 仍要校准） */
export function pushScoreToPerf(periodCode: string) {
  return request.post<unknown, number>('/rdm/score/push-to-perf', null, { params: { periodCode } })
}

/** 效能量趋势（日快照） */
export async function fetchMetricTrend(params: {
  dim?: string
  days?: number
  startDate?: string
  endDate?: string
  dimId?: number
}): Promise<RdmMetricPoint[]> {
  try {
    return await request.get<unknown, RdmMetricPoint[]>('/rdm/score/metric-trend', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockMetricTrend(params.days ?? 30)
    throw err
  }
}

/* ==================== M4+：AI 辅助（查重 / PRD 草稿 / 风险摘要） ==================== */

/** 相似需求候选项 */
export interface RdmSimilarItem {
  reqId: number
  /**
   * 可空：查重候选包含他人正在审批的需求，那些行还没有正式编号。
   * 展示必须走 `formatRdmReqNo`，不能直接拼进模板串。
   */
  reqNo: string | null
  title: string
  status: string
  reqType?: string | null
  priority?: string | null
  submitterName?: string | null
  submitDeptName?: string | null
  pmName?: string | null
  submitTime?: string | null
  /** 相似度 0~1 */
  similarity?: number | null
  /** 命中的关键词（让分数可解释） */
  matchedTerms?: string[]
  sameSubmitter?: boolean | null
  inProgress?: boolean | null
}

/** 查重结果 */
export interface RdmSimilarResult {
  queryTitle?: string | null
  items: RdmSimilarItem[]
  /** 在途且高度相似 → 建议先评论追加或跟催，而不是新建 */
  duplicateSuspect?: boolean | null
  method?: string | null
}

/** PRD 草稿（AI 生成，必须人工确认后才保存） */
export interface RdmPrdDraft {
  reqId?: number | null
  title?: string | null
  targetUsers?: string | null
  featureList?: string[]
  acceptanceCriteria?: string[]
  boundary?: string | null
  risks?: string | null
  /** false 表示本次没拿到 AI 结果（额度/熔断/解析失败），notice 里有原因 */
  aiGenerated?: boolean | null
  model?: string | null
  tokens?: number | null
  notice?: string | null
}

/** 风险摘要 */
export interface RdmRiskSummary {
  days?: number | null
  narrative?: string | null
  /** 区分“AI 写的”与“模板拼的”，不能让用户误以为都是模型产物 */
  aiUsed?: boolean | null
  model?: string | null
  highlights?: string[]
  topRisks?: {
    reqId: number
    /** 可空：INTAKE_STUCK 行尚未准入，没有正式需求编号 */
    reqNo: string | null
    title: string
    status: string
    handler?: string | null
    days?: number | null
    riskType?: string | null
  }[]
  notice?: string | null
}

/**
 * 相似需求查重（确定性算法，不是大模型）。
 * <p>提单页防重复用；后端不可用时退化为本地候选（有 mock 数据才能演示）。
 */
export async function fetchSimilarRequirements(params: {
  title: string
  expectText?: string
  excludeId?: number
}): Promise<RdmSimilarResult> {
  try {
    return await request.get<unknown, RdmSimilarResult>('/rdm/assistant/similar', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockSimilarRequirements(params.title)
    throw err
  }
}

/** 生成 PRD 草稿（不落库，由产品经理确认后保存） */
export async function generatePrdDraft(reqId: number): Promise<RdmPrdDraft | null> {
  try {
    return await request.post<unknown, RdmPrdDraft>('/rdm/assistant/prd-draft', null, { params: { reqId } })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockPrdDraft(reqId)
    throw err
  }
}

/**
 * 逾期风险摘要（结构化要点 + 可选 AI 叙述）。
 * @param minStayDays 只看「当前状态停留 ≥ N 天」的风险需求；0 = 全部。
 *   旧参数名叫 days 但服务端从不用它筛选，“近 N 天”是假的窗口描述。
 */
export async function fetchRiskSummary(minStayDays = 0): Promise<RdmRiskSummary | null> {
  try {
    return await request.post<unknown, RdmRiskSummary>('/rdm/assistant/risk-summary', null, { params: { minStayDays } })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockRiskSummary(minStayDays)
    throw err
  }
}

/* ==================== V3 分批交付：项目 / 交付项 / 提测 / 问题 / 发布 / 验收 ==================== */

// ===== Project 项目 =====
/**
 * 项目状态标记：后端 VO/DTO 均为 Integer(TINYINT 0/1)，不是 boolean。
 * 写侧踩过坑：TS 宣告 boolean 就上送 `pausedFlag: true`，Jackson 无法把布尔塞进 Integer，
 * 直接 HttpMessageNotReadableException → 400「請求參數格式錯誤，請檢查數據類型後重試」。
 * 因此读写两侧都钉成 0|1，渲染处一律用 `=== 1` 判定（`flag && <Tag/>` 会把 0 渲染成字符）。
 */
export type RdmTriStateFlag = 0 | 1

export interface RdmProjectListItem {
  id: number; projectNo: string; name: string; objective: string;
  pmUserName: string; productOwnerUserName: string;
  planStartDate: string; planEndDate: string;
  status: string; pausedFlag: RdmTriStateFlag; riskFlag: RdmTriStateFlag; overdueFlag: RdmTriStateFlag;
  deliveredCount: number; totalDeliveryCount: number;
  /**
   * 三层进度（后端事实源直传，禁止前端另算）：范围内需求数 / 研发任务总数 / 已完成任务数。
   * <p>声明为可选是因为 RdmProjectDetail 继承本接口，而详情端点不返这三个字段。
   */
  requirementTotal?: number | null; taskTotal?: number | null; taskCompleted?: number | null;
  nextDeliveryDate: string | null; blockedCount: number; pendingDecisionCount: number;
  updatedAt: string;
  /** 最后更新人（后端 rdm:schema:v3.14 起有值；存量行为空，界面降级显示 -） */
  updatedBy?: string | null;
}

export interface RdmProjectDetail extends RdmProjectListItem {
  pmUserId: number | null; productOwnerUserId: number | null;
  /** 四组负责人（后端 rdm:schema:v3.7 起随列返回） */
  techLeadUserId: number | null; techLeadUserName: string | null;
  uiDesignerUserId: number | null; uiDesignerUserName: string | null;
  qaLeadUserId: number | null; qaLeadUserName: string | null;
  opsLeadUserId: number | null; opsLeadUserName: string | null;
  defaultAcceptancePath: string; scopeSummaryJson: string | null;
  version: number; createdAt: string;
  members: RdmProjectMemberItem[];
}

export interface RdmProjectMemberItem {
  id: number; userId: number; empNo: string; userName: string; roleCode: string; joinTime: string;
}

export interface RdmProjectSummary {
  projectId: number; projectName: string; status: string;
  totalItems: number; deliveredItems: number; testingItems: number;
  blockedItems: number; pendingItems: number; overdueItems: number;
  nextMilestone: string | null; lastUpdated: string;
}

export interface RdmProjectStatsCard {
  inProgressCount: number; attentionCount: number; pendingDecisionCount: number;
  /** Batch3/4：项目总数 */
  totalProjects?: number;
  /** Batch3/4：全部交付完成的项目数 */
  allDeliveredProjects?: number;
  /** Batch3/4：已关闭项目数 */
  closedProjects?: number;
  /** Batch3/4：延期残留（未承接/未关闭）计数 */
  deferResidualCount?: number;
  /** Batch3/4：待办总数 */
  todoTotal?: number;
  /** Batch3/4：待办-我负责 */
  todoMineCount?: number;
  /** Batch3/4：待办-等他人 */
  todoWaitingOthersCount?: number;
  /** Batch3/4：待办-未指派 */
  todoUnassignedCount?: number;
}

export interface RdmProjectPendingItem {
  type: string; refId: number; refNo: string; title: string;
  responsibleName: string; dueDate: string | null; actionUrl: string;
}

export interface RdmProjectDeliveryChecklist {
  reqId: number; reqTitle: string; reqNo: string;
  items: RdmChecklistItem[];
}

export interface RdmChecklistItem {
  itemId: number; itemNo: string; title: string; coordinatorName: string;
  status: string; planEndDate: string; testStatus: string;
  acceptanceStatus: string; blockedReason: string | null;
}

export interface RdmProjectQuery {
  keyword?: string; pmUserId?: number; status?: string;
  pageNo?: number; pageSize?: number;
  /**
   * 统计卡下钻口径（inProgress / attention / pending），由服务端按与卡片同一批事实位过滤。
   * <p>码值必须与后端 RdmProjectFactService.DRILL_* 逐字一致；未知值服务端直接拒。
   * <p>只给列表接口；统计卡与导出带上了反而会把卡片口径筛成自己筛出的数。
   */
  drill?: string;
  /** 产品负责人筛选（后端 RdmProjectDTO.Query 已支持，与列表/统计卡/导出同一组 filters） */
  productOwnerUserId?: number;
  /**
   * 计划日期区间（yyyy-MM-dd）：与项目「计划开始~计划结束」区间求交集（overlap）。
   * <p>服务端对非法日期直接报错，不会静默丢掉条件把结果放大成全量。
   */
  planDateFrom?: string; planDateTo?: string;
}

export interface RdmProjectCreateForm {
  name: string; objective?: string;
  /**
   * 六组负责人同构契约：清空时 userId 传 null、userName 传空串。
   * <p>后端以「userName 非 null」为本次提供了该角色的哨兵，且实体列标了
   * {@code updateStrategy = ALWAYS}（MyBatis-Plus 默认 NOT_NULL 会把 null 从 SET 剔除，
   * 不标就永远清不掉），两边必须同步，缺一侧都会造成「清空不生效」。
   */
  pmUserId?: number | null; pmUserName?: string | null;
  productOwnerUserId?: number | null; productOwnerUserName?: string | null;
  /** 技术负责人（userId 为权威键；清空时 userId 传 null、userName 传空串） */
  techLeadUserId?: number | null; techLeadUserName?: string | null;
  /** UI 设计负责人 */
  uiDesignerUserId?: number | null; uiDesignerUserName?: string | null;
  /** 测试/QA 负责人 */
  qaLeadUserId?: number | null; qaLeadUserName?: string | null;
  /** 运维/DevOps 负责人 */
  opsLeadUserId?: number | null; opsLeadUserName?: string | null;
  planStartDate?: string; planEndDate?: string; defaultAcceptancePath?: string;
}

export interface RdmProjectUpdateForm extends Partial<RdmProjectCreateForm> {
  status?: string; pausedFlag?: RdmTriStateFlag; riskFlag?: RdmTriStateFlag; expectedVersion: number;
}

// ===== Delivery Item 交付项 =====
export interface RdmDeliveryItemListItem {
  id: number; itemNo: string; reqId: number; reqTitle: string; reqNo: string;
  projectId: number | null; projectName: string | null; title: string;
  status: string; coordinatorUserName: string; acceptancePath: string;
  planStartDate: string; planEndDate: string; scopeVersion: number;
  blockedFlag: boolean; taskProgress: string; testStatus: string;
  acceptanceStatus: string; updatedAt: string;
}

export interface RdmDeliveryItemDetail extends RdmDeliveryItemListItem {
  scopeDesc: string; acceptanceCriteria: string; prdSnapshotId: number | null;
  productAcceptorUserName: string; bizAcceptorUserName: string;
  version: number; createdAt: string;
  /** Batch2：範圍凍結時間（非空即已凍結，修改需走變更流程） */
  scopeFrozenAt?: string | null;
}

export interface RdmDeliveryItemQuery {
  reqId?: number; projectId?: number; status?: string; keyword?: string;
  coordinatorUserId?: number; pageNo?: number; pageSize?: number;
}

export interface RdmDeliveryItemCreateForm {
  reqId: number; projectId?: number; title: string; scopeDesc?: string;
  acceptanceCriteria?: string; coordinatorUserId?: number; coordinatorUserName?: string;
  productAcceptorUserId?: number; productAcceptorUserName?: string;
  bizAcceptorUserId?: number; bizAcceptorUserName?: string;
  acceptancePath?: string; planStartDate?: string; planEndDate?: string;
}

export interface RdmDeliveryItemUpdateForm extends Partial<RdmDeliveryItemCreateForm> {
  status?: string; expectedVersion: number;
}

// ===== Test Batch 提测批次 =====
export interface RdmTestBatchListItem {
  id: number; batchNo: string; reqId: number; reqTitle: string; reqNo: string;
  deliveryItemTitles: string[]; testEnv: string; testLeadUserName: string;
  status: string; roundNo: number; planEndTime: string;
  passCount: number; failCount: number; totalCount: number; createdAt: string;
}

export interface RdmTestBatchDetail extends RdmTestBatchListItem {
  scopeSnapshotJson: string; buildIdsJson: string; executorUserIds: number[];
  /**
   * 执行人展示签名「姓名(工号)」，服务端一次 IN 查补齐，与 executorUserIds 同序。
   * 详情展示只认这个字段，不要把 executorUserIds 直接 join 上界面（会显成裸数字）。
   * 已注销账户的 id 会被服务端剔除，因此本数组可能短于 ID 数组。
   */
  executorUserNames?: string[];
  executions: RdmTestExecutionRecord[]; applicantUserName: string;
  returnedReason: string | null; updatedAt: string;
  /** Batch3：并发控制版本（乐观锁），写操作回传为 expectedVersion；非业务范围版本 */
  version: number;
  /** Batch3：待接收用例草稿JSON（权威冻结集合以测试轮次为准） */
  caseSnapshotJson?: string | null;
  /** Batch3：待接收交付项-系统-构建映射JSON */
  buildMappingJson?: string | null;
  /**
   * 当前轮次的冻结用例集（含服务端派生的稳定 caseId 与每用例有效结果）。
   * 录入结果必须从这里选：caseId 由服务端受理时派生且不可预测，手输永远对不上。
   * 空数组 = 还没受理（无冻结轮次）。
   */
  frozenCases?: RdmTestBatchFrozenCase[];
}

/** 冻结用例条目（后端 RdmTestBatchVO.CaseEntry）：权威 caseId + 本轮有效结果 */
export interface RdmTestBatchFrozenCase {
  deliveryItemId: number
  deliveryItemTitle?: string | null
  caseId: string
  caseTitle?: string | null
  scopeVersion?: number | null
  mandatory?: boolean
  /** pass / fail / not_passed / not_executed */
  effectiveResult?: string | null
}

/**
 * 范围快照条目（scopeSnapshotJson 反序列化后的单项）。
 * <p>后端 RdmTestBatchService.buildScopeSnapshot 逐交付项写入 deliveryItemId/itemNo/title/scopeVersion/acceptancePath，
 * 是提测详情页取<b>真实 deliveryItemId</b> 的权威来源（不得用数组下标伪造 ID）。
 */
export interface RdmTestBatchScopeItem {
  deliveryItemId: number;
  itemNo?: string;
  title?: string;
  scopeVersion?: number;
  acceptancePath?: string;
}

/** 冻结用例集条目（caseSnapshotJson 反序列化后的单项，受理后由服务端规范化并分配稳定 caseId） */
export interface RdmTestBatchCaseItem {
  caseId?: string;
  deliveryItemId?: number;
  caseTitle?: string;
  mandatory?: boolean;
}

export interface RdmTestExecutionRecord {
  id: number; deliveryItemId: number; deliveryItemTitle: string;
  caseTitle: string; executorUserName: string; buildId: string;
  testEnv: string; result: string; executedAt: string; remark: string; roundNo: number;
  /** Batch3：稳定用例ID（V3 门禁映射到冻结用例集） */
  caseId?: string | null;
  /** Batch3：不可变测试轮次事实ID */
  testRoundId?: number | null;
  /** Batch3：业务范围版本（非并发版本） */
  scopeVersion?: number | null;
  /** Batch3：执行证据JSON（截图/日志链接等） */
  evidenceJson?: string | null;
}

export interface RdmTestBatchSummary {
  totalCases: number; executedCases: number; passedCases: number;
  failedCases: number; blockedCases: number; skippedCases: number;
  notExecutedCases: number; passRate: number;
}

export interface RdmTestBatchQuery {
  reqId?: number; status?: string; testLeadUserId?: number;
  keyword?: string; pageNo?: number; pageSize?: number;
}

export interface RdmTestBatchSubmitForm {
  reqId: number; deliveryItemIds: number[]; buildIds?: string[];
  testEnv: string; testLeadUserId: number; testLeadUserName: string;
  executorUserIds?: number[]; planEndTime?: string;
  /** 范围快照JSON（可选，服务端可覆盖生成） */
  scopeSnapshotJson?: string;
  /** Batch3：用例集草稿JSON（仅提示，非门禁权威分母；受理冻结时服务端规范化） */
  caseSnapshotJson?: string;
  /** Batch3：交付项-系统-构建映射草稿JSON（可选） */
  buildMappingJson?: string;
  requestId?: string; expectedVersion?: number;
}

export interface RdmTestExecutionForm {
  deliveryItemId?: number; caseTitle: string; result: string;
  buildId?: string; testEnv?: string; remark?: string;
  /** Batch3：稳定用例ID（V3 测试流必填，须映射到当前轮次冻结用例集） */
  caseId?: string;
  /** Batch3：执行证据JSON（截图/日志链接等，服务端原样留存） */
  evidenceJson?: string;
  /** Batch3：业务范围版本（以冻结轮次为权威，不一致即拒） */
  scopeVersion?: number;
  requestId?: string; expectedVersion?: number;
}

// ===== Issue 问题 =====
export interface RdmIssueListItem {
  id: number; issueNo: string; title: string; sourceType: string;
  reqId: number; reqTitle: string; reqNo: string;
  deliveryItemId: number | null; deliveryItemTitle: string | null;
  severity: string; ownerUserName: string; status: string; createdAt: string;
}

export interface RdmIssueDetail extends RdmIssueListItem {
  description: string; impact: string; scopeVersion: number;
  buildId: string; reporterUserName: string; updatedAt: string;
  deferRecords: RdmIssueDeferRecord[];
  /** Batch3：並發控制版本（樂觀鎖），問題級寫操作（resolve/bind/cancel/merge/reassign）回傳為 expectedVersion；非範圍版本 */
  version?: number;
}

export interface RdmIssueDeferRecord {
  id: number; reason: string; impactDesc: string; mitigation: string;
  targetVersion: string; ownerUserName: string; dueAt: string;
  productDecision: string; productDecideUserName: string;
  productDecideTime: string; productDecideReason: string;
  bizDecision: string; bizDecideUserName: string;
  bizDecideTime: string; bizDecideReason: string;
  followUpReqId: number | null; followUpReqNo: string | null;
  status: string; applicantUserName: string; createdAt: string;
  /** Batch3：并发控制版本（乐观锁）；非业务范围版本 */
  version?: number;
  /** Batch3：延期对应的业务范围版本 */
  scopeVersion?: number | null;
  /** Batch3：必要范围变更批准引用 */
  scopeChangeId?: number | null;
  /** Batch3：延期生效时间 */
  effectiveAt?: string | null;
  /** Batch3：升级时间（超期未承接时升级） */
  escalatedAt?: string | null;
  /** Batch3：升级级别 */
  escalationLevel?: number | null;
}

export interface RdmIssueQuery {
  reqId?: number; deliveryItemId?: number; status?: string;
  severity?: string; ownerUserId?: number; sourceType?: string;
  keyword?: string; pageNo?: number; pageSize?: number;
}

export interface RdmIssueCreateForm {
  sourceType: string; sourceId?: number; reqId?: number;
  deliveryItemId?: number; scopeVersion?: number; buildId?: string;
  title: string; description?: string; impact?: string;
  severity: string; ownerUserId?: number; ownerUserName?: string;
}

export interface RdmIssueDeferApplyForm {
  reason: string; impactDesc?: string; mitigation?: string;
  targetVersion: string; ownerUserId?: number; ownerUserName?: string;
  /** 修复期限（必填），格式严格为 yyyy-MM-dd（不带时间） */
  dueAt: string;
  requestId?: string; expectedVersion?: number;
}

/**
 * 延期裁决表单（产品/业务共用，由 decisionType 区分裁决方）。
 * <p>decision 取值必为 {@code approved}/{@code rejected}（不是 approve/reject），与后端一字不差。
 */
export interface RdmIssueDeferDecisionForm {
  decision: string; reason: string; followUpReqId?: number;
  bizDecisionRequired?: boolean;
  requestId?: string; expectedVersion?: number;
}

/**
 * 建立承接（任务21）：延期获批后绑定承接需求，问题与承接需求均以<b>数值ID</b>表达。
 * <p>每个问题同一时刻唯一有效承接。
 */
export interface RdmIssueBindForm {
  issueId: number; followUpReqId: number;
  ownerUserId?: number; reason?: string;
  requestId?: string; expectedVersion?: number;
}

/**
 * 按证据关闭问题（任务21）：<b>不得无证据关闭</b>；延期≠解决；承接需求完成验收≠原问题自动解决。
 * <p>repairEvidenceJson / testRoundId / productAcceptanceId / reason 均为后端必填。
 */
export interface RdmIssueResolveForm {
  followupId?: number; deliveryItemId?: number; buildId?: string;
  repairEvidenceJson: string; testRoundId: number;
  testExecutionIdsJson?: string; productAcceptanceId: number;
  businessAcceptanceId?: number; conclusion?: string; reason: string;
  requestId?: string; expectedVersion?: number;
}

/**
 * 问题动作（任务21）：取消 cancel / 合并 merge / 改派 reassign，均保留已有承接关系与历史。
 * <p>merge 必填 targetIssueId；reassign 必填 newOwnerUserId；三种动作 reason 均必填。
 */
export interface RdmIssueActionForm {
  targetIssueId?: number; newOwnerUserId?: number; newOwnerUserName?: string;
  reason: string;
  requestId?: string; expectedVersion?: number;
}

// ===== Release Batch 发布批次 =====
export interface RdmReleaseBatchListItem {
  id: number; batchNo: string; versionTag: string; projectName: string;
  releaseOwnerUserName: string; planTime: string; status: string;
  systemCount: number; deployedCount: number; createdAt: string;
}

export interface RdmReleaseBatchDetail extends RdmReleaseBatchListItem {
  scopeSnapshotJson: string; approvalUserName: string; approvalTime: string;
  applicantUserName: string; rollbackReason: string | null;
  deployments: RdmReleaseDeploymentRecord[];
  checkResults: RdmReleaseCheckResult[];
  updatedAt: string;
  /** Batch3：并发控制版本（乐观锁），写操作回传为 expectedVersion；非范围版本 */
  version?: number;
  /** 任务27：当前放行申请的并发版本快照（与 applicationVersion 对齐），非范围版本 */
  applicationVersion?: number | null;
  /** 任务27：申请时冻结的范围/构建快照JSON */
  applicationSnapshotJson?: string | null;
  /** 任务27：裁决时冻结的快照JSON */
  approvalSnapshotJson?: string | null;
  /** 任务27：提交（申请放行）时间 */
  submittedAt?: string | null;
  /** 任务27：放行裁决过期时间（过期必须重新过闸） */
  approvalExpiresAt?: string | null;
  /** 任务27：是否全部系统验证通过（只读投影；验证通过≠已发布） */
  verificationPassed?: boolean | null;
  /** 任务27：已开放系统数（开放是独立事实） */
  openedCount?: number | null;
  /** 任务27：本项目 V3 发布灰度是否已开启（GLOBAL 熔断优先，两级都为1才开） */
  v3ReleaseEnabled?: boolean | null;
  /** 任务27：放行裁决留痕（追加式，apply/decide 各一行，不可修改） */
  approvals?: RdmReleaseApprovalRecord[];
  /** 任务27：紧急豁免单（只可豁免缺失的产品验收） */
  exemptions?: RdmReleaseExemptionRecord[];
  /** 任务27：产品补验单（按补验人真实工作日历冻结期限） */
  supplementaries?: RdmReleaseSupplementaryRecord[];
}

/** 任务27：放行裁决留痕（对应 rdm_release_approval，只增不改） */
export interface RdmReleaseApprovalRecord {
  id: number; applicationVersion?: number | null;
  /** apply/decide */
  action: string;
  /** approved/rejected（apply 行为空） */
  decision?: string | null;
  reason?: string | null; operatorUserId?: number | null;
  evidenceHash?: string | null; createdAt?: string | null;
}

/** 任务27：紧急豁免裁决留痕（uk(exemption_id, decision_type)，只增不改） */
export interface RdmReleaseExemptionDecisionRecord {
  id: number;
  /** product_risk/release */
  decisionType: string;
  /** approved/rejected */
  decision: string;
  reason?: string | null; signerUserId?: number | null; createdAt?: string | null;
}

/** 任务27：紧急豁免单（只可豁免缺失的产品验收） */
export interface RdmReleaseExemptionRecord {
  id: number; applicationVersion?: number | null; applicantUserId?: number | null;
  reason?: string | null; risk?: string | null; rollbackPlan?: string | null;
  missingAcceptanceJson?: string | null; supplementaryPlanJson?: string | null;
  productRiskApproved?: boolean | null; releaseApproved?: boolean | null;
  effective?: boolean | null; createdAt?: string | null;
  decisions?: RdmReleaseExemptionDecisionRecord[];
}

/** 任务27：产品补验单（按补验人真实工作日历冻结期限） */
export interface RdmReleaseSupplementaryRecord {
  id: number; deliveryItemId?: number | null; deliveryItemTitle?: string | null;
  scopeVersion?: number | null; buildId?: string | null;
  /** product/business（本任务只产生 product） */
  verificationType?: string | null;
  exemptionId?: number | null; verifierUserId?: number | null; verifierUserName?: string | null;
  deadline?: string | null; calendarVersion?: string | null;
  /** pending/completed/overdue/failed */
  status?: string | null;
  /** pass/fail */
  result?: string | null;
  acceptanceRecordId?: number | null; escalated?: boolean | null;
  escalationLevel?: number | null; overdueWorkingDays?: number | null;
  completedAt?: string | null; version?: number | null;
}

export interface RdmReleaseDeploymentRecord {
  id: number; systemCode: string; systemName: string; buildId: string;
  deployOrder: number; deployStatus: string; deployTime: string;
  verifyStatus: string; verifyTime: string; openStatus: string;
  openTime: string; rollbackReason: string | null; attemptNo: number;
  operatorUserName: string;
  /** 任务27：本系统的追加式尝试事实（部署/验证/开放/回滚，只增不改） */
  attempts?: RdmReleaseAttemptRecord[];
}

/** 任务27：追加式尝试事实（只增不改，历史永久留痕） */
export interface RdmReleaseAttemptRecord {
  id: number; deploymentId?: number | null; attemptNo?: number | null;
  /** deploy/verify/open/rollback */
  action?: string | null;
  /** deploying/success/failed/rolled_back/passed/opened/not_opened */
  result?: string | null;
  buildId?: string | null; testEnv?: string | null; approvalId?: number | null;
  reason?: string | null; operatorUserId?: number | null; occurredAt?: string | null;
}

export interface RdmReleaseCheckResult {
  checkType: string; passed: boolean; message: string;
  refId: number | null; refNo: string | null;
}

export interface RdmReleaseBatchQuery {
  projectId?: number; status?: string; releaseOwnerUserId?: number;
  keyword?: string; pageNo?: number; pageSize?: number;
}

export interface RdmReleaseBatchCreateForm {
  versionTag: string; projectId?: number; reqId?: number;
  releaseOwnerUserId: number; releaseOwnerUserName: string;
  planTime?: string; deliveryItemIds?: number[];
  deployments: { systemCode: string; systemName?: string; buildId?: string; deployOrder?: number }[];
}

export interface RdmReleaseDecideForm { decision: string; reason?: string; requestId?: string; expectedVersion?: number }
export interface RdmReleaseDeployForm { systemCode: string; deployStatus: string; buildId?: string; requestId?: string; expectedVersion?: number }
export interface RdmReleaseVerifyForm { systemCode: string; verifyStatus: string; remark?: string; requestId?: string; expectedVersion?: number }
export interface RdmReleaseRollbackForm { reason: string; systemCodes?: string[]; requestId?: string; expectedVersion?: number }

/**
 * 任务27：业务开放（端点 POST /release-batch/{id}/open）。
 * <p><b>开放是独立事实，绝不由「验证通过」推导</b>：全部验证通过后批次仍停在 verifying，
 * 必须显式提交本动作。systemCodes 缺省=全部已验证通过系统；openStatus 缺省 opened。
 */
export interface RdmReleaseOpenForm {
  systemCodes?: string[];
  /** opened/not_opened（缺省 opened；not_opened 是止损动作，不校验硬门禁） */
  openStatus?: string;
  remark?: string; requestId?: string; expectedVersion?: number;
}

/** 任务27：补验计划项（紧急豁免随附，服务端据此创建补验单并冻结期限） */
export interface RdmReleaseSupplementaryPlanItem {
  deliveryItemId?: number; verifierUserId?: number; verifierUserName?: string;
}

/**
 * 任务27：紧急豁免申请（端点 POST /release-batch/{id}/exemption）。
 * <p>只可豁免「缺失的产品验收」，业务验收永不可豁免；缺失项由服务端计算，reason/risk/rollbackPlan 均必填。
 */
export interface RdmReleaseExemptionForm {
  reason: string; risk: string; rollbackPlan: string;
  supplementaryPlan?: RdmReleaseSupplementaryPlanItem[];
  requestId?: string; expectedVersion?: number;
}

/**
 * 任务27：紧急豁免裁决（端点 POST /release-batch/{id}/exemption/{exemptionId}/decision）。
 * <p>decisionType 取 product_risk/release；decision 取 approved/rejected；<b>四眼</b>：裁决人不得是申请人本人，管理员亦无自批。
 */
export interface RdmReleaseExemptionDecisionForm {
  decisionType: string; decision: string; reason: string;
  requestId?: string; expectedVersion?: number;
}

/**
 * 任务27：补验完成登记（端点 POST /release-batch/supplementary/{id}/complete）。
 * <p>仅<b>冻结的补验人本人</b>可登记（无 admin 直通）；expectedVersion 取补验单 version；result 取 pass/fail 且须与验收记录结论一致。
 */
export interface RdmReleaseSupplementaryCompleteForm {
  acceptanceRecordId: number; result: string; evidenceJson?: string;
  requestId?: string; expectedVersion?: number;
}

// ===== Acceptance Record 验收记录（交付项级） =====
export interface RdmAcceptanceRecordListItem {
  id: number; recordNo: string; deliveryItemId: number; deliveryItemTitle: string;
  reqId: number; reqTitle: string; acceptanceType: string; stage: string;
  conclusion: string; score: number | null; signerUserName: string;
  roundNo: number; createdAt: string;
}

export interface RdmAcceptanceRecordDetail extends RdmAcceptanceRecordListItem {
  scopeVersion: number; buildId: string; testEnv: string;
  opinion: string; conditionsJson: string | null; evidenceJson: string | null;
}

export interface RdmAcceptanceRecordSubmitForm {
  acceptanceType: string; stage: string; scopeVersion?: number;
  buildId?: string; testEnv?: string; conclusion: string;
  score?: number; opinion?: string; conditionsJson?: string; evidenceJson?: string;
  requestId?: string; expectedVersion?: number;
}

/* ==================== V3 API 函数 ==================== */

// ===== 项目 Project =====

export async function fetchProjectPage(params: RdmProjectQuery): Promise<{ records: RdmProjectListItem[]; total: number }> {
  return request.get<unknown, { records: RdmProjectListItem[]; total: number }>('/rdm/project', { params, ...SILENT })
}

export async function createProject(data: RdmProjectCreateForm): Promise<RdmProjectDetail> {
  return request.post<unknown, RdmProjectDetail>('/rdm/project', data)
}

export async function fetchProjectDetail(id: number): Promise<RdmProjectDetail> {
  return request.get<unknown, RdmProjectDetail>(`/rdm/project/${id}`, SILENT)
}

export async function updateProject(id: number, data: RdmProjectUpdateForm): Promise<void> {
  return request.patch<unknown, void>(`/rdm/project/${id}`, data)
}

export async function fetchProjectSummary(id: number): Promise<RdmProjectSummary> {
  return request.get<unknown, RdmProjectSummary>(`/rdm/project/${id}/summary`, SILENT)
}

export async function fetchProjectStats(params: RdmProjectQuery): Promise<RdmProjectStatsCard> {
  return request.get<unknown, RdmProjectStatsCard>('/rdm/project/stats', { params, ...SILENT })
}

export async function fetchProjectPending(id: number): Promise<RdmProjectPendingItem[]> {
  return request.get<unknown, RdmProjectPendingItem[]>(`/rdm/project/${id}/pending`, SILENT)
}

export async function fetchProjectChecklist(id: number): Promise<RdmProjectDeliveryChecklist[]> {
  return request.get<unknown, RdmProjectDeliveryChecklist[]>(`/rdm/project/${id}/checklist`, SILENT)
}

export async function addProjectMember(id: number, data: { userId: number; empNo?: string; userName?: string; roleCode: string }): Promise<void> {
  return request.post<unknown, void>(`/rdm/project/${id}/members`, data)
}

export async function removeProjectMember(id: number, userId: number): Promise<void> {
  return request.delete<unknown, void>(`/rdm/project/${id}/members/${userId}`)
}

// ===== 交付项 Delivery Item =====

export async function fetchDeliveryItems(params: RdmDeliveryItemQuery): Promise<{ records: RdmDeliveryItemListItem[]; total: number }> {
  return request.get<unknown, { records: RdmDeliveryItemListItem[]; total: number }>('/rdm/delivery-item', { params, ...SILENT })
}

export async function createDeliveryItem(data: RdmDeliveryItemCreateForm): Promise<RdmDeliveryItemDetail> {
  return request.post<unknown, RdmDeliveryItemDetail>('/rdm/delivery-item', data)
}

export async function fetchDeliveryItemDetail(id: number): Promise<RdmDeliveryItemDetail> {
  return request.get<unknown, RdmDeliveryItemDetail>(`/rdm/delivery-item/${id}`, SILENT)
}

export async function updateDeliveryItem(id: number, data: RdmDeliveryItemUpdateForm): Promise<void> {
  return request.patch<unknown, void>(`/rdm/delivery-item/${id}`, data)
}

// ===== 提测 Test Batch =====

export async function fetchTestBatches(params: RdmTestBatchQuery): Promise<{ records: RdmTestBatchListItem[]; total: number }> {
  return request.get<unknown, { records: RdmTestBatchListItem[]; total: number }>('/rdm/test-batch', { params, ...SILENT })
}

export async function submitTestBatch(data: RdmTestBatchSubmitForm): Promise<RdmTestBatchDetail> {
  return request.post<unknown, RdmTestBatchDetail>('/rdm/test-batch', data)
}

export async function fetchTestBatchDetail(id: number): Promise<RdmTestBatchDetail> {
  return request.get<unknown, RdmTestBatchDetail>(`/rdm/test-batch/${id}`, SILENT)
}

export async function fetchTestBatchSummary(id: number): Promise<RdmTestBatchSummary> {
  return request.get<unknown, RdmTestBatchSummary>(`/rdm/test-batch/${id}/summary`, SILENT)
}

export async function acceptTestBatch(id: number): Promise<void> {
  return request.post<unknown, void>(`/rdm/test-batch/${id}/accept`, {})
}

export async function returnTestBatch(id: number, data: { reason: string }): Promise<void> {
  return request.post<unknown, void>(`/rdm/test-batch/${id}/return`, data)
}

export async function submitTestExecution(id: number, data: RdmTestExecutionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/test-batch/${id}/executions`, data)
}

export async function retestBatch(id: number, data: { buildIds?: string[]; reason: string }): Promise<void> {
  return request.post<unknown, void>(`/rdm/test-batch/${id}/retest`, data)
}

// ===== 问题 Issue =====

export async function fetchIssues(params: RdmIssueQuery): Promise<{ records: RdmIssueListItem[]; total: number }> {
  return request.get<unknown, { records: RdmIssueListItem[]; total: number }>('/rdm/issue', { params, ...SILENT })
}

export async function createIssue(data: RdmIssueCreateForm): Promise<RdmIssueDetail> {
  return request.post<unknown, RdmIssueDetail>('/rdm/issue', data)
}

export async function fetchIssueDetail(id: number): Promise<RdmIssueDetail> {
  return request.get<unknown, RdmIssueDetail>(`/rdm/issue/${id}`, SILENT)
}

export async function applyIssueDefer(id: number, data: RdmIssueDeferApplyForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/${id}/defer`, data)
}

export async function decideIssueDefer(deferId: number, decisionType: 'product' | 'business', data: RdmIssueDeferDecisionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/defer/${deferId}/decide`, data, { params: { decisionType } })
}

/**
 * 按证据关闭问题（任务21）：必须携带修复证据 + 复测轮次 + 必要验收，不得无证据关闭。
 * <p>body 对齐后端 RdmIssueDTO.Resolve；requestId 缺省时自动生成幂等键。
 */
export async function resolveIssue(id: number, data: RdmIssueResolveForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/${id}/resolve`, withRequestId(data))
}

/** 建立承接（任务21）：以数值 ID 指定问题与承接需求，唯一有效承接 */
export async function bindIssueFollowUp(data: RdmIssueBindForm): Promise<void> {
  return request.post<unknown, void>('/rdm/issue/bind', withRequestId(data))
}

/** 取消问题（任务21：保留承接与历史） */
export async function cancelIssue(id: number, data: RdmIssueActionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/${id}/cancel`, withRequestId(data))
}

/** 合并问题到目标问题（任务21：targetIssueId 必填，保留承接与历史） */
export async function mergeIssue(id: number, data: RdmIssueActionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/${id}/merge`, withRequestId(data))
}

/** 改派问题负责人（任务21：newOwnerUserId 必填，不因改派丢失承接） */
export async function reassignIssue(id: number, data: RdmIssueActionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/issue/${id}/reassign`, withRequestId(data))
}

// ===== 发布批次 Release Batch =====

export async function fetchReleaseBatches(params: RdmReleaseBatchQuery): Promise<{ records: RdmReleaseBatchListItem[]; total: number }> {
  return request.get<unknown, { records: RdmReleaseBatchListItem[]; total: number }>('/rdm/release-batch', { params, ...SILENT })
}

export async function createReleaseBatch(data: RdmReleaseBatchCreateForm): Promise<RdmReleaseBatchDetail> {
  return request.post<unknown, RdmReleaseBatchDetail>('/rdm/release-batch', data)
}

export async function fetchReleaseBatchDetail(id: number): Promise<RdmReleaseBatchDetail> {
  return request.get<unknown, RdmReleaseBatchDetail>(`/rdm/release-batch/${id}`, SILENT)
}

export async function checkReleaseBatch(id: number): Promise<RdmReleaseCheckResult[]> {
  return request.post<unknown, RdmReleaseCheckResult[]>(`/rdm/release-batch/${id}/check`, {})
}

export async function applyReleaseBatch(id: number): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/apply`, {})
}

export async function decideReleaseBatch(id: number, data: RdmReleaseDecideForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/decide`, data)
}

export async function submitReleaseDeployment(id: number, data: RdmReleaseDeployForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/deployments`, data)
}

export async function submitReleaseVerification(id: number, data: RdmReleaseVerifyForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/verification`, data)
}

export async function rollbackReleaseBatch(id: number, data: RdmReleaseRollbackForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/rollback`, withRequestId(data))
}

/**
 * 登记业务开放（任务27）：验证通过≠已发布，必须独立开放。
 * <p>开放前重验硬门禁，且产品验收必须真实建立（紧急豁免不豁免开放）。
 */
export async function openReleaseBatch(id: number, data: RdmReleaseOpenForm = {}): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/open`, withRequestId(data))
}

/** 申请紧急豁免（任务27：只豁免缺失的产品验收，业务验收永不可豁免） */
export async function applyReleaseExemption(id: number, data: RdmReleaseExemptionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/exemption`, withRequestId(data))
}

/** 裁决紧急豁免（任务27：四眼，申请人≠批准人，管理员亦不自批） */
export async function decideReleaseExemption(id: number, exemptionId: number, data: RdmReleaseExemptionDecisionForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/${id}/exemption/${exemptionId}/decision`, withRequestId(data))
}

/** 登记产品补验完成（任务27：仅冻结的补验人本人，无 admin 直通） */
export async function completeReleaseSupplementary(supplementaryId: number, data: RdmReleaseSupplementaryCompleteForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/release-batch/supplementary/${supplementaryId}/complete`, withRequestId(data))
}

// ===== 验收记录（交付项级） =====

export async function fetchAcceptanceRecords(deliveryItemId: number, params?: { acceptanceType?: string; stage?: string; pageNo?: number; pageSize?: number }): Promise<{ records: RdmAcceptanceRecordListItem[]; total: number }> {
  return request.get<unknown, { records: RdmAcceptanceRecordListItem[]; total: number }>(`/rdm/delivery-item/${deliveryItemId}/acceptance`, { params, ...SILENT })
}

export async function submitAcceptanceRecord(deliveryItemId: number, data: RdmAcceptanceRecordSubmitForm): Promise<void> {
  return request.post<unknown, void>(`/rdm/delivery-item/${deliveryItemId}/acceptance`, data)
}

export async function fetchAcceptanceRecordDetail(deliveryItemId: number, recordId: number): Promise<RdmAcceptanceRecordDetail> {
  return request.get<unknown, RdmAcceptanceRecordDetail>(`/rdm/delivery-item/${deliveryItemId}/acceptance/detail/${recordId}`, SILENT)
}

/* ==================== Batch2 API 函数 ==================== */

// ===== Batch2: 結構主子需求 =====

/** 需求結構樹節點 */
export interface RdmStructureTreeNode {
  reqId: number
  reqNo: string
  title: string
  requirementKind: string
  status: string
  deliveryItemCount: number
  deliveryDoneCount: number
  children?: RdmStructureTreeNode[]
}

/** 為聚合需求掛一個執行子需求 */
export async function addStructureChild(data: { parentReqId: number; childReqId: number }): Promise<void> {
  return request.post<unknown, void>('/rdm/requirement-structure/add-child', data)
}

/** 移除聚合需求下的一個子需求 */
export async function removeStructureChild(data: { parentReqId: number; childReqId: number }): Promise<void> {
  return request.post<unknown, void>('/rdm/requirement-structure/remove-child', data)
}

/** 以某需求為根展開的結構子樹 */
export async function fetchRequirementTree(reqId: number): Promise<RdmStructureTreeNode[]> {
  try {
    return await request.get<unknown, RdmStructureTreeNode[]>(`/rdm/requirement-structure/tree/${reqId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 某需求的結構祖先鏈（用於麵包屑） */
export async function fetchRequirementAncestors(reqId: number): Promise<RdmStructureTreeNode[]> {
  try {
    return await request.get<unknown, RdmStructureTreeNode[]>(`/rdm/requirement-structure/ancestors/${reqId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

// ===== Batch2: 範圍版本 =====

/** 交付項範圍版本歷史條目 */
export interface RdmScopeVersionEntry {
  version: number
  reason: string
  userId: number
  userName?: string
  time: string
}

/** 凍結交付項當前範圍 */
export async function freezeDeliveryItemScope(id: number): Promise<void> {
  return request.post<unknown, void>(`/rdm/delivery-item/${id}/freeze-scope`, {})
}

/** 發起範圍變更，生成新版本 */
export async function createNewScopeVersion(id: number, data: { changeReason: string; newScopeDesc?: string; newAcceptanceCriteria?: string }): Promise<void> {
  return request.post<unknown, void>(`/rdm/delivery-item/${id}/new-scope-version`, data)
}

/** 交付項範圍版本歷史 */
export async function fetchScopeHistory(id: number): Promise<RdmScopeVersionEntry[]> {
  try {
    return await request.get<unknown, RdmScopeVersionEntry[]>(`/rdm/delivery-item/${id}/scope-history`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

// ===== Batch2: 統一摘要 =====

/** 項目聚合摘要（跨交付項/任務/缺陷/測試/驗收統計） */
export interface RdmProjectAggregateSummary {
  projectId: number
  deliveryItemTotal: number
  deliveryItemCompleted: number
  deliveryItemInProgress: number
  requirementTotal: number
  taskTotal: number
  taskCompleted: number
  taskInProgress: number
  issueOpen: number
  issueCritical: number
  testBatchTotal: number
  acceptancePending: number
  blockedTaskCount: number
  computedAt: string
}

/** 交付項聚合摘要 */
export interface RdmDeliveryItemSummary {
  deliveryItemId: number
  taskTotal: number
  taskCompleted: number
  taskInProgress: number
  latestTestBatchStatus?: string
  acceptanceTotal: number
  acceptancePassed: number
  issueOpenCount: number
  dependencyBlockCount: number
  scopeVersion: number
  scopeFrozen: boolean
  computedAt: string
}

/** 工作台個人摘要 */
export interface RdmWorkbenchSummary {
  myProjectCount: number
  myPendingTaskCount: number
  myDeliveryItemCount: number
  upcomingDeadlineCount: number
  projects: Array<{ projectId: number; projectName: string; status: string; deliveryItemTotal: number; deliveryItemCompleted: number }>
  computedAt: string
}

/** 項目聚合摘要 */
export async function fetchProjectAggregateSummary(id: number): Promise<RdmProjectAggregateSummary | null> {
  try {
    return await request.get<unknown, RdmProjectAggregateSummary>(`/rdm/summary/project/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 需求聚合摘要 */
export async function fetchRequirementSummary(reqId: number): Promise<unknown> {
  try {
    return await request.get<unknown, unknown>(`/rdm/summary/requirement/${reqId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 交付項聚合摘要 */
export async function fetchDeliveryItemSummary(id: number): Promise<RdmDeliveryItemSummary | null> {
  try {
    return await request.get<unknown, RdmDeliveryItemSummary>(`/rdm/summary/delivery-item/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 工作台個人摘要 */
export async function fetchWorkbenchSummary(): Promise<RdmWorkbenchSummary | null> {
  try {
    return await request.get<unknown, RdmWorkbenchSummary>('/rdm/summary/workbench', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 項目總覽列表統計卡（跟隨搜索條件） */
export async function fetchProjectListStats(params?: { status?: string; keyword?: string }): Promise<unknown> {
  try {
    return await request.get<unknown, unknown>('/rdm/summary/project-stats', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

// ===== Batch2: AllowedActions（實體級可執行動作） =====

/** 實體級可執行動作（項目/交付項/測試批次/問題/發布批次） */
export interface RdmEntityAction {
  code: string
  label: string
  tone: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

async function fetchEntityActions(path: string): Promise<RdmEntityAction[]> {
  try {
    return await request.get<unknown, RdmEntityAction[]>(path, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

export async function fetchProjectActions(id: number): Promise<RdmEntityAction[]> {
  return fetchEntityActions(`/rdm/project/${id}/actions`)
}

export async function fetchDeliveryItemActions(id: number): Promise<RdmEntityAction[]> {
  return fetchEntityActions(`/rdm/delivery-item/${id}/actions`)
}

export async function fetchTestBatchActions(id: number): Promise<RdmEntityAction[]> {
  return fetchEntityActions(`/rdm/test-batch/${id}/actions`)
}

export async function fetchIssueActions(id: number): Promise<RdmEntityAction[]> {
  return fetchEntityActions(`/rdm/issue/${id}/actions`)
}

export async function fetchReleaseBatchActions(id: number): Promise<RdmEntityAction[]> {
  return fetchEntityActions(`/rdm/release-batch/${id}/actions`)
}

// ===== Batch2: 跨交付項依賴 =====

/** 被阻塞任務信息 */
export interface RdmBlockedTaskInfo {
  taskId: number
  taskTitle: string
  predDeliveryItemId: number
  predDeliveryItemTitle: string
  blockPoint: string
  reason: string
}

/** 添加跨交付項依賴 */
export async function addCrossDeliveryDependency(data: { predTaskId: number; succTaskId: number; depType: string; blockPoint: string }): Promise<void> {
  return request.post<unknown, void>('/rdm/schedule/cross-delivery-dependency', data)
}

/** 某交付項下被前置依賴阻塞的任務 */
export async function fetchBlockedTasks(deliveryItemId: number): Promise<RdmBlockedTaskInfo[]> {
  try {
    return await request.get<unknown, RdmBlockedTaskInfo[]>(`/rdm/schedule/blocked-tasks/${deliveryItemId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/* ==================== Batch3/4: 統一事實投影（任務22，供項目總覽/工作台/導出/對賬共用） ==================== */

/** 事實查詢條件（與項目列表同一組 filters；統計卡必須跟隨篩選，禁止卡片全量、列表已篩） */
export interface RdmFactQuery {
  keyword?: string; status?: string; pmUserId?: number;
  /** 与列表同口径的新增筛选（后端已支持，统计卡与导出跟随同一组 filters，不会口径错位的） */
  productOwnerUserId?: number; planDateFrom?: string; planDateTo?: string;
  includeTodos?: boolean; includeItems?: boolean;
}

/** 數據範圍解析結果（fail-closed；authenticated=false 時 projectIds 必為空集合） */
export interface RdmFactScope {
  userId: number | null; authenticated: boolean; canSeeAll: boolean;
  restricted: boolean; projectIds: number[]; computedAt?: string | null;
}

/** 交付項事實（單一權威口徑最小粒度；testPassed/productAccepted/bizAccepted 直接承載任務20 判定，絕不由狀態推導） */
export interface RdmItemFact {
  itemId: number; itemNo: string; title: string; projectId: number | null; reqId: number | null;
  status: string; scopeVersion: number; version: number; scopeFrozen: boolean;
  coordinatorUserId: number | null; coordinatorUserName: string | null;
  productAcceptorUserId: number | null; productAcceptorUserName: string | null;
  bizAcceptorUserId: number | null; bizAcceptorUserName: string | null;
  acceptancePath: string | null; planStartDate: string | null; planEndDate: string | null;
  blocked: boolean; overdue: boolean;
  taskTotal: number; taskCompleted: number; taskInProgress: number; blockedTaskCount: number;
  testPassed: boolean; productAccepted: boolean; bizAccepted: boolean;
  openIssueCount: number; criticalIssueCount: number; majorIssueCount: number;
  deferResidualCount: number; pendingDecisionCount: number; delivered: boolean;
  todoReasons: string[]; actionUrl: string | null;
}

/** 項目事實（總覽行/統計卡/下鑽/導出/對賬共用；allDelivered 與 closed 互不推導） */
export interface RdmProjectFact {
  projectId: number; projectNo: string; projectName: string; objective: string; status: string;
  pmUserId: number | null; pmUserName: string | null;
  productOwnerUserId: number | null; productOwnerUserName: string | null;
  planStartDate: string | null; planEndDate: string | null;
  pausedFlag: number | null; riskFlag: number | null; overdueFlag: number | null;
  version: number | null; createdAt: string | null; updatedAt: string | null;
  requirementTotal: number; deliveryItemTotal: number; deliveryItemCompleted: number;
  deliveryItemInProgress: number; deliveryItemTesting: number; deliveryItemPendingAcceptance: number;
  deliveryItemBlocked: number; deliveryItemOverdue: number;
  testPassedItemCount: number; productAcceptedItemCount: number; bizAcceptedItemCount: number;
  taskTotal: number; taskCompleted: number; taskInProgress: number; blockedTaskCount: number;
  issueOpen: number; issueCritical: number; issueMajor: number;
  pendingDecisionCount: number; deferResidualCount: number; testBatchTotal: number;
  todoTotal: number; todoMineCount: number; todoWaitingOthersCount: number; todoUnassignedCount: number;
  allDelivered: boolean; closed: boolean; attention: boolean; inProgress: boolean;
  nextDeliveryDate: string | null; actionUrl: string | null; computedAt: string | null;
}

/** 待辦（去重後一條；key=objectType:refId；三桶 mine/waiting_others/unassigned 互斥且窮盡） */
export interface RdmTodo {
  key: string; objectType: string; refId: number; refNo: string; title: string;
  projectId: number | null; refIssueId: number | null;
  responsibleUserId: number | null; responsibleName: string | null;
  bucket: string; reasons: string[]; dueDate: string | null;
  overdue: boolean; overdueWorkingDays: number | null; refVersion: number | null;
  actionUrl: string | null;
}

/** 待辦看板（mine + waitingOthers + unassigned == total） */
export interface RdmTodoBoard {
  projectId: number | null; userId: number | null; authenticated: boolean;
  total: number; mineCount: number; waitingOthersCount: number; unassignedCount: number;
  rawReasonHits: number; todos: RdmTodo[]; computedAt: string | null;
}

/** 統計卡（跟隨查詢條件；每個計數都等於對應明細行的聚合） */
export interface RdmCardSummary {
  totalProjects: number; inProgressCount: number; attentionCount: number; pendingDecisionCount: number;
  activeProjects: number; allDeliveredProjects: number; closedProjects: number; pausedProjects: number;
  totalDeliveryItems: number; deliveredItems: number; blockedCount: number;
  testPassedItemCount: number; productAcceptedItemCount: number; bizAcceptedItemCount: number;
  issueOpen: number; issueCritical: number; deferResidualCount: number;
  todoTotal: number; todoMineCount: number; todoWaitingOthersCount: number; todoUnassignedCount: number;
  computedAt: string | null;
}

/** 對賬（路徑A 逐行相加 vs 路徑B 直接查庫，不等即列 mismatches） */
export interface RdmReconciliation {
  projectCount: number; projectRowCount: number; deliveryItemCount: number; deliveryItemRowCount: number;
  pendingDecisionSum: number; pendingDecisionDirect: number; deferResidualSum: number; deferResidualDirect: number;
  todoTotal: number; todoRowCount: number; todoBucketSum: number; todoRawReasonHits: number;
  closedProjectCount: number; allDeliveredProjectCount: number;
  consistent: boolean; mismatches: string[]; computedAt: string | null;
}

/** 全量導出包（範圍內全部項目/交付項/待辦，非當前頁；供前端 ExcelJS 多 Sheet 導出消費） */
export interface RdmExportBundle {
  scope: RdmFactScope; cards: RdmCardSummary;
  projects: RdmProjectFact[]; items: RdmItemFact[]; todos: RdmTodo[];
  reconciliation: RdmReconciliation; computedAt: string | null;
}

/** 催辦結果（工作日口徑 + 提醒日去重 + executeOnce 幂等） */
export interface RdmTodoNotifyResult {
  notified: number; deduped: number; nonWorkingDay: number;
}

/** 待辦看板（id=0 哨兵=跨項目工作台視角） */
export async function fetchTodoBoard(projectId: number): Promise<RdmTodoBoard | null> {
  try {
    return await request.get<unknown, RdmTodoBoard>(`/rdm/project/${projectId}/todo-board`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 逐交付項下鑽事實（與統計卡/導出同源） */
export async function fetchItemFacts(projectId: number): Promise<RdmItemFact[]> {
  try {
    return await request.get<unknown, RdmItemFact[]>(`/rdm/project/${projectId}/item-facts`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 全量導出數據包（非當前頁；篩選條件與項目列表同一組） */
export async function fetchExportBundle(params: RdmFactQuery): Promise<RdmExportBundle | null> {
  try {
    return await request.get<unknown, RdmExportBundle>('/rdm/project/export-bundle', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 對賬口徑校驗 */
export async function fetchReconciliation(params: RdmFactQuery): Promise<RdmReconciliation | null> {
  try {
    return await request.get<unknown, RdmReconciliation>('/rdm/project/reconciliation', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 手動催辦項目待辦（僅逾期達門檻者，逐人過工作日閘門，同提醒日同對象同接收人只催一次） */
export async function urgeProject(id: number): Promise<RdmTodoNotifyResult> {
  return request.post<unknown, RdmTodoNotifyResult>(`/rdm/project/${id}/urge`, withRequestId({}))
}

/* ==================== Batch4: V3 灰度管理（任務29 D 段） ==================== */

/** GLOBAL 行狀態（唯一种子行；缺行時 exists=false、各開關按關閉呈現） */
export interface RdmFlowGlobalFlags {
  exists: boolean; scopeKey: string | null;
  v3WriteEnabled: number | null; v3ReleaseEnabled: number | null;
  globalWritePaused: number | null; globalReleasePaused: number | null;
  productVerificationDays: number | null; businessVerificationDays: number | null;
  version: number | null; updatedBy: number | null; updatedAt: string | null;
}

/** 項目行狀態（scope_key=PROJECT:<id>；不存在=null，缺行即默認關閉、不自動補行） */
export interface RdmFlowProjectFlags {
  exists: boolean; projectId: number | null; scopeKey: string | null;
  v3WriteEnabled: number | null; v3ReleaseEnabled: number | null;
  version: number | null; updatedBy: number | null; updatedAt: string | null;
}

/**
 * 灰度狀態：GLOBAL 行 +（可選）指定項目行 + 兩級合成後的有效開關。
 * <p><b>熔斷優先</b>：effective* 僅供展示，門禁判定仍以服務層讀側權威方法為準；
 * effectiveV3Release=true 也僅代表灰度開啟，發布仍須過任務27 全部硬門禁。
 */
export interface RdmGrayscaleStatus {
  global: RdmFlowGlobalFlags; project: RdmFlowProjectFlags | null;
  effectiveV3Write: boolean | null; effectiveV3Release: boolean | null;
}

/**
 * 項目級開關變更（兩個獨立開關，null=不變；reason 必填）。
 * <p>expectedVersion 為乐观锁版本，**僅在灰度行已存在時攜帶**：行不存在時必須以「新建」語義提交，
 * 後端會拒絕帶 expectedVersion 的首次建行請求（哪怕值是 0），所以這裡必須可省略。
 */
export interface RdmProjectFlagsUpdateForm {
  projectId: number;
  v3WriteEnabled?: number | null; v3ReleaseEnabled?: number | null;
  expectedVersion?: number; reason: string;
  requestId?: string;
}

/** GLOBAL 行開關變更（總閘 + 全局熔斷，四個開關獨立，null=不變；reason 必填，expectedVersion 同上僅在行存在時攜帶） */
export interface RdmGlobalFlagsUpdateForm {
  v3WriteEnabled?: number | null; v3ReleaseEnabled?: number | null;
  globalWritePaused?: number | null; globalReleasePaused?: number | null;
  expectedVersion?: number; reason: string;
  requestId?: string;
}

/** 查詢灰度狀態（projectId 可選；不補建任何行） */
export async function fetchGrayscaleStatus(projectId?: number): Promise<RdmGrayscaleStatus | null> {
  try {
    return await request.get<unknown, RdmGrayscaleStatus>('/rdm/flow-config/grayscale', { params: { projectId }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 變更項目級 V3 寫入/發布開關（僅管理員，審計留痕） */
export async function updateProjectFlowFlags(data: RdmProjectFlagsUpdateForm): Promise<RdmGrayscaleStatus> {
  return request.post<unknown, RdmGrayscaleStatus>('/rdm/flow-config/project/update', withRequestId(data))
}

/** 變更 GLOBAL 總閘/熔斷（僅管理員，審計留痕；熔斷優先於任何項目級開啟） */
export async function updateGlobalFlowFlags(data: RdmGlobalFlagsUpdateForm): Promise<RdmGrayscaleStatus> {
  return request.post<unknown, RdmGrayscaleStatus>('/rdm/flow-config/global/update', withRequestId(data))
}

/* ==================== Batch4: 存量安全遷移（任務29 C 段） ==================== */

/** 單條需求的遷移預覽（只讀推導，不落業務事實） */
export interface RdmMigrationItemPreview {
  itemId: number; reqId: number | null; reqNo: string | null; title: string | null;
  sourceFlowVersion: number | null; sourceVersion: number | null;
  targetProjectId: number | null; targetProjectName: string | null;
  /** previewed=可遷移；blocked=不可遷移（見 blockingReason） */
  status: string; blockingReason: string | null; previewHash: string | null;
  /** 影響面：將產生的結構性 V3 事實清單（絕不含測試/驗收/發布證據） */
  impacts: string[];
}

/** 預覽結果：批次頭 + 逐項遷移預覽 */
export interface RdmMigrationPreviewResult {
  batchId: number; status: string; scopeType: string | null;
  scopeProjectId: number | null; targetProjectId: number | null; targetProjectName: string | null;
  targetProjectAutoCreate: boolean | null; chunkSize: number | null; previewHash: string | null;
  totalItems: number | null; eligibleItems: number | null; blockedItems: number | null;
  items: RdmMigrationItemPreview[]; createdAt: string | null;
}

/** 遷移明細詳情 */
export interface RdmMigrationItemDetail {
  itemId: number; reqId: number | null; targetProjectId: number | null;
  sourceFlowVersion: number | null; sourceVersion: number | null;
  status: string; blockingReason: string | null; resultJson: string | null;
  confirmedBy: number | null; confirmedAt: string | null;
  executedBy: number | null; executedAt: string | null;
  rolledBackBy: number | null; rolledBackAt: string | null; version: number | null;
}

/** 遷移審計條目（追加式、不可覆蓋） */
export interface RdmMigrationAuditEntry {
  id: number; batchId: number | null; itemId: number | null; action: string | null; result: string | null;
  operatorUserId: number | null; requestId: string | null;
  beforeVersion: number | null; afterVersion: number | null;
  beforeHash: string | null; afterHash: string | null;
  resultJson: string | null; reason: string | null; createdAt: string | null;
}

/** 批次詳情：批次頭 + 全部明細 + 不可覆蓋審計 */
export interface RdmMigrationBatchDetail {
  batchId: number; status: string; requestId: string | null; requestedBy: number | null;
  previewHash: string | null; chunkSize: number | null;
  confirmedBy: number | null; confirmedAt: string | null;
  pausedAt: string | null; pauseReason: string | null;
  rolledBackBy: number | null; rolledBackAt: string | null;
  resultJson: string | null; blockingReason: string | null;
  version: number | null; createdAt: string | null; updatedAt: string | null;
  items: RdmMigrationItemDetail[]; audits: RdmMigrationAuditEntry[];
}

/** 單個分塊執行結果 */
export interface RdmMigrationChunkResult {
  batchId: number; batchStatus: string; chunkSize: number | null;
  processedInChunk: number | null; successInChunk: number | null; failedInChunk: number | null;
  totalCompleted: number | null; totalFailed: number | null; totalBlocked: number | null; remaining: number | null;
  succeededItemIds: number[]; failedItemIds: number[]; batchResultJson: string | null;
}

/** 對賬結果：countConsistent 與 traceable 全真才算通過 */
export interface RdmMigrationReconcileResult {
  batchId: number; totalItems: number | null; completed: number | null; failed: number | null;
  blocked: number | null; pending: number | null;
  countConsistent: boolean | null; traceable: boolean | null;
  inconsistencies: Record<string, string> | null; reconciledAt: string | null;
}

/** 回退結果：rejected=true 即發現新 V3 事實、已拒絕回滾並自動暫停（走前滾兼容） */
export interface RdmMigrationRollbackResult {
  batchId: number; rejected: boolean | null; rejectReason: string | null;
  newFactsByItem: Record<string, Record<string, number[]>> | null;
  rolledBackItemIds: number[]; batchStatus: string | null;
}

/** 遷移預覽請求（projectId 與 reqIds 二選一；chunkSize 1..100 默認20） */
export interface RdmMigrationPreviewForm {
  projectId?: number; reqIds?: number[]; targetProjectId?: number;
  chunkSize?: number; reason?: string; requestId?: string;
}

/** 主責確認請求（expectedVersion 取批次 version） */
export interface RdmMigrationConfirmForm { expectedVersion?: number; reason?: string; requestId?: string }
/** 小批執行請求（每次一個分塊） */
export interface RdmMigrationExecuteForm { expectedVersion?: number; requestId?: string }
/** 暫停請求（reason 必填） */
export interface RdmMigrationPauseForm { expectedVersion?: number; reason: string; requestId?: string }
/** 恢復請求 */
export interface RdmMigrationResumeForm { expectedVersion?: number; reason?: string; requestId?: string }
/** 回退請求（reason 必填；拒絕盲目回滾） */
export interface RdmMigrationRollbackForm { expectedVersion?: number; reason: string; requestId?: string }
/** 對賬請求 */
export interface RdmMigrationReconcileForm { requestId?: string }

/** 遷移批次簡表（可按狀態過濾） */
export async function fetchMigrationBatches(status?: string): Promise<RdmMigrationBatchDetail[]> {
  try {
    return await request.get<unknown, RdmMigrationBatchDetail[]>('/rdm/stock-migration/batch', { params: { status }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 遷移批次詳情 */
export async function fetchMigrationBatchDetail(id: number): Promise<RdmMigrationBatchDetail | null> {
  try {
    return await request.get<unknown, RdmMigrationBatchDetail>(`/rdm/stock-migration/batch/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 生成遷移預覽（只讀業務事實，不落任何業務變更） */
export async function previewStockMigration(data: RdmMigrationPreviewForm): Promise<RdmMigrationPreviewResult> {
  return request.post<unknown, RdmMigrationPreviewResult>('/rdm/stock-migration/preview', withRequestId(data))
}

/** 主責確認（previewed → confirmed；確認前執行入口一律拒絕） */
export async function confirmMigrationBatch(id: number, data: RdmMigrationConfirmForm = {}): Promise<RdmMigrationBatchDetail> {
  return request.post<unknown, RdmMigrationBatchDetail>(`/rdm/stock-migration/batch/${id}/confirm`, withRequestId(data))
}

/** 小批執行一個分塊（失敗項隔離標 FAILED） */
export async function executeMigrationChunk(id: number, data: RdmMigrationExecuteForm = {}): Promise<RdmMigrationChunkResult> {
  return request.post<unknown, RdmMigrationChunkResult>(`/rdm/stock-migration/batch/${id}/execute`, withRequestId(data))
}

/** 暫停（已執行項保留、未執行項待續；reason 必填） */
export async function pauseMigrationBatch(id: number, data: RdmMigrationPauseForm): Promise<RdmMigrationBatchDetail> {
  return request.post<unknown, RdmMigrationBatchDetail>(`/rdm/stock-migration/batch/${id}/pause`, withRequestId(data))
}

/** 恢復（paused → confirmed/running；被拒回退的批次不可恢復，只能前滾） */
export async function resumeMigrationBatch(id: number, data: RdmMigrationResumeForm = {}): Promise<RdmMigrationBatchDetail> {
  return request.post<unknown, RdmMigrationBatchDetail>(`/rdm/stock-migration/batch/${id}/resume`, withRequestId(data))
}

/** 對賬（源數量 = 成功 + 失敗 + 阻塞/跳過；目標 V3 結構逐項可追溯） */
export async function reconcileMigrationBatch(id: number, data: RdmMigrationReconcileForm = {}): Promise<RdmMigrationReconcileResult> {
  return request.post<unknown, RdmMigrationReconcileResult>(`/rdm/stock-migration/batch/${id}/reconcile`, withRequestId(data))
}

/** 保守回退（發現新 V3 事實即整體拒絕、自動暫停，僅結構性逆向、不刪歷史/證據/關聯） */
export async function rollbackMigrationBatch(id: number, data: RdmMigrationRollbackForm): Promise<RdmMigrationRollbackResult> {
  return request.post<unknown, RdmMigrationRollbackResult>(`/rdm/stock-migration/batch/${id}/rollback`, withRequestId(data))
}
