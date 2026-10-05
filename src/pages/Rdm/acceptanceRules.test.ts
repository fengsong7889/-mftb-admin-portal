/**
 * M3 验收规则单测 —— 锁住「用例结果反向约束结论」这条质量口径
 *
 * 这几条约束是防止验收被绕过的关键，一旦被改宽（例如有严重缺陷也能选"有条件通过"），
 * 一次通过率与返工统计就会失真，绩效侧数据随之作废，所以必须有测试兜住。
 */
import { describe, expect, it } from 'vitest'
import { RDM_ACCEPT_RESULT, RDM_CASE_RESULT, RDM_DEFECT_SEVERITY, RDM_TEST_ENV } from '../../constants/rdm'
import type { RdmAcceptanceCaseForm } from '../../api/rdm'
import { canSelectResult, draftIssuesText, statCases, validateAcceptance } from './acceptanceRules'

/** 构造用例 */
const c = (
  title: string,
  result: RdmAcceptanceCaseForm['result'] = RDM_CASE_RESULT.PASS,
  severity?: string,
): RdmAcceptanceCaseForm => ({ title, result, severity })

/**
 * 构造「未判定」用例。
 * <p>不能写成 c(title, undefined)：默认参数会把显式 undefined 当没传而填成「通過」，
 * 那样这些用例就变成已判定，测试会静默地测不到真东西。
 */
const cUnjudged = (title: string): RdmAcceptanceCaseForm => ({ title, result: undefined })

describe('验收用例统计 statCases', () => {
  it('阻塞未测也计入缺陷（不能当成没测就不算问题）', () => {
    const stat = statCases([
      c('用例一'),
      c('用例二', RDM_CASE_RESULT.BLOCKED, RDM_DEFECT_SEVERITY.MINOR),
      c('用例三', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.CRITICAL),
    ])
    expect(stat).toEqual({ total: 3, passed: 1, defects: 2, blocking: 1, unjudged: 0 })
  })

  /**
   * 回归用例：曾经给用例默认「通過」且把未判定归进缺陷，
   * 导致什么都不改就能交「全部通过」；这两条锁住新口径。
   */
  it('未判定的用例不算缺陷也不算通过，单独计 unjudged', () => {
    const stat = statCases([
      c('用例一'),
      cUnjudged('用例二'),
      cUnjudged('用例三'),
    ])
    expect(stat).toEqual({ total: 3, passed: 1, defects: 0, blocking: 0, unjudged: 2 })
  })

  it('还有未判定用例时，「验收通过」与「有条件通过」都不可选', () => {
    const stat = statCases([c('用例一'), cUnjudged('用例二')])
    expect(canSelectResult(RDM_ACCEPT_RESULT.PASS, stat)).toBe(false)
    expect(canSelectResult(RDM_ACCEPT_RESULT.CONDITIONAL, stat)).toBe(false)
    // 带着问题退回不需要每条用例都有结论
    expect(canSelectResult(RDM_ACCEPT_RESULT.FAIL, stat)).toBe(true)
  })

  it('提交校验会拦未判定（不靠 UI 禁用兼容绕过）', () => {
    const stat = statCases([c('用例一'), cUnjudged('用例二')])
    expect(validateAcceptance({
      ...stat,
      hasEmptyTitle: false,
      result: RDM_ACCEPT_RESULT.FAIL,
      testEnv: RDM_TEST_ENV.UAT,
      issues: '先退回补充',
      createFollowUp: false,
      followUpTitle: '',
    })).toContain('未判定')
  })

  it('未通过但未定级时不计入阻断缺陷', () => {
    const stat = statCases([c('用例一', RDM_CASE_RESULT.FAIL)])
    expect(stat.defects).toBe(1)
    expect(stat.blocking).toBe(0)
  })
})

