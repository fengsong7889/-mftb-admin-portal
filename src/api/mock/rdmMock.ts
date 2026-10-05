/**
 * RDM 产研需求管理 —— 本地 Mock 数据源
 *
 * 后端 /api/rdm/** 未接通时由 api/rdm.ts 降级使用（isBackendUnavailable）。
 * 内存态可变更：提交需求、状态流转会在本次会话内生效，便于验证交互闭环。
 */
import dayjs from 'dayjs'
import {
  RDM_ACTION,
  RDM_ROLE,
  RDM_STATUS,
  RDM_STAGE,
  RDM_STATUS_LABEL,
  RDM_STATUS_STAGE,
  RDM_RISK_TYPE,
  RDM_PRIORITY,
  RDM_REQ_TYPE,
  RDM_COMPLEXITY,
  RDM_ACCEPT_RESULT,
  RDM_CASE_RESULT,
  RDM_DEFECT_SEVERITY,
  RDM_DEFECT_SEVERITY_LABEL,
  RDM_TEST_ENV,
  RDM_SCORE_ALLOC_MODE,
  RDM_SCORE_PUSH_STATUS,
  type RdmAction,
  type RdmAcceptResult,
  type RdmAnchorType,
  type RdmCaseResult,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
  type RdmRiskType,
  type RdmRoleCode,
  type RdmStage,
  type RdmStatus,
} from '../../constants/rdm'
import type {
  RdmAcceptanceCase,
  RdmAcceptanceInfo,
  RdmAcceptanceRecord,
  RdmAttachmentItem,
  RdmCommentItem,
  RdmDashboardData,
  RdmMenuTreeNode,
  RdmProductOption,
  RdmQualityData,
  RdmRequirementDetail,
  RdmRequirementRow,
  RdmRoleMember,
  RdmRoutingRow,
  RdmScoreBoardData,
  RdmPrdDraft,
  RdmRiskSummary,
  RdmScoreRecord,
  RdmScoreRule,
  RdmSimilarResult,
  RdmMetricPoint,
  RdmPersonalScore,
  RdmSlaRow,
  RdmStatusDefRow,
  RdmTimelineNode,
  RdmTodoGroup,
  RdmTransitionRow,
  RdmVersionTrace,
  RdmWeeklyReport,
  RdmWorkbenchData,
} from '../rdm'
import { computeScore, DEFAULT_SCORE_PARAMS, sumScorableRoleFactors } from '../../utils/rdmScore'

const now = () => dayjs()
const at = (offsetHours: number, fmt = 'YYYY-MM-DD HH:mm:ss') =>
  now().subtract(offsetHours, 'hour').format(fmt)
const dateAt = (offsetDays: number) => now().subtract(offsetDays, 'day').format('YYYY-MM-DD')

/** 状态集合（避免 TS 字面量收窄） */
const DELIVERY_STATUSES: RdmStatus[] = [
  RDM_STATUS.SCHEDULED, RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING,
  RDM_STATUS.INTEGRATION, RDM_STATUS.TESTING, RDM_STATUS.TEST_PASSED,
]
const DEV_STATUSES: RdmStatus[] = [RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING, RDM_STATUS.INTEGRATION]
const TODO_STATUSES: RdmStatus[] = [RDM_STATUS.INTAKE_PENDING, RDM_STATUS.POOL, RDM_STATUS.UAT_PENDING]
const DONE_STATUSES: RdmStatus[] = [RDM_STATUS.RELEASED, RDM_STATUS.VERIFIED, RDM_STATUS.CLOSED]
const NO_OVERDUE_STATUSES: RdmStatus[] = [RDM_STATUS.DRAFT, RDM_STATUS.CLOSED, RDM_STATUS.RELEASED, RDM_STATUS.VERIFIED]

/** 状态是否落在给定集合内 */
const inStatuses = (list: RdmStatus[], status: string | null | undefined) => list.some(s => s === status)

/** 状态停留小时数（mock 用固定值制造逾期/正常对比） */
const STAY_HOURS: Partial<Record<RdmStatus, number>> = {
  [RDM_STATUS.POOL]: 26,
  [RDM_STATUS.ASSIGNED]: 8,
  [RDM_STATUS.DEVELOPING]: 96,
  [RDM_STATUS.UAT_PENDING]: 30,
}

/** 各阶段默认负责人角色（时间轴生成用） */
const STAGE_OPERATOR: Partial<Record<RdmStatus, { name: string; role: RdmRoleCode }>> = {
  [RDM_STATUS.DRAFT]: { name: '张晓琳', role: RDM_ROLE.SUBMITTER },
  [RDM_STATUS.INTAKE_PENDING]: { name: '张晓琳', role: RDM_ROLE.SUBMITTER },
  [RDM_STATUS.POOL]: { name: '王志强', role: RDM_ROLE.APPROVER },
  [RDM_STATUS.ASSIGNED]: { name: '李海濤', role: RDM_ROLE.DISPATCHER },
  [RDM_STATUS.EVALUATING]: { name: '陳雅婷', role: RDM_ROLE.PM },
  [RDM_STATUS.ACCEPTED]: { name: '陳雅婷', role: RDM_ROLE.PM },
  [RDM_STATUS.PRD_DESIGNING]: { name: '陳雅婷', role: RDM_ROLE.PM },
  [RDM_STATUS.REVIEWING]: { name: '陳雅婷', role: RDM_ROLE.PM },
  [RDM_STATUS.REVIEW_PASSED]: { name: '周建平', role: RDM_ROLE.DEV_LEAD },
  [RDM_STATUS.SCHEDULED]: { name: '周建平', role: RDM_ROLE.DEV_LEAD },
  [RDM_STATUS.DESIGNING]: { name: '林美君', role: RDM_ROLE.DESIGNER },
  [RDM_STATUS.DEVELOPING]: { name: '劉俊傑', role: RDM_ROLE.DEV },
  [RDM_STATUS.INTEGRATION]: { name: '劉俊傑', role: RDM_ROLE.DEV },
  [RDM_STATUS.TESTING]: { name: '黃嘉欣', role: RDM_ROLE.QA },
  [RDM_STATUS.TEST_PASSED]: { name: '黃嘉欣', role: RDM_ROLE.QA },
  [RDM_STATUS.UAT_PENDING]: { name: '劉俊傑', role: RDM_ROLE.DEV },
  [RDM_STATUS.RELEASED]: { name: '陳雅婷', role: RDM_ROLE.PM },
  [RDM_STATUS.VERIFIED]: { name: '张晓琳', role: RDM_ROLE.ACCEPTOR },
  [RDM_STATUS.CLOSED]: { name: '趙敏', role: RDM_ROLE.PMO },
}

/** 主线状态序列（用于回溯生成时间轴） */
const MAIN_PATH: RdmStatus[] = [
  RDM_STATUS.DRAFT,
  RDM_STATUS.INTAKE_PENDING,
  RDM_STATUS.POOL,
  RDM_STATUS.ASSIGNED,
  RDM_STATUS.EVALUATING,
  RDM_STATUS.ACCEPTED,
  RDM_STATUS.PRD_DESIGNING,
  RDM_STATUS.REVIEWING,
  RDM_STATUS.REVIEW_PASSED,
  RDM_STATUS.SCHEDULED,
  RDM_STATUS.DESIGNING,
  RDM_STATUS.DEVELOPING,
  RDM_STATUS.INTEGRATION,
  RDM_STATUS.TESTING,
  RDM_STATUS.TEST_PASSED,
  RDM_STATUS.UAT_PENDING,
  RDM_STATUS.RELEASED,
  RDM_STATUS.VERIFIED,
  RDM_STATUS.CLOSED,
]

/** 按当前状态回溯生成流转时间轴（mock 一致性保证） */
function buildTimeline(status: RdmStatus, hoursAgo: number): RdmTimelineNode[] {
  const idx = MAIN_PATH.indexOf(status)
  const reached = idx >= 0 ? MAIN_PATH.slice(0, idx + 1) : [RDM_STATUS.DRAFT, RDM_STATUS.INTAKE_PENDING]
  let cursor = hoursAgo
  return reached.map((st, i) => {
    const op = STAGE_OPERATOR[st] ?? { name: '系統', role: RDM_ROLE.CC }
    const step = i === reached.length - 1 ? 0 : 6 + (i % 5) * 4
    cursor = Math.max(cursor - step, 0)
    const node: RdmTimelineNode = {
      id: i + 1,
      status: st,
      statusLabel: RDM_STATUS_LABEL[st],
      operatorName: op.name,
      operatorRole: op.role,
      time: at(cursor),
      durationHours: i === reached.length - 1 ? (STAY_HOURS[st] ?? 4) : step,
      remark: i === 0 ? '需求已提交' : undefined,
    }
    return node
  }).reverse()
}

function buildRoles(submitter: string, dept: string, pmName?: string, devLead?: string): RdmRoleMember[] {
  const roles: RdmRoleMember[] = [
    { userId: 9001, empNo: 'MF0901', name: submitter, roleCode: RDM_ROLE.SUBMITTER, joinTime: at(120), active: true },
    { userId: 9002, empNo: 'MF0902', name: '王志强', roleCode: RDM_ROLE.APPROVER, joinTime: at(120), active: true },
    { userId: 9003, empNo: 'MF0903', name: '李海濤', roleCode: RDM_ROLE.DISPATCHER, joinTime: at(118), active: true },
    { userId: 9010, empNo: 'MF0910', name: dept === '商家運營部' ? '張偉' : '孫麗', roleCode: RDM_ROLE.DEPT_LEADER, joinTime: at(120), active: true },
    { userId: 9011, empNo: 'MF0911', name: '趙敏', roleCode: RDM_ROLE.PMO, joinTime: at(118), active: true },
    { userId: 9004, empNo: 'MF0904', name: submitter, roleCode: RDM_ROLE.ACCEPTOR, joinTime: at(120), active: true },
  ]
  if (pmName) {
    roles.push({ userId: 9005, empNo: 'MF0905', name: pmName, roleCode: RDM_ROLE.PM, joinTime: at(110), active: true })
  }
  if (devLead) {
    roles.push(
      { userId: 9006, empNo: 'MF0906', name: devLead, roleCode: RDM_ROLE.DEV_LEAD, joinTime: at(96), active: true },
      { userId: 9007, empNo: 'MF0907', name: '林美君', roleCode: RDM_ROLE.DESIGNER, joinTime: at(80), active: true },
      { userId: 9008, empNo: 'MF0908', name: '劉俊傑', roleCode: RDM_ROLE.DEV, joinTime: at(80), active: true },
      { userId: 9009, empNo: 'MF0909', name: '黃嘉欣', roleCode: RDM_ROLE.QA, joinTime: at(40), active: true },
    )
  }
  return roles
}

