// 待界面确认后统一补充 i18n；参数键与现有接口保持兼容。
import i18n from '@/i18n'

export type TrafficGroup = 'availability' | 'matching' | 'ranking' | 'coldStart' | 'similarRec' | 'frequency'

// 六组流水线：准入 → 标签/匹配 → 冷启动召回 → 点击后相似推荐 → 频控/展示 → 投流坑位排序。
// 排序模块置末：它只决定「本广告占用坑位内」的商家先后，跨广告类型的坑位顺序由瀑布流策略的坑位序号决定。
export const TRAFFIC_GROUPS: { key: TrafficGroup; title: string }[] = [
  { key: 'availability', title: '基础与可用性' },
  { key: 'matching', title: '标签与兴趣匹配' },
  { key: 'coldStart', title: '冷启动推荐' },
  { key: 'similarRec', title: '相似推荐' },
  { key: 'frequency', title: '频控与触发' },
  { key: 'ranking', title: '投流坑位排序' },
]

/** 排序预设＝单轴排序：匹配优先按匹配得分、消耗优先按流量包剩余量（匹配达标者内）。
 * 自定义因子＝勾选子集归一后等权相加。预设不展示/不校验因子勾选。 */
export const RANK_CUSTOM_DEFAULT_FACTORS = ['match', 'quality', 'distance']
/** 两套排序字段前缀：rank=投流坑位排序；similarRank=点击后相似推荐独立优先级。 */
export const RANK_PREFIXES = ['rank', 'similarRank'] as const
export type RankPrefix = typeof RANK_PREFIXES[number]
export const rankField = <P extends RankPrefix, S extends string>(prefix: P, suffix: S): `${P}${S}` & TrafficFieldName => `${prefix}${suffix}` as `${P}${S}` & TrafficFieldName
/** 参与排序的因子枚举（仅自定义因子时勾选，替代手填权重）。 */
export const RANK_FACTOR_OPTIONS = [
  { label: '匹配分', value: 'match' },
  { label: '剩余比例', value: 'traffic' },
  { label: '质量分', value: 'quality' },
  { label: '距离', value: 'distance' },
]
/** 同分决胜基础选项；「按流量包方向」在纯余量排序时无意义，由 normalize/ UI 过滤。 */
export const RANK_TIE_BREAK_OPTIONS = [
  { label: '剩余曝光次数多者优先', value: 'trafficDirection' },
  { label: '质量分高者优先', value: 'quality' },
  { label: '距离近者优先', value: 'distance' },
  { label: '随机探索', value: 'random' },
]
/** 纯余量排序（消耗优先 / 自定义仅勾余量）时「按流量包方向」决胜无意义。 */
export const isTrafficOnlyRank = (preset: string, factors: string[]) =>
  preset === 'consumeFirst' || (preset === 'custom' && factors.length === 1 && factors[0] === 'traffic')

/** 冷启动一期维度真源：固定生效因子 + 唯一可勾选政策维度；退役维度不再进入保存值。
 * sections.tsx 的维度卡与 serialize 的归一都以此为唯一真源，避免默认值/可选范围/保存值三处不一致。 */
export const COLD_START_FIXED_DIMENSIONS = ['remainingTraffic', 'distance'] as const
// 质量为一期可选「软优选」维度：只影响冷启动层内先后，不作全局硬准入。
export const V1_DIMENSIONS = [...COLD_START_FIXED_DIMENSIONS, 'qualityScore'] as const
export const RETIRED_DIMENSIONS = ['regionPopular', 'completionRate'] as const

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
  merchantPreferenceMinScore: number | null
  qualityFilterEnabled: boolean
  coverageFilterEnabled: boolean
  matchThreshold: number | null
  userSimilarThreshold: number | null
  matchingUserSimilarEnabled: boolean
  matchingUserSimilarThreshold: number | null
  matchingUserSimilarMode: string
  matchingUserSimilarRatio: number | null
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
  merchantTagIdleClearDays: number | null
  userDecayDays: number | null
  userDecayPoints: number | null
  userRetainedTagCount: number | null
  userTagIdleClearDays: number | null
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
  remainingTrafficDirection: string
  newMerchantBoostEnabled: boolean
  newMerchantDays: number | null
  newMerchantExplorationSlots: number | null
  similarRecModes: string[]
  similarRecPriority: string
  similarRecSlot1Source: string
  similarRecSlot2Source: string
  similarityMetric: string
  similarityThreshold: number | null
  categoryMatchLevel: string
  rankPreset: string
  rankFactors: string[]
  rankWeightMatch: number | null
  rankWeightTraffic: number | null
  rankWeightQuality: number | null
  rankWeightDistance: number | null
  rankTieBreak: string
  rankPoolSize: number | null
  mealPeriodPriorityEnabled: boolean
  mealPeriodFallback: string
  coldStartRegionScope: string
  similarRankMode: string
  similarRankPreset: string
  similarRankFactors: string[]
  similarRankWeightMatch: number | null
  similarRankWeightTraffic: number | null
  similarRankWeightQuality: number | null
  similarRankWeightDistance: number | null
  similarRankTieBreak: string
  similarRankScope: string
  similarAnchor: string
  similarBlendRatio: number | null
  similarChainEnabled: boolean
  similarChainDepth: number | null
}

export type TrafficFieldName = keyof TrafficAlgorithmValues
export interface TrafficFormIssue { name: string; message: string }

