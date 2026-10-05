/**
 * RDM 产出积分引擎（纯函数，前后端同一套口径）
 *
 * 为什么放 utils 而不是页面里：mock 数据、前端试算器、后端落库必须用同一个算法，
 * 否则页面上演示的分数与真实跑出来的分数不一致，绩效侧一旦引用就是事故。
 *
 * 公式：
 *   final = 复杂度权重 × 类型系数 × (1 + 优先级加分) × 按时因子 × 质量因子 × 角色系数 × 单位分
 *   SPLIT 模式下再除以「本需求所有计分角色系数之和」，即单条需求总分固定、按角色瓜分。
 *
 * 三条硬约束（绩效敏感）：
 * 1. 只给实际参与产出的角色计分，验收人/上级/审批人不参与分配；
 * 2. 每个因子都回显成因（reasons），被考核人要能看懂分怎么来的、怎么申诉；
 * 3. 因子有下限，避免一条返工多的需求把分数打到接近 0 从而引发争议。
 */
import {
  RDM_COMPLEXITY,
  RDM_PRIORITY,
  RDM_SCORE_ALLOC_MODE,
  RDM_SCORE_COMPLEXITY_WEIGHT,
  RDM_SCORE_PRIORITY_BONUS,
  RDM_SCORE_REASON,
  RDM_SCORE_ROLE_FACTOR,
  RDM_SCORE_TYPE_FACTOR,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
  type RdmRoleCode,
  type RdmScoreReason,
} from '../constants/rdm'

/** 可配置的公式参数（对应 rdm_score_rule 一行规则） */
export interface ScoreParams {
  /** 单位分：一分权重换算成多少积分 */
  unitScore: number
  /** 按时交付加分（系数增量） */
  onTimeBonus: number
  /** 逾期扣分上限（0~1，按逾期天数线性折算） */
  latePenalty: number
  /** 验收一次通过加分（系数增量） */
  firstPassBonus: number
  /** 每次返工的扣分（系数减量） */
  reworkPenalty: number
  /** 每次驳回重开的扣分 */
  reopenPenalty: number
  /** 满意度偏离 3 分的单位影响：(score-3) × acceptanceFactor */
  acceptanceFactor: number
  /** 质量因子下限，防止被打到 0 */
  qualityFloor: number
  /** 分配模式 */
  allocMode: string
}

/** 默认参数：与规则种子保持一致，后端落库时以 rdm_score_rule 为准 */
export const DEFAULT_SCORE_PARAMS: ScoreParams = {
  unitScore: 10,
  onTimeBonus: 0.1,
  latePenalty: 0.3,
  firstPassBonus: 0.1,
  reworkPenalty: 0.1,
  reopenPenalty: 0.05,
  acceptanceFactor: 0.06,
  qualityFloor: 0.6,
  allocMode: RDM_SCORE_ALLOC_MODE.EACH,
}

/** 参与积分计算的需求事实（全部来自已有表，不新增采集） */
export interface ScoreFacts {
  roleCode: string
  complexity?: string | null
  reqType?: string | null
  priority?: string | null
  /** 是否按时上线（实际 <= 计划；无计划日视为按时，避免"没排期"反被扣分） */
  onTime: boolean
  /** 逾期天数（onTime=false 时才有意义） */
  lateDays?: number
  /** 验收返工次数 */
  reworkCount?: number
  /** 驳回重开次数 */
  reopenCount?: number
  /** 验收满意度 1-5 */
  acceptanceScore?: number | null
  /** 验收是否一次通过（无 fail 记录） */
  firstPass?: boolean
  /** 本需求参与计分的角色系数之和（SPLIT 模式除数） */
  roleFactorSum?: number
}

/** 逐项因子与说明（前端展开显示，也是绩效申诉的依据） */
export interface ScoreBreakdownResult {
  base: number
  typeFactor: number
  priorityFactor: number
  onTimeFactor: number
  qualityFactor: number
  roleFactor: number
  /** 瓜分前的分数 */
  rawScore: number
  finalScore: number
  reasons: { code: RdmScoreReason; label: string; score: number; memo?: string }[]
}

/** 计分角色集合：只有这些角色参与产出分配 */
export const SCORABLE_ROLES: RdmRoleCode[] = ['PM', 'DEV_LEAD', 'DEV', 'DESIGNER', 'QA', 'PMO', 'DISPATCHER'] as RdmRoleCode[]

