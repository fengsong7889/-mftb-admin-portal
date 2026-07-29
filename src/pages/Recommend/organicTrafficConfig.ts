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
}

export const SCORE_MODE_COLOR: Record<ScoreMode, string> = {
  [ScoreMode.FIXED]: 'blue',
  [ScoreMode.TIERED]: 'geekblue',
  [ScoreMode.LINEAR]: 'cyan',
  [ScoreMode.DECAY]: 'purple',
  [ScoreMode.DEDUCT]: 'red',
}

export const SCORE_MODE_OPTIONS = [
  { label: SCORE_MODE_LABEL[ScoreMode.FIXED], value: ScoreMode.FIXED },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
  { label: SCORE_MODE_LABEL[ScoreMode.LINEAR], value: ScoreMode.LINEAR },
  { label: SCORE_MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
  { label: SCORE_MODE_LABEL[ScoreMode.DEDUCT], value: ScoreMode.DEDUCT },
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
  // ===== 商業維度 =====
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '金字招牌廣告購買', description: '商家購買金字招牌廣告期間加分，按剩餘有效期遞減', mode: ScoreMode.FIXED, score: 100, status: ENABLED, builtin: true },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '點金廣告購買', description: '商家購買點金廣告期間加分，按投放消耗檔位計分', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '無敵星星購買', description: '購買無敵星星的推廣時段內加分', mode: ScoreMode.FIXED, score: 90, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '人氣商家(KA)簽約', description: '人氣商家簽約有效期內加分', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '品牌商家(KA)簽約', description: 'KA 品牌商家身份加分', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '獨家商家協議', description: '與平台簽署獨家經營協議的商家加分', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '新店廣告購買', description: '新店廣告投放期內加分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'COM_08', dimension: ScoreDimension.COMMERCIAL, name: '盤活復蘇購買', description: '盤活復蘇投放期內加分', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'COM_09', dimension: ScoreDimension.COMMERCIAL, name: '廣告消耗金額', description: '近 30 天廣告總消耗金額分檔計分', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '佣金費率', description: '商家實際抽成費率越高，商業貢獻得分越高', mode: ScoreMode.LINEAR, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_11', dimension: ScoreDimension.COMMERCIAL, name: '推廣賬戶餘額充足度', description: '賬戶餘額可支撐推廣天數分檔計分', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'COM_12', dimension: ScoreDimension.COMMERCIAL, name: '平台活動參與度', description: '報名滿減 / 折扣 / 秒殺 / 新客立減等平台活動的數量', mode: ScoreMode.TIERED, score: 70, status: ENABLED, builtin: true },
  { id: 'COM_13', dimension: ScoreDimension.COMMERCIAL, name: '商家補貼力度', description: '商家自主承擔的優惠金額佔訂單金額比例', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'COM_14', dimension: ScoreDimension.COMMERCIAL, name: '配送方式', description: '平台配送商家高於商家自配送商家', mode: ScoreMode.FIXED, score: 40, status: ENABLED, builtin: true },
  { id: 'COM_15', dimension: ScoreDimension.COMMERCIAL, name: '合作年限', description: '商家入駐平台時長分檔計分', mode: ScoreMode.TIERED, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_16', dimension: ScoreDimension.COMMERCIAL, name: '逾期欠款', description: '存在逾期欠款或對賬駁回未處理時扣分', mode: ScoreMode.DEDUCT, score: -80, status: ENABLED, builtin: true },
  { id: 'COM_17', dimension: ScoreDimension.COMMERCIAL, name: '當日推廣預算耗盡', description: '當日推廣預算耗盡後不再享商業維度加分', mode: ScoreMode.DEDUCT, score: -50, status: ENABLED, builtin: true },
  { id: 'COM_18', dimension: ScoreDimension.COMMERCIAL, name: '結算違約記錄', description: '存在佣金結算違約記錄時扣分', mode: ScoreMode.DEDUCT, score: -60, status: DISABLED, builtin: true },

  // ===== 店鋪維度 · 基礎信息 =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪裝修得分', description: '門頭圖 / 招牌圖 / 品牌色 / 店鋪風格等裝修完成度', mode: ScoreMode.LINEAR, score: 100, status: ENABLED, builtin: true },
  { id: 'STB_02', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪頭圖質量', description: '首圖清晰度、尺寸合規、無違規水印', mode: ScoreMode.TIERED, score: 80, status: ENABLED, builtin: true },
  { id: 'STB_03', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '商品圖片完整率', description: '有主圖商品數 / 在售商品數', mode: ScoreMode.LINEAR, score: 100, status: ENABLED, builtin: true },
  { id: 'STB_04', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '商品圖片高清率', description: '達到高清標準的商品圖佔比', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'STB_05', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '菜單完整度', description: '在售 SKU 數量與商品分類齊全度', mode: ScoreMode.TIERED, score: 90, status: ENABLED, builtin: true },
  { id: 'STB_06', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '商品描述完整度', description: '有規格 / 描述 / 口味標籤的商品佔比', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_07', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '資質證照齊全', description: '營業執照、食品經營許可證等證照有效且齊全', mode: ScoreMode.FIXED, score: 100, status: ENABLED, builtin: true },
  { id: 'STB_08', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪類目準確度', description: '店鋪主營類目與實際在售商品的匹配度', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'STB_09', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '品牌與標籤完整', description: '品牌 Logo、店鋪標籤、招牌菜標記是否完善', mode: ScoreMode.LINEAR, score: 50, status: ENABLED, builtin: true },
  { id: 'STB_10', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '營業時間配置', description: '營業時段配置完整且與實際營業一致', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_11', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '配送信息合理度', description: '起送價、配送費、配送範圍設置合理度', mode: ScoreMode.TIERED, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_12', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '店鋪公告與說明', description: '店鋪公告、打包說明、發票信息完善度', mode: ScoreMode.LINEAR, score: 40, status: ENABLED, builtin: true },
  { id: 'STB_13', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '門店定位準確度', description: '門店定位與實際地址偏差越小得分越高', mode: ScoreMode.DECAY, score: 50, status: ENABLED, builtin: true },
  { id: 'STB_14', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.BASIC_INFO, name: '資質過期或信息缺失', description: '證照過期、關鍵信息缺失時扣分', mode: ScoreMode.DEDUCT, score: -100, status: ENABLED, builtin: true },

  // ===== 店鋪維度 · 店鋪運營 =====
  { id: 'STO_01', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '營業狀態', description: '營業中 / 休息一會 / 爆單暫停 / 休息打烊，非營業狀態直接降權', mode: ScoreMode.FIXED, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_02', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '店鋪評分', description: '店鋪綜合星級評分（5 分制歸一化至 0~1）', mode: ScoreMode.LINEAR, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_03', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '出餐速度', description: '平均出餐時長越短得分越高', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'STO_04', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '接單速度', description: '平均接單時長越短得分越高', mode: ScoreMode.DECAY, score: 70, status: ENABLED, builtin: true },
  { id: 'STO_05', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '接單率', description: '有效接單訂單佔全部進單的比例', mode: ScoreMode.LINEAR, score: 80, status: ENABLED, builtin: true },
  { id: 'STO_06', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '好評率', description: '好評數 / 有效評價數', mode: ScoreMode.LINEAR, score: 90, status: ENABLED, builtin: true },
  { id: 'STO_07', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '好評數', description: '近 90 天好評絕對數量分檔計分', mode: ScoreMode.TIERED, score: 60, status: ENABLED, builtin: true },
  { id: 'STO_08', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '差評率', description: '差評佔比越高扣分越多', mode: ScoreMode.DEDUCT, score: -90, status: ENABLED, builtin: true },
  { id: 'STO_09', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '評價回覆率', description: '商家回覆用戶評價的比例', mode: ScoreMode.LINEAR, score: 40, status: ENABLED, builtin: true },
  { id: 'STO_10', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '訂單完成率', description: '近 30 天完成訂單佔比', mode: ScoreMode.LINEAR, score: 90, status: ENABLED, builtin: true },
  { id: 'STO_11', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '商家取消/拒單率', description: '商家主動取消或拒單訂單佔比', mode: ScoreMode.DEDUCT, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_12', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '出餐超時率', description: '超出承諾出餐時長的訂單佔比', mode: ScoreMode.DEDUCT, score: -70, status: ENABLED, builtin: true },
  { id: 'STO_13', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '配送超時率', description: '超出預計送達時間的訂單佔比', mode: ScoreMode.DEDUCT, score: -60, status: ENABLED, builtin: true },
  { id: 'STO_14', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '缺貨退款率', description: '因缺貨導致退款的訂單佔比', mode: ScoreMode.DEDUCT, score: -70, status: ENABLED, builtin: true },
  { id: 'STO_15', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '客訴率', description: '每千單客訴量，越高扣分越多', mode: ScoreMode.DEDUCT, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_16', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '客訴處理時效', description: '客訴平均處理時長越短得分越高', mode: ScoreMode.DECAY, score: 40, status: ENABLED, builtin: true },
  { id: 'STO_17', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '近30天訂單量', description: '近 30 天成交單量分檔計分', mode: ScoreMode.TIERED, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_18', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '訂單量增長趨勢', description: '訂單量環比增長率', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'STO_19', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '復購率', description: '近 90 天復購用戶佔比', mode: ScoreMode.LINEAR, score: 80, status: ENABLED, builtin: true },
  { id: 'STO_20', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '客單價', description: '客單價與所在商圈區間的匹配度', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'STO_21', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '商品上新頻率', description: '近 30 天上新或更新商品數量', mode: ScoreMode.TIERED, score: 40, status: ENABLED, builtin: true },
  { id: 'STO_22', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '庫存準確率', description: '售完商品及時置空的比例', mode: ScoreMode.LINEAR, score: 50, status: ENABLED, builtin: true },
  { id: 'STO_23', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: 'IM 回覆及時率', description: '商家 IM 平均首響時長越短得分越高', mode: ScoreMode.DECAY, score: 40, status: ENABLED, builtin: true },
  { id: 'STO_24', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '活動優惠力度', description: '滿減 / 折扣 / 新客立減等優惠強度', mode: ScoreMode.TIERED, score: 70, status: ENABLED, builtin: true },
  { id: 'STO_25', dimension: ScoreDimension.STORE, subDimension: StoreSubDimension.OPERATION, name: '食安與違規記錄', description: '食安事故、平台違規處罰記錄扣分', mode: ScoreMode.DEDUCT, score: -100, status: ENABLED, builtin: true },

  // ===== 用戶維度 =====
  { id: 'USR_01', dimension: ScoreDimension.USER, name: '購買過的店鋪', description: '用戶在該店鋪有歷史成交訂單', mode: ScoreMode.FIXED, score: 100, status: ENABLED, builtin: true },
  { id: 'USR_02', dimension: ScoreDimension.USER, name: '購買次數與時間衰減', description: '下單次數越多、距今越近得分越高', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'USR_03', dimension: ScoreDimension.USER, name: '收藏過的店鋪', description: '用戶已收藏該店鋪', mode: ScoreMode.FIXED, score: 80, status: ENABLED, builtin: true },
  { id: 'USR_04', dimension: ScoreDimension.USER, name: '加購未下單', description: '購物車存在該店鋪商品但未提交訂單', mode: ScoreMode.FIXED, score: 60, status: ENABLED, builtin: true },
  { id: 'USR_05', dimension: ScoreDimension.USER, name: '瀏覽未下單', description: '近 7 天點擊進店但未下單，按時間衰減', mode: ScoreMode.DECAY, score: 50, status: ENABLED, builtin: true },
  { id: 'USR_06', dimension: ScoreDimension.USER, name: '搜索命中記錄', description: '近 7 天搜索行為命中該店鋪或其商品', mode: ScoreMode.DECAY, score: 50, status: ENABLED, builtin: true },
  { id: 'USR_07', dimension: ScoreDimension.USER, name: '品類偏好匹配', description: '店鋪主營類目與用戶偏好類目的相似度', mode: ScoreMode.LINEAR, score: 90, status: ENABLED, builtin: true },
  { id: 'USR_08', dimension: ScoreDimension.USER, name: '口味標籤匹配', description: '用戶口味標籤與店鋪招牌菜標籤匹配度', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'USR_09', dimension: ScoreDimension.USER, name: '價格帶偏好匹配', description: '店鋪客單價與用戶常消費價格帶匹配度', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'USR_10', dimension: ScoreDimension.USER, name: '時段偏好匹配', description: '當前時段（早餐/午餐/下午茶/晚餐/夜宵）與用戶習慣匹配度', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'USR_11', dimension: ScoreDimension.USER, name: '常用地址距離匹配', description: '店鋪與用戶常用收貨地址的距離衰減', mode: ScoreMode.DECAY, score: 70, status: ENABLED, builtin: true },
  { id: 'USR_12', dimension: ScoreDimension.USER, name: '協同過濾相似度', description: '相似人群對該店鋪的偏好強度', mode: ScoreMode.LINEAR, score: 80, status: ENABLED, builtin: true },
  { id: 'USR_13', dimension: ScoreDimension.USER, name: '會員等級加權', description: '會員 / 付費會員專享店鋪給予加權', mode: ScoreMode.TIERED, score: 40, status: ENABLED, builtin: true },
  { id: 'USR_14', dimension: ScoreDimension.USER, name: '新客探索加權', description: '從未在該店下單的用戶給予探索性曝光', mode: ScoreMode.FIXED, score: 50, status: ENABLED, builtin: true },
  { id: 'USR_15', dimension: ScoreDimension.USER, name: '差評或投訴記錄', description: '用戶對該店鋪有差評或投訴記錄時扣分', mode: ScoreMode.DEDUCT, score: -90, status: ENABLED, builtin: true },
  { id: 'USR_16', dimension: ScoreDimension.USER, name: '負反饋（不喜歡/屏蔽）', description: '用戶標記不喜歡或屏蔽該店鋪時大幅降權', mode: ScoreMode.DEDUCT, score: -100, status: ENABLED, builtin: true },
  { id: 'USR_17', dimension: ScoreDimension.USER, name: '曝光疲勞（未點擊）', description: '同一用戶近期多次曝光該店但未點擊時降權', mode: ScoreMode.DEDUCT, score: -60, status: ENABLED, builtin: true },

  // ===== 平台維度 =====
  { id: 'PLT_01', dimension: ScoreDimension.PLATFORM, name: '距離衰減', description: 'e^(-k×距離km)，距離越遠得分越低', mode: ScoreMode.DECAY, score: 100, status: ENABLED, builtin: true },
  { id: 'PLT_02', dimension: ScoreDimension.PLATFORM, name: '配送範圍分層', description: '短程 / 中程 / 遠程 / 跨橋分層計分', mode: ScoreMode.TIERED, score: 80, status: ENABLED, builtin: true },
  { id: 'PLT_03', dimension: ScoreDimension.PLATFORM, name: '預計送達時長', description: '預計送達時間越短得分越高', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'PLT_04', dimension: ScoreDimension.PLATFORM, name: '運力負載', description: '區域騎手供給充足度，運力緊張時遠距離商家降權', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'PLT_05', dimension: ScoreDimension.PLATFORM, name: '天氣因素', description: '惡劣天氣（颱風/暴雨）下遠距離商家降權', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'PLT_06', dimension: ScoreDimension.PLATFORM, name: '高峰時段調節', description: '用餐高峰按運力與商家承載能力調節曝光', mode: ScoreMode.TIERED, score: 50, status: ENABLED, builtin: true },
  { id: 'PLT_07', dimension: ScoreDimension.PLATFORM, name: '商圈流量調控', description: '按商圈 / 區域（澳門、氹仔、珠海）配置流量係數', mode: ScoreMode.LINEAR, score: 70, status: ENABLED, builtin: true },
  { id: 'PLT_08', dimension: ScoreDimension.PLATFORM, name: '類目流量配額', description: '保障各品類曝光均衡，避免單一品類壟斷', mode: ScoreMode.LINEAR, score: 60, status: ENABLED, builtin: true },
  { id: 'PLT_09', dimension: ScoreDimension.PLATFORM, name: '新店扶持加權', description: '新店週期內給予流量扶持，並隨經營天數衰減', mode: ScoreMode.DECAY, score: 80, status: ENABLED, builtin: true },
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