const COMMENTS: RdmCommentItem[] = [
  {
    id: 1,
    content: '補充說明：目前只能導出當月數據，希望支持自定義時間區間，財務對帳時反覆導出很費時間。',
    authorName: '张晓琳',
    authorRole: RDM_ROLE.SUBMITTER,
    createdAt: at(96),
  },
  {
    id: 2,
    content: '已確認需求，本週五前出 PRD。請業務提供對帳模板以便校準字段口徑。',
    authorName: '陳雅婷',
    authorRole: RDM_ROLE.PM,
    createdAt: at(80),
  },
  {
    id: 3,
    content: '@劉俊傑 這個改動涉及匯出接口分頁，評估 2 個工日，排進本迭代。',
    authorName: '周建平',
    authorRole: RDM_ROLE.DEV_LEAD,
    createdAt: at(60),
  },
  {
    id: 4,
    content: '測試環境已驗證通過，待業務側在預發環境驗收。',
    authorName: '黃嘉欣',
    authorRole: RDM_ROLE.QA,
    createdAt: at(20),
    internal: true,
  },
]

function buildAttachments(): RdmAttachmentItem[] {
  return [
    { id: 1, fileName: '對帳現狀截图.png', fileUrl: '', fileType: 'image/png', fileSize: 268_435, uploaderName: '张晓琳', createdAt: at(120) },
    { id: 2, fileName: '財務匯出模板.xlsx', fileUrl: '', fileType: 'application/vnd.ms-excel', fileSize: 45_102, uploaderName: '张晓琳', createdAt: at(120) },
  ]
}

/** mock 需求主数据（模块级可变，会话内提交/流转生效） */
let requirements: RdmRequirementRow[] = [
  row(1, 'XQ202609260001', '推薦報表支持自定義時間區間導出', RDM_REQ_TYPE.DATA, RDM_PRIORITY.P1, RDM_COMPLEXITY.MEDIUM,
    RDM_STATUS.UAT_PENDING, '张晓琳', '商家運營部', 30, '陳雅婷', '周建平', 2, 5, { versionNo: undefined }),
  row(2, 'XQ202609250003', '門店列表新增「停業風險」標籤列', RDM_REQ_TYPE.OPTIMIZE, RDM_PRIORITY.P2, RDM_COMPLEXITY.SIMPLE,
    RDM_STATUS.DEVELOPING, '孫小紅', '渠道拓展部', 84, '林志豪', '周建平', 3, 12),
  row(3, 'XQ202609240002', '新增「達人生態」獨立菜單與結算報表', RDM_REQ_TYPE.NEW_MENU, RDM_PRIORITY.P2, RDM_COMPLEXITY.HUGE,
    RDM_STATUS.POOL, '王大衛', '市場營銷部', 120, undefined, undefined, undefined, undefined),
  row(4, 'XQ202609240001', '贈送管理批量導入提示行號不準確', RDM_REQ_TYPE.BUG, RDM_PRIORITY.P0, RDM_COMPLEXITY.SIMPLE,
    RDM_STATUS.TESTING, '李娜', '客戶成功部', 100, '陳雅婷', '周建平', 0, 1),
  row(5, 'XQ202609230004', '財務對賬增加銀行回單附件上傳', RDM_REQ_TYPE.NEW_FEATURE, RDM_PRIORITY.P1, RDM_COMPLEXITY.MEDIUM,
    RDM_STATUS.RELEASED, '周曉東', '財務部', 150, '林志豪', '周建平', 4, 30),
  row(6, 'XQ202609220002', '員工AI額度支持按部門池化分配', RDM_REQ_TYPE.POLICY, RDM_PRIORITY.P2, RDM_COMPLEXITY.COMPLEX,
    RDM_STATUS.REVIEWING, '張偉', '集团人事處', 200, '陳雅婷', '周建平', 6, 20),
  row(7, 'XQ202609210001', '资产領用單支持釘釘手機端簽收', RDM_REQ_TYPE.INTEGRATION, RDM_PRIORITY.P1, RDM_COMPLEXITY.COMPLEX,
    RDM_STATUS.ACCEPTED, '孫麗', '行政後勤部', 240, '林志豪', undefined, 8, 25),
  row(8, 'XQ202609190003', '搜索同詞庫編輯頁增加批量替換', RDM_REQ_TYPE.OPTIMIZE, RDM_PRIORITY.P3, RDM_COMPLEXITY.SIMPLE,
    RDM_STATUS.ASSIGNED, '陳晨', '搜索運營部', 300, '陳雅婷', undefined, 14, 40),
  row(9, 'XQ202609180002', '盤活復蘇訂單費用明細展示不全', RDM_REQ_TYPE.BUG, RDM_PRIORITY.P1, RDM_COMPLEXITY.SIMPLE,
    RDM_STATUS.REJECTED, '趙蕾', '商家運營部', 360, '林志豪', undefined, undefined, undefined, {
      rejectReason: '與現有費用明細口徑一致，屬業務理解偏差，已線下說明並提供查詢指引',
    }),
  row(10, 'XQ202609170005', '新增商戶分層定價策略配置', RDM_REQ_TYPE.POLICY, RDM_PRIORITY.P2, RDM_COMPLEXITY.MEDIUM,
    RDM_STATUS.INTAKE_PENDING, '刘洋', '渠道拓展部', 400, undefined, undefined, undefined, undefined),
  row(11, 'XQ202609160001', '績效考核結果支持員工自助查詢與申訴入口', RDM_REQ_TYPE.NEW_FEATURE, RDM_PRIORITY.P2, RDM_COMPLEXITY.MEDIUM,
    RDM_STATUS.DRAFT, '張偉', '集团人事處', 500, undefined, undefined, undefined, undefined),
  row(12, 'XQ202609150004', '地圖規劃支持門店聚類熱力展示', RDM_REQ_TYPE.OPTIMIZE, RDM_PRIORITY.P3, RDM_COMPLEXITY.COMPLEX,
    RDM_STATUS.ON_HOLD, '王大衛', '市場營銷部', 600, '陳雅婷', undefined, 20, undefined),
]

/** 构造行数据（保持 mock 字段一致性） */
function row(
  id: number,
  reqNo: string,
  title: string,
  reqType: RdmReqType,
  priority: RdmPriority,
  complexity: RdmComplexity,
  status: RdmStatus,
  submitterName: string,
  submitDeptName: string,
  stayHours: number,
  pmName?: string,
  devLead?: string,
  progress?: number,
  planOffsetDays?: number,
  extra?: Partial<RdmRequirementRow>,
): RdmRequirementRow {
  return {
    id,
    reqNo,
    title,
    reqType,
    priority,
    complexity,
    status,
    stage: statusStage(status),
    submitterName,
    submitterEmpNo: `MF${1000 + id}`,
    submitDeptName,
    submitTime: at(stayHours + 24),
    pmName,
    devOwnerName: devLead,
    dispatcherName: pmName ? '李海濤' : undefined,
    expectDate: dateAt(-(30 - id)),
    promisedPrdDate: pmName ? dateAt(-(10 - (id % 8))) : undefined,
    planReleaseDate: planOffsetDays ? dateAt(-(planOffsetDays - 20)) : undefined,
    actualReleaseDate: status === RDM_STATUS.RELEASED ? dateAt(-2) : undefined,
    versionNo: status === RDM_STATUS.RELEASED ? '2.9.0' : undefined,
    progress,
    blockedFlag: false,
    overdueFlag: isOverdue(status, stayHours, priority),
    stayHours,
    currentHandler: currentHandlerOf(status, pmName, devLead, submitterName),
    updatedAt: at(stayHours),
    ...extra,
  }
}

/**
 * 状态 → 阶段：直接取 constants 里的权威映射。
 * <p>不得在本文件再维护一份状态→阶段表：旧版把它写成下方单独的 STAGE_OF 常量，
 * 却在上面的 `requirements` 初始化路径里被调用 → 模块加载即踩 TDZ，
 * 导致全站渲染异常。现在无顶层状态表，不存在读取时序问题。
 */
function statusStage(status: RdmStatus): RdmStage {
  return RDM_STATUS_STAGE[status] ?? RDM_STAGE.DISPATCH
}

function currentHandlerOf(
  status: RdmStatus,
  pmName?: string | null,
  devLead?: string | null,
  submitter?: string | null,
): string {
  if (status === RDM_STATUS.POOL) return '李海濤'
  if (status === RDM_STATUS.INTAKE_PENDING) return '王志强'
  if (status === RDM_STATUS.UAT_PENDING) return submitter ?? '業務方'
  if (inStatuses(DEV_STATUSES, status)) return devLead ?? '研發組'
  if (status === RDM_STATUS.TESTING) return '黃嘉欣'
  return pmName ?? '待分配'
}

/** 逾期判定（mock 简化口径：按优先级 SLA 小时 * 24 与停留小时比较） */
function isOverdue(status: RdmStatus, stayHours: number, priority: RdmPriority): boolean {
  if (inStatuses(NO_OVERDUE_STATUSES, status)) return false
  const sla = { [RDM_PRIORITY.P0]: 24, [RDM_PRIORITY.P1]: 72, [RDM_PRIORITY.P2]: 168, [RDM_PRIORITY.P3]: 336 }[priority]
  return stayHours > sla
}

