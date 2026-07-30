import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/**
 * 財務管理接口封裝（推廣金賬戶 / 審批中心 / 批次 / 明細 / 充消對賬 / 欠款對賬）
 *
 * 字段命名與前端表格 dataIndex 完全一致（groupId/storeId 等），後端 VO 已做好映射。
 * 所有請求均為靜默請求：後端不可用時由調用方通過 withFinanceFallback 降級到本地
 * localStorage / 演示數據（見 src/utils/approvalStore.ts 與各頁面既有 Mock）。
 */

/** 靜默請求頭：後端不可用時降級到本地 Mock，不彈全局錯誤提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 財務模塊統一分頁結果 */
export interface FinPageResult<T> {
  records: T[]
  total: number
}

/**
 * 後端不可用時降級到本地 Mock 的統一包裝
 * 業務錯誤（如餘額不足、無審批權限）不觸發降級，由調用方按需提示。
 */
export async function withFinanceFallback<T>(
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

/* ==================== 推廣金賬戶 ==================== */

/** 推廣金賬戶 */
export interface FinAccount {
  id?: number
  groupId: string
  groupName: string
  brand: string
  virtualBalance: number
  actualBalance: number
  /** normal=正常 | frozen=凍結 | mergeFrozen=合併凍結 */
  status: string
  updatedBy?: string
  updatedAt?: string
}

/** 賬戶列表查詢參數 */
export interface FinAccountQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  brand?: string
  status?: string
}

/** 賬戶餘額分頁查詢 */
export function fetchFinAccounts(params: FinAccountQuery) {
  return request.get<unknown, FinPageResult<FinAccount>>('/fin/accounts', { params, ...SILENT })
}

/** 凍結賬戶（賬戶按集團+品牌隔離） */
export function freezeFinAccount(groupId: string, brand: string) {
  return request.put<unknown, void>(`/fin/accounts/${groupId}/freeze`, null, { params: { brand }, ...SILENT })
}

/** 解凍賬戶（賬戶按集團+品牌隔離） */
export function unfreezeFinAccount(groupId: string, brand: string) {
  return request.put<unknown, void>(`/fin/accounts/${groupId}/unfreeze`, null, { params: { brand }, ...SILENT })
}

/* ==================== 審批流程 ==================== */

/** 審批流程記錄（字段與 approvalStore.ApprovalRecord 對齊） */
export interface FinApproval {
  id?: number
  groupId: string
  groupName: string
  brand: string
  flowNo: string
  /** recharge | transfer | deduct | merge */
  approvalType: string
  applicant: string
  applyTime: string
  bizApprover: string
  bizApproveTime: string
  bizApproveStatus: string
  opsApprover: string
  opsApproveTime: string
  opsApproveStatus: string
  finApprover: string
  finApproveTime: string
  finApproveStatus: string
  /** pending | approved | rejected | cancelled */
  flowStatus: string
  rejectReason: string
  extra?: Record<string, unknown>
}

/** 審批中心查詢參數 */
export interface FinApprovalQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  brand?: string
  flowNo?: string
  approvalType?: string
  applicant?: string
  flowStatus?: string
  /** 當前待審節點 business | operation | finance */
  currentNode?: string
  /** 審批人（三節點任一匹配） */
  approver?: string
  /** 申請時間起 YYYY-MM-DD */
  applyFrom?: string
  /** 申請時間止 YYYY-MM-DD（含當日全天） */
  applyTo?: string
}

/** 審批通過結果 */
export interface FinApproveResult {
  /** 本次通過的節點名稱 */
  nodeName: string
  /** 是否三級審批全部通過（已生成批次與明細） */
  finished: boolean
  /** 下一待審節點名稱 */
  nextNode?: string
}

/** 門店金額明細（充值營業額扣款門店 / 合併欠款償還門店） */
export interface FinStoreAmount {
  storeId: string
  storeLabel?: string
  bd?: string
  amount: number
}

/** 推廣金充值申請 */
export interface RechargeApplyPayload {
  groupId: string
  groupName: string
  brand: string
  businessType?: string
  businessChannelLabel?: string
  /** 是否實收充值 */
  isActual?: boolean
  /** bank=銀行收款 | revenue=營業額支付 | mixed=混合支付 */
  payMethod?: string
  virtualAmount: number
  actualTotal?: number
  discountAmount?: number
  bankAmount?: number
  revenueAmount?: number
  deductStores?: FinStoreAmount[]
  bd?: string
  remark?: string
}

/** 推廣金轉賬申請 */
export interface TransferApplyPayload {
  fromGroupId: string
  fromGroupName: string
  brand: string
  fromVirtualBalance?: number
  toGroupId: string
  toGroupName: string
  transferAmount: number
  remark?: string
}

