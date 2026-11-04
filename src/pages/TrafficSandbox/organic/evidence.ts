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
      const fullReduction = rule.ruleCode === 'COM_01'
      rule.inputs = [input('報名狀態', rule.reasonCode !== 'NOT_ENROLLED'), input('門店客單價', 50, 'MOP'), input('使用門檻', guarded ? 150 : fullReduction ? 100 : 25, 'MOP'), input('優惠金額', guarded ? 70 : fullReduction ? 45 : 10, 'MOP'), input('硬護欄', 2, '倍客單價'), input('護欄觸發仍發報名分', false)]
      // 夹具已给活动/券类规则显式子项（含命中梯度与停发/未报名归零）时不再拆解覆盖；其余子项只拆解预制原始分，不冒充真实档位。
      if (!rule.parts) {
        rule.parts = [{ label: '報名分', score: Math.min(10, raw) }, { label: '門檻分', score: Math.max(0, raw - 10) / 3 }, { label: '力度分', score: Math.max(0, raw - 10) * 2 / 3 }]
      }
      if (rule.ruleCode === 'COM_03' && usable) rule.matchedTier = '門檻 ≤ 0.5倍（16分）；力度 ≥ 20%（30分）；報名10分'
    }
    if (rule.ruleCode === 'COM_02') {
      rule.inputs = [input('報名狀態', usable), input('減免運費門檻', 30, '元'), input('有效門檻上限', 80, '元'), input('超限保留報名分', false)]
      // 减免运费保留显式子项示例（报名分+门槛分查档），不再拆解覆盖；口径对齐 organicTrafficConfig 的 FreeShippingScoreConfig
    }
    if (rule.ruleCode === 'COM_06') {
      rule.inputs = [input('報名狀態', usable), input('商家額外加碼', 20, '元'), input('檔位匹配方式', '由低到高取達到的最後一檔，命中即停不累加')]
      // 会员红包保留显式子项（报名分+加码分查档），不再拆解覆盖；口径对齐 organicTrafficConfig 的 MemberBonusScoreConfig
    }
    if (rule.ruleCode === 'COM_10') {
      rule.inputs = [input('有效期內訂單', 2, '筆'), input('計分方式', '只抓取有效期内訂單，過期不抓取不加分，多標籤逐個累加'), input('失效、退款與重複記錄', '不計分')]
      // 金字招牌保留夹具显式子项（每个已购标签带订单号与投放起止），不再拆解覆盖；口径对齐 SignboardScoreConfig
    }
    if (rule.ruleCode === 'COM_SLOT') {
      rule.inputs = [input('生效日期內訂單', usable ? 1 : 0, '筆'), input('投放期', '2026-10-28 ～ 2026-11-27（演示）'), input('計分方式', '只抓取生效日期內訂單；購買即固定加分，不區分時段數量、不累加')]
      // 时段推荐保留夹具显式子项（带订单号与投放起止），不再拆解覆盖
    }
    if (rule.ruleCode === 'STB_01') rule.inputs = [input('評估時刻', '2026-10-30 12:00:00（澳門）'), input('業務系統傳入的當前時段', '午餐'), input('該時段配置分值', usable ? 60 : 0, '分'), input('其餘時段', '早餐/下午茶/晚餐/宵夜未配置 → 不加分'), input('計分方式', '命中當前時段一檔即停不累加；時段歸屬由業務系統判定，本倉庫只配時段與分值')]
    if (rule.ruleCode === 'STB_04') rule.inputs = [input('有效期內購買訂單', usable ? 1 : 0, '筆'), input('當前標籤', '金牌（演示）'), input('計分方式', '與金字招牌同口径：買標籤生成訂單，只抓取支付成功且已生效的有效期内訂單加分')]
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
    if (rule.ruleCode === 'STB_09') {
      rule.inputs = [input('已報名且進行中', usable ? 2 : 0, '個活動'), input('匹配策略', '各活動獨立計分可累加；報名未開始不加分；已過期與已取消不抓取不展示')]
      // 活动加分保留夹具显式子项（活动名/ID/生效日期/状态/得分），不再拆解覆盖；已过期活动不再展示
    }
    if (rule.ruleCode === 'PLT_01') {
      rule.metricValue = store.distanceKm; rule.unit = 'km'
      rule.inputs = [input('用戶WGS84座標', `${userPoint.lat}, ${userPoint.lng}`), input('門店WGS84座標', store.coordinate ? `${store.coordinate.lat}, ${store.coordinate.lng}` : null), input('球面直線距離', store.distanceKm, 'km'), input('距離滿分', 100, '原始分'), input('每公里扣分', 5, '分/km')]
    }
    if (rule.ruleCode === 'PLT_03') {
      rule.metricValue = 45; rule.unit = '單'
      rule.inputs = [input('計分大區', store.regionId <= 5 ? 'MACAU（澳門區域）' : 'TAIPA（氹仔區域）'), input('訂單量', 45, '單'), input('訂單類型', '外賣＋自取'), input('取消訂單計入', false), input('退款訂單計入', false), input('排除門店名單命中', rule.reasonCode === 'BALANCE_EXCLUDED'), input('刷新間隔', 60, '分鐘'), input('命中檔位上界', rule.reasonCode === 'CONFIG_MISSING' ? null : 80, '單')]
    }
    if (!rule.inputs.length) rule.inputs = [input('預製樣例結論', rule.reason)]
    if (!usable && rule.matchStatus !== 'deducted') rule.matchedTier = null
    if (rule.rawScore == null) rule.parts = undefined
  }
}

export function ruleStatusLabel(status: RuleResult['ruleStatus']): string {
  return status === 'enabled' ? '已啟用' : status === 'disabled' ? '已停用' : '不適用'
}
