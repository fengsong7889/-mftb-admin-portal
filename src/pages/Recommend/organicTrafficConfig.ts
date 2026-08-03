import { ServiceStatus } from './constants'

/**
 * 自然流量算法評分配置
 * 自然流量無需商家購買坑位，商家之間靠「綜合得分」高低較量排名，
 * 系統從 4 個維度累加得分：商業維度、店鋪維度（基礎信息 / 店鋪運營）、用戶維度、平台維度。
 */

/** 評分維度 */
export enum ScoreDimension {
  /** 商業維度：商家商業化投入貢獻 */
  COMMERCIAL = 1,
  /** 店鋪維度：店鋪自身質量與運營表現 */
  STORE = 2,
  /** 用戶維度：用戶與店鋪的個性化關係 */
  USER = 3,
  /** 平台維度：平台側調控因子 */
  PLATFORM = 4,
}

/** 店鋪維度下的子維度 */
export enum StoreSubDimension {
  /** 基礎信息：店鋪靜態資料完善度 */
  BASIC_INFO = 1,
  /** 店鋪運營：店鋪動態經營指標 */
  OPERATION = 2,
}

/** 計分方式 */
export enum ScoreMode {
  /** 固定加分：命中條件即得滿分 */
  FIXED = 1,
  /** 階梯分檔：按指標區間分檔給分 */
  TIERED = 2,
  /** 線性映射：指標歸一化後線性折算 */
  LINEAR = 3,
  /** 衰減函數：按距離/時長/天數指數衰減 */
  DECAY = 4,
  /** 扣分降權：命中條件按滿分扣減 */
  DEDUCT = 5,
  /** 金額倍率：得分 = 金額 × 倍率（分值字段填倍率） */
  AMOUNT_MULTIPLIER = 6,
}

export const SCORE_DIMENSION_LABEL: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '商業維度',
  [ScoreDimension.STORE]: '店鋪維度',
  [ScoreDimension.USER]: '用戶維度',
  [ScoreDimension.PLATFORM]: '平台維度',
}

export const SCORE_DIMENSION_DESC: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '商家商業化投入貢獻：購買金字招牌、點金廣告等付費推廣及平台活動參與情況',
  [ScoreDimension.STORE]: '店鋪自身質量：基礎信息完善度 + 店鋪運營表現（評分、出餐、好差評等）',
  [ScoreDimension.USER]: '用戶個性化關係：用戶購買過、收藏過、偏好匹配等個人化信號',
  [ScoreDimension.PLATFORM]: '平台調控因子：距離衰減、運力天氣、流量均衡與風控降權',
}

/** 維度圖標（emoji，與卡片風格一致） */
export const SCORE_DIMENSION_ICON: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '💰',
  [ScoreDimension.STORE]: '🏪',
  [ScoreDimension.USER]: '👤',
  [ScoreDimension.PLATFORM]: '🛠️',
}

/** 維度配色（遵循數據指標統計卡標準：主色 + 底色） */
export const SCORE_DIMENSION_COLOR: Record<ScoreDimension, { color: string; bg: string }> = {
  [ScoreDimension.COMMERCIAL]: { color: '#E8720C', bg: '#FFF7E6' },
  [ScoreDimension.STORE]: { color: '#1890FF', bg: '#E6F7FF' },
  [ScoreDimension.USER]: { color: '#52C41A', bg: '#F6FFED' },
  [ScoreDimension.PLATFORM]: { color: '#722ED1', bg: '#F9F0FF' },
}

export const STORE_SUB_DIMENSION_LABEL: Record<StoreSubDimension, string> = {
  [StoreSubDimension.BASIC_INFO]: '基礎信息',
  [StoreSubDimension.OPERATION]: '店鋪運營',
}

export const SCORE_MODE_LABEL: Record<ScoreMode, string> = {
  [ScoreMode.FIXED]: '固定加分',
  [ScoreMode.TIERED]: '階梯分檔',
  [ScoreMode.LINEAR]: '線性映射',
  [ScoreMode.DECAY]: '衰減函數',
  [ScoreMode.DEDUCT]: '扣分降權',
  [ScoreMode.AMOUNT_MULTIPLIER]: '金額倍率',
}

export const SCORE_MODE_COLOR: Record<ScoreMode, string> = {
  [ScoreMode.FIXED]: 'blue',
  [ScoreMode.TIERED]: 'geekblue',
  [ScoreMode.LINEAR]: 'cyan',
  [ScoreMode.DECAY]: 'purple',
  [ScoreMode.DEDUCT]: 'red',
  [ScoreMode.AMOUNT_MULTIPLIER]: 'gold',
}

