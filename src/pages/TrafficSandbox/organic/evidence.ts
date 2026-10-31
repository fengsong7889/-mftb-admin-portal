/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { Coordinate, RuleInput, RuleResult, StoreResult } from './types'

const input = (label: string, value: RuleInput['value'], unit?: string): RuleInput => ({ label, value, unit })
const couponCodes = new Set(['COM_01', 'COM_03', 'COM_04', 'COM_05', 'COM_07'])

/** 为有限展示快照补齐解释字段，不依据这些输入执行真实业务规则。 */
export function attachSampleEvidence(store: StoreResult, userPoint: Coordinate): void {
  for (const rule of store.rules) {
    const usable = rule.matchStatus === 'scored'
    const raw = usable ? rule.rawScore ?? 0 : 0
    rule.metricValue = rule.metric
    rule.unit = null
    rule.inputs = []
    rule.matchedTier = usable ? `預製結果檔：${raw.toFixed(2)} 原始分（非正式規則版本）` : null
    const window = rule.window.split(' ～ ')
    rule.windowStart = window.length === 2 ? `${window[0]} 00:00:00` : null
    rule.windowEnd = window.length === 2 ? `${window[1]} 00:00:00` : null

    if (couponCodes.has(rule.ruleCode)) {
      const guarded = rule.reasonCode === 'GUARD_EXCEEDED'
      rule.inputs = [input('報名狀態', rule.reasonCode !== 'NOT_ENROLLED'), input('門店客單價', 50, 'MOP'), input('使用門檻', guarded ? 150 : 25, 'MOP'), input('優惠金額', 10, 'MOP'), input('硬護欄', 2, '倍客單價'), input('護欄觸發仍發報名分', false)]
      // COM_03保留精确的10+16+30示例；其余子项只拆解预制原始分，不冒充真实档位。
      if (rule.ruleCode !== 'COM_03' || !usable) {
        rule.parts = [{ label: '報名分', score: Math.min(10, raw) }, { label: '門檻分', score: Math.max(0, raw - 10) / 3 }, { label: '力度分', score: Math.max(0, raw - 10) * 2 / 3 }]
      }
      if (rule.ruleCode === 'COM_03' && usable) rule.matchedTier = '門檻 ≤ 0.5倍（16分）；力度 ≥ 20%（30分）；報名10分'
    }
    if (rule.ruleCode === 'COM_02') {
      rule.inputs = [input('報名狀態', usable), input('免運門檻', 30, 'MOP'), input('有效門檻上限', 60, 'MOP'), input('超限保留報名分', false)]
      rule.parts = [{ label: '報名分', score: Math.min(20, raw) }, { label: '門檻分', score: Math.max(0, raw - 20) }]
    }
    if (rule.ruleCode === 'COM_06') {
      rule.inputs = [input('報名狀態', usable), input('商家額外出資', 30, 'MOP'), input('檔位匹配方式', '取最高命中檔，不累加低檔')]
      rule.parts = [{ label: '報名分', score: Math.min(10, raw) }, { label: '最高命中檔加碼分', score: Math.max(0, raw - 10) }]
    }
    if (rule.ruleCode === 'COM_10') {
      rule.inputs = [input('投放中去重標籤', 2, '個'), input('失效、退款與重複記錄', '不計分')]
      rule.parts = [
        { label: '人氣招牌', score: raw * 0.6, status: '投放中', reference: '演示購買記錄A（非真實訂單）', validFrom: '2026-10-01', validTo: '2026-10-31' },
        { label: '品類招牌', score: raw * 0.4, status: '投放中', reference: '演示購買記錄B（非真實訂單）', validFrom: '2026-10-01', validTo: '2026-10-31' },
        { label: '人氣招牌重複記錄', score: 0, status: '重複，已去重', reference: '演示購買記錄A（非真實訂單）' },
        { label: '期間限定招牌', score: 0, status: '已失效', reference: '演示購買記錄C（非真實訂單）', validFrom: '2026-09-01', validTo: '2026-09-30' },
        { label: '推薦招牌', score: 0, status: '已退款', reference: '演示退款記錄（非真實訂單）' },
      ]
    }
    if (rule.ruleCode === 'COM_SLOT') {
      rule.inputs = [input('購買狀態', usable), input('投放期', '2026-10-01 ～ 2026-10-31（演示）'), input('計分方式', '購買即固定加分，不區分時段數量、不累加')]
      rule.parts = [{ label: '時段推薦固定加分', score: raw }]
    }
    if (rule.ruleCode === 'STB_01') rule.inputs = [input('評估時刻', '2026-10-30 12:00:00（澳門）'), input('主營時段', '11:00–14:00（演示）'), input('是否命中', usable)]
    if (rule.ruleCode === 'STB_LABEL') rule.inputs = [input('門店當前標籤', '金牌（演示）'), input('匹配方式', '四選一，命中一檔即停不累加'), input('標籤賦值來源', '門店資料手動更新（待接）')]
    if (rule.ruleCode === 'STB_02') rule.inputs = [input('營業狀態', store.eligibility === 'ranked' || store.eligibility === 'pending' ? '營業中' : store.eligibilityReason), input('排序分組', store.rankingBucket)]
    if (rule.ruleCode === 'STB_03') {
      rule.metricValue = store.shopRating; rule.unit = '分'
      rule.inputs = [input('業務綜合分', store.shopRating, '分'), input('近30天訂單量（同分裁決）', store.orders30d, '單')]
    }
    if (rule.ruleCode === 'STB_05') {
      rule.metricValue = 98.5; rule.unit = '%'; rule.sampleSize = 200
      rule.inputs = [input('準時出餐', 197, '單'), input('有效樣本', 200, '單'), input('準時率', 98.5, '%'), input('資料來源', '定時任務，非實時上報')]
    }
    if (rule.ruleCode === 'STB_06') rule.inputs = [input('門店自動接單', usable), input('配置與門店狀態', '門店實際開關為命中依據，不僅是算法開關')]
    if (rule.ruleCode === 'STB_07') rule.inputs = [input('算法自動校正配置', true), input('門店自動校正實際狀態', usable), input('分值處理', '命中一次固定加分，不累加')]
    if (rule.ruleCode === 'STB_08') {
      const enough = rule.matchStatus !== 'insufficient'
      rule.metricValue = enough ? 2 / 120 * 100 : null; rule.unit = '%'
      rule.metric = enough ? '取消2單 / 外賣樣本120單 = 1.67%' : '外賣樣本12單，不滿足最低30單'
      rule.inputs = [input('統計訂單類型', '外賣，不含自取'), input('取消量', enough ? 2 : null, '單'), input('有效樣本量', rule.sampleSize, '單'), input('最低樣本門檻', 30, '單'), input('取消歸因', '用戶取消與商家取消均納入')]
    }
    if (rule.ruleCode === 'STB_ACT') {
      rule.inputs = [input('已報名且進行中', usable ? 2 : 0, '個活動'), input('匹配策略', '各活動獨立計分；未開始或過期不計分')]
      rule.parts = [
        { label: '午餐好店（演示活動）', score: raw / 2, status: usable ? '已報名，進行中' : '規則停用或未命中', reference: '演示報名A（無真實活動ID）', validFrom: '2026-10-01', validTo: '2026-10-31' },
        { label: '秋日餐飲節（演示活動）', score: raw / 2, status: usable ? '已報名，進行中' : '規則停用或未命中', reference: '演示報名B（無真實活動ID）', validFrom: '2026-10-20', validTo: '2026-11-05' },
        { label: '冬日預熱（演示活動）', score: 0, status: '未開始', reference: '演示報名C（無真實活動ID）', validFrom: '2026-11-01', validTo: '2026-11-30' },
        { label: '上期活動（演示活動）', score: 0, status: '已過期', validFrom: '2026-10-01', validTo: '2026-10-20' },
      ]
    }
    if (rule.ruleCode === 'PLT_01') {
      rule.metricValue = store.distanceKm; rule.unit = 'km'
      rule.inputs = [input('用戶WGS84座標', `${userPoint.lat}, ${userPoint.lng}`), input('門店WGS84座標', store.coordinate ? `${store.coordinate.lat}, ${store.coordinate.lng}` : null), input('球面直線距離', store.distanceKm, 'km'), input('距離滿分', 100, '原始分'), input('每公里扣分', 5, '分/km')]
    }
    if (rule.ruleCode === 'PLT_02A') rule.inputs = [input('餐段', '午餐（演示）'), input('配送分層', rule.metric), input('匹配來源', '固定場景資料，不用直線距離推斷跨橋')]
    if (rule.ruleCode === 'PLT_03') {
      rule.metricValue = 45; rule.unit = '單'
      rule.inputs = [input('計分大區', store.regionId <= 5 ? 'MACAU（澳門區域）' : 'TAIPA（氹仔區域）'), input('訂單量', 45, '單'), input('訂單類型', '外賣＋自取'), input('取消訂單計入', false), input('退款訂單計入', false), input('排除門店名單命中', false), input('刷新間隔', 60, '分鐘'), input('命中檔位上界', rule.reasonCode === 'CONFIG_MISSING' ? null : 80, '單')]
    }
    if (!rule.inputs.length) rule.inputs = [input('預製樣例結論', rule.reason)]
    if (!usable && rule.matchStatus !== 'deducted') rule.matchedTier = null
    if (rule.rawScore == null) rule.parts = undefined
  }
}

export function ruleStatusLabel(status: RuleResult['ruleStatus']): string {
  return status === 'enabled' ? '已啟用' : status === 'disabled' ? '已停用' : '不適用'
}
