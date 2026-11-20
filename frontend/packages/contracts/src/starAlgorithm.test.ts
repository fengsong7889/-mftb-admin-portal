/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { StarTarget, StarExposureStrategy, STAR_SCHEMA_VERSION, isStarParams, makeStarProductParams, hasStarProtocol } from './starAlgorithm'

const product = () => makeStarProductParams({ consistencyCheckInterval: 5, exposureStrategy: StarExposureStrategy.ROUND_ROBIN }, 0)
const store = () => ({
  schemaVersion: STAR_SCHEMA_VERSION, applicableBusinessTypes: [2], targetType: StarTarget.STORE, revision: 1,
  storeRules: { consistencyCheckInterval: 5, merchantExposureStrategy: 'random', statusOpen: true, statusRest: false, statusOverwhelmed: false, statusClosed: false },
})

describe('星星算法契约（与后端 StarAlgorithmParams 对齐）', () => {
  it('合法商品/门店参数通过校验，构造器产出规范结构', () => {
    expect(isStarParams(product())).toBe(true)
    expect(isStarParams(store())).toBe(true)
    expect(product()).toEqual({ schemaVersion: 1, applicableBusinessTypes: [2], targetType: 2, revision: 0, productRules: { consistencyCheckInterval: 5, exposureStrategy: 'roundRobin' } })
    expect(hasStarProtocol(product())).toBe(true)
    expect(hasStarProtocol({ statusOpen: true })).toBe(false)
  })

  it('拒绝未知版本、缺字段、混入对象与已撤回字段', () => {
    expect(isStarParams({ ...product(), schemaVersion: 2 })).toBe(false)
    const noRev: Record<string, unknown> = { ...product() }
    delete noRev.revision
    expect(isStarParams(noRev)).toBe(false)
    expect(isStarParams({ ...product(), storeRules: {} })).toBe(false)
    expect(isStarParams({ ...product(), productRules: { consistencyCheckInterval: 5, exposureStrategy: 'random', minSellableStock: 1 } })).toBe(false)
    expect(isStarParams({ ...product(), legacyParams: {} })).toBe(false)
    expect(isStarParams(null)).toBe(false)
    expect(isStarParams([])).toBe(false)
  })

  it('拒绝非法区间、策略与业务范围', () => {
    expect(isStarParams(makeStarProductParams({ consistencyCheckInterval: 0, exposureStrategy: 'random' }, 0))).toBe(false)
    expect(isStarParams(makeStarProductParams({ consistencyCheckInterval: 1441, exposureStrategy: 'random' }, 0))).toBe(false)
    expect(isStarParams(makeStarProductParams({ consistencyCheckInterval: 1.5, exposureStrategy: 'random' }, 0))).toBe(false)
    expect(isStarParams({ ...product(), productRules: { consistencyCheckInterval: 5, exposureStrategy: 'discountFirst' } })).toBe(false)
    expect(isStarParams({ ...product(), applicableBusinessTypes: [1] })).toBe(false)
    expect(isStarParams({ ...product(), revision: -1 })).toBe(false)
  })
})
