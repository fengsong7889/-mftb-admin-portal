import { describe, expect, it } from 'vitest'

import {
  RDM_BASELINE_FREEZE_STATUS,
  RDM_STATUS,
  canFreezeBaseline,
  getRdmPriorityLabel,
  getRdmComplexityLabel,
  RDM_PRIORITY_LABEL,
  RDM_COMPLEXITY_LABEL,
  RDM_ACCEPT_RESULT,
  RDM_ACCEPTANCE_TYPE,
  RDM_ACCEPT_STAGE,
  RDM_DECISION,
  RDM_DECISION_LABEL,
  RDM_RELEASE_CHECK_TYPE,
  RDM_RELEASE_CHECK_TYPE_LABEL,
  RDM_VERIFY_STATUS,
  RDM_OPEN_STATUS,
  RDM_EXEMPTION_DECISION_TYPE,
  RDM_SUPPLEMENTARY_STATUS,
  RDM_SUPPLEMENTARY_RESULT,
} from './rdm'

/**
 * 基线冻结入口的状态口径测试（阶段 4 缺陷 D1 回归）。
 * <p>后端 RdmDeliveryServiceImpl.BASELINE_FREEZE_STATUS = {review_passed, scheduled,
 * designing, developing}，前端曾经只判 review_passed。正常动线是「评审通过 → 排期 →
 * 规划节点 → 冻结基线」，等 PM 排完期回到节点计划页，按钮已经消失，只能带豁免上线。
 * 这份清单是前后端各自的常量，只有测试能防止它再次漂移。
 */
describe('需求展示文案', () => {
  it.each([
    ['medium', '中等'], [' Medium ', '中等'], ['normal', '常規'],
    ['high', '高'], ['low', '低'], ['urgent', '緊急'], ['critical', '嚴重'],
    ...Object.entries(RDM_PRIORITY_LABEL),
  ])('优先级 %s 显示为 %s', (value, expected) => {
    expect(getRdmPriorityLabel(value)).toBe(expected)
  })

  it.each([
    ['normal', '一般'], ['simple', '簡單'], [' medium ', '中等'],
    ['complex', '複雜'], ['huge', '超大'],
    ...Object.entries(RDM_COMPLEXITY_LABEL),
  ])('规模 %s 显示为 %s', (value, expected) => {
    expect(getRdmComplexityLabel(value)).toBe(expected)
  })

  it.each([null, undefined, '', '   '])('空字段 %s 显示占位符', value => {
    expect(getRdmPriorityLabel(value)).toBe('-')
    expect(getRdmComplexityLabel(value)).toBe('-')
  })

  it.each(['unknown_value', 'constructor', '__proto__'])('未知字段 %s 不泄漏英文或原型属性', value => {
    expect(getRdmPriorityLabel(value)).toBe('未識別')
    expect(getRdmComplexityLabel(value)).toBe('未識別')
  })

  it('展示兼容不扩充可提交字典，也不将历史优先级推断为 P2', () => {
    expect(Object.keys(RDM_PRIORITY_LABEL)).toEqual(['P0', 'P1', 'P2', 'P3'])
    expect(Object.keys(RDM_COMPLEXITY_LABEL)).toEqual(['SIMPLE', 'MEDIUM', 'COMPLEX', 'HUGE'])
    expect(getRdmPriorityLabel('medium')).not.toContain('P2')
  })
})

