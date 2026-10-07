/**
 * 产研需求管理（RDM）常量定义
 *
 * 与后端 rdm_status_def / rdm_transition / 字典 RDM_* 保持同一套编码，
 * 代码中严禁出现状态码、类型码的字面量硬编码。
 */

/** 需求状态码（全生命周期状态机，与后端 rdm_status_def.code 对齐） */
export const RDM_STATUS = {
  DRAFT: 'draft',
  INTAKE_PENDING: 'intake_pending',
  INTAKE_REJECTED: 'intake_rejected',
  POOL: 'pool',
  ASSIGNED: 'assigned',
  EVALUATING: 'evaluating',
  REJECTED: 'rejected',
  ON_HOLD: 'on_hold',
  ACCEPTED: 'accepted',
  PRD_DESIGNING: 'prd_designing',
  REVIEWING: 'reviewing',
  REVIEW_PASSED: 'review_passed',
  SCHEDULED: 'scheduled',
  DESIGNING: 'designing',
  DEVELOPING: 'developing',
  INTEGRATION: 'integration',
  TESTING: 'testing',
  TEST_PASSED: 'test_passed',
  UAT_PENDING: 'uat_pending',
  UAT_REJECTED: 'uat_rejected',
  RELEASED: 'released',
  VERIFIED: 'verified',
  CLOSED: 'closed',
} as const
export type RdmStatus = (typeof RDM_STATUS)[keyof typeof RDM_STATUS]

/** 状态中文文案（繁中，随全局语言策略后续迁移至 i18n） */
export const RDM_STATUS_LABEL: Record<RdmStatus, string> = {
  [RDM_STATUS.DRAFT]: '草稿',
  [RDM_STATUS.INTAKE_PENDING]: '待審批',
  [RDM_STATUS.INTAKE_REJECTED]: '審批駁回',
  [RDM_STATUS.POOL]: '需求池·待分配',
  [RDM_STATUS.ASSIGNED]: '已分配·待受理',
  [RDM_STATUS.EVALUATING]: '評估中',
  [RDM_STATUS.REJECTED]: '已駁回',
  [RDM_STATUS.ON_HOLD]: '掛起暫緩',
  [RDM_STATUS.ACCEPTED]: '已受理·待排期',
  [RDM_STATUS.PRD_DESIGNING]: 'PRD設計中',
  [RDM_STATUS.REVIEWING]: '評審中',
  [RDM_STATUS.REVIEW_PASSED]: '評審通過',
  [RDM_STATUS.SCHEDULED]: '已排期',
  [RDM_STATUS.DESIGNING]: 'UI設計中',
  [RDM_STATUS.DEVELOPING]: '開發中',
  [RDM_STATUS.INTEGRATION]: '聯調中',
  [RDM_STATUS.TESTING]: '測試中',
  [RDM_STATUS.TEST_PASSED]: '測試通過',
  [RDM_STATUS.UAT_PENDING]: '待業務驗收',
  [RDM_STATUS.UAT_REJECTED]: '驗收未通過',
  [RDM_STATUS.RELEASED]: '已上線',
  [RDM_STATUS.VERIFIED]: '已確認交付',
  [RDM_STATUS.CLOSED]: '已歸檔',
}

/** 状态标签色（antd Tag color） */
export const RDM_STATUS_COLOR: Record<RdmStatus, string> = {
  [RDM_STATUS.DRAFT]: 'default',
  [RDM_STATUS.INTAKE_PENDING]: 'processing',
  [RDM_STATUS.INTAKE_REJECTED]: 'error',
  [RDM_STATUS.POOL]: 'gold',
  [RDM_STATUS.ASSIGNED]: 'orange',
  [RDM_STATUS.EVALUATING]: 'orange',
  [RDM_STATUS.REJECTED]: 'red',
  [RDM_STATUS.ON_HOLD]: 'default',
  [RDM_STATUS.ACCEPTED]: 'cyan',
  [RDM_STATUS.PRD_DESIGNING]: 'purple',
  [RDM_STATUS.REVIEWING]: 'purple',
  [RDM_STATUS.REVIEW_PASSED]: 'purple',
  [RDM_STATUS.SCHEDULED]: 'blue',
  [RDM_STATUS.DESIGNING]: 'magenta',
  [RDM_STATUS.DEVELOPING]: 'blue',
  [RDM_STATUS.INTEGRATION]: 'blue',
  [RDM_STATUS.TESTING]: 'geekblue',
  [RDM_STATUS.TEST_PASSED]: 'geekblue',
  [RDM_STATUS.UAT_PENDING]: 'volcano',
  [RDM_STATUS.UAT_REJECTED]: 'error',
  [RDM_STATUS.RELEASED]: 'success',
  [RDM_STATUS.VERIFIED]: 'success',
  [RDM_STATUS.CLOSED]: 'default',
}

/** 折叠阶段（业务方视角，详情页/工作台统一用 6 段进度） */
export const RDM_STAGE = {
  SUBMIT: 'submit',
  INTAKE: 'intake',
  DISPATCH: 'dispatch',
  PRODUCT: 'product',
  DELIVERY: 'delivery',
  ACCEPTANCE: 'acceptance',
} as const
export type RdmStage = (typeof RDM_STAGE)[keyof typeof RDM_STAGE]

export const RDM_STAGE_LABEL: Record<RdmStage, string> = {
  [RDM_STAGE.SUBMIT]: '提交需求',
  [RDM_STAGE.INTAKE]: '需求審批',
  [RDM_STAGE.DISPATCH]: '分配受理',
  [RDM_STAGE.PRODUCT]: '設計評審',
  [RDM_STAGE.DELIVERY]: '研發測試',
  [RDM_STAGE.ACCEPTANCE]: '驗收上線',
}

export const RDM_STAGE_DESC: Record<RdmStage, string> = {
  [RDM_STAGE.SUBMIT]: '業務填寫需求內容與期望',
  [RDM_STAGE.INTAKE]: '上級或指定人審批需求準入',
  [RDM_STAGE.DISPATCH]: '技術負責人分配、產品經理受理',
  [RDM_STAGE.PRODUCT]: 'PRD 設計與研發評審',
  [RDM_STAGE.DELIVERY]: 'UI/開發/測試推進',
  [RDM_STAGE.ACCEPTANCE]: '業務驗收並確認上線交付',
}

export const RDM_STAGE_ORDER: RdmStage[] = [
  RDM_STAGE.SUBMIT,
  RDM_STAGE.INTAKE,
  RDM_STAGE.DISPATCH,
  RDM_STAGE.PRODUCT,
  RDM_STAGE.DELIVERY,
  RDM_STAGE.ACCEPTANCE,
]

/** 状态 → 阶段映射（进度条折叠依据） */
export const RDM_STATUS_STAGE: Record<RdmStatus, RdmStage> = {
  [RDM_STATUS.DRAFT]: RDM_STAGE.SUBMIT,
  [RDM_STATUS.INTAKE_PENDING]: RDM_STAGE.INTAKE,
  [RDM_STATUS.INTAKE_REJECTED]: RDM_STAGE.INTAKE,
  [RDM_STATUS.POOL]: RDM_STAGE.DISPATCH,
  [RDM_STATUS.ASSIGNED]: RDM_STAGE.DISPATCH,
  [RDM_STATUS.EVALUATING]: RDM_STAGE.DISPATCH,
  [RDM_STATUS.REJECTED]: RDM_STAGE.DISPATCH,
  [RDM_STATUS.ON_HOLD]: RDM_STAGE.DISPATCH,
  [RDM_STATUS.ACCEPTED]: RDM_STAGE.PRODUCT,
  [RDM_STATUS.PRD_DESIGNING]: RDM_STAGE.PRODUCT,
  [RDM_STATUS.REVIEWING]: RDM_STAGE.PRODUCT,
  [RDM_STATUS.REVIEW_PASSED]: RDM_STAGE.PRODUCT,
  [RDM_STATUS.SCHEDULED]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.DESIGNING]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.DEVELOPING]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.INTEGRATION]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.TESTING]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.TEST_PASSED]: RDM_STAGE.DELIVERY,
  [RDM_STATUS.UAT_PENDING]: RDM_STAGE.ACCEPTANCE,
  [RDM_STATUS.UAT_REJECTED]: RDM_STAGE.ACCEPTANCE,
  [RDM_STATUS.RELEASED]: RDM_STAGE.ACCEPTANCE,
  [RDM_STATUS.VERIFIED]: RDM_STAGE.ACCEPTANCE,
  [RDM_STATUS.CLOSED]: RDM_STAGE.ACCEPTANCE,
}