/** 集中维护默认值，缺失字段才补默认；false、0 和显式空值不被覆盖。 */
export const TRAFFIC_DEFAULTS: TrafficAlgorithmValues = {
  statusOpen: true, statusRest: false, statusOverwhelmed: false, statusClosed: false,
  consistencyCheckInterval: null, merchantExposureStrategy: 'trafficProportional',
  merchantKeywordStatsMode: 'all', merchantKeywordStatsDays: 30,
  userKeywordStatsMode: 'all', userKeywordStatsDays: 30,
  userPreferenceMinScore: 10, merchantPreferenceMinScore: 50, qualityFilterEnabled: false,
  coverageFilterEnabled: false, matchThreshold: 30, userSimilarThreshold: 60,
  matchingUserSimilarEnabled: false, matchingUserSimilarThreshold: 60,
  matchingUserSimilarMode: 'fill', matchingUserSimilarRatio: 10,
  soldOutFilterEnabled: true, productCheckInterval: 5,
  merchantFreqHours: 2, merchantFreqTimes: 1, keywordFreqHours: 1, keywordFreqTimes: 5,
  maxUserTags: 5, explorationSlots: 0, maxMerchantsPerKeyword: 3,
  merchantDecayDays: 7, merchantDecayPoints: 1, merchantRetainedTagCount: null, merchantTagIdleClearDays: 30,
  userDecayDays: 14, userDecayPoints: 1, userRetainedTagCount: null, userTagIdleClearDays: 30,
  newTagBoostMultiplier: 3, maxBoostTagCount: 10,
  generativeRecommendEnabled: true, generativeTriggerMode: 'dwell', dwellTimeThreshold: 10,
  generativeTriggerScope: 'all', generativeMerchantCount: 1,
  generativePriorityMode: 'matchFirst', generativePriorityMode2: 'trafficBalance',
  generativeDailyLimitMode: 'limited', generativeDailyLimit: 3, generativeSkipMerchantCount: 2,
  newUserDimensions: [...COLD_START_FIXED_DIMENSIONS], qualityScoreThreshold: 3.5,
  regionPopularStatsDays: 30, popularityMetrics: ['orderCount', 'visitCount'],
  regionPopularTopPercent: 20, completionRateThreshold: 80, completionMinOrderCount: 20,
  remainingTrafficDirection: 'moreFirst',
  newMerchantBoostEnabled: false, newMerchantDays: 7, newMerchantExplorationSlots: 1,
  similarRecModes: ['merchantSimilar'], similarRecPriority: 'merchantFirst',
  similarRecSlot1Source: 'merchantSimilar', similarRecSlot2Source: 'userSimilar', similarityMetric: 'cosine', similarityThreshold: 60, categoryMatchLevel: 'secondary',
  rankPreset: 'matchFirst', rankFactors: [],
  rankWeightMatch: 60, rankWeightTraffic: 20, rankWeightQuality: 10, rankWeightDistance: 10,
  rankTieBreak: 'trafficDirection', rankPoolSize: 100,
  mealPeriodPriorityEnabled: true, mealPeriodFallback: 'adjacent',
  coldStartRegionScope: 'delivery',
  similarRankMode: 'inherit', similarRankPreset: 'matchFirst', similarRankFactors: [],
  similarRankWeightMatch: 60, similarRankWeightTraffic: 20, similarRankWeightQuality: 10, similarRankWeightDistance: 10,
  similarRankTieBreak: 'trafficDirection',
  similarRankScope: 'shared', similarAnchor: 'clickedMerchant', similarBlendRatio: 70,
  similarChainEnabled: true, similarChainDepth: 2,
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
  /** 本轮已变更语义的显示文案不再读取旧译文；待界面确认后同步翻译。 */
  translateLabel?: boolean
  translateOptions?: boolean
}
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
  consistencyCheckInterval: numberField('数据一致性检查周期', 'availability', 1, 1440, '分钟'),
  productCheckInterval: numberField('商品可用性检查周期', 'availability', 1, 60, '分钟', ['soldOutFilterEnabled']),
  merchantExposureStrategy: { label: '当前保存的曝光策略', group: 'matching', kind: 'hidden' },
  // 统计范围固定为全部历史（自定义周期因技术实现难度取消）：以下 4 个键不再渲染选择器，
  // 仅保留在契约白名单中透传存量参数，兴趣匹配模块以固定口径卡展示（见 sections.tsx）。
  merchantKeywordStatsMode: { label: '商家标签统计范围', group: 'matching', kind: 'select', options: [] },
  merchantKeywordStatsDays: numberField('商家统计周期', 'matching', 1, 365, '天', ['merchantKeywordStatsMode']),
  userKeywordStatsMode: { label: '用户标签统计范围', group: 'matching', kind: 'select', options: [] },
  userKeywordStatsDays: numberField('用户统计周期', 'matching', 1, 365, '天', ['userKeywordStatsMode']),
  // 商家标签由众多买家订单聚合、用户标签仅本人订单累加，量级不对称，门槛分侧独立配置。
  userPreferenceMinScore: numberField('用户偏好识别最低分', 'matching', 1, 100, '分'),
  merchantPreferenceMinScore: numberField('商家偏好识别最低分', 'matching', 1, 1000, '分'),
  // 全局质量硬开关已退役：付费但暂无评分的商家不应被排除；质量改为冷启动软优选（qualityScore 维度）。
  qualityFilterEnabled: { label: '启用商家质量门槛', group: 'availability', kind: 'boolean', translateLabel: false },
  coverageFilterEnabled: { label: '启用最低覆盖比例', group: 'matching', kind: 'boolean', translateLabel: false },
  matchThreshold: { ...numberField('最低覆盖比例', 'matching', 1, 100, '%', ['coverageFilterEnabled']), translateLabel: false },
  // 普通投流与点击后协同独立启用、独立调门槛，共用用户邻居与 CF 计算；旧记录缺省关闭。
  matchingUserSimilarEnabled: { label: '启用用户协同补充', group: 'matching', kind: 'boolean', translateLabel: false },
  matchingUserSimilarThreshold: { ...numberField('协同补充最低用户相似度', 'matching', 1, 100, '%', ['matchingUserSimilarEnabled']), translateLabel: false },
  // 补充方式：不足时补充＝直接匹配优先、协同只补缺口；按比例预留＝协同占本广告坑位的固定比例（向下取整）。
  matchingUserSimilarMode: { label: '协同补充方式', group: 'matching', kind: 'select', translateLabel: false, translateOptions: false,
    dependencies: ['matchingUserSimilarEnabled'], options: [
      { label: '不足时补充', value: 'fill' }, { label: '按比例预留', value: 'ratio' },
    ] },
  matchingUserSimilarRatio: { ...numberField('协同预留比例', 'matching', 1, 100, '%', ['matchingUserSimilarEnabled', 'matchingUserSimilarMode']), translateLabel: false },
  // 标签上限已退役：按分截断会漏掉排名靠后但与对方重合的标签；匹配改为全部达标标签参与，字段保持挂载透传存量。
  maxUserTags: numberField('参与匹配的标签上限', 'matching', 1, 20, '个'),
  // 探索位＝达标标签之外额外纳入的新标签数（加法，不再从上限里扣）；只参与相似度、不计入覆盖率分母。
  explorationSlots: numberField('新偏好探索标签数', 'matching', 0, 10, '个'),
  maxMerchantsPerKeyword: numberField('同标签商家展示上限', 'frequency', 1, 10, '家'),
  // 外卖去重窗口不必整小时：支持小数（0.5 小时=30 分钟），下限 0.5 小时。
  merchantFreqHours: { ...numberField('同商家统计窗口', 'frequency', 0.5, 24, '小时'), precision: 1 },
  merchantFreqTimes: numberField('同商家最多展示', 'frequency', 1, 20, '次'),
  keywordFreqHours: numberField('同标签统计窗口', 'frequency', 1, 24, '小时'),
  keywordFreqTimes: numberField('同标签最多展示', 'frequency', 1, 20, '次'),
  merchantDecayDays: numberField('商家标签衰减周期', 'matching', 1, 365, '天'),
  merchantDecayPoints: numberField('商家标签每次减分', 'matching', 1, 100, '分'),
  // 保留＝豁免「衰减到0即删」（保留最热 N 个）；清理＝保留标签无变动过期；二者不矛盾，口径见 sections 衰减弹层。
  merchantRetainedTagCount: numberField('商家保留最热标签数', 'matching', 0, 50, '个'),
  merchantTagIdleClearDays: { ...numberField('商家标签无新增清理天数', 'matching', 1, 365, '天'), translateLabel: false },
  userDecayDays: numberField('用户标签衰减周期', 'matching', 1, 365, '天'),
  userDecayPoints: numberField('用户标签每次减分', 'matching', 1, 100, '分'),
  userRetainedTagCount: numberField('用户保留最热标签数', 'matching', 0, 50, '个'),
  userTagIdleClearDays: { ...numberField('用户标签无新增清理天数', 'matching', 1, 365, '天'), translateLabel: false },
  newTagBoostMultiplier: numberField('新标签有效分加速倍数', 'matching', 1, 10, '倍'),
  maxBoostTagCount: numberField('同时加速标签上限', 'matching', 1, 50, '个'),
  generativeRecommendEnabled: { label: '浏览后相似推荐', group: 'similarRec', kind: 'boolean' },
  generativeTriggerMode: { label: '触发条件', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '点击即触发', value: 'instant' }, { label: '停留达到时长后触发', value: 'dwell' },
  ] },
  dwellTimeThreshold: numberField('停留时长门槛', 'similarRec', 3, 120, '秒', ['generativeRecommendEnabled', 'generativeTriggerMode']),
  generativeTriggerScope: { label: '触发范围', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '全部坑位（含非投流）', value: 'all' }, { label: '仅投流坑位', value: 'trafficOnly' },
  ] },
  generativeMerchantCount: numberField('每次推荐商家数量', 'similarRec', 1, 2, '家', ['generativeRecommendEnabled']),
  // 历史优先级枚举已被共用排序规则取代：保持挂载透传存量，UI 不再提供选择。
  generativePriorityMode: { label: '第 1 家优先级', group: 'similarRec', kind: 'select', options: priorityOptions, dependencies: ['generativeRecommendEnabled'] },
  generativePriorityMode2: { label: '第 2 家优先级', group: 'similarRec', kind: 'select', options: priorityOptions, dependencies: ['generativeRecommendEnabled', 'generativeMerchantCount'] },
  generativeDailyLimitMode: { label: '单用户每日触发限制', group: 'frequency', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '限制次数', value: 'limited' }, { label: '不限制', value: 'unlimited' },
  ] },
  generativeDailyLimit: numberField('单用户每日触发上限', 'frequency', 1, 50, '次', ['generativeRecommendEnabled', 'generativeDailyLimitMode']),
  generativeSkipMerchantCount: numberField('再次触发前跳过商家点击', 'similarRec', 0, 50, '家', ['generativeRecommendEnabled']),
  newUserDimensions: { label: '冷启动排序维度', group: 'coldStart', kind: 'multiple', options: [
    { label: '剩余流量包', value: 'remainingTraffic' }, { label: '商家质量分', value: 'qualityScore' },
    { label: '区域热门度', value: 'regionPopular' }, { label: '订单完成率', value: 'completionRate' }, { label: '距离', value: 'distance' },
  ] },
  qualityScoreThreshold: { ...numberField('综合评分优选线', 'coldStart', 0, 5, '分', ['newUserDimensions']), precision: 1, translateLabel: false },
  regionPopularStatsDays: numberField('热门度统计周期', 'coldStart', 1, 365, '天', ['newUserDimensions']),
  popularityMetrics: { label: '热门度指标', group: 'coldStart', kind: 'multiple', dependencies: ['newUserDimensions'], options: [
    { label: '下单数', value: 'orderCount' }, { label: '访问量', value: 'visitCount' }, { label: '复购率', value: 'repurchaseRate' },
  ] },
  regionPopularTopPercent: numberField('区域热门度前百分比', 'coldStart', 1, 100, '%', ['newUserDimensions']),
  completionRateThreshold: numberField('订单完成率门槛', 'coldStart', 0, 100, '%', ['newUserDimensions']),
  completionMinOrderCount: numberField('完成率最低订单样本', 'coldStart', 1, 10000, '单', ['newUserDimensions']),
  // 一期：剩余流量包方向可配（剩余多优先/剩余少优先），默认剩余多优先以加速大包消耗。
  remainingTrafficDirection: { label: '流量包排序方向', group: 'coldStart', kind: 'select', options: [
    { label: '剩余多优先', value: 'moreFirst' }, { label: '剩余少优先', value: 'lessFirst' },
  ] },
  // 新商家冷启动已退役：瀑布流已配置「新店广告」坑位承担新店曝光，本算法不再重复扶持；字段保持挂载透传存量。
  newMerchantBoostEnabled: { label: '新商家冷启动扶持', group: 'coldStart', kind: 'boolean' },
  newMerchantDays: numberField('新商家判定天数', 'coldStart', 1, 90, '天', ['newMerchantBoostEnabled']),
  newMerchantExplorationSlots: numberField('新商家探索坑位', 'coldStart', 0, 10, '个', ['newMerchantBoostEnabled']),
  // 相似推荐三模式（可叠加）：商家相似/用户相似/同类目；相似度基于标签有效分向量。
  similarRecModes: { label: '推荐模式', group: 'similarRec', kind: 'multiple', translateOptions: false, dependencies: ['generativeRecommendEnabled'], options: [
    { label: '商家相似推荐', value: 'merchantSimilar' }, { label: '用户协同推荐', value: 'userSimilar' }, { label: '同类目商家推荐', value: 'sameCategory' },
  ] },
  // 全局填充顺序已退役：改为按坑位选来源（见 similarRecSlot1/2Source），保持挂载透传存量。
  similarRecPriority: { label: '候选填充顺序（已退役）', group: 'similarRec', kind: 'select', translateLabel: false, translateOptions: false,
    dependencies: ['generativeRecommendEnabled'], options: [
      { label: '按顺序（商家相似优先）', value: 'merchantFirst' },
      { label: '用户协同优先', value: 'userFirst' },
    ] },
  // 按坑位选优先来源：可选项只列已勾选模式；第 2 位仅在选择 2 家时激活。
  similarRecSlot1Source: { label: '第 1 位优先来源', group: 'similarRec', kind: 'select', translateLabel: false, translateOptions: false,
    dependencies: ['generativeRecommendEnabled'], options: [
      { label: '商家相似推荐', value: 'merchantSimilar' }, { label: '用户协同推荐', value: 'userSimilar' }, { label: '同类目商家推荐', value: 'sameCategory' },
    ] },
  similarRecSlot2Source: { label: '第 2 位优先来源', group: 'similarRec', kind: 'select', translateLabel: false, translateOptions: false,
    dependencies: ['generativeRecommendEnabled', 'generativeMerchantCount'], options: [
      { label: '商家相似推荐', value: 'merchantSimilar' }, { label: '用户协同推荐', value: 'userSimilar' }, { label: '同类目商家推荐', value: 'sameCategory' },
    ] },
  userSimilarThreshold: { ...numberField('相似用户最低相似度', 'similarRec', 1, 100, '%', ['generativeRecommendEnabled', 'similarRecModes']), translateLabel: false },
  // 算法级相似度算法：兴趣匹配匹配分与相似推荐相似度共用；覆盖率只管兴趣匹配准入（广度），相似度管排序（强度）。
  // 不随相似推荐开关门控：相似推荐关闭时兴趣匹配仍用它算匹配分。
  similarityMetric: { label: '相似度算法', group: 'matching', kind: 'select', options: [
    { label: '余弦相似度', value: 'cosine' }, { label: '加权 Jaccard', value: 'weightedJaccard' },
  ] },
  similarityThreshold: numberField('相似度门槛', 'similarRec', 1, 100, '%', ['generativeRecommendEnabled', 'similarRecModes']),
  categoryMatchLevel: { label: '类目匹配层级', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled', 'similarRecModes'], options: [
    { label: '一级类目', value: 'primary' }, { label: '二级类目', value: 'secondary' },
  ] },
  // ── 冷启动·区域召回范围（仅两档：配送范围内 / 用户所在商圈；口径见 sections.tsx 问号弹层）──
  coldStartRegionScope: { label: '区域召回范围', group: 'coldStart', kind: 'select', options: [
    { label: '配送范围内', value: 'delivery' }, { label: '用户所在商圈', value: 'tradeArea' },
  ] },
  // ── 投流坑位排序（独立模块：本广告占用坑位内的候选集→坑位）──
  rankPreset: { label: '排序策略', group: 'ranking', kind: 'select', options: [
    { label: '匹配优先', value: 'matchFirst' }, { label: '消耗优先', value: 'consumeFirst' },
    { label: '自定义因子', value: 'custom' },
  ] },
  rankFactors: { label: '参与排序因子', group: 'ranking', kind: 'multiple', options: RANK_FACTOR_OPTIONS, translateOptions: false },
  // 权重数值已退役（改为勾选因子等权）：保持挂载透传存量，不再展示/校验。
  rankWeightMatch: numberField('权重·匹配分', 'ranking', 0, 100, '%'),
  rankWeightTraffic: numberField('权重·流量余量', 'ranking', 0, 100, '%'),
  rankWeightQuality: numberField('权重·质量分', 'ranking', 0, 100, '%'),
  rankWeightDistance: numberField('权重·距离', 'ranking', 0, 100, '%'),
  rankTieBreak: { label: '同分决胜', group: 'ranking', kind: 'select', options: RANK_TIE_BREAK_OPTIONS, translateOptions: false },
  // 候选池上限已退役：坑位数由瀑布流策略决定，本算法对全量已购商家打分排序；
  // 截断会使长尾广告主永不轮转、违背按购买量消耗。保持挂载透传存量。
  rankPoolSize: numberField('候选池上限', 'ranking', 10, 2000, '家'),
  // 时段优先＝排序前先按当前餐段过滤候选（主营时段＝当前时段）；不足时只在已购本广告的投流商家内分层补，
  // 仍不足由瀑布流按其配置的兜底自然流算法补位（不在本模块配）。
  mealPeriodPriorityEnabled: { label: '时段优先', group: 'ranking', kind: 'boolean' },
  mealPeriodFallback: { label: '候选不足补齐', group: 'ranking', kind: 'select', dependencies: ['mealPeriodPriorityEnabled'], options: [
    { label: '相邻时段投流商家', value: 'adjacent' }, { label: '全时段投流商家', value: 'any' },
  ] },
  // ── 相似推荐·独立优先级（可沿用总排序或独立配置）──
  similarRankMode: { label: '优先级来源', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '沿用投流坑位排序', value: 'inherit' }, { label: '独立配置', value: 'independent' },
  ] },
  similarRankPreset: { label: '独立排序策略', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled', 'similarRankMode'], options: [
    { label: '匹配优先', value: 'matchFirst' }, { label: '消耗优先', value: 'consumeFirst' },
    { label: '自定义因子', value: 'custom' },
  ] },
  similarRankFactors: { label: '独立参与因子', group: 'similarRec', kind: 'multiple', dependencies: ['generativeRecommendEnabled', 'similarRankMode'], options: RANK_FACTOR_OPTIONS, translateOptions: false },
  similarRankWeightMatch: numberField('独立权重·匹配分', 'similarRec', 0, 100, '%', ['generativeRecommendEnabled', 'similarRankMode']),
  similarRankWeightTraffic: numberField('独立权重·流量余量', 'similarRec', 0, 100, '%', ['generativeRecommendEnabled', 'similarRankMode']),
  similarRankWeightQuality: numberField('独立权重·质量分', 'similarRec', 0, 100, '%', ['generativeRecommendEnabled', 'similarRankMode']),
  similarRankWeightDistance: numberField('独立权重·距离', 'similarRec', 0, 100, '%', ['generativeRecommendEnabled', 'similarRankMode']),
  similarRankTieBreak: { label: '独立同分决胜', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled', 'similarRankMode'], options: RANK_TIE_BREAK_OPTIONS, translateOptions: false },
  // 退役：排序范围/链式触发已被「优先级来源」与每日上限+同商家去重取代，保持挂载透传存量。
  similarRankScope: { label: '排序范围', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled'], options: [
    { label: '沿用共用排序规则', value: 'shared' }, { label: '仅按相似度排序', value: 'similarityOnly' },
  ] },
  similarAnchor: { label: '相似度锚点', group: 'similarRec', kind: 'select', dependencies: ['generativeRecommendEnabled', 'similarRecModes'], options: [
    { label: '被点击商家标签向量', value: 'clickedMerchant' }, { label: '当前用户标签向量', value: 'user' },
    { label: '商家＋用户融合', value: 'blend' },
  ] },
  similarBlendRatio: numberField('融合时商家权重', 'similarRec', 0, 100, '%', ['generativeRecommendEnabled', 'similarAnchor']),
  similarChainEnabled: { label: '允许对推荐商家再次触发', group: 'similarRec', kind: 'boolean', dependencies: ['generativeRecommendEnabled'] },
  similarChainDepth: numberField('链式触发最大层数', 'similarRec', 1, 3, '层', ['generativeRecommendEnabled', 'similarChainEnabled']),
}

