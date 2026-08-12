import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/**
 * 推廣廣告（無敵星星）接口封裝
 * 算法庫 / 銷售定價 / 廣告銷售（庫存+下單） / 訂單查詢+退款
 *
 * 沿用 finance.ts 的靜默請求模式：後端不可用時由調用方通過
 * withAdFallback 降級到本地 Mock / 演示數據，不彈全局錯誤提示。
 * 業務錯誤（餘額不足、格子已售罄等）不觸發降級，由調用方按需提示。
 */

/** 靜默請求頭：後端不可用時降級到本地 Mock，不彈全局錯誤提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 推廣廣告統一分頁結果 */
export interface AdPageResult<T> {
  records: T[]
  total: number
}

/**
 * 後端不可用時降級到本地 Mock 的統一包裝
 * 業務錯誤（如餘額不足、格子已售罄）不觸發降級，由調用方按需提示。
 */
export async function withAdFallback<T>(
  call: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (isBackendUnavailable(err)) return await fallback()
    throw err
  }
}

/* ==================== 品牌映射 ==================== */

/** 後端品牌字符串: flashBee=閃蜂 mFood=M美食 */
export type AdBrand = 'flashBee' | 'mFood'

/** 前端 AppType: 1=閃蜂 2=M美食 */
export function appTypeToBrand(appType: number | undefined | null): AdBrand | undefined {
  if (appType === 1) return 'flashBee'
  if (appType === 2) return 'mFood'
  return undefined
}

/** 後端品牌字符串 → 前端 AppType */
export function brandToAppType(brand?: string | null): number | undefined {
  if (brand === 'flashBee') return 1
  if (brand === 'mFood') return 2
  return undefined
}

/* ==================== 算法庫 ==================== */

