// 待界面确认后统一补充 i18n；参数键与现有接口保持兼容。
export type TrafficGroup = 'availability' | 'matching' | 'frequency' | 'recommendations' | 'advanced'

export const TRAFFIC_GROUPS: { key: TrafficGroup; title: string }[] = [
  { key: 'availability', title: '基础与可用性' },
  { key: 'matching', title: '兴趣匹配' },
  { key: 'frequency', title: '展示频控' },
  { key: 'recommendations', title: '冷启动与相似推荐' },
  { key: 'advanced', title: '高级策略' },
]

export interface TrafficAlgorithmValues {
  statusOpen: boolean
  statusRest: boolean
  statusOverwhelmed: boolean
  statusClosed: boolean
  consistencyCheckInterval: number | null
  merchantExposureStrategy: string
  merchantKeywordStatsMode: string
  merchantKeywordStatsDays: number | null
  userKeywordStatsMode: string
  userKeywordStatsDays: number | null
  userPreferenceMinScore: number | null
  matchThreshold: number | null
  soldOutFilterEnabled: boolean
  productCheckInterval: number | null
  merchantFreqHours: number | null
  merchantFreqTimes: number | null
  keywordFreqHours: number | null
  keywordFreqTimes: number | null
  maxUserTags: number | null
  explorationSlots: number | null
  maxMerchantsPerKeyword: number | null
  merchantDecayDays: number | null
  merchantDecayPoints: number | null
  merchantRetainedTagCount: number | null
  userDecayDays: number | null
  userDecayPoints: number | null
  userRetainedTagCount: number | null
  newTagBoostMultiplier: number | null
  maxBoostTagCount: number | null
  generativeRecommendEnabled: boolean
  generativeTriggerMode: string
  dwellTimeThreshold: number | null
  generativeTriggerScope: string
  generativeMerchantCount: number | null
  generativePriorityMode: string
  generativePriorityMode2: string
  generativeDailyLimitMode: string
  generativeDailyLimit: number | null
  generativeSkipMerchantCount: number | null
  newUserDimensions: string[]
  qualityScoreThreshold: number | null
  regionPopularStatsDays: number | null
  popularityMetrics: string[]
  regionPopularTopPercent: number | null
  completionRateThreshold: number | null
  completionMinOrderCount: number | null
}

export type TrafficFieldName = keyof TrafficAlgorithmValues
export interface TrafficFormIssue { name: string; message: string }

/** 集中维护默认值，缺失字段才补默认；false、0 和显式空值不被覆盖。 */
export const TRAFFIC_DEFAULTS: TrafficAlgorithmValues = {
  statusOpen: true, statusRest: false, statusOverwhelmed: false, statusClosed: false,
  consistencyCheckInterval: null, merchantExposureStrategy: 'trafficProportional',
  merchantKeywordStatsMode: 'all', merchantKeywordStatsDays: 30,
  userKeywordStatsMode: 'all', userKeywordStatsDays: 30,
  userPreferenceMinScore: 3, matchThreshold: 30,
  soldOutFilterEnabled: true, productCheckInterval: 5,
  merchantFreqHours: 2, merchantFreqTimes: 3, keywordFreqHours: 1, keywordFreqTimes: 5,
  maxUserTags: 5, explorationSlots: 1, maxMerchantsPerKeyword: 3,
  merchantDecayDays: 7, merchantDecayPoints: 1, merchantRetainedTagCount: 5,
  userDecayDays: 14, userDecayPoints: 1, userRetainedTagCount: 5,
  newTagBoostMultiplier: 3, maxBoostTagCount: 10,
  generativeRecommendEnabled: true, generativeTriggerMode: 'dwell', dwellTimeThreshold: 10,
  generativeTriggerScope: 'all', generativeMerchantCount: 1,
  generativePriorityMode: 'matchFirst', generativePriorityMode2: 'trafficBalance',
  generativeDailyLimitMode: 'limited', generativeDailyLimit: 3, generativeSkipMerchantCount: 2,
  newUserDimensions: ['remainingTraffic', 'regionPopular'], qualityScoreThreshold: 3.5,
  regionPopularStatsDays: 30, popularityMetrics: ['orderCount', 'visitCount'],
  regionPopularTopPercent: 20, completionRateThreshold: 80, completionMinOrderCount: 20,
}