/** 阶段的进度百分比（已达成该阶段时的完成度） */
export const RDM_STAGE_PERCENT: Record<RdmStage, number> = {
  [RDM_STAGE.SUBMIT]: 10,
  [RDM_STAGE.INTAKE]: 25,
  [RDM_STAGE.DISPATCH]: 40,
  [RDM_STAGE.PRODUCT]: 60,
  [RDM_STAGE.DELIVERY]: 80,
  [RDM_STAGE.ACCEPTANCE]: 100,
}

/** 终态（不可再流转，仅管理员重开） */
export const RDM_FINAL_STATUS: RdmStatus[] = [RDM_STATUS.CLOSED]

/** 需求类型（字典 RDM_REQ_TYPE） */
export const RDM_REQ_TYPE = {
  OPTIMIZE: 'OPTIMIZE',
  NEW_FEATURE: 'NEW_FEATURE',
  NEW_MENU: 'NEW_MENU',
  BUG: 'BUG',
  DATA: 'DATA',
  POLICY: 'POLICY',
  INTEGRATION: 'INTEGRATION',
  OTHER: 'OTHER',
} as const
export type RdmReqType = (typeof RDM_REQ_TYPE)[keyof typeof RDM_REQ_TYPE]

export const RDM_REQ_TYPE_LABEL: Record<RdmReqType, string> = {
  [RDM_REQ_TYPE.OPTIMIZE]: '功能優化',
  [RDM_REQ_TYPE.NEW_FEATURE]: '新增功能',
  [RDM_REQ_TYPE.NEW_MENU]: '新增菜單',
  [RDM_REQ_TYPE.BUG]: '功能異常',
  [RDM_REQ_TYPE.DATA]: '數據報表',
  [RDM_REQ_TYPE.POLICY]: '規則配置',
  [RDM_REQ_TYPE.INTEGRATION]: '系統對接',
  [RDM_REQ_TYPE.OTHER]: '其他',
}

export const RDM_REQ_TYPE_COLOR: Record<RdmReqType, string> = {
  [RDM_REQ_TYPE.OPTIMIZE]: '#1890FF',
  [RDM_REQ_TYPE.NEW_FEATURE]: '#E8720C',
  [RDM_REQ_TYPE.NEW_MENU]: '#722ED1',
  [RDM_REQ_TYPE.BUG]: '#FF4D4F',
  [RDM_REQ_TYPE.DATA]: '#13C2C2',
  [RDM_REQ_TYPE.POLICY]: '#FA8C16',
  [RDM_REQ_TYPE.INTEGRATION]: '#52C41A',
  [RDM_REQ_TYPE.OTHER]: '#8C8C8C',
}

/** 优先级（字典 RDM_PRIORITY，slaDays 为该优先级的默认可交付承诺天数） */
export const RDM_PRIORITY = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
} as const
export type RdmPriority = (typeof RDM_PRIORITY)[keyof typeof RDM_PRIORITY]

export const RDM_PRIORITY_LABEL: Record<RdmPriority, string> = {
  [RDM_PRIORITY.P0]: 'P0 阻斷業務',
  [RDM_PRIORITY.P1]: 'P1 緊急',
  [RDM_PRIORITY.P2]: 'P2 常規',
  [RDM_PRIORITY.P3]: 'P3 可排期',
}

export const RDM_PRIORITY_COLOR: Record<RdmPriority, string> = {
  [RDM_PRIORITY.P0]: '#FF4D4F',
  [RDM_PRIORITY.P1]: '#FA8C16',
  [RDM_PRIORITY.P2]: '#1890FF',
  [RDM_PRIORITY.P3]: '#8C8C8C',
}

/** 各优先级默认 SLA 天数 */
export const RDM_PRIORITY_SLA_DAYS: Record<RdmPriority, number> = {
  [RDM_PRIORITY.P0]: 3,
  [RDM_PRIORITY.P1]: 7,
  [RDM_PRIORITY.P2]: 15,
  [RDM_PRIORITY.P3]: 30,
}

/** 复杂度（字典 RDM_COMPLEXITY，weight 为 M4 产出积分系数） */
export const RDM_COMPLEXITY = {
  SIMPLE: 'SIMPLE',
  MEDIUM: 'MEDIUM',
  COMPLEX: 'COMPLEX',
  HUGE: 'HUGE',
} as const
export type RdmComplexity = (typeof RDM_COMPLEXITY)[keyof typeof RDM_COMPLEXITY]

export const RDM_COMPLEXITY_LABEL: Record<RdmComplexity, string> = {
  [RDM_COMPLEXITY.SIMPLE]: '簡單',
  [RDM_COMPLEXITY.MEDIUM]: '中等',
  [RDM_COMPLEXITY.COMPLEX]: '複雜',
  [RDM_COMPLEXITY.HUGE]: '超大',
}

export const RDM_COMPLEXITY_WEIGHT: Record<RdmComplexity, number> = {
  [RDM_COMPLEXITY.SIMPLE]: 1,
  [RDM_COMPLEXITY.MEDIUM]: 2,
  [RDM_COMPLEXITY.COMPLEX]: 3,
  [RDM_COMPLEXITY.HUGE]: 5,
}

/** 工作项角色（与后端 rdm_requirement_role.role_code 对齐） */
export const RDM_ROLE = {
  SUBMITTER: 'SUBMITTER',
  DEPT_LEADER: 'DEPT_LEADER',
  APPROVER: 'APPROVER',
  DISPATCHER: 'DISPATCHER',
  PM: 'PM',
  PMO: 'PMO',
  DEV_LEAD: 'DEV_LEAD',
  DEV: 'DEV',
  DESIGNER: 'DESIGNER',
  QA: 'QA',
  ACCEPTOR: 'ACCEPTOR',
  CC: 'CC',
} as const
export type RdmRoleCode = (typeof RDM_ROLE)[keyof typeof RDM_ROLE]

export const RDM_ROLE_LABEL: Record<RdmRoleCode, string> = {
  [RDM_ROLE.SUBMITTER]: '需求提出人',
  [RDM_ROLE.DEPT_LEADER]: '直屬上級',
  [RDM_ROLE.APPROVER]: '審批人',
  [RDM_ROLE.DISPATCHER]: '技術負責人',
  [RDM_ROLE.PM]: '產品經理',
  [RDM_ROLE.PMO]: '項目經理',
  [RDM_ROLE.DEV_LEAD]: '研發負責人',
  [RDM_ROLE.DEV]: '研發成員',
  [RDM_ROLE.DESIGNER]: 'UI 設計',
  [RDM_ROLE.QA]: '測試',
  [RDM_ROLE.ACCEPTOR]: '驗收人',
  [RDM_ROLE.CC]: '抄送人',
}

/** 关联对象锚点类型（需求定位粒度） */
export const RDM_ANCHOR_TYPE = {
  NONE: 'NONE',
  SYSTEM: 'SYSTEM',
  MENU: 'MENU',
  PAGE: 'PAGE',
  FUNCTION: 'FUNCTION',
  FIELD: 'FIELD',
  BUTTON: 'BUTTON',
  REPORT: 'REPORT',
} as const
export type RdmAnchorType = (typeof RDM_ANCHOR_TYPE)[keyof typeof RDM_ANCHOR_TYPE]