const DETAILS: Record<number, Partial<RdmRequirementDetail>> = {
  1: {
    description:
      '現狀：推廣報表僅能導出「本月 / 上個月」兩個固定區間，跨月對帳需要反覆切換並手工合併。\n期望：報表頁面增加自定義開始/結束日期選擇器，一次導出任意區間，並在文件名帶上區間信息。',
    expectResult: '支持自定義日期區間導出，单次最多 90 天，导出文件命名含区间。',
    businessValue: '每月對帳节省财务与运营约 6 人时，减少手工合并导致的口径错误。',
    targets: [
      {
        anchorType: 'MENU' as unknown as RdmAnchorType,
        systemCode: 'ads',
        systemName: '廣告推薦系統',
        menuKey: 'promotion-report-overview',
        menuName: '報表分析',
        anchorName: '導出按鈕',
        anchorDesc: '報表頂部「導出」按鈕的时间区间逻辑',
      },
    ],
    attachments: buildAttachments(),
    comments: COMMENTS,
    acceptance: {
      acceptNo: 'XQYS202609290001',
      result: undefined,
      caseTotal: 8,
      casePass: 8,
      acceptorName: '张晓琳',
      opinion: undefined,
    } as RdmAcceptanceInfo,
  },
  4: {
    description: '批量導入贈送明細時，模板第 3 行報錯卻提示第 1 行，反饋無法定位具體問題行。',
    expectResult: '錯誤提示行號與模板行號一致，並支持一次返回全部錯誤行。',
    businessValue: '避免运营反复排查，单次导入节省 10~20 分钟。',
    targets: [
      {
        anchorType: 'BUTTON' as unknown as RdmAnchorType,
        systemCode: 'ads',
        systemName: '廣告推薦系統',
        menuKey: 'gift-detail',
        menuName: '贈送管理',
        anchorName: '批量導入',
        anchorDesc: '導入錯誤提示行號',
      },
    ],
  },
  5: {
    description: '財務對賬需上傳銀行回單作為憑證附件，當前只能線下留檔，審計追溯困難。',
    expectResult: '對賬明細支持多附件上傳（jpg/png/pdf，單個 ≤5MB），並在詳情頁可查看。',
    businessValue: '滿足內審憑證要求，縮短審計資料準備週期。',
    targets: [
      {
        anchorType: 'PAGE' as unknown as RdmAnchorType,
        systemCode: 'finance',
        systemName: '財務系統',
        menuKey: 'writeoff-reconcile',
        menuName: '核銷對賬',
        anchorName: '詳情頁附件區',
      },
    ],
    acceptance: { result: 'pass' as RdmAcceptResult, score: 5, acceptorName: '周曉東', acceptTime: at(30) },
  },
}

/** 系统 → 菜单 级联树（提需求时定位用，真实接口来自 sys_system + sys_menu） */
const MENU_TREE: RdmMenuTreeNode[] = [
  {
    key: 'ads',
    title: '廣告推薦系統',
    children: [
      { key: 'promotion-report-overview', title: '報表分析' },
      { key: 'promotion-order-manage', title: '訂單管理' },
      { key: 'promotion-sales-config', title: '購買入口' },
      { key: 'gift-detail', title: '贈送管理' },
      { key: 'group-purchase-dashboard', title: '團購管理' },
    ],
  },
  {
    key: 'search',
    title: '搜索運營系統',
    children: [
      { key: 'hot-search-library', title: '熱搜詞庫' },
      { key: 'synonym-config', title: '同義詞配置' },
      { key: 'hint-config', title: '引導詞配置' },
      { key: 'promotion-word-library', title: '詞庫管理' },
    ],
  },
  {
    key: 'merchant',
    title: '商戶運營系統',
    children: [
      { key: 'merchant-group-list', title: '集團管理' },
      { key: 'store-list', title: '門店管理' },
      { key: 'store-data-config', title: '門店數據配置' },
    ],
  },
  {
    key: 'finance',
    title: '財務系統',
    children: [
      { key: 'account-balance', title: '賬戶餘額' },
      { key: 'writeoff-reconcile', title: '核銷對賬' },
      { key: 'debt-reconcile', title: '欠款對賬' },
    ],
  },
  {
    key: 'eam',
    title: '物資管理系統',
    children: [
      { key: 'asset-management', title: '資產台賬' },
      { key: 'asset-claim', title: '領用管理' },
      { key: 'purchase-order', title: '採購訂單' },
    ],
  },
  {
    key: 'hr',
    title: 'HR 系統',
    children: [
      { key: 'employee-management', title: '員工管理' },
      { key: 'hr-perf-plan', title: '績效考核' },
      { key: 'hr-leave', title: '請假管理' },
    ],
  },
]

/** 功能点候选（按菜单 key 索引，真实接口来自页面 PRD） */
const FUNCTION_POINTS: Record<string, { key: string; title: string }[]> = {
  'promotion-report-overview': [
    { key: 'date-range', title: '時間區間篩選' },
    { key: 'export', title: '報表導出' },
    { key: 'brand-tab', title: '品牌切換頁簽' },
  ],
  'store-list': [
    { key: 'column-config', title: '列配置' },
    { key: 'risk-tag', title: '風險標籤列' },
    { key: 'batch-import', title: '批量導入' },
  ],
  'gift-detail': [{ key: 'batch-import', title: '批量導入' }, { key: 'expire-notify', title: '到期提醒' }],
  'writeoff-reconcile': [{ key: 'attachment', title: '憑證附件' }, { key: 'reconcile-diff', title: '差異處理' }],
}

const PM_OPTIONS: RdmProductOption[] = [
  { userId: 9005, empNo: 'MF0905', name: '陳雅婷', deptName: '產品部', domains: ['廣告推薦', '財務'], activeCount: 5, capacity: 8 },
  { userId: 9012, empNo: 'MF0912', name: '林志豪', deptName: '產品部', domains: ['物資管理', 'HR', '門店'], activeCount: 7, capacity: 8 },
  { userId: 9013, empNo: 'MF0913', name: '蘇婉晴', deptName: '產品部', domains: ['搜索運營', '多語言'], activeCount: 3, capacity: 8 },
]

const ROUTING_ROWS: RdmRoutingRow[] = [
  { id: 1, scopeType: 'SYSTEM', scopeValue: 'ads', scopeName: '廣告推薦系統', pmUserId: 9005, pmName: '陳雅婷', backupPmName: '蘇婉晴', loadCapacity: 8, activeCount: 5, priority: 1, enabled: true },
  { id: 2, scopeType: 'SYSTEM', scopeValue: 'finance', scopeName: '財務系統', pmUserId: 9005, pmName: '陳雅婷', loadCapacity: 8, activeCount: 5, priority: 2, enabled: true },
  { id: 3, scopeType: 'SYSTEM', scopeValue: 'eam', scopeName: '物資管理系統', pmUserId: 9012, pmName: '林志豪', loadCapacity: 8, activeCount: 7, priority: 3, enabled: true },
  { id: 4, scopeType: 'DEPT', scopeValue: '9002', scopeName: '集团人事處', pmUserId: 9012, pmName: '林志豪', loadCapacity: 8, activeCount: 7, priority: 4, enabled: true },
  { id: 5, scopeType: 'MENU', scopeValue: 'hot-search-library', scopeName: '熱搜詞庫', pmUserId: 9013, pmName: '蘇婉晴', loadCapacity: 8, activeCount: 3, priority: 5, enabled: false },
]

const SLA_ROWS: RdmSlaRow[] = [
  { statusCode: RDM_STATUS.INTAKE_PENDING, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.INTAKE_PENDING], priority: '', slaHours: 24, warnHours: 20, escalateRole: RDM_ROLE.DEPT_LEADER, enabled: true },
  { statusCode: RDM_STATUS.POOL, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.POOL], priority: '', slaHours: 48, warnHours: 40, escalateRole: RDM_ROLE.DISPATCHER, enabled: true },
  { statusCode: RDM_STATUS.ASSIGNED, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.ASSIGNED], priority: '', slaHours: 24, warnHours: 18, escalateRole: RDM_ROLE.PM, enabled: true },
  { statusCode: RDM_STATUS.DEVELOPING, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.DEVELOPING], priority: RDM_PRIORITY.P1, slaHours: 120, warnHours: 96, escalateRole: RDM_ROLE.DEV_LEAD, enabled: true },
  { statusCode: RDM_STATUS.TESTING, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.TESTING], priority: RDM_PRIORITY.P1, slaHours: 48, warnHours: 36, escalateRole: RDM_ROLE.QA, enabled: true },
  { statusCode: RDM_STATUS.UAT_PENDING, statusLabel: RDM_STATUS_LABEL[RDM_STATUS.UAT_PENDING], priority: '', slaHours: 72, warnHours: 60, escalateRole: RDM_ROLE.ACCEPTOR, enabled: true },
]

const STATUS_DEFS: RdmStatusDefRow[] = (Object.keys(RDM_STATUS_LABEL) as RdmStatus[]).map((code, idx) => ({
  code,
  label: RDM_STATUS_LABEL[code],
  stage: statusStage(code),
  sortNo: idx + 1,
  finalFlag: code === RDM_STATUS.CLOSED,
  enabled: true,
}))