interface FieldDefinition {
  label: string
  group: TrafficGroup
  kind: 'number' | 'boolean' | 'select' | 'multiple' | 'hidden'
  min?: number
  max?: number
  unit?: string
  precision?: number
  options?: { label: string; value: string }[]
  dependencies?: TrafficFieldName[]
  disabled?: boolean
}
const statsOptions = [{ label: '全部历史', value: 'all' }, { label: '自定义周期', value: 'custom' }]
const priorityOptions = [
  { label: '匹配度优先', value: 'matchFirst' },
  { label: '剩余流量包优先（历史策略）', value: 'trafficBalance' },
  { label: '混合评分（历史策略）', value: 'hybrid' },
]
const numberField = (label: string, group: TrafficGroup, min: number, max: number, unit: string, dependencies?: TrafficFieldName[]): FieldDefinition =>
  ({ label, group, kind: 'number', min, max, unit, precision: 0, dependencies })

export const TRAFFIC_FIELDS: Record<TrafficFieldName, FieldDefinition> = {
  statusOpen: { label: '纳入营业中商家', group: 'availability', kind: 'boolean', disabled: true },
  statusRest: { label: '纳入暂时休息商家', group: 'availability', kind: 'boolean' },
  statusOverwhelmed: { label: '纳入爆单暂停接单商家', group: 'availability', kind: 'boolean' },
  statusClosed: { label: '纳入已打烊商家', group: 'availability', kind: 'boolean' },
  soldOutFilterEnabled: { label: '售罄与下架过滤', group: 'availability', kind: 'boolean' },
  consistencyCheckInterval: numberField('数据一致性检查周期', 'advanced', 1, 1440, '分钟'),
  productCheckInterval: numberField('商品可用性检查周期', 'advanced', 1, 60, '分钟', ['soldOutFilterEnabled']),
  merchantExposureStrategy: { label: '当前保存的曝光策略', group: 'matching', kind: 'hidden' },
  merchantKeywordStatsMode: { label: '商家标签统计范围', group: 'matching', kind: 'select', options: statsOptions },
  merchantKeywordStatsDays: numberField('商家统计周期', 'matching', 1, 365, '天', ['merchantKeywordStatsMode']),
  userKeywordStatsMode: { label: '用户标签统计范围', group: 'matching', kind: 'select', options: statsOptions },
  userKeywordStatsDays: numberField('用户统计周期', 'matching', 1, 365, '天', ['userKeywordStatsMode']),
  userPreferenceMinScore: numberField('偏好识别最低分', 'matching', 1, 100, '分'),
  matchThreshold: numberField('偏好标签覆盖率门槛', 'matching', 1, 100, '%'),
  maxUserTags: numberField('参与匹配的标签上限', 'matching', 1, 20, '个'),
  explorationSlots: numberField('新偏好探索标签数', 'matching', 0, 10, '个', ['maxUserTags']),
  maxMerchantsPerKeyword: numberField('同标签商家展示上限', 'frequency', 1, 10, '家'),
  merchantFreqHours: numberField('同商家统计窗口', 'frequency', 1, 24, '小时'),
  merchantFreqTimes: numberField('同商家最多展示', 'frequency', 1, 20, '次'),
  keywordFreqHours: numberField('同标签统计窗口', 'frequency', 1, 24, '小时'),
  keywordFreqTimes: numberField('同标签最多展示', 'frequency', 1, 20, '次'),
  merchantDecayDays: numberField('商家标签衰减周期', 'advanced', 1, 365, '天'),
  merchantDecayPoints: numberField('商家标签每次减分', 'advanced', 1, 100, '分'),
  merchantRetainedTagCount: numberField('商家保留标签数', 'advanced', 1, 50, '个'),
  userDecayDays: numberField('用户标签衰减周期', 'advanced', 1, 365, '天'),
  userDecayPoints: numberField('用户标签每次减分', 'advanced', 1, 100, '分'),
  userRetainedTagCount: numberField('用户保留标签数', 'advanced', 1, 50, '个'),
  newTagBoostMultiplier: numberField('新标签有效分加速倍数', 'advanced', 1, 10, '倍'),
  maxBoostTagCount: numberField('同时加速标签上限', 'advanced', 1, 50, '个'),
  generativeRecommendEnabled: { label: '浏览后相似推荐', group: 'recommendations', kind: 'boolean' },
  generativeTriggerMode: { label: '触发条件', group: 'recommendations', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '点击即触发', value: 'instant' }, { label: '停留达到时长后触发', value: 'dwell' },
  ] },
  dwellTimeThreshold: numberField('停留时长门槛', 'recommendations', 3, 120, '秒', ['generativeRecommendEnabled', 'generativeTriggerMode']),
  generativeTriggerScope: { label: '触发范围', group: 'recommendations', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '全部坑位（含非投流）', value: 'all' }, { label: '仅投流坑位', value: 'trafficOnly' },
  ] },
  generativeMerchantCount: numberField('每次推荐商家数量', 'recommendations', 1, 2, '家', ['generativeRecommendEnabled']),
  generativePriorityMode: { label: '第 1 家优先级', group: 'recommendations', kind: 'select', options: priorityOptions, dependencies: ['generativeRecommendEnabled'] },
  generativePriorityMode2: { label: '第 2 家优先级', group: 'recommendations', kind: 'select', options: priorityOptions, dependencies: ['generativeRecommendEnabled', 'generativeMerchantCount'] },
  generativeDailyLimitMode: { label: '单用户每日触发限制', group: 'recommendations', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '限制次数', value: 'limited' }, { label: '不限制', value: 'unlimited' },
  ] },
  generativeDailyLimit: numberField('单用户每日触发上限', 'recommendations', 1, 50, '次', ['generativeRecommendEnabled', 'generativeDailyLimitMode']),
  generativeSkipMerchantCount: numberField('再次触发前跳过商家点击', 'recommendations', 0, 50, '家', ['generativeRecommendEnabled']),
  newUserDimensions: { label: '冷启动排序维度', group: 'recommendations', kind: 'multiple', options: [
    { label: '剩余流量包', value: 'remainingTraffic' }, { label: '商家质量分', value: 'qualityScore' },
    { label: '区域热门度', value: 'regionPopular' }, { label: '订单完成率', value: 'completionRate' }, { label: '距离', value: 'distance' },
  ] },
  qualityScoreThreshold: { ...numberField('商家质量分门槛', 'recommendations', 0, 5, '分', ['newUserDimensions']), precision: 1 },
  regionPopularStatsDays: numberField('热门度统计周期', 'recommendations', 1, 365, '天', ['newUserDimensions']),
  popularityMetrics: { label: '热门度指标', group: 'recommendations', kind: 'multiple', dependencies: ['newUserDimensions'], options: [
    { label: '下单数', value: 'orderCount' }, { label: '访问量', value: 'visitCount' }, { label: '复购率', value: 'repurchaseRate' },
  ] },
  regionPopularTopPercent: numberField('区域热门度前百分比', 'recommendations', 1, 100, '%', ['newUserDimensions']),
  completionRateThreshold: numberField('订单完成率门槛', 'recommendations', 0, 100, '%', ['newUserDimensions']),
  completionMinOrderCount: numberField('完成率最低订单样本', 'recommendations', 1, 10000, '单', ['newUserDimensions']),
}