/** 本需求参与计分的角色系数之和（SPLIT 模式的分母） */
export function sumScorableRoleFactors(roles: string[]): number {
  return roles
    .filter(r => (SCORABLE_ROLES as string[]).includes(r))
    .reduce((sum, r) => sum + (RDM_SCORE_ROLE_FACTOR[r as RdmRoleCode] ?? 0), 0)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 计算单条需求在某个角色下的积分。
 *
 * @param facts 需求事实（来自 rdm_requirement / rdm_acceptance / rdm_status_log）
 * @param params 公式参数（缺省用默认值；后端从 rdm_score_rule 当期版本读取）
 */
export function computeScore(facts: ScoreFacts, params: Partial<ScoreParams> = {}): ScoreBreakdownResult {
  const p = { ...DEFAULT_SCORE_PARAMS, ...params }
  const complexity = (facts.complexity ?? RDM_COMPLEXITY.MEDIUM) as RdmComplexity
  const reqType = (facts.reqType ?? RDM_REQ_TYPE_FALLBACK) as RdmReqType
  const priority = (facts.priority ?? RDM_PRIORITY.P2) as RdmPriority
  const roleCode = facts.roleCode as RdmRoleCode

  const base = RDM_SCORE_COMPLEXITY_WEIGHT[complexity] ?? 2
  const typeFactor = RDM_SCORE_TYPE_FACTOR[reqType] ?? 1
  const priorityBonus = RDM_SCORE_PRIORITY_BONUS[priority] ?? 0
  const priorityFactor = 1 + priorityBonus
  const roleFactor = RDM_SCORE_ROLE_FACTOR[roleCode] ?? 0
  const lateDays = Math.max(facts.lateDays ?? 0, 0)

  // 按时因子：按时给小幅加成；逾期按天数折算，最多扣到 latePenalty
  const onTimeFactor = facts.onTime
    ? 1 + p.onTimeBonus
    : Math.max(1 - p.latePenalty * Math.min(lateDays / 10, 1), 0.5)

  // 质量因子：一次通过加分、返工与重开扣分、满意度偏离 3 分修正
  const rework = Math.max(facts.reworkCount ?? 0, 0)
  const reopen = Math.max(facts.reopenCount ?? 0, 0)
  const acceptanceDelta = facts.acceptanceScore == null ? 0 : (facts.acceptanceScore - 3) * p.acceptanceFactor
  const qualityRaw = 1
    + (facts.firstPass && rework === 0 ? p.firstPassBonus : 0)
    - rework * p.reworkPenalty
    - reopen * p.reopenPenalty
    + acceptanceDelta
  const qualityFactor = Math.max(qualityRaw, p.qualityFloor)

  const rawScore = base * typeFactor * priorityFactor * onTimeFactor * qualityFactor * roleFactor * p.unitScore
  /*
   * 两种分配模式的差别必须精确：
   * - EACH ：rawScore（含角色系数）就是得分，参与人多则团队总分会超过一条需求的“理论总分”；
   * - SPLIT：rawScore / 角色系数之和，即单条需求总分固定、按角色系数占比瓜分。
   * 不能先乘角色系数再除一次同样的系数（那会把系数算成平方）。
   */
  const splitBy = p.allocMode === RDM_SCORE_ALLOC_MODE.SPLIT
    ? Math.max(facts.roleFactorSum ?? roleFactor, 0.0001)
    : 1
  const finalScore = roleFactor <= 0 ? 0 : round2(rawScore / splitBy)

  const reasons: ScoreBreakdownResult['reasons'] = [
    { code: RDM_SCORE_REASON.DELIVERED, label: '交付基準分', score: round2(base * p.unitScore), memo: `複雜度 ${complexity} 權重 ${base}` },
    { code: RDM_SCORE_REASON.ON_TIME, label: '按時交付因子', score: round2(onTimeFactor * 100) / 100 - 1, memo: facts.onTime ? `按時上線 +${round2(p.onTimeBonus * 100)}%` : `逾期 ${lateDays} 天，扣至 ${round2(onTimeFactor * 100)}%` },
    { code: RDM_SCORE_REASON.SATISFACTION, label: '交付品質因子', score: round2(qualityFactor * 100) / 100 - 1, memo: buildQualityMemo(facts, rework, reopen, qualityFactor) },
    { code: RDM_SCORE_REASON.MANUAL_ADJUST, label: '角色與難度係數', score: round2(typeFactor * priorityFactor * roleFactor), memo: `類型 ${reqType} ×${typeFactor}，優先級 ${priority} ${priorityBonus >= 0 ? '+' : ''}${round2(priorityBonus)}，角色 ${roleCode} ×${roleFactor}` },
  ]

  return {
    base,
    typeFactor: round2(typeFactor),
    priorityFactor: round2(priorityFactor),
    onTimeFactor: round2(onTimeFactor),
    qualityFactor: round2(qualityFactor),
    roleFactor: round2(roleFactor),
    rawScore: round2(rawScore),
    finalScore,
    reasons,
  }
}

/** 需求类型兼容默认值（数据缺失时按其他类计分，不编难度加成） */
const RDM_REQ_TYPE_FALLBACK: RdmReqType = 'OTHER'

/** 质量因子说明文案（被考核人最关心的一条，必须写清扣在哪） */
function buildQualityMemo(facts: ScoreFacts, rework: number, reopen: number, qualityFactor: number): string {
  const parts: string[] = []
  if (facts.firstPass && rework === 0) parts.push('驗收一次通過')
  if (rework > 0) parts.push(`驗收返工 ${rework} 次`)
  if (reopen > 0) parts.push(`駁回重開 ${reopen} 次`)
  if (facts.acceptanceScore != null) parts.push(`滿意度 ${facts.acceptanceScore}/5`)
  parts.push(`係數 ${round2(qualityFactor)}（下限保護後）`)
  return parts.join('，')
}