const TRANSITIONS: RdmTransitionRow[] = [
  tr(1, RDM_STATUS.DRAFT, RDM_STATUS.INTAKE_PENDING, RDM_ACTION.SUBMIT, [RDM_ROLE.SUBMITTER], []),
  tr(2, RDM_STATUS.DRAFT, RDM_STATUS.POOL, RDM_ACTION.SUBMIT, [RDM_ROLE.SUBMITTER], []),
  tr(3, RDM_STATUS.INTAKE_PENDING, RDM_STATUS.POOL, RDM_ACTION.ACCEPT, [RDM_ROLE.APPROVER], []),
  tr(4, RDM_STATUS.INTAKE_PENDING, RDM_STATUS.INTAKE_REJECTED, RDM_ACTION.REJECT, [RDM_ROLE.APPROVER], ['remark']),
  tr(5, RDM_STATUS.INTAKE_PENDING, RDM_STATUS.DRAFT, RDM_ACTION.WITHDRAW, [RDM_ROLE.SUBMITTER], []),
  tr(6, RDM_STATUS.INTAKE_REJECTED, RDM_STATUS.INTAKE_PENDING, RDM_ACTION.RESUBMIT, [RDM_ROLE.SUBMITTER], []),
  tr(7, RDM_STATUS.POOL, RDM_STATUS.ASSIGNED, RDM_ACTION.DISPATCH, [RDM_ROLE.DISPATCHER], ['pm']),
  tr(8, RDM_STATUS.ASSIGNED, RDM_STATUS.EVALUATING, RDM_ACTION.START_EVALUATE, [RDM_ROLE.PM], []),
  tr(9, RDM_STATUS.EVALUATING, RDM_STATUS.ACCEPTED, RDM_ACTION.ACCEPT, [RDM_ROLE.PM], ['promisedDate']),
  tr(10, RDM_STATUS.EVALUATING, RDM_STATUS.REJECTED, RDM_ACTION.REJECT, [RDM_ROLE.PM], ['remark']),
  tr(11, RDM_STATUS.EVALUATING, RDM_STATUS.ON_HOLD, RDM_ACTION.HOLD, [RDM_ROLE.PM], ['remark', 'holdUntil']),
  tr(12, RDM_STATUS.ON_HOLD, RDM_STATUS.EVALUATING, RDM_ACTION.UNHOLD, [RDM_ROLE.PM], []),
  tr(13, RDM_STATUS.ACCEPTED, RDM_STATUS.PRD_DESIGNING, RDM_ACTION.PRD_START, [RDM_ROLE.PM], []),
  tr(14, RDM_STATUS.PRD_DESIGNING, RDM_STATUS.REVIEWING, RDM_ACTION.REVIEW_START, [RDM_ROLE.PM], []),
  tr(15, RDM_STATUS.REVIEWING, RDM_STATUS.REVIEW_PASSED, RDM_ACTION.REVIEW_PASS, [RDM_ROLE.DEV_LEAD], []),
  tr(16, RDM_STATUS.REVIEW_PASSED, RDM_STATUS.SCHEDULED, RDM_ACTION.SCHEDULE, [RDM_ROLE.DEV_LEAD, RDM_ROLE.PMO], ['planDate']),
  tr(17, RDM_STATUS.SCHEDULED, RDM_STATUS.DESIGNING, RDM_ACTION.DESIGN_START, [RDM_ROLE.DESIGNER], []),
  tr(18, RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING, RDM_ACTION.DESIGN_DONE, [RDM_ROLE.DESIGNER], []),
  tr(19, RDM_STATUS.DEVELOPING, RDM_STATUS.INTEGRATION, RDM_ACTION.DEV_DONE, [RDM_ROLE.DEV], []),
  tr(20, RDM_STATUS.INTEGRATION, RDM_STATUS.TESTING, RDM_ACTION.TEST_START, [RDM_ROLE.QA], []),
  tr(21, RDM_STATUS.TESTING, RDM_STATUS.TEST_PASSED, RDM_ACTION.TEST_DONE, [RDM_ROLE.QA], []),
  tr(22, RDM_STATUS.TEST_PASSED, RDM_STATUS.UAT_PENDING, RDM_ACTION.SUBMIT_UAT, [RDM_ROLE.QA, RDM_ROLE.PM], []),
  tr(23, RDM_STATUS.UAT_PENDING, RDM_STATUS.RELEASED, RDM_ACTION.RELEASE, [RDM_ROLE.PM], ['versionNo', 'planDate']),
  tr(24, RDM_STATUS.UAT_PENDING, RDM_STATUS.DEVELOPING, RDM_ACTION.UAT_FAIL, [RDM_ROLE.ACCEPTOR], ['remark']),
  tr(25, RDM_STATUS.RELEASED, RDM_STATUS.VERIFIED, RDM_ACTION.VERIFY, [RDM_ROLE.ACCEPTOR], ['score']),
  tr(26, RDM_STATUS.VERIFIED, RDM_STATUS.CLOSED, RDM_ACTION.CLOSE, [RDM_ROLE.PMO], []),
  tr(27, RDM_STATUS.REJECTED, RDM_STATUS.INTAKE_PENDING, RDM_ACTION.REOPEN, [RDM_ROLE.SUBMITTER], ['remark']),
]

function tr(
  id: number,
  fromStatus: RdmStatus,
  toStatus: RdmStatus,
  actionCode: RdmAction,
  allowedRoles: RdmRoleCode[],
  requiredFields: string[],
): RdmTransitionRow {
  return {
    id,
    fromStatus,
    toStatus,
    actionCode,
    actionName: '',
    allowedRoles,
    requiredFields,
    enabled: true,
  }
}

/* ==================== 对外 mock 接口 ==================== */

export function mockListRequirements(params: {
  keyword?: string
  scope?: string
  reqType?: string
  priority?: string
  status?: string
  deptName?: string
  pmName?: string
}): RdmRequirementRow[] {
  let list = [...requirements]
  if (params.scope === 'mine') list = list.filter(r => r.submitterName === '张晓琳')
  if (params.scope === 'pool') list = list.filter(r => r.status === RDM_STATUS.POOL)
  if (params.scope === 'product') list = list.filter(r => r.pmName === '陳雅婷')
  if (params.scope === 'acceptance') list = list.filter(r => r.status === RDM_STATUS.UAT_PENDING)
  if (params.scope === 'delivery') {
    list = list.filter(r => inStatuses(DELIVERY_STATUSES, r.status))
  }
  if (params.scope === 'todo') {
    list = list.filter(r => inStatuses(TODO_STATUSES, r.status))
  }
  if (params.keyword) {
    const kw = params.keyword.toLowerCase()
    list = list.filter(r => r.title.toLowerCase().includes(kw) || r.reqNo.toLowerCase().includes(kw) || r.submitterName.includes(params.keyword!))
  }
  if (params.reqType) list = list.filter(r => r.reqType === params.reqType)
  if (params.priority) list = list.filter(r => r.priority === params.priority)
  if (params.status) list = list.filter(r => r.status === params.status)
  if (params.deptName) list = list.filter(r => (r.submitDeptName ?? '').includes(params.deptName!))
  if (params.pmName) list = list.filter(r => r.pmName === params.pmName)
  return list
}

export function mockScopeCounts(): Record<string, number> {
  const by = (fn: (r: RdmRequirementRow) => boolean) => requirements.filter(fn).length
  return {
    mine: by(r => r.submitterName === '张晓琳'),
    todo: by(r => inStatuses(TODO_STATUSES, r.status)),
    // 近似口径：真实环境里审批人只存在于 OA 审批任务表，mock 无这层数据，
    // 所以用「待准入」状态代替（仅用于后端不可用时的 Tab 计数展示）
    approving: by(r => r.status === RDM_STATUS.INTAKE_PENDING),
    pool: by(r => r.status === RDM_STATUS.POOL),
    product: by(r => r.pmName === '陳雅婷'),
    delivery: by(r => inStatuses(DELIVERY_STATUSES, r.status)),
    acceptance: by(r => r.status === RDM_STATUS.UAT_PENDING),
    all: requirements.length,
  }
}

export function mockGetRequirement(id: number): RdmRequirementDetail | null {
  const base = requirements.find(r => r.id === id)
  if (!base) return null
  const detail = DETAILS[id] ?? {}
  const stayHours = base.stayHours ?? 12
  return {
    ...base,
    description: detail.description ?? base.title,
    expectResult: detail.expectResult,
    businessValue: detail.businessValue,
    sourceChannel: 'WEB',
    targets: detail.targets ?? [],
    roles: buildRoles(base.submitterName, base.submitDeptName ?? '', base.pmName ?? undefined, base.devOwnerName ?? undefined),
    timeline: buildTimeline(base.status as RdmStatus, stayHours + 24),
    comments: detail.comments ?? (id <= 2 ? COMMENTS : COMMENTS.slice(0, 2)),
    attachments: detail.attachments ?? [],
    approvalNodes: [
      { nodeName: '直屬上級審批', approverName: '王志强', status: base.status === RDM_STATUS.INTAKE_PENDING ? 'pending' : 'approved', time: base.status === RDM_STATUS.INTAKE_PENDING ? undefined : at(stayHours + 12), comment: base.status === RDM_STATUS.INTAKE_PENDING ? undefined : '需求成立，同意進入需求池' },
    ],
    acceptance: detail.acceptance,
    sla: {
      statusCode: base.status,
      slaHours: 72,
      remainHours: Math.max(72 - stayHours, -24),
      warnHours: 60,
      overdue: base.overdueFlag === true,
    },
  }
}

export function mockCreateRequirement(form: {
  title: string
  reqType: RdmReqType | string
  priority: RdmPriority | string
  complexity?: RdmComplexity | string
  expectDate?: string
  description?: string
  assignMode?: string
  pmName?: string
}): RdmRequirementRow {
  const id = Math.max(...requirements.map(r => r.id)) + 1
  const created: RdmRequirementRow = {
    id,
    reqNo: `XQ${now().format('YYYYMMDD')}${String(100 + id).slice(-4)}`,
    title: form.title,
    reqType: form.reqType,
    priority: form.priority,
    complexity: form.complexity,
    status: form.assignMode === 'PM' ? RDM_STATUS.ASSIGNED : RDM_STATUS.POOL,
    stage: RDM_STAGE.DISPATCH,
    submitterName: '张晓琳',
    submitterEmpNo: `MF${1000 + id}`,
    submitDeptName: '商家運營部',
    submitTime: at(0),
    pmName: form.pmName,
    dispatcherName: form.assignMode === 'PM' ? undefined : '李海濤',
    expectDate: form.expectDate,
    progress: 0,
    blockedFlag: false,
    overdueFlag: false,
    stayHours: 0,
    currentHandler: form.assignMode === 'PM' ? form.pmName : '李海濤',
    updatedAt: at(0),
  }
  requirements = [created, ...requirements]
  if (!DETAILS[id]) DETAILS[id] = { description: form.description }
  return created
}

/** 状态流转（mock：更新主数据状态并追加时间轴） */
export function mockTransition(id: number, actionCode: RdmAction | string, extra?: Partial<RdmRequirementRow>): RdmRequirementRow | null {
  const idx = requirements.findIndex(r => r.id === id)
  if (idx < 0) return null
  const cur = requirements[idx]
  // 同一动作码可能出现在不同起始状态（如 accept：审批通过 / 产品受理），必须按当前状态精确匹配
  const target = TRANSITIONS.find(t => t.actionCode === actionCode && t.fromStatus === cur.status)
  const next: RdmRequirementRow = {
    ...cur,
    status: (extra?.status ?? target?.toStatus ?? cur.status) as RdmStatus,
    stage: statusStage((extra?.status ?? target?.toStatus ?? cur.status) as RdmStatus),
    updatedAt: at(0),
    stayHours: 0,
    overdueFlag: false,
    ...extra,
  }
  next.currentHandler = currentHandlerOf(next.status as RdmStatus, next.pmName, next.devOwnerName, next.submitterName)
  next.overdueFlag = isOverdue(next.status as RdmStatus, 0, next.priority as RdmPriority)
  requirements[idx] = next
  return next
}

export function mockBatchAssign(ids: number[], pmName: string): void {
  requirements = requirements.map(r =>
    ids.includes(r.id)
      ? { ...r, status: RDM_STATUS.ASSIGNED, stage: RDM_STAGE.DISPATCH, pmName, currentHandler: pmName, dispatcherName: '李海濤', updatedAt: at(0), stayHours: 0 }
      : r,
  )
}

