/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { computeCoverage, computeDecay, computeSimilarity, matchOf, normalizeRank, rankScore, tieBreakOrder, decayState, evaluateInterestTrial, evaluateMatchingTrial, evaluateClickTrial, collaborativeScores, MAX_NEIGHBORS, type TrialMerchant, type ClickTrialSettings, type TrialSettings } from './trialCalcMath'

describe('投流公式试算纯函数', () => {
  it('覆盖率：正常比例、分母 0 记 0、封顶 100', () => {
    expect(computeCoverage(2, 5)).toBe(40)
    expect(computeCoverage(0, 0)).toBe(0)
    expect(computeCoverage(6, 5)).toBe(100)
  })

  it('衰减：floor 步数与 max(0,…) 兜底', () => {
    expect(computeDecay(12, 30, 7, 1)).toEqual({ steps: 4, score: 8 })
    expect(computeDecay(3, 100, 7, 1).score).toBe(0)
    expect(computeDecay(12, 6, 7, 1)).toEqual({ steps: 0, score: 12 })
  })

  it('相似度：中间量与两族归一差异（余弦消除量级不对称）', () => {
    const rows = [{ label: '汉堡', a: 90, b: 12 }, { label: '鸡翅', a: 50, b: 10 }]
    const cos = computeSimilarity(rows, 'cosine')
    expect(cos.dot).toBe(1580)
    expect(cos.sumA2).toBe(10600)
    expect(cos.sumB2).toBe(244)
    expect(cos.cosine).toBeGreaterThan(0.9)
    const jac = computeSimilarity(rows, 'weightedJaccard')
    expect(jac.sumMin).toBe(22)
    expect(jac.sumMax).toBe(140)
    expect(jac.value).toBeCloseTo(22 / 140, 6)
    // 空向量不除零
    expect(computeSimilarity([], 'cosine').value).toBe(0)
    expect(computeSimilarity([], 'weightedJaccard').value).toBe(0)
  })

  it('matchOf：入选集/覆盖率/互达标向量，落选商家覆盖率不达标', () => {
    const user = [{ label: '汉堡', score: 12 }, { label: '鸡翅', score: 10 }, { label: '甜品', score: 30 }, { label: '沙拉', score: 15 }, { label: '奶茶', score: 4 }]
    const a = [{ label: '汉堡', score: 90 }, { label: '鸡翅', score: 50 }, { label: '甜品', score: 55 }, { label: '奶茶', score: 80 }]
    const r = matchOf(user, a, 10, 50)
    expect(r.userSelCount).toBe(4)
    expect(r.coveredCount).toBe(3)
    expect(r.coverage).toBe(75)
    expect(r.coveredLabels).toEqual(['汉堡', '鸡翅', '甜品'])
    expect(r.rows.map(x => x.label)).toEqual(['汉堡', '鸡翅', '甜品', '沙拉', '奶茶'])
    expect(r.rows.find(x => x.label === '奶茶')).toEqual({ label: '奶茶', a: 80, b: 0 })
    const b = [{ label: '汉堡', score: 60 }, { label: '沙拉', score: 20 }, { label: '奶茶', score: 70 }]
    expect(matchOf(user, b, 10, 50).coverage).toBe(25)
  })

  it('排序：归一口径、预设单轴、自定义等权、余量方向反转', () => {
    const n = normalizeRank({ match: 0.9, remaining: 900, total: 1000, quality: 2, distance: 4 }, 5)
    expect(n.quality).toBe(0.4)
    expect(n.distance).toBeCloseTo(0.2, 6)
    expect(rankScore('matchFirst', [], n)).toBe(0.9)
    expect(rankScore('consumeFirst', [], n)).toBe(900)
    expect(n.traffic).toBe(0.9)
    expect(rankScore('custom', ['match', 'quality'], n)).toBeCloseTo(0.65, 6)
    // 配置无效时不假造得分。
    expect(rankScore('custom', [], n)).toBeNull()
    expect(rankScore('custom', ['unknown'], n)).toBeNull()
    expect(normalizeRank({ match: 0, remaining: 0, total: 1000, quality: 0, distance: 9 }, 5).distance).toBe(0)
  })

  it('匹配标签热度因子按候选交集最大值归一并参与等权综合', () => {
    const n = normalizeRank({ match: 0.5, remaining: 100, total: 1000, quality: 2, distance: 4, tagHeat: 3000 }, 5, 6000)
    expect(n.tagHeat).toBeCloseTo(0.5, 6)
    expect(rankScore('custom', ['match', 'tagHeat'], n)).toBeCloseTo(0.5, 6)
    // 未传 maxTagHeat（如冷启动/协同路径）时热度记 0，不凭空造分
    expect(normalizeRank({ match: 0.5, remaining: 100, total: 1000, quality: 2, distance: 4, tagHeat: 3000 }, 5).tagHeat).toBe(0)
  })

  it('同分决胜：质量高者先/距离近者先/余量方向反转/随机仍同分', () => {
    const a = { quality: 2, distance: 4, remaining: 0.8 }
    const b = { quality: 4.5, distance: 1, remaining: 0.2 }
    expect(tieBreakOrder(a, b, 'quality', 'moreFirst')).toBeGreaterThan(0)
    expect(tieBreakOrder(a, b, 'distance', 'moreFirst')).toBeGreaterThan(0)
    expect(tieBreakOrder(a, b, 'trafficDirection', 'moreFirst')).toBeLessThan(0)
    expect(tieBreakOrder(a, b, 'trafficDirection', 'lessFirst')).toBeGreaterThan(0)
    expect(tieBreakOrder(a, b, 'random', 'moreFirst')).toBe(0)
  })

  it.each(['cosine', 'weightedJaccard'])('完整向量区分同覆盖率的强弱偏好：%s', metric => {
    const user = [{ label: '汉堡', score: 100 }, { label: '沙拉', score: 10 }]
    const a = matchOf(user, [{ label: '汉堡', score: 50 }], 10, 50)
    const b = matchOf(user, [{ label: '沙拉', score: 50 }], 10, 50)
    expect(a.coverage).toBe(b.coverage)
    const sa = computeSimilarity(a.rows, metric).value
    const sb = computeSimilarity(b.rows, metric).value
    expect(sa).toBeGreaterThan(sb)
    expect(sa).toBeLessThan(1)
    if (metric === 'cosine') {
      expect(sa).toBeCloseTo(0.995037, 5)
      expect(sb).toBeCloseTo(0.099504, 5)
    } else {
      expect(sa).toBeCloseTo(50 / 110, 6)
      expect(sb).toBeCloseTo(10 / 150, 6)
    }
  })

  it('相同标签分布的数量尺度不同：余弦为 1，原始加权 Jaccard 为 0.1', () => {
    const rows = [{ label: 'A', a: 100, b: 10 }, { label: 'B', a: 200, b: 20 }]
    expect(computeSimilarity(rows, 'cosine').value).toBeCloseTo(1)
    expect(computeSimilarity(rows, 'weightedJaccard').value).toBeCloseTo(0.1)
  })

  it('标签去重、门槛边界和无交集均不产生额外覆盖', () => {
    const result = matchOf([{ label: '汉堡', score: 10 }, { label: ' 汉堡 ', score: 12 }, { label: '', score: 100 }],
      [{ label: '汉堡', score: 49 }, { label: '汉堡', score: 50 }, { label: '沙拉', score: 100 }], 10, 50)
    expect(result.userSelCount).toBe(1)
    expect(result.coveredCount).toBe(1)
    expect(result.rows[0]).toEqual({ label: '汉堡', a: 50, b: 12 })
    const none = matchOf([{ label: 'A', score: 10 }], [{ label: 'B', score: 50 }], 10, 50)
    expect(computeSimilarity(none.rows, 'cosine').value).toBe(0)
    expect(computeSimilarity(none.rows, 'weightedJaccard').value).toBe(0)
  })

  it('闲置清理优先于保留正分，正分也可能低于偏好门槛', () => {
    expect(decayState(12, 30, 7, 1, 30, 30, 10)).toMatchObject({ score: 0, expired: true, qualified: false })
    expect(decayState(12, 30, 7, 1, 30, null, 10)).toMatchObject({ score: 8, expired: false, qualified: false })
    expect(decayState(12, 6, 7, 1, 6, 30, 10)).toMatchObject({ score: 12, expired: false, qualified: true })
  })

  const settings: TrialSettings = { userMinimum: 10, merchantMinimum: 50, coverageMinimum: 0, metric: 'cosine',
    qualityPreference: { enabled: false, line: 3.5 }, preset: 'consumeFirst', factors: [], tieRule: 'quality', direction: 'lessFirst', maxDistance: 5 }
  const user = [{ label: '汉堡', score: 10 }]
  const merchants = [
    { id: 'A', paid: true, name: 'A', tags: [{ label: '汉堡', score: 50 }], remaining: 900, total: 1000, quality: 4, distance: 1 },
    { id: 'B', paid: true, name: 'B', tags: [{ label: '汉堡', score: 50 }], remaining: 1900, total: 10000, quality: 4.5, distance: 2 },
  ]
  it('消耗优先按剩余次数，不受冷启动方向或总量比例反转', () => {
    expect(evaluateInterestTrial(user, merchants, settings).ranked.map(r => r.m.name)).toEqual(['B', 'A'])
    expect(evaluateInterestTrial(user, merchants, { ...settings, direction: 'moreFirst' }).ranked.map(r => r.m.name)).toEqual(['B', 'A'])
    expect(evaluateInterestTrial(user, merchants, { ...settings, preset: 'custom', factors: ['traffic'] }).ranked.map(r => r.m.name)).toEqual(['A', 'B'])
  })
  it('关闭覆盖率仍不能推荐无重合者；耗尽/超范围/未购仍拦截', () => {
    const trial = evaluateInterestTrial(user, [
      { ...merchants[0], tags: [] }, { ...merchants[0], remaining: 0 },
      { ...merchants[0], distance: 6 }, { ...merchants[0], paid: false },
    ], settings)
    expect(trial.ranked).toHaveLength(0)
    expect(trial.rejected.map(r => r.reason)).toEqual(['没有双方达标的共同标签', '剩余曝光次数已耗尽', '超出示例最大直线距离', '未购本广告，仅自然层可考虑'])
  })
  it('质量不作硬准入：低分与暂无评分的已购商家仍保留资格', () => {
    const trial = evaluateInterestTrial(user, [
      { ...merchants[0], quality: 2 }, { ...merchants[0], quality: 0, qualityKnown: false },
    ], { ...settings, qualityPreference: { enabled: true, line: 3.5 } })
    expect(trial.ranked).toHaveLength(2)
    expect(trial.rejected).toHaveLength(0)
  })
  it('冷启动软优选：同层达线者先，未评分不跨层淘汰；等距按流量方向', () => {
    const cold = [
      { id: 'low', paid: true, name: '低分近', tags: [], remaining: 100, total: 1000, quality: 2, distance: 1 },
      { id: 'high', paid: true, name: '达线远', tags: [], remaining: 100, total: 1000, quality: 4, distance: 2 },
      { id: 'unknown', paid: true, name: '无评分近', tags: [], remaining: 100, total: 1000, quality: 0, distance: 1, qualityKnown: false },
    ]
    const on = evaluateInterestTrial([], cold, { ...settings, qualityPreference: { enabled: true, line: 3.5 } })
    expect(on.ranked.map(r => r.m.name)).toEqual(['达线远', '低分近', '无评分近'])
    const off = evaluateInterestTrial([], cold, settings)
    expect(off.ranked.map(r => r.m.name)).toEqual(['低分近', '无评分近', '达线远'])
  })
  it('冷启动不使用匹配分，匹配同分则执行质量决胜', () => {
    expect(evaluateInterestTrial([], merchants, settings).ranked.map(r => r.m.name)).toEqual(['A', 'B'])
    expect(evaluateInterestTrial(user, merchants, { ...settings, preset: 'matchFirst' }).ranked.map(r => r.m.name)).toEqual(['B', 'A'])
  })
  it('冷启动无优先级：单维纯排序、双维等权综合可权衡、质量软优选分层不硬排除', () => {
    const cold = [
      { id: 'near', paid: true, name: '近', tags: [], remaining: 900, total: 1000, quality: 2, distance: 1 },
      { id: 'far', paid: true, name: '远', tags: [], remaining: 1900, total: 10000, quality: 4, distance: 3 },
    ]
    // 只勾距离：近者先，忽略流量
    expect(evaluateInterestTrial([], cold, { ...settings, coldStartDimensions: ['distance'] }).ranked.map(r => r.m.name)).toEqual(['近', '远'])
    // 只勾流量＋剩余多优先：余量多者先，忽略距离
    expect(evaluateInterestTrial([], cold, { ...settings, direction: 'moreFirst', coldStartDimensions: ['remainingTraffic'] }).ranked.map(r => r.m.name)).toEqual(['远', '近'])
    // 双维等权综合：远而余量多 (1+0.4)/2=0.7 > 近而余量少 (0.47+0.8)/2≈0.64
    const both = evaluateInterestTrial([], cold, { ...settings, direction: 'moreFirst', coldStartDimensions: ['distance', 'remainingTraffic'] })
    expect(both.ranked.map(r => r.m.name)).toEqual(['远', '近'])
    expect(both.ranked[0].score).toBeCloseTo(0.7, 6)
    expect(both.ranked[1].score).toBeCloseTo((900 / 1900 + 0.8) / 2, 6)
    // 距离优势足够大时近而余量少可反转：远店改 4km → (1+0.2)/2=0.6 < 0.64
    const trade = evaluateInterestTrial([], [cold[0], { ...cold[1], distance: 4 }], { ...settings, direction: 'moreFirst', coldStartDimensions: ['distance', 'remainingTraffic'] })
    expect(trade.ranked.map(r => r.m.name)).toEqual(['近', '远'])
    // 三个全勾：质量达线者先（远店达线），层内综合分；未达线仍保留资格
    const all3 = evaluateInterestTrial([], cold, { ...settings, direction: 'moreFirst', coldStartDimensions: ['distance', 'remainingTraffic', 'qualityScore'], qualityPreference: { enabled: true, line: 3.5 } })
    expect(all3.ranked.map(r => r.m.name)).toEqual(['远', '近'])
    expect(all3.rejected).toHaveLength(0)
    // 仅勾质量：分层后同分保持输入顺序，不硬排除
    const qOnly = evaluateInterestTrial([], cold, { ...settings, coldStartDimensions: ['qualityScore'], qualityPreference: { enabled: true, line: 3.5 } })
    expect(qOnly.ranked.map(r => r.m.name)).toEqual(['远', '近'])
    expect(qOnly.rejected).toHaveLength(0)
  })
  it('协同：邻居去重支持、排除本人/零相似、CF 分母为邻居相似度之和', () => {
    const u = [{ label: '汉堡', score: 10 }]
    const neighbors = [
      { id: 'v1', tags: [{ label: '汉堡', score: 10 }], purchased: ['A', 'A', 'B'] },
      { id: 'v2', tags: [{ label: '汉堡', score: 10 }], purchased: ['A'] },
      { id: 'self', tags: [{ label: '汉堡', score: 10 }], purchased: ['C'] },
      { id: 'v1', tags: [{ label: '汉堡', score: 10 }], purchased: ['C'] },
      { id: 'zero', tags: [{ label: '沙拉', score: 99 }], purchased: ['C'] },
    ]
    const cf = collaborativeScores(u, neighbors, { currentUserId: 'self', userMinimum: 10, metric: 'cosine', threshold: 60 })
    expect(cf.neighbors.map(x => x.n.id)).toEqual(['v1', 'v2'])
    const a = cf.scores.find(s => s.store === 'A')!
    expect(a.support).toBe(2)
    expect(a.cf).toBeCloseTo(1, 6)
    expect(cf.scores.find(s => s.store === 'C')).toBeUndefined()
  })
  it('点击后分层：仅付费、跨层去重、后补层不混排', () => {
    const anchor = [{ label: '汉堡', score: 90 }]
    const ms = [
      { id: 'A', paid: true, name: 'A', tags: [{ label: '汉堡', score: 90 }], remaining: 100, total: 1000, quality: 4, distance: 1, category: '快餐' },
      { id: 'D', name: 'D', tags: [{ label: '汉堡', score: 95 }], remaining: 100, total: 1000, quality: 5, distance: 1, paid: false },
      { id: 'E', paid: true, name: 'E', tags: [{ label: '沙拉', score: 90 }], remaining: 100, total: 1000, quality: 4, distance: 1, category: '快餐' },
    ]
    const r = evaluateClickTrial({ currentUserId: 'self', anchorMerchantId: 'anchor', anchorTags: anchor, user: [{ label: '汉堡', score: 10 }], neighbors: [], merchants: ms,
      settings: { ...settings, enabled: true, slot1Source: 'merchantSimilar', slot2Source: 'userSimilar', requestedCount: 2, availableSlots: 2, similarityThreshold: 60, userSimilarThreshold: 60, modes: ['merchantSimilar', 'sameCategory'], anchorCategory: '快餐' } })
    expect(r.combined.map(x => x.m.name)).toEqual(['A', 'E'])
    expect(r.layers[0].items.map(x => x.m.name)).toEqual(['A'])
    expect(r.selected.map(x => [x.m.id, x.source])).toEqual([['A', 'merchantSimilar'], ['E', 'sameCategory']])
    expect(r.layers[1].items.every(x => x.matchScore === null)).toBe(true)
  })

  const store = (id: string, patch: Partial<TrialMerchant> = {}): TrialMerchant => ({
    id, paid: true, name: id, tags: [{ label: '汉堡', score: 90 }], remaining: 100, total: 1000, quality: 4, distance: 1, category: '快餐', ...patch,
  })
  const clickSettings: ClickTrialSettings = { ...settings, preset: 'matchFirst', enabled: true, slot1Source: 'merchantSimilar', slot2Source: 'userSimilar', requestedCount: 2,
    availableSlots: 2, similarityThreshold: 60, userSimilarThreshold: 60, modes: ['merchantSimilar', 'userSimilar', 'sameCategory'], anchorCategory: '快餐' }
  const clicked = (ms: TrialMerchant[], purchased: string[], patch: Partial<ClickTrialSettings> = {}) => evaluateClickTrial({
    currentUserId: 'self', anchorMerchantId: 'anchor', anchorTags: [{ label: '汉堡', score: 90 }], user,
    neighbors: [{ id: 'v1', tags: user, purchased }], merchants: ms, settings: { ...clickSettings, ...patch },
  })

  it.each(['cosine', 'weightedJaccard'])('点击后按坑位选来源：第 1/2 位各取所选来源、跨位去重（%s）', metric => {
    const ms = [store('B', { quality: 5 }), store('C'), store('D', { tags: [{ label: '寿司', score: 90 }] })]
    // 默认 slot1=商家相似、slot2=用户协同
    expect(clicked(ms, ['B', 'D'], { metric }).selected.map(x => [x.m.id, x.source])).toEqual([['B', 'merchantSimilar'], ['D', 'userSimilar']])
    // slot1=协同、slot2=商家相似
    expect(clicked(ms, ['B', 'D'], { metric, slot1Source: 'userSimilar', slot2Source: 'merchantSimilar' }).selected.map(x => [x.m.id, x.source])).toEqual([['B', 'userSimilar'], ['C', 'merchantSimilar']])
    // 两位都选协同：协同可占满两位
    expect(clicked(ms, ['B', 'D'], { metric, slot1Source: 'userSimilar', slot2Source: 'userSimilar' }).selected.map(x => [x.m.id, x.source])).toEqual([['B', 'userSimilar'], ['D', 'userSimilar']])
    // slot2 来源候选已被 slot1 占用→回补其余已启用来源
    expect(clicked(ms, ['B'], { metric }).selected.map(x => [x.m.id, x.source])).toEqual([['B', 'merchantSimilar'], ['C', 'merchantSimilar']])
  })

  it('点击后一路不足互补，未启用来源不补；同类目只在最后补', () => {
    const ms = [store('B'), store('C')]
    expect(clicked(ms, []).selected.map(x => x.source)).toEqual(['merchantSimilar', 'merchantSimilar'])
    const noMerchantMatch = ms.map(m => ({ ...m, tags: [{ label: '寿司', score: 90 }] }))
    expect(clicked(noMerchantMatch, ['B', 'C']).selected.map(x => x.source)).toEqual(['userSimilar', 'userSimilar'])
    expect(clicked(ms, ['B'], { modes: ['userSimilar'] }).selected.map(x => x.m.id)).toEqual(['B'])
    expect(clicked(noMerchantMatch, [], { modes: ['merchantSimilar'] }).selected).toEqual([])
    expect(clicked(noMerchantMatch, []).selected.map(x => x.source)).toEqual(['sameCategory', 'sameCategory'])
    // 存量指向已取消勾选的来源→运行时回退已启用来源
    expect(clicked(noMerchantMatch, [], { modes: ['sameCategory'], slot1Source: 'userSimilar', slot2Source: 'userSimilar' }).selected.map(x => x.source)).toEqual(['sameCategory', 'sameCategory'])
  })

  it('点击后数量合计上限两家、可用坑位优先；关闭或无位置不输出', () => {
    const ms = [store('B'), store('C'), store('D')]
    expect(clicked(ms, ['D'], { requestedCount: 1 }).selected.map(x => x.m.id)).toEqual(['B'])
    expect(clicked(ms, ['D'], { requestedCount: 1, slot1Source: 'userSimilar' }).selected.map(x => x.m.id)).toEqual(['D'])
    expect(clicked(ms, ['D'], { requestedCount: 1 }).selected.map(x => x.m.id)).toEqual(['B'])
    expect(clicked(ms, ['D'], { requestedCount: 9, availableSlots: 8 }).selected).toHaveLength(2)
    expect(clicked(ms, ['D'], { availableSlots: 1 }).selected.map(x => x.m.id)).toEqual(['B'])
    expect(clicked(ms, ['D'], { availableSlots: 0 }).selected).toEqual([])
    expect(clicked(ms, ['D'], { enabled: false }).selected).toEqual([])
    expect(clicked(ms, ['D'], { modes: [] }).selected).toEqual([])
  })

  it('付费资格先于所有来源；排除点击者、耗尽、超距与频控，同名不同 ID 不误去重', () => {
    const ms = [store('anchor'), store('unpaid', { paid: false }), store('empty', { remaining: 0 }),
      store('far', { distance: 9 }), store('seen'), store('B', { name: '同名店' }), store('C', { name: '同名店' })]
    const result = clicked(ms, ms.map(m => m.id), { excludedMerchantIds: ['seen'], modes: ['userSimilar'] })
    expect(result.selected.map(x => x.m.id)).toEqual(['B', 'C'])
    expect(result.rejected.map(x => x.m.id)).toEqual(['anchor', 'unpaid', 'empty', 'far', 'seen'])
    const repeated = clicked([store('B'), store('B'), store('C')], ['B', 'C'])
    expect(repeated.selected.map(x => x.m.id)).toEqual(['B', 'C'])
  })

  it('用户不投流、只有商家投流：邻居成交非投流店即使 CF 最高也只作输入，两场景均不推荐', () => {
    const ms = [store('A'), store('D', { paid: false })]
    const click = clicked(ms, ['D'], { modes: ['userSimilar'] })
    expect(click.cf?.scores.find(s => s.store === 'D')?.cf).toBeCloseTo(1, 6)
    expect(click.selected).toEqual([])
    const matching = ordinary(ms, { availableSlots: 2 })
    expect(matching.cf?.scores.some(s => s.store === 'D')).toBe(true)
    expect(matching.selected.map(x => x.m.id)).toEqual(['A'])
  })

  it('来源内排序实际使用预设与决胜；CF 不与商家相似度混排', () => {
    const ms = [store('B', { quality: 5 }), store('C', { remaining: 900 })]
    expect(clicked(ms, [], { modes: ['merchantSimilar'] }).selected[0].m.id).toBe('B')
    expect(clicked(ms, [], { modes: ['merchantSimilar'], preset: 'consumeFirst' }).selected[0].m.id).toBe('C')
    expect(clicked(ms, ['B', 'C'], { modes: ['userSimilar'], preset: 'custom', factors: ['traffic'] }).selected[0].m.id).toBe('C')
    expect(clicked(ms, ['B', 'C'], { preset: 'custom', factors: [] }).selected).toEqual([])
    expect(tieBreakOrder({ ...ms[0], qualityKnown: false }, ms[1], 'quality', 'moreFirst')).toBeGreaterThan(0)
  })

  const ordinary = (ms: TrialMerchant[], patch: Partial<Parameters<typeof evaluateMatchingTrial>[0]['settings']> = {}, tags = user) => evaluateMatchingTrial({
    currentUserId: 'self', user: tags, merchants: ms,
    neighbors: [{ id: 'v1', tags: user, purchased: ms.map(m => m.id) }],
    settings: { ...settings, preset: 'matchFirst', availableSlots: 3, userSimilarEnabled: true, userSimilarThreshold: 60, mode: 'fill', ratio: 10, ...patch },
  })

  it.each(['cosine', 'weightedJaccard'])('普通投流：仅补缺口，协同不套用直接标签重合和覆盖率，仍只推荐已购（%s）', metric => {
    const ms = [store('A'), store('B', { tags: [{ label: '寿司', score: 90 }] }), store('C', { tags: [] }), store('D', { paid: false })]
    const before = structuredClone(ms)
    const result = ordinary(ms, { metric, coverageMinimum: 100 })
    expect(result.selected.map(x => [x.m.id, x.source])).toEqual([['A', 'direct'], ['B', 'userSimilar'], ['C', 'userSimilar']])
    expect(result.shortfall).toBe(0)
    expect(result.selected).toHaveLength(3)
    expect(result.direct.rejected.map(x => x.m.id)).toEqual(['B', 'C', 'D'])
    expect(ms).toEqual(before)
    expect(ordinary(ms, { metric, availableSlots: 1 }).cf).toBeNull()
    expect(ordinary(ms, { metric, userSimilarEnabled: false }).selected.map(x => x.m.id)).toEqual(['A'])
  })

  it('普通投流 50 坑位可由 30 家直接匹配加 20 家协同补齐，不受两家上限影响', () => {
    const ms = Array.from({ length: 60 }, (_, i) => store(`M${i}`, i < 30 ? {} : { tags: [{ label: '寿司', score: 90 }] }))
    const result = ordinary(ms, { availableSlots: 50 })
    expect(result.selected).toHaveLength(50)
    expect(result.selected.filter(x => x.source === 'direct')).toHaveLength(30)
    expect(result.selected.filter(x => x.source === 'userSimilar')).toHaveLength(20)
    expect(new Set(result.selected.map(x => x.m.id)).size).toBe(50)
    expect(ordinary(ms.map(m => ({ ...m, tags: [{ label: '汉堡', score: 90 }] })), { availableSlots: 50 }).cf).toBeNull()
  })

  it('按比例预留：直接匹配充足仍为协同留配额；向下取整；协同不足名额回补直接匹配', () => {
    const ms = Array.from({ length: 60 }, (_, i) => store(`M${i}`))
    const r = ordinary(ms, { availableSlots: 50, mode: 'ratio', ratio: 10 })
    expect(r.quota).toBe(5)
    expect(r.selected.filter(x => x.source === 'userSimilar')).toHaveLength(5)
    expect(r.selected.filter(x => x.source === 'direct')).toHaveLength(45)
    expect(ordinary(ms, { availableSlots: 3, mode: 'ratio', ratio: 10 }).quota).toBe(0)
    const few = evaluateMatchingTrial({ currentUserId: 'self', user, merchants: ms,
      neighbors: [{ id: 'v1', tags: user, purchased: ['M0', 'M1'] }],
      settings: { ...settings, preset: 'matchFirst', availableSlots: 50, userSimilarEnabled: true, userSimilarThreshold: 60, mode: 'ratio', ratio: 10 } })
    expect(few.quota).toBe(5)
    expect(few.selected.filter(x => x.source === 'userSimilar')).toHaveLength(2)
    expect(few.selected).toHaveLength(50)
  })

  it('分数驱动排序：同标签不同分值高者先；未匹配标签不进分子；匹配优先按相似度而非个数', () => {
    const u = [{ label: '炸鸡', score: 100 }, { label: '汉堡', score: 90 }, { label: '薯条', score: 70 }]
    const A = store('A', { tags: [{ label: '炸鸡', score: 100 }, { label: '汉堡', score: 90 }, { label: '薯条', score: 70 }] })
    const B = store('B', { tags: [{ label: '炸鸡', score: 100 }, { label: '汉堡', score: 70 }, { label: '薯条', score: 50 }] })
    for (const metric of ['cosine', 'weightedJaccard']) {
      const ra = computeSimilarity(matchOf(u, A.tags, 10, 50).rows, metric).value
      const rb = computeSimilarity(matchOf(u, B.tags, 10, 50).rows, metric).value
      expect(ra).toBeGreaterThan(rb)
    }
    expect(evaluateInterestTrial(u, [B, A], { ...settings, preset: 'matchFirst' }).ranked.map(x => x.m.id)).toEqual(['A', 'B'])
    const dotB = computeSimilarity(matchOf(u, B.tags, 10, 50).rows, 'cosine').dot
    const dotB2 = computeSimilarity(matchOf(u, [...B.tags, { label: '寿司', score: 100 }], 10, 50).rows, 'cosine').dot
    expect(dotB2).toBe(dotB)
  })

  it('普通协同无用户标签时不执行；无邻居、无成交、无坑位或不合格者不伪造结果', () => {
    const ms = [store('A', { tags: [] }), store('B', { tags: [], remaining: 0 }), store('C', { paid: false })]
    expect(ordinary(ms, {}, []).cf).toBeNull()
    expect(ordinary(ms, {}, []).selected.map(x => x.source)).toEqual(['coldStart'])
    expect(ordinary(ms, { availableSlots: 0 }).selected).toEqual([])
    expect(ordinary(ms, { excludedMerchantIds: ['A'] }).selected).toEqual([])
    const noData = { currentUserId: 'self', user, merchants: ms, settings: { ...settings, availableSlots: 3, userSimilarEnabled: true, userSimilarThreshold: 60, mode: 'fill', ratio: 10 } }
    expect(evaluateMatchingTrial({ ...noData, neighbors: [] }).shortfall).toBe(3)
    expect(evaluateMatchingTrial({ ...noData, neighbors: [{ id: 'v1', tags: user, purchased: [] }] }).selected).toEqual([])
  })

  it('邻居上限在排除本人/去重之后计算；门槛、零向量与零分母安全', () => {
    const opts = { currentUserId: 'self', userMinimum: 10, metric: 'cosine', threshold: 100 }
    const ns = [{ id: 'self', tags: user, purchased: ['self-store'] },
      ...Array.from({ length: 25 }, (_, i) => ({ id: `v${i}`, tags: user, purchased: ['A', 'A'] }))]
    const cf = collaborativeScores(user, ns, opts)
    expect(cf.neighbors).toHaveLength(MAX_NEIGHBORS)
    expect(cf.scores[0]).toMatchObject({ store: 'A', support: MAX_NEIGHBORS, cf: 1 })
    expect(collaborativeScores([], ns, opts)).toMatchObject({ neighbors: [], denom: 0, scores: [] })
    expect(collaborativeScores(user, ns, { ...opts, threshold: Number.NaN }).scores).toEqual([])
  })
})
