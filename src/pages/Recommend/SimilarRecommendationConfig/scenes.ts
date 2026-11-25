/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
// 第一阶段临时繁中文案，界面确认后再统一接入 i18n（efficient-dev-mode）。
/**
 * 场景注册表元数据（第一阶段前端单一真源）。
 * 与《多场景相似推荐架构方案》迁移 340 的 biz_ad_recommendation_scene 种子一一对应：
 * 第二阶段后端表就绪后以后端为准，本文件退化为展示兜底，键与取值不得漂移。
 * 界面文案统一繁中（与 locales 真源口径一致），简体混入会造成硬编码扫描与后续抽取噪音。
 */
export type SceneKey = 'detail_return' | 'store_detail_bottom' | 'order_detail_related' | 'find_similar' | 'favorites_reco' | 'search_guide'
export type SeedSource = 'merchant_anchor' | 'user_favorites' | 'user_history' | 'search_context'
export type DisplayContract = 'insert_1_2' | 'full_feed' | 'page_module'

export interface SceneMeta {
  code: number
  key: SceneKey
  name: string
  icon: string
  /** 触发契约：APP 侧以什么动作进入本场景 */
  triggerLabel: string
  /** 种子来源：候选打分以谁的标签向量作锚点 */
  seedLabel: string
  seedSource: SeedSource
  /** 展示契约：结果以什么形态渲染 */
  displayLabel: string
  displayContract: DisplayContract
  /** 付费资格：是否允许仅投流候选＋有效曝光扣量（服务端裁决，前端只展示） */
  paidEligible: boolean
  status: 'enabled' | 'reserved'
  summary: string
}

export const SIMILAR_SCENES: SceneMeta[] = [
  { code: 1, key: 'detail_return', name: '交互式推薦', icon: '↩️',
    triggerLabel: '點擊商家→返回事件', seedSource: 'merchant_anchor', seedLabel: '被點擊商家 I2I ＋ 用戶 U2I',
    displayContract: 'insert_1_2', displayLabel: '原瀑布流插入 1–2 家', paidEligible: true, status: 'enabled',
    summary: '瀑布流中點擊某商家後，以該商家為錨點找相似商家；用戶返回時將推薦商家插入原瀑布流。' },
  { code: 2, key: 'store_detail_bottom', name: '商家詳情底部', icon: '📌',
    triggerLabel: '頁面加載', seedSource: 'merchant_anchor', seedLabel: '錨點商家 I2I',
    displayContract: 'page_module', displayLabel: '詳情頁底部模塊', paidEligible: false, status: 'reserved',
    summary: '原方案預留場景：僅保留註冊位，首期不可啟用。' },
  { code: 3, key: 'order_detail_related', name: '訂單詳情關聯', icon: '🧾',
    triggerLabel: '頁面加載', seedSource: 'merchant_anchor', seedLabel: '訂單商家 I2I（需訂單歸屬校驗）',
    displayContract: 'page_module', displayLabel: '訂單頁底部模塊', paidEligible: false, status: 'reserved',
    summary: '原方案預留場景：啟用前必須校驗訂單歸屬，首期不可啟用。' },
  { code: 4, key: 'find_similar', name: '找相似', icon: '🔍',
    triggerLabel: '長按卡片菜單', seedSource: 'merchant_anchor', seedLabel: '錨點商家 I2I（不依賴用戶，冷啟動可用）',
    displayContract: 'full_feed', displayLabel: '專屬相似瀑布流頁', paidEligible: true, status: 'enabled',
    summary: '長按商家卡片 →「找相似」→ 獨立頁面：錨點商家頭卡 ＋ 相似商家豎向流（對標美團／淘寶找相似形態）。' },
  { code: 5, key: 'favorites_reco', name: '收藏頁推薦', icon: '⭐',
    triggerLabel: '頁面進入', seedSource: 'user_favorites', seedLabel: '收藏商家標籤聚合 ∪ 用戶歷史',
    displayContract: 'page_module', displayLabel: '收藏列表底部推薦位', paidEligible: false, status: 'enabled',
    summary: '以用戶收藏商家的標準標籤（經全局衰變）聚合出偏好向量，結合用戶畫像推薦；外部依賴收藏列表 API，首期自然不扣量。' },
  { code: 6, key: 'search_guide', name: '搜索引導推薦', icon: '🧭',
    triggerLabel: '搜索頁進入', seedSource: 'user_history', seedLabel: '用戶歷史標籤（搜索語境預留）',
    displayContract: 'page_module', displayLabel: '搜索頁引導位', paidEligible: false, status: 'enabled',
    summary: '進入搜索頁時按用戶歷史標籤／行為匹配相關商家作引導；搜索詞理解為後續擴展，首期自然不扣量。' },
]

