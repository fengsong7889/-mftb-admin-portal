/**
 * 验收规则 —— 纯函数层（从 AcceptanceForm 抽出）
 *
 * 为什么单独成文件：「用例结果如何约束验收结论」是 M3 的质量口径本体，
 * 后端落库时要用同一套规则校验，前端只负责把不合法的结论提前禁掉。
 * 规则散在组件里就无法复用、也无法被单测锁住。
 */
import {
  RDM_ACCEPT_RESULT,
  RDM_BLOCKING_SEVERITIES,
  RDM_CASE_RESULT,
  type RdmAcceptResult,
} from '../../constants/rdm'
import type { RdmAcceptanceCaseForm } from '../../api/rdm'

/** 用例统计结果 */
export interface AcceptanceCaseStat {
  /** 用例总数 */
  total: number
  /** 通过数 */
  passed: number
  /** 缺陷数（已判定且不通过/阻塞未测） */
  defects: number
  /** 致命/严重缺陷数（阻断上线） */
  blocking: number
  /**
   * 未判定数。
   * <p>必须单独算：早期版本把「没选结论」归进 defects，又给用例默认了「通過」，
   * 导致什么都不改就能交“全部通过”，验收退化成盖章。
   */
  unjudged: number
}

/** 验收提交的校验入参 */
export interface AcceptanceValidationInput extends AcceptanceCaseStat {
  /** 用例标题是否存在空行 */
  hasEmptyTitle: boolean
  result: RdmAcceptResult | string
  testEnv?: string
  issues: string
  createFollowUp: boolean
  followUpTitle: string
}

/** 汇总用例结论（只统计已判定的，未判定单独计数） */
export function statCases(cases: RdmAcceptanceCaseForm[]): AcceptanceCaseStat {
  const judged = cases.filter(c => !!c.result)
  const passed = judged.filter(c => c.result === RDM_CASE_RESULT.PASS).length
  const defects = judged.filter(c => c.result !== RDM_CASE_RESULT.PASS)
  const blocking = defects.filter(c => c.severity && (RDM_BLOCKING_SEVERITIES as string[]).includes(c.severity))
  return {
    total: cases.length,
    passed,
    defects: defects.length,
    blocking: blocking.length,
    unjudged: cases.length - judged.length,
  }
}

/**
 * 某个结论当前是否可选
 *
 * - 未逐条判定前，只允许「不通過」（带着问题退回不需要每条用例都有结论）
 * - 通过：不允许存在任何未通过用例
 * - 有条件通过：必须「有未通过用例但都不致命/严重」——没有缺陷时应直接判通过，
 *   有致命/严重缺陷则必须退回，避免把"有条件通过"当成绕过缺陷的后门
 * - 不通过：任何时候都可选
 */
export function canSelectResult(result: RdmAcceptResult | string, stat: AcceptanceCaseStat): boolean {
  if (stat.total === 0) return result === RDM_ACCEPT_RESULT.FAIL
  if (stat.unjudged > 0) return result === RDM_ACCEPT_RESULT.FAIL
  switch (result) {
    case RDM_ACCEPT_RESULT.PASS:
      return stat.defects === 0
    case RDM_ACCEPT_RESULT.CONDITIONAL:
      return stat.defects > 0 && stat.blocking === 0
    case RDM_ACCEPT_RESULT.FAIL:
      return true
    default:
      return true
  }
}

/** 提交前校验，返回第一条不满足的原因（页面直接 message 出来） */
export function validateAcceptance(input: AcceptanceValidationInput): string | null {
  if (input.total === 0) return '請至少填寫一條驗收用例（可從 PRD 驗收標準導入）'
  if (input.hasEmptyTitle) return '驗收用例標題不能為空'
  if (input.unjudged > 0) return `還有 ${input.unjudged} 條用例未判定，請逐條給出結論後再提交`
  if (!input.testEnv) return '請選擇驗收環境（返工時需要能復現）'
  if (!canSelectResult(input.result, input)) {
    if (input.result === RDM_ACCEPT_RESULT.PASS) return `有 ${input.defects} 條用例未通過，不能判定驗收通過`
    if (input.result === RDM_ACCEPT_RESULT.CONDITIONAL) {
      return input.defects === 0
        ? '全部用例都已通過，請直接判定驗收通過'
        : '存在致命/嚴重缺陷，不允許有條件通過，請退回研發修復'
    }
  }
  if (input.result !== RDM_ACCEPT_RESULT.PASS && !input.issues.trim()) {
    return input.result === RDM_ACCEPT_RESULT.FAIL ? '驗收不通過必須填寫問題描述' : '有條件通過需寫明遺留問題'
  }
  if (input.result === RDM_ACCEPT_RESULT.CONDITIONAL && input.createFollowUp && !input.followUpTitle.trim()) {
    return '請填寫轉後續需求的標題'
  }
  return null
}

/** 把未通过用例拼成问题描述草稿（未判定的不拼进去，它还不是结论） */
export function draftIssuesText(cases: RdmAcceptanceCaseForm[]): string {
  return cases
    .filter(c => !!c.result && c.result !== RDM_CASE_RESULT.PASS)
    .map(c => {
      const label = c.result === RDM_CASE_RESULT.BLOCKED ? '阻塞未測' : '不通過'
      return `【${label}】${c.title}${c.actual ? `（${c.actual}）` : ''}`
    })
    .join('；')
}
