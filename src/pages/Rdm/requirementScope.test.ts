import { describe, expect, it } from 'vitest'
import { RDM_SCOPE } from '../../constants/rdm'
import { resolveActiveScope } from './requirementScopes'

/**
 * 视角参数解析测试：菜单拆分后三页各锁一组 Tab，URL 参数必须落在本页真有的视角上。
 *
 * 钉住两件事：
 *  1. 「我提的需求」去重后，旧链接 `/rdm-intake-approval?scope=mine` 不能把页面停在
 *     一个没有 Tab 的视角上（视图栏选不中、用户点不回来）；
 *  2. 清单页的 mine 必须原样保留 —— 它是提出人对自己需求进展的唯一自查入口
 *     （rdm-intake-approval 目前只有 admin 被授权），去重不能去成断链。
 */
const INTAKE_TABS = [RDM_SCOPE.APPROVING] as const
const LIST_TABS = [RDM_SCOPE.MINE, RDM_SCOPE.TODO, RDM_SCOPE.PRODUCT, RDM_SCOPE.DELIVERY] as const

describe('resolveActiveScope', () => {
  it('提需求页只给 approving：旧书签的 mine 回落到默认视角', () => {
    expect(resolveActiveScope('mine', INTAKE_TABS, RDM_SCOPE.APPROVING)).toBe(RDM_SCOPE.APPROVING)
  })

  it('本页有的视角照常采纳（URL 仍是单一数据源）', () => {
    expect(resolveActiveScope('approving', INTAKE_TABS, RDM_SCOPE.APPROVING)).toBe(RDM_SCOPE.APPROVING)
  })

  it('清单页的 mine 不受影响（去重不能断掉提出人自查入口）', () => {
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
