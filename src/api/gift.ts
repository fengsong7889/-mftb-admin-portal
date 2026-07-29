import request from './request'

/** 赠送记录 */
export interface GiftRecordItem {
  id: number
  giftId: string
  groupId: number
  /** 集团业务编号（如 JT000001，实时关联集团表） */
  groupCode?: string
  groupName: string
  storeId: number
  /** 门店业务编号（如 MD00001，实时关联门店表） */
  storeCode?: string
  storeName: string
  brand: string
  adType: string
  totalDays: number
  validDays: number
  usedDays: number
  remainingDays: number
  giftDate?: string
  expireDate?: string
  status: number
  reason: string
  credentials: string[]
  approvalNo?: string
  applicant?: string
  applyTime?: string
  approvalStatus: number
  createdAt?: string
}

/** 赠送记录分页结果 */
export interface GiftRecordPageResult {
  records: GiftRecordItem[]
  total: number
}

/** 赠送申请请求 */
export interface GiftRecordPayload {
  groupId: number
  storeId: number
  brand: string
  adType: string
  giftDays: number
  validDays: number
  reason: string
  credentials?: string[]
}

/** 扣除天数请求 */
export interface GiftDeductPayload {
  deductDays: number
  reason?: string
}

/** 消费流水 */
export interface GiftConsumeItem {
  id: number
  giftRecordId: number
  giftId: string
  groupId: number
  /** 集团业务编号（如 JT000001，实时关联集团表） */
  groupCode?: string
  groupName: string
  storeId: number
  /** 门店业务编号（如 MD00001，实时关联门店表） */
  storeCode?: string
  storeName: string
  brand: string
  adType: string
  tradeType: string
  balanceChange: number
  changeDate: string
  algorithmId: string
  algorithmName: string
  orderNo: string
  remainingDays: number
  remark: string
  createdAt: string
}

/** 消费流水分页结果 */
export interface GiftConsumePageResult {
  records: GiftConsumeItem[]
  total: number
}

/** 推广赠送列表 */
export function fetchGiftRecords(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string; adType?: string
}) {
  return request.get<unknown, GiftRecordPageResult>('/gifts', { params })
}

/** 新增赠送申请 */
export function createGiftRecord(data: GiftRecordPayload) {
  return request.post<unknown, GiftRecordItem>('/gifts', data)
}

/** 赠送明细详情 */
export function fetchGiftRecordDetail(id: number) {
  return request.get<unknown, GiftRecordItem>(`/gifts/${id}`)
}

/** 扣除赠送天数 */
export function deductGiftDays(id: number, data: GiftDeductPayload) {
  return request.post<unknown, void>(`/gifts/${id}/deduct`, data)
}

/** 消费明细列表 */
export function fetchGiftConsume(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string
  adType?: string; tradeType?: string; giftId?: string; orderNo?: string
  algorithmId?: string; startDate?: string; endDate?: string
}) {
  return request.get<unknown, GiftConsumePageResult>('/gifts/consume', { params })
}