export function mockAddComment(reqId: number, content: string): RdmCommentItem {
  const item: RdmCommentItem = {
    id: Date.now(),
    content,
    authorName: '张晓琳',
    authorRole: RDM_ROLE.SUBMITTER,
    createdAt: at(0),
  }
  const detail = mockGetRequirement(reqId)
  if (detail) COMMENTS.push(item)
  return item
}

export function mockWorkbench(): RdmWorkbenchData {
  const mine = requirements.filter(r => r.submitterName === '张晓琳')
  const todoRows = requirements.filter(r => r.status === RDM_STATUS.POOL || r.status === RDM_STATUS.INTAKE_PENDING)
  const toAccept = requirements.filter(r => r.status === RDM_STATUS.UAT_PENDING)
  const released = requirements.filter(r => inStatuses(DONE_STATUSES, r.status))
  const groups: RdmTodoGroup[] = [
    { key: 'intake', title: '需求審批（我是審批人）', hint: '審批通過後進入需求池', total: requirements.filter(r => r.status === RDM_STATUS.INTAKE_PENDING).length, items: requirements.filter(r => r.status === RDM_STATUS.INTAKE_PENDING) },
    { key: 'pool', title: '需求池待分配（我是技術負責人）', hint: '分配產品經理後進入受理', total: requirements.filter(r => r.status === RDM_STATUS.POOL).length, items: requirements.filter(r => r.status === RDM_STATUS.POOL) },
    { key: 'product', title: '我負責的產品需求（我是產品經理）', hint: '需盡快給出受理結論與排期', total: requirements.filter(r => r.pmName === '陳雅婷').length, items: requirements.filter(r => r.pmName === '陳雅婷') },
    { key: 'acceptance', title: '待我驗收（我是業務驗收人）', hint: '驗收通過後才可確認上線', total: toAccept.length, items: toAccept },
  ]
  return {
    identity: { name: '张晓琳', empNo: 'MF1001', deptName: '商家運營部', roleNames: ['需求提出人', '業務驗收人'] },
    todos: groups,
    stats: {
      mineTotal: mine.length,
      mineProgress: mine.filter(r => !([RDM_STATUS.CLOSED, RDM_STATUS.RELEASED] as string[]).includes(r.status)).length,
      todoTotal: todoRows.length,
      overdueTotal: requirements.filter(r => r.overdueFlag).length,
      toAcceptTotal: toAccept.length,
      deliveredTotal: released.length,
    },
    recentActivity: buildTimeline(RDM_STATUS.UAT_PENDING, 40).slice(0, 6),
  }
}

export function mockMenuTree(): RdmMenuTreeNode[] {
  return MENU_TREE
}

export function mockFunctionPoints(menuKey?: string): { key: string; title: string }[] {
  if (!menuKey) return []
  return FUNCTION_POINTS[menuKey] ?? []
}

export function mockProductOptions(): RdmProductOption[] {
  return PM_OPTIONS
}

export function mockRoutingRules(): RdmRoutingRow[] {
  return ROUTING_ROWS
}

export function mockSlaConfigs(): RdmSlaRow[] {
  return SLA_ROWS
}

export function mockStatusDefs(): RdmStatusDefRow[] {
  return STATUS_DEFS
}

export function mockTransitions(): RdmTransitionRow[] {
  return TRANSITIONS
}

/**
 * 撤回为草稿（仅待审批可撤回，与后端口径一致）。
 * <p>mock 也必须守卫状态，否则离线演示时会出现「已上线的需求被撤回成草稿」这种真系统不允许的结果。
 */
export function mockWithdrawRequirement(id: number): void {
  const idx = requirements.findIndex(r => r.id === id)
  if (idx < 0) return
  const cur = requirements[idx]
  if (cur.status !== RDM_STATUS.INTAKE_PENDING) return
  requirements[idx] = {
    ...cur,
    status: RDM_STATUS.DRAFT,
    stage: statusStage(RDM_STATUS.DRAFT),
    updatedAt: at(0),
    stayHours: 0,
  }
}

export function mockDashboard(): RdmDashboardData {
  const total = requirements.length
  const delivered = requirements.filter(r => inStatuses(DONE_STATUSES, r.status)).length
  const typeCount = new Map<string, number>()
  requirements.forEach(r => typeCount.set(r.reqType, (typeCount.get(r.reqType) ?? 0) + 1))
  const deptCount = new Map<string, number>()
  requirements.forEach(r => deptCount.set(r.submitDeptName ?? '-', (deptCount.get(r.submitDeptName ?? '-') ?? 0) + 1))
  return {
    overview: {
      reqTotal: total,
      submittedThisMonth: total,
      deliveredThisMonth: delivered,
      avgResponseHours: 18.4,
      avgDeliveryDays: 12.6,
      onTimeRate: 0.78,
      rejectRate: 0.12,
      overdueTotal: requirements.filter(r => r.overdueFlag).length,
      blockedTotal: requirements.filter(r => r.blockedFlag).length,
      unassignedTotal: requirements.filter(r => r.status === RDM_STATUS.POOL).length,
      intakeStuckTotal: requirements.filter(r => r.status === RDM_STATUS.INTAKE_PENDING).length,
    },
    typeDist: [...typeCount.entries()].map(([name, value]) => ({ name, value })),
    deptRank: [...deptCount.entries()].map(([deptName, submitted]) => ({
      deptName,
      submitted,
      delivered: Math.max(submitted - 2, 0),
      onTimeRate: 0.6 + (submitted % 4) * 0.1,
      avgDays: 8 + (submitted % 5) * 2,
    })).sort((a, b) => b.submitted - a.submitted),
    pmRank: PM_OPTIONS.map(pm => ({
      pmName: pm.name,
      active: pm.activeCount,
      delivered: pm.name === '陳雅婷' ? 9 : 6,
      overdue: pm.name === '林志豪' ? 2 : 0,
      avgDays: pm.name === '蘇婉晴' ? 9.4 : 12.2,
    })),
    stageDuration: [
      { stage: RDM_STAGE.SUBMIT, avgHours: 2 },
      { stage: RDM_STAGE.INTAKE, avgHours: 14 },
      { stage: RDM_STAGE.DISPATCH, avgHours: 22 },
      { stage: RDM_STAGE.PRODUCT, avgHours: 68 },
      { stage: RDM_STAGE.DELIVERY, avgHours: 196 },
      { stage: RDM_STAGE.ACCEPTANCE, avgHours: 40 },
    ],
    trend: Array.from({ length: 8 }, (_, i) => ({
      date: now().subtract(7 - i, 'week').format('MM-DD'),
      submitted: 6 + (i % 3) * 3,
      delivered: 4 + ((i + 1) % 4) * 2,
    })),
    risks: ([
      { riskType: RDM_RISK_TYPE.OVERDUE as RdmRiskType, reqId: 1, reqNo: 'XQ202609260001', title: '推薦報表支持自定義時間區間導出', status: RDM_STATUS.TESTING, submitterName: '张晓琳', handler: '商家運營部', days: 30 },
      { riskType: RDM_RISK_TYPE.UNASSIGNED as RdmRiskType, reqId: 3, reqNo: 'XQ202609240002', title: '新增「達人生態」獨立菜單與結算報表', status: RDM_STATUS.POOL, submitterName: '王大衛', handler: '待分配', days: 120 },
      { riskType: RDM_RISK_TYPE.INTAKE_STUCK as RdmRiskType, reqId: 10, reqNo: 'XQ202609170005', title: '新增商戶分層定價策略配置', status: RDM_STATUS.INTAKE_PENDING, submitterName: '刘洋', handler: '王志强', days: 400 },
      { riskType: RDM_RISK_TYPE.STAGNANT as RdmRiskType, reqId: 2, reqNo: 'XQ202609250003', title: '門店列表新增「停業風險」標籤列', status: RDM_STATUS.DEVELOPING, submitterName: '孫小紅', handler: '周建平', days: 84 },
    ]),
    board: {
      columns: [
        { key: 'dispatch', title: '待分配 / 受理', count: 3, overdue: 1 },
        { key: 'product', title: '產品設計 / 評審', count: 4, overdue: 0 },
        { key: 'delivery', title: '研發 / 測試', count: 5, overdue: 2 },
        { key: 'acceptance', title: '待驗收 / 上線', count: 4, overdue: 1 },
      ],
    },
  }
}

export function mockSaveRoutingRule(rowData: RdmRoutingRow): RdmRoutingRow[] {
  const idx = ROUTING_ROWS.findIndex(r => r.id === rowData.id)
  if (idx >= 0) ROUTING_ROWS[idx] = rowData
  else ROUTING_ROWS.push({ ...rowData, id: Date.now() })
  return [...ROUTING_ROWS]
}

/** 保存 SLA 行（mock：按状态码就地更新，无则追加） */
export function mockSaveSla(row: RdmSlaRow): RdmSlaRow[] {
  const idx = SLA_ROWS.findIndex(r => r.statusCode === row.statusCode && (r.priority || '') === (row.priority || ''))
  if (idx >= 0) SLA_ROWS[idx] = { ...SLA_ROWS[idx], ...row }
  else SLA_ROWS.push({ ...row, statusLabel: RDM_STATUS_LABEL[row.statusCode as RdmStatus] ?? row.statusLabel })
  return [...SLA_ROWS]
}

/** 启停流转规则 */
export function mockSetTransitionEnabled(id: number, enabled: boolean): RdmTransitionRow[] {
  return TRANSITIONS.map(t => (t.id === id ? { ...t, enabled } : t))
}

/** 启停状态定义 */
export function mockSetStatusEnabled(code: string, enabled: boolean): RdmStatusDefRow[] {
  return STATUS_DEFS.map(s => (s.code === code ? { ...s, enabled } : s))
}

/* ==================== M4：产出积分与绩效对接 ==================== */

/** 演示用绩效周期（与开发库 hr_perf_cycle 现存行一致，不编不存在的周期） */
const PERF_CYCLES = [
  { code: '2026Q3-E2E', name: '2026年第三季度考核（E2E）', startDate: '2026-07-01', endDate: '2026-09-30', status: 'published' },
]

/** 交付角色名单（与需求 mock 中的人物一致） */
const MOCK_QA_NAME = '黃嘉欣'
const MOCK_DESIGNER_NAME = '林美君'

/** 部门兼容：产品口归产品部，其余产研角色归技术部 */
const deptOfPerson = (name: string, role: string) => {
  if (name === '陳雅婷' || name === '林志豪' || name === '蘇婉晴') return '產品部'
  return role === RDM_ROLE.PMO ? '項目辦' : '技術部'
}

