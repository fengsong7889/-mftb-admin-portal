/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { AppType, RecommendChannel, Region } from '@mftb/contracts/recommendConstants'
import { signboardLabelText } from '../../Recommend/signboardLabels'
import { TIME_SLOT_AD_DEFAULT_SCORE, storeLabelText, DEFAULT_STAR_TIER_BANDS, DEFAULT_ONTIME_RATE_BANDS, AUTO_ACCEPT_DEFAULT_SCORE, MEAL_TIME_DEFAULT_SCORE, DEFAULT_CANCEL_RATE_BANDS, DEFAULT_CANCEL_MIN_ORDERS, DEFAULT_TRAFFIC_BALANCE_CONFIG } from '../../Recommend/organicTrafficConfig'
import type { Coordinate, Dimension, Eligibility, PointId, RuleResult, SamplePoint, SampleScene, ScoreSnapshot, SimulationMode, StoreResult } from './types'
import { attachSampleEvidence } from './evidence'

// 原型文案暂用繁中，待界面确认后统一补充 i18n；所有门店和结果均为虚构。
export const DIMENSIONS: { key: Dimension; label: string; color: string }[] = [
  { key: 'commercial', label: '商業維度', color: '#E8720C' },
  { key: 'store', label: '店鋪維度', color: '#1890FF' },
  { key: 'platform', label: '平台維度', color: '#722ED1' },
]
export const POINTS: Record<PointId, SamplePoint> = {
  A: { id: 'A', label: '澳門示例點 A', lat: 22.1987, lng: 113.5495 },
  B: { id: 'B', label: '氹仔示例點 B', lat: 22.1548, lng: 113.556 },
}
export const SAMPLE_TIME = '2026-10-30 12:00:00'
export const DATA_TIME = '2026-10-30 11:55:00'
export const TARGET_STORE = 'DEMO-090'
export const SCENES: { value: SampleScene; label: string }[] = [
  { value: 'normal', label: '綜合樣例' }, { value: 'zero', label: '全零分（距離項停用）' },
  { value: 'config', label: '流量均衡待配置' }, { value: 'sample', label: '訂單樣本不足' },
  { value: 'stale', label: '指標已過期' }, { value: 'deduction', label: '存在扣分解權' },
  { value: 'error', label: '計分任務異常' },
]
export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  ranked: '正常參與', bottom: '置後展示', filtered: '已過濾', pending: '待補資料',
}
export const STATUS_META = {
  scored: { label: '已得分', color: 'success' }, deducted: { label: '已扣分', color: 'error' },
  missed: { label: '未得分', color: 'default' },
  disabled: { label: '已停用', color: 'default' }, inapplicable: { label: '不適用', color: 'default' },
  missing: { label: '待補資料', color: 'warning' }, insufficient: { label: '樣本不足', color: 'warning' },
  stale: { label: '已過期', color: 'error' }, error: { label: '執行異常', color: 'error' },
} as const

/** 名称和编码对齐当前目录；不复制配置编辑器或把旧沙盘当算分来源。 */
export const RULE_CATALOG: { code: string; name: string; dimension: Dimension; source: string; metric: string; window: string }[] = [
  { code: 'COM_01', name: '滿額立減', dimension: 'commercial', source: '活動報名與優惠資料', metric: '報名、門檻、優惠金額及客單價', window: '活動有效期' },
  { code: 'COM_02', name: '減免運費', dimension: 'commercial', source: '運費活動', metric: '報名、免運門檻及護欄', window: '活動有效期' },
  { code: 'COM_03', name: '進店領券', dimension: 'commercial', source: '門店券活動', metric: '客單價50 MOP；門檻25 MOP；優惠10 MOP', window: '活動有效期' },
  { code: 'COM_04', name: '門店新客券', dimension: 'commercial', source: '新客券活動', metric: '報名、門檻與優惠力度', window: '活動有效期' },
  { code: 'COM_05', name: '收藏送券', dimension: 'commercial', source: '收藏券活動', metric: '報名、門檻與優惠力度', window: '活動有效期' },
  { code: 'COM_06', name: '平台會員紅包', dimension: 'commercial', source: '會員紅包活動', metric: '商家額外出資與最高命中檔位', window: '活動有效期' },
  { code: 'COM_07', name: '平台官方神券', dimension: 'commercial', source: '官方券活動', metric: '品牌適用、報名、門檻與優惠力度', window: '活動有效期' },
  { code: 'COM_10', name: '金字招牌(廣告)', dimension: 'commercial', source: '購買標籤與投放期', metric: '有效標籤去重、投放有效期', window: '投放有效期' },
  { code: 'COM_SLOT', name: '時段推薦', dimension: 'commercial', source: '時段推薦購買記錄（待接）', metric: '購買狀態與投放有效期', window: '投放有效期' },
  { code: 'STB_01', name: '主營時段加分', dimension: 'store', source: '算法庫分時段配置與業務系統當前時段', metric: '當前時段與該時段配置分值', window: '2026-10-30 午餐' },
  { code: 'STB_04', name: '門店標籤', dimension: 'store', source: '門店標籤購買訂單（待接）', metric: '門店當前標籤與命中檔位', window: '評估時刻' },
  { code: 'STB_02', name: '營業狀態', dimension: 'store', source: '門店營業狀態', metric: '營業中', window: '評估時刻' },
  { code: 'STB_03', name: '店鋪綜合分', dimension: 'store', source: '門店綜合評分', metric: '業務綜合分與命中檔位', window: '最新傳入值' },
  { code: 'STB_05', name: '出餐準時率', dimension: 'store', source: '準時率統計任務', metric: '準時率與有效樣本數', window: '2026-10-23 ～ 2026-10-30' },
  { code: 'STB_06', name: '自動接單', dimension: 'store', source: '店端接單設定', metric: '門店自動接單已開啟', window: '評估時刻' },
  { code: 'STB_07', name: '出餐時長', dimension: 'store', source: '店端自動校正狀態', metric: '門店自動校正已開啟', window: '評估時刻' },
  { code: 'STB_08', name: '訂單取消率', dimension: 'store', source: '外賣訂單統計', metric: '取消率1%；120筆外賣樣本（不含自取）', window: '2026-09-30 ～ 2026-10-30' },
  { code: 'STB_09', name: '活動加分', dimension: 'store', source: '真實活動/報名（待接）', metric: '進行中活動；按活動獨立累加', window: '活動有效期' },
  { code: 'PLT_01', name: '距離衰減', dimension: 'platform', source: '用戶點與門店點', metric: 'WGS84示例球面距離（公里）', window: '評估時刻' },
  { code: 'PLT_03', name: '流量均衡', dimension: 'platform', source: '訂單統計與大區梯度', metric: '外賣＋自取；取消及退款不納入；未被排除', window: '2026-10-23 ～ 2026-10-30' },
]

