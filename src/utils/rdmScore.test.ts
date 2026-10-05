/**
 * 积分引擎单测 —— 锁住绩效口径
 *
 * 这套分数会被直接引用进绩效考核，任何一次「顺手改系数」都可能让全员得分整体漂移，
 * 所以分配模式、扣分下限、不计分角色三类边界必须有测试兜住。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCORE_PARAMS,
  computeScore,
  sumScorableRoleFactors,
  type ScoreFacts,
} from './rdmScore'
import { RDM_SCORE_ALLOC_MODE } from '../constants/rdm'

/** 一条中等复杂度的正常交付需求 */
const healthy: ScoreFacts = {
  roleCode: 'PM',
  complexity: 'MEDIUM',
  reqType: 'OPTIMIZE',
  priority: 'P1',
  onTime: true,
  reworkCount: 0,
  reopenCount: 0,
  acceptanceScore: 5,
  firstPass: true,
}

describe('分配模式（绩效最敏感的一处）', () => {
  it('各角色分别计分：每人拿满含角色系数的分', () => {
    const pm = computeScore({ ...healthy, roleCode: 'PM' })
    const dev = computeScore({ ...healthy, roleCode: 'DEV' })
    // PM 与开发的角色系数都是 1，复杂度/类型/优先级一致时分数应相等
    expect(pm.finalScore).toBe(dev.finalScore)
    expect(pm.finalScore).toBeGreaterThan(0)
  })

  it('总额瓜分：所有计分角色之和等于该需求的理论总分（零和）', () => {
    const roles = ['PM', 'DEV_LEAD', 'QA']
    const factorSum = sumScorableRoleFactors(roles)
    const splitTotal = roles
      .reduce((sum, role) => sum + computeScore(
        { ...healthy, roleCode: role, roleFactorSum: factorSum },
        { allocMode: RDM_SCORE_ALLOC_MODE.SPLIT },
      ).finalScore, 0)
    const eachTotal = roles
      .reduce((sum, role) => sum + computeScore({ ...healthy, roleCode: role }).finalScore, 0)
    // PM 角色系数为 1，所以上面那条需求在 EACH 下的得分就等于“理论总分 pool”
    const pool = computeScore({ ...healthy, roleCode: 'PM' }).finalScore
    expect(splitTotal).toBeCloseTo(pool, 1)
    // EACH 会把总分放大 factorSum 倍，这正是两种模式的核心差异
    expect(eachTotal).toBeCloseTo(pool * factorSum, 1)
    expect(splitTotal).toBeLessThan(eachTotal)
  })

  it('验收人不在计分角色内，得分为 0', () => {
    const acceptor = computeScore({ ...healthy, roleCode: 'ACCEPTOR' })
    expect(acceptor.finalScore).toBe(0)
    expect(sumScorableRoleFactors(['ACCEPTOR', 'SUBMITTER', 'APPROVER'])).toBe(0)
  })
})

describe('按时因子', () => {
  it('按时上线有加成', () => {
    const onTime = computeScore({ ...healthy, onTime: true })
    const late = computeScore({ ...healthy, onTime: false, lateDays: 3 })
    expect(onTime.onTimeFactor).toBeCloseTo(1 + DEFAULT_SCORE_PARAMS.onTimeBonus, 2)
    expect(late.finalScore).toBeLessThan(onTime.finalScore)
  })

  it('逾期扣分按 10 天封顶，超出不再继续扣', () => {
    const slight = computeScore({ ...healthy, onTime: false, lateDays: 1 })
    const half = computeScore({ ...healthy, onTime: false, lateDays: 5 })
    const capped = computeScore({ ...healthy, onTime: false, lateDays: 10 })
    const extreme = computeScore({ ...healthy, onTime: false, lateDays: 90 })
    expect(slight.onTimeFactor).toBeGreaterThan(half.onTimeFactor)
    expect(half.onTimeFactor).toBeGreaterThan(capped.onTimeFactor)
    // 10 天及以上扣到上限（下限 0.5 保护），避免逾期天数直接把分数抹平
    expect(capped.onTimeFactor).toBeCloseTo(extreme.onTimeFactor, 2)
    expect(extreme.onTimeFactor).toBeGreaterThanOrEqual(0.5)
  })
})

describe('质量因子', () => {
  it('返工按次数扣分', () => {
    const clean = computeScore(healthy)
    const rework = computeScore({ ...healthy, reworkCount: 2, firstPass: false })
    expect(rework.qualityFactor).toBeLessThan(clean.qualityFactor)
    expect(rework.finalScore).toBeLessThan(clean.finalScore)
  })

  it('返工再多也不突破质量因子下限（避免分数被抹平引发争议）', () => {
    const extreme = computeScore({ ...healthy, reworkCount: 50, firstPass: false, acceptanceScore: 1 })
    expect(extreme.qualityFactor).toBeCloseTo(DEFAULT_SCORE_PARAMS.qualityFloor, 2)
  })

  it('满意度高于 3 分加分、低于 3 分扣分', () => {
    const high = computeScore({ ...healthy, acceptanceScore: 5 })
    const low = computeScore({ ...healthy, acceptanceScore: 1 })
    expect(high.qualityFactor).toBeGreaterThan(low.qualityFactor)
  })
})

describe('公式可追溯（每个因子都要有说明）', () => {
  it('返回四项成因说明，且写明复杂度/类型/优先级/角色系数', () => {
    const result = computeScore(healthy)
    expect(result.reasons).toHaveLength(4)
    const memos = result.reasons.map(r => r.memo ?? '').join(' ')
    expect(memos).toContain('MEDIUM')
    expect(memos).toContain('OPTIMIZE')
    expect(memos).toContain('P1')
    expect(memos).toContain('PM')
    expect(result.reasons.every(r => !!r.label)).toBe(true)
  })

  it('规则参数可覆盖（后端按 rdm_score_rule 当期版本传参）', () => {
    const custom = computeScore(healthy, { unitScore: 20 })
    const normal = computeScore(healthy)
    expect(custom.finalScore).toBeCloseTo(normal.finalScore * 2, 1)
  })
})
