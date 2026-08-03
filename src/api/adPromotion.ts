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

/** 廣告訂單（與後端 AdOrderVO 對齊） */
export interface AdOrder {
  id?: number
  orderNo: string
  /** 算法類型: 1=無敵星星 */
  algoType: number
  algoId: number
  algoName: string
  /** 算法编码（如 ALG00001） */
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
  itemCount?: number
  originalAmount: number
  discountAmount: number
  actualAmount: number
  refundAmount: number
  /** 訂單狀態: 1=待推廣 2=推廣中 3=已推廣 4=已退款 5=已取消 */
  status: number
  orderTime?: string
  payTime?: string
  flowNo?: string
  remark?: string
  createdAt?: string
}

/** 訂單明細行（商圈 x 日期 x 餐段） */
export interface AdOrderItem {
  id?: number
  bizDate: string
  region: number
  mealSlot: string
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

/** 退款（按取消扣費梯度計算後回補推廣金賬戶） */
export function refundAdOrder(orderNo: string) {
  return request.post<unknown, AdOrderDetail>(`/ad/orders/${orderNo}/refund`, null, SILENT)
}