export const RDM_ANCHOR_LABEL: Record<RdmAnchorType, string> = {
  [RDM_ANCHOR_TYPE.NONE]: '全新需求（無現有入口）',
  [RDM_ANCHOR_TYPE.SYSTEM]: '整個系統',
  [RDM_ANCHOR_TYPE.MENU]: '某個菜單',
  [RDM_ANCHOR_TYPE.PAGE]: '某個頁面',
  [RDM_ANCHOR_TYPE.FUNCTION]: '某個功能',
  [RDM_ANCHOR_TYPE.FIELD]: '某個字段',
  [RDM_ANCHOR_TYPE.BUTTON]: '某個按鈕',
  [RDM_ANCHOR_TYPE.REPORT]: '某個報表',
}

/** 验收结果 */
export const RDM_ACCEPT_RESULT = {
  PASS: 'pass',
  CONDITIONAL: 'conditional',
  FAIL: 'fail',
} as const
export type RdmAcceptResult = (typeof RDM_ACCEPT_RESULT)[keyof typeof RDM_ACCEPT_RESULT]

export const RDM_ACCEPT_RESULT_LABEL: Record<RdmAcceptResult, string> = {
  [RDM_ACCEPT_RESULT.PASS]: '驗收通過',
  [RDM_ACCEPT_RESULT.CONDITIONAL]: '有條件通過',
  [RDM_ACCEPT_RESULT.FAIL]: '驗收不通過',
}

export const RDM_ACCEPT_RESULT_COLOR: Record<RdmAcceptResult, string> = {
  [RDM_ACCEPT_RESULT.PASS]: 'success',
  [RDM_ACCEPT_RESULT.CONDITIONAL]: 'warning',
  [RDM_ACCEPT_RESULT.FAIL]: 'error',
}

/** 状态流转动作码（与后端 rdm_transition.action_code 对齐） */
export const RDM_ACTION = {
  SUBMIT: 'submit',
  SUBMIT_POOL: 'submit_pool',
  WITHDRAW: 'withdraw',
  RESUBMIT: 'resubmit',
  APPROVE_INTAKE: 'approve_intake',
  REJECT_INTAKE: 'reject_intake',
  DISPATCH: 'dispatch',
  REASSIGN: 'reassign',
  START_EVALUATE: 'start_evaluate',
  ACCEPT: 'accept',
  REJECT: 'reject',
  HOLD: 'hold',
  UNHOLD: 'unhold',
  PRD_START: 'prd_start',
  REVIEW_START: 'review_start',
  REVIEW_PASS: 'review_pass',
  REVIEW_REJECT: 'review_reject',
  SCHEDULE: 'schedule',
  DESIGN_START: 'design_start',
  DESIGN_DONE: 'design_done',
  DEV_START: 'dev_start',
  DEV_DONE: 'dev_done',
  TEST_START: 'test_start',
  TEST_DONE: 'test_done',
  TEST_REJECT: 'test_reject',
  SUBMIT_UAT: 'submit_uat',
  UAT_PASS: 'uat_pass',
  UAT_FAIL: 'uat_fail',
  RELEASE: 'release',
  VERIFY: 'verify',
  CLOSE: 'close',
  REOPEN: 'reopen',
  BLOCK: 'block',
  UNBLOCK: 'unblock',
} as const
export type RdmAction = (typeof RDM_ACTION)[keyof typeof RDM_ACTION]

export const RDM_ACTION_LABEL: Record<RdmAction, string> = {
  [RDM_ACTION.SUBMIT]: '提交需求',
  [RDM_ACTION.SUBMIT_POOL]: '免審批直送技術部',
  [RDM_ACTION.WITHDRAW]: '撤回修改',
  [RDM_ACTION.RESUBMIT]: '重新提交',
  [RDM_ACTION.APPROVE_INTAKE]: '審批通過',
  [RDM_ACTION.REJECT_INTAKE]: '審批駁回',
  [RDM_ACTION.DISPATCH]: '分配產品經理',
  [RDM_ACTION.REASSIGN]: '改派',
  [RDM_ACTION.START_EVALUATE]: '開始評估',
  [RDM_ACTION.ACCEPT]: '接受需求',
  [RDM_ACTION.REJECT]: '駁回需求',
  [RDM_ACTION.HOLD]: '掛起暫緩',
  [RDM_ACTION.UNHOLD]: '恢復推進',
  [RDM_ACTION.PRD_START]: '開始寫 PRD',
  [RDM_ACTION.REVIEW_START]: '發起評審',
  [RDM_ACTION.REVIEW_PASS]: '評審通過',
  [RDM_ACTION.REVIEW_REJECT]: '評審退回',
  [RDM_ACTION.SCHEDULE]: '提交排期',
  [RDM_ACTION.DESIGN_START]: '開始 UI 設計',
  [RDM_ACTION.DESIGN_DONE]: 'UI 設計完成',
  [RDM_ACTION.DEV_START]: '開始開發',
  [RDM_ACTION.DEV_DONE]: '開發完成',
  [RDM_ACTION.TEST_START]: '開始測試',
  [RDM_ACTION.TEST_DONE]: '測試完成',
  [RDM_ACTION.TEST_REJECT]: '測試退回開發',
  [RDM_ACTION.SUBMIT_UAT]: '轉業務驗收',
  [RDM_ACTION.UAT_PASS]: '驗收通過',
  [RDM_ACTION.UAT_FAIL]: '驗收退回',
  [RDM_ACTION.RELEASE]: '確認上線',
  [RDM_ACTION.VERIFY]: '確認交付',
  [RDM_ACTION.CLOSE]: '歸檔關閉',
  [RDM_ACTION.REOPEN]: '重新打開',
  [RDM_ACTION.BLOCK]: '標記阻塞',
  [RDM_ACTION.UNBLOCK]: '解除阻塞',
}

/** 动作按钮语义（UI 配色分类） */
export type RdmActionTone = 'primary' | 'success' | 'danger' | 'default'

export const RDM_ACTION_TONE: Record<RdmAction, RdmActionTone> = {
  [RDM_ACTION.SUBMIT]: 'primary',
  [RDM_ACTION.SUBMIT_POOL]: 'primary',
  [RDM_ACTION.WITHDRAW]: 'default',
  [RDM_ACTION.RESUBMIT]: 'primary',
  [RDM_ACTION.APPROVE_INTAKE]: 'success',
  [RDM_ACTION.REJECT_INTAKE]: 'danger',
  [RDM_ACTION.DISPATCH]: 'primary',
  [RDM_ACTION.REASSIGN]: 'default',
  [RDM_ACTION.START_EVALUATE]: 'default',
  [RDM_ACTION.ACCEPT]: 'success',
  [RDM_ACTION.REJECT]: 'danger',
  [RDM_ACTION.HOLD]: 'default',
  [RDM_ACTION.UNHOLD]: 'primary',
  [RDM_ACTION.PRD_START]: 'primary',
  [RDM_ACTION.REVIEW_START]: 'primary',
  [RDM_ACTION.REVIEW_PASS]: 'success',
  [RDM_ACTION.REVIEW_REJECT]: 'danger',
  [RDM_ACTION.SCHEDULE]: 'primary',
  [RDM_ACTION.DESIGN_START]: 'primary',
  [RDM_ACTION.DESIGN_DONE]: 'success',
  [RDM_ACTION.DEV_START]: 'primary',
  [RDM_ACTION.DEV_DONE]: 'success',
  [RDM_ACTION.TEST_START]: 'primary',
  [RDM_ACTION.TEST_DONE]: 'success',
  [RDM_ACTION.TEST_REJECT]: 'danger',
  [RDM_ACTION.SUBMIT_UAT]: 'primary',
  [RDM_ACTION.UAT_PASS]: 'success',
  [RDM_ACTION.UAT_FAIL]: 'danger',
  [RDM_ACTION.RELEASE]: 'success',
  [RDM_ACTION.VERIFY]: 'success',
  [RDM_ACTION.CLOSE]: 'default',
  [RDM_ACTION.REOPEN]: 'primary',
  [RDM_ACTION.BLOCK]: 'danger',
  [RDM_ACTION.UNBLOCK]: 'default',
}