export const TRAFFIC_FIELD_NAMES = Object.keys(TRAFFIC_DEFAULTS) as TrafficFieldName[]

/** 退役字段仅归档，不参与新配置的校验和执行输入。条件关闭的现行字段不属于退役字段。 */
export const TRAFFIC_RETIRED_FIELDS: readonly TrafficFieldName[] = [
  'merchantExposureStrategy', 'maxUserTags', 'rankPoolSize', 'explorationSlots', 'qualityFilterEnabled',
  'maxMerchantsPerKeyword', 'keywordFreqHours', 'keywordFreqTimes',
  'merchantRetainedTagCount', 'userRetainedTagCount',
  'newTagBoostMultiplier', 'maxBoostTagCount', 'newMerchantBoostEnabled', 'newMerchantDays', 'newMerchantExplorationSlots',
  'regionPopularStatsDays', 'popularityMetrics', 'regionPopularTopPercent', 'completionRateThreshold', 'completionMinOrderCount',
  'generativePriorityMode', 'generativePriorityMode2', 'generativeTriggerScope', 'generativeSkipMerchantCount', 'similarRecPriority',
  'similarRankScope', 'similarAnchor', 'similarBlendRatio', 'similarChainEnabled', 'similarChainDepth',
  'rankWeightMatch', 'rankWeightTraffic', 'rankWeightQuality', 'rankWeightDistance',
  'similarRankWeightMatch', 'similarRankWeightTraffic', 'similarRankWeightQuality', 'similarRankWeightDistance',
]
/** 已固定为全部历史的废弃选择项（仅透传兼容存量参数，UI 不再提供选择）。 */
export const TRAFFIC_FIXED_STATS_FIELDS = [
  'merchantKeywordStatsMode', 'merchantKeywordStatsDays', 'userKeywordStatsMode', 'userKeywordStatsDays',
] as const
export const isParamsObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 预设/自定义归一（读/写同口径）：预设不保留因子勾选；存量 balanced 转自定义并回退默认子集；
 * 纯余量排序时「按流量包方向」决胜无意义，归一为质量分高者优先。 */
