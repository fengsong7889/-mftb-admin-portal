/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { AppType, RecommendChannel, Region } from '@mftb/contracts/recommendConstants'
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
  { code: 'STB_01', name: '主營時段加分', dimension: 'store', source: '門店營業設定', metric: '樣例午餐時段命中', window: '2026-10-30 午餐' },
  { code: 'STB_LABEL', name: '門店標籤', dimension: 'store', source: '門店標籤設定（待接）', metric: '門店當前標籤與命中檔位', window: '評估時刻' },
  { code: 'STB_02', name: '營業狀態', dimension: 'store', source: '門店營業狀態', metric: '營業中', window: '評估時刻' },
  { code: 'STB_03', name: '店鋪綜合分', dimension: 'store', source: '門店綜合評分', metric: '業務綜合分與命中檔位', window: '最新傳入值' },
  { code: 'STB_05', name: '出餐準時率', dimension: 'store', source: '準時率統計任務', metric: '準時率與有效樣本數', window: '2026-10-23 ～ 2026-10-30' },
  { code: 'STB_06', name: '自動接單', dimension: 'store', source: '店端接單設定', metric: '門店自動接單已開啟', window: '評估時刻' },
  { code: 'STB_07', name: '出餐時長', dimension: 'store', source: '店端自動校正狀態', metric: '門店自動校正已開啟', window: '評估時刻' },
  { code: 'STB_08', name: '訂單取消率', dimension: 'store', source: '外賣訂單統計', metric: '取消率1%；120筆外賣樣本（不含自取）', window: '2026-09-30 ～ 2026-10-30' },
  { code: 'STB_ACT', name: '活動加分', dimension: 'store', source: '真實活動/報名（待接）', metric: '進行中活動；按活動獨立累加', window: '活動有效期' },
  { code: 'PLT_01', name: '距離衰減', dimension: 'platform', source: '用戶點與門店點', metric: 'WGS84示例球面距離（公里）', window: '評估時刻' },
  { code: 'PLT_02A', name: '配送範圍', dimension: 'platform', source: '配送範圍匹配（待接）', metric: '午餐；樣例短程檔（非真實配送判定）', window: '2026-10-30 午餐' },
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
  if (brand === AppType.MFOOD) Object.assign(rules.find(r => r.ruleCode === 'COM_07')!, {
    ruleStatus: 'inapplicable', matchStatus: 'inapplicable', reasonCode: 'BRAND_NOT_APPLICABLE', reason: 'mFood 不適用平台官方神券', rawScore: 0, effectiveMax: 0,
  })
  const coupon = rules.find(r => r.ruleCode === 'COM_03')!
  Object.assign(coupon, { rawScore: 56, effectiveMax: 90, parts: [{ label: '報名分', score: 10 }, { label: '門檻分（25 ÷ 50 = 0.5）', score: 16 }, { label: '力度分（10 ÷ max(50,25) = 20%）', score: 30 }], expression: '10 + 16 + 30 = 56；樣例券類v1檔位' })
  const distance = rules.find(r => r.ruleCode === 'PLT_01')!
  distance.rawScore = Math.max(0, 100 - 5 * distanceKm)
  distance.metric = `${distanceKm.toFixed(4)} km；滿分100；每公里扣5分`
  distance.expression = `max(0, 100 − 5 × ${distanceKm.toFixed(4)})`
  const missed = index % 9 === 0 ? rules.find(r => r.ruleCode === 'COM_05') : undefined
  if (missed) Object.assign(missed, { matchStatus: 'missed', reasonCode: 'NOT_ENROLLED', reason: '樣例門店未報名收藏送券', metric: '未報名', rawScore: 0 })
  if (index === 91) Object.assign(rules.find(r => r.ruleCode === 'COM_01')!, { matchStatus: 'missed', reasonCode: 'GUARD_EXCEEDED', reason: '門檻高於客單價2倍，報名分不保留', metric: '門檻150 MOP；客單價50 MOP', rawScore: 0 })
  if (index === 92) Object.assign(rules.find(r => r.ruleCode === 'STB_ACT')!, { ruleStatus: 'disabled', matchStatus: 'disabled', reasonCode: 'RULE_DISABLED', reason: '此樣例活動加分已停用，不計分母', rawScore: 0, effectiveMax: 0 })

  // 为原型构造递减的基线快照；占比配置已停用，总分＝三个维度原始分直接相加。
  // 只有固定样例工厂可以使用本分配式，页面无法传入指标或定位调用它。
  const targetTotal = 520 - index * 2
  let fixed = 0
  let coefficient = 0
  for (const r of rules.filter(rule => rule.ruleStatus === 'enabled')) {
    if (r === coupon || r === distance || r.matchStatus !== 'scored') fixed += r.rawScore ?? 0
    else coefficient += r.effectiveMax ?? 0
  }
  const sampleRatio = coefficient ? (targetTotal - fixed) / coefficient : 0
  rules.forEach(r => { if (r.ruleStatus === 'enabled' && r.matchStatus === 'scored' && r !== coupon && r !== distance) r.rawScore = (r.effectiveMax ?? 0) * sampleRatio })
  const reason = eligibility === 'bottom' ? '休息一會／爆單暫停，置後展示，不參與正常得分排名'
    : eligibility === 'filtered' ? '休息打烊，已被候選過濾' : eligibility === 'pending' ? '缺少可信門店座標，完整計分尚未就緒' : '正常營業，參與本次樣例排名'
  if (eligibility === 'pending') Object.assign(distance, { rawScore: null, matchStatus: 'missing', reasonCode: 'COORDINATE_MISSING', reason, metric: '門店座標缺失', expression: '不可計算' })
  if (eligibility === 'bottom' || eligibility === 'filtered') Object.assign(rules.find(r => r.ruleCode === 'STB_02')!, { rawScore: null, matchStatus: 'inapplicable', reasonCode: 'STORE_INELIGIBLE', reason, metric: reason })
  return summarize({ storeId, storeCode: storeId, storeName: index === 90 ? '黑沙環茶記 · 示範店' : `${NAMES[index % NAMES.length]} · 示範${String(index).padStart(3, '0')}店`,
    merchantId: `GROUP-${Math.ceil(index / 3)}`, merchantName: `演示商家 ${String(Math.ceil(index / 3)).padStart(2, '0')}`,
    regionId, category: ['茶餐廳', '餐飲小館', '咖啡烘焙'][index % 3], coordinate: eligibility === 'pending' ? null : coordinate,
    eligibility, eligibilityReason: reason, rankingBucket: eligibility === 'ranked' ? 'normal' : eligibility === 'bottom' ? 'bottom' : 'excluded',
    totalScore: null, globalRank: null, displayPosition: null, regionRank: null, rankPopulation: 0, regionPopulation: 0, sameScore: false,
    shopRating: index === 11 ? 4.5 : 4.6, orders30d: 300 - index, distanceKm: eligibility === 'pending' ? null : distanceKm, dimensions: [], rules,
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
        const range = store.rules.find(rule => rule.ruleCode === 'PLT_02A')!
        range.rawScore = store.regionId === Region.KOKSAA ? 20 : 60
        range.metric = store.regionId === Region.KOKSAA ? '午餐；跨橋檔（固定場景，不是直線推斷）' : '午餐；中程檔（固定場景）'
        range.reason = '完整場景樣例變更配送分層'
        if (store.storeId === 'DEMO-108') { store.eligibility = 'filtered'; store.eligibilityReason = '完整場景樣例：此定位不在配送範圍'; store.rankingBucket = 'excluded' }
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
