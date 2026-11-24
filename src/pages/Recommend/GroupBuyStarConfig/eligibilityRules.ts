/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 展示资格过滤规则注册表（第一阶段静态只读）。
 *
 * 当前四项条件全部由团购业务系统内置裁决，本算法只定时校验并更新合格商品队列，
 * 不重复配置这些规则（口径见 recommend.starProduct.eligibilityHelp）。
 * 页面按本注册表渲染只读规则卡；后续团购侧规则配置下发后，仅需把数据源替换为
 * 后端接口并按项放开 locked，即可在同一模块内对接开关与参数，无需重做页面结构。
 * 文案统一走 recommend.starProduct.rule* 三语键（繁中真源），新增规则须同时补键。
 */
export interface EligibilityFilterRule {
  /** 规则唯一标识，对接后端配置时作为键 */
  key: 'delisted' | 'soldOut' | 'saleWindow' | 'waterfallScope'
  /** 条件名称 i18n 键 */
  labelKey: string
  /** 命中条件后的展示结果 i18n 键 */
  effectKey: string
  /** 裁决来源 */
  source: string
  /** 是否生效（系统内置条件恒为生效） */
  enabled: boolean
  /** 是否锁定不可操作；规则下发接入后由后端配置决定 */
  locked: boolean
}

export const ELIGIBILITY_FILTER_RULES: readonly EligibilityFilterRule[] = [
  // 已下架商品统一排除，不进入候选队列
  { key: 'delisted', labelKey: 'recommend.starProduct.ruleDelistedLabel', effectKey: 'recommend.starProduct.ruleDelistedEffect', source: '团购业务系统', enabled: true, locked: true },
  // 售罄暂停展示，补货后下一次校验自动回到队列
  { key: 'soldOut', labelKey: 'recommend.starProduct.ruleSoldOutLabel', effectKey: 'recommend.starProduct.ruleSoldOutEffect', source: '团购业务系统', enabled: true, locked: true },
  // 仅销售时间窗口内的商品具备展示资格
  { key: 'saleWindow', labelKey: 'recommend.starProduct.ruleSaleWindowLabel', effectKey: 'recommend.starProduct.ruleSaleWindowEffect', source: '团购业务系统', enabled: true, locked: true },
  // 不在当前瀑布流展示范围的商品不参与分配
  { key: 'waterfallScope', labelKey: 'recommend.starProduct.ruleWaterfallScopeLabel', effectKey: 'recommend.starProduct.ruleWaterfallScopeEffect', source: '团购业务系统', enabled: true, locked: true },
]