function normalizeRankPreset(target: TrafficAlgorithmValues, prefix: RankPrefix) {
  const presetField = rankField(prefix, 'Preset')
  const factorsField = rankField(prefix, 'Factors')
  const tieField = rankField(prefix, 'TieBreak')
  if (target[presetField] === 'balanced') {
    target[presetField] = 'custom'
    if (target[factorsField].length === 0) target[factorsField] = [...RANK_CUSTOM_DEFAULT_FACTORS]
  }
  if (target[presetField] !== 'custom') target[factorsField] = []
  if (isTrafficOnlyRank(target[presetField], target[factorsField]) && target[tieField] === 'trafficDirection') {
    target[tieField] = 'quality'
  }
}

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
    if (!valid && TRAFFIC_RETIRED_FIELDS.includes(name)) {
      result[name] = TRAFFIC_DEFAULTS[name]
      return
    }
    if (!valid) throw new Error(`投流配置“${trafficFieldLabel(name)}”格式无效，请检查后重试`)
    // 已按字段种类验证后赋值；数组独立复制，避免污染默认值及原始配置。
    result[name] = (Array.isArray(value) ? [...value] : value) as TrafficAlgorithmValues[K]
  }
  TRAFFIC_FIELD_NAMES.forEach(restore)
  // 质量软优选迁移：v3 记录直接信任现行维度（硬开关已归档，不再推导，保证往返幂等）；
  // 旧版本：旧全局硬开关或旧维度里的 qualityScore → 冷启动 qualityScore 维度；默认关闭。
  if (source.trafficConfigVersion !== 3) {
    const qualityEnabled = source.qualityFilterEnabled !== undefined
      ? source.qualityFilterEnabled === true
      : Array.isArray(source.newUserDimensions) && source.newUserDimensions.includes('qualityScore')
    result.newUserDimensions = [...new Set([
      ...COLD_START_FIXED_DIMENSIONS,
      ...(qualityEnabled ? ['qualityScore'] : []),
    ])]
  }
  // 覆盖率开关迁移：显式 null 保留待配置；缺失/旧 0 → 关闭且隐藏值回 30；旧正数 → 开启并保留；显式开关优先。
  const rawCoverage = source.matchThreshold
  const oldCoverage = typeof rawCoverage === 'number' ? rawCoverage : null
  result.coverageFilterEnabled = source.coverageFilterEnabled !== undefined
    ? source.coverageFilterEnabled === true
    : oldCoverage !== null && oldCoverage > 0
  result.matchThreshold = rawCoverage === null ? null : oldCoverage !== null && oldCoverage > 0 ? oldCoverage : 30
  const knownModes = ['merchantSimilar', 'userSimilar', 'sameCategory']
  const previousModes = result.similarRecModes
  result.similarRecModes = [...new Set(previousModes.filter(mode => knownModes.includes(mode)))]
  // 只启用了已下线模式的旧配置保持关闭，不能静默替换为另一种推荐。
  if (previousModes.length > 0 && result.similarRecModes.length === 0) result.generativeRecommendEnabled = false
  if (result.similarityMetric === 'overlap') result.similarityMetric = 'weightedJaccard'
  if (['district', 'city'].includes(result.coldStartRegionScope)) result.coldStartRegionScope = 'delivery'
  RANK_PREFIXES.forEach(prefix => normalizeRankPreset(result, prefix))
  // 「不补齐」选项已下线（自然流兜底由瀑布流自身承担）：存量 none 归一为相邻时段。
  if (result.mealPeriodFallback === 'none') result.mealPeriodFallback = 'adjacent'
  return result
}