export const sceneByCode = (code: number): SceneMeta | undefined => SIMILAR_SCENES.find(scene => scene.code === code)

/** 从 type17 参数快照读归属场景（supportedScenes[0]）；缺失/非法回场景 1。 */
export function sceneFromParams(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 1
  const scenes = (raw as Record<string, unknown>).supportedScenes
  const code = Array.isArray(scenes) && typeof scenes[0] === 'number' ? scenes[0] : 1
  return sceneByCode(code)?.code ?? 1
}

/** 可建立算法实例的场景（预留场景不开放新增）。 */
export const CREATABLE_SCENES = SIMILAR_SCENES.filter(scene => scene.status === 'enabled')

/** 场景可覆盖字段描述：第二阶段由后端 override_schema 下发同构数据驱动渲染，此处先行固化。 */
export type OverrideField = {
  key: string
  label: string
  /** 依赖字段等于某值时才显示（条件字段不卸载语义由渲染处保证） */
  dependsOn?: { key: string; equals: string | number }
} & ({ kind: 'select'; options: { value: string | number; label: string }[]; defaultValue: string | number; dynamicOptions?: 'engineModes' }
  | { kind: 'multi'; options: { value: string; label: string }[]; defaultValue: string[] }
  | { kind: 'number'; min: number; max: number; precision?: number; defaultValue: number; unit?: string }
  | { kind: 'switch'; defaultValue: boolean })

export interface SceneOverrideSchema { fields: OverrideField[]; note: string }

/**
 * 各场景的覆盖项集合（僅 4/5/6；場景 1 沿用投流相似推薦規則集，觸發／數量／頻控在算法表單配置，不在此重複）。
 * 第二階段由後端按場景下發同構 schema 並做服務端白名單校驗。
 */
export const SCENE_OVERRIDES: Partial<Record<SceneKey, SceneOverrideSchema>> = {
  find_similar: {
    note: '綁定持久化與真實渲染待專屬瀑布流與 APP 長按契約；此處先固化展示契約與預設。',
    fields: [
      { key: 'pageSize', label: '每頁相似商家數', kind: 'number', min: 4, max: 50, defaultValue: 10, unit: '家' },
      { key: 'excludeAnchor', label: '排除錨點商家本身', kind: 'switch', defaultValue: true },
      { key: 'sessionDedup', label: '會話內去重', kind: 'switch', defaultValue: true },
      { key: 'negativeFeedbackFilter', label: '過濾「不喜歡」商家', kind: 'switch', defaultValue: true },
      { key: 'dailyLimit', label: '單用戶每日啟動上限', kind: 'number', min: 1, max: 20, defaultValue: 5, unit: '次' },
    ],
  },
  favorites_reco: {
    note: '依賴用戶收藏列表 API（後端當前僅有店鋪收藏計數）；先固化種子口徑預設。',
    fields: [
      { key: 'seedWindowDays', label: '收藏聚合窗口', kind: 'number', min: 7, max: 365, defaultValue: 90, unit: '天' },
      { key: 'topTagCount', label: '參與匹配標籤上限', kind: 'number', min: 1, max: 20, defaultValue: 8, unit: '種' },
      { key: 'resultCount', label: '推薦位商家數', kind: 'number', min: 1, max: 20, defaultValue: 6, unit: '家' },
      { key: 'dailyRefreshLimit', label: '每日刷新上限', kind: 'number', min: 1, max: 10, defaultValue: 3, unit: '次' },
    ],
  },
  search_guide: {
    note: '依賴搜索上下文／歷史行為 API；搜索詞理解為後續擴展，先固化引導位預設。',
    fields: [
      { key: 'resultCount', label: '引導商家數', kind: 'number', min: 1, max: 10, defaultValue: 4, unit: '家' },
      { key: 'perSessionLimit', label: '單會話展示上限', kind: 'number', min: 1, max: 3, defaultValue: 1, unit: '次' },
      { key: 'refreshStrategy', label: '刷新策略', kind: 'select', defaultValue: 'per_visit',
        options: [{ value: 'per_visit', label: '每次進入刷新' }, { value: 'sticky', label: '會話內保持不變' }] },
    ],
  },
}

