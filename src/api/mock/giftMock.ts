/**
 * 赠送管理 Mock 降级服务
 * 当后端不可用时（本地未启动后端、静态部署等），使用 localStorage 模拟赠送记录与消费流水的 CRUD。
 */
import type {
  GiftRecordItem,
  GiftRecordPageResult,
  GiftRecordPayload,
  GiftConsumeItem,
  GiftConsumePageResult,
  GiftDeductPayload,
} from '../gift'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_GIFTS = `${MOCK_PREFIX}gifts`
const KEY_CONSUMES = `${MOCK_PREFIX}gift_consumes`
const KEY_INIT = `${MOCK_PREFIX}gift_initialized`

// ============================================================
// 种子数据（关联集团 JT000001~JT000004、门店 MD00001~MD00006）
// ============================================================

const SEED_GIFTS: GiftRecordItem[] = [
  { id: 1, giftId: '2401-001', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 1, storeCode: 'MD00001', storeName: '豪華軒·新馬路店', brand: 'flashBee', adType: 'new_store', totalDays: 90, validDays: 90, usedDays: 12, remainingDays: 78, giftDate: '2025-01-10', expireDate: '2025-04-10', status: 1, reason: '新店開業推廣支持', credentials: [], approvalNo: 'AP20250110001', applicant: '系統管理員', applyTime: '2025-01-10 10:00:00', approvalStatus: 2, createdAt: '2025-01-10 10:05:00' },
  { id: 2, giftId: '2401-002', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 2, storeCode: 'MD00002', storeName: '豪華軒·氹仔店', brand: 'mFood', adType: 'revival', totalDays: 60, validDays: 60, usedDays: 30, remainingDays: 30, giftDate: '2025-02-05', expireDate: '2025-04-06', status: 1, reason: '盤活復蘇扶持', credentials: [], approvalNo: 'AP20250205001', applicant: '張三', applyTime: '2025-02-05 11:00:00', approvalStatus: 2, createdAt: '2025-02-05 11:10:00' },
  { id: 3, giftId: '2401-003', groupId: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', storeId: 3, storeCode: 'MD00003', storeName: '珠海百貨·拱北店', brand: 'flashBee', adType: 'exclusive', totalDays: 120, validDays: 120, usedDays: 0, remainingDays: 120, giftDate: '2025-03-15', expireDate: '2025-07-13', status: 1, reason: '獨家商家合作支持', credentials: [], approvalNo: 'AP20250315001', applicant: '李四', applyTime: '2025-03-15 14:00:00', approvalStatus: 2, createdAt: '2025-03-15 14:15:00' },
  { id: 4, giftId: '2401-004', groupId: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', storeId: 4, storeCode: 'MD00004', storeName: '珠海百貨·香洲店', brand: 'mFood', adType: 'gold', totalDays: 45, validDays: 45, usedDays: 45, remainingDays: 0, giftDate: '2025-04-01', expireDate: '2025-05-16', status: 2, reason: '金牌商家推廣支持', credentials: [], approvalNo: 'AP20250401001', applicant: '系統管理員', applyTime: '2025-04-01 09:30:00', approvalStatus: 2, createdAt: '2025-04-01 09:40:00' },
  { id: 5, giftId: '2401-005', groupId: 3, groupCode: 'JT000003', groupName: '氹仔美食廣場集團', storeId: 5, storeCode: 'MD00005', storeName: '美食廣場·官也街店', brand: 'mFood', adType: 'ka', totalDays: 30, validDays: 30, usedDays: 5, remainingDays: 25, giftDate: '2025-05-20', expireDate: '2025-06-19', status: 1, reason: '人氣商家流量扶持', credentials: [], approvalNo: 'AP20250520001', applicant: '王五', applyTime: '2025-05-20 16:00:00', approvalStatus: 2, createdAt: '2025-05-20 16:10:00' },
  { id: 6, giftId: '2401-006', groupId: 4, groupCode: 'JT000004', groupName: '大灣區茶飲集團', storeId: 6, storeCode: 'MD00006', storeName: '灣區茶飲·澳門旗艦店', brand: 'flashBee', adType: 'new_store', totalDays: 90, validDays: 90, usedDays: 0, remainingDays: 90, giftDate: '2025-06-10', expireDate: '2025-09-08', status: 1, reason: '新店開業推廣支持', credentials: [], approvalNo: 'AP20250610001', applicant: '系統管理員', applyTime: '2025-06-10 10:00:00', approvalStatus: 2, createdAt: '2025-06-10 10:15:00' },
]

const SEED_CONSUMES: GiftConsumeItem[] = [
  { id: 1, giftRecordId: 1, giftId: '2401-001', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 1, storeCode: 'MD00001', storeName: '豪華軒·新馬路店', brand: 'flashBee', adType: 'new_store', tradeType: 'ad_purchase', balanceChange: -5, changeDate: '2025-01-20', algorithmId: 'ALG001', algorithmName: '新店首推算法', orderNo: 'ORD20250120001', remainingDays: 85, remark: '購買廣告扣減', createdAt: '2025-01-20 10:00:00' },
  { id: 2, giftRecordId: 1, giftId: '2401-001', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 1, storeCode: 'MD00001', storeName: '豪華軒·新馬路店', brand: 'flashBee', adType: 'new_store', tradeType: 'ad_purchase', balanceChange: -7, changeDate: '2025-02-05', algorithmId: 'ALG002', algorithmName: '精準推薦算法', orderNo: 'ORD20250205001', remainingDays: 78, remark: '購買廣告扣減', createdAt: '2025-02-05 14:30:00' },
  { id: 3, giftRecordId: 2, giftId: '2401-002', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 2, storeCode: 'MD00002', storeName: '豪華軒·氹仔店', brand: 'mFood', adType: 'revival', tradeType: 'ad_purchase', balanceChange: -10, changeDate: '2025-02-20', algorithmId: 'ALG003', algorithmName: '盤活復蘇算法', orderNo: 'ORD20250220001', remainingDays: 50, remark: '購買廣告扣減', createdAt: '2025-02-20 11:00:00' },
  { id: 4, giftRecordId: 2, giftId: '2401-002', groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeId: 2, storeCode: 'MD00002', storeName: '豪華軒·氹仔店', brand: 'mFood', adType: 'revival', tradeType: 'manual_deduct', balanceChange: -20, changeDate: '2025-03-10', algorithmId: 'ALG003', algorithmName: '盤活復蘇算法', orderNo: 'ORD20250310001', remainingDays: 30, remark: '運營手動扣除', createdAt: '2025-03-10 15:00:00' },
  { id: 5, giftRecordId: 4, giftId: '2401-004', groupId: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', storeId: 4, storeCode: 'MD00004', storeName: '珠海百貨·香洲店', brand: 'mFood', adType: 'gold', tradeType: 'ad_purchase', balanceChange: -45, changeDate: '2025-04-20', algorithmId: 'ALG004', algorithmName: '金牌商家算法', orderNo: 'ORD20250420001', remainingDays: 0, remark: '購買廣告扣減', createdAt: '2025-04-20 09:00:00' },
  { id: 6, giftRecordId: 5, giftId: '2401-005', groupId: 3, groupCode: 'JT000003', groupName: '氹仔美食廣場集團', storeId: 5, storeCode: 'MD00005', storeName: '美食廣場·官也街店', brand: 'mFood', adType: 'ka', tradeType: 'ad_purchase', balanceChange: -5, changeDate: '2025-06-01', algorithmId: 'ALG005', algorithmName: '人氣商家算法', orderNo: 'ORD20250601001', remainingDays: 25, remark: '購買廣告扣減', createdAt: '2025-06-01 10:00:00' },
]

function initMockData() {
  if (localStorage.getItem(KEY_INIT) === 'true') return
  localStorage.setItem(KEY_GIFTS, JSON.stringify(SEED_GIFTS))
  localStorage.setItem(KEY_CONSUMES, JSON.stringify(SEED_CONSUMES))
  localStorage.setItem(KEY_INIT, 'true')
}

// ============================================================
// 通用工具
// ============================================================

function read<T>(key: string): T[] {
  initMockData()
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[]
  } catch {
    return []
  }
}

function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function today(): string {
  return now().slice(0, 10)
}

function currentOperator(): string {
  try {
    const info = JSON.parse(localStorage.getItem('user_info') || '{}')
    return info.name || '系統管理員'
  } catch {
    return '系統管理員'
  }
}

function inDateRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!value) return false
  const day = value.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

// ============================================================
// 赠送记录 Mock API
// ============================================================

export function mockFetchGiftRecords(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string; adType?: string
}): GiftRecordPageResult {
  let list = read<GiftRecordItem>(KEY_GIFTS)
  if (params.groupId) list = list.filter(g => g.groupId === params.groupId)
  if (params.storeId) list = list.filter(g => g.storeId === params.storeId)
  if (params.brand) list = list.filter(g => g.brand === params.brand)
  if (params.adType) list = list.filter(g => g.adType === params.adType)

  const page = params.page || 1
  const size = params.size || 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

export function mockCreateGiftRecord(data: GiftRecordPayload): GiftRecordItem {
  const gifts = read<GiftRecordItem>(KEY_GIFTS)
  // 从 mock 集团/门店中查找关联信息
  const groups = JSON.parse(localStorage.getItem(`${MOCK_PREFIX}merchant_groups`) || '[]')
  const stores = JSON.parse(localStorage.getItem(`${MOCK_PREFIX}stores`) || '[]')
  const group = groups.find((g: { id: number }) => g.id === data.groupId)
  const store = stores.find((s: { id: number }) => s.id === data.storeId)
  const nextId = Math.max(0, ...gifts.map(g => g.id)) + 1
  const year = new Date().getFullYear().toString().slice(-2)
  const giftId = `${year}${String(nextId).padStart(4, '0')}-${String(nextId).padStart(3, '0')}`
  const item: GiftRecordItem = {
    id: nextId,
    giftId,
    groupId: data.groupId,
    groupCode: group?.groupCode,
    groupName: group?.groupName || '',
    storeId: data.storeId,
    storeCode: store?.storeCode,
    storeName: store?.storeName || '',
    brand: data.brand,
    adType: data.adType,
    totalDays: data.giftDays,
    validDays: data.validDays,
    usedDays: 0,
    remainingDays: data.giftDays,
    giftDate: today(),
    expireDate: addDays(today(), data.validDays),
    status: 1,
    reason: data.reason,
    credentials: data.credentials || [],
    approvalNo: `AP${Date.now()}`,
    applicant: currentOperator(),
    applyTime: now(),
    approvalStatus: 2,
    createdAt: now(),
  }
  write(KEY_GIFTS, [...gifts, item])
  return item
}

export function mockFetchGiftRecordDetail(id: number): GiftRecordItem {
  const gifts = read<GiftRecordItem>(KEY_GIFTS)
  const gift = gifts.find(g => g.id === id)
  if (!gift) throw new Error('贈送記錄不存在')
  return gift
}

export function mockDeductGiftDays(id: number, data: GiftDeductPayload): void {
  const gifts = read<GiftRecordItem>(KEY_GIFTS)
  const idx = gifts.findIndex(g => g.id === id)
  if (idx < 0) throw new Error('贈送記錄不存在')
  if (gifts[idx].remainingDays < data.deductDays) {
    throw new Error(`剩餘天數不足，當前剩餘 ${gifts[idx].remainingDays} 天`)
  }
  gifts[idx].usedDays += data.deductDays
  gifts[idx].remainingDays -= data.deductDays
  if (gifts[idx].remainingDays === 0) gifts[idx].status = 2
  write(KEY_GIFTS, gifts)

  // 同步写入消费流水
  const consumes = read<GiftConsumeItem>(KEY_CONSUMES)
  const nextId = Math.max(0, ...consumes.map(c => c.id)) + 1
  const flow: GiftConsumeItem = {
    id: nextId,
    giftRecordId: id,
    giftId: gifts[idx].giftId,
    groupId: gifts[idx].groupId,
    groupCode: gifts[idx].groupCode,
    groupName: gifts[idx].groupName,
    storeId: gifts[idx].storeId,
    storeCode: gifts[idx].storeCode,
    storeName: gifts[idx].storeName,
    brand: gifts[idx].brand,
    adType: gifts[idx].adType,
    tradeType: 'manual_deduct',
    balanceChange: -data.deductDays,
    changeDate: today(),
    algorithmId: '-',
    algorithmName: '-',
    orderNo: `ORD${Date.now()}`,
    remainingDays: gifts[idx].remainingDays,
    remark: data.reason || '手動扣除',
    createdAt: now(),
  }
  write(KEY_CONSUMES, [...consumes, flow])
}

// ============================================================
// 消费流水 Mock API
// ============================================================

export function mockFetchGiftConsume(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string
  adType?: string; tradeType?: string; giftId?: string; orderNo?: string
  algorithmId?: string; startDate?: string; endDate?: string
}): GiftConsumePageResult {
  let list = read<GiftConsumeItem>(KEY_CONSUMES)
  if (params.groupId) list = list.filter(c => c.groupId === params.groupId)
  if (params.storeId) list = list.filter(c => c.storeId === params.storeId)
  if (params.brand) list = list.filter(c => c.brand === params.brand)
  if (params.adType) list = list.filter(c => c.adType === params.adType)
  if (params.tradeType) list = list.filter(c => c.tradeType === params.tradeType)
  if (params.giftId) list = list.filter(c => c.giftId === params.giftId)
  if (params.orderNo) list = list.filter(c => c.orderNo.includes(params.orderNo!))
  if (params.algorithmId) list = list.filter(c => c.algorithmId === params.algorithmId)
  list = list.filter(c => inDateRange(c.changeDate, params.startDate, params.endDate))

  const page = params.page || 1
  const size = params.size || 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

// ============================================================
// 工具
// ============================================================

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
