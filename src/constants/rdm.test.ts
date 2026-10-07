import { describe, expect, it } from 'vitest'

import {
  RDM_BASELINE_FREEZE_STATUS,
  RDM_STATUS,
  canFreezeBaseline,
} from './rdm'

/**
 * 基线冻结入口的状态口径测试（阶段 4 缺陷 D1 回归）。
 * <p>后端 RdmDeliveryServiceImpl.BASELINE_FREEZE_STATUS = {review_passed, scheduled,
 * designing, developing}，前端曾经只判 review_passed。正常动线是「评审通过 → 排期 →
 * 规划节点 → 冻结基线」，等 PM 排完期回到节点计划页，按钮已经消失，只能带豁免上线。
 * 这份清单是前后端各自的常量，只有测试能防止它再次漂移。
 */
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