export const TRAFFIC_FIELD_NAMES = Object.keys(TRAFFIC_DEFAULTS) as TrafficFieldName[]
export const isParamsObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 只接受契约中的基础类型；异常配置阻止编辑，不能静默以默认值覆盖。 */
export function readTrafficParams(raw: unknown): TrafficAlgorithmValues {
  if (!isParamsObject(raw)) throw new Error('投流配置格式无效，请检查原始配置后重试')
  const source = raw
  const result = { ...TRAFFIC_DEFAULTS }
  function restore<K extends TrafficFieldName>(name: K) {
    const value = source[name] === undefined ? TRAFFIC_DEFAULTS[name] : source[name]
    const kind = TRAFFIC_FIELDS[name].kind
    const valid = kind === 'number' ? value === null || (typeof value === 'number' && Number.isFinite(value))
      : kind === 'boolean' ? typeof value === 'boolean'
      : kind === 'multiple' ? Array.isArray(value) && value.every(item => typeof item === 'string')
      : typeof value === 'string'
    if (!valid) throw new Error(`投流配置“${TRAFFIC_FIELDS[name].label}”格式无效，请检查后重试`)
    // 已按字段种类验证后赋值；数组独立复制，避免污染默认值及原始配置。
    result[name] = (Array.isArray(value) ? [...value] : value) as TrafficAlgorithmValues[K]
  }
  TRAFFIC_FIELD_NAMES.forEach(restore)
  return result
}