export const SCORE_MODE_OPTIONS = [
  { label: SCORE_MODE_LABEL[ScoreMode.FIXED], value: ScoreMode.FIXED },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
  { label: SCORE_MODE_LABEL[ScoreMode.LINEAR], value: ScoreMode.LINEAR },
  { label: SCORE_MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
  { label: SCORE_MODE_LABEL[ScoreMode.DEDUCT], value: ScoreMode.DEDUCT },
  { label: SCORE_MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
]

/** 單條評分規則 */
export interface OrganicScoreRule {
  id: string
  dimension: ScoreDimension
  /** 僅店鋪維度需要區分子維度 */
  subDimension?: StoreSubDimension
  name: string
  description: string
  mode: ScoreMode
  /** 分值上限（扣分項為負值） */
  score: number
  status: ServiceStatus
  /** 系統內置項不可刪除，僅可啟用/停用與調整分值 */
  builtin: boolean
}

/** 各維度默認權重（總和需為 100） */
export const DEFAULT_DIMENSION_WEIGHT: Record<ScoreDimension, number> = {
  [ScoreDimension.COMMERCIAL]: 30,
  [ScoreDimension.STORE]: 30,
  [ScoreDimension.USER]: 25,
  [ScoreDimension.PLATFORM]: 15,
}

/** 店鋪維度下子維度默認權重（總和需為 100） */
export const DEFAULT_STORE_SUB_WEIGHT: Record<StoreSubDimension, number> = {
  [StoreSubDimension.BASIC_INFO]: 30,
  [StoreSubDimension.OPERATION]: 70,
}

/** 維度權重總和校驗值 */
export const DIMENSION_WEIGHT_TOTAL = 100

/** 得分計算定時器默認分鐘數 */
export const DEFAULT_SCORE_TIMER_MINUTES = 30

const { ENABLED, DISABLED } = ServiceStatus

/** 默認評分規則（可在界面上新增/停用/調整分值） */
export const DEFAULT_ORGANIC_SCORE_RULES: OrganicScoreRule[] = [
  // ===== 商業維度（商家營銷投入與付費推廣） =====
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減', description: '商家參與滿額立減活動固定加分', mode: ScoreMode.FIXED, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '減免運費', description: '商家減免配送運費固定加分', mode: ScoreMode.FIXED, score: 20, status: ENABLED, builtin: true },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '進店領券', description: '浮動計分：得分 = 領券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '新客立減', description: '商家參與新客立減活動固定加分', mode: ScoreMode.FIXED, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '收藏送券', description: '浮動計分：得分 = 贈券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '會員紅包-按金額', description: '浮動計分：得分 = 紅包金額 × 倍率，如紅包 10 元、倍率 2 則得 20 分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '閃蜂官方神券-按金額', description: '浮動計分：得分 = 券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_08', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減-按平均折扣', description: '浮動計分：得分 = 商家出資金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_09', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-點金廣告', description: '購買點金廣告投放期內加分', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-金字招牌', description: '購買金字招牌廣告投放期內加分', mode: ScoreMode.FIXED, score: 100, status: ENABLED, builtin: true },

  // ===== 店鋪維度 · 基礎信息（主營時段與店鋪身份標籤） =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '主營時段', description: '主營時段配置完整，當前處於主營時段內加分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_02', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪標籤-新店', description: '新店身份標籤加分，替代原平台新店扶持加權，不重複計分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_03', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪標籤-熱門', description: '熱門店鋪身份標籤加分', mode: ScoreMode.FIXED, score: 50, status: ENABLED, builtin: true },
  { id: 'STB_04', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪標籤-金牌', description: '金牌店鋪身份標籤加分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_05', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪標籤-獨家', description: '獨家店鋪身份標籤加分，替代原商業維度獨家商家協議，不重複計分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },

  // ===== 店鋪維度 · 店鋪運營（經營履跡，所有用戶同一個分） =====
  { id: 'STO_01', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '營業狀態', description: '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_02', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '店鋪口碑', description: '口碑最高 5 分，按評分檔位加減分，只取最近 30 天評價計算', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_03', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '店鋪銷量', description: '月銷量達標固定加分；超出部分按訂單數 × 倍率加分；需達起步訂單數後才開始計算；僅統計已完成有效訂單，已取消 / 退款訂單不計', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_04', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '出餐速度', description: '平均出餐時長越短得分越高，店鋪自身效率指標', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'STO_05', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '拒絕訂單', description: '商家拒絕訂單按次扣分', mode: ScoreMode.DEDUCT, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_06', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '優質評價', description: '用戶優質評價（好評帶圖 / 文字）按數量加分', mode: ScoreMode.TIERED, score: 60, status: ENABLED, builtin: true },
  { id: 'STO_07', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '出餐超時', description: '超出承諾出餐時長的訂單按佔比扣分', mode: ScoreMode.DEDUCT, score: -70, status: ENABLED, builtin: true },
  { id: 'STO_08', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '取消訂單', description: '商家主動取消訂單按次扣分', mode: ScoreMode.DEDUCT, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_09', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '超時接單', description: '超出接單時限未接單按次扣分', mode: ScoreMode.DEDUCT, score: -60, status: ENABLED, builtin: true },

  // ===== 用戶維度（個性化關係，每個用戶不同的分） =====
  { id: 'USR_01', dimension: ScoreDimension.USER, name: '用戶瀏覽店鋪-關鍵詞', description: '用戶搜索關鍵詞命中該店鋪，按關鍵詞排名 × 倍率計分；取排名前 N 個最新關鍵詞', mode: ScoreMode.LINEAR, score: 50, status: ENABLED, builtin: true },
  { id: 'USR_02', dimension: ScoreDimension.USER, name: '用戶下單店鋪', description: '取用戶最近下單的前 N 家店鋪加分，下單時間越近得分越高', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'USR_03', dimension: ScoreDimension.USER, name: '用戶收藏店鋪', description: '取用戶最新收藏的 N 家店鋪加分', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },

  // ===== 平台維度 =====
  { id: 'PLT_01', dimension: ScoreDimension.PLATFORM, name: '距離衰減', description: 'e^(-k×距離km)，距離越遠得分越低', mode: ScoreMode.DECAY, score: 100, status: ENABLED, builtin: true },
  { id: 'PLT_02', dimension: ScoreDimension.PLATFORM, name: '配送範圍分層', description: '短程 / 中程 / 遠程 / 跨橋分層計分', mode: ScoreMode.TIERED, score: 80, status: ENABLED, builtin: true },
  { id: 'PLT_03', dimension: ScoreDimension.PLATFORM, name: '預計送達時長', description: '預計送達時間越短得分越高', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'PLT_04', dimension: ScoreDimension.PLATFORM, name: '運力負載', description: '區域騎手供給充足度，運力緊張時遠距離商家降權', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'PLT_05', dimension: ScoreDimension.PLATFORM, name: '天氣因素', description: '惡劣天氣（颱風/暴雨）下遠距離商家降權', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'PLT_06', dimension: ScoreDimension.PLATFORM, name: '高峰時段調節', description: '用餐高峰按運力與商家承載能力調節曝光', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'PLT_07', dimension: ScoreDimension.PLATFORM, name: '商圈流量調控', description: '按商圈 / 區域（澳門、氹仔、珠海）配置流量係數', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'PLT_08', dimension: ScoreDimension.PLATFORM, name: '類目流量配額', description: '保障各品類曝光均衡，避免單一品類壟斷', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'PLT_09', dimension: ScoreDimension.PLATFORM, name: '新店扶持加權', description: '已由店鋪維度「店鋪標籤-新店」承接，停用避免重複計分', mode: ScoreMode.DECAY, score: 80, status: DISABLED, builtin: true },
  { id: 'PLT_10', dimension: ScoreDimension.PLATFORM, name: '曝光公平度補償', description: '長期低曝光的合規商家給予補償加權', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'PLT_11', dimension: ScoreDimension.PLATFORM, name: '多樣性打散', description: '同品牌 / 同類目連續出現時降權打散', mode: ScoreMode.DEDUCT, score: -50, status: ENABLED, builtin: true },
  { id: 'PLT_12', dimension: ScoreDimension.PLATFORM, name: '商家曝光疲勞控制', description: '同一商家短時間內重複曝光降權', mode: ScoreMode.DEDUCT, score: -50, status: ENABLED, builtin: true },
  { id: 'PLT_13', dimension: ScoreDimension.PLATFORM, name: '隨機探索擾動', description: '引入隨機因子避免頭部商家長期壟斷', mode: ScoreMode.FIXED, score: 30, status: ENABLED, builtin: true },
  { id: 'PLT_14', dimension: ScoreDimension.PLATFORM, name: '節假日大促加權', description: '節假日與平台大促期間按活動配置加權', mode: ScoreMode.TIERED, score: 40, status: ENABLED, builtin: true },
  { id: 'PLT_15', dimension: ScoreDimension.PLATFORM, name: '跨橋配送調節', description: '跨橋 / 過海訂單配送成本高，適度降權', mode: ScoreMode.DEDUCT, score: -40, status: ENABLED, builtin: true },
  { id: 'PLT_16', dimension: ScoreDimension.PLATFORM, name: '風控降權（刷單）', description: '命中刷單、異常訂單等風控規則時大幅降權', mode: ScoreMode.DEDUCT, score: -100, status: ENABLED, builtin: true },
  { id: 'PLT_17', dimension: ScoreDimension.PLATFORM, name: '黑名單不參與排序', description: '命中平台黑名單或違規下架的商家不參與自然流量排序', mode: ScoreMode.DEDUCT, score: -100, status: ENABLED, builtin: true },
  { id: 'PLT_18', dimension: ScoreDimension.PLATFORM, name: '冷啟動探索池', description: '無歷史數據的商家進入探索池，獲得基礎曝光', mode: ScoreMode.FIXED, score: 40, status: ENABLED, builtin: true },
]
