import { describe, expect, it } from 'vitest'
import { RDM_SCOPE } from '../../constants/rdm'
import { resolveActiveScope } from './requirementScopes'

/**
 * 视角参数解析测试：菜单拆分后三页各锁一组 Tab，URL 参数必须落在本页真有的视角上。
 *
 * 钉住三件事：
 *  1. 提需求页已改成单一合并视角 intake：旧链接 `/rdm-intake-approval?scope=mine|approving`
 *     必须回落到合并视角，不能把页面停在半个切片上（视图栏选不中、用户点不回来）；
 *  2. 清单页的 mine 必须原样保留 —— 它仍是执行侧清单的第一个切片；
 *  3. intake 是合法 scope（会被服务层按「本人提交 ∪ 审批待办」接住），
 *     漏登记 VALID_SCOPES 就等于把本页锁死在回落不上的参数上。
 */
const INTAKE_TABS = [RDM_SCOPE.INTAKE] as const
const LIST_TABS = [RDM_SCOPE.MINE, RDM_SCOPE.TODO, RDM_SCOPE.PRODUCT, RDM_SCOPE.DELIVERY] as const

describe('resolveActiveScope', () => {
  it('提需求页只有合并视角：旧书签的 mine/approving 都回落到 intake', () => {
    expect(resolveActiveScope('mine', INTAKE_TABS, RDM_SCOPE.INTAKE)).toBe(RDM_SCOPE.INTAKE)
    expect(resolveActiveScope('approving', INTAKE_TABS, RDM_SCOPE.INTAKE)).toBe(RDM_SCOPE.INTAKE)
    expect(resolveActiveScope(null, INTAKE_TABS, RDM_SCOPE.INTAKE)).toBe(RDM_SCOPE.INTAKE)
  })

  it('intake 是合法 scope（不被当成非法值丢掉）', () => {
    expect(resolveActiveScope('intake', INTAKE_TABS, RDM_SCOPE.MINE)).toBe(RDM_SCOPE.INTAKE)
  })

  it('清单页的 mine 不受影响（合并不能断掉执行侧的自查入口）', () => {
    expect(resolveActiveScope('mine', LIST_TABS, RDM_SCOPE.MINE)).toBe(RDM_SCOPE.MINE)
  })

  it('合法但本页没有的视角一律回落默认（清单页同理）', () => {
    expect(resolveActiveScope('all', LIST_TABS, RDM_SCOPE.MINE)).toBe(RDM_SCOPE.MINE)
  })

  it('非法值与缺参数都回到默认视角', () => {
    expect(resolveActiveScope('bogus', LIST_TABS, RDM_SCOPE.MINE)).toBe(RDM_SCOPE.MINE)
    expect(resolveActiveScope(null, LIST_TABS, RDM_SCOPE.TODO)).toBe(RDM_SCOPE.TODO)
  })

  it('未传默认视角时回落到 mine（拆分前的历史行为）', () => {
    expect(resolveActiveScope('bogus', LIST_TABS)).toBe(RDM_SCOPE.MINE)
  })

  /**
   * minimal 页（认领/分配）不传 Tab，语义是「锁死一个视角但允许深链」，
   * 本批次不改它的行为，所以这里钉住「合法即采纳」。
   */
  it('scopeTabs 为空的 minimal 页保持原语义：合法即采纳', () => {
    expect(resolveActiveScope('product', [], RDM_SCOPE.POOL)).toBe(RDM_SCOPE.PRODUCT)
    expect(resolveActiveScope('pool', [], RDM_SCOPE.POOL)).toBe(RDM_SCOPE.POOL)
    expect(resolveActiveScope('nope', [], RDM_SCOPE.POOL)).toBe(RDM_SCOPE.POOL)
  })
})