const CENTERS: Coordinate[] = [
  { lat: 22.211, lng: 113.555 }, { lat: 22.203, lng: 113.55 }, { lat: 22.194, lng: 113.541 },
  { lat: 22.187, lng: 113.552 }, { lat: 22.204, lng: 113.572 }, { lat: 22.157, lng: 113.552 },
  { lat: 22.165, lng: 113.571 }, { lat: 22.145, lng: 113.555 }, { lat: 22.144, lng: 113.567 },
  { lat: 22.133, lng: 113.546 }, { lat: 22.119, lng: 113.574 },
]
const NAMES = ['巷口茶記', '海風小館', '暖心飯堂', '晨光烘焙', '南岸咖啡', '一碗麵家']

/** 仅在固定样例初始化时使用，绝不接受用户坐标进行业务计分。 */
function sampleDistance(from: Coordinate, to: Coordinate): number {
  const rad = Math.PI / 180
  const a = Math.sin((to.lat - from.lat) * rad / 2) ** 2
    + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin((to.lng - from.lng) * rad / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

function summarize(row: StoreResult): StoreResult {
  // 占比（权重）配置模块已停用，维度得分只保留原始分合计，不再归一或乘权重。
  row.dimensions = DIMENSIONS.map(dim => {
    const rules = row.rules.filter(rule => rule.dimension === dim.key && rule.ruleStatus === 'enabled')
    const rawScore = rules.some(rule => rule.rawScore == null) ? null : rules.reduce((sum, rule) => sum + (rule.rawScore ?? 0), 0)
    return { dimension: dim.key, rawScore }
  })
  row.totalScore = row.eligibility !== 'ranked' || row.dimensions.some(dim => dim.rawScore == null)
    ? null : row.dimensions.reduce((sum, dim) => sum + (dim.rawScore ?? 0), 0)
  return row
}

function rankSnapshot(stores: StoreResult[]): StoreResult[] {
  const ranked = stores.filter(s => s.eligibility === 'ranked' && s.totalScore != null).sort((a, b) =>
    // 样例保留六位排序精度，避免展示构造产生的浮点尾差破坏同分场景。
    Number(b.totalScore!.toFixed(6)) - Number(a.totalScore!.toFixed(6)) || b.shopRating - a.shopRating
    || b.orders30d - a.orders30d || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.storeId.localeCompare(b.storeId))
  const counts = new Map<Region, number>()
  for (const s of stores) { s.globalRank = null; s.displayPosition = null; s.regionRank = null; s.rankPopulation = ranked.length; s.regionPopulation = 0; s.sameScore = false }
  for (const s of ranked) counts.set(s.regionId, (counts.get(s.regionId) ?? 0) + 1)
  const positions = new Map<Region, number>()
  const scores = new Map<string, number>()
  ranked.forEach(s => scores.set(s.totalScore!.toFixed(6), (scores.get(s.totalScore!.toFixed(6)) ?? 0) + 1))
  ranked.forEach((s, i) => {
    positions.set(s.regionId, (positions.get(s.regionId) ?? 0) + 1)
    s.globalRank = i + 1
    s.displayPosition = i + 1
    s.regionRank = positions.get(s.regionId)!
    s.regionPopulation = counts.get(s.regionId)!
    s.sameScore = (scores.get(s.totalScore!.toFixed(6)) ?? 0) > 1
  })
  // 置后展示不参与竞争排名，但有确定的展示位次（排在全部正常参排门店之后）。
  const bottom = stores.filter(s => s.eligibility === 'bottom')
  bottom.forEach((s, i) => { s.displayPosition = ranked.length + i + 1 })
  return [...ranked, ...bottom, ...stores.filter(s => s.displayPosition == null)]
}

function baseStore(index: number, brand: AppType): StoreResult {
  const regionId = (index >= 90 && index <= 103 ? Region.KOKSAA : 2 + (index - 1) % 10) as Region
  const center = CENTERS[regionId - 1]
  const coordinate = { lat: center.lat + (index % 5) * 0.0002, lng: center.lng + (index % 3) * 0.0002 }
  const distanceKm = sampleDistance(POINTS.A, coordinate)
  const eligibility: Eligibility = index <= 108 ? 'ranked' : index <= 112 ? 'pending' : index <= 116 ? 'bottom' : 'filtered'
  const storeId = `DEMO-${String(index).padStart(3, '0')}`
  const rules: RuleResult[] = RULE_CATALOG.map(rule => ({
    ruleCode: rule.code, name: rule.name, dimension: rule.dimension, ruleStatus: 'enabled', matchStatus: 'scored',
    reasonCode: 'DEMO_MATCH', reason: '固定展示樣例已命中；不是門店真實匹配結果', metric: rule.metric,
    metricValue: rule.metric, unit: null, inputs: [], matchedTier: null,
    window: rule.window, windowStart: null, windowEnd: null, sampleSize: rule.code === 'STB_08' ? 120 : null,
    rawScore: 0, effectiveMax: 100,
    sourceRefs: [`演示資料：${rule.source}（無真實業務單號）`], observedAt: DATA_TIME,
    expression: '固定分項樣例；配置滿分100僅用於展示對賬，不代表正式檔位。',
  }))
  // 门店新客券/收藏送券/平台官方神券：与满额立减、进店领券同构——活动平台回传生效券活动，取最高优惠档的券门槛与券面额匹配自然流量梯度
  const newCustomer = rules.find(r => r.ruleCode === 'COM_04')!
  Object.assign(newCustomer, {
    activity: { activityId: 'ACT-20261026-0008', activityName: '新客券·首單禮', tiers: [{ threshold: 20, discount: 6 }, { threshold: 40, discount: 16 }], matchedTier: { threshold: 40, discount: 16 }, validFrom: '2026-10-26', validTo: '2026-11-12' },
    parts: [{ label: '報名分', score: 10, reference: '活動已報名，固定加分' }, { label: '門檻分', score: 12, reference: '使用門檻 ÷ 門店客單價 = 40 ÷ 50 = 0.8倍 → 命中#3梯度 (+12)' }, { label: '力度分', score: 45, reference: '立減金額 ÷ 計價基數 = 16 ÷ max(50,40) = 32% → 命中#2梯度 (+45)' }],
    guard: { triggered: false, rule: '券門檻不得高於門店客單價 2 倍（50 MOP × 2 = 100 MOP）', enrollScoreSuspended: false },
    metric: '已匹配生效券活動，取最高優惠檔 滿40減16；門店客單價 50 MOP', rawScore: 67, effectiveMax: 90, expression: '10 + 12 + 45 = 67；券門檻與券面額來自活動平台最高優惠檔回傳',
  })
  const favoriteCoupon = rules.find(r => r.ruleCode === 'COM_05')!
  Object.assign(favoriteCoupon, {
    activity: { activityId: 'ACT-20261018-0002', activityName: '收藏送券·粉絲禮', tiers: [{ threshold: 20, discount: 5 }], matchedTier: { threshold: 20, discount: 5 }, validFrom: '2026-10-18', validTo: '2026-11-06' },
    parts: [{ label: '報名分', score: 10, reference: '活動已報名，固定加分' }, { label: '門檻分', score: 16, reference: '使用門檻 ÷ 門店客單價 = 20 ÷ 50 = 0.4倍 → 命中#2梯度 (+16)' }, { label: '力度分', score: 18, reference: '立減金額 ÷ 計價基數 = 5 ÷ max(50,20) = 10% → 命中#4梯度 (+18)' }],
    guard: { triggered: false, rule: '券門檻不得高於門店客單價 2 倍（50 MOP × 2 = 100 MOP）', enrollScoreSuspended: false },
    metric: '已匹配生效券活動，取最高優惠檔 滿20減5；門店客單價 50 MOP', rawScore: 44, effectiveMax: 90, expression: '10 + 16 + 18 = 44；券門檻與券面額來自活動平台最高優惠檔回傳',
  })
  const godCoupon = rules.find(r => r.ruleCode === 'COM_07')!
  Object.assign(godCoupon, {
    activity: { activityId: 'ACT-20261030-0015', activityName: '官方神券·雙十一預熱', tiers: [{ threshold: 25, discount: 9 }, { threshold: 30, discount: 18 }], matchedTier: { threshold: 30, discount: 18 }, validFrom: '2026-10-30', validTo: '2026-11-11' },
    parts: [{ label: '報名分', score: 10, reference: '活動已報名，固定加分' }, { label: '門檻分', score: 12, reference: '使用門檻 ÷ 門店客單價 = 30 ÷ 50 = 0.6倍 → 命中#3梯度 (+12)' }, { label: '力度分', score: 45, reference: '立減金額 ÷ 計價基數 = 18 ÷ max(50,30) = 36% → 命中#2梯度 (+45)' }],
    guard: { triggered: false, rule: '券門檻不得高於門店客單價 2 倍（50 MOP × 2 = 100 MOP）', enrollScoreSuspended: false },
    metric: '已匹配生效券活動，取最高優惠檔 滿30減18；門店客單價 50 MOP', rawScore: 67, effectiveMax: 90, expression: '10 + 12 + 45 = 67；券門檻與券面額來自活動平台最高優惠檔回傳',
  })
  // 平台会员红包：对齐算法库真实规则（MemberBonusScoreConfig）——报名即给报名分；商家加码金额按档位由低到高取达到的最后一档，命中即停不累加
  const memberBonus = rules.find(r => r.ruleCode === 'COM_06')!
  Object.assign(memberBonus, {
    activity: { activityId: 'ACT-20261025-0009', activityName: '會員紅包·商家加碼', tiers: [{ threshold: 20, discount: 0 }], matchedTier: { threshold: 20, discount: 0 }, matchedText: '商家加碼 20 元', validFrom: '2026-10-25', validTo: '2026-11-15' },
    parts: [{ label: '報名分', score: 10, reference: '已報名會員紅包活動，報名即給分' }, { label: '加碼分', score: 20, reference: '商家加碼 20 元 → 命中#3檔（≥20 元，+20）' }],
    metric: '已報名生效活動；商家加碼 20 元查檔', rawScore: 30, effectiveMax: 60, expression: '10 + 20 = 30；加碼檔由低到高取達到的最後一檔，命中即停不累加',
  })
  // 金字招牌(广告)：对齐真实规则（SignboardScoreConfig）——标签枚举复用系统级 SIGNBOARD_LABELS 清单（禁止内联重复定义），
  // 商家在广告销售菜单按标签购买，每标签对应一笔订单（订单号+投放起止）；只抓取支付成功且已生效的有效期内订单，过期不抓取不展示不加分，多标签逐个累加（卡内不显状态）
  const signboard = rules.find(r => r.ruleCode === 'COM_10')!
  Object.assign(signboard, {
    parts: [
      { label: signboardLabelText('hot'), score: 10, reference: '訂單號 AD-20261001-0007', validFrom: '2026-10-01', validTo: '2026-10-31' },
      { label: signboardLabelText('rating'), score: 10, reference: '訂單號 AD-20261020-0013', validFrom: '2026-10-20', validTo: '2026-11-19' },
    ],
    metric: '僅抓取支付成功且已生效的 2 筆金字招牌訂單：熱門、好評；過期訂單不抓取不展示不加分', rawScore: 20, effectiveMax: 70, expression: '10 + 10 = 20；僅投放期內的訂單逐個累加，每檔分值取算法庫標籤分值配置（10 分/標籤）',
  })
  // 时段推荐：与金字招牌同订单口径——只抓取支付成功且已生效的订单加分；投放期内固定加分，不区分购买时段数量、不累加
  const timeSlot = rules.find(r => r.ruleCode === 'COM_SLOT')!
  Object.assign(timeSlot, {
    parts: [{ label: '時段推薦固定加分', score: TIME_SLOT_AD_DEFAULT_SCORE, reference: '訂單號 AD-20261028-0021', validFrom: '2026-10-28', validTo: '2026-11-27' }],
    metric: '僅抓取支付成功且已生效的 1 筆時段推薦訂單；過期訂單不抓取不展示不加分', rawScore: TIME_SLOT_AD_DEFAULT_SCORE, effectiveMax: TIME_SLOT_AD_DEFAULT_SCORE, expression: '購買即得固定加分 50；不區分購買時段數量、不累加，僅生效日期內訂單有效',
  })
  // 门店标签计分：与金字招牌广告同口径——买标签生成订单，只抓取支付成功且已生效的有效期内订单加分；标签枚举复用 STORE_LABELS 清单，分值取算法库配置（金牌 20）
  const storeLabel = rules.find(r => r.ruleCode === 'STB_04')!
  Object.assign(storeLabel, {
    parts: [{ label: storeLabelText('gold'), score: 20, reference: '訂單號 SL-20261015-0006', validFrom: '2026-10-15', validTo: '2026-11-14' }],
    metric: '僅抓取支付成功且已生效的 1 筆門店標籤購買訂單：金牌；過期訂單不抓取不展示不加分', rawScore: 20, effectiveMax: 40, expression: '購買標籤即按算法庫配置分值加分（金牌 20 分）；僅有效期內訂單有效',
  })
  // 主營時段：已改为按五餐段独立配分（不再是单一固定加分），当前时段由业务系统传入、命中一檔即停不累加。
  // 演示快照按算法库默认配置（仅午餐一档 60 分）计入，其余时段未配置 → 不得分，跟界面口径一致。
  const mainTimeSlot = rules.find(r => r.ruleCode === 'STB_01')!
  Object.assign(mainTimeSlot, {
    parts: [{ label: '午餐（當前時段）', score: 60, reference: '算法庫已配置：早餐/下午茶/晚餐/宵夜未配置，午餐 60 分' }],
    metric: '當前時段 12:00 → 午餐；該時段已配置加分', rawScore: 60, effectiveMax: 100,
    expression: '當前時段命中午餐檔 +60；命中一檔即停不累加，未配置的時段不加分',
  })
  // 店铺综合分：算法库按分数配档（DEFAULT_STAR_TIER_BANDS：5星+50/4.5+40/4+30/3.5+15/3+5，从高到低命中一档即停，低3星不加分）
  // 展示商家当前综合分、命中档位与对应得分；分数由业务系统实时传入，取最新传入值
  const shopRating = index === 11 ? 4.5 : 4.6
  const starBand = DEFAULT_STAR_TIER_BANDS.find(band => shopRating >= band.star)
  const shopScore = rules.find(r => r.ruleCode === 'STB_03')!
  Object.assign(shopScore, {
    parts: [{ label: '檔位加分', score: starBand?.score ?? 0, status: starBand ? undefined : '低於最低檔', reference: `當前綜合分 ${shopRating} 星 → 命中≥${starBand?.star ?? 3}星檔（+${starBand?.score ?? 0}）` }],
    metric: `門店當前綜合分 ${shopRating} 星（最新傳入值）`, rawScore: starBand?.score ?? 0, effectiveMax: DEFAULT_STAR_TIER_BANDS[0].score, expression: `${shopRating} 星由高到低比對檔位，命中≥${starBand?.star ?? 3}星檔即停不累加`,
  })
  // 出餐准时率：算法库按准时率配档（DEFAULT_ONTIME_RATE_BANDS：≥100%+60/≥95%+50/≥90%+40/≥80%+25/≥70%+10，从高到低命中一档即停，低于最低档不得分）
  // 展示商家当前准时率、命中档位与对应得分；准时率由定时任务计算后传入，非实时传数
  const ontimeRate = 98.5
  const ontimeBand = DEFAULT_ONTIME_RATE_BANDS.find(band => ontimeRate >= band.rate)
  const ontime = rules.find(r => r.ruleCode === 'STB_05')!
  Object.assign(ontime, {
    parts: [{ label: '檔位加分', score: ontimeBand?.score ?? 0, status: ontimeBand ? undefined : '低於最低檔', reference: `當前準時率 ${ontimeRate}% → 命中≥${ontimeBand?.rate ?? 70}%檔（+${ontimeBand?.score ?? 0}）` }],
    metric: `商家當前準時率 ${ontimeRate}%（定時任務傳入）`, rawScore: ontimeBand?.score ?? 0, effectiveMax: DEFAULT_ONTIME_RATE_BANDS[0].score, expression: `${ontimeRate}% 由高到低比對檔位，命中≥${ontimeBand?.rate ?? 70}%檔即停不累加`,
  })
  // 自动接单：校验店端是否开启自动接单，开启即按算法库配置分值加分（AUTO_ACCEPT_DEFAULT_SCORE），未开启不加分
  const autoAccept = rules.find(r => r.ruleCode === 'STB_06')!
  Object.assign(autoAccept, {
    parts: [{ label: '自動接單加分', score: AUTO_ACCEPT_DEFAULT_SCORE, reference: '店端已開啟自動接單 → 按算法庫配置得分' }],
    metric: '店端已開啟自動接單（開關命中）', rawScore: AUTO_ACCEPT_DEFAULT_SCORE, effectiveMax: AUTO_ACCEPT_DEFAULT_SCORE, expression: '開啟自動接單即得固定加分；不按拒絕單量計罰',
  })
  // 出餐时长：校验是否开启自动校正，开启即按算法库配置分值加分（MEAL_TIME_DEFAULT_SCORE）
  const mealTime = rules.find(r => r.ruleCode === 'STB_07')!
  Object.assign(mealTime, {
    parts: [{ label: '自動校正加分', score: MEAL_TIME_DEFAULT_SCORE, reference: '已開啟自動校正 → 按算法庫配置得分' }],
    metric: '店端出餐時長自動校正已開啟（開關命中）', rawScore: MEAL_TIME_DEFAULT_SCORE, effectiveMax: MEAL_TIME_DEFAULT_SCORE, expression: '開啟自動校正即得固定加分，命中一次不累加',
  })
  // 订单取消率：算法库先做单量校验（DEFAULT_CANCEL_MIN_ORDERS=30 单，只统计外卖不含自取，用户/商家取消均计入），
  // 达门槛才计算取消率并按上界升序查档（≤1%+30/≤3%+20/≤5%+10，命中即停，高于最高档不加分）；未达门槛不纳入计分
  const cancelOrders = 2
  const cancelSample = 120
  const cancelEnough = cancelSample >= DEFAULT_CANCEL_MIN_ORDERS
  const cancelRate = Math.round(cancelOrders / cancelSample * 10000) / 100
  const cancelBand = cancelEnough ? DEFAULT_CANCEL_RATE_BANDS.find(band => cancelRate <= band.maxRate) : undefined
  const cancelRateRule = rules.find(r => r.ruleCode === 'STB_08')!
  Object.assign(cancelRateRule, {
    parts: [{ label: '檔位加分', score: cancelBand?.score ?? 0, status: cancelBand ? undefined : cancelEnough ? '高於最高檔' : '樣本不足', reference: cancelEnough ? `取消 ${cancelOrders} 單 ÷ 外賣樣本 ${cancelSample} 單 = ${cancelRate}% → ${cancelBand ? `命中≤${cancelBand.maxRate}%檔（+${cancelBand.score}）` : '高於最高檔不加分'}` : `外賣樣本 ${cancelSample} 單 < 門檻 ${DEFAULT_CANCEL_MIN_ORDERS} 單，不納入計分` }],
    sampleSize: cancelSample, metric: `取消率 ${cancelRate}%（外賣 ${cancelSample} 單，不含自取；門檻 ${DEFAULT_CANCEL_MIN_ORDERS} 單已達成）`, rawScore: cancelBand?.score ?? 0, effectiveMax: DEFAULT_CANCEL_RATE_BANDS[0].score, expression: cancelBand ? `${cancelRate}% 按上界升序命中≤${cancelBand.maxRate}%檔即停不累加` : '未命中任何檔位，本項 0 分',
  })
  // 活动加分：只抓取已报名且进行中的活动独立加分、可累加；报名未开始的展示但不加分；已过期与已取消的活动不抓取、不展示
  const activityScore = rules.find(r => r.ruleCode === 'STB_09')!
  Object.assign(activityScore, {
    parts: [
      { label: '午餐好店', score: 30, status: '進行中', reference: '活動ID ACT-20261001-0101', validFrom: '2026-10-20', validTo: '2026-11-10' },
      { label: '秋日餐飲節', score: 20, status: '進行中', reference: '活動ID ACT-20261020-0102', validFrom: '2026-10-25', validTo: '2026-11-30' },
      { label: '冬日預熱', score: 0, status: '已報名，活動未開始，不加分', reference: '活動ID ACT-20261120-0103', validFrom: '2026-11-20', validTo: '2026-12-31' },
    ],
    metric: '2 個已報名且進行中的活動獨立計分可累加；報名未開始不加分；已過期與已取消活動不抓取不展示', rawScore: 50, effectiveMax: 100, expression: '30 + 20 = 50；各活動獨立加分、可累加，僅已報名且進行中計分',
  })
  // 流量均衡：统计口径与区域梯度取算法库 PLT_03.trafficBalanceConfig（统计周期/刷新间隔/订单类型/退款口径）；按订单量匹配档位，订单量越高加分越少
  // 算法库默认档的上界留空待运营校准，演示按分值降序补 20/40/60/80 上界以便体验查档过程
  const balanceCfg = structuredClone(DEFAULT_TRAFFIC_BALANCE_CONFIG)
  const balanceOrders = 45
  const balanceBands = balanceCfg.regions[regionId <= 5 ? 'MACAU' : 'TAIPA'].map((band, i) => ({ ...band, maxOrders: band.maxOrders ?? (i + 1) * 20 }))
  const balanceBand = balanceBands.find(band => band.maxOrders != null && balanceOrders <= band.maxOrders)
  const balance = rules.find(r => r.ruleCode === 'PLT_03')!
  Object.assign(balance, {
    parts: [{ label: '訂單量檔位加分', score: balanceBand?.score ?? 0, status: balanceBand ? undefined : '超出最高檔', reference: `滾動近 ${balanceCfg.statDays} 天 ${balanceOrders} 單 → 命中≤${balanceBand?.maxOrders ?? '—'}單檔（+${balanceBand?.score ?? 0}）` }],
    sampleSize: balanceOrders, metric: `滾動近 ${balanceCfg.statDays} 天訂單 ${balanceOrders} 單，每 ${balanceCfg.refreshMinutes} 分鐘重算`, rawScore: balanceBand?.score ?? 0, effectiveMax: balanceBands[0]?.score ?? 80, expression: `訂單量越高加分越少：${balanceOrders} 單命中≤${balanceBand?.maxOrders ?? '—'}單檔即停不累加`,
  })
  if (brand === AppType.MFOOD) Object.assign(rules.find(r => r.ruleCode === 'COM_07')!, {
    ruleStatus: 'inapplicable', matchStatus: 'inapplicable', reasonCode: 'BRAND_NOT_APPLICABLE', reason: 'mFood 不適用平台官方神券', rawScore: 0, effectiveMax: 0, parts: [{ label: '報名分', score: 0, status: '不適用', reference: 'mFood 不適用平台官方神券' }, { label: '門檻分', score: 0, reference: '品牌不適用，不查檔' }, { label: '力度分', score: 0, reference: '品牌不適用，不查檔' }], expression: '品牌不適用：本項不計分',
  })
  const coupon = rules.find(r => r.ruleCode === 'COM_03')!
  // 进店领券：与满额立减同构——活动平台回传生效券活动，取最高优惠档的券门槛与券面额匹配自然流量梯度
  Object.assign(coupon, { rawScore: 56, effectiveMax: 90, activity: { activityId: 'ACT-20261022-0005', activityName: '進店領券·茶飲季', tiers: [{ threshold: 15, discount: 3 }, { threshold: 25, discount: 10 }], matchedTier: { threshold: 25, discount: 10 }, validFrom: '2026-10-22', validTo: '2026-11-08' }, guard: { triggered: false, rule: '券門檻不得高於門店客單價 2 倍（50 MOP × 2 = 100 MOP）', enrollScoreSuspended: false }, parts: [{ label: '報名分', score: 10, reference: '活動已報名，固定加分' }, { label: '門檻分', score: 16, reference: '使用門檻 ÷ 門店客單價 = 25 ÷ 50 = 0.5倍 → 命中#2梯度 (+16)' }, { label: '力度分', score: 30, reference: '立減金額 ÷ 計價基數 = 10 ÷ max(50,25) = 20% → 命中#3梯度 (+30)' }], metric: '已匹配生效券活動，取最高優惠檔 滿25減10；門店客單價 50 MOP', expression: '10 + 16 + 30 = 56；券門檻與券面額來自活動平台最高優惠檔回傳' })
  // 满额立减：演示活动平台回传的生效活动，取优惠最高档匹配自然流量计分条件；子项展示算法库命中梯度与公式
  const fullReduction = rules.find(r => r.ruleCode === 'COM_01')!
  Object.assign(fullReduction, {
    activity: { activityId: 'ACT-20261024-0007', activityName: '滿額立減·秋季專場', tiers: [{ threshold: 60, discount: 25 }, { threshold: 100, discount: 45 }], matchedTier: { threshold: 100, discount: 45 }, validFrom: '2026-10-24', validTo: '2026-11-02' },
    parts: [{ label: '報名分', score: 10, reference: '活動已報名，固定加分' }, { label: '門檻分', score: 2, reference: '使用門檻 ÷ 門店客單價 = 100 ÷ 50 = 2.0倍 → 命中#6梯度 (+2)' }, { label: '力度分', score: 45, reference: '立減金額 ÷ 計價基數 = 45 ÷ 100 = 45% → 命中#2梯度 (+45)' }],
    guard: { triggered: false, rule: '活動門檻不得高於客單價 2 倍（50 MOP × 2 = 100 MOP）', enrollScoreSuspended: false },
    metric: '已匹配生效活動，取最高優惠檔 滿100減45', rawScore: 57, effectiveMax: 100, expression: '10 + 2 + 45 = 57；梯度命中來自算法庫自然流量配置',
  })
  // 减免运费：对齐算法库真实规则（organicTrafficConfig 的 FreeShippingScoreConfig）——报名分20报名即给；
  // 门槛分按使用门槛金额查运营手配置档位（0元+20/30元+15/50元+10/80元+5，升序命中即停）；围栏=有效门槛上限80元（默认跟随末档），超限空转且报名分停发
  const freeShipping = rules.find(r => r.ruleCode === 'COM_02')!
  Object.assign(freeShipping, {
    activity: { activityId: 'ACT-20261020-0003', activityName: '減免運費·外賣免運', tiers: [{ threshold: 30, discount: 6 }], matchedTier: { threshold: 30, discount: 6 }, validFrom: '2026-10-20', validTo: '2026-11-10' },
    parts: [{ label: '報名分', score: 20, reference: '已報名減免運費活動，報名即給分' }, { label: '門檻分', score: 15, reference: '減免門檻 30 元 → 命中#2檔（≤30 元，+15）' }],
    guard: { triggered: false, rule: '減免門檻不得超過有效上限 80 元（門檻檔末檔），超限視為空轉活動', enrollScoreSuspended: false },
    metric: '已報名生效活動；減免門檻 30 元查檔', rawScore: 35, effectiveMax: 40, expression: '20 + 15 = 35；門檻檔位由運營人工按金額配置，命中即停',
  })
  const distance = rules.find(r => r.ruleCode === 'PLT_01')!
  distance.rawScore = Math.max(0, 100 - 5 * distanceKm)
  distance.metric = `${distanceKm.toFixed(4)} km；滿分100；每公里扣5分`
  distance.expression = `max(0, 100 − 5 × ${distanceKm.toFixed(4)})`
  const missed = index % 9 === 0 ? rules.find(r => r.ruleCode === 'COM_05') : undefined
  if (missed) Object.assign(missed, { matchStatus: 'missed', reasonCode: 'NOT_ENROLLED', reason: '樣例門店未報名收藏送券', metric: '未報名', rawScore: 0, parts: [{ label: '報名分', score: 0, status: '未報名', reference: '未報名，報名分不給' }, { label: '門檻分', score: 0, reference: '未報名，不查檔' }, { label: '力度分', score: 0, reference: '未報名，不查檔' }], expression: '未報名：本項 0 分' })
  if (index === 91) Object.assign(fullReduction, { matchStatus: 'missed', reasonCode: 'GUARD_EXCEEDED', reason: '門檻高於客單價2倍，報名分停發不保留', metric: '門檻150 MOP；客單價50 MOP', rawScore: 0, activity: { activityId: 'ACT-20261024-0011', activityName: '滿額立減·萬聖場', tiers: [{ threshold: 150, discount: 70 }], matchedTier: { threshold: 150, discount: 70 }, validFrom: '2026-10-28', validTo: '2026-11-04' }, guard: { triggered: true, rule: '門檻 150 MOP 高於客單價 50 MOP 的 2 倍上限', enrollScoreSuspended: true }, parts: [{ label: '報名分', score: 0, status: '已停發', reference: '圍欄觸發：報名分停發' }, { label: '門檻分', score: 0, status: '超上限', reference: '使用門檻 ÷ 門店客單價 = 150 ÷ 50 = 3.0倍 > 2倍圍欄上限，未命中梯度' }, { label: '力度分', score: 0, reference: '圍欄觸發，本項不計分' }], expression: '圍欄觸發：報名分停發，本項 0 分' })
  // 减免运费围栏触发样例：门槛 100 元超有效上限 80 元，空转活动不计分
  if (index === 93) Object.assign(freeShipping, { matchStatus: 'missed', reasonCode: 'GUARD_EXCEEDED', reason: '減免門檻 100 元超過有效上限 80 元，空轉活動報名分停發', metric: '減免門檻100元；上限80元', rawScore: 0, activity: { activityId: 'ACT-20261028-0012', activityName: '減免運費·高門檻免運', tiers: [{ threshold: 100, discount: 10 }], matchedTier: { threshold: 100, discount: 10 }, validFrom: '2026-10-28', validTo: '2026-11-05' }, guard: { triggered: true, rule: '減免門檻 100 元超過有效上限 80 元（門檻檔末檔）', enrollScoreSuspended: true }, parts: [{ label: '報名分', score: 0, status: '已停發', reference: '護欄觸發：空轉活動不發報名分' }, { label: '門檻分', score: 0, status: '超上限', reference: '減免門檻 100 元 > 上限 80 元，未命中任何檔位' }], expression: '護欄觸發：報名分停發，本項 0 分' })
  if (index === 92) Object.assign(rules.find(r => r.ruleCode === 'STB_09')!, { ruleStatus: 'disabled', matchStatus: 'disabled', reasonCode: 'RULE_DISABLED', reason: '此樣例活動加分已停用，不計分母', rawScore: 0, effectiveMax: 0, parts: undefined })

  // 为原型构造递减的基线快照；占比配置已停用，总分＝三个维度原始分直接相加。
  // 基线需高于显式定分项的固定分合计（活动/券/开关类约 700），否则比例填充池会被压成负分。
  // 只有固定样例工厂可以使用本分配式，页面无法传入指标或定位调用它。
  const targetTotal = 1000 - index * 2
  let fixed = 0
  let coefficient = 0
  // 显式定分的活动/券类规则不再参与比例填充池，保证子项合计恒等于本项得分
  const explicitFixed = new Set([coupon, fullReduction, freeShipping, newCustomer, favoriteCoupon, godCoupon, memberBonus, signboard, timeSlot, storeLabel, shopScore, ontime, autoAccept, mealTime, cancelRateRule, activityScore, balance])
  for (const r of rules.filter(rule => rule.ruleStatus === 'enabled')) {
    if (r === distance || explicitFixed.has(r) || r.matchStatus !== 'scored') fixed += r.rawScore ?? 0
    else coefficient += r.effectiveMax ?? 0
  }
  const sampleRatio = coefficient ? (targetTotal - fixed) / coefficient : 0
  rules.forEach(r => { if (r.ruleStatus === 'enabled' && r.matchStatus === 'scored' && r !== distance && !explicitFixed.has(r)) r.rawScore = (r.effectiveMax ?? 0) * sampleRatio })
  const reason = eligibility === 'bottom' ? '休息一會／爆單暫停，置後展示，不參與正常得分排名'
    : eligibility === 'filtered' ? '休息打烊，已被候選過濾' : eligibility === 'pending' ? '缺少可信門店座標，完整計分尚未就緒' : '正常營業，參與本次樣例排名'
  if (eligibility === 'pending') Object.assign(distance, { rawScore: null, matchStatus: 'missing', reasonCode: 'COORDINATE_MISSING', reason, metric: '門店座標缺失', expression: '不可計算' })
  if (eligibility === 'bottom' || eligibility === 'filtered') Object.assign(rules.find(r => r.ruleCode === 'STB_02')!, { rawScore: null, matchStatus: 'inapplicable', reasonCode: 'STORE_INELIGIBLE', reason, metric: reason })
  return summarize({ storeId, storeCode: storeId, storeName: index === 90 ? '黑沙環茶記 · 示範店' : `${NAMES[index % NAMES.length]} · 示範${String(index).padStart(3, '0')}店`,
    merchantId: `GROUP-${Math.ceil(index / 3)}`, merchantName: `演示商家 ${String(Math.ceil(index / 3)).padStart(2, '0')}`,
    regionId, category: ['茶餐廳', '餐飲小館', '咖啡烘焙'][index % 3], coordinate: eligibility === 'pending' ? null : coordinate,
    eligibility, eligibilityReason: reason, rankingBucket: eligibility === 'ranked' ? 'normal' : eligibility === 'bottom' ? 'bottom' : 'excluded',
    totalScore: null, globalRank: null, displayPosition: null, regionRank: null, rankPopulation: 0, regionPopulation: 0, sameScore: false,
    shopRating: shopRating, orders30d: 300 - index, distanceKm: eligibility === 'pending' ? null : distanceKm, dimensions: [], rules,
  })
}

function createSnapshot(brand: AppType, point: PointId, scene: SampleScene, mode: SimulationMode): ScoreSnapshot {
  const stores = Array.from({ length: 120 }, (_, i) => baseStore(i + 1, brand))
  for (const store of stores) {
    if (point === 'B' && store.coordinate) {
      store.distanceKm = sampleDistance(POINTS.B, store.coordinate)
      const r = store.rules.find(rule => rule.ruleCode === 'PLT_01')!
      r.rawScore = Math.max(0, 100 - 5 * store.distanceKm)
      r.metric = `${store.distanceKm.toFixed(4)} km；滿分100；每公里扣5分`
      r.expression = `max(0, 100 − 5 × ${store.distanceKm.toFixed(4)})`
      if (mode === 'full') {
        // 完整场景的「分项变化 + 资格变化」样例改由流量均衡驱动：配送範圍已下架，
        // 而区域梯度与「排除商家名单」本就是流量均衡（PLT_03）的配置项，不需要新造口径。
        const balance = store.rules.find(rule => rule.ruleCode === 'PLT_03')!
        if (store.regionId === Region.KOKSAA) {
          Object.assign(balance, { matchStatus: 'missed', reasonCode: 'BALANCE_BAND_MISSED', rawScore: 0,
            metric: '完整場景：該大區梯度未覆蓋當前訂單量', reason: '完整場景樣例變更流量均衡命中檔位', expression: '未命中任何檔位：本項 0 分' })
        }
        if (store.storeId === 'DEMO-108') {
          Object.assign(balance, { ruleStatus: 'inapplicable', matchStatus: 'inapplicable', reasonCode: 'BALANCE_EXCLUDED', rawScore: 0,
            metric: '完整場景：命中流量均衡排除商家名單', reason: '排除名單命中：本項不加分且不參與排名', expression: '排除名單命中：不參與本次均衡加分與排名' })
          store.eligibility = 'filtered'; store.eligibilityReason = '完整場景樣例：該商家在流量均衡排除名單内'; store.rankingBucket = 'excluded'
        }
      }
    }
    if (scene === 'zero') {
      store.rules.filter(r => r.ruleStatus === 'enabled').forEach(r => {
        // 缺值不得被归零：坐标缺失等未知分项在零分快照中仍保留 null。
        if (r.rawScore == null) return
        Object.assign(r, { rawScore: 0, matchStatus: 'missed', reasonCode: 'DEMO_ZERO', reason: '全零快照展示樣例', parts: undefined, expression: '此快照固定0分' })
        if (r.ruleCode === 'PLT_01') Object.assign(r, { ruleStatus: 'disabled', matchStatus: 'disabled', effectiveMax: 0, reason: '全零樣例停用距離項' })
      })
    }
    if (scene === 'deduction') {
      // 现行 PLT_03 正式配置为非负加分；本快照仅验证界面能正确表达降权与零轴，不代表配置已改为扣分。
      const r = store.rules.find(rule => rule.ruleCode === 'PLT_03')!
      Object.assign(r, { rawScore: -30, matchStatus: 'deducted', reasonCode: 'DEMO_DEDUCTION',
        reason: '演示降權：訂單過熱調控命中扣分降權（當前正式配置為非負加分，此分僅驗證負值展示）',
        metric: '外賣＋自取 260 單，高於演示降權閾值', expression: '0 − 30 = −30 原始分（演示負值）' })
    }
    if (scene === 'error') {
      const r = store.rules.find(rule => rule.ruleCode === 'STB_03')!
      Object.assign(r, { rawScore: null, matchStatus: 'error', reasonCode: 'EXECUTION_ERROR',
        reason: '店鋪綜合分指標任務本次執行失敗，未取得可信值', metric: '指標不可用', expression: '不可計算' })
      if (store.eligibility === 'ranked') { store.eligibility = 'pending'; store.rankingBucket = 'excluded'; store.eligibilityReason = r.reason }
    }
    if (scene === 'config' || scene === 'sample' || scene === 'stale') {
      const code = scene === 'config' ? 'PLT_03' : scene === 'sample' ? 'STB_08' : 'STB_05'
      const r = store.rules.find(rule => rule.ruleCode === code)!
      Object.assign(r, { rawScore: null, matchStatus: scene === 'config' ? 'missing' : scene === 'sample' ? 'insufficient' : 'stale',
        reasonCode: scene === 'config' ? 'CONFIG_MISSING' : scene === 'sample' ? 'SAMPLE_TOO_SMALL' : 'METRIC_STALE',
        reason: scene === 'config' ? '流量均衡訂單量上界尚未配置' : scene === 'sample' ? '外賣樣本12單，低於30單；不是0取消率' : '出餐準時率資料超過有效期',
        metric: scene === 'sample' ? '外賣樣本12單' : r.metric, sampleSize: scene === 'sample' ? 12 : r.sampleSize,
        effectiveMax: scene === 'config' ? null : r.effectiveMax, observedAt: scene === 'stale' ? '2026-10-20 11:55:00' : DATA_TIME })
      if (store.eligibility === 'ranked') { store.eligibility = 'pending'; store.rankingBucket = 'excluded'; store.eligibilityReason = r.reason }
    }
    summarize(store)
    attachSampleEvidence(store, POINTS[point])
  }
  return { dataMode: 'demo', scenarioId: `${scene}-${point}-${mode}`, brand, channel: RecommendChannel.DELIVERY,
    algorithmId: 'DEMO-ORGANIC', configScope: '前端演示配置，非品牌獨立生效版本', configVersion: 'DEMO-v1',
    configDraftVersion: 'DEMO-v1-draft.3', configSavedVersion: 'DEMO-v1', configExecutedVersion: null,
    configUpdatedBy: null, configUpdatedAt: null, simulationMode: mode,
    evaluationTime: SAMPLE_TIME, observedAt: DATA_TIME, coordinateSystem: 'WGS84', location: POINTS[point],
    snapshotId: `DEMO-20261030-${brand}-${scene}`, candidateSetId: `DEMO-MACAU-120-${brand}`,
    stores: rankSnapshot(stores) }
}

// 有限场景按需展开并缓存，避免首屏构造全部快照；不接受用户手填坐标。
const SNAPSHOTS = new Map<string, ScoreSnapshot>()
export function getSampleSnapshot(brand: AppType = AppType.SHANFENG, point: PointId = 'A', scene: SampleScene = 'normal', mode: SimulationMode = 'distance'): ScoreSnapshot {
  const key = `${brand}-${point}-${scene}-${mode}`
  if (!SNAPSHOTS.has(key)) SNAPSHOTS.set(key, createSnapshot(brand, point, scene, mode))
  return SNAPSHOTS.get(key)!
}
export const DISTANCE_CURVE = [0, 1, 2, 3, 5, 8, 10, 15, 20, 25].map(distance => ({ distance, score: Math.max(0, 100 - 5 * distance) }))