/** 一条已交付需求对应的参与角色（真实数据来自 rdm_requirement_role） */
function participantsOf(r: RdmRequirementRow): { name: string; role: RdmRoleCode; empNo: string }[] {
  const list: { name: string; role: RdmRoleCode; empNo: string }[] = []
  if (r.pmName) list.push({ name: r.pmName, role: RDM_ROLE.PM, empNo: `MF090${r.id % 9}` })
  if (r.devOwnerName) {
    list.push({ name: r.devOwnerName, role: RDM_ROLE.DEV_LEAD, empNo: `MF080${r.id % 9}` })
    list.push({ name: '劉俊傑', role: RDM_ROLE.DEV, empNo: 'MF0707' })
  }
  if (r.complexity === RDM_COMPLEXITY.COMPLEX || r.complexity === RDM_COMPLEXITY.HUGE) {
    list.push({ name: MOCK_DESIGNER_NAME, role: RDM_ROLE.DESIGNER, empNo: 'MF0708' })
  }
  list.push({ name: MOCK_QA_NAME, role: RDM_ROLE.QA, empNo: 'MF0709' })
  return list
}

/** 从 mock 需求算出一批积分流水（复用真实引擎，保证演示数字与公式一致） */
function buildScoreRecords(): RdmScoreRecord[] {
  const delivered = requirements.filter(r => inStatuses(DONE_STATUSES, r.status) || r.acceptanceResult)
  const rows: RdmScoreRecord[] = []
  delivered.forEach(r => {
    const parts = participantsOf(r)
    const factorSum = sumScorableRoleFactors(parts.map(p => p.role))
    const rework = r.id % 3 === 0 ? 1 : 0
    parts.forEach(p => {
      const breakdown = computeScore({
        roleCode: p.role,
        complexity: r.complexity,
        reqType: r.reqType,
        priority: r.priority,
        onTime: r.id % 4 !== 0,
        lateDays: r.id % 4 === 0 ? 6 : 0,
        reworkCount: rework,
        reopenCount: r.rejectCount ?? 0,
        acceptanceScore: r.acceptanceScore ?? 5,
        firstPass: rework === 0,
        roleFactorSum: factorSum,
      })
      if (breakdown.finalScore <= 0) return
      rows.push({
        id: rows.length + 1,
        reqId: r.id,
        reqNo: r.reqNo,
        reqTitle: r.title,
        userId: 9000 + rows.length,
        userName: p.name,
        empNo: p.empNo,
        deptName: deptOfPerson(p.name, p.role),
        roleCode: p.role,
        reqType: r.reqType,
        priority: r.priority,
        complexity: r.complexity,
        periodCode: PERF_CYCLES[0].code,
        score: breakdown.finalScore,
        breakdown,
        ruleVersion: SCORE_RULE_VERSION,
        onTime: r.id % 4 !== 0,
        reworkCount: rework,
        acceptanceScore: r.acceptanceScore ?? 5,
        pushStatus: RDM_SCORE_PUSH_STATUS.NONE,
        calculatedAt: at(6),
      })
    })
  })
  return rows
}

/** 当前规则版本（改规则即升版，历史流水按当时版本冻结） */
const SCORE_RULE_VERSION = 3

const SCORE_RULES: RdmScoreRule[] = [
  {
    id: 1, ruleCode: 'BASE', reqType: null, roleCode: null,
    complexityWeight: null, typeFactor: null, priorityBonus: 0.1, onTimeBonus: DEFAULT_SCORE_PARAMS.onTimeBonus,
    latePenalty: DEFAULT_SCORE_PARAMS.latePenalty, firstPassBonus: DEFAULT_SCORE_PARAMS.firstPassBonus,
    reworkPenalty: DEFAULT_SCORE_PARAMS.reworkPenalty, acceptanceFactor: DEFAULT_SCORE_PARAMS.acceptanceFactor,
    roleFactor: null, unitScore: DEFAULT_SCORE_PARAMS.unitScore, allocMode: RDM_SCORE_ALLOC_MODE.EACH,
    version: SCORE_RULE_VERSION, effectiveFrom: '2026-07-01', enabled: true,
    remark: '现行口径：各角色分别计分，单位分 10',
    updatedBy: '系统管理员', updatedAt: at(72),
  },
  {
    id: 2, ruleCode: 'STRICT-QUALITY', reqType: null, roleCode: null,
    complexityWeight: null, typeFactor: null, priorityBonus: 0.1, onTimeBonus: 0.15,
    latePenalty: 0.4, firstPassBonus: 0.2, reworkPenalty: 0.15,
    acceptanceFactor: 0.08, roleFactor: null, unitScore: 10,
    allocMode: RDM_SCORE_ALLOC_MODE.EACH, version: 2, effectiveFrom: '2026-04-01', enabled: false,
    remark: '质量加强版（已废止，仅供历史流水回溯）', updatedBy: '系统管理员', updatedAt: at(2200),
  },
  {
    id: 3, ruleCode: 'SPLIT-PILOT', reqType: null, roleCode: null,
    complexityWeight: null, typeFactor: null, priorityBonus: 0.1, onTimeBonus: 0.1,
    latePenalty: 0.3, firstPassBonus: 0.1, reworkPenalty: 0.1,
    acceptanceFactor: 0.06, roleFactor: null, unitScore: 12,
    allocMode: RDM_SCORE_ALLOC_MODE.SPLIT, version: 1, effectiveFrom: '2026-01-01', enabled: false,
    remark: '零和瓜分试点版（已停用）', updatedBy: '系统管理员', updatedAt: at(4200),
  },
]

/** 积分规则列表 */
export function mockScoreRules(): RdmScoreRule[] {
  return SCORE_RULES.map(r => ({ ...r }))
}

/** 产出看板（周期/部门/个人过滤） */
export function mockScoreBoard(params: { periodCode?: string; deptId?: number; userId?: number }): RdmScoreBoardData {
  const records = buildScoreRecords()
  const periodCode = params.periodCode ?? PERF_CYCLES[0].code
  const personAgg = new Map<string, RdmPersonalScore>()
  records.forEach(r => {
    const cur = personAgg.get(r.userName) ?? {
      userId: r.userId, userName: r.userName, empNo: r.empNo ?? '-', deptName: r.deptName,
      periodCode, totalScore: 0, reqCount: 0, deliveredCount: 0, onTimeRate: 0,
      firstPassRate: 0, avgAcceptanceScore: 0, reworkCount: 0, pushStatus: r.pushStatus,
    }
    const scoreTotal = cur.totalScore + r.score
    const count = cur.reqCount + 1
    const onTimeCount = (cur.onTimeRate * cur.reqCount) + (r.onTime ? 1 : 0)
    const passCount = (cur.firstPassRate * cur.reqCount) + ((r.breakdown?.qualityFactor ?? 1) >= 1 ? 1 : 0)
    const scoreSum = (cur.avgAcceptanceScore * cur.reqCount) + (r.acceptanceScore ?? 0)
    cur.totalScore = Math.round(scoreTotal * 100) / 100
    cur.onTimeRate = Math.round((onTimeCount / count) * 100) / 100
    cur.firstPassRate = Math.round((passCount / count) * 100) / 100
    cur.avgAcceptanceScore = Math.round((scoreSum / count) * 10) / 10
    cur.reqCount = count
    cur.deliveredCount += 1
    cur.reworkCount += r.reworkCount ?? 0
    personAgg.set(r.userName, cur)
  })
  const ranking = [...personAgg.values()].sort((a, b) => b.totalScore - a.totalScore)
  const deptAgg = new Map<string, { deptName: string; totalScore: number; personSet: Set<string>; onTime: number; total: number }>()
  records.forEach(r => {
    const key = r.deptName ?? '-'
    const cur = deptAgg.get(key) ?? { deptName: key, totalScore: 0, personSet: new Set<string>(), onTime: 0, total: 0 }
    cur.totalScore += r.score
    cur.personSet.add(r.userName)
    cur.onTime += r.onTime ? 1 : 0
    cur.total += 1
    deptAgg.set(key, cur)
  })
  const totalScore = ranking.reduce((s, p) => s + p.totalScore, 0)
  return {
    period: { ...PERF_CYCLES[0], code: periodCode, name: PERF_CYCLES[0].name },
    ruleVersion: SCORE_RULE_VERSION,
    ruleEffectiveFrom: '2026-07-01',
    allocMode: RDM_SCORE_ALLOC_MODE.EACH,
    summary: {
      personCount: ranking.length,
      totalScore: Math.round(totalScore * 100) / 100,
      avgScore: ranking.length ? Math.round((totalScore / ranking.length) * 100) / 100 : 0,
      deliveredCount: records.length,
      onTimeRate: records.length ? Math.round((records.filter(r => r.onTime).length / records.length) * 100) / 100 : 0,
      firstPassRate: 0.78,
      reworkTotal: records.reduce((s, r) => s + (r.reworkCount ?? 0), 0),
      pushedCount: records.filter(r => r.pushStatus !== RDM_SCORE_PUSH_STATUS.NONE).length,
    },
    ranking,
    deptRank: [...deptAgg.values()].map(d => ({
      deptName: d.deptName,
      totalScore: Math.round(d.totalScore * 100) / 100,
      personCount: d.personSet.size,
      avgScore: d.personSet.size ? Math.round((d.totalScore / d.personSet.size) * 100) / 100 : 0,
      onTimeRate: d.total ? Math.round((d.onTime / d.total) * 100) / 100 : 0,
    })).sort((a, b) => b.totalScore - a.totalScore),
    records: records.slice(0, 40),
    cycles: PERF_CYCLES,
  }
}

/** 试算（用引擎重算，与看板同一口径） */
export function mockPreviewScore(body: { reqId: number; roleCode: string; userId?: number }): RdmScoreRecord | null {
  const rec = buildScoreRecords().find(r => r.reqId === body.reqId && r.roleCode === body.roleCode)
    ?? buildScoreRecords().find(r => r.reqId === body.reqId)
  return rec ?? null
}