/** 动作字段（前端按此弹出补充表单，后端 rdm_transition.required_fields 为权威） */
export type RdmActionField =
  | 'remark' | 'planDate' | 'promisedDate' | 'versionNo' | 'score' | 'pm' | 'holdUntil' | 'blockReason'
  | 'iteration'

export const RDM_ACTION_REQUIRED_FIELDS: Partial<Record<RdmAction, RdmActionField[]>> = {
  [RDM_ACTION.REJECT]: ['remark'],
  [RDM_ACTION.HOLD]: ['remark', 'holdUntil'],
  [RDM_ACTION.ACCEPT]: ['promisedDate'],
  [RDM_ACTION.SCHEDULE]: ['planDate'],
  [RDM_ACTION.DISPATCH]: ['pm'],
  [RDM_ACTION.REASSIGN]: ['pm', 'remark'],
  [RDM_ACTION.UAT_FAIL]: ['remark'],
  [RDM_ACTION.RELEASE]: ['versionNo', 'planDate'],
  [RDM_ACTION.VERIFY]: ['score'],
  [RDM_ACTION.BLOCK]: ['blockReason'],
  [RDM_ACTION.REOPEN]: ['remark'],
}

/**
 * 动作的选填字段（不拦截提交，但没地方填就会丢数据）
 *
 * 排期时的「所屬迭代」是典型：后端已支持写 iteration_code，但之前表单里根本没这个输入项，
 * 导致迭代产能对账与按迭代看周报永远拿不到需求级的迭代归属。
 */
export const RDM_ACTION_OPTIONAL_FIELDS: Partial<Record<RdmAction, RdmActionField[]>> = {
  [RDM_ACTION.SCHEDULE]: ['iteration'],
}

/** 列表视角（Tab），与后端 /rdm/requirement?scope= 对齐 */
export const RDM_SCOPE = {
  MINE: 'mine',
  TODO: 'todo',
  /** 待我審批：审批人只存在于 OA 审批任务表，与 todo（PM/验收人/研发负责人）不是同一口径 */
  APPROVING: 'approving',
  POOL: 'pool',
  PRODUCT: 'product',
  DELIVERY: 'delivery',
  ACCEPTANCE: 'acceptance',
  ALL: 'all',
} as const
export type RdmScope = (typeof RDM_SCOPE)[keyof typeof RDM_SCOPE]

export const RDM_SCOPE_LABEL: Record<RdmScope, string> = {
  [RDM_SCOPE.MINE]: '我提的需求',
  [RDM_SCOPE.TODO]: '待我處理',
  [RDM_SCOPE.APPROVING]: '待我審批',
  [RDM_SCOPE.POOL]: '需求池·待分配',
  [RDM_SCOPE.PRODUCT]: '我負責的產品需求',
  [RDM_SCOPE.DELIVERY]: '研發交付中',
  [RDM_SCOPE.ACCEPTANCE]: '待我驗收',
  [RDM_SCOPE.ALL]: '全部需求',
}

/** 附件业务类型 */
export const RDM_ATTACHMENT_TYPE = {
  REQ: 'REQ',
  COMMENT: 'COMMENT',
  ACCEPT: 'ACCEPT',
  CHANGE: 'CHANGE',
} as const
export type RdmAttachmentType = (typeof RDM_ATTACHMENT_TYPE)[keyof typeof RDM_ATTACHMENT_TYPE]

/** 需求来源渠道 */
export const RDM_SOURCE_CHANNEL = {
  WEB: 'WEB',
  MOBILE: 'MOBILE',
  DINGTALK: 'DINGTALK',
  AI: 'AI',
} as const
export type RdmSourceChannel = (typeof RDM_SOURCE_CHANNEL)[keyof typeof RDM_SOURCE_CHANNEL]

/**
 * 角色 → 该角色当前可执行的动作（M0 前端演示用口径；
 * M1 后由后端 GET /rdm/requirement/{id}/actions 返回权威结果）
 */
export const RDM_SCOPE_DEFAULT_STATUS: Record<RdmScope, RdmStatus | undefined> = {
  [RDM_SCOPE.MINE]: undefined,
  [RDM_SCOPE.TODO]: undefined,
  [RDM_SCOPE.APPROVING]: undefined,
  [RDM_SCOPE.POOL]: RDM_STATUS.POOL,
  [RDM_SCOPE.PRODUCT]: undefined,
  [RDM_SCOPE.DELIVERY]: undefined,
  [RDM_SCOPE.ACCEPTANCE]: RDM_STATUS.UAT_PENDING,
  [RDM_SCOPE.ALL]: undefined,
}

/** 看板列（产品经理视角：按阶段折叠为 5 列） */
export const RDM_BOARD_COLUMNS: { key: RdmStage | 'archived'; label: string; statuses: RdmStatus[] }[] = [
  {
    key: RDM_STAGE.DISPATCH,
    label: '待受理 / 評估',
    statuses: [RDM_STATUS.POOL, RDM_STATUS.ASSIGNED, RDM_STATUS.EVALUATING, RDM_STATUS.ON_HOLD],
  },
  {
    key: RDM_STAGE.PRODUCT,
    label: '產品設計 / 評審',
    statuses: [RDM_STATUS.ACCEPTED, RDM_STATUS.PRD_DESIGNING, RDM_STATUS.REVIEWING, RDM_STATUS.REVIEW_PASSED],
  },
  {
    key: RDM_STAGE.DELIVERY,
    label: '研發 / 測試',
    statuses: [
      RDM_STATUS.SCHEDULED, RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING,
      RDM_STATUS.INTEGRATION, RDM_STATUS.TESTING, RDM_STATUS.TEST_PASSED,
    ],
  },
  {
    key: RDM_STAGE.ACCEPTANCE,
    label: '待驗收 / 已上線',
    statuses: [RDM_STATUS.UAT_PENDING, RDM_STATUS.UAT_REJECTED, RDM_STATUS.RELEASED, RDM_STATUS.VERIFIED],
  },
  {
    key: 'archived',
    label: '已駁回 / 已歸檔',
    statuses: [RDM_STATUS.REJECTED, RDM_STATUS.INTAKE_REJECTED, RDM_STATUS.CLOSED],
  },
]

/** 逾期/风险类型（PMO 风险雷达） */
export const RDM_RISK_TYPE = {
  OVERDUE: 'OVERDUE',
  STAGNANT: 'STAGNANT',
  BLOCKED: 'BLOCKED',
  UNASSIGNED: 'UNASSIGNED',
  INTAKE_STUCK: 'INTAKE_STUCK',
} as const
export type RdmRiskType = (typeof RDM_RISK_TYPE)[keyof typeof RDM_RISK_TYPE]

export const RDM_RISK_LABEL: Record<RdmRiskType, string> = {
  [RDM_RISK_TYPE.OVERDUE]: '已逾期',
  [RDM_RISK_TYPE.STAGNANT]: '超 7 天無進展',
  [RDM_RISK_TYPE.BLOCKED]: '阻塞中',
  [RDM_RISK_TYPE.UNASSIGNED]: '無主需求',
  [RDM_RISK_TYPE.INTAKE_STUCK]: '審批停滯',
}