/** 算法記錄（與後端 AdAlgorithmVO 對齊） */
export interface AdAlgorithm {
  id?: number
  algoCode: string
  algoName: string
  /** 算法類型: 1=無敵星星 */
  algoType: number
  brand?: AdBrand | string
  /** 業務頻道: 1=大首頁 2=外賣頻道 3=超市百貨 4=團購到店 */
  channel?: number
  /** 投放界面: 1=大首頁-Feed 2=外賣頻道-Feed 3=超市頻道-Feed 4=團購頻道-Feed */
  placementInterface?: number
  slotCount?: number
  /** 差異化參數 JSON 字符串 */
  params?: string
  /** 服務狀態: 1=啟用 2=停用 */
  status?: number
  remark?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 算法新增/編輯請求 */
export interface AdAlgorithmRequest {
  algoName: string
  algoType: number
  brand?: string
  channel?: number
  placementInterface?: number
  slotCount?: number
  /** 各算法差異化參數（整體 JSON 對象） */
  params?: Record<string, unknown>
  status?: number
  remark?: string
}

/** 算法列表查詢參數 */
export interface AdAlgorithmQuery {
  page?: number
  size?: number
  algoType?: number
  brand?: string
  channel?: number
  status?: number
  keyword?: string
  /** 銷售菜單場景: 傳入後過濾掉對該門店屏蔽的算法 */
  storeCode?: string
  /** 銷售菜單場景: true 時僅返回有啟用定價的算法 */
  hasPricing?: boolean
}

/** 算法分頁查詢 */
export function fetchAdAlgorithms(params: AdAlgorithmQuery) {
  return request.get<unknown, AdPageResult<AdAlgorithm>>('/ad/algorithms', { params, ...SILENT })
}

/** 算法詳情 */
export function fetchAdAlgorithmDetail(id: number) {
  return request.get<unknown, AdAlgorithm>(`/ad/algorithms/${id}`, SILENT)
}

/** 新增算法 */
export function createAdAlgorithm(data: AdAlgorithmRequest) {
  return request.post<unknown, AdAlgorithm>('/ad/algorithms', data, SILENT)
}

/** 編輯算法 */
export function updateAdAlgorithm(id: number, data: AdAlgorithmRequest) {
  return request.put<unknown, AdAlgorithm>(`/ad/algorithms/${id}`, data, SILENT)
}

/** 算法啟用/停用 */
export function updateAdAlgorithmStatus(id: number, status: number) {
  return request.put<unknown, void>(`/ad/algorithms/${id}/status`, { status }, SILENT)
}

/** 刪除算法 */
export function deleteAdAlgorithm(id: number) {
  return request.delete<unknown, void>(`/ad/algorithms/${id}`, SILENT)
}

/* ==================== 銷售定價（無敵星星計價） ==================== */

/** 商圈日單價條目 */
export interface AdRegionPrice {
  id?: number
  /** 商圈: 1=黑沙環區 ... 11=黑沙灘區 */
  region: number
  /** 該商圈日單價（MOP） */
  dailyPrice: number
  /** 每天銷售個數（庫存），缺省 1 = 獨家占 */
  dailySalesLimit?: number
}

/** 計價配置（與後端 AdPricingStarVO 對齊） */
export interface AdPricingStar {
  id?: number
  algoId: number
  algoName?: string
  brand?: AdBrand | string
  channel?: number
  /** 預售天數（今天起 N 天可售） */
  presaleDays: number
  /** 退款開關: 1=允許退款 2=不允許 */
  refundEnabled?: number
  /** 多時段梯度折扣 JSON 字符串，如 [{"minSlots":3,"discount":95}] */
  discountTiers?: string
  /** 取消扣費梯度 JSON 字符串，如 [{"remainDays":0,"ratio":100}] */
  cancelFeeTiers?: string
  /** 屏蔽商家開關: 1=啟用 2=關閉 */
  blockMerchant?: number
  /** 屏蔽商家列表 JSON 字符串 */
  blockList?: string
  /** 可售時段 JSON 數組字符串（空或含 fullDay 表示全部時段） */
  sellTimeSlots?: string
  /** 時段折扣配置 JSON 數組字符串（分商圈，百分比記法） */
  slotDiscounts?: string
  /** 服務狀態: 1=啟用 2=停用 */
  status?: number
  remark?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  /** 分商圈日單價 */
  regionPrices?: AdRegionPrice[]
}

/** 計價配置新增/編輯請求 */
export interface AdPricingStarRequest {
  algoId: number
  brand?: string
  channel?: number
  presaleDays: number
  refundEnabled?: number
  /** 多時段梯度折扣: [{"minSlots":3,"discount":95},{"minSlots":5,"discount":90}] */
  discountTiers?: Record<string, unknown>[]
  /** 取消扣費梯度: [{"remainDays":0,"ratio":100},{"remainDays":3,"ratio":80}] */
  cancelFeeTiers?: Record<string, unknown>[]
  blockMerchant?: number
  blockList?: Record<string, unknown>[]
  /** 可售時段: ["breakfast","lunch"] 等; 空或含 fullDay 表示全部時段 */
  sellTimeSlots?: string[]
  /** 分商圈時段折扣配置（整體替換，百分比記法: 80=8折） */
  slotDiscounts?: AdRegionSlotDiscount[]
  status?: number
  remark?: string
  /** 分商圈日單價配置（整體替換） */
  regionPrices?: AdRegionPrice[]
}

/** 商圈時段折扣（百分比記法: 80 = 8折） */
export interface AdRegionSlotDiscount {
  region: number
  /** 全時段折扣（購買當天全部 5 個時段時適用） */
  fullDay?: number
  breakfast?: number
  lunch?: number
  afternoon?: number
  dinner?: number
  supper?: number
  /** 限時打折開關（僅持久化展示用） */
  limitedTime?: boolean
  startDate?: string
  endDate?: string
}

/** 計價配置查詢參數 */
export interface AdPricingStarQuery {
  page?: number
  size?: number
  algoId?: number
  brand?: string
  status?: number
}

/** 計價配置分頁查詢 */
export function fetchAdPricingList(params: AdPricingStarQuery) {
  return request.get<unknown, AdPageResult<AdPricingStar>>('/ad/pricing/star', { params, ...SILENT })
}

/** 計價配置詳情 */
export function fetchAdPricingDetail(id: number) {
  return request.get<unknown, AdPricingStar>(`/ad/pricing/star/${id}`, SILENT)
}

/** 按算法查詢啟用中的計價配置 */
export function fetchAdPricingActive(algoId: number) {
  return request.get<unknown, AdPricingStar>('/ad/pricing/star/active', { params: { algoId }, ...SILENT })
}

/** 新增計價配置 */
export function createAdPricing(data: AdPricingStarRequest) {
  return request.post<unknown, AdPricingStar>('/ad/pricing/star', data, SILENT)
}

/** 編輯計價配置 */
export function updateAdPricing(id: number, data: AdPricingStarRequest) {
  return request.put<unknown, AdPricingStar>(`/ad/pricing/star/${id}`, data, SILENT)
}

/** 計價配置啟用/停用 */
export function updateAdPricingStatus(id: number, status: number) {
  return request.put<unknown, void>(`/ad/pricing/star/${id}/status`, { status }, SILENT)
}

/** 刪除計價配置 */
export function deleteAdPricing(id: number) {
  return request.delete<unknown, void>(`/ad/pricing/star/${id}`, SILENT)
}

/* ==================== 廣告銷售（庫存 + 下單） ==================== */

/** 餐段時段: breakfast=早餐 lunch=午餐 afternoon=下午茶 dinner=晚餐 supper=宵夜 */
export type AdMealSlot = 'breakfast' | 'lunch' | 'afternoon' | 'dinner' | 'supper'

/** 可售格子（商圈 x 日期 x 餐段） */
export interface AdInventoryCell {
  /** 投放日期 YYYY-MM-DD */
  bizDate: string
  region: number
  mealSlot: AdMealSlot
  /** 格子單價（商圈日單價 / 5） */
  cellPrice: number
  /** 每天銷售個數（庫存），缺省 1 = 獨家占 */
  salesLimit?: number
  /** 剩余可售個數 */
  remaining?: number
  /** 格子狀態: available=可購買 soldOut=已售罄 unavailable=不可售 upcoming=待開售 */
  status: 'available' | 'soldOut' | 'unavailable' | 'upcoming'
}

/** 庫存查詢結果 */
export interface AdInventoryVO {
  algoId: number
  presaleDays: number
  /** 多時段梯度折扣 JSON 字符串（前端展示折扣規則） */
  discountTiers?: string
  /** 分商圈時段折扣配置 JSON 字符串（前端預覽折後價） */
  slotDiscounts?: string
  cells: AdInventoryCell[]
}

/** 查詢可購買格子（storeCode/groupCode 用於屏蔽商家攔截） */
export function fetchAdInventory(algoId: number, storeCode?: string, groupCode?: string) {
  return request.get<unknown, AdInventoryVO>('/ad/sales/star/inventory', { params: { algoId, storeCode, groupCode }, ...SILENT })
}

/** 下單請求（從推廣金賬戶扣款） */
export interface AdStarOrderRequest {
  algoId: number
  /** 購買集團ID（關聯推廣金賬戶） */
  groupCode: string
  storeCode?: string
  bdEmpId?: string
  remark?: string
  /** 選購的格子列表（組合商圈在前端拆解後傳入） */
  cells: { bizDate: string; region: number; mealSlot: string }[]
}

/** 提交訂單並從推廣金賬戶扣款 */
export function placeAdStarOrder(data: AdStarOrderRequest) {
  return request.post<unknown, AdOrder>('/ad/sales/star/order', data, SILENT)
}

/** 加購鎖定格子 60 秒（其它商家看到已售罄，到期自動釋放） */
export function lockAdCells(data: AdStarOrderRequest) {
  return request.post<unknown, void>('/ad/sales/star/lock', data, SILENT)
}

/** 釋放加購鎖（移除購物車/取消時調用） */
export function unlockAdCells(data: AdStarOrderRequest) {
  return request.post<unknown, void>('/ad/sales/star/unlock', data, SILENT)
}

/* ==================== 訂單查詢 + 退款 ==================== */

/** 餐段時段 key → 展示時間段（與演示數據樣式對齊） */
export const MEAL_SLOT_TIME_LABEL: Record<string, string> = {
  breakfast: '07:00-10:00',
  lunch: '11:00-14:00',
  afternoon: '14:00-17:00',
  dinner: '17:00-21:00',
  supper: '21:00-02:00',
}

/** 按日期分组的购买时段 */
export interface DateSlotGroup {
  date: string
  slots: string[]
}

/** 廣告訂單（與後端 AdOrderVO 對齊） */
export interface AdOrder {
  id?: number
  orderNo: string
  /** 算法類型: 1=無敵星星 3=盤活復蘇 */
  algoType: number
  algoId: number
  algoName: string
  /** 算法ID（如 WD00001） */
  algoCode?: string
  brand?: string
  channel?: number
  groupCode: string
  groupName?: string
  storeCode?: string
  storeName?: string
  bdEmpId?: string
  /** 下单人类型: 1=商家 2=业务人员 */
  operatorType?: number
  operatorId?: string
  operatorName?: string
  /** 所属商圈（明细去重聚合） */
  regions?: number[]
  /** 购买时段（明细去重聚合, breakfast/lunch/afternoon/dinner/supper） */
  mealSlots?: string[]
  /** 按日期分组的购买时段（無敵星星：每个日期对应的时段列表） */
  dateSlots?: DateSlotGroup[]
  itemCount?: number
  originalAmount: number
  discountAmount: number
  actualAmount: number
  refundAmount: number
  /** 退款退回贈送天數（盤活復蘇/無敵星星：贈送或混合支付退款時退回的天數） */
  refundGiftDays?: number | null
  /** 贈送天數抵扣快照 */
  giftDays?: number | null
  /** 贈送抵扣金額快照 */
  giftAmount?: number | null
  /** 訂單狀態: 1=待推廣 2=推廣中 3=已推廣 4=已退款 5=已取消 */
  status: number
  /** 購買日期列表（盤活復蘇按天售賣，明細日期去重排序） */
  purchaseDays?: string[]
  /** 購買皮膚列表（人氣商家明細 skin_name 去重排序） */
  skinNames?: string[]
  /** 後端 LocalDateTime 統一序列化為毫秒時間戳，保留字符串兼容 */
  orderTime?: string | number
  payTime?: string | number
  flowNo?: string
  remark?: string
  createdAt?: string
}

/** 訂單明細行（商圈 x 日期 x 餐段；盤活復蘇無 mealSlot；人氣商家有 skinName） */
export interface AdOrderItem {
  id?: number
  bizDate: string
  region: number
  /** 餐段時段；盤活復蘇按天售賣時為空 */
  mealSlot?: string | null
  /** 皮膚名稱（人氣商家明細） */
  skinName?: string | null
  originalPrice: number
  /** 折後實付分攤價 */
  salePrice: number
  refundPrice?: number | null
  /** 投放狀態: 1=待投放 2=已投放 3=已退款 */
  deliveryStatus: number
}

/** 訂單詳情（含明細） */
export interface AdOrderDetail extends AdOrder {
  items: AdOrderItem[]
}

/** 訂單查詢參數 */
export interface AdOrderQuery {
  page?: number
  size?: number
  orderNo?: string
  algoType?: number
  groupCode?: string
  storeCode?: string
  status?: number
  /** 下單時間起 YYYY-MM-DD */
  startDate?: string
  /** 下單時間止 YYYY-MM-DD */
  endDate?: string
}

/** 訂單分頁查詢 */
export function fetchAdOrders(params: AdOrderQuery) {
  return request.get<unknown, AdPageResult<AdOrder>>('/ad/orders', { params, ...SILENT })
}

/** 訂單詳情（含明細） */
export function fetchAdOrderDetail(orderNo: string) {
  return request.get<unknown, AdOrderDetail>(`/ad/orders/${orderNo}`, SILENT)
}

/** 退款（按取消扣费梯度計算後回補推廣金賬戶） */
export function refundAdOrder(orderNo: string) {
  return request.post<unknown, AdOrderDetail>(`/ad/orders/${orderNo}/refund`, null, SILENT)
}

/** 取消訂單（狀態變為已取消，釋放格子並回補推廣金） */
export function cancelAdOrder(orderNo: string) {
  return request.post<unknown, AdOrderDetail>(`/ad/orders/${orderNo}/cancel`, null, SILENT)
}

/* ==================== 銷售定價（盤活復蘇計價） ==================== */

/** 盤活復蘇計價配置（與後端 AdPricingReviveVO 對齊） */
export interface AdPricingRevive {
  id?: number
  algoId: number
  algoName?: string
  brand?: AdBrand | string
  channel?: number
  /** 預售天數（今天起 N 天可售），默認 180 */
  presaleDays: number
  /** 退款開關: 1=允許退款 2=不允許 */
  refundEnabled?: number
  /** 多天梯度折扣 JSON 字符串，如 [{"minDays":3,"discount":95}] */
  discountTiers?: string
  /** 取消扣費梯度 JSON 字符串 */
  cancelFeeTiers?: string
  /** 屏蔽商家開關: 1=啟用 2=關閉 */
  blockMerchant?: number
  /** 屏蔽商家列表 JSON 字符串 */
  blockList?: string
  /** 服務狀態: 1=啟用 2=停用 */
  status?: number
  remark?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  /** 分商圈計價（含每日銷售個數=庫存） */
  regionPrices?: AdRegionPrice[]
}

/** 盤活復蘇計價配置新增/編輯請求 */
export interface AdPricingReviveRequest {
  algoId: number
  brand?: string
  channel?: number
  presaleDays: number
  refundEnabled?: number
  /** 多天梯度折扣: [{"minDays":3,"discount":95}] */
  discountTiers?: Record<string, unknown>[]
  /** 取消扣費梯度: [{"remainDays":0,"ratio":100}] */
  cancelFeeTiers?: Record<string, unknown>[]
  blockMerchant?: number
  blockList?: Record<string, unknown>[]
  status?: number
  remark?: string
  /** 分商圈計價配置（整體替換） */
  regionPrices?: AdRegionPrice[]
}

/** 盤活復蘇計價配置查詢參數 */
export interface AdPricingReviveQuery {
  page?: number
  size?: number
  algoId?: number
  brand?: string
  status?: number
}

/** 盤活復蘇計價配置分頁查詢 */
export function fetchAdRevivePricingList(params: AdPricingReviveQuery) {
  return request.get<unknown, AdPageResult<AdPricingRevive>>('/ad/pricing/revive', { params, ...SILENT })
}

/** 盤活復蘇計價配置詳情 */
export function fetchAdRevivePricingDetail(id: number) {
  return request.get<unknown, AdPricingRevive>(`/ad/pricing/revive/${id}`, SILENT)
}

/** 按算法查詢啟用中的盤活復蘇計價配置 */
export function fetchAdRevivePricingActive(algoId: number) {
  return request.get<unknown, AdPricingRevive>('/ad/pricing/revive/active', { params: { algoId }, ...SILENT })
}

/** 新增盤活復蘇計價配置 */
export function createAdRevivePricing(data: AdPricingReviveRequest) {
  return request.post<unknown, AdPricingRevive>('/ad/pricing/revive', data, SILENT)
}

/** 編輯盤活復蘇計價配置 */
export function updateAdRevivePricing(id: number, data: AdPricingReviveRequest) {
  return request.put<unknown, AdPricingRevive>(`/ad/pricing/revive/${id}`, data, SILENT)
}

/** 盤活復蘇計價配置啟用/停用 */
export function updateAdRevivePricingStatus(id: number, status: number) {
  return request.put<unknown, void>(`/ad/pricing/revive/${id}/status`, { status }, SILENT)
}

/** 刪除盤活復蘇計價配置 */
export function deleteAdRevivePricing(id: number) {
  return request.delete<unknown, void>(`/ad/pricing/revive/${id}`, SILENT)
}

/* ==================== 廣告銷售（盤活復蘇: 庫存 + 下單） ==================== */

/** 盤活復蘇可售格子（商圈 x 日期） */
export interface AdReviveInventoryCell {
  /** 投放日期 YYYY-MM-DD */
  bizDate: string
  region: number
  /** 日單價（商圈日單價） */
  dailyPrice: number
  /** 每天銷售個數（庫存） */
  salesLimit: number
  /** 剩余可售個數 */
  remaining: number
  /** 格子狀態: available=可購買 soldOut=已售罄 */
  status: 'available' | 'soldOut'
}

/** 盤活復蘇庫存查詢結果 */
export interface AdReviveInventoryVO {
  algoId: number
  presaleDays: number
  /** 多天梯度折扣 JSON 字符串（前端展示折扣規則） */
  discountTiers?: string
  /** 退款開關: 1=允許退款 2=不允許 */
  refundEnabled?: number
  cells: AdReviveInventoryCell[]
}

/** 查詢盤活復蘇可購買格子 */
export function fetchAdReviveInventory(algoId: number, storeCode?: string, groupCode?: string) {
  return request.get<unknown, AdReviveInventoryVO>('/ad/sales/revive/inventory', { params: { algoId, storeCode, groupCode }, ...SILENT })
}

/** 盤活復蘇下單請求（從推廣金賬戶扣款，支持贈送天數抵扣） */
export interface AdReviveOrderRequest {
  algoId: number
  groupCode: string
  storeCode?: string
  bdEmpId?: string
  remark?: string
  /** 贈送天數抵扣（來自贈送管理發放的余額） */
  giftDays?: number
  /** 選購的格子列表（商圈 x 日期） */
  cells: { bizDate: string; region: number }[]
}

/** 提交盤活復蘇訂單並從推廣金賬戶扣款 */
export function placeAdReviveOrder(data: AdReviveOrderRequest) {
  return request.post<unknown, AdOrder>('/ad/sales/revive/order', data, SILENT)
}

/** 盤活復蘇加購鎖定格子 60 秒 */
export function lockAdReviveCells(data: AdReviveOrderRequest) {
  return request.post<unknown, void>('/ad/sales/revive/lock', data, SILENT)
}

/** 釋放盤活復蘇加購鎖 */
export function unlockAdReviveCells(data: AdReviveOrderRequest) {
  return request.post<unknown, void>('/ad/sales/revive/unlock', data, SILENT)
}


/* ==================== 廣告銷售（新店廣告: 贈送天數查詢 + 下單） ==================== */

/** 新店廣告庫存（贈送天數余額）查詢結果 */
export interface AdNewStoreInventoryVO {
  algoId: number
  algoName: string
  brand: string
  storeCode: string
  storeName: string
  totalGiftDays: number
  usedGiftDays: number
  remainingGiftDays: number
  expireDate: string
}

/** 新店廣告下單請求（贈送天數全額抵扣，實付 $0） */
export interface AdNewStoreOrderRequest {
  algoId: number
  groupCode: string
  storeCode: string
  bdEmpId?: string
  remark?: string
  giftDays: number
  cells: { bizDate: string }[]
}

/** 查詢新店廣告贈送天數余額 */
export function fetchAdNewStoreInventory(algoId: number, storeCode: string) {
  return request.get<unknown, AdNewStoreInventoryVO>("/ad/sales/newstore/inventory", { params: { algoId, storeCode }, ...SILENT })
}

/** 提交新店廣告訂單（贈送天數全額抵扣） */
export function placeAdNewStoreOrder(data: AdNewStoreOrderRequest) {
  return request.post<unknown, AdOrder>("/ad/sales/newstore/order", data, SILENT)
}

/* ==================== 銷售定價（人氣商家計價） ==================== */

/** 人氣商家皮膚計價條目（與後端 SkinPriceItem 對齊） */
export interface AdHotSkinPrice {
  id?: number
  /** 皮膚名稱 */
  skinName: string
  /** 皮膚日單價（MOP） */
  price: number
  /** 邊框方式: none=無邊框 color=選擇配色 image=上傳邊框圖 */
  borderType?: string
  /** 邊框顏色(HEX, borderType=color 時生效) */
  borderColor?: string
}

/** 人氣商家計價配置（與後端 AdPricingHotVO 對齊） */
export interface AdPricingHot {
  id?: number
  algoId: number
  algoName?: string
  brand?: AdBrand | string
  channel?: number
  /** 預售天數（今天起 N 天可售），默認 30 */
  presaleDays: number
  /** 退款開關: 1=允許退款 2=不允許 */
  refundEnabled?: number
  /** 多格梯度折扣 JSON 字符串，如 [{"minDays":3,"discount":95}] */
  discountTiers?: string
  /** 取消扣費梯度 JSON 字符串 */
  cancelFeeTiers?: string
  /** 屏蔽商家開關: 1=啟用 2=關閉 */
  blockMerchant?: number
  /** 屏蔽商家列表 JSON 字符串 */
  blockList?: string
  /** 服務狀態: 1=啟用 2=停用 */
  status?: number
  remark?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  /** 皮膚計價明細 */
  skins?: AdHotSkinPrice[]
}

/** 人氣商家計價配置新增/編輯請求 */
export interface AdPricingHotRequest {
  algoId: number
  brand?: string
  channel?: number
  presaleDays: number
  refundEnabled?: number
  /** 多格梯度折扣: [{"minDays":3,"discount":95}] */
  discountTiers?: Record<string, unknown>[]
  /** 取消扣費梯度: [{"remainDays":0,"ratio":100}] */
  cancelFeeTiers?: Record<string, unknown>[]
  blockMerchant?: number
  blockList?: Record<string, unknown>[]
  status?: number
  remark?: string
  /** 皮膚計價配置（整體替換） */
  skins: AdHotSkinPrice[]
}

/** 人氣商家計價配置查詢參數 */
export interface AdPricingHotQuery {
  page?: number
  size?: number
  algoId?: number
  brand?: string
  status?: number
}

/** 人氣商家計價配置分頁查詢 */
export function fetchAdHotPricingList(params: AdPricingHotQuery) {
  return request.get<unknown, AdPageResult<AdPricingHot>>('/ad/pricing/hot', { params, ...SILENT })
}

/** 人氣商家計價配置詳情 */
export function fetchAdHotPricingDetail(id: number) {
  return request.get<unknown, AdPricingHot>(`/ad/pricing/hot/${id}`, SILENT)
}

/** 按算法查詢啟用中的人氣商家計價配置 */
export function fetchAdHotPricingActive(algoId: number) {
  return request.get<unknown, AdPricingHot>('/ad/pricing/hot/active', { params: { algoId }, ...SILENT })
}

/** 新增人氣商家計價配置 */
export function createAdHotPricing(data: AdPricingHotRequest) {
  return request.post<unknown, AdPricingHot>('/ad/pricing/hot', data, SILENT)
}

/** 編輯人氣商家計價配置 */
export function updateAdHotPricing(id: number, data: AdPricingHotRequest) {
  return request.put<unknown, AdPricingHot>(`/ad/pricing/hot/${id}`, data, SILENT)
}

/** 人氣商家計價配置啟用/停用 */
export function updateAdHotPricingStatus(id: number, status: number) {
  return request.put<unknown, void>(`/ad/pricing/hot/${id}/status`, { status }, SILENT)
}

/** 刪除人氣商家計價配置 */
export function deleteAdHotPricing(id: number) {
  return request.delete<unknown, void>(`/ad/pricing/hot/${id}`, SILENT)
}

/* ==================== 廣告銷售（人氣商家: 庫存 + 下單） ==================== */

/** 人氣商家可售格子（皮膚 x 日期） */
export interface AdHotInventoryCell {
  /** 投放日期 YYYY-MM-DD */
  bizDate: string
  /** 皮膚名稱 */
  skinName: string
  /** 皮膚日單價 */
  price: number
  /** 邊框方式: none=無邊框 color=選擇配色 image=上傳邊框圖 */
  borderType?: string
  /** 邊框顏色(HEX, borderType=color 時生效) */
  borderColor?: string
  /** 格子狀態: available=可購買 purchased=本商家已購買 */
  status: 'available' | 'purchased'
}

/** 人氣商家庫存查詢結果 */
export interface AdHotInventoryVO {
  algoId: number
  presaleDays: number
  /** 多格梯度折扣 JSON 字符串 */
  discountTiers?: string
  /** 退款開關: 1=允許退款 2=不允許 */
  refundEnabled?: number
  /** 皮膚銷量統計: 皮膚名稱 → 售出的訂單數 */
  skinSoldCounts?: Record<string, number>
  cells: AdHotInventoryCell[]
}

/** 查詢人氣商家可購買格子（皮膚 x 日期） */
export function fetchAdHotInventory(algoId: number, storeCode?: string, groupCode?: string) {
  return request.get<unknown, AdHotInventoryVO>('/ad/sales/hot/inventory', { params: { algoId, storeCode, groupCode }, ...SILENT })
}

/** 人氣商家下單請求（從推廣金賬戶扣款） */
export interface AdHotOrderRequest {
  algoId: number
  groupCode: string
  storeCode?: string
  bdEmpId?: string
  remark?: string
  /** 贈送天數抵扣（來自贈送管理發放的余額） */
  giftDays?: number
  /** 選購的格子列表（皮膚 x 日期） */
  cells: { bizDate: string; skinName: string }[]
}

/** 提交人氣商家訂單並從推廣金賬戶扣款 */
export function placeAdHotOrder(data: AdHotOrderRequest) {
  return request.post<unknown, AdOrder>('/ad/sales/hot/order', data, SILENT)
}

/* ==================== 瀑布流策略 ==================== */

/**
 * 瀑布流策略（與後端 AdWaterfallVO 對齊）
 * id 即配置ID，APP 按該 ID 引用本條配置渲染瀑布流：
 * 已配置坑位讀取對應算法數據，未配置坑位統一讀取自然流量兜底算法數據
 */
export interface WaterfallStrategy {
  id?: number
  strategyName: string
  brand?: AdBrand | string
  /** 自然流量兜底算法ID（未配置坑位讀取該算法數據） */
  naturalAlgoId?: number | null
  naturalAlgoName?: string
  /** 過濾用戶不喜歡: 1=開啟 2=關閉 */
  filterDislike?: number
  /** 服務狀態: 1=啟用 2=停用 */
  status?: number
  remark?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  /** 坑位明細（按坑位序號升序） */
  slots?: WaterfallSlotItem[]
}

/** 坑位明細條目（一個坑位只能展示一種算法） */
export interface WaterfallSlotItem {
  id?: number
  /** 坑位序號（從1開始） */
  slotPosition: number
  algoId: number
  algoName?: string
  /** 算法類型快照: 1=無敵星星 2=新店廣告 3=盤活復蘇 ... */
  algoType?: number
  /** 坑位狀態: 1=啟用 2=停用 */
  status?: number
}

/** 瀑布流策略新增/編輯請求（坑位明細整體替換） */
export interface WaterfallStrategyRequest {
  strategyName: string
  brand?: string
  naturalAlgoId?: number | null
  filterDislike?: number
  status?: number
  remark?: string
  slots?: { slotPosition: number; algoId: number; status?: number }[]
}

/** 瀑布流策略查詢參數 */
export interface WaterfallQuery {
  page?: number
  size?: number
  /** 配置ID */
  id?: number
  strategyName?: string
  brand?: string
  status?: number
  /** 按算法過濾（包含該算法的策略） */
  algoId?: number
}

/** 策略分頁查詢 */
export function fetchWaterfallList(params: WaterfallQuery) {
  return request.get<unknown, AdPageResult<WaterfallStrategy>>('/ad/waterfall', { params, ...SILENT })
}

/** 策略詳情（含坑位明細 + 自然流量兜底算法） */
export function fetchWaterfallDetail(id: number) {
  return request.get<unknown, WaterfallStrategy>(`/ad/waterfall/${id}`, SILENT)
}

/** 新增策略 */
export function createWaterfall(data: WaterfallStrategyRequest) {
  return request.post<unknown, WaterfallStrategy>('/ad/waterfall', data, SILENT)
}

/** 編輯策略 */
export function updateWaterfall(id: number, data: WaterfallStrategyRequest) {
  return request.put<unknown, WaterfallStrategy>(`/ad/waterfall/${id}`, data, SILENT)
}

/** 策略啟用/停用 */
export function updateWaterfallStatus(id: number, status: number) {
  return request.put<unknown, void>(`/ad/waterfall/${id}/status`, { status }, SILENT)
}

/** 刪除策略 */
export function deleteWaterfall(id: number) {
  return request.delete<unknown, void>(`/ad/waterfall/${id}`, SILENT)
}
