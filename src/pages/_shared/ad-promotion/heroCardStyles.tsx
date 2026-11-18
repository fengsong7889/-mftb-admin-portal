/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

import { AlgorithmType } from '@mftb/contracts/recommendConstants'

/**
 * 设计师款 hero 卡样式表（算法库 / 广告销售 / 销售定价三菜单共用）：
 * 渐变底色为品牌装饰面，不随主题翻面；色值按既有先例写在渐变串内联
 * （渐变串内色值不进 cssHex/inlineHex 棘轮口径）。variant 是 CSS 扩展点类名。
 * 降噪口径（避免多卡同屏花哨）：深色同色系基底压住整卡，类型色只以右上角
 * 光晕渐隐呈现（正对玻璃圆徽记），饱和度大幅收敛。
 * 色板铁律（2026-11-18 两轮用户反馈后定稿）：一卡一色相、看色识广告，禁止相近色共存。
 * 上版失败根因：基底明度仅 12-20% 太暗太灰，把色相差压扁（绿/黄绿/青绿读成同族）。
 * 本版策略：基底用深档（tailwind 950→900，明度 10-22%、饱和 70-90% 保持色相可辨，白字对比全达标），
 * 光晕用 400 亮档 alpha 0.55；色族间隔≥21°，联盟商家挪品红避开蓝族。
 * 投流广告=深青蓝 cyan（离开绿族，与新店草绿不再相近）；青区三席靠明度梯度区分：
 * 投流深湖蓝(l20) / 自然墨青(l28) / 時段天蓝(l38)。
 * 11 色族：violet/red/orange/gold/cyan/green/teal/sky/blue/fuchsia/pink。
 */
export interface HeroCardStyle {
  variant: string
  gradient: string
}

