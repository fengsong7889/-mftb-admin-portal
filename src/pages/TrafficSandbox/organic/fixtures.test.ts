/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { AppType, Region } from '@mftb/contracts/recommendConstants'
import { DEFAULT_ORGANIC_SCORE_RULES, isOrganicRuleVisible } from '../../Recommend/organicTrafficConfig'
import { DATA_TIME, DISTANCE_CURVE, getSampleSnapshot, POINTS, RULE_CATALOG, SCENES, TARGET_STORE } from './fixtures'
import { coordinateError, DEFAULT_QUERY, expandRegions, matchSamplePoint, rankChange, readBoardQuery } from './display'

/** 只验证前端样例与展示契约，不充当真实计分引擎测试。 */
describe('自然流量展示快照', () => {
  it('目录与当前算法库一致，并区分品牌适用性', () => {
    expect(RULE_CATALOG.map(r => r.code).sort()).toEqual(DEFAULT_ORGANIC_SCORE_RULES.map(r => r.id).sort())
    for (const brand of [AppType.SHANFENG, AppType.MFOOD]) {
      const rules = getSampleSnapshot(brand).stores[0].rules
      expect(rules.filter(r => r.ruleStatus !== 'inapplicable').map(r => r.ruleCode).sort())
        .toEqual(DEFAULT_ORGANIC_SCORE_RULES.filter(r => isOrganicRuleVisible(r.id, brand)).map(r => r.id).sort())
    }
  })
  it('120家虚拟门店中108家正常参排，名次连续且按综合得分降序', () => {
    for (const brand of [AppType.SHANFENG, AppType.MFOOD]) {
      const snapshot = getSampleSnapshot(brand)
      expect(snapshot.stores).toHaveLength(120)
      expect(new Set(snapshot.stores.map(s => s.regionId)).size).toBe(11)
      const ranked = snapshot.stores.filter(s => s.totalScore != null)
      expect(ranked).toHaveLength(108)
      expect(ranked.map(s => s.globalRank)).toEqual(Array.from({ length: 108 }, (_, i) => i + 1))
      for (let i = 1; i < ranked.length; i += 1) {
        expect(ranked[i - 1].totalScore!).toBeGreaterThanOrEqual(ranked[i].totalScore!)
      }
      expect(snapshot.stores.find(s => s.storeId === TARGET_STORE)).toMatchObject({ regionId: Region.KOKSAA })
      expect(ranked.filter(s => s.regionId === Region.KOKSAA)).toHaveLength(14)
    }
  })
  it('总分等于三维度得分合计，维度分等于启用计分项得分合计，不乘权重', () => {
    for (const brand of [AppType.SHANFENG, AppType.MFOOD]) for (const point of ['A', 'B'] as const) for (const scene of SCENES) for (const mode of ['distance', 'full'] as const) {
      const snapshot = getSampleSnapshot(brand, point, scene.value, mode)
      for (const store of snapshot.stores) {
        if (store.totalScore == null) { expect(store.globalRank).toBeNull(); continue }
        expect(store.totalScore).toBeCloseTo(store.dimensions.reduce((sum, d) => sum + (d.rawScore ?? 0), 0), 8)
        for (const dimension of store.dimensions) {
          const rules = store.rules.filter(r => r.dimension === dimension.dimension && r.ruleStatus === 'enabled')
          if (rules.some(r => r.rawScore == null)) expect(dimension.rawScore).toBeNull()
          else expect(dimension.rawScore).toBeCloseTo(rules.reduce((sum, r) => sum + (r.rawScore ?? 0), 0), 8)
        }
      }
    }
  })
  it('券样例可逐子项对账，且子项合计就是本项得分', () => {
    const rule = getSampleSnapshot().stores[0].rules.find(r => r.ruleCode === 'COM_03')!
    expect(rule.rawScore).toBe(56)
    expect(rule.parts?.reduce((sum, p) => sum + p.score, 0)).toBe(56)
  })
  it('缺数据、异常与置后门店不生成总分和名次', () => {
    const pending = getSampleSnapshot().stores.find(s => s.storeId === 'DEMO-109')!
    expect(pending.coordinate).toBeNull()
    expect(pending.rules.find(r => r.ruleCode === 'PLT_01')?.rawScore).toBeNull()
    expect(pending.totalScore).toBeNull()
    for (const scene of ['config', 'sample', 'stale', 'error'] as const) {
      expect(getSampleSnapshot(AppType.SHANFENG, 'A', scene).stores.every(s => s.totalScore == null && s.globalRank == null)).toBe(true)
    }
    expect(getSampleSnapshot(AppType.SHANFENG, 'A', 'stale').stores[0].rules.find(r => r.ruleCode === 'STB_05')?.observedAt).not.toBe(DATA_TIME)
  })
  it('单因素模式只变距离项，完整场景可以变更配送及资格', () => {
    const a = getSampleSnapshot()
    const b = getSampleSnapshot(AppType.SHANFENG, 'B')
    for (const store of a.stores) {
      const after = b.stores.find(s => s.storeId === store.storeId)!
      const changed = store.rules.filter(r => r.rawScore !== after.rules.find(n => n.ruleCode === r.ruleCode)?.rawScore)
      expect(changed.every(r => r.ruleCode === 'PLT_01')).toBe(true)
    }
    const full = getSampleSnapshot(AppType.SHANFENG, 'B', 'normal', 'full')
    expect(full.stores.find(s => s.storeId === 'DEMO-108')!.eligibility).toBe('filtered')
    expect(getSampleSnapshot(AppType.SHANFENG, 'B').stores.find(s => s.storeId === 'DEMO-108')!.eligibility).toBe('ranked')
  })
  it('扣分场景保留负分并计入三维合计', () => {
    const store = getSampleSnapshot(AppType.SHANFENG, 'A', 'deduction').stores[0]
    const deduction = store.rules.find(r => r.ruleCode === 'PLT_03')!
    expect(deduction.rawScore).toBe(-30)
    expect(deduction.matchStatus).toBe('deducted')
    expect(store.dimensions.find(d => d.dimension === 'platform')!.rawScore)
      .toBeCloseTo(store.rules.filter(r => r.dimension === 'platform' && r.ruleStatus === 'enabled').reduce((sum, r) => sum + (r.rawScore ?? 0), 0), 8)
  })
  it('零分快照不把未知分项归零', () => {
    const zero = getSampleSnapshot(AppType.SHANFENG, 'A', 'zero')
    expect(zero.stores.filter(s => s.totalScore != null).every(s => s.totalScore === 0)).toBe(true)
    expect(zero.stores.find(s => s.storeId === 'DEMO-109')!.rules.find(r => r.ruleCode === 'PLT_01')!.rawScore).toBeNull()
  })
  it('距离曲线与坐标校验样例可复现', () => {
    expect(DISTANCE_CURVE.find(p => p.distance === 0)?.score).toBe(100)
    expect(DISTANCE_CURVE.find(p => p.distance === 20)?.score).toBe(0)
    expect(coordinateError(null, 113.5)).toBe('請完整填寫經度與緯度')
    expect(coordinateError(91, 113.5)).toContain('緯度須為 -90～90')
    expect(matchSamplePoint(POINTS.A)).toBe('A')
    expect(matchSamplePoint({ lat: 22.18, lng: 113.56 })).toBeNull()
    expect(rankChange(3, 1)).toBe('提升 2 名')
    expect(rankChange(null, 1)).toBe('新進入')
  })
  it('区域展开与查询参数解析保持在澳门11个商圈内', () => {
    expect(expandRegions(['macau_area', 'taipa_area'])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(expandRegions(['12', '13', 'abc'])).toEqual([])
    expect(readBoardQuery(new URLSearchParams('regions=1,6&size=50')).regions).toEqual([1, 6])
    expect(readBoardQuery(new URLSearchParams('size=999')).size).toBe(DEFAULT_QUERY.size)
  })
})