export const RDM_RISK_COLOR: Record<RdmRiskType, string> = {
  [RDM_RISK_TYPE.OVERDUE]: '#FF4D4F',
  [RDM_RISK_TYPE.STAGNANT]: '#FA8C16',
  [RDM_RISK_TYPE.BLOCKED]: '#722ED1',
  [RDM_RISK_TYPE.UNASSIGNED]: '#1890FF',
  [RDM_RISK_TYPE.INTAKE_STUCK]: '#E8720C',
}

/* ==================== M2：任务 / 评审 / 变更 ==================== */

/** 执行任务类型（与 rdm_work_task.task_type 对齐） */
export const RDM_TASK_TYPE = {
  DESIGN: 'design',
  FRONTEND: 'frontend',
  APP: 'app',
  BACKEND: 'backend',
  QA: 'qa',
  DATA: 'data',
} as const
export type RdmTaskType = (typeof RDM_TASK_TYPE)[keyof typeof RDM_TASK_TYPE]

export const RDM_TASK_TYPE_LABEL: Record<RdmTaskType, string> = {
  [RDM_TASK_TYPE.DESIGN]: 'UI 設計',
  [RDM_TASK_TYPE.FRONTEND]: '前端開發',
  [RDM_TASK_TYPE.APP]: 'APP 開發',
  [RDM_TASK_TYPE.BACKEND]: '後端開發',
  [RDM_TASK_TYPE.QA]: '測試',
  [RDM_TASK_TYPE.DATA]: '數據',
}

export const RDM_TASK_TYPE_COLOR: Record<RdmTaskType, string> = {
  [RDM_TASK_TYPE.DESIGN]: '#EB2F96',
  [RDM_TASK_TYPE.FRONTEND]: '#1890FF',
  [RDM_TASK_TYPE.APP]: '#FA8C16',
  [RDM_TASK_TYPE.BACKEND]: '#722ED1',
  [RDM_TASK_TYPE.QA]: '#13C2C2',
  [RDM_TASK_TYPE.DATA]: '#52C41A',
}

/**
 * 五节点计划（阶段 3）：产品受理时要规划的五个关键时间。
 * <p>与后端 RdmMilestone.CODE_* 一一对应；这里的顺序就是详情页与节点规划页的展示顺序，
 * 也是阶段 5 甘特图的里程碑行顺序，不得在两处各自维护一份。
 */
export const RDM_MILESTONE_NODES = [
  { code: 'PRD_REVIEW', label: '需求評審' },
  { code: 'DESIGN_DONE', label: '設計完成' },
  { code: 'DEV_START', label: '研發啟動' },
  { code: 'DEV_DONE', label: '開發完成' },
  { code: 'RELEASE', label: '上線交付' },
] as const

export type RdmMilestoneCode = (typeof RDM_MILESTONE_NODES)[number]['code']

/** 节点状态：待完成 / 已完成 / 不适用（不适用必须写原因，否则等于没盘这个环节） */
export const RDM_MILESTONE_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  NOT_APPLICABLE: 'not_applicable',
} as const
export type RdmMilestoneStatus = (typeof RDM_MILESTONE_STATUS)[keyof typeof RDM_MILESTONE_STATUS]

export const RDM_MILESTONE_STATUS_LABEL: Record<RdmMilestoneStatus, string> = {
  [RDM_MILESTONE_STATUS.PENDING]: '待完成',
  [RDM_MILESTONE_STATUS.DONE]: '已完成',
  [RDM_MILESTONE_STATUS.NOT_APPLICABLE]: '不適用',
}

/**
 * 验收阶段（阶段 4）：与后端 RdmConstants.ACCEPT_STAGE_* 对应。
 * <p>两件事必须分开看：上线前预验收回答“质量能不能上线”，
 * 上线后业务验收回答“上线后是否真解决了业务问题”（1-5 分以此为口径）。
 */
export const RDM_ACCEPT_STAGE = {
  PRE_RELEASE: 'pre_release',
  POST_RELEASE: 'post_release',
} as const
export type RdmAcceptStage = (typeof RDM_ACCEPT_STAGE)[keyof typeof RDM_ACCEPT_STAGE]

export const RDM_ACCEPT_STAGE_LABEL: Record<RdmAcceptStage, string> = {
  [RDM_ACCEPT_STAGE.PRE_RELEASE]: '上線前預驗收',
  [RDM_ACCEPT_STAGE.POST_RELEASE]: '上線後業務驗收',
}

/**
 * 可提交验收结论的状态（与后端 resolveAcceptanceStage 一一对应）。
 * <p>入口不收敛到这一处就会出现“列表能点、详情页看不到”的口径漂移。
 */
export const RDM_ACCEPTANCE_OPEN_STATUS: string[] = [
  'test_passed', 'uat_pending', 'released', 'verified',
]

/** 发布放行单状态（与后端 RdmRelease.STATUS_* 对应） */
export const RDM_RELEASE_STATUS = {
  PENDING: 'pending',
  PASSED: 'passed',
  REJECTED: 'rejected',
  REVOKED: 'revoked',
} as const
export type RdmReleaseStatus = (typeof RDM_RELEASE_STATUS)[keyof typeof RDM_RELEASE_STATUS]

export const RDM_RELEASE_STATUS_LABEL: Record<RdmReleaseStatus, string> = {
  [RDM_RELEASE_STATUS.PENDING]: '待裁決',
  [RDM_RELEASE_STATUS.PASSED]: '已准許上線',
  [RDM_RELEASE_STATUS.REJECTED]: '已駁回',
  [RDM_RELEASE_STATUS.REVOKED]: '已作廢',
}

export const RDM_RELEASE_STATUS_COLOR: Record<RdmReleaseStatus, string> = {
  [RDM_RELEASE_STATUS.PENDING]: 'processing',
  [RDM_RELEASE_STATUS.PASSED]: 'success',
  [RDM_RELEASE_STATUS.REJECTED]: 'error',
  [RDM_RELEASE_STATUS.REVOKED]: 'default',
}

/** 发布环境（与后端 normalizeEnv 一致） */
export const RDM_RELEASE_ENV_LABEL: Record<string, string> = {
  prod: '生產環境',
  pre: '預發布環境',
  uat: '驗收環境',
}

/**
 * HR 绩效建议状态（阶段 6，与后端 RdmHrSuggestion.STATUS_* 对应）。
 * <p>只能单向流转：draft → confirmed → pushed，pushed 之后只能撤回；
 * 已推送的建议不允许原地改分，那等于绕过 HR 校准通道改考核。
 */
export const RDM_SUGGESTION_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PUSHED: 'pushed',
  WITHDRAWN: 'withdrawn',
} as const
export type RdmSuggestionStatus = (typeof RDM_SUGGESTION_STATUS)[keyof typeof RDM_SUGGESTION_STATUS]

export const RDM_SUGGESTION_STATUS_LABEL: Record<RdmSuggestionStatus, string> = {
  [RDM_SUGGESTION_STATUS.DRAFT]: '待復核',
  [RDM_SUGGESTION_STATUS.CONFIRMED]: '已確認',
  [RDM_SUGGESTION_STATUS.PUSHED]: '已推送',
  [RDM_SUGGESTION_STATUS.WITHDRAWN]: '已撤回',
}

export const RDM_SUGGESTION_STATUS_COLOR: Record<RdmSuggestionStatus, string> = {
  [RDM_SUGGESTION_STATUS.DRAFT]: 'processing',
  [RDM_SUGGESTION_STATUS.CONFIRMED]: 'warning',
  [RDM_SUGGESTION_STATUS.PUSHED]: 'success',
  [RDM_SUGGESTION_STATUS.WITHDRAWN]: 'default',
}

/** 任务状态 */
export const RDM_TASK_STATUS = {
  TODO: 'todo',
  DOING: 'doing',
  DONE: 'done',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
} as const
export type RdmTaskStatus = (typeof RDM_TASK_STATUS)[keyof typeof RDM_TASK_STATUS]