/** 效能量日快照趋势（真实数据来自 rdm_metric_snapshot） */
export function mockMetricTrend(days: number): RdmMetricPoint[] {
  const span = Math.min(Math.max(days, 7), 90)
  return Array.from({ length: span }, (_, i) => {
    const date = now().subtract(span - 1 - i, 'day')
    const wave = (i % 7 + 1) / 7
    return {
      statDate: date.format('YYYY-MM-DD'),
      reqTotal: 40 + i,
      submitted: 1 + Math.round(wave * 3),
      accepted: 1 + Math.round(wave * 2),
      released: i % 3 === 0 ? 1 + Math.round(wave * 2) : 0,
      overdue: i % 5 === 0 ? 2 : 0,
      avgResponseHours: Math.round((12 + wave * 20) * 10) / 10,
      avgDeliveryDays: Math.round((8 + wave * 9) * 10) / 10,
      onTimeRate: Math.round((0.68 + wave * 0.24) * 100) / 100,
      rejectRate: Math.round((0.06 + (1 - wave) * 0.12) * 100) / 100,
      firstPassRate: Math.round((0.62 + wave * 0.3) * 100) / 100,
      reworkCount: i % 4 === 0 ? 1 : 0,
      changeCount: i % 6 === 0 ? 1 : 0,
    }
  })
}

/* ==================== M3：验收用例 / 质量口径 / 版本追溯 / 周报 ==================== */

/**
 * 验收用例样本库
 *
 * 真实数据应来自 PRD 的验收标准（逐条可验证）；mock 阶段按需求序号稳正选取，
 * 保证同一需求多次进入页面时用例与结论一致（否则“返工统计”无法演示）。
 */
const ACCEPTANCE_CASE_LIB: { title: string; expect: string; actual: string }[] = [
  { title: '可自选任意起止日期', expect: '日期控件自由组合，默认当月', actual: '默认区间正确' },
  { title: '区间跨度上限校验', expect: '超过 90 天给出明确提示与上限说明', actual: '提示文案未说上限值' },
  { title: '导出文件名含时区间', expect: '如 推薦報表_20260901-20260930.xlsx', actual: '文件名正常' },
  { title: '大数据量导出不超时', expect: '10 万行以内 30 秒内完成', actual: '分页导出成功' },
  { title: '权限隔离', expect: '只能导出自身数据范围', actual: '跨集团查询被正确拦截' },
  { title: '导出失败重试', expect: '失败后提示可重试且不丢数据', actual: '重复点击生成两个任务' },
]

/** 用例结论（稳定伪随机：缺陷集中在第 2/6 条） */
const caseResultOf = (reqId: number, seq: number): RdmCaseResult => {
  if (seq === 2 || seq === 6) return RDM_CASE_RESULT.BLOCKED
  return (reqId + seq) % 4 === 0 ? RDM_CASE_RESULT.FAIL : RDM_CASE_RESULT.PASS
}

/** 构造一套验收用例 */
function buildCases(reqId: number, strict: boolean): RdmAcceptanceCase[] {
  const count = 3 + (reqId % 3)
  return Array.from({ length: count }, (_, i) => {
    const lib = ACCEPTANCE_CASE_LIB[i % ACCEPTANCE_CASE_LIB.length]
    const result = strict ? caseResultOf(reqId, i + 1) : RDM_CASE_RESULT.PASS
    return {
      id: reqId * 100 + i + 1,
      seq: i + 1,
      title: lib.title,
      expect: lib.expect,
      actual: result === RDM_CASE_RESULT.PASS ? lib.actual : `未达到预期：${lib.actual}`,
      result,
      severity: result === RDM_CASE_RESULT.PASS ? undefined : (i === 1 ? RDM_DEFECT_SEVERITY.MAJOR : RDM_DEFECT_SEVERITY.MINOR),
      remark: result === RDM_CASE_RESULT.PASS ? undefined : '已记录缺陷并同步研发',
    }
  })
}

/** 历次验收记录（attempt>1 即说明发生过返工） */
export function mockAcceptanceHistory(reqId: number): RdmAcceptanceRecord[] {
  const req = requirements.find(r => r.id === reqId)
  if (!req) return []
  const accepted = inStatuses(DONE_STATUSES, req.status) || req.status === RDM_STATUS.VERIFIED
  const rejected = req.status === RDM_STATUS.UAT_REJECTED
  if (!accepted && !rejected) return []

  const records: RdmAcceptanceRecord[] = []
  // 已上线的需求里，每 3 个造 1 个“先退后过”的返工样本，用于演示一次通过率
  const hasRework = accepted ? reqId % 3 === 0 : true
  if (hasRework) {
    const cases = buildCases(reqId, true)
    const pass = cases.filter(c => c.result === RDM_CASE_RESULT.PASS).length
    records.push({
      id: reqId * 10 + 1,
      acceptNo: `YS${dateAt(9).replace(/-/g, '')}${String(reqId).padStart(4, '0')}`,
      reqId,
      attempt: 1,
      acceptorName: req.submitterName,
      testEnv: RDM_TEST_ENV.UAT,
      result: RDM_ACCEPT_RESULT.FAIL,
      score: 2,
      caseTotal: cases.length,
      casePass: pass,
      defectCount: cases.length - pass,
      issues: '区间上限提示不明确，大数据量导出超时；已退回研发修复。',
      opinion: '主流程可用但存在严重缺陷，本轮不予验收。',
      acceptTime: at(216),
    })
  }
  if (accepted) {
    const cases = buildCases(reqId, false)
    records.push({
      id: reqId * 10 + (hasRework ? 2 : 1),
      acceptNo: `YS${dateAt(2).replace(/-/g, '')}${String(reqId).padStart(4, '0')}`,
      reqId,
      attempt: hasRework ? 2 : 1,
      acceptorName: req.submitterName,
      testEnv: RDM_TEST_ENV.PRE,
      result: hasRework ? RDM_ACCEPT_RESULT.CONDITIONAL : RDM_ACCEPT_RESULT.PASS,
      score: hasRework ? 4 : 5,
      caseTotal: cases.length,
      casePass: cases.length,
      defectCount: 0,
      issues: hasRework ? '遗留：导出任务重复点击未做幂等，已转后续需求跟踪。' : undefined,
      opinion: '业务侧确认数据口径一致，同意上线。',
      acceptTime: at(48),
      followUpReqNo: hasRework ? `XQ${dateAt(1).replace(/-/g, '')}0099` : undefined,
    })
  }
  return records
}

/** 质量口径看板 */
export function mockQualityData(): RdmQualityData {
  const acceptedReqs = requirements.filter(r => inStatuses(DONE_STATUSES, r.status) || r.acceptanceResult)
  const acceptedTotal = Math.max(acceptedReqs.length, 8)
  const firstPass = Math.round(acceptedTotal * 0.75)
  const reworkTotal = acceptedTotal - firstPass
  const defectTotal = reworkTotal * 3 + 2
  return {
    summary: {
      acceptedTotal,
      firstPassRate: Number((firstPass / acceptedTotal).toFixed(2)),
      avgScore: 4.3,
      reworkTotal,
      defectTotal,
      majorDefectCount: Math.max(1, Math.round(defectTotal * 0.3)),
      followUpTotal: Math.max(1, Math.round(reworkTotal / 2)),
      conditionalTotal: Math.max(1, Math.round(acceptedTotal * 0.2)),
    },
    scoreDist: [
      { name: '5 分', value: Math.round(acceptedTotal * 0.55) },
      { name: '4 分', value: Math.round(acceptedTotal * 0.25) },
      { name: '3 分', value: Math.round(acceptedTotal * 0.12) },
      { name: '2 分', value: Math.round(acceptedTotal * 0.06) },
      { name: '1 分', value: acceptedTotal - Math.round(acceptedTotal * 0.98) },
    ],
    defectBySeverity: [
      { name: RDM_DEFECT_SEVERITY_LABEL[RDM_DEFECT_SEVERITY.CRITICAL], value: 1 },
      { name: RDM_DEFECT_SEVERITY_LABEL[RDM_DEFECT_SEVERITY.MAJOR], value: Math.max(1, Math.round(defectTotal * 0.3)) },
      { name: RDM_DEFECT_SEVERITY_LABEL[RDM_DEFECT_SEVERITY.MINOR], value: Math.max(2, Math.round(defectTotal * 0.4)) },
      { name: RDM_DEFECT_SEVERITY_LABEL[RDM_DEFECT_SEVERITY.TRIVIAL], value: Math.max(1, Math.round(defectTotal * 0.2)) },
    ],
    reworkRank: acceptedReqs
      .filter((_, idx) => idx % 3 === 0)
      .slice(0, 6)
      .map(r => ({
        reqId: r.id,
        reqNo: r.reqNo,
        title: r.title,
        reworkCount: 1 + (r.id % 2),
        pmName: r.pmName ?? '-',
        submitDeptName: r.submitDeptName ?? '-',
        lastRejectReason: r.id % 2 === 0 ? '数据口径与预期不一致' : '性能未达预期（导出超时）',
      })),
    deptQuality: [...new Set(requirements.map(r => r.submitDeptName ?? '-'))].map(deptName => {
      const group = acceptedReqs.filter(r => (r.submitDeptName ?? '-') === deptName)
      const size = Math.max(group.length, 1)
      return {
        deptName,
        accepted: size,
        firstPassRate: Number((0.6 + ((deptName.length % 4) * 0.1)).toFixed(2)),
        avgScore: Number((3.6 + (deptName.length % 3) * 0.3).toFixed(1)),
        defectCount: (deptName.length + size) % 5,
      }
    }),
  }
}

/** 版本 → 需求 */
export function mockVersionTrace(versionNo: string): RdmVersionTrace {
  const rows = requirements.filter(r => (r.versionNo ?? '2.9.0') === versionNo && inStatuses(DONE_STATUSES, r.status))
  const scored = rows.filter(r => r.acceptanceScore)
  return {
    versionNo,
    releaseDate: dateAt(2),
    releaseType: 'minor',
    summary: `版本 ${versionNo}：推荐报表导出、门店风险标签等 ${Math.max(rows.length, 1)} 个需求上线`,
    commitHash: 'a1b2c3d',
    requirements: rows.map(r => ({
      reqId: r.id,
      reqNo: r.reqNo,
      title: r.title,
      status: r.status,
      reqType: r.reqType,
      priority: r.priority,
      submitDeptName: r.submitDeptName,
      submitterName: r.submitterName,
      pmName: r.pmName,
      planReleaseDate: r.planReleaseDate,
      actualReleaseDate: r.actualReleaseDate ?? dateAt(2),
      acceptanceResult: r.acceptanceResult ?? RDM_ACCEPT_RESULT.PASS,
      acceptanceScore: r.acceptanceScore ?? 5,
      reworkCount: r.id % 3 === 0 ? 1 : 0,
    })),
    stats: {
      total: rows.length,
      released: rows.length,
      acceptancePass: rows.filter(r => (r.acceptanceResult ?? RDM_ACCEPT_RESULT.PASS) !== RDM_ACCEPT_RESULT.FAIL).length,
      avgScore: scored.length ? Number((scored.reduce((s, r) => s + (r.acceptanceScore ?? 0), 0) / scored.length).toFixed(1)) : 0,
    },
  }
}