/** currentVersion=3 表示写入现行版本：维度直接信任入参勾选（内部二次 read 会把已归一值误当旧记录重迁移）。 */
export function serializeTrafficParams(values: unknown, currentVersion?: number): Partial<TrafficAlgorithmValues> {
  const result = readTrafficParams(values)
  // 统计范围已固定为全部历史：选择器字段不再挂载，存量 custom 值在保存时统一归一，
  // 避免旧记录的自定义周期透传回参数、误导后续接入的执行服务。
  const fix = <K extends TrafficFieldName>(name: K) => { result[name] = TRAFFIC_DEFAULTS[name] }
  for (const name of TRAFFIC_FIXED_STATS_FIELDS) fix(name)
  // 重叠系数与 Jaccard 同族易混，一期收敛：存量 overlap 归一为加权 Jaccard。
  if (result.similarityMetric === 'overlap') result.similarityMetric = 'weightedJaccard'
  // 区域召回收敛为两档：存量「同行政区/同城」归一为「配送范围内」，不把已废弃枚举透传回参数。
  if (result.coldStartRegionScope === 'district' || result.coldStartRegionScope === 'city') result.coldStartRegionScope = 'delivery'
  // 冷启动维度归一：剔除退役维度（regionPopular/completionRate），避免新建/存量写入不可选维度。
  // v3 信任入参现行勾选（UI 锁定固定因子，校验保证至少一项）；旧版本强制回退固定因子。
  const inputDims = isParamsObject(values) && Array.isArray(values.newUserDimensions)
    ? values.newUserDimensions.filter((d): d is string => typeof d === 'string') : result.newUserDimensions
  result.newUserDimensions = currentVersion === 3
    ? [...new Set(inputDims.filter(d => (V1_DIMENSIONS as readonly string[]).includes(d)))]
    : [...new Set([...COLD_START_FIXED_DIMENSIONS, ...result.newUserDimensions])]
  // 按坑位来源写入时归一到已勾选模式（read 保留原值以维持 defaults 不变量）；取消勾选后回退首个已勾选模式。
  if (result.generativeRecommendEnabled && result.similarRecModes.length > 0) {
    if (!result.similarRecModes.includes(result.similarRecSlot1Source)) result.similarRecSlot1Source = result.similarRecModes[0]
    if (!result.similarRecModes.includes(result.similarRecSlot2Source)) result.similarRecSlot2Source = result.similarRecModes[0]
  }
  // 排序范围已被「优先级来源」取代：保存时由 similarRankMode 派生，消除两字段语义重叠导致的后端分叉。
  result.similarRankScope = result.similarRankMode === 'independent' ? 'similarityOnly' : 'shared'
  // 预设/自定义归一（读/写同口径）：预设清空因子、纯余量排序修正决胜。
  RANK_PREFIXES.forEach(prefix => normalizeRankPreset(result, prefix))
  if (result.mealPeriodFallback === 'none') result.mealPeriodFallback = 'adjacent'
  return Object.fromEntries(Object.entries(result).filter(([key]) => !TRAFFIC_RETIRED_FIELDS.includes(key as TrafficFieldName)))
}