describe('基线冻结入口状态口径', () => {
  it('评审通过到开发中之间都可以冻结（含排期之后）', () => {
    expect(RDM_BASELINE_FREEZE_STATUS).toEqual([
      RDM_STATUS.REVIEW_PASSED,
      RDM_STATUS.SCHEDULED,
      RDM_STATUS.DESIGNING,
      RDM_STATUS.DEVELOPING,
    ])
    expect(canFreezeBaseline(RDM_STATUS.REVIEW_PASSED)).toBe(true)
    // 这条正是当初漏掉的：排期之后仍必须能冻结
    expect(canFreezeBaseline(RDM_STATUS.SCHEDULED)).toBe(true)
    expect(canFreezeBaseline(RDM_STATUS.DESIGNING)).toBe(true)
    expect(canFreezeBaseline(RDM_STATUS.DEVELOPING)).toBe(true)
  })

  it('评审之前与进入测试之后不再提供冻结入口', () => {
    // 冻结前要先把初步计划排完，这些阶段还没到规划时点
    expect(canFreezeBaseline(RDM_STATUS.DRAFT)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.INTAKE_PENDING)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.ASSIGNED)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.ACCEPTED)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.PRD_DESIGNING)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.REVIEWING)).toBe(false)
    // 测试阶段之后基线该定型了，再冻结会让偏差数字失去意义
    expect(canFreezeBaseline(RDM_STATUS.INTEGRATION)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.TESTING)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.UAT_PENDING)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.RELEASED)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.VERIFIED)).toBe(false)
    expect(canFreezeBaseline(RDM_STATUS.CLOSED)).toBe(false)
  })

  it('状态缺失时按不可冻结处理（fail-closed，不靠异常兜底）', () => {
    expect(canFreezeBaseline(undefined)).toBe(false)
    expect(canFreezeBaseline(null)).toBe(false)
    expect(canFreezeBaseline('')).toBe(false)
    expect(canFreezeBaseline('not_a_status')).toBe(false)
  })
})

/**
 * 第三/四批枚举字面值防漂移。
 * <p>这些常量是前后端「逐字一致」的契约：后端 DTO 只认这些字符串，前端一旦拼错
 * （例如把 decision 写成 approve/reject、把 checkType 写成旧的前端臆造键），写操作会被
 * 后端静默拒绝或按未知值处理。这份断言把每个枚举的**字面值**钉死，防止再次漂移。
 */
describe('第三/四批枚举字面值与后端契约对齐', () => {
  it('验收类型/阶段/结论字面值逐字对齐后端 DTO', () => {
    expect(RDM_ACCEPTANCE_TYPE.PRODUCT).toBe('product')
    expect(RDM_ACCEPTANCE_TYPE.BUSINESS).toBe('business')
    expect(RDM_ACCEPT_STAGE.PRE_RELEASE).toBe('pre_release')
    expect(RDM_ACCEPT_STAGE.POST_RELEASE).toBe('post_release')
    expect(RDM_ACCEPT_RESULT.PASS).toBe('pass')
    expect(RDM_ACCEPT_RESULT.CONDITIONAL).toBe('conditional')
    expect(RDM_ACCEPT_RESULT.FAIL).toBe('fail')
  })

  it('发布裁决 decision 为 approved/rejected（不是 approve/reject）', () => {
    expect(RDM_DECISION.APPROVED).toBe('approved')
    expect(RDM_DECISION.REJECTED).toBe('rejected')
    expect(RDM_DECISION_LABEL.approved).toBeTruthy()
    expect(RDM_DECISION_LABEL.rejected).toBeTruthy()
  })

  it('放行检查项 checkType 对齐后端 5 项（test/acceptance/defect/dependency/scope）', () => {
    expect(Object.values(RDM_RELEASE_CHECK_TYPE).sort()).toEqual(
      ['acceptance', 'defect', 'dependency', 'scope', 'test'],
    )
    // 每个 checkType 都必须有繁中标签，避免详情页渲染出英文键
    Object.values(RDM_RELEASE_CHECK_TYPE).forEach(k => {
      expect(RDM_RELEASE_CHECK_TYPE_LABEL[k]).toBeTruthy()
    })
  })

  it('验证/开放/豁免裁决/补验枚举字面值逐字对齐后端', () => {
    expect(RDM_VERIFY_STATUS.PASSED).toBe('passed')
    expect(RDM_VERIFY_STATUS.FAILED).toBe('failed')
    expect(RDM_OPEN_STATUS.OPENED).toBe('opened')
    expect(RDM_OPEN_STATUS.NOT_OPENED).toBe('not_opened')
    expect(RDM_EXEMPTION_DECISION_TYPE.PRODUCT_RISK).toBe('product_risk')
    expect(RDM_EXEMPTION_DECISION_TYPE.RELEASE).toBe('release')
    expect(RDM_SUPPLEMENTARY_STATUS.PENDING).toBe('pending')
    expect(RDM_SUPPLEMENTARY_STATUS.OVERDUE).toBe('overdue')
    expect(RDM_SUPPLEMENTARY_RESULT.PASS).toBe('pass')
    expect(RDM_SUPPLEMENTARY_RESULT.FAIL).toBe('fail')
  })
})
