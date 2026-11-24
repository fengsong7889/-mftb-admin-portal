import { describe, expect, it } from 'vitest'
import { getTrafficFieldError, getTrafficGroup, isTrafficFieldActive, readTrafficParams, serializeTrafficParams, TRAFFIC_DEFAULTS, TRAFFIC_FIELDS, TRAFFIC_FIELD_NAMES, trafficStrategyLabel, V1_DIMENSIONS, buildTrafficParams, TRAFFIC_RETIRED_FIELDS, trafficUnitKey } from './config'

describe('投流参数契约', () => {
  it('字段默认值、分组和序列化白名单一致', () => {
    expect(Object.keys(TRAFFIC_FIELDS).sort()).toEqual([...TRAFFIC_FIELD_NAMES].sort())
    expect(readTrafficParams({})).toEqual(TRAFFIC_DEFAULTS)
    expect(serializeTrafficParams({ name: '不属于参数的算法名称' })).not.toHaveProperty('name')
  })

  it('false、0、历史策略和关闭功能的子参数完整往返', () => {
    const input = {
      statusOpen: false, statusRest: true, statusOverwhelmed: false, statusClosed: true,
      consistencyCheckInterval: 17, soldOutFilterEnabled: false, productCheckInterval: 11,
      generativeRecommendEnabled: false, generativePriorityMode: 'hybrid', generativePriorityMode2: 'trafficBalance',
      generativeSkipMerchantCount: 0, explorationSlots: 0, qualityScoreThreshold: 0,
      merchantExposureStrategy: 'legacy-strategy', newUserDimensions: ['distance'],
      popularityMetrics: [],
    }
    const saved = buildTrafficParams(readTrafficParams(input), input)
    expect(saved).toMatchObject({ statusOpen: false, statusRest: true, statusClosed: true,
      consistencyCheckInterval: 17, soldOutFilterEnabled: false, productCheckInterval: 11,
      generativeRecommendEnabled: false, qualityScoreThreshold: 0,
      newUserDimensions: ['distance', 'remainingTraffic'], legacyTrafficParams: { merchantExposureStrategy: 'legacy-strategy', generativePriorityMode: 'hybrid' } })
    TRAFFIC_RETIRED_FIELDS.forEach(key => expect(saved).not.toHaveProperty(key))
    expect(trafficStrategyLabel('legacy-strategy')).toBe('legacy-strategy')
    expect(trafficStrategyLabel('trafficProportional')).toContain('历史策略')
  })

  it('显式空值仍待配置，不静默恢复为默认数值', () => {
    const values = readTrafficParams({ matchThreshold: null })
    expect(values.matchThreshold).toBeNull()
    expect(values.coverageFilterEnabled).toBe(false)
    // 开关关闭时不校验；开启后显式 null 仍报缺填，不静默回 30
    expect(getTrafficFieldError('matchThreshold', values.matchThreshold, values)).toBeUndefined()
    expect(getTrafficFieldError('matchThreshold', null, { ...values, coverageFilterEnabled: true })).toContain('请填写')
  })

  it('商家召回范围只接受已开放的「仅投流商家」，预留档位一律拒绝', () => {
    expect(getTrafficFieldError('recallMerchantScope', 'trafficOnly', TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('recallMerchantScope', 'allMerchants', TRAFFIC_DEFAULTS)).toContain('尚未开放')
    expect(getTrafficGroup('recallMerchantScope')).toBe('recall')
  })

  it('数组独立复制，不污染默认值或接口快照', () => {
    const original = { newUserDimensions: ['distance'] }
    const restored = readTrafficParams(original)
    restored.newUserDimensions.push('qualityScore')
    expect(original.newUserDimensions).toEqual(['distance'])
    const defaults = readTrafficParams({})
    defaults.popularityMetrics.length = 0
    expect(TRAFFIC_DEFAULTS.popularityMetrics).toEqual(['orderCount', 'visitCount'])
  })

  it.each([null, [], 'invalid', { matchThreshold: '30' }, { statusRest: 1 }, { newUserDimensions: [1] }])('错误数据不覆盖成默认配置：%j', raw => {
    expect(() => readTrafficParams(raw)).toThrow('配置')
  })

  it('关闭或不适用的字段不参与校验，但原值保留', () => {
    const values = readTrafficParams({
      soldOutFilterEnabled: false, productCheckInterval: null,
      generativeRecommendEnabled: false, dwellTimeThreshold: null, generativeDailyLimit: null,
      newUserDimensions: ['distance'], popularityMetrics: [],
    })
    for (const name of ['productCheckInterval', 'dwellTimeThreshold', 'generativeDailyLimit', 'popularityMetrics'] as const) {
      expect(isTrafficFieldActive(name, values)).toBe(false)
      expect(getTrafficFieldError(name, values[name], values)).toBeUndefined()
    }
    expect(serializeTrafficParams(values).productCheckInterval).toBeNull()
    expect(getTrafficFieldError('productCheckInterval', null, { ...values, soldOutFilterEnabled: true })).toBeDefined()
  })

  it('标签统计范围固定为全部历史，四个废弃键永不参与校验且保存时归一为固定口径', () => {
    const values = readTrafficParams({ merchantKeywordStatsMode: 'custom', merchantKeywordStatsDays: null })
    for (const name of ['merchantKeywordStatsMode', 'merchantKeywordStatsDays', 'userKeywordStatsMode', 'userKeywordStatsDays'] as const) {
      expect(isTrafficFieldActive(name, values)).toBe(false)
      expect(getTrafficFieldError(name, undefined, values)).toBeUndefined()
    }
    // 加载保留存量原值，保存时统一归一，不把已废弃的自定义周期写回参数。
    expect(values.merchantKeywordStatsMode).toBe('custom')
    const roundTrip = serializeTrafficParams(values)
    expect(roundTrip.merchantKeywordStatsMode).toBe('all')
    expect(roundTrip.merchantKeywordStatsDays).toBe(30)
    expect(roundTrip.userKeywordStatsMode).toBe('all')
  })

  it('停用探索和旧指标不再校验；现行维度仍保留空值校验', () => {
    // 上限退役：永不激活、留空不报缺填；探索位不再与上限交叉校验，仅自身 0~10 范围。
    expect(isTrafficFieldActive('maxUserTags', TRAFFIC_DEFAULTS)).toBe(false)
    expect(getTrafficFieldError('maxUserTags', null, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('explorationSlots', 5, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('explorationSlots', 11, TRAFFIC_DEFAULTS)).toBeUndefined()
    TRAFFIC_RETIRED_FIELDS.forEach(key => expect(isTrafficFieldActive(key, TRAFFIC_DEFAULTS)).toBe(false))
    expect(getTrafficFieldError('explorationSlots', 0, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('newUserDimensions', [], TRAFFIC_DEFAULTS)).toContain('至少选择')
    // 热门度指标仅在勾选区域热门度（存量/legacy）时激活；默认一期维度不含它，故显式传入。
    expect(getTrafficFieldError('popularityMetrics', [], { ...TRAFFIC_DEFAULTS, newUserDimensions: ['regionPopular'] })).toBeUndefined()
    expect(getTrafficFieldError('popularityMetrics', [], TRAFFIC_DEFAULTS)).toBeUndefined()
  })

  it('数值边界和条件分支均有校验', () => {
    expect(getTrafficFieldError('merchantFreqTimes', 0, TRAFFIC_DEFAULTS)).toContain('之间')
    expect(getTrafficFieldError('merchantFreqTimes', 1.5, TRAFFIC_DEFAULTS)).toContain('整数')
    expect(getTrafficFieldError('matchThreshold', Number.NaN, { ...TRAFFIC_DEFAULTS, coverageFilterEnabled: true })).toContain('有效数字')
    expect(getTrafficFieldError('generativePriorityMode2', '', TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('generativePriorityMode2', '', { ...TRAFFIC_DEFAULTS, generativeMerchantCount: 2 })).toBeUndefined()
    expect(getTrafficFieldError('dwellTimeThreshold', null, { ...TRAFFIC_DEFAULTS, generativeTriggerMode: 'instant' })).toBeUndefined()
    expect(getTrafficFieldError('generativeDailyLimit', null, { ...TRAFFIC_DEFAULTS, generativeDailyLimitMode: 'unlimited' })).toBeUndefined()
  })

  it('所有参数均可定位到分组，基础信息交由父表单定位', () => {
    TRAFFIC_FIELD_NAMES.forEach(name => expect(getTrafficGroup(name)).toBeDefined())
    expect(getTrafficGroup('consistencyCheckInterval')).toBe('availability')
    expect(getTrafficGroup('name')).toBeUndefined()
    expect(getTrafficGroup('toString')).toBeUndefined()
  })

  it('总排序/冷启动/相似推荐各自独立成组，触发频次归频控', () => {
    // 第四轮分组归位：冷启动维度/优选线入「排序规则」组，区域召回范围入「召回」组；旧 coldStart 分组已退役
    expect(getTrafficGroup('newUserDimensions')).toBe('ranking')
    expect(getTrafficGroup('coldStartRegionScope')).toBe('recall')
    expect(getTrafficGroup('rankPreset')).toBe('ranking')
    expect(getTrafficGroup('rankPoolSize')).toBe('ranking')
    expect(getTrafficGroup('similarRecModes')).toBe('similarRec')
    expect(getTrafficGroup('similarRankMode')).toBe('similarRec')
    expect(getTrafficGroup('similarAnchor')).toBe('similarRec')
    expect(getTrafficGroup('generativePriorityMode')).toBe('similarRec')
    expect(getTrafficGroup('generativeDailyLimit')).toBe('frequency')
  })

  it('预设＝单轴不保留因子，自定义勾选子集至少一项，纯余量排序修正决胜', () => {
    expect(TRAFFIC_FIELDS.rankPreset.options?.map(o => o.value)).toEqual(['matchFirst', 'consumeFirst', 'custom'])
    // 预设不保留因子勾选；存量 balanced 转自定义并回退默认子集
    const legacy = readTrafficParams({ rankPreset: 'consumeFirst', similarRankPreset: 'balanced' })
    expect(legacy.rankFactors).toEqual([])
    expect(legacy.similarRankPreset).toBe('custom')
    expect(legacy.similarRankFactors).toEqual(['match', 'quality', 'distance'])
    expect(serializeTrafficParams(readTrafficParams({ rankPreset: 'matchFirst' })).rankFactors).toEqual([])
    // 消耗优先（纯余量）时「按流量包方向」决胜无意义→归一为质量分
    expect(readTrafficParams({ rankPreset: 'consumeFirst', rankTieBreak: 'trafficDirection' }).rankTieBreak).toBe('quality')
    expect(readTrafficParams({ rankPreset: 'custom', rankFactors: ['traffic'], rankTieBreak: 'trafficDirection' }).rankTieBreak).toBe('quality')
    expect(readTrafficParams({ rankPreset: 'matchFirst', rankTieBreak: 'trafficDirection' }).rankTieBreak).toBe('trafficDirection')
    // 自定义勾选子集保留；空子集报错；预设时因子不激活
    const custom = readTrafficParams({ rankPreset: 'custom', rankFactors: ['match', 'quality'] })
    expect(serializeTrafficParams(custom).rankFactors).toEqual(['match', 'quality'])
    expect(getTrafficFieldError('rankFactors', [], { ...custom, rankFactors: [] })).toContain('至少选择')
    expect(isTrafficFieldActive('rankFactors', TRAFFIC_DEFAULTS)).toBe(false)
    expect(isTrafficFieldActive('rankFactors', custom)).toBe(true)
    // 权重数值已退役（改勾选因子），永不激活
    expect(isTrafficFieldActive('rankWeightMatch', TRAFFIC_DEFAULTS)).toBe(false)
    expect(isTrafficFieldActive('similarRankWeightMatch', TRAFFIC_DEFAULTS)).toBe(false)
    // 沿用总排序时独立子项不激活；独立配置时激活。
    expect(isTrafficFieldActive('similarRankPreset', { ...TRAFFIC_DEFAULTS, similarRankMode: 'inherit' })).toBe(false)
    expect(isTrafficFieldActive('similarRankPreset', { ...TRAFFIC_DEFAULTS, similarRankMode: 'independent' })).toBe(true)
    expect(isTrafficFieldActive('similarBlendRatio', { ...TRAFFIC_DEFAULTS, similarAnchor: 'user' })).toBe(false)
    expect(isTrafficFieldActive('similarBlendRatio', { ...TRAFFIC_DEFAULTS, similarAnchor: 'blend' })).toBe(false)
    expect(getTrafficFieldError('similarBlendRatio', null, { ...TRAFFIC_DEFAULTS, similarAnchor: 'blend', similarRecModes: ['sameCategory'] })).toBeUndefined()
    // 链式触发/排序范围已退役，永不激活。
    expect(isTrafficFieldActive('similarChainEnabled', TRAFFIC_DEFAULTS)).toBe(false)
    expect(isTrafficFieldActive('similarRankScope', TRAFFIC_DEFAULTS)).toBe(false)
  })

  it('时段优先默认开启，补齐仅两档投流商家且随开关联动，存量 none 归一', () => {
    expect(TRAFFIC_DEFAULTS.mealPeriodPriorityEnabled).toBe(true)
    expect(TRAFFIC_DEFAULTS.mealPeriodFallback).toBe('adjacent')
    expect(TRAFFIC_FIELDS.mealPeriodFallback.options?.map(o => o.value)).toEqual(['adjacent', 'any'])
    expect(isTrafficFieldActive('mealPeriodFallback', TRAFFIC_DEFAULTS)).toBe(true)
    expect(isTrafficFieldActive('mealPeriodFallback', { ...TRAFFIC_DEFAULTS, mealPeriodPriorityEnabled: false })).toBe(false)
    expect(getTrafficFieldError('mealPeriodFallback', 'any', TRAFFIC_DEFAULTS)).toBeUndefined()
    // 「不补齐」已下线：存量 none 读/写归一为相邻时段，且不再合法
    expect(readTrafficParams({ mealPeriodFallback: 'none' }).mealPeriodFallback).toBe('adjacent')
    expect(getTrafficFieldError('mealPeriodFallback', 'none', TRAFFIC_DEFAULTS)).toContain('请选择有效')
  })

  it('区域召回仅两档，存量同行政区/同城保存归一为配送范围内', () => {
    expect(TRAFFIC_FIELDS.coldStartRegionScope.options?.map(o => o.value)).toEqual(['delivery', 'tradeArea'])
    expect(serializeTrafficParams(readTrafficParams({ coldStartRegionScope: 'city' })).coldStartRegionScope).toBe('delivery')
    expect(serializeTrafficParams(readTrafficParams({ coldStartRegionScope: 'district' })).coldStartRegionScope).toBe('delivery')
    expect(serializeTrafficParams(readTrafficParams({ coldStartRegionScope: 'tradeArea' })).coldStartRegionScope).toBe('tradeArea')
    expect(getTrafficFieldError('coldStartRegionScope', 'city', TRAFFIC_DEFAULTS)).toContain('请选择有效')
  })

  it('相似度算法升为算法级：不随相似推荐开关门控，相似度门槛仍门控', () => {
    expect(getTrafficGroup('similarityMetric')).toBe('matching')
    const off = { ...TRAFFIC_DEFAULTS, generativeRecommendEnabled: false, similarRecModes: [] }
    expect(isTrafficFieldActive('similarityMetric', off)).toBe(true)
    expect(isTrafficFieldActive('similarityThreshold', off)).toBe(false)
  })

  it('冷启动默认维度在一期可选范围内，保存剔除退役维度且排序范围由优先级来源派生', () => {
    // 默认值不得包含退役维度，且落在 V1_DIMENSIONS 内
    expect(TRAFFIC_DEFAULTS.newUserDimensions.every(d => (V1_DIMENSIONS as readonly string[]).includes(d))).toBe(true)
    expect(TRAFFIC_DEFAULTS.newUserDimensions).not.toContain('regionPopular')
    // 存量含退役维度：保存剔除；旧版本顺序无优先级语义，收敛为默认优先级保证至少一项
    expect(serializeTrafficParams(readTrafficParams({ newUserDimensions: ['remainingTraffic', 'regionPopular'] })).newUserDimensions).toEqual(['distance', 'remainingTraffic'])
    expect(serializeTrafficParams(readTrafficParams({ newUserDimensions: ['regionPopular'] })).newUserDimensions).toEqual(['distance', 'remainingTraffic'])
    expect(serializeTrafficParams(readTrafficParams({ newUserDimensions: ['distance'] })).newUserDimensions).toEqual(['distance', 'remainingTraffic'])
    // 排序范围由优先级来源派生，消除与 similarRankMode 的语义重叠
    expect(serializeTrafficParams(readTrafficParams({ similarRankMode: 'inherit', similarRankScope: 'similarityOnly' }))).not.toHaveProperty('similarRankScope')
    expect(serializeTrafficParams(readTrafficParams({ similarRankMode: 'independent', similarRankScope: 'shared' }))).not.toHaveProperty('similarRankScope')
  })

  it('保留标签数/清零天数可留空，均衡加权下线转自定义，新商家扶持已退役永不激活', () => {
    expect(getTrafficFieldError('merchantRetainedTagCount', null, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('userRetainedTagCount', null, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('merchantTagIdleClearDays', null, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('merchantRetainedTagCount', 0, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('merchantRetainedTagCount', undefined, TRAFFIC_DEFAULTS)).toBeUndefined()
    // 均衡加权选项下线：存量 balanced 转自定义因子（权重数值已退役不再归一）
    expect(TRAFFIC_FIELDS.rankPreset.options?.map(o => o.value)).toEqual(['matchFirst', 'consumeFirst', 'custom'])
    const legacy = readTrafficParams({ rankPreset: 'balanced' })
    expect(legacy.rankPreset).toBe('custom')
    expect(legacy.rankFactors).toEqual(['match', 'quality', 'distance'])
    // 新商家扶持已退役（新店曝光由瀑布流新店广告坑位承担）：永不参与展示与校验
    expect(isTrafficFieldActive('newMerchantBoostEnabled', TRAFFIC_DEFAULTS)).toBe(false)
    expect(isTrafficFieldActive('newMerchantDays', { ...TRAFFIC_DEFAULTS, newMerchantBoostEnabled: true })).toBe(false)
    expect(isTrafficFieldActive('newMerchantExplorationSlots', { ...TRAFFIC_DEFAULTS, newMerchantBoostEnabled: true })).toBe(false)
    // 推荐模式标签不带括号后缀；用户协同为一期正式模式
    expect(TRAFFIC_FIELDS.similarRecModes.options?.map(o => o.label)).toEqual(['商家相似推荐', '用户协同推荐', '同类目商家推荐'])
    // 新标签加速一期退役：永不参与展示与校验
    expect(isTrafficFieldActive('newTagBoostMultiplier', TRAFFIC_DEFAULTS)).toBe(false)
    expect(isTrafficFieldActive('maxBoostTagCount', TRAFFIC_DEFAULTS)).toBe(false)
    // 候选池上限退役：坑位数由瀑布流决定，全量已购商家参与排序
    expect(isTrafficFieldActive('rankPoolSize', TRAFFIC_DEFAULTS)).toBe(false)
  })

  it('两种相似度可独立保存；覆盖率默认关闭，旧 0 关闭、旧正数开启、显式开关优先', () => {
    const cosine = readTrafficParams({ similarityMetric: 'cosine' })
    const jaccard = readTrafficParams({ similarityMetric: 'weightedJaccard', matchThreshold: 30 })
    expect(TRAFFIC_FIELDS.similarityMetric.options?.map(o => o.value)).toEqual(['cosine', 'weightedJaccard'])
    expect(buildTrafficParams(cosine).similarityMetric).toBe('cosine')
    expect(buildTrafficParams(jaccard).similarityMetric).toBe('weightedJaccard')
    // 默认关闭：隐藏值回 30 不参与校验；开启后 1～100 边界生效
    expect(cosine.coverageFilterEnabled).toBe(false)
    expect(cosine.matchThreshold).toBe(30)
    expect(getTrafficFieldError('matchThreshold', 0, cosine)).toBeUndefined()
    expect(getTrafficFieldError('matchThreshold', -1, cosine)).toBeUndefined()
    const on = { ...cosine, coverageFilterEnabled: true }
    expect(getTrafficFieldError('matchThreshold', 0, on)).toBeDefined()
    expect(getTrafficFieldError('matchThreshold', 101, on)).toBeDefined()
    expect(getTrafficFieldError('matchThreshold', 30, on)).toBeUndefined()
    // 旧参数迁移：0 → 关闭；正数 → 开启并保留；显式开关优先于旧值推导
    expect(readTrafficParams({ matchThreshold: 0 })).toMatchObject({ coverageFilterEnabled: false, matchThreshold: 30 })
    expect(readTrafficParams({ matchThreshold: 45 })).toMatchObject({ coverageFilterEnabled: true, matchThreshold: 45 })
    expect(readTrafficParams({ matchThreshold: 45, coverageFilterEnabled: false })).toMatchObject({ coverageFilterEnabled: false, matchThreshold: 45 })
    expect(jaccard.coverageFilterEnabled).toBe(true)
    expect(jaccard.matchThreshold).toBe(30)
  })

  it('质量改冷启动软优选：硬开关退役归档，优选线随维度激活，不会重新出现在顶层', () => {
    const original = { qualityFilterEnabled: true, newUserDimensions: ['qualityScore'], generativeTriggerScope: 'all',
      similarBlendRatio: 70, extraBusinessSetting: 'keep' }
    const read = readTrafficParams(original)
    expect(read.newUserDimensions).toEqual(['distance', 'remainingTraffic', 'qualityScore'])
    expect(getTrafficGroup('qualityScoreThreshold')).toBe('ranking')
    expect(isTrafficFieldActive('qualityFilterEnabled', read)).toBe(false)
    expect(getTrafficFieldError('qualityScoreThreshold', null, read)).toBeDefined()
    expect(getTrafficFieldError('qualityScoreThreshold', null, { ...read, newUserDimensions: ['distance'] })).toBeUndefined()
    const saved = buildTrafficParams(read, original)
    expect(saved).toMatchObject({ extraBusinessSetting: 'keep', trafficConfigVersion: 4,
      newUserDimensions: ['distance', 'remainingTraffic', 'qualityScore'], legacyTrafficParams: {
        qualityFilterEnabled: true, newUserDimensions: ['qualityScore'], generativeTriggerScope: 'all', similarBlendRatio: 70,
      } })
    expect(saved).not.toHaveProperty('qualityFilterEnabled')
    expect(saved).not.toHaveProperty('generativeTriggerScope')
    expect(saved).not.toHaveProperty('similarBlendRatio')
    expect(buildTrafficParams(readTrafficParams(saved), saved)).toEqual(saved)
    expect(original.newUserDimensions).toEqual(['qualityScore'])
    // 旧维度含 qualityScore 但无硬开关：同样迁移为软优选；两者均无则默认不启用
    expect(readTrafficParams({ newUserDimensions: ['qualityScore'] }).newUserDimensions).toContain('qualityScore')
    expect(readTrafficParams({}).newUserDimensions).not.toContain('qualityScore')
  })

  it('冷启动维度集合语义：v4 信任勾选，旧版本收敛默认勾选，方向随流量勾选激活', () => {
    const v4 = { trafficConfigVersion: 4, newUserDimensions: ['remainingTraffic', 'qualityScore'] }
    expect(readTrafficParams(v4).newUserDimensions).toEqual(['remainingTraffic', 'qualityScore'])
    expect(serializeTrafficParams(v4, 4).newUserDimensions).toEqual(['remainingTraffic', 'qualityScore'])
    // v3 及更早固定生效语义：收敛为默认勾选，质量软优选沿用勾选
    expect(readTrafficParams({ trafficConfigVersion: 3, newUserDimensions: ['remainingTraffic', 'distance', 'qualityScore'] }).newUserDimensions)
      .toEqual(['distance', 'remainingTraffic', 'qualityScore'])
    // v4 空选兜底默认勾选，不写空数组
    expect(serializeTrafficParams({ trafficConfigVersion: 4, newUserDimensions: [] }, 4).newUserDimensions).toEqual(['distance', 'remainingTraffic'])
    // 流量方向仅在勾选剩余流量包时激活；取消后不校验但原值保留
    expect(isTrafficFieldActive('remainingTrafficDirection', TRAFFIC_DEFAULTS)).toBe(true)
    expect(isTrafficFieldActive('remainingTrafficDirection', { ...TRAFFIC_DEFAULTS, newUserDimensions: ['distance'] })).toBe(false)
    expect(getTrafficFieldError('remainingTrafficDirection', 'moreFirst', { ...TRAFFIC_DEFAULTS, newUserDimensions: ['distance'] })).toBeUndefined()
  })

  it('用户协同为一期正式模式：保留勾选、门槛随模式激活；仅未知模式才关闭推荐', () => {
    const kept = readTrafficParams({ similarRecModes: ['userSimilar'], generativeRecommendEnabled: true })
    expect(kept.similarRecModes).toEqual(['userSimilar'])
    expect(kept.generativeRecommendEnabled).toBe(true)
    expect(isTrafficFieldActive('userSimilarThreshold', kept)).toBe(true)
    expect(getTrafficFieldError('userSimilarThreshold', null, kept)).toContain('请填写')
    expect(isTrafficFieldActive('userSimilarThreshold', { ...kept, similarRecModes: ['merchantSimilar'] })).toBe(false)
    expect(isTrafficFieldActive('userSimilarThreshold', { ...kept, generativeRecommendEnabled: false })).toBe(false)
    const unknown = readTrafficParams({ similarRecModes: ['legacyMode'], generativeRecommendEnabled: true })
    expect(unknown.similarRecModes).toEqual([])
    expect(unknown.generativeRecommendEnabled).toBe(false)
    expect(trafficUnitKey('分')).toBe('recommend.scoreUnit')
    expect(trafficUnitKey('分钟')).not.toBe(trafficUnitKey('分'))
  })

  it('点击后按坑位选优先来源：只列已勾选模式、第 2 位仅 2 家激活；全局填充顺序已退役归档', () => {
    const base = readTrafficParams({})
    expect(base.similarRecSlot1Source).toBe('merchantSimilar')
    expect(base.similarRecSlot2Source).toBe('userSimilar')
    expect(isTrafficFieldActive('similarRecSlot1Source', base)).toBe(true)
    expect(isTrafficFieldActive('similarRecSlot2Source', base)).toBe(false) // 默认 1 家
    const two = { ...base, generativeMerchantCount: 2 }
    expect(isTrafficFieldActive('similarRecSlot2Source', two)).toBe(true)
    // 取消勾选某模式后，指向它的坑位来源回退到首个已勾选模式
    const onlyCategory = readTrafficParams({ similarRecModes: ['sameCategory'], similarRecSlot1Source: 'userSimilar', similarRecSlot2Source: 'merchantSimilar', generativeMerchantCount: 2 })
    expect(onlyCategory.similarRecSlot1Source).toBe('userSimilar') // read 保留原值，维持 defaults 不变量
    const savedCat = buildTrafficParams(onlyCategory)
    expect(savedCat.similarRecSlot1Source).toBe('sameCategory') // 写入归一到已勾选模式
    expect(savedCat.similarRecSlot2Source).toBe('sameCategory')
    // 全局填充顺序退役：不激活、保存归档、不回顶层
    const legacy = readTrafficParams({ similarRecPriority: 'userFirst' })
    expect(isTrafficFieldActive('similarRecPriority', legacy)).toBe(false)
    const saved = buildTrafficParams(legacy, { similarRecPriority: 'userFirst' })
    expect(saved).not.toHaveProperty('similarRecPriority')
    expect(saved.legacyTrafficParams).toMatchObject({ similarRecPriority: 'userFirst' })
    expect(getTrafficGroup('similarRecSlot1Source')).toBe('similarRec')
  })

  it('协同补充方式与比例：默认 fill/10，比例仅 ratio 模式激活且校验 1～100', () => {
    const base = readTrafficParams({})
    expect(base.matchingUserSimilarMode).toBe('fill')
    expect(base.matchingUserSimilarRatio).toBe(10)
    const on = { ...base, matchingUserSimilarEnabled: true }
    expect(isTrafficFieldActive('matchingUserSimilarMode', on)).toBe(true)
    expect(isTrafficFieldActive('matchingUserSimilarRatio', on)).toBe(false)
    const ratio = { ...on, matchingUserSimilarMode: 'ratio' }
    expect(isTrafficFieldActive('matchingUserSimilarRatio', ratio)).toBe(true)
    for (const v of [null, 0, 101, 10.5]) expect(getTrafficFieldError('matchingUserSimilarRatio', v, ratio)).toBeDefined()
    for (const v of [1, 10, 100]) expect(getTrafficFieldError('matchingUserSimilarRatio', v, ratio)).toBeUndefined()
    expect(getTrafficFieldError('matchingUserSimilarRatio', null, on)).toBeUndefined()
    const saved = buildTrafficParams({ ...ratio, matchingUserSimilarRatio: 25 })
    expect(saved).toMatchObject({ matchingUserSimilarMode: 'ratio', matchingUserSimilarRatio: 25 })
    expect(buildTrafficParams(readTrafficParams(saved), saved)).toEqual(saved)
  })

  it('普通协同默认关闭；与点击后开关、门槛独立且新旧保存不丢值', () => {
    const old = readTrafficParams({ trafficConfigVersion: 3, similarRecModes: ['userSimilar'], userSimilarThreshold: 72 })
    expect(old.matchingUserSimilarEnabled).toBe(false)
    expect(old.matchingUserSimilarThreshold).toBe(60)
    expect(getTrafficGroup('matchingUserSimilarEnabled')).toBe('matching')
    expect(getTrafficGroup('matchingUserSimilarThreshold')).toBe('matching')
    const enabled = { ...old, matchingUserSimilarEnabled: true, matchingUserSimilarThreshold: 85, generativeRecommendEnabled: false }
    expect(isTrafficFieldActive('matchingUserSimilarThreshold', enabled)).toBe(true)
    expect(isTrafficFieldActive('userSimilarThreshold', enabled)).toBe(false)
    const saved = buildTrafficParams(enabled)
    expect(saved).toMatchObject({ matchingUserSimilarEnabled: true, matchingUserSimilarThreshold: 85, userSimilarThreshold: 72, generativeRecommendEnabled: false })
    expect(buildTrafficParams(readTrafficParams(saved), saved)).toEqual(saved)
    const off = readTrafficParams({ ...saved, matchingUserSimilarEnabled: false })
    expect(buildTrafficParams(off).matchingUserSimilarThreshold).toBe(85)
    expect(off.similarRecModes).toEqual(['userSimilar'])
  })

  it('普通协同门槛只在开启时必填并校验 1～100，不受覆盖开关控制', () => {
    const on = { ...TRAFFIC_DEFAULTS, matchingUserSimilarEnabled: true, coverageFilterEnabled: false }
    for (const value of [null, 0, 101, 60.5, Number.NaN]) {
      expect(getTrafficFieldError('matchingUserSimilarThreshold', value, on)).toBeDefined()
    }
    for (const value of [1, 60, 100]) expect(getTrafficFieldError('matchingUserSimilarThreshold', value, on)).toBeUndefined()
    expect(getTrafficFieldError('matchingUserSimilarThreshold', null, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(readTrafficParams({ matchingUserSimilarThreshold: null }).matchingUserSimilarThreshold).toBeNull()
    expect(() => readTrafficParams({ matchingUserSimilarEnabled: 'true' })).toThrow('配置')
  })
})