describe('结论可选性 canSelectResult', () => {
  it('全部通过时只允许「验收通过」与「验收不通过」', () => {
    const stat = statCases([c('用例一'), c('用例二')])
    expect(canSelectResult(RDM_ACCEPT_RESULT.PASS, stat)).toBe(true)
    // 没有遗留问题就不该走「有条件通过」，否则遗留事项为空、统计口径混乱
    expect(canSelectResult(RDM_ACCEPT_RESULT.CONDITIONAL, stat)).toBe(false)
  })

  it('存在致命/严重缺陷时禁止「通过」与「有条件通过」', () => {
    const stat = statCases([c('用例一'), c('用例二', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.MAJOR)])
    expect(canSelectResult(RDM_ACCEPT_RESULT.PASS, stat)).toBe(false)
    expect(canSelectResult(RDM_ACCEPT_RESULT.CONDITIONAL, stat)).toBe(false)
    expect(canSelectResult(RDM_ACCEPT_RESULT.FAIL, stat)).toBe(true)
  })

  it('只有轻微遗留时允许「有条件通过」', () => {
    const stat = statCases([c('用例一'), c('用例二', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.TRIVIAL)])
    expect(canSelectResult(RDM_ACCEPT_RESULT.PASS, stat)).toBe(false)
    expect(canSelectResult(RDM_ACCEPT_RESULT.CONDITIONAL, stat)).toBe(true)
  })

  it('空用例集只允许退回（没有验证过就不能判通过）', () => {
    const stat = statCases([])
    expect(canSelectResult(RDM_ACCEPT_RESULT.PASS, stat)).toBe(false)
    expect(canSelectResult(RDM_ACCEPT_RESULT.FAIL, stat)).toBe(true)
  })
})

describe('提交校验 validateAcceptance', () => {
  const base = {
    hasEmptyTitle: false,
    result: RDM_ACCEPT_RESULT.PASS,
    testEnv: 'uat',
    issues: '',
    createFollowUp: false,
    followUpTitle: '',
  }

  it('缺用例时优先提示补用例', () => {
    expect(validateAcceptance({ ...base, ...statCases([]) })).toContain('驗收用例')
  })

  it('未选验收环境时阻断（返工需要可复现）', () => {
    const error = validateAcceptance({ ...base, ...statCases([c('用例一')]), testEnv: undefined })
    expect(error).toContain('驗收環境')
  })

  it('有缺陷却判通过时报具体缺陷数', () => {
    const stat = statCases([c('用例一'), c('用例二', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.MINOR)])
    const error = validateAcceptance({ ...base, ...stat })
    expect(error).toBe('有 1 條用例未通過，不能判定驗收通過')
  })

  it('不通过结论必须填写问题描述', () => {
    const stat = statCases([c('用例一'), c('用例二', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.MAJOR)])
    const error = validateAcceptance({ ...base, ...stat, result: RDM_ACCEPT_RESULT.FAIL, issues: '   ' })
    expect(error).toContain('問題描述')
  })

  it('有条件通过勾选转需求时必须给标题', () => {
    const stat = statCases([c('用例一'), c('用例二', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.MINOR)])
    const error = validateAcceptance({
      ...base,
      ...stat,
      result: RDM_ACCEPT_RESULT.CONDITIONAL,
      issues: '遺留：導出提示不明確',
      createFollowUp: true,
      followUpTitle: '',
    })
    expect(error).toContain('轉後續需求的標題')
  })

  it('合法提交（全部通过 + 环境 + 结论）返回 null', () => {
    const stat = statCases([c('用例一'), c('用例二')])
    expect(validateAcceptance({ ...base, ...stat })).toBeNull()
  })
})

describe('遗留问题草稿 draftIssuesText', () => {
  it('只汇总未通过用例，阻塞与不通过分别标注', () => {
    const text = draftIssuesText([
      c('可自選起止日期'),
      c('區間上限校驗', RDM_CASE_RESULT.BLOCKED),
      c('導出超時', RDM_CASE_RESULT.FAIL, RDM_DEFECT_SEVERITY.MAJOR),
    ])
    expect(text).not.toContain('可自選起止日期')
    expect(text).toContain('【阻塞未測】區間上限校驗')
    expect(text).toContain('【不通過】導出超時')
  })

  it('全部通过时返回空串（不覆盖验收人已填的内容）', () => {
    expect(draftIssuesText([c('用例一'), c('用例二')])).toBe('')
  })
})