/** 推廣金扣款申請 */
export interface DeductApplyPayload {
  groupId: string
  groupName: string
  brand: string
  /** account=賬戶扣款 | consume=消費扣款 | batch=充值批次扣款 */
  deductMethod?: string
  deductAmount: number
  virtualBalance?: number
  consumeChannel?: string
  consumeStore?: string
  consumeType?: string
  consumeBd?: string
  batchNo?: string
  batchDeductible?: number
  batchSettlement?: string
  remark?: string
}

/** 商戶合併申請 */
export interface MergeApplyPayload {
  sourceGroupId: string
  sourceGroupName: string
  brand: string
  sourceVirtualBalance?: number
  sourceDebtAmount?: number
  targetGroupId: string
  targetGroupName: string
  repayStores?: FinStoreAmount[]
  remark?: string
}

/** 審批中心分頁查詢 */
export function fetchFinApprovals(params: FinApprovalQuery) {
  return request.get<unknown, FinPageResult<FinApproval>>('/fin/approvals', { params, ...SILENT })
}

/** 審批詳情 */
export function fetchFinApprovalDetail(flowNo: string) {
  return request.get<unknown, FinApproval>(`/fin/approvals/${flowNo}`, SILENT)
}

/** 提交充值申請，返回流程編號 */
export function submitRechargeApply(data: RechargeApplyPayload) {
  return request.post<unknown, string>('/fin/approvals/recharge', data, SILENT)
}

/** 提交轉賬申請，返回流程編號 */
export function submitTransferApply(data: TransferApplyPayload) {
  return request.post<unknown, string>('/fin/approvals/transfer', data, SILENT)
}

/** 提交扣款申請，返回流程編號 */
export function submitDeductApply(data: DeductApplyPayload) {
  return request.post<unknown, string>('/fin/approvals/deduct', data, SILENT)
}

/** 提交商戶合併申請，返回流程編號 */
export function submitMergeApply(data: MergeApplyPayload) {
  return request.post<unknown, string>('/fin/approvals/merge', data, SILENT)
}

/** 審批通過當前節點（財務節點通過後自動生成批次/明細/欠款單並更新餘額） */
export function approveFinApproval(flowNo: string) {
  return request.post<unknown, FinApproveResult>(`/fin/approvals/${flowNo}/approve`, null, SILENT)
}

/** 駁回當前節點 */
export function rejectFinApproval(flowNo: string, reason: string) {
  return request.post<unknown, void>(`/fin/approvals/${flowNo}/reject`, { reason }, SILENT)
}

/** 撤銷申請（僅審批中可撤銷） */
export function cancelFinApproval(flowNo: string) {
  return request.post<unknown, void>(`/fin/approvals/${flowNo}/cancel`, null, SILENT)
}

/* ==================== 批次 ==================== */

/** 交易批次 */
export interface FinBatch {
  id?: number
  groupId: string
  groupName: string
  brand: string
  /** recharge | transfer | deduct | merge */
  batchType: string
  batchNo: string
  flowNo: string
  tradeTime: string
  /** 是 | 否 | -- */
  isActual: string
  virtualAmount: number | null
  actualAmount: number | null
  discountAmount: number | null
  applicant: string
  bd: string
  remark: string
  /** 批次明細頁展示的擴展數據 */
  extra?: Record<string, unknown>
}

/** 批次查詢參數 */
export interface FinBatchQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  brand?: string
  batchType?: string
  batchNo?: string
  flowNo?: string
  isActual?: string
  applicant?: string
  bd?: string
  /** 交易時間起 YYYY-MM-DD */
  tradeFrom?: string
  /** 交易時間止 YYYY-MM-DD（含當日全天） */
  tradeTo?: string
}

/** 批次分頁查詢 */
export function fetchFinBatches(params: FinBatchQuery) {
  return request.get<unknown, FinPageResult<FinBatch>>('/fin/batches', { params, ...SILENT })
}

/** 批次詳情（轉賬/合併雙方共享批次號時用 groupId 定位具體一方） */
export function fetchFinBatchDetail(batchNo: string, groupId?: string) {
  return request.get<unknown, FinBatch>(`/fin/batches/${batchNo}`, { params: { groupId }, ...SILENT })
}

/* ==================== 交易明細 ==================== */

/** 交易明細 */
export interface FinDetail {
  id?: number
  detailId: string
  groupId: string
  groupName: string
  brand: string
  storeId: string
  storeName: string
  channel: string
  /** 充值 | 扣款 | 消費 | 轉入 | 轉出 */
  tradeType: string
  changeType: string
  tradeTime: string
  virtualChange: number
  actualChange: number | null
  batchNo: string
  flowNo: string
  bd: string
  remark: string
}