/**
 * 场景专属「推薦策略與排序」schema：每個場景的召回準入／排序因子／決勝各自獨立，
 * 不與其它場景共享一套 rank 配置（場景 1 沿用表單內富配置，此處僅 4/5/6）。
 * 枚举术语与场景 1／投流单一真源对齐：预设第三档叫「自定義因子」，決勝不再提供「穩定商家 ID」
 * （同分仍同决胜时由排序稳定性按商家 ID 确定性兜底）。
 * 第二階段由後端按場景下發同構 schema 並做服務端白名單校驗。
 */
export const SCENE_STRATEGY: Partial<Record<SceneKey, OverrideField[]>> = {
  find_similar: [
    { key: 'merchantSimilarityThreshold', label: '商家相似度門檻', kind: 'number', min: 1, max: 100, defaultValue: 60, unit: '%' },
    { key: 'rankPreset', label: '排序策略', kind: 'select', defaultValue: 'matchFirst',
      options: [{ value: 'matchFirst', label: '匹配優先（I2I 相似度）' }, { value: 'custom', label: '自定義因子' }] },
    { key: 'rankFactors', label: '排序因子', kind: 'multi', defaultValue: ['match', 'tagHeat'], dependsOn: { key: 'rankPreset', equals: 'custom' },
      options: [{ value: 'match', label: '匹配分' }, { value: 'tagHeat', label: '匹配標籤熱度' }, { value: 'quality', label: '質量分' }, { value: 'distance', label: '距離' }] },
    { key: 'rankTieBreak', label: '同分決勝', kind: 'select', defaultValue: 'tagHeat',
      options: [{ value: 'tagHeat', label: '匹配標籤熱度高者優先' }, { value: 'quality', label: '質量分高者優先' }, { value: 'distance', label: '距離近者優先' }] },
  ],
  favorites_reco: [
    { key: 'userSimilarityThreshold', label: '用戶偏好門檻', kind: 'number', min: 1, max: 100, defaultValue: 60, unit: '%' },
    { key: 'rankPreset', label: '排序策略', kind: 'select', defaultValue: 'matchFirst',
      options: [{ value: 'matchFirst', label: '偏好強度優先（U2I）' }, { value: 'custom', label: '自定義因子' }] },
    { key: 'rankFactors', label: '排序因子', kind: 'multi', defaultValue: ['match', 'quality'], dependsOn: { key: 'rankPreset', equals: 'custom' },
      options: [{ value: 'match', label: '偏好匹配分' }, { value: 'quality', label: '質量分' }, { value: 'distance', label: '距離' }] },
    { key: 'rankTieBreak', label: '同分決勝', kind: 'select', defaultValue: 'quality',
      options: [{ value: 'quality', label: '質量分高者優先' }, { value: 'distance', label: '距離近者優先' }] },
  ],
  search_guide: [
    { key: 'userSimilarityThreshold', label: '用戶歷史門檻', kind: 'number', min: 1, max: 100, defaultValue: 50, unit: '%' },
    { key: 'rankPreset', label: '排序策略', kind: 'select', defaultValue: 'custom',
      options: [{ value: 'matchFirst', label: '相關性優先' }, { value: 'custom', label: '自定義因子' }] },
    { key: 'rankFactors', label: '排序因子', kind: 'multi', defaultValue: ['match', 'distance'], dependsOn: { key: 'rankPreset', equals: 'custom' },
      options: [{ value: 'match', label: '相關性分' }, { value: 'quality', label: '質量分' }, { value: 'distance', label: '距離' }] },
    { key: 'rankTieBreak', label: '同分決勝', kind: 'select', defaultValue: 'distance',
      options: [{ value: 'distance', label: '距離近者優先' }, { value: 'quality', label: '質量分高者優先' }] },
  ],
}