export const HERO_CARD_STYLES: Partial<Record<AlgorithmType, HeroCardStyle>> = {
  [AlgorithmType.INVINCIBLE_STAR]: { variant: 'star', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(167, 139, 250, 0.55) 0%, rgba(167, 139, 250, 0) 55%), linear-gradient(135deg, #2E1065 0%, #4C1D95 100%)' },       // 全澳置顶·紫 violet
  [AlgorithmType.HOT_REVIVE_AD]: { variant: 'revive', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(248, 113, 113, 0.55) 0%, rgba(248, 113, 113, 0) 55%), linear-gradient(135deg, #450A0A 0%, #7F1D1D 100%)' },         // 商圈复活·正红 red
  [AlgorithmType.NEW_STORE_AD]: { variant: 'newstore', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(74, 222, 128, 0.55) 0%, rgba(74, 222, 128, 0) 55%), linear-gradient(135deg, #052E16 0%, #14532D 100%)' },      // 新店开业·草绿 green
  [AlgorithmType.BRAND_MERCHANT]: { variant: 'brand', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(96, 165, 250, 0.55) 0%, rgba(96, 165, 250, 0) 55%), linear-gradient(135deg, #172554 0%, #1E3A8A 100%)' },       // 品牌KA·宝蓝 blue
  [AlgorithmType.EXCLUSIVE_MERCHANT]: { variant: 'exclusive', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(232, 121, 249, 0.55) 0%, rgba(232, 121, 249, 0) 55%), linear-gradient(135deg, #4A044E 0%, #701A75 100%)' }, // 联盟稀缺·品红 fuchsia
  [AlgorithmType.GOLDEN_SIGNBOARD]: { variant: 'signboard', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(250, 204, 21, 0.55) 0%, rgba(250, 204, 21, 0) 55%), linear-gradient(135deg, #422006 0%, #713F12 100%)' },   // 金字招牌·金 gold
  [AlgorithmType.TRAFFIC_AD]: { variant: 'traffic', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(34, 211, 238, 0.55) 0%, rgba(34, 211, 238, 0) 55%), linear-gradient(135deg, #083344 0%, #164E63 100%)' },          // 投流匹配·深青蓝 cyan
  [AlgorithmType.GUESS_YOU_LIKE]: { variant: 'guess', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(244, 114, 182, 0.55) 0%, rgba(244, 114, 182, 0) 55%), linear-gradient(135deg, #500724 0%, #831843 100%)' },        // 猜你喜欢·玫粉 pink
  [AlgorithmType.ORGANIC_TRAFFIC]: { variant: 'organic', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(45, 212, 191, 0.55) 0%, rgba(45, 212, 191, 0) 55%), linear-gradient(135deg, #042F2E 0%, #134E4A 100%)' },     // 自然流量·墨青 teal
  [AlgorithmType.POPULAR_MERCHANT_KA]: { variant: 'popular', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(251, 146, 60, 0.55) 0%, rgba(251, 146, 60, 0) 55%), linear-gradient(135deg, #431407 0%, #7C2D12 100%)' }, // 人气热度·橘红 orange
  [AlgorithmType.TIME_SLOT_AD]: { variant: 'timeslot', gradient: 'radial-gradient(120% 150% at 86% 0%, rgba(56, 189, 248, 0.55) 0%, rgba(56, 189, 248, 0) 55%), linear-gradient(135deg, #082F49 0%, #0C4A6E 100%)' },        // 分时投放·天蓝 sky
}

/**
 * hero 徽记：每类一枚纯 CSS 图形（样式定义见 components.css 的 algo-card-mk-* 段），
 * 表达该广告的核心利益点；统一语言 = 白色形 + 一处品牌橙高亮（首坑/认证/核心动作）。
 */
export const renderHeroMark = (type: AlgorithmType) => {
  switch (type) {
    case AlgorithmType.INVINCIBLE_STAR: // 全澳置顶曝光：上箭头 + 坑位条，首条橙亮
      return (
        <span className="algo-card-mk-star" aria-hidden="true">
          <i className="algo-card-mk-star-arrow" />
          <i className="algo-card-mk-star-bar is-first" />
          <i className="algo-card-mk-star-bar" />
          <i className="algo-card-mk-star-bar is-dim" />
        </span>
      )
    case AlgorithmType.HOT_REVIVE_AD: // 商圈限定置顶：定位 pin 钉在坑位上
      return (
        <span className="algo-card-mk-revive" aria-hidden="true">
          <i className="algo-card-mk-revive-pin" />
          <i className="algo-card-mk-revive-bar is-first" />
          <i className="algo-card-mk-revive-bar" />
        </span>
      )
    case AlgorithmType.NEW_STORE_AD: // 新店开业：屋顶 + 店身 + 门
      return (
        <span className="algo-card-mk-store" aria-hidden="true">
          <i className="algo-card-mk-store-roof" />
          <i className="algo-card-mk-store-body"><i className="algo-card-mk-store-door" /></i>
        </span>
      )
    case AlgorithmType.BRAND_MERCHANT: // 品牌认证：橙亮勋章 + 双丝带
      return (
        <span className="algo-card-mk-medal" aria-hidden="true">
          <i className="algo-card-mk-medal-ribbon is-left" />
          <i className="algo-card-mk-medal-ribbon is-right" />
          <i className="algo-card-mk-medal-disc" />
        </span>
      )
    case AlgorithmType.EXCLUSIVE_MERCHANT: // 稀缺独家：皇冠三尖，中尖橙亮
      return (
        <span className="algo-card-mk-crown" aria-hidden="true">
          <i className="algo-card-mk-crown-spikes">
            <i className="algo-card-mk-crown-spike is-left" />
            <i className="algo-card-mk-crown-spike is-mid" />
            <i className="algo-card-mk-crown-spike is-right" />
          </i>
          <i className="algo-card-mk-crown-base" />
        </span>
      )
    case AlgorithmType.GOLDEN_SIGNBOARD: // 品质门槛匾额：顶檐 + 橙亮匾身（金字线）
      return (
        <span className="algo-card-mk-plaque" aria-hidden="true">
          <i className="algo-card-mk-plaque-top" />
          <i className="algo-card-mk-plaque-body" />
        </span>
      )
    case AlgorithmType.TRAFFIC_AD: // 投流匹配：商家×用户双向交换
      return (
        <span className="algo-card-mk-match" aria-hidden="true">
          <i className="algo-card-mk-match-node" />
          <i className="algo-card-mk-match-swap" />
          <i className="algo-card-mk-match-node" />
        </span>
      )
    case AlgorithmType.GUESS_YOU_LIKE: // 历史偏好命中：心形（橙亮）
      return (
        <span className="algo-card-mk-heart" aria-hidden="true">
          <i className="algo-card-mk-heart-shape" />
        </span>
      )
    case AlgorithmType.ORGANIC_TRAFFIC: // 权重分排名：递增阶梯 + 上升箭头，最高柱橙亮
      return (
        <span className="algo-card-mk-trend" aria-hidden="true">
          <i className="algo-card-mk-trend-bar is-low" />
          <i className="algo-card-mk-trend-bar" />
          <i className="algo-card-mk-trend-bar is-top" />
          <i className="algo-card-mk-trend-arrow" />
        </span>
      )
    case AlgorithmType.POPULAR_MERCHANT_KA: // 人气热度：橙亮外焰 + 暖白内焰（KA流量加持）
      return (
        <span className="algo-card-mk-popular" aria-hidden="true">
          <i className="algo-card-mk-popular-flame" />
        </span>
      )
    case AlgorithmType.TIME_SLOT_AD: // 分时投放：表盘 + 白色分针 + 橙亮时针（指向黄金时段）
      return (
        <span className="algo-card-mk-timeslot" aria-hidden="true">
          <i className="algo-card-mk-timeslot-dial" />
        </span>
      )
    default:
      return null
  }
}