export const RDM_TASK_STATUS_LABEL: Record<RdmTaskStatus, string> = {
  [RDM_TASK_STATUS.TODO]: '待開始',
  [RDM_TASK_STATUS.DOING]: '進行中',
  [RDM_TASK_STATUS.DONE]: '已完成',
  [RDM_TASK_STATUS.BLOCKED]: '已阻塞',
  [RDM_TASK_STATUS.CANCELLED]: '已取消',
}

export const RDM_TASK_STATUS_COLOR: Record<RdmTaskStatus, string> = {
  [RDM_TASK_STATUS.TODO]: 'default',
  [RDM_TASK_STATUS.DOING]: 'processing',
  [RDM_TASK_STATUS.DONE]: 'success',
  [RDM_TASK_STATUS.BLOCKED]: 'error',
  [RDM_TASK_STATUS.CANCELLED]: 'default',
}

/** 任务进度动作 */
export const RDM_TASK_ACTION = {
  START: 'start',
  DONE: 'done',
  BLOCK: 'block',
  UNBLOCK: 'unblock',
} as const
export type RdmTaskAction = (typeof RDM_TASK_ACTION)[keyof typeof RDM_TASK_ACTION]

export const RDM_TASK_ACTION_LABEL: Record<RdmTaskAction, string> = {
  [RDM_TASK_ACTION.START]: '開始任務',
  [RDM_TASK_ACTION.DONE]: '完成任務',
  [RDM_TASK_ACTION.BLOCK]: '標記阻塞',
  [RDM_TASK_ACTION.UNBLOCK]: '解除阻塞',
}

/** 评审类型 */
export const RDM_REVIEW_TYPE = {
  REQUIREMENT: 'requirement',
  DEV: 'dev',
  UI: 'ui',
  TEST: 'test',
} as const
export type RdmReviewType = (typeof RDM_REVIEW_TYPE)[keyof typeof RDM_REVIEW_TYPE]

export const RDM_REVIEW_TYPE_LABEL: Record<RdmReviewType, string> = {
  [RDM_REVIEW_TYPE.REQUIREMENT]: '需求評審',
  [RDM_REVIEW_TYPE.DEV]: '研發評審',
  [RDM_REVIEW_TYPE.UI]: 'UI 評審',
  [RDM_REVIEW_TYPE.TEST]: '測試評審',
}

/** 评审结论 */
export const RDM_REVIEW_CONCLUSION = {
  PENDING: 'pending',
  PASSED: 'passed',
  REJECTED: 'rejected',
} as const
export type RdmReviewConclusion = (typeof RDM_REVIEW_CONCLUSION)[keyof typeof RDM_REVIEW_CONCLUSION]

export const RDM_REVIEW_CONCLUSION_LABEL: Record<RdmReviewConclusion, string> = {
  [RDM_REVIEW_CONCLUSION.PENDING]: '待評審',
  [RDM_REVIEW_CONCLUSION.PASSED]: '評審通過',
  [RDM_REVIEW_CONCLUSION.REJECTED]: '評審退回',
}

export const RDM_REVIEW_CONCLUSION_COLOR: Record<RdmReviewConclusion, string> = {
  [RDM_REVIEW_CONCLUSION.PENDING]: 'processing',
  [RDM_REVIEW_CONCLUSION.PASSED]: 'success',
  [RDM_REVIEW_CONCLUSION.REJECTED]: 'error',
}

/** PRD 状态 */
export const RDM_PRD_STATUS = {
  DRAFT: 'draft',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
} as const
export type RdmPrdStatus = (typeof RDM_PRD_STATUS)[keyof typeof RDM_PRD_STATUS]

export const RDM_PRD_STATUS_LABEL: Record<RdmPrdStatus, string> = {
  [RDM_PRD_STATUS.DRAFT]: '編寫中',
  [RDM_PRD_STATUS.REVIEWING]: '評審中',
  [RDM_PRD_STATUS.APPROVED]: '已評審通過',
  [RDM_PRD_STATUS.REJECTED]: '已退回',
  [RDM_PRD_STATUS.ARCHIVED]: '已歸檔',
}

export const RDM_PRD_STATUS_COLOR: Record<RdmPrdStatus, string> = {
  [RDM_PRD_STATUS.DRAFT]: 'default',
  [RDM_PRD_STATUS.REVIEWING]: 'processing',
  [RDM_PRD_STATUS.APPROVED]: 'success',
  [RDM_PRD_STATUS.REJECTED]: 'error',
  [RDM_PRD_STATUS.ARCHIVED]: 'default',
}

/** 需求变更类型 */
export const RDM_CHANGE_TYPE = {
  SCOPE: 'scope',
  SCHEDULE: 'schedule',
  CRITERION: 'criterion',
  PRIORITY: 'priority',
  OTHER: 'other',
} as const
export type RdmChangeType = (typeof RDM_CHANGE_TYPE)[keyof typeof RDM_CHANGE_TYPE]

export const RDM_CHANGE_TYPE_LABEL: Record<RdmChangeType, string> = {
  [RDM_CHANGE_TYPE.SCOPE]: '範圍變更',
  [RDM_CHANGE_TYPE.SCHEDULE]: '排期變更',
  [RDM_CHANGE_TYPE.CRITERION]: '驗收標準變更',
  [RDM_CHANGE_TYPE.PRIORITY]: '優先級變更',
  [RDM_CHANGE_TYPE.OTHER]: '其他變更',
}

/** 变更审批状态 */
export const RDM_CHANGE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const
export type RdmChangeStatus = (typeof RDM_CHANGE_STATUS)[keyof typeof RDM_CHANGE_STATUS]

export const RDM_CHANGE_STATUS_LABEL: Record<RdmChangeStatus, string> = {
  [RDM_CHANGE_STATUS.PENDING]: '審批中',
  [RDM_CHANGE_STATUS.APPROVED]: '已通過',
  [RDM_CHANGE_STATUS.REJECTED]: '已駁回',
  [RDM_CHANGE_STATUS.CANCELLED]: '已撤銷',
}

export const RDM_CHANGE_STATUS_COLOR: Record<RdmChangeStatus, string> = {
  [RDM_CHANGE_STATUS.PENDING]: 'processing',
  [RDM_CHANGE_STATUS.APPROVED]: 'success',
  [RDM_CHANGE_STATUS.REJECTED]: 'error',
  [RDM_CHANGE_STATUS.CANCELLED]: 'default',
}

/** 迭代状态 */
export const RDM_ITERATION_STATUS = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const
export type RdmIterationStatus = (typeof RDM_ITERATION_STATUS)[keyof typeof RDM_ITERATION_STATUS]

export const RDM_ITERATION_STATUS_LABEL: Record<RdmIterationStatus, string> = {
  [RDM_ITERATION_STATUS.PLANNING]: '規劃中',
  [RDM_ITERATION_STATUS.ACTIVE]: '進行中',
  [RDM_ITERATION_STATUS.CLOSED]: '已關閉',
}

export const RDM_ITERATION_STATUS_COLOR: Record<RdmIterationStatus, string> = {
  [RDM_ITERATION_STATUS.PLANNING]: 'default',
  [RDM_ITERATION_STATUS.ACTIVE]: 'processing',
  [RDM_ITERATION_STATUS.CLOSED]: 'success',
}

/** 迭代类型（与 rdm_iteration.iteration_type 对齐） */
export const RDM_ITERATION_TYPE = {
  SPRINT: 'sprint',
  VERSION: 'version',
  HOTFIX: 'hotfix',
} as const
export type RdmIterationType = (typeof RDM_ITERATION_TYPE)[keyof typeof RDM_ITERATION_TYPE]