/** 保留扩展参数及历史快照，但禁止原参数合并将退役字段重新带回顶层。 */
export function buildTrafficParams(values: unknown, original: Record<string, unknown> = {}): Record<string, unknown> {
  const legacy = isParamsObject(original.legacyTrafficParams) ? { ...original.legacyTrafficParams } : {}
  const extras = { ...original }
  for (const key of TRAFFIC_RETIRED_FIELDS) {
    if (Object.hasOwn(original, key)) legacy[key] = original[key]
    delete extras[key]
  }
  for (const key of ['newUserDimensions', 'similarRecModes'] as const) {
    if (original.trafficConfigVersion !== 3 && Object.hasOwn(original, key)) legacy[key] ??= original[key]
  }
  return { ...extras, ...serializeTrafficParams(values, 3), trafficConfigVersion: 3,
    ...(Object.keys(legacy).length ? { legacyTrafficParams: legacy } : {}) }
}

export function isTrafficFieldActive(name: TrafficFieldName, values: Partial<TrafficAlgorithmValues>): boolean {
  // 统计范围/周期已固定为全部历史，不再是可编辑字段，永不参与展示与校验；存储值保留原样。
  if (['merchantKeywordStatsMode', 'merchantKeywordStatsDays', 'userKeywordStatsMode', 'userKeywordStatsDays'].includes(name)) return false
  // 退役：标签上限/候选池上限/排序范围/链式触发/新商家扶持/新标签加速不再参与展示与校验，存储值保留原样。
  if (TRAFFIC_RETIRED_FIELDS.includes(name)) return false
  if (name === 'productCheckInterval') return values.soldOutFilterEnabled === true
  if (name === 'rankFactors') return values.rankPreset === 'custom'
  if (name === 'mealPeriodFallback') return values.mealPeriodPriorityEnabled === true
  if (name === 'qualityScoreThreshold') return (values.newUserDimensions ?? []).includes('qualityScore')
  if (name === 'matchThreshold') return values.coverageFilterEnabled === true
  if (name === 'matchingUserSimilarThreshold') return values.matchingUserSimilarEnabled === true
  if (name === 'matchingUserSimilarMode') return values.matchingUserSimilarEnabled === true
  if (name === 'matchingUserSimilarRatio') return values.matchingUserSimilarEnabled === true && values.matchingUserSimilarMode === 'ratio'
  if (name === 'similarRecSlot2Source') return values.generativeRecommendEnabled === true && values.generativeMerchantCount === 2
  if (TRAFFIC_FIELDS[name].dependencies?.includes('generativeRecommendEnabled')) {
    if (!values.generativeRecommendEnabled) return false
    if (name === 'dwellTimeThreshold') return values.generativeTriggerMode === 'dwell'
    if (name === 'generativeDailyLimit') return values.generativeDailyLimitMode === 'limited'
    if (name === 'similarityThreshold') {
      const modes = values.similarRecModes ?? []
      return modes.includes('merchantSimilar')
    }
    if (name === 'categoryMatchLevel') return (values.similarRecModes ?? []).includes('sameCategory')
    if (name === 'userSimilarThreshold') return (values.similarRecModes ?? []).includes('userSimilar')
    if (name === 'similarRankFactors') return values.similarRankMode === 'independent' && values.similarRankPreset === 'custom'
    // 独立优先级子项仅在「独立配置」时激活；沿用坑位排序时隐藏不校验。
    if (name.startsWith('similarRank') && name !== 'similarRankMode') return values.similarRankMode === 'independent'
  }
  return true
}

