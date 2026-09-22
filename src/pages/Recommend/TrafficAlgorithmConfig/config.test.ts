import { describe, expect, it } from 'vitest'
import { getTrafficFieldError, getTrafficGroup, isTrafficFieldActive, readTrafficParams, serializeTrafficParams, TRAFFIC_DEFAULTS, TRAFFIC_FIELDS, TRAFFIC_FIELD_NAMES, trafficStrategyLabel } from './config'

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
    expect(serializeTrafficParams(readTrafficParams(input))).toMatchObject(input)
    expect(trafficStrategyLabel('legacy-strategy')).toBe('legacy-strategy')
    expect(trafficStrategyLabel('trafficProportional')).toContain('历史策略')
  })

  it('显式空值仍待配置，不静默恢复为默认数值', () => {
    const values = readTrafficParams({ matchThreshold: null })
    expect(values.matchThreshold).toBeNull()
    expect(getTrafficFieldError('matchThreshold', values.matchThreshold, values)).toContain('请填写')
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
      merchantKeywordStatsMode: 'all', merchantKeywordStatsDays: null,
    })
    for (const name of ['productCheckInterval', 'dwellTimeThreshold', 'generativeDailyLimit', 'popularityMetrics', 'merchantKeywordStatsDays'] as const) {
      expect(isTrafficFieldActive(name, values)).toBe(false)
      expect(getTrafficFieldError(name, values[name], values)).toBeUndefined()
    }
    expect(serializeTrafficParams(values).productCheckInterval).toBeNull()
    expect(getTrafficFieldError('productCheckInterval', null, { ...values, soldOutFilterEnabled: true })).toBeDefined()
  })

  it('校验探索上限、空冷启动维度和空热门指标', () => {
    expect(getTrafficFieldError('explorationSlots', 5, TRAFFIC_DEFAULTS)).toContain('小于')
    expect(getTrafficFieldError('explorationSlots', 0, TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('newUserDimensions', [], TRAFFIC_DEFAULTS)).toContain('至少选择')
    expect(getTrafficFieldError('popularityMetrics', [], TRAFFIC_DEFAULTS)).toContain('至少选择')
  })

  it('数值边界和条件分支均有校验', () => {
    expect(getTrafficFieldError('merchantFreqTimes', 0, TRAFFIC_DEFAULTS)).toContain('之间')
    expect(getTrafficFieldError('merchantFreqTimes', 1.5, TRAFFIC_DEFAULTS)).toContain('整数')
    expect(getTrafficFieldError('matchThreshold', Number.NaN, TRAFFIC_DEFAULTS)).toContain('有效数字')
    expect(getTrafficFieldError('generativePriorityMode2', '', TRAFFIC_DEFAULTS)).toBeUndefined()
    expect(getTrafficFieldError('generativePriorityMode2', '', { ...TRAFFIC_DEFAULTS, generativeMerchantCount: 2 })).toBeDefined()
    expect(getTrafficFieldError('dwellTimeThreshold', null, { ...TRAFFIC_DEFAULTS, generativeTriggerMode: 'instant' })).toBeUndefined()
    expect(getTrafficFieldError('generativeDailyLimit', null, { ...TRAFFIC_DEFAULTS, generativeDailyLimitMode: 'unlimited' })).toBeUndefined()
  })

  it('所有参数均可定位到分组，基础信息交由父表单定位', () => {
    TRAFFIC_FIELD_NAMES.forEach(name => expect(getTrafficGroup(name)).toBeDefined())
    expect(getTrafficGroup('consistencyCheckInterval')).toBe('advanced')
    expect(getTrafficGroup('name')).toBeUndefined()
    expect(getTrafficGroup('toString')).toBeUndefined()
  })
})
