/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it, vi } from 'vitest'
import { PROTOTYPE_DEFAULTS, readSimilarParams, serializeSimilarParams, simulatePreview, validatePrototype, type PreviewBinding, type PrototypeValues } from './prototype'
import { TAG_DECAY_POLICY, getTagDecayPolicy, saveTagDecayPolicy } from '../TagDecaySettings/store'

// store.ts 的校验/报错文案走 i18n 实例，而测试环境默认 lng=en，会把繁中真源翻成英文；
// 这里按「真源=繁中」固定回落 defaultValue，使断言与 zh-TW 静态包一致。
vi.mock('@/i18n', () => ({ default: { t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key } }))

const values: PrototypeValues = { ...PROTOTYPE_DEFAULTS, name: '標籤相似試算', count: 2 }
const natural: PreviewBinding = { enabled: true, trafficOnly: false, trafficSources: [] }
const paid: PreviewBinding = { ...natural, trafficOnly: true, trafficSources: ['sample-traffic-a', 'sample-traffic-b'] }

describe('通用相似推荐 P1 匿名试算', () => {
  it('自然模式选未购商家，已购商家也作为不扣量的自然结果', () => {
    const result = simulatePreview(values, natural)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].id).toBe('sample-store-a')
    expect(result.items.every(item => item.billing === 'natural')).toBe(true)
  })
  it('投流开关只限制候选，允许集合与余量共同生效', () => {
    const result = simulatePreview(values, paid)
    expect(result.items.map(item => item.id).sort()).toEqual(['sample-store-b', 'sample-store-c'])
    expect(result.items.every(item => item.billing === 'paid')).toBe(true)
    expect(simulatePreview(values, { ...paid, trafficSources: ['sample-traffic-a'] }).items.map(item => item.id)).toEqual(['sample-store-b'])
    expect(simulatePreview(values, { ...paid, trafficSources: [] }).items).toEqual([])
  })
  it('仅投流模式不以非投流候选填补，阈值100时可以没有结果', () => {
    expect(simulatePreview({ ...values, threshold: 100 }, paid).items).toEqual([])
    expect(simulatePreview({ ...values, threshold: 100 }, natural).items.map(item => item.id)).toEqual(['sample-store-a'])
  })
  it.each(['empty', 'frequency'] as const)('%s 不强行插入', scenario => {
    expect(simulatePreview(values, natural, scenario).items).toEqual([])
  })
  it('数量一或候选只有一家不补重复商家', () => {
    expect(simulatePreview({ ...values, count: 1 }, natural).items).toHaveLength(1)
    expect(simulatePreview(values, natural, 'one').items).toHaveLength(1)
  })
  it('商家门槛应用于双方，零向量不产出商家相似候选', () => {
    expect(simulatePreview({ ...values, merchantMinimum: 101 }, natural).items).toEqual([])
  })
  it('完整并集模长参与余弦，不能只计算共有标签', () => {
    const result = simulatePreview(values, paid)
    expect(result.items.find(item => item.id === 'sample-store-b')?.similarity).toBeCloseTo(0.74535599)
    expect(simulatePreview({ ...values, metric: 'weightedJaccard' }, paid).items.find(item => item.id === 'sample-store-b')?.similarity).toBeCloseTo(0.6)
  })
  it('协同保留邻居有效成交语义，未成交候选不获得协同分', () => {
    const result = simulatePreview({ ...values, modes: ['userSimilar'], slot1: 'userSimilar', slot2: 'userSimilar' }, natural)
    expect(result.items.map(item => item.id).sort()).toEqual(['sample-store-b', 'sample-store-c'])
    expect(result.items.every(item => item.source === 'userSimilar')).toBe(true)
  })
  it('来源优先分配，跨位去重，不直接混合不同来源分数', () => {
    const result = simulatePreview({ ...values, modes: ['merchantSimilar', 'userSimilar'], slot2: 'userSimilar' }, natural)
    expect(result.items.map(item => item.source)).toEqual(['merchantSimilar', 'userSimilar'])
    expect(new Set(result.items.map(item => item.id)).size).toBe(2)
  })
  it('自然模式拒绝流量因子，投流模式仍可使用', () => {
    expect(simulatePreview({ ...values, rankPreset: 'consumeFirst' }, natural).items).toEqual([])
    expect(simulatePreview({ ...values, rankPreset: 'custom', factors: ['traffic'] }, natural).items).toEqual([])
    expect(simulatePreview({ ...values, rankPreset: 'consumeFirst' }, paid).items[0].id).toBe('sample-store-b')
  })
  it('试算不变更规则、标签或输入对象', () => {
    const before = JSON.stringify([values, natural])
    simulatePreview(values, natural)
    simulatePreview(values, natural)
    expect(JSON.stringify([values, natural])).toBe(before)
  })
  it('停用后不产出，隐藏限额不阻挡可用参数，显式空值按字段校验', () => {
    expect(simulatePreview(values, { ...natural, enabled: false }).items).toEqual([])
    expect(values.tagDecayPolicy).toBe(TAG_DECAY_POLICY)
    expect(values).not.toHaveProperty('merchantDecayDays')
    expect(validatePrototype({ ...values, dailyLimit: NaN })).toEqual([])
    expect(validatePrototype({ ...values, dailyMode: 'limited', dailyLimit: NaN }).map(i => i.name)).toContain('dailyLimit')
    expect(validatePrototype({ ...values, modes: [] }).map(i => i.name)).toContain('modes')
  })
})