/** 需求 → 版本 */
export function mockRequirementTrace(reqId: number): RdmVersionTrace {
  const req = requirements.find(r => r.id === reqId)
  if (!req) return { requirements: [], stats: { total: 0, released: 0, acceptancePass: 0, avgScore: 0 } }
  if (!req.versionNo) {
    // 未关联版本：追溯页必须诚实地告知“还没上车”，而不是编一个版本
    return { versionNo: null, requirements: [], stats: { total: 0, released: 0, acceptancePass: 0, avgScore: 0 } }
  }
  const trace = mockVersionTrace(req.versionNo)
  return { ...trace, releaseDate: req.actualReleaseDate ?? trace.releaseDate }
}

/** 周报（区间默认近 7 天） */
export function mockWeeklyReport(params: { startDate?: string; endDate?: string; iterationCode?: string }): RdmWeeklyReport {
  const end = dayjs(params.endDate ?? now().format('YYYY-MM-DD'))
  const start = dayjs(params.startDate ?? end.subtract(6, 'day').format('YYYY-MM-DD'))
  const inRange = (d?: string | null) => !!d && !dayjs(d).isBefore(start, 'day') && !dayjs(d).isAfter(end, 'day')
  const submitted = requirements.filter(r => inRange(r.submitTime))
  const released = requirements.filter(r => inStatuses(DONE_STATUSES, r.status))
  const overdue = requirements.filter(r => r.overdueFlag)
  const blocked = requirements.filter(r => r.blockedFlag)
  const deptAgg = new Map<string, { submitted: number; delivered: number; overdue: number }>()
  requirements.forEach(r => {
    const key = r.submitDeptName ?? '-'
    const cur = deptAgg.get(key) ?? { submitted: 0, delivered: 0, overdue: 0 }
    if (inRange(r.submitTime)) cur.submitted += 1
    if (inStatuses(DONE_STATUSES, r.status)) cur.delivered += 1
    if (r.overdueFlag) cur.overdue += 1
    deptAgg.set(key, cur)
  })
  return {
    range: { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), label: `${start.format('MM-DD')} ~ ${end.format('MM-DD')}` },
    summary: {
      submitted: Math.max(submitted.length, 3),
      accepted: Math.max(released.length - 1, 2),
      scheduled: requirements.filter(r => r.status === RDM_STATUS.SCHEDULED).length + 2,
      released: Math.max(released.length, 2),
      overdue: overdue.length,
      blocked: blocked.length,
      changes: 2,
      rework: 2,
      acceptancePass: Math.max(released.length, 2),
      firstPassRate: 0.76,
      avgDeliveryDays: 11.4,
      onTimeRate: 0.82,
    },
    byDept: [...deptAgg.entries()].map(([deptName, v]) => ({
      deptName,
      submitted: v.submitted,
      delivered: v.delivered,
      overdue: v.overdue,
      avgDays: Number((8 + (deptName.length % 5) * 1.6).toFixed(1)),
    })),
    byPm: PM_OPTIONS.map(pm => ({
      pmName: pm.name,
      active: pm.activeCount,
      delivered: released.filter(r => r.pmName === pm.name).length + 1,
      overdue: overdue.filter(r => r.pmName === pm.name).length,
    })),
    released: released.slice(0, 8).map(r => ({
      reqId: r.id,
      reqNo: r.reqNo,
      title: r.title,
      versionNo: r.versionNo ?? '2.9.0',
      pmName: r.pmName,
      actualReleaseDate: r.actualReleaseDate ?? dateAt(2),
      acceptanceScore: r.acceptanceScore ?? 5,
    })),
    risks: [
      ...overdue.slice(0, 5).map(r => ({
        reqId: r.id, reqNo: r.reqNo, title: r.title, status: r.status,
        handler: r.currentHandler ?? r.pmName ?? '待分配', days: Math.round((r.stayHours ?? 72) / 24),
        riskType: RDM_RISK_TYPE.OVERDUE,
      })),
      ...blocked.slice(0, 2).map(r => ({
        reqId: r.id, reqNo: r.reqNo, title: r.title, status: r.status,
        handler: r.currentHandler ?? r.devOwnerName ?? '-', days: Math.round((r.stayHours ?? 48) / 24),
        riskType: RDM_RISK_TYPE.BLOCKED,
      })),
    ],
    nextWeek: requirements
      .filter(r => r.planReleaseDate && dayjs(r.planReleaseDate).isAfter(end, 'day') && dayjs(r.planReleaseDate).isBefore(end.add(8, 'day'), 'day'))
      .slice(0, 6)
      .map(r => ({ reqId: r.id, reqNo: r.reqNo, title: r.title, planReleaseDate: r.planReleaseDate, status: r.status })),
  }
}

/* ==================== M4+：AI 辅助演示数据 ==================== */

/**
 * 相似需求候选（仅用于后端不可用时的演示）。
 *
 * <p>真正的查重算法在后端 Java 实现（可复现、可解释、带阈值校准），
 * 这里只做一个最简的子串命中，让界面在离线开发时不至于空白；
 * 不要把这里当成口径实现，也不要往这里加新规则。
 */
export function mockSimilarRequirements(title: string): RdmSimilarResult {
  const query = (title ?? '').trim()
  if (query.length < 2) return { queryTitle: query, items: [], duplicateSuspect: false }
  const hits = requirements
    .filter(r => r.title !== query && query.length >= 2 && (r.title.includes(query.slice(0, 4)) || query.includes(r.title.slice(0, 4))))
    .slice(0, 5)
    .map((r, idx) => ({
      reqId: r.id,
      reqNo: r.reqNo,
      title: r.title,
      status: r.status,
      reqType: r.reqType,
      priority: r.priority,
      submitterName: r.submitterName,
      submitDeptName: r.submitDeptName,
      pmName: r.pmName,
      submitTime: r.submitTime,
      similarity: Math.max(0.35, 0.9 - idx * 0.12),
      matchedTerms: [query.slice(0, 4)].filter(Boolean),
      sameSubmitter: false,
      inProgress: !inStatuses(DONE_STATUSES, r.status),
    }))
  return {
    queryTitle: query,
    items: hits,
    duplicateSuspect: hits.some(h => h.inProgress && (h.similarity ?? 0) >= 0.45),
    method: '本地演示结果（後端不可用），非正式口径',
  }
}

/** PRD 草稿演示（标注为非 AI 结果，避免误认为大模型输出） */
export function mockPrdDraft(reqId: number): RdmPrdDraft {
  const req = requirements.find(r => r.id === reqId)
  // 期望结果只存在于详情类型上，列表行没有该字段
  const criteria = splitLines(mockGetRequirement(reqId)?.expectResult)
  return {
    reqId,
    title: req?.title ?? '需求 PRD',
    targetUsers: '業務方提出人與其團隊（演示數據，需產品經理核實）',
    featureList: criteria.length ? criteria.slice(0, 4) : ['入口與權限', '核心列表與篩選', '數據口徑與計算規則', '異常與邊界處理'],
    acceptanceCriteria: criteria.length ? criteria : ['功能符合期望結果描述', '權限與現有菜單一致', '大數據量下不超時'],
    boundary: '本次不含歷史數據回填，不含移動端適配（演示文案，請人工確認）',
    risks: '依賴上游字段口徑與權限配置，未對齊時可致返工',
    aiGenerated: false,
    notice: '後端 AI 不可用，以上為本地演示骨架，非大模型生成結果',
  }
}

/** 风险摘要演示（按「当前状态停留 ≥ N 天」筛选，与后端 riskList 同一语义） */
export function mockRiskSummary(minStayDays: number): RdmRiskSummary {
  const stay = Math.min(Math.max(minStayDays, 0), 90)
  const risky = requirements
    .map(r => ({ r, days: Math.round((r.stayHours ?? 0) / 24) }))
    .filter(({ r, days }) => (r.overdueFlag || r.blockedFlag || r.status === RDM_STATUS.POOL
      || r.status === RDM_STATUS.INTAKE_PENDING || days >= 7)
      // 与真接口一致：仅看卡得足够久的
      && days >= stay)
    .slice(0, 8)
    .map(({ r, days }) => ({ r, days }))
  const rows = risky.map(({ r }) => r)
  const blocked = rows.filter(r => r.blockedFlag).length
  const overdue = rows.filter(r => r.overdueFlag).length
  const unassigned = rows.filter(r => r.status === RDM_STATUS.POOL).length
  const maxStayDays = risky.reduce((max, { days }) => Math.max(max, days), 0)
  const highlights = [
    ...(blocked ? [`阻塞 ${blocked} 條，需先清理依賴與阻塞原因`] : []),
    ...(overdue ? [`逾期 ${overdue} 條，最久已停留 ${maxStayDays} 天`] : []),
    ...(unassigned ? [`無主需求 ${unassigned} 條，待技術負責人分發`] : []),
  ]
  return {
    days: stay,
    narrative: highlights.length
      ? (stay > 0
        ? `停留滿 ${stay} 天以上的風險共 ${rows.length} 條：${highlights.join('；')}。`
        : `當前 ${rows.length} 條需求需要管理動作：${highlights.join('；')}。`)
      : (stay > 0 ? `沒有停留滿 ${stay} 天的風險需求。` : '當前沒有需要管理動作的風險需求。'),
    aiUsed: false,
    highlights,
    topRisks: risky.map(({ r, days }) => ({
      reqId: r.id,
      reqNo: r.reqNo,
      title: r.title,
      status: r.status,
      handler: r.currentHandler ?? r.pmName ?? '待分配',
      days,
      riskType: r.blockedFlag ? RDM_RISK_TYPE.BLOCKED
        : r.overdueFlag ? RDM_RISK_TYPE.OVERDUE
        : r.status === RDM_STATUS.POOL ? RDM_RISK_TYPE.UNASSIGNED : RDM_RISK_TYPE.STAGNANT,
    })),
    notice: '後端 AI 不可用，本摘要為本地結構化拼裝',
  }
}

/** 按行拆文本（mock 用） */
function splitLines(text?: string | null): string[] {
  return (text ?? '').split(/[\n；;。]/).map(s => s.trim()).filter(Boolean)
}
