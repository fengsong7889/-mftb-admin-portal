/**
 * 产研需求管理（RDM）API
 *
 * 后端对应 RdmRequirementController 等（/api/rdm/**）。
 * 后端不可用时降级到本地 Mock 数据（src/api/mock/rdmMock），便于界面先行验证。
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

/* ==================== 类型定义 ==================== */

/** 需求列表行 */
export interface RdmRequirementRow {
  id: number
  reqNo: string
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
  expectDate?: string | null
  promisedPrdDate?: string | null
  planReleaseDate?: string | null
  actualReleaseDate?: string | null
  versionNo?: string | null
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
  /** 所属迭代（提交排期时选填，选了才能进迭代的产能对账与周报过滤） */
  iterationCode?: string
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
}

/** 验收用例（返回态，带序号与缺陷统计） */
export interface RdmAcceptanceCase extends RdmAcceptanceCaseForm {
  /** 已落库的用例必有结论 */
  result: string
  id: number
  seq: number
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
}

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
  reqNo: string
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

/** 各视角（Tab）数量 */
export async function fetchScopeCounts(): Promise<Record<string, number>> {
  try {
    return await request.get<unknown, Record<string, number>>('/rdm/requirement/scope-counts', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockScopeCounts()
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
    if (isBackendUnavailable(err)) return mockCreateRequirement(form)
    throw err
  }
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
    if (isBackendUnavailable(err)) {
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

/** 批量分配产品经理（需求池） */
export async function batchAssign(ids: number[], pm: { userId: number; name: string }) {
  try {
    return await request.post<unknown, void>('/rdm/requirement/batch-assign', { ids, pmUserId: pm.userId, pmName: pm.name }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      mockBatchAssign(ids, pm.name)
      return
    }
    throw err
  }
}

/** 添加评论 */
export async function addComment(id: number, content: string, internal = false) {
  try {
    return await request.post<unknown, RdmCommentItem>(`/rdm/requirement/${id}/comment`, { content, internal }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockAddComment(id, content)
    throw err
  }
}

/** 催办 */
export async function urgeRequirement(id: number) {
  try {
    return await request.post<unknown, void>(`/rdm/requirement/${id}/urge`, {}, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return
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
    if (isBackendUnavailable(err)) {
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
    if (isBackendUnavailable(err)) {
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

/** 保存：POST /rdm/config/routing */
export async function saveRoutingRule(rowData: RdmRoutingRow): Promise<RdmRoutingRow[]> {
  try {
    return await request.post<unknown, RdmRoutingRow[]>('/rdm/config/routing', rowData, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockSaveRoutingRule(rowData)
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
    if (isBackendUnavailable(err)) return mockSaveSla(row)
    throw err
  }
}

/** 启停流转规则（停用后详情页按钮立即消失） */
export async function setTransitionEnabled(id: number, enabled: boolean): Promise<RdmTransitionRow[]> {
  try {
    return await request.put<unknown, RdmTransitionRow[]>(`/rdm/config/transition/${id}/enabled?enabled=${enabled}`, {}, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockSetTransitionEnabled(id, enabled)
    throw err
  }
}

/** 启停状态定义（服务端会校验是否仍有需求停在該状态） */
export async function setStatusEnabled(code: string, enabled: boolean): Promise<RdmStatusDefRow[]> {
  try {
    return await request.put<unknown, RdmStatusDefRow[]>(`/rdm/config/status/${code}/enabled?enabled=${enabled}`, {}, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockSetStatusEnabled(code, enabled)
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
    if (isBackendUnavailable(err)) return readFileLocally(file)
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
  taskTotal?: number
  taskDone?: number
  taskBlocked?: number
  overallProgress?: number
  planHoursTotal?: number
  actualHoursTotal?: number
  hoursByType?: { name: string; value: number }[]
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

/** 上报任务进度与工时 */
export function reportTask(id: number, payload: { action: string; progress?: number; actualHours?: number; remark?: string }) {
  return request.post<unknown, RdmTaskItem>(`/rdm/delivery/task/${id}/progress`, payload)
}

/** 删除任务 */
export function deleteTask(id: number) {
  return request.delete<unknown, void>(`/rdm/delivery/task/${id}`)
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
  code: string
  name: string
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
  risks: { reqId: number; reqNo: string; title: string; status: string; handler?: string | null; days: number; riskType: string }[]
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
  reqNo: string
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
    reqNo: string
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