export function serializeTrafficParams(values: unknown): TrafficAlgorithmValues {
  return readTrafficParams(values)
}

export function isTrafficFieldActive(name: TrafficFieldName, values: Partial<TrafficAlgorithmValues>): boolean {
  if (name === 'merchantKeywordStatsDays') return values.merchantKeywordStatsMode === 'custom'
  if (name === 'userKeywordStatsDays') return values.userKeywordStatsMode === 'custom'
  if (name === 'productCheckInterval') return values.soldOutFilterEnabled === true
  if (name === 'qualityScoreThreshold') return values.newUserDimensions?.includes('qualityScore') === true
  if (['regionPopularStatsDays', 'popularityMetrics', 'regionPopularTopPercent'].includes(name)) return values.newUserDimensions?.includes('regionPopular') === true
  if (['completionRateThreshold', 'completionMinOrderCount'].includes(name)) return values.newUserDimensions?.includes('completionRate') === true
  if (TRAFFIC_FIELDS[name].dependencies?.includes('generativeRecommendEnabled')) {
    if (!values.generativeRecommendEnabled) return false
    if (name === 'dwellTimeThreshold') return values.generativeTriggerMode === 'dwell'
    if (name === 'generativePriorityMode2') return values.generativeMerchantCount === 2
    if (name === 'generativeDailyLimit') return values.generativeDailyLimitMode === 'limited'
  }
  return true
}

/** 仅负责前端体验校验；推荐执行与服务端写入仍需后端重验。 */
export function getTrafficFieldError(name: TrafficFieldName, value: unknown, values: Partial<TrafficAlgorithmValues>): string | undefined {
  if (!isTrafficFieldActive(name, values)) return
  const field = TRAFFIC_FIELDS[name]
  if (value === undefined || value === null || value === '') return `请填写${field.label}`
  if (field.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${field.label}必须为有效数字`
    if (value < field.min! || value > field.max!) return `${field.label}须在 ${field.min}～${field.max} 之间`
    if (field.precision === 0 && !Number.isInteger(value)) return `${field.label}必须为整数`
    if (field.precision === 1 && Number(value.toFixed(1)) !== value) return `${field.label}最多保留一位小数`
    if (name === 'explorationSlots' && typeof values.maxUserTags === 'number' && value >= values.maxUserTags) return '探索标签数必须小于参与匹配的标签上限'
  }
  if (field.kind === 'boolean' && typeof value !== 'boolean') return `请选择${field.label}`
  if (field.kind === 'select' && !field.options?.some(option => option.value === value)) return `请选择有效的${field.label}`
  if (field.kind === 'multiple' && (!Array.isArray(value) || value.length === 0 || value.some(item => !field.options?.some(option => option.value === item)))) return `${field.label}至少选择一项有效选项`
}

export function getTrafficGroup(name: string): TrafficGroup | undefined {
  return Object.hasOwn(TRAFFIC_FIELDS, name) ? TRAFFIC_FIELDS[name as TrafficFieldName].group : undefined
}

export function trafficStrategyLabel(strategy: string | undefined): string {
  if (strategy === 'trafficProportional') return '剩余流量包比例分配（历史策略）'
  if (strategy === 'matchFirst') return '兴趣匹配优先'
  return strategy || '待配置'
}