export const RDM_ITERATION_TYPE_LABEL: Record<RdmIterationType, string> = {
  [RDM_ITERATION_TYPE.SPRINT]: '常規迭代',
  [RDM_ITERATION_TYPE.VERSION]: '版本專項',
  [RDM_ITERATION_TYPE.HOTFIX]: '緊急修復',
}

export const RDM_ITERATION_TYPE_COLOR: Record<RdmIterationType, string> = {
  [RDM_ITERATION_TYPE.SPRINT]: '#1890FF',
  [RDM_ITERATION_TYPE.VERSION]: '#722ED1',
  [RDM_ITERATION_TYPE.HOTFIX]: '#FF4D4F',
}

/**
 * 需求菜单 key（后端权限门控与前端路由受控清单共用）。
 * <p>rdm-dashboard / rdm-efficiency / rdm-delivery / rdm-config-group 为一级分组，其余为叶子菜单。
 * <p>v3.7 菜单收敛：不再列 rdm-submit（提交需求降为表单路由）、rdm-product、rdm-delivery-req；
 * 同时补上上一轮新增但漏登记的三个菜单 key（风险中心、效能与产出分组、部门与人员产出）。
 * <p>v3.10：rdm-query（需求查询）已并回 rdm-intake —— 分配权必然蕴含全量可见权，
 * 两者同属分配侧窄权限，不该拆成两个窄权限菜单各自维护。
 * <p>v3.11：「需求池·分配」拆为一级分组 rdm-pool-group（需求池）下的两个二级菜单：
 * rdm-intake-approval（提交需求，业务侧提交 + 待我審批）与 rdm-intake（需求管理，分配侧）。
 * 拆分只改显示名与层级，rdm-intake 的 key/path/actions 全部不变，以免动到 12 处服务端权限锚点与存量授权。
 */
export const RDM_MENU_KEYS = [
  'rdm-dashboard', 'rdm-dashboard-board', 'rdm-dashboard-risk', 'rdm-dashboard-quality', 'rdm-dashboard-version', 'rdm-dashboard-report',
  'rdm-efficiency', 'rdm-dashboard-score', 'rdm-dashboard-trend', 'rdm-efficiency-output',
  'rdm-workbench', 'rdm-requirement', 'rdm-pool-group', 'rdm-intake-approval', 'rdm-intake',
  'rdm-delivery', 'rdm-delivery-board', 'rdm-delivery-iteration',
  'rdm-acceptance', 'rdm-config-group',
  'rdm-config-status', 'rdm-config-routing', 'rdm-config-sla', 'rdm-config-score',
] as const

/** 通知事件码（与后端 RDM_EVENT 对齐，M1 接入） */
export const RDM_EVENT = {
  INTAKE_TODO: 'INTAKE_TODO',
  INTAKE_PASS: 'INTAKE_PASS',
  INTAKE_REJECT: 'INTAKE_REJECT',
  ASSIGNED: 'ASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ACCEPT_TODO: 'ACCEPT_TODO',
  ACCEPT_DONE: 'ACCEPT_DONE',
  SLA_WARN: 'SLA_WARN',
  SLA_OVERDUE: 'SLA_OVERDUE',
  URGE: 'URGE',
} as const
export type RdmEventCode = (typeof RDM_EVENT)[keyof typeof RDM_EVENT]

/* ==================== M3：验收用例、质量口径、版本追溯、周报 ==================== */

/**
 * 单个验收用例的结论
 *
 * 与「验收结论」（RDM_ACCEPT_RESULT，单据级）区分：用例结论只描述这一条验证结果，
 * 任何 fail/blocked 都会自动汇成遗留事项，避免验收人写完用例又漏填问题描述。
 */
export const RDM_CASE_RESULT = {
  PASS: 'pass',
  FAIL: 'fail',
  BLOCKED: 'blocked',
} as const
export type RdmCaseResult = (typeof RDM_CASE_RESULT)[keyof typeof RDM_CASE_RESULT]

export const RDM_CASE_RESULT_LABEL: Record<RdmCaseResult, string> = {
  [RDM_CASE_RESULT.PASS]: '通過',
  [RDM_CASE_RESULT.FAIL]: '不通過',
  [RDM_CASE_RESULT.BLOCKED]: '阻塞未測',
}

export const RDM_CASE_RESULT_COLOR: Record<RdmCaseResult, string> = {
  [RDM_CASE_RESULT.PASS]: 'success',
  [RDM_CASE_RESULT.FAIL]: 'error',
  [RDM_CASE_RESULT.BLOCKED]: 'warning',
}

/** 缺陷严重度（用例不通过时必填，直接决定验收结论可选范围） */
export const RDM_DEFECT_SEVERITY = {
  CRITICAL: 'critical',
  MAJOR: 'major',
  MINOR: 'minor',
  TRIVIAL: 'trivial',
} as const
export type RdmDefectSeverity = (typeof RDM_DEFECT_SEVERITY)[keyof typeof RDM_DEFECT_SEVERITY]

export const RDM_DEFECT_SEVERITY_LABEL: Record<RdmDefectSeverity, string> = {
  [RDM_DEFECT_SEVERITY.CRITICAL]: '致命',
  [RDM_DEFECT_SEVERITY.MAJOR]: '嚴重',
  [RDM_DEFECT_SEVERITY.MINOR]: '一般',
  [RDM_DEFECT_SEVERITY.TRIVIAL]: '輕微',
}

export const RDM_DEFECT_SEVERITY_COLOR: Record<RdmDefectSeverity, string> = {
  [RDM_DEFECT_SEVERITY.CRITICAL]: '#CF1322',
  [RDM_DEFECT_SEVERITY.MAJOR]: '#FF4D4F',
  [RDM_DEFECT_SEVERITY.MINOR]: '#FA8C16',
  [RDM_DEFECT_SEVERITY.TRIVIAL]: '#8C8C8C',
}

/** 致命/严重缺陷不得带病上线（有條件通過也不允许） */
export const RDM_BLOCKING_SEVERITIES: RdmDefectSeverity[] = [
  RDM_DEFECT_SEVERITY.CRITICAL,
  RDM_DEFECT_SEVERITY.MAJOR,
]

/** 验收环境（口径上限定三个选项，避免随意填写导致返工时无法复现） */
export const RDM_TEST_ENV = {
  PROD: 'prod',
  PRE: 'pre',
  UAT: 'uat',
} as const
export type RdmTestEnv = (typeof RDM_TEST_ENV)[keyof typeof RDM_TEST_ENV]

export const RDM_TEST_ENV_LABEL: Record<RdmTestEnv, string> = {
  [RDM_TEST_ENV.PROD]: '生產環境',
  [RDM_TEST_ENV.PRE]: '預發環境',
  [RDM_TEST_ENV.UAT]: '驗收/UAT 環境',
}

/** 版本追溯页的状态过滤 */
export const RDM_TRACE_SCOPE = {
  /** 某版本包含哪些需求（版本 → 需求） */
  VERSION: 'version',
  /** 某需求上了哪个版本（需求 → 版本） */
  REQUIREMENT: 'requirement',
} as const
export type RdmTraceScope = (typeof RDM_TRACE_SCOPE)[keyof typeof RDM_TRACE_SCOPE]

/* ==================== M4：产出积分与绩效对接 ==================== */

/**
 * 积分分配模式（绩效敏感口径，二者结果差异很大，必须二选一而非混用）
 * - EACH：同一需求的每个参与角色各自拿满一份分（鼓励协作，但人均分随参与人数膨胀）
 * - SPLIT：单条需求总积分固定，按角色系数在参与人之间瓜分（零和、可算人均，但参与人多则单人得分变低）
 */
export const RDM_SCORE_ALLOC_MODE = {
  EACH: 'each',
  SPLIT: 'split',
} as const
export type RdmScoreAllocMode = (typeof RDM_SCORE_ALLOC_MODE)[keyof typeof RDM_SCORE_ALLOC_MODE]

