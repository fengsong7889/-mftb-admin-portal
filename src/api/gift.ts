import request, { SILENT_HEADER, isBackendUnavailable } from './request'
import {
  mockFetchGiftRecords,
  mockCreateGiftRecord,
  mockFetchGiftRecordDetail,
  mockFetchGiftRecordsByStore,
  mockDeductGiftDays,
  mockFetchGiftConsume,
} from './mock/giftMock'

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
  /** 聚合行数：同一门店+广告类型下的赠送记录笔数（列表聚合行） */
  recordCount?: number
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
  /** 审批流程编号（赠送审批通过后随记录写入） */
  approvalNo?: string
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

/** 静默请求头：后端不可用时降级到 Mock，不弹全局错误提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 推广赠送列表（后端不可用时自动降级到本地 Mock 数据） */
export async function fetchGiftRecords(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string; adType?: string
}) {
  try {
    return await request.get<unknown, GiftRecordPageResult>('/gifts', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchGiftRecords(params)
    throw err
  }
}

/** 新增赠送申请 */
export async function createGiftRecord(data: GiftRecordPayload) {
  try {
    return await request.post<unknown, GiftRecordItem>('/gifts', data, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockCreateGiftRecord(data)
    throw err
  }
}

/** 赠送明细详情 */
export async function fetchGiftRecordDetail(id: number) {
  try {
    return await request.get<unknown, GiftRecordItem>(`/gifts/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchGiftRecordDetail(id)
    throw err
  }
}

/** 指定门店+广告类型的逐笔赠送记录（赠送明细页；后端不可用时自动降级到本地 Mock 数据） */
export async function fetchGiftRecordsByStore(params: { storeId: number; adType: string }) {
  try {
    return await request.get<unknown, GiftRecordItem[]>('/gifts/records', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchGiftRecordsByStore(params)
    throw err
  }
}

/** 扣除赠送天数 */
export async function deductGiftDays(id: number, data: GiftDeductPayload) {
  try {
    return await request.post<unknown, void>(`/gifts/${id}/deduct`, data, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockDeductGiftDays(id, data)
    throw err
  }
}

/** 可用赠送天数合计（广告销售下单前展示抵扣余额；后端不可用时返回 0，不降级 Mock） */
export async function fetchGiftAvailableDays(storeId: number, adType: string): Promise<number> {
  try {
    return await request.get<unknown, number>('/gifts/available-days', { params: { storeId, adType }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return 0
    throw err
  }
}

/** 消费明细列表（后端不可用时自动降级到本地 Mock 数据） */
export async function fetchGiftConsume(params: {
  page?: number; size?: number; groupId?: number; storeId?: number; brand?: string
  adType?: string; tradeType?: string; giftId?: string; orderNo?: string
  algorithmId?: string; startDate?: string; endDate?: string
}) {
  try {
    return await request.get<unknown, GiftConsumePageResult>('/gifts/consume', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchGiftConsume(params)
    throw err
  }
}