describe('服务端参数契约', () => {
  it('序列化只写语义需要的条件字段，业务范围来自 Tab', () => {
    const params = serializeSimilarParams({ ...values, triggerMode: 'dwell', dailyMode: 'limited', rankPreset: 'custom', factors: ['match'] }, 'groupBuy')
    expect(params).toMatchObject({ schemaVersion: 1, targetType: 1, applicableBusinessTypes: [2], supportedScenes: [1] })
    const rules = params.similarRules as Record<string, unknown>
    expect(rules).toMatchObject({ dwellSeconds: 10, dailyLimit: 3, rankFactors: ['match'], resultCount: 2 })
    expect(rules).not.toHaveProperty('userSimilarityThreshold')
    const instant = serializeSimilarParams(values, 'delivery').similarRules as Record<string, unknown>
    expect(instant).not.toHaveProperty('dwellSeconds')
    expect(instant).not.toHaveProperty('dailyLimit')
    expect(instant).not.toHaveProperty('rankFactors')
  })
  it('读取回环保留取值，缺字段回默认且不静默吞掉非法结构', () => {
    const params = serializeSimilarParams({ ...values, modes: ['merchantSimilar', 'userSimilar'], slot2: 'userSimilar' }, 'delivery')
    const back = readSimilarParams(params, 'delivery')
    // 名称不属于参数协议：回环后保留默认名，其余取值不变。
    expect(back).toMatchObject({ ...values, name: PROTOTYPE_DEFAULTS.name, modes: ['merchantSimilar', 'userSimilar'], slot2: 'userSimilar' })
    expect(readSimilarParams({}, 'delivery').merchantMinimum).toBe(PROTOTYPE_DEFAULTS.merchantMinimum)
    expect(() => readSimilarParams('broken', 'delivery')).toThrow()
  })
})

describe('全局衰变单源', () => {
  it('单源修改并拒绝旧版本覆盖，算法参数不携带衰变副本', () => {
    const account = 'global-policy-test'
    const policy = getTagDecayPolicy(account)
    saveTagDecayPolicy(account, { ...policy.values, merchantDecayDays: 12, userTagIdleClearDays: null }, policy.revision)
    expect(getTagDecayPolicy(account).values.merchantDecayDays).toBe(12)
    expect(getTagDecayPolicy(account).values.userTagIdleClearDays).toBeNull()
    expect(serializeSimilarParams(values, 'delivery')).not.toHaveProperty('merchantDecayDays')
    expect(values.tagDecayPolicy).toBe(TAG_DECAY_POLICY)
    expect(() => saveTagDecayPolicy(account, { ...policy.values }, policy.revision)).toThrow('規則已更新')
    expect(() => saveTagDecayPolicy(account, { ...policy.values, userDecayDays: 0 }, policy.revision + 1)).toThrow()
  })
})