/** 明細查詢參數 */
export interface FinDetailQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  brand?: string
  storeId?: string
  storeName?: string
  channel?: string
  tradeType?: string
  changeType?: string
  batchNo?: string
  flowNo?: string
  detailId?: string
  /** 交易時間起 YYYY-MM-DD */
  tradeFrom?: string
  /** 交易時間止 YYYY-MM-DD（含當日全天） */
  tradeTo?: string
}

/** 明細分頁查詢 */
export function fetchFinDetails(params: FinDetailQuery) {
  return request.get<unknown, FinPageResult<FinDetail>>('/fin/details', { params, ...SILENT })
}

/* ==================== 充消對賬 ==================== */

/** 充消對賬日報行（按集團按日聚合） */
export interface FinReconcileRow {
  date: string
  groupId: string
  groupName: string
  brand: string
  initVirtual: number
  initActual: number
  virtualRecharge: number
  actualRecharge: number
  bankReceipt: number
  revenuePayment: number
  consumeTotal: number
  deductVirtual: number
  deductActual: number
  virtualTransferIn: number
  actualTransferIn: number
  virtualTransferOut: number
  actualTransferOut: number
  virtualNet: number
  actualNet: number
  endVirtual: number
  endActual: number
}

/** 充消對賬合計（期初取週期首日、期末取週期末日，其餘為區間合計） */
export type FinReconcileSummary = Omit<FinReconcileRow, 'date' | 'groupId' | 'groupName' | 'brand'>

/** 充消對賬查詢結果 */
export interface FinReconcileResult {
  records: FinReconcileRow[]
  total: number
  summary: FinReconcileSummary
}

/** 充消對賬查詢參數 */
export interface FinReconcileQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  brand?: string
  /** 統計起始日 YYYY-MM-DD */
  startDate?: string
  /** 統計結束日 YYYY-MM-DD */
  endDate?: string
}

/** 充消對賬查詢 */
export function fetchFinWriteoffReconcile(params: FinReconcileQuery) {
  return request.get<unknown, FinReconcileResult>('/fin/reconcile/writeoff', { params, ...SILENT })
}

/* ==================== 欠款對賬 ==================== */

/** 還款明細 */
export interface FinDebtRepayment {
  id?: number
  billNo?: string
  date: string
  /** 推廣金扣款 | 營業額扣款 | 對公轉賬 | 轉移結算 */
  channel: string
  amount: number
  remark: string
  operator: string
  operateTime: string
  /** 系統生成的轉移結算記錄不可刪除 */
  canDelete: boolean
}

/** 欠款單 */
export interface FinDebtBill {
  id?: number
  billNo: string
  groupId: string
  groupName: string
  brand: string
  storeId: string
  storeName: string
  channel: string
  bd: string
  /** recharge=充值營業額扣款 | merge=合併欠款轉入 */
  source: string
  loanDate: string
  batchNo: string
  flowNo: string
  debtTotal: number
  paidAmount: number
  remainAmount: number
  /** unsettled=未結清 | settled=已結清 | transferred=已轉結 */
  status: string
  repayments?: FinDebtRepayment[]
}

/** 品牌待還統計（僅統計未結清賬單的剩餘待還） */
export interface FinDebtBrandStats {
  shanfeng: { amount: number; count: number }
  mfood: { amount: number; count: number }
}

/** 欠款單分頁結果 */
export interface FinDebtPageResult {
  records: FinDebtBill[]
  total: number
  brandStats: FinDebtBrandStats
}

/** 欠款單查詢參數 */
export interface FinDebtQuery {
  page?: number
  size?: number
  groupId?: string
  groupName?: string
  storeName?: string
  brand?: string
  billNo?: string
  batchNo?: string
  flowNo?: string
  status?: string
  source?: string
  channel?: string
  /** 借款日期起 YYYY-MM-DD */
  loanFrom?: string
  /** 借款日期止 YYYY-MM-DD */
  loanTo?: string
}

/** 新增扣款（還款）請求 */
export interface DebtRepaymentPayload {
  /** 扣款日期 YYYY-MM-DD，不傳默認當天 */
  date?: string
  channel: string
  amount: number
  remark?: string
}

/** 欠款單分頁查詢（含品牌待還統計） */
export function fetchFinDebts(params: FinDebtQuery) {
  return request.get<unknown, FinDebtPageResult>('/fin/debts', { params, ...SILENT })
}

/** 欠款單詳情（含還款明細） */
export function fetchFinDebtDetail(billNo: string) {
  return request.get<unknown, FinDebtBill>(`/fin/debts/${billNo}`, SILENT)
}

/** 新增扣款（還款記錄） */
export function addFinDebtRepayment(billNo: string, data: DebtRepaymentPayload) {
  return request.post<unknown, void>(`/fin/debts/${billNo}/repayments`, data, SILENT)
}

/** 刪除還款記錄 */
export function deleteFinDebtRepayment(id: number) {
  return request.delete<unknown, void>(`/fin/debts/repayments/${id}`, SILENT)
}