/** 仅负责前端体验校验；推荐执行与服务端写入仍需后端重验。 */
export function getTrafficFieldError(name: TrafficFieldName, value: unknown, values: Partial<TrafficAlgorithmValues>): string | undefined {
  if (!isTrafficFieldActive(name, values)) return
  const field = TRAFFIC_FIELDS[name]
  const label = trafficFieldLabel(name)
  // 保留标签数/无变动清零天数可留空：留空＝不保留/不清零，不视为缺填。
  if (value === null && ['merchantRetainedTagCount', 'userRetainedTagCount', 'merchantTagIdleClearDays', 'userTagIdleClearDays'].includes(name)) return
  if (value === undefined || value === null || value === '') return `请填写${label}`
  if (field.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${label}必须为有效数字`
    if (value < field.min! || value > field.max!) return `${label}须在 ${field.min}～${field.max} 之间`
    if (field.precision === 0 && !Number.isInteger(value)) return `${label}必须为整数`
    if (field.precision === 1 && Number(value.toFixed(1)) !== value) return `${label}最多保留一位小数`
  }
  if (field.kind === 'boolean' && typeof value !== 'boolean') return `请选择${label}`
  if (field.kind === 'select' && !field.options?.some(option => option.value === value)) return `请选择有效的${label}`
  if (field.kind === 'multiple' && (!Array.isArray(value) || value.length === 0 || value.some(item => !field.options?.some(option => option.value === item)))) return `${label}至少选择一项有效选项`
}

export function getTrafficGroup(name: string): TrafficGroup | undefined {
  return Object.hasOwn(TRAFFIC_FIELDS, name) ? TRAFFIC_FIELDS[name as TrafficFieldName].group : undefined
}

export function trafficStrategyLabel(strategy: string | undefined): string {
  if (strategy === 'trafficProportional') return '剩余流量包比例分配（历史策略）'
  if (strategy === 'matchFirst') return '兴趣匹配优先'
  return strategy || '待配置'
}

// ── 第二阶段 i18n：短标签键（recommend.trafficCfg.*）；长句业务口径按 Recommend 域惯例保留硬编码。
// 渲染器一律 t(key, { defaultValue: 源中文 })，键缺失/未初始化时回退源文案，单测不依赖语言包。
export const trafficFieldKey = (name: TrafficFieldName): string => `recommend.trafficCfg.field.${name}`
export const trafficOptionKey = (name: TrafficFieldName, value: string): string => {
  const aliases: Partial<Record<TrafficFieldName, TrafficFieldName>> = {
    similarRankPreset: 'rankPreset', similarRankFactors: 'rankFactors', similarRankTieBreak: 'rankTieBreak',
  }
  return `recommend.trafficCfg.opt.${aliases[name] ?? name}.${value}`
}
export const trafficGroupKey = (key: TrafficGroup): string => `recommend.trafficCfg.group.${key}`
/** 分值复用已有分值键，分钟保留原键；未知单位按完整字符串编码，避免首字相同导致串义。 */
export const trafficUnitKey = (unit: string): string => {
  const keys: Record<string, string> = {
    '分': 'recommend.scoreUnit', '分钟': 'recommend.trafficCfg.unit.u5206',
    '小时': 'recommend.trafficCfg.unit.u5c0f',
  }
  return keys[unit] ?? `recommend.trafficCfg.unit.u${Array.from(unit, c => c.codePointAt(0)!.toString(16)).join('_')}`
}
export const trafficFieldLabel = (name: TrafficFieldName): string => TRAFFIC_FIELDS[name].translateLabel === false
  ? TRAFFIC_FIELDS[name].label : i18n.t(trafficFieldKey(name), { defaultValue: TRAFFIC_FIELDS[name].label })