export const RDM_SCORE_ALLOC_MODE_LABEL: Record<RdmScoreAllocMode, string> = {
  [RDM_SCORE_ALLOC_MODE.EACH]: '各角色分別計分',
  [RDM_SCORE_ALLOC_MODE.SPLIT]: '總額按角色瓜分',
}

/**
 * 角色计分系数默认值（只有实际参与产出的角色计入，验收人不计分）
 *
 * 必须覆盖 M2 交付角色（UI/开发/测试），否则干最多活的人拿不到分；
 * 验收人是业务方，拿产研分会直接把口径带偏。
 */
export const RDM_SCORE_ROLE_FACTOR: Partial<Record<RdmRoleCode, number>> = {
  [RDM_ROLE.PM]: 1,
  [RDM_ROLE.DEV_LEAD]: 0.9,
  [RDM_ROLE.DEV]: 1,
  [RDM_ROLE.DESIGNER]: 0.7,
  [RDM_ROLE.QA]: 0.8,
  [RDM_ROLE.PMO]: 0.3,
  [RDM_ROLE.DISPATCHER]: 0.2,
}

/** 复杂度基准权重（公式的主变量） */
export const RDM_SCORE_COMPLEXITY_WEIGHT: Record<RdmComplexity, number> = {
  [RDM_COMPLEXITY.SIMPLE]: 1,
  [RDM_COMPLEXITY.MEDIUM]: 2,
  [RDM_COMPLEXITY.COMPLEX]: 3.5,
  [RDM_COMPLEXITY.HUGE]: 5,
}

/** 需求类型难度系数 */
export const RDM_SCORE_TYPE_FACTOR: Record<RdmReqType, number> = {
  [RDM_REQ_TYPE.NEW_MENU]: 1.3,
  [RDM_REQ_TYPE.NEW_FEATURE]: 1.2,
  [RDM_REQ_TYPE.OPTIMIZE]: 1,
  [RDM_REQ_TYPE.BUG]: 0.8,
  [RDM_REQ_TYPE.DATA]: 0.9,
  [RDM_REQ_TYPE.POLICY]: 0.9,
  [RDM_REQ_TYPE.INTEGRATION]: 1.2,
  [RDM_REQ_TYPE.OTHER]: 1,
}

/** 优先级加分（鼓励抢硬骨头） */
export const RDM_SCORE_PRIORITY_BONUS: Record<RdmPriority, number> = {
  [RDM_PRIORITY.P0]: 0.2,
  [RDM_PRIORITY.P1]: 0.1,
  [RDM_PRIORITY.P2]: 0,
  [RDM_PRIORITY.P3]: -0.1,
}

/** 积分流水的得/扣分原因（绩效申诉时要说清分是怎么来的） */
export const RDM_SCORE_REASON = {
  DELIVERED: 'delivered',
  ON_TIME: 'onTime',
  LATE: 'late',
  FIRST_PASS: 'firstPass',
  REWORK: 'rework',
  REOPEN: 'reopen',
  SATISFACTION: 'satisfaction',
  MANUAL_ADJUST: 'manualAdjust',
} as const
export type RdmScoreReason = (typeof RDM_SCORE_REASON)[keyof typeof RDM_SCORE_REASON]

export const RDM_SCORE_REASON_LABEL: Record<RdmScoreReason, string> = {
  [RDM_SCORE_REASON.DELIVERED]: '交付基準分',
  [RDM_SCORE_REASON.ON_TIME]: '按時交付加分',
  [RDM_SCORE_REASON.LATE]: '逾期扣分',
  [RDM_SCORE_REASON.FIRST_PASS]: '驗收一次通過加分',
  [RDM_SCORE_REASON.REWORK]: '驗收返工扣分',
  [RDM_SCORE_REASON.REOPEN]: '駁回重開扣分',
  [RDM_SCORE_REASON.SATISFACTION]: '滿意度係數',
  [RDM_SCORE_REASON.MANUAL_ADJUST]: '人工調整',
}

/** 绩效推送状态（建议值不直接入考核单，HR 必须在校准环节确认） */
export const RDM_SCORE_PUSH_STATUS = {
  NONE: 'none',
  SUGGESTED: 'suggested',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
} as const
export type RdmScorePushStatus = (typeof RDM_SCORE_PUSH_STATUS)[keyof typeof RDM_SCORE_PUSH_STATUS]

export const RDM_SCORE_PUSH_STATUS_LABEL: Record<RdmScorePushStatus, string> = {
  [RDM_SCORE_PUSH_STATUS.NONE]: '未推送',
  [RDM_SCORE_PUSH_STATUS.SUGGESTED]: '已推建議值',
  [RDM_SCORE_PUSH_STATUS.CONFIRMED]: 'HR 已確認',
  [RDM_SCORE_PUSH_STATUS.REJECTED]: 'HR 已駁回',
}

export const RDM_SCORE_PUSH_STATUS_COLOR: Record<RdmScorePushStatus, string> = {
  [RDM_SCORE_PUSH_STATUS.NONE]: 'default',
  [RDM_SCORE_PUSH_STATUS.SUGGESTED]: 'processing',
  [RDM_SCORE_PUSH_STATUS.CONFIRMED]: 'success',
  [RDM_SCORE_PUSH_STATUS.REJECTED]: 'error',
}

/** 快照维度（rdm_metric_snapshot.dim_type） */
export const RDM_METRIC_DIM = {
  COMPANY: 'COMPANY',
  DEPT: 'DEPT',
  PERSON: 'PERSON',
  PM: 'PM',
} as const
export type RdmMetricDim = (typeof RDM_METRIC_DIM)[keyof typeof RDM_METRIC_DIM]

export const RDM_METRIC_DIM_LABEL: Record<RdmMetricDim, string> = {
  [RDM_METRIC_DIM.COMPANY]: '公司整體',
  [RDM_METRIC_DIM.DEPT]: '部門',
  [RDM_METRIC_DIM.PERSON]: '個人',
  [RDM_METRIC_DIM.PM]: '產品經理',
}

/**
 * 需求终态：已进入结果、不再需要人跟催。
 * <p>看板列「已駁回 / 已歸檔」与列表催办按钮共用这一份口径，
 * 避免两个视图对「这条还要不要动」判断不一致。
 */
export const RDM_TERMINAL_STATUS: RdmStatus[] = [
  RDM_STATUS.RELEASED,
  RDM_STATUS.VERIFIED,
  RDM_STATUS.CLOSED,
  RDM_STATUS.REJECTED,
  RDM_STATUS.INTAKE_REJECTED,
]

/**
 * 看板视图单次拉取上限。
 * <p>看板是按列铺开、不做翻页，所以一次要拿够；但不能无限拿
 * （卡片带阶段条与 Tooltip，DOM 量随条数线性增长）。超限由页面显式提示截断。
 */
export const RDM_KANBAN_SIZE = 100

/**
 * 可冻结五节点基线的需求状态（前端唯一来源）。
 * <p>必须与后端 RdmDeliveryServiceImpl.BASELINE_FREEZE_STATUS 一字不差：前端曾经只判
 * 「评审通过」，而正常动线是先排期再冻结基线，结果排期之后按钮永远消失，
 * 需求只能带着「基线未冻结」的豁免上线（阶段 4 端到端实测 D1）。
 * 两边各写一份迟早会再漂移，所以判定收敛到这个函数并由单测钉住。
 */
export const RDM_BASELINE_FREEZE_STATUS: string[] = [
  RDM_STATUS.REVIEW_PASSED, RDM_STATUS.SCHEDULED, RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING,
]

/** 基线冻结入口是否可用（列表页/详情页/节点计划页共用同一判断） */
export function canFreezeBaseline(status?: string | null): boolean {
  return !!status && RDM_BASELINE_FREEZE_STATUS.includes(status)
}
