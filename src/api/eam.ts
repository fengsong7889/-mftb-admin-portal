/**
 * EAM 企業資產管理擴展 API
 *
 * 承載物資管理全生命週期閉環的業務數據（前端 mock 先行，待界面確認後再設計後端表/接口）：
 *   基礎數據（分類/型號/位置）→ 採購申請 → 採購訂單 → 驗收入庫 →
 *   台賬 → 領用/借用 → 歸還 → 調撥/交接 → 維修/賠付 → 報廢
 *
 * 台賬主數據與操作流水仍由 ./asset 承載，本文件僅擴展 EAM 專屬實體。
 */
import request, { isBackendUnavailable, SILENT_HEADER } from './request'
import type { AssetParameterSource } from '../utils/assetParams'
import {
  mockFetchCategoryList,
  mockCreateCategory,
  mockUpdateCategory,
  mockDeleteCategory,
  mockToggleCategoryStatus,
} from './mock/eamCategoryMock'
import {
  mockFetchSupplierList,
  mockCreateSupplier,
  mockUpdateSupplier,
  mockDeleteSupplier,
  mockToggleSupplierStatus,
  mockFetchSuppliersDropdown,
  mockFetchSupplierContacts,
  mockSyncSupplierContact,
} from './mock/eamSupplierMock'
import {
  claimAsset,
  fetchAssetDetail,
  fetchAssetList,
  logAssetOperation,
  returnAsset,
  updateAsset,
  type AssetItem,
  type PageResult,
} from './asset'

/* ==================== 通用類型 ==================== */

/** 參數模板字段定義（分類維度定義、型號維度填值） */
export interface ParamField {
  /** 字段鍵（英文，如 cpu / memory） */
  key: string
  /** 字段顯示名（如 CPU / 內存） */
  label: string
  /** 字段類型 */
  type: 'text' | 'number' | 'select'
  /** 計量單位（如 GHz / GB） */
  unit?: string
  /** select 類型的可選項 */
  options?: string[]
}

/* ==================== 基礎數據 ==================== */

/** 資產分類（樹形，含參數模板） */
export interface AssetCategory {
  id: number
  /** 分類編碼（唯一，如 0101 / 010101） */
  code: string
  name: string
  /** 父級 ID，0 為頂級 */
  parentId: number
  /** 狀態：enabled / disabled */
  status: 'enabled' | 'disabled'
  /** 該分類下資產需填寫的參數模板 */
  paramTemplate: ParamField[]
  sort: number
  remark?: string
  updatedBy?: string
  updatedAt?: string
}

/** 资产品牌庫（所属分类 → 资产品牌） */
export interface AssetBrand {
  id: number
  /** 所属分类编码 */
  categoryCode: string
  /** 资产品牌中文 */
  brandZh: string
  /** 资产品牌英文 */
  brandEn: string
  /** 资产品牌LOGO URL */
  brandLogo?: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 产品庫（资产品牌 → 产品） */
export interface AssetModel {
  id: number
  /** 所属分类编码 */
  categoryCode: string
  /** 所属资产品牌ID */
  brandId: number
  /** 资产品牌中文（冗余，方便展示） */
  brandZh: string
  /** 资产品牌英文（冗余） */
  brandEn?: string
  /** 资产品牌LOGO（冗余） */
  brandLogo?: string
  /** 产品名称（如 ThinkPad X1 Carbon 笔记本） */
  name: string
  /** 计量单位 */
  unit: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 存放位置（按省-市-区-详细地址维度，无层级关系） */
export interface AssetLocation {
  id: number
  code: string
  name: string
  /** @deprecated 保留兼容旧数据，前端始终为 0 */
  parentId?: number
  /** @deprecated 保留兼容旧数据，不再使用 */
  type?: string
  sort: number
  province?: string
  city?: string
  district?: string
  address?: string
  remark?: string
  updatedBy?: string
  updatedAt?: string
}

/** 參數類型（按分類維度管理） */
export interface ParamType {
  id: number
  /** 所屬分類編碼（如 010101=筆記本電腦） */
  categoryCode: string
  /** 參數編碼（分類內唯一，如 chip / memory / storage） */
  code: string
  /** 參數名稱（如 芯片 / 內存 / 存儲） */
  name: string
  /** 計量單位（如 GB / 英寸 / W） */
  unit?: string
  /** 值類型：select=下拉選擇, text=文本, number=數字 */
  valueType: 'select' | 'text' | 'number'
  /** 狀態 */
  status: 'enabled' | 'disabled'
  /** 排序 */
  sort: number
  /** 描述 */
  description?: string
  updatedBy?: string
  updatedAt?: string
}

/** 參數值（某個參數類型的可選項） */
export interface ParamValue {
  id: number
  /** 所屬參數類型編碼 */
  paramTypeCode: string
  /** 可選值（如 A17 Pro / 16GB / 256GB） */
  value: string
  /** 排序 */
  sort: number
  /** 狀態 */
  status: 'enabled' | 'disabled'
  updatedBy?: string
  updatedAt?: string
}

/** 參數類型查詢 */
export interface ParamTypeQuery {
  name?: string
  code?: string
  status?: string
  updatedBy?: string
  updatedAtStart?: string
  updatedAtEnd?: string
  page?: number
  size?: number
}

/* ==================== 資產標籤模板 ==================== */

/** 資產可展示字段定義（標籤模板可選字段） */
export interface AssetDisplayField {
  key: string
  label: string
}

/** 資產可展示字段列表（標籤模板配置時可選） */
export const ASSET_DISPLAY_FIELDS: AssetDisplayField[] = [
  { key: 'assetNo', label: '資產編號' },
  { key: 'assetType', label: '資產分類' },
  { key: 'brand', label: '資產品牌' },
  { key: 'assetName', label: '資產名稱' },
  { key: 'status', label: '狀態' },
  { key: 'userName', label: '使用人' },
  { key: 'department', label: '所在部門' },
  { key: 'company', label: '所屬公司' },
  { key: 'location', label: '存放地點' },
  { key: 'source', label: '採購形式' },
  { key: 'purchaseDate', label: '購買日期' },
]

/** 字段示例值（僅用於配置時預覽標籤效果，非真實資產數據） */
export const ASSET_FIELD_SAMPLE_VALUES: Record<string, string> = {
  assetNo: 'ZC-2026-0001',
  assetType: 'IT設備',
  brand: 'Apple',
  assetName: 'MacBook Pro 14',
  status: '在用',
  userName: '張三',
  department: '技術部',
  company: '閃蜂科技',
  location: '總部辦公區 3F',
  source: '集中採購',
  purchaseDate: '2026-03-15',
}

/** 資產標籤模板 */
export interface AssetTagTemplate {
  id: number
  /** 標籤名稱 */
  name: string
  /** 標籤描述 */
  description?: string
  /** 標籤背景色 */
  bgColor: string
  /** 標籤文字顏色 */
  textColor: string
  /** 展示字段配置（資產字段 key 列表） */
  displayFields: string[]
  /** 狀態 */
  status: 'enabled' | 'disabled'
  /** 排序 */
  sort: number
  /** 已綁定資產數量 */
  boundCount?: number
  updatedBy?: string
  updatedAt?: string
}

/* ==================== 採購入庫 ==================== */

/** 採購申請明細行 */
export interface PurchaseRequestItem {
  modelId: number
  /** 冗餘存型號名，便於列表展示 */
  modelName: string
  qty: number
  /** 預估單價 */
  estPrice: number
  remark?: string
}

/** 採購申請 */
export interface PurchaseRequest {
  id: number
  reqNo: string
  /** 申請標題 */
  title: string
  department: string
  applicant: string
  /** 預算金額 */
  budget: number
  /** 所屬品牌：1=閃蜂, 2=mFood */
  brand?: number
  items: PurchaseRequestItem[]
  /** 申請理由 */
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  /** 審批人 */
  approver?: string
  /** 審批意見 */
  approveRemark?: string
  /** 關聯生成的採購訂單 ID */
  orderId?: number
  createdAt: string
}

/** 採購訂單明細行 */
export interface PurchaseOrderItem {
  id?: number
  groupId?: string
  /** 唯一行 key（前端用） */
  key?: string
  modelId?: number
  modelName?: string
  /** 資產分類 */
  categoryId?: number
  categoryName?: string
  categoryCode?: string
  /** 资产品牌 */
  brandId?: number
  brandName?: string
  /** 參數信息 */
  params?: Record<string, string>
  /** 採購形式：購買 / 租賃 */
  purchaseType?: 'purchase' | 'lease'
  qty: number
  /** 採購單價 */
  price: number
  /** 實際成交單價 */
  confirmedPrice?: number
  /** 已驗收入庫數量 */
  receivedQty: number
  /** 累計退貨數量（終態，PR-2） */
  returnedQty?: number
  /** 累計換貨在途數量（PR-2） */
  exchangedQty?: number
}

/** 供應商分組（一個採購訂單可包含多個供應商） */
export interface PurchaseOrderSupplierGroup {
  id: string
  supplier: string
  /** 供應商 ID（用於下拉選擇和聯繫人查詢） */
  supplierId?: number
  contact?: string
  contactPhone?: string
  orderDate?: string
  trackingNo?: string
  /** 收貨方式：自取 / 供應商送貨上門 / 快遞發貨 */
  deliveryMethod?: 'self_pickup' | 'supplier_delivery' | 'express'
  /** 預計收貨日期（從全局移入分組） */
  expectedReceiveDate?: string
  items: PurchaseOrderItem[]
  /** 列表接口返回的分組級統計（摘要不含 items 明細時使用） */
  totalQty?: number
  receivedQty?: number
  pendingQty?: number
  /** 分組級累計退貨（終態，PR-2） */
  returnedQty?: number
}

/** 採購執行狀態 */
export type ExecStatus = 'pending' | 'purchasing' | 'completed'

/** 採購執行單（原採購訂單） */
export interface PurchaseOrder {
  id: number
  poNo: string
  /** 關聯採購申請 ID（0 表示直接下單） */
  reqId: number
  /** 所屬品牌：1=閃蜂, 2=mFood */
  brand?: number
  supplier: string
  /** 訂單金額（預估） */
  amount: number
  /** 實際成交金額（採購人員回填） */
  confirmedAmount?: number
  /** 預計交貨日期 */
  deliveryDate: string
  items: PurchaseOrderItem[]
  /** 供應商分組（多供應商場景） */
  supplierGroups?: PurchaseOrderSupplierGroup[]
  /** 驗收入庫狀態：pending=待驗收 / partial=部分入庫 / received=全部入庫 */
  status: 'pending' | 'partial' | 'received'
  /** 採購執行狀態：pending=待處理 / purchasing=採購中 / completed=採購完成 */
  execStatus: ExecStatus
  /** 已驗收數量 */
  acceptedQty?: number
  /** 退貨數量 */
  returnQty?: number
  /** 換貨數量 */
  exchangeQty?: number
  /** 讓步接收數量 */
  concessionQty?: number
  /** 快遞單號（兼容舊數據） */
  trackingNo?: string
  /** 採購經辦人 */
  purchaser?: string
  /** 服務部門 */
  department?: string
  /** 實際下單日期（兼容舊數據） */
  orderDate?: string
  contact?: string
  contactPhone?: string
  remark?: string
  /** 明细数量合计（后端列表接口返回，用于验收进度展示） */
  totalQty?: number
  /** 关联采购申请编号（后端列表接口返回） */
  reqNo?: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 入庫批次明細行 */
export interface InboundBatchItem {
  id?: number
  orderItemId?: number
  groupId?: string
  inboundDate?: string
  locationName?: string | null
  modelId: number
  modelName: string
  qty: number
  locationId: number | null
  /** 驗收處置方式：pass=通過 / return=退貨 / exchange=換貨 / concession=讓步接收 */
  disposition?: 'pass' | 'return' | 'exchange' | 'concession'
  /** 驗收不通過原因 */
  rejectReason?: string
  /** 驗收照片 [{name, dataUrl}] */
  photos?: { name: string; dataUrl: string }[]
  /** 配件清單 [{name, qty}] */
  accessories?: { name: string; qty: number }[]
  /** 入庫後生成的資產編號 */
  assetNos: string[]
  /** 換貨二次發貨物流單號（PR-3） */
  exchangeTrackingNo?: string
  /** 換貨預計到貨日（PR-3） */
  exchangeExpectedDate?: string
  /** 換貨狀態：pending/shipped/received/closed（PR-3） */
  exchangeStatus?: 'pending' | 'shipped' | 'received' | 'closed'
  /** 二次驗收生成的批次 ID（PR-3） */
  followupBatchId?: number
}

/** 驗收入庫批次 */
export interface InboundBatch {
  generatedAssetCount: number
  id: number
  batchNo: string
  poId: number
  poNo: string
  /** 所屬品牌：1=閃蜂, 2=mFood（創建批次時從採購訂單帶入） */
  brand?: number
  inboundDate: string
  operator: string
  items: InboundBatchItem[]
  /** 入庫總數 */
  totalQty: number
  /** 已驗收數量 */
  acceptedQty: number
  /** 未驗收數量 */
  pendingQty: number
  /** 退貨數量 */
  returnQty: number
  /** 換貨數量 */
  exchangeQty: number
  /** 讓步接收數量 */
  concessionQty: number
  /** 採購事由 */
  purchaseReason?: string
  remark?: string
  createdAt: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/* ==================== 領用 / 借用 / 歸還 ==================== */

/** 領用單（長期配給） */
export interface ClaimRecord {
  id: number
  claimNo: string
  assetId: number
  assetNo: string
  assetName: string
  /** 资产分类 */
  assetType: string
  /** 资产品牌 */
  brand: string
  /** 領用人 */
  claimant: string
  department: string
  claimDate: string
  /** 领用原因 */
  claimReason?: string
  /** 归还日期 */
  returnDate?: string
  /** 归还原因 */
  returnReason?: string
  operator: string
  /** 状态：claimed=使用中，returned=已归还 */
  status: 'claimed' | 'returned'
  remark?: string
}

/** 借用記錄（臨時借用，含歸還期限/續借/逾期） */
export interface BorrowRecord {
  id: number
  borrowNo: string
  assetId: number
  assetNo: string
  assetName: string
  borrower: string
  department: string
  borrowDate: string
  /** 應歸還日期 */
  dueDate: string
  purpose: string
  /** borrowing=借用中 / returned=已歸還 / overdue=已逾期 */
  status: 'borrowing' | 'returned' | 'overdue'
  /** 續借次數 */
  renewCount: number
  returnDate?: string
  operator: string
  remark?: string
  createdAt: string
}

/** 歸還記錄 */
export interface ReturnRecord {
  id: number
  returnNo: string
  assetId: number
  assetNo: string
  assetName: string
  /** 歸還人 */
  returnUser: string
  returnDate: string
  /** 歸還狀況 */
  condition: 'normal' | 'damaged' | 'lost'
  operator: string
  /** 關聯借用單 ID（借用歸還時有值） */
  borrowId?: number
  remark?: string
  /** 關聯賠付單 ID（狀況異常時有值） */
  compensationId?: number
}

/* ==================== 調撥 / 交接 ==================== */

/** 交接資產明細（詳情頁返回） */
export interface HandoverItem extends AssetParameterSource {
  assetId: number
  assetNo: string
  assetName: string
  assetType?: string
  /** 交接前部門 */
  oldDepartment?: string | null
  /** 交接後部門 */
  newDepartment?: string | null
  /** 交接时的人员与部门快照，不从当前台账回填。 */
  fromUser?: string | null
  fromDept?: string | null
  toUser?: string | null
  toDept?: string | null
}

/** 交接記錄（離職/調崗批量交接） */
export interface HandoverRecord {
  id: number
  handoverNo: string
  /** 交出人 */
  fromUserName: string
  fromDepartment: string
  /** 接收人 */
  toUserName: string
  toDepartment: string
  /** 接收人类型：employee=员工 / department=部门 */
  receiverType?: 'employee' | 'department'
  handoverDate: string
  assetIds: number[]
  assetCount: number
  /** 交接原因：resign=離職 / transfer=調崗 / other */
  reason: 'resign' | 'transfer' | 'other'
  status: 'done' | 'cancelled'
  operatorName: string
  remark?: string
  createdAt: string
  updatedAt?: string
  updatedBy?: string
  /** 交接資產明細（僅詳情接口返回） */
  items?: HandoverItem[]
}

/** 四个业务字段保持独立；明细快照由后端在交接时保存。 */
export type HandoverSaveData = Pick<HandoverRecord,
  'fromUserName' | 'fromDepartment' | 'toUserName' | 'toDepartment' | 'receiverType' |
  'handoverDate' | 'assetIds' | 'reason' | 'operatorName' | 'remark'>

/** 兼容旧接口，只回退到同一单据的快照，保留空值与原始明细字段。 */
function normalizeHandoverRecord(record: HandoverRecord): HandoverRecord {
  return {
    ...record,
    items: record.items?.map(item => ({
      ...item,
      fromUser: item.fromUser ?? record.fromUserName,
      fromDept: item.fromDept ?? item.oldDepartment ?? record.fromDepartment,
      toUser: item.toUser ?? record.toUserName,
      toDept: item.toDept ?? item.newDepartment ?? record.toDepartment,
    })),
  }
}

/* ==================== 損壞賠付 ==================== */

/** 損壞賠付單 */
export interface CompensationRecord {
  id: number
  compNo: string
  assetId: number
  assetNo: string
  assetName: string
  /** 損失類型：損壞 / 遺失 */
  damageType: 'damage' | 'loss'
  /** 原因分類：人為 / 自然 / 第三方 / 質量 */
  causeType: 'human' | 'natural' | 'third_party' | 'quality'
  /** 責任人 */
  responsiblePerson: string
  /** 責任部門 */
  responsibleDept: string
  /** 定責說明 */
  liabilityDesc: string
  /** 賠付方式：維修費用 / 重置價格 / 折舊後價值 */
  compType: 'repair_cost' | 'replace_price' | 'depreciated'
  /** 賠付金額 */
  compAmount: number
  /** pending=待定責 / confirmed=已定責 / paid=已賠付 */
  status: 'pending' | 'confirmed' | 'paid'
  paidDate?: string
  /** 關聯歸還記錄 ID */
  returnId?: number
  operator: string
  createdAt: string
}

/* ==================== 查詢參數 ==================== */

export interface EamPageQuery {
  page?: number
  size?: number
  keyword?: string
  status?: string
  department?: string
}

export interface PurchaseOrderQuery extends EamPageQuery {
  poNo?: string
  processNo?: string
  supplier?: string
  /** 入庫狀態：pending=待驗收 / partial=部分入庫 / received=全部入庫 */
  status?: string
  execStatus?: string
  purchaser?: string
  createdAtStart?: string
  createdAtEnd?: string
  updatedAtStart?: string
  updatedAtEnd?: string
}

export interface ModelQuery extends EamPageQuery {
  categoryCode?: string
  brandId?: number
  brandZh?: string
  name?: string
  updatedBy?: string
  updatedAtStart?: string
  updatedAtEnd?: string
}

export interface BorrowQuery extends EamPageQuery {
  borrower?: string
  /** 是否僅查逾期 */
  overdueOnly?: boolean
}

/** 資產看板統計 */
export interface EamDashboard {
  totalCount: number
  inUseCount: number
  idleCount: number
  inRepairCount: number
  scrappedCount: number
  /** 資產原值合計 */
  totalValue: number
  /** 閒置率（%） */
  idleRate: number
  /** 借用中數量 */
  borrowingCount: number
  /** 借用逾期數量 */
  overdueCount: number
  /** 待定責賠付單數量 */
  pendingCompCount: number
  /** 待審批採購申請數量 */
  pendingReqCount: number
  /** 待收貨訂單數量 */
  pendingOrderCount: number
  typeDistribution: { type: string; count: number }[]
  departmentDistribution: { department: string; count: number }[]
  categoryDistribution: { category: string; count: number }[]
  monthlyInbound: { month: string; count: number; value: number }[]
}

/* ==================== 工具函數 ==================== */

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 加減天數，返回 YYYY-MM-DD */
function shiftDay(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 生成單據編號：PREFIX-YYYY-### */
function genNo(prefix: string, seq: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`
}

/** 當前登錄人姓名（mock 兜底時記錄「最後更新人」用） */
function currentUserName(): string {
  try {
    return JSON.parse(localStorage.getItem('user_info') || '{}')?.name || 'current_user'
  } catch {
    return 'current_user'
  }
}

/** 後端訂單記錄 → 前端 PurchaseOrder（列表/詳情通用）
 *  - items 缺省為 []（列表接口不返回明細）
 *  - 時間格式 T → 空格 */
function normalizePurchaseOrder(o: Record<string, unknown>): PurchaseOrder {
  return {
    ...(o as unknown as PurchaseOrder),
    brand: Number(o.brand) > 0 ? Number(o.brand) : undefined,
    reqNo: typeof o.reqNo === 'string' ? o.reqNo : undefined,
    items: (o.items as PurchaseOrderItem[] | undefined) || [],
    // 列表接口返回的分組摘要不含 items，補空數組保證結構完整
    supplierGroups: (o.supplierGroups as PurchaseOrderSupplierGroup[] | undefined)
      ?.map((g) => ({ ...g, items: g.items || [] })),
    amount: Number(o.amount ?? 0),
    confirmedAmount: o.confirmedAmount != null ? Number(o.confirmedAmount) : undefined,
    createdAt: String(o.createdAt || '').replace('T', ' '),
    updatedAt: o.updatedAt != null ? String(o.updatedAt).replace('T', ' ') : undefined,
  }
}

function paginate<T>(list: T[], page?: number, size?: number): PageResult<T> {
  const p = page || 1
  const s = size || 10
  return { records: list.slice((p - 1) * s, p * s), total: list.length }
}

function matchKeyword(row: unknown, fields: string[], keyword?: string): boolean {
  if (!keyword) return true
  const q = keyword.toLowerCase().trim()
  const r = row as Record<string, unknown>
  return fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q))
}

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

const D = today()

/* ==================== Mock 數據：採購入庫 ==================== */

let mockPurchaseRequests: PurchaseRequest[] = [
  {
    id: 1, reqNo: 'CG-2024-001', title: '研发部新員工入職設備採購', department: '研发部', applicant: '張三(M001)',
    budget: 80000,
    items: [
      { modelId: 1, modelName: 'ThinkPad X1 Carbon 筆記本', qty: 3, estPrice: 15800 },
      { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 3, estPrice: 4200 },
    ],
    reason: '2024 Q4 新增 3 名研發工程師，需配備辦公設備',
    status: 'approved', approver: '李四(M002)', approveRemark: '同意，按預算執行', orderId: 1,
    createdAt: '2024-09-01 09:20:00',
  },
  {
    id: 2, reqNo: 'CG-2024-002', title: '行政部辦公家具補充', department: '行政部', applicant: '王五(M003)',
    budget: 15000,
    items: [
      { modelId: 6, modelName: '標準職員椅', qty: 8, estPrice: 980 },
      { modelId: 7, modelName: '1.4 米職員桌', qty: 4, estPrice: 1580 },
    ],
    reason: '三樓工位擴充，需補充桌椅',
    status: 'pending',
    createdAt: '2024-09-15 14:00:00',
  },
  {
    id: 3, reqNo: 'CG-2024-003', title: '機房服務器擴容', department: '技术部', applicant: '趙六(M004)',
    budget: 130000,
    items: [{ modelId: 4, modelName: '戴爾服務器 R750', qty: 2, estPrice: 65000 }],
    reason: '業務量增長，現有機房資源不足',
    status: 'rejected', approver: '李四(M002)', approveRemark: '本季度預算已滿，延至下季度重新申請',
    createdAt: '2024-08-20 10:00:00',
  },
]

let mockPurchaseOrders: PurchaseOrder[] = []

const mockInboundBatches: InboundBatch[] = []

/* ==================== Mock 數據：領用 / 借用 / 歸還 ==================== */

let mockClaims: ClaimRecord[] = [
  {
    id: 1, claimNo: 'LY-2024-001', assetId: 1, assetNo: 'ZC-2024-0001', assetName: 'ThinkPad X1 Carbon 筆記本',
    assetType: '笔记本电脑', brand: '联想', claimant: '張三(M001)', department: '研发部', claimDate: '2024-01-20',
    claimReason: '新員工入職配發', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 2, claimNo: 'LY-2024-002', assetId: 3, assetNo: 'ZC-2024-0003', assetName: '人體工學椅',
    assetType: '办公家具', brand: '西昊', claimant: '趙六(M004)', department: '人事部', claimDate: '2024-02-25',
    claimReason: '办公室改造', returnDate: '2024-06-10', returnReason: '项目结束不再使用', operator: '李四(M002)',
    status: 'returned',
  },
  {
    id: 3, claimNo: 'LY-2024-003', assetId: 5, assetNo: 'ZC-2024-0005', assetName: 'Dell 27 吋 4K 顯示器',
    assetType: '显示器', brand: '戴尔', claimant: '張三(M001)', department: '研发部', claimDate: '2024-02-10',
    claimReason: '研發雙屏需求', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 4, claimNo: 'LY-2024-004', assetId: 8, assetNo: 'ZC-2024-0008', assetName: '機械鍵盤',
    assetType: '配件', brand: 'HHKB', claimant: '張三(M001)', department: '研发部', claimDate: '2024-03-05',
    claimReason: '個人偏好', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 5, claimNo: 'LY-2024-005', assetId: 10, assetNo: 'ZC-2024-0010', assetName: '投影儀',
    assetType: '电子设备', brand: '爱普生', claimant: '錢七(M007)', department: '设计部', claimDate: '2024-03-12',
    claimReason: '設計評審演示', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 6, claimNo: 'LY-2024-006', assetId: 12, assetNo: 'ZC-2024-0012', assetName: 'iPad Pro 12.9',
    assetType: '平板电脑', brand: 'Apple', claimant: '錢七(M007)', department: '设计部', claimDate: '2024-03-15',
    claimReason: 'UI 設計校色', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 7, claimNo: 'LY-2024-007', assetId: 15, assetNo: 'ZC-2024-0015', assetName: '標準職員椅',
    assetType: '办公家具', brand: '西昊', claimant: '趙六(M004)', department: '人事部', claimDate: '2024-04-01',
    claimReason: '新工位配置', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 8, claimNo: 'LY-2024-008', assetId: 18, assetNo: 'ZC-2024-0018', assetName: 'MacBook Pro 14',
    assetType: '笔记本电脑', brand: 'Apple', claimant: '王五(M003)', department: '运营部', claimDate: '2024-04-10',
    claimReason: '運營數據分析', operator: '李四(M002)', status: 'claimed', remark: '',
  },
]

let mockBorrows: BorrowRecord[] = [
  {
    id: 1, borrowNo: 'JY-2024-001', assetId: 5, assetNo: 'ZC-2022-0089', assetName: '投影儀',
    borrower: '錢七(M007)', department: '设计部', borrowDate: shiftDay(D, -12), dueDate: shiftDay(D, -2),
    purpose: '客戶提案演示', status: 'borrowing', renewCount: 0, operator: '李四(M002)',
    remark: '演示結束應立即歸還', createdAt: `${shiftDay(D, -12)} 09:00:00`,
  },
  {
    id: 2, borrowNo: 'JY-2024-002', assetId: 6, assetNo: 'ZC-2021-0042', assetName: '台式機 iMac',
    borrower: '孫八(M008)', department: '产品部', borrowDate: shiftDay(D, -6), dueDate: shiftDay(D, 8),
    purpose: '臨時設計外包項目使用', status: 'borrowing', renewCount: 1, operator: '李四(M002)',
    createdAt: `${shiftDay(D, -6)} 14:20:00`,
  },
  {
    id: 3, borrowNo: 'JY-2024-003', assetId: 2, assetNo: 'ZC-2024-0002', assetName: 'iPhone 15 Pro',
    borrower: '王五(M003)', department: '市场部', borrowDate: shiftDay(D, -30), dueDate: shiftDay(D, -20),
    purpose: '產品拍攝測試機', status: 'returned', renewCount: 0, returnDate: shiftDay(D, -21),
    operator: '李四(M002)', createdAt: `${shiftDay(D, -30)} 10:00:00`,
  },
]

let mockReturns: ReturnRecord[] = [
  {
    id: 1, returnNo: 'GH-2024-001', assetId: 6, assetNo: 'ZC-2021-0042', assetName: '台式機 iMac',
    returnUser: '錢七(M007)', returnDate: '2024-08-10', condition: 'normal', operator: '人事部',
    remark: '員工離職歸還',
  },
  {
    id: 2, returnNo: 'GH-2024-002', assetId: 2, assetNo: 'ZC-2024-0002', assetName: 'iPhone 15 Pro',
    returnUser: '王五(M003)', returnDate: shiftDay(D, -21), condition: 'damaged', operator: '李四(M002)',
    borrowId: 3, remark: '屏幕邊框磕碰，已開賠付單', compensationId: 1,
  },
]

/* ==================== Mock 數據：交接 / 賠付 ==================== */

let mockHandovers: HandoverRecord[] = [
  {
    id: 1, handoverNo: 'JJ-2024-001', fromUserName: '錢七(M007)', fromDepartment: '设计部',
    toUserName: '孫八(M008)', toDepartment: '产品部', handoverDate: '2024-08-10',
    assetIds: [6], assetCount: 1, reason: 'resign', status: 'done', operatorName: '人事部',
    remark: '離職資產批量交接', createdAt: '2024-08-10 15:00:00',
  },
]

let mockCompensations: CompensationRecord[] = [
  {
    id: 1, compNo: 'PF-2024-001', assetId: 2, assetNo: 'ZC-2024-0002', assetName: 'iPhone 15 Pro',
    damageType: 'damage', causeType: 'human', responsiblePerson: '王五(M003)', responsibleDept: '市场部',
    liabilityDesc: '借用期間未使用保護殼，跌落導致邊框變形、屏幕破裂',
    compType: 'repair_cost', compAmount: 1800, status: 'confirmed', returnId: 2,
    operator: '李四(M002)', createdAt: `${shiftDay(D, -20)} 09:30:00`,
  },
  {
    id: 2, compNo: 'PF-2024-002', assetId: 9, assetNo: 'ZC-2024-0004', assetName: '會議桌',
    damageType: 'damage', causeType: 'third_party', responsiblePerson: '外判裝修公司', responsibleDept: '行政部',
    liabilityDesc: '辦公室裝修搬運過程中桌面劃傷',
    compType: 'depreciated', compAmount: 600, status: 'pending',
    operator: '行政部', createdAt: `${shiftDay(D, -8)} 16:00:00`,
  },
]

/* ==================== API：資產分類 ==================== */

/** 分類列表（平鋪返回，頁面自行構樹） */
export async function fetchCategoryList(params?: { keyword?: string; name?: string; code?: string; updatedBy?: string; updatedAtStart?: string; updatedAtEnd?: string }, allowMockFallback = true): Promise<AssetCategory[]> {
  try {
    const data = await request.get<unknown, AssetCategory[]>('/eam/basic/categories', { params, headers: { [SILENT_HEADER]: '1' } })
    return (data || []).map((c: any) => ({
      ...c,
      paramTemplate: typeof c.paramTemplate === 'string' ? (() => { try { return JSON.parse(c.paramTemplate) } catch { return [] } })() : (c.paramTemplate || []),
    }))
  } catch (e) {
    if (allowMockFallback && isBackendUnavailable(e)) return mockFetchCategoryList()
    throw e
  }
}

export async function createCategory(data: Omit<AssetCategory, 'id'>): Promise<number> {
  try {
    return await request.post<unknown, number>('/eam/basic/categories', {
      ...data,
      paramTemplate: JSON.stringify(data.paramTemplate || []),
    })
  } catch (e) {
    if (isBackendUnavailable(e)) return mockCreateCategory(data)
    throw e
  }
}

export async function updateCategory(id: number, data: Partial<AssetCategory>): Promise<void> {
  try {
    const payload: Record<string, unknown> = { ...data }
    if (data.paramTemplate) payload.paramTemplate = JSON.stringify(data.paramTemplate)
    await request.put(`/eam/basic/categories/${id}`, payload)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockUpdateCategory(id, data)
    throw e
  }
}

export async function deleteCategory(id: number): Promise<void> {
  try {
    await request.delete(`/eam/basic/categories/${id}`)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockDeleteCategory(id)
    throw e
  }
}

export async function toggleCategoryStatus(id: number): Promise<void> {
  try {
    await request.put(`/eam/basic/categories/${id}/toggle`)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockToggleCategoryStatus(id)
    throw e
  }
}

/* ==================== API：资产品牌庫 ==================== */

export interface BrandQuery {
  categoryCode?: string
  brandZh?: string
  updatedBy?: string
  updatedAtStart?: string
  updatedAtEnd?: string
}

export async function fetchBrandList(params?: BrandQuery): Promise<AssetBrand[]> {
    return await request.get<unknown, AssetBrand[]>('/eam/basic/brands', { params, headers: { [SILENT_HEADER]: '1' } })
}

export async function createBrand(data: Omit<AssetBrand, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    return await request.post<unknown, number>('/eam/basic/brands', data)
}

export async function updateBrand(id: number, data: Partial<AssetBrand>): Promise<void> {
    await request.put(`/eam/basic/brands/${id}`, data)
}

export async function deleteBrand(id: number): Promise<void> {
    await request.delete(`/eam/basic/brands/${id}`)
}

/* ==================== API：产品庫 ==================== */

export async function fetchModelList(params?: ModelQuery): Promise<PageResult<AssetModel>> {
    return await request.get<unknown, PageResult<AssetModel>>('/eam/basic/models', { params, headers: { [SILENT_HEADER]: '1' } })
}

export async function fetchModelDetail(id: number): Promise<AssetModel> {
    return await request.get<unknown, AssetModel>(`/eam/basic/models/${id}`)
}

export async function createModel(data: Omit<AssetModel, 'id' | 'createdAt'>): Promise<number> {
    return await request.post<unknown, number>('/eam/basic/models', data)
}

export async function updateModel(id: number, data: Partial<AssetModel>): Promise<void> {
    await request.put(`/eam/basic/models/${id}`, data)
}

export async function deleteModel(id: number): Promise<void> {
    await request.delete(`/eam/basic/models/${id}`)
}

/* ==================== API：存放位置 ==================== */

export async function fetchLocationList(params?: { name?: string; code?: string; province?: string; city?: string; district?: string; updatedBy?: string; keyword?: string }): Promise<AssetLocation[]> {
  return await request.get<unknown, AssetLocation[]>('/eam/basic/locations', { params, headers: { [SILENT_HEADER]: '1' } })
}

export async function createLocation(data: Omit<AssetLocation, 'id'>): Promise<number> {
    return await request.post<unknown, number>('/eam/basic/locations', data)
}

export async function updateLocation(id: number, data: Partial<AssetLocation>): Promise<void> {
    await request.put(`/eam/basic/locations/${id}`, data)
}

export async function deleteLocation(id: number): Promise<void> {
    await request.delete(`/eam/basic/locations/${id}`)
}

/* ==================== API：資產標籤模板 ==================== */

/** 標籤模板列表 */
export async function fetchAssetTagList(): Promise<AssetTagTemplate[]> {
  return await request.get<unknown, AssetTagTemplate[]>('/eam/basic/asset-tags', { headers: { [SILENT_HEADER]: '1' } })
}

/** 新增標籤模板 */
export async function createAssetTag(data: Omit<AssetTagTemplate, 'id' | 'boundCount'>): Promise<number> {
  return await request.post<unknown, number>('/eam/basic/asset-tags', data, { headers: { [SILENT_HEADER]: '1' } })
}

/** 更新標籤模板 */
export async function updateAssetTag(id: number, data: Partial<AssetTagTemplate>): Promise<void> {
  await request.put(`/eam/basic/asset-tags/${id}`, data, { headers: { [SILENT_HEADER]: '1' } })
}

/** 刪除標籤模板 */
export async function deleteAssetTag(id: number): Promise<void> {
  await request.delete(`/eam/basic/asset-tags/${id}`, { headers: { [SILENT_HEADER]: '1' } })
}

/** 切換標籤模板狀態 */
export async function toggleAssetTagStatus(id: number): Promise<void> {
  await request.put(`/eam/basic/asset-tags/${id}/toggle`, undefined, { headers: { [SILENT_HEADER]: '1' } })
}

/** 資產-標籤綁定項（含模板配置，渲染直接使用） */
export interface AssetTagBindingItem {
  bindingId: number
  isPrimary: boolean
  createdBy?: string
  createdAt?: string
  tag: AssetTagTemplate
}

/** 查詢資產已綁標籤（主標籤排前） */
export async function fetchAssetTagBindings(assetId: number): Promise<AssetTagBindingItem[]> {
  return await request.get<unknown, AssetTagBindingItem[]>(`/eam/basic/assets/${assetId}/tags`, { headers: { [SILENT_HEADER]: '1' } })
}

/** 綁定標籤（主標籤策略由後端決定：顯式指定或無主標籤時自動設主） */
export async function bindAssetTag(assetId: number, tagId: number, isPrimary?: boolean): Promise<void> {
  await request.post(`/eam/basic/assets/${assetId}/tags`, { tagId, isPrimary }, { headers: { [SILENT_HEADER]: '1' } })
}

/** 解綁標籤 */
export async function unbindAssetTag(assetId: number, tagId: number): Promise<void> {
  await request.delete(`/eam/basic/assets/${assetId}/tags/${tagId}`, { headers: { [SILENT_HEADER]: '1' } })
}

/** 設為主標籤（原主標籤自動降級） */
export async function setPrimaryAssetTag(assetId: number, tagId: number): Promise<void> {
  await request.put(`/eam/basic/assets/${assetId}/tags/${tagId}/primary`, undefined, { headers: { [SILENT_HEADER]: '1' } })
}

/** 按模板反查綁定的資產 ID 列表（批量列印「按模板」數據源） */
export async function fetchAssetIdsByTag(tagId: number): Promise<number[]> {
  return await request.get<unknown, number[]>(`/eam/basic/asset-tags/${tagId}/asset-ids`, { headers: { [SILENT_HEADER]: '1' } })
}

/* ==================== 供應商管理 ==================== */

/** 供應商（EAM 基礎數據，採購入庫的供貨方） */
export interface EamSupplier {
  id: number
  /** 供應商編碼（全局唯一） */
  code: string
  /** 供應商名稱 */
  name: string
  /** 聯繫人（舊字段兼容，新數據走 contacts 列表） */
  contactPerson?: string
  /** 聯繫電話（舊字段兼容） */
  contactPhone?: string
  /** 開戶銀行 */
  bankName?: string
  /** 銀行賬號 */
  bankAccount?: string
  remark?: string
  /** 狀態：enabled / disabled */
  status: 'enabled' | 'disabled'
  updatedBy?: string
  updatedAt?: string
  /** 啟用聯繫人數量（後端返回） */
  contactCount?: number
}

/** 供應商聯繫人（新結構：一個供應商可配置多個聯繫人） */
export interface SupplierContactItem {
  id?: number
  supplierId?: number
  contactName: string
  contactPhone?: string
  status?: 'enabled' | 'disabled'
  createdAt?: string
  updatedAt?: string
}

/** 供應商下拉精簡項 */
export interface SupplierDropdownItem {
  id: number
  code: string
  name: string
}

/** 供應商列表查詢參數（後端支持條件過濾） */
export interface SupplierListParams {
  name?: string
  code?: string
  contactPerson?: string
  status?: string
}

/** 供應商列表（支持 name/code/contactPerson/status 條件過濾） */
export async function fetchSupplierList(params?: SupplierListParams): Promise<EamSupplier[]> {
  try {
    return await request.get<unknown, EamSupplier[]>('/eam/basic/suppliers', { params, headers: { [SILENT_HEADER]: '1' } })
  } catch (e) {
    if (isBackendUnavailable(e)) return mockFetchSupplierList()
    throw e
  }
}

/** 供應商新增/編輯參數（編碼由後端按規則自動生成，狀態僅能透過 toggle 變更） */
export type SupplierSaveParams = Omit<EamSupplier, 'id' | 'updatedAt' | 'code' | 'status' | 'contactCount'> & {
  /** 聯繫人列表（新結構） */
  contacts?: SupplierContactItem[]
}

/** 新增供應商，編碼系統自動生成（CGSJ + 6位自增），返回新記錄 ID */
export async function createSupplier(data: SupplierSaveParams): Promise<number> {
  try {
    return await request.post<unknown, number>('/eam/basic/suppliers', data)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockCreateSupplier(data)
    throw e
  }
}

/** 更新供應商（編碼不可修改） */
export async function updateSupplier(id: number, data: SupplierSaveParams): Promise<void> {
  try {
    await request.put(`/eam/basic/suppliers/${id}`, data)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockUpdateSupplier(id, data)
    throw e
  }
}

/** 刪除供應商 */
export async function deleteSupplier(id: number): Promise<void> {
  try {
    await request.delete(`/eam/basic/suppliers/${id}`)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockDeleteSupplier(id)
    throw e
  }
}

/** 切換供應商啟用/停用狀態 */
export async function toggleSupplierStatus(id: number): Promise<void> {
  try {
    await request.put(`/eam/basic/suppliers/${id}/toggle`)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockToggleSupplierStatus(id)
    throw e
  }
}

/** 供應商下拉列表（精簡版：僅 id/code/name，支持關鍵字過濾） */
export async function fetchSuppliersDropdown(keyword?: string): Promise<SupplierDropdownItem[]> {
  try {
    return await request.get<unknown, SupplierDropdownItem[]>('/eam/basic/suppliers/dropdown', {
      params: keyword ? { keyword } : undefined,
      headers: { [SILENT_HEADER]: '1' },
    })
  } catch (e) {
    if (isBackendUnavailable(e)) return mockFetchSuppliersDropdown(keyword)
    throw e
  }
}

/** 查詢指定供應商的所有啟用聯繫人 */
export async function fetchSupplierContacts(supplierId: number): Promise<SupplierContactItem[]> {
  try {
    return await request.get<unknown, SupplierContactItem[]>(`/eam/basic/suppliers/${supplierId}/contacts`, {
      headers: { [SILENT_HEADER]: '1' },
    })
  } catch (e) {
    if (isBackendUnavailable(e)) return mockFetchSupplierContacts(supplierId)
    throw e
  }
}

/** 為指定供應商創建/更新聯繫人（採購訂單手動錄入同步用） */
export async function syncSupplierContact(supplierId: number, contactName: string, contactPhone: string): Promise<void> {
  try {
    await request.post('/eam/basic/supplier-contacts', { supplierId, contactName, contactPhone, status: 'enabled' }, {
      headers: { [SILENT_HEADER]: '1' },
    })
  } catch (e) {
    if (isBackendUnavailable(e)) return mockSyncSupplierContact(supplierId, contactName, contactPhone)
    throw e
  }
}

/* ==================== API：分類配件配置 ==================== */

/** 分類配件配置（同分類下所有產品共用，驗收時可一鍵帶入） */
export interface CategoryAccessory {
  id?: number
  categoryCode?: string
  /** 配件名稱 */
  name: string
  /** 默認數量 */
  defaultQty: number
  /** 狀態：1=啟用, 0=停用 */
  status?: number
  sort?: number
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

const CATEGORY_ACCESSORY_KEY = 'eam_category_accessories'

/** 讀取本地 mock 的分類配件配置（後端不可用時降級） */
function readLocalCategoryAccessories(): Record<string, CategoryAccessory[]> {
  try {
    return JSON.parse(localStorage.getItem(CATEGORY_ACCESSORY_KEY) || '{}') as Record<string, CategoryAccessory[]>
  } catch {
    return {}
  }
}

/** 寫回本地 mock */
function writeLocalCategoryAccessories(all: Record<string, CategoryAccessory[]>): void {
  localStorage.setItem(CATEGORY_ACCESSORY_KEY, JSON.stringify(all))
}

/** 分類配件列表（onlyEnabled=true 時僅返回啟用狀態，驗收彈窗選項用） */
export async function fetchCategoryAccessories(categoryCode: string, onlyEnabled = false): Promise<CategoryAccessory[]> {
  try {
    return await request.get<unknown, CategoryAccessory[]>('/eam/basic/category-accessories', { params: { categoryCode, onlyEnabled } })
  } catch (e) {
    if (!isBackendUnavailable(e)) throw e
    let list = readLocalCategoryAccessories()[categoryCode] || []
    if (onlyEnabled) list = list.filter((a) => a.status !== 0)
    return delay(list)
  }
}

/** 新增分類配件，返回新記錄 ID */
export async function createCategoryAccessory(categoryCode: string, item: { name: string; defaultQty: number }): Promise<number> {
  try {
    return await request.post<unknown, number>(`/eam/basic/category-accessories/${encodeURIComponent(categoryCode)}`, item)
  } catch (e) {
    if (!isBackendUnavailable(e)) throw e
    const all = readLocalCategoryAccessories()
    const list = all[categoryCode] || []
    const id = Date.now()
    all[categoryCode] = [...list, { id, categoryCode, name: item.name, defaultQty: item.defaultQty, status: 1, sort: list.length }]
    writeLocalCategoryAccessories(all)
    return delay(id)
  }
}

/** 修改分類配件（名稱/默認數量） */
export async function updateCategoryAccessory(id: number, item: { name: string; defaultQty: number }): Promise<void> {
  try {
    await request.put(`/eam/basic/category-accessories/item/${id}`, item)
  } catch (e) {
    if (!isBackendUnavailable(e)) throw e
    const all = readLocalCategoryAccessories()
    Object.keys(all).forEach((code) => {
      all[code] = all[code].map((a) => (a.id === id ? { ...a, ...item, updatedAt: now() } : a))
    })
    writeLocalCategoryAccessories(all)
  }
}

/** 啟用/停用分類配件（status: 1=啟用, 0=停用） */
export async function updateCategoryAccessoryStatus(id: number, status: number): Promise<void> {
  try {
    await request.put(`/eam/basic/category-accessories/item/${id}/status`, null, { params: { status } })
  } catch (e) {
    if (!isBackendUnavailable(e)) throw e
    const all = readLocalCategoryAccessories()
    Object.keys(all).forEach((code) => {
      all[code] = all[code].map((a) => (a.id === id ? { ...a, status, updatedAt: now() } : a))
    })
    writeLocalCategoryAccessories(all)
  }
}

/** 刪除分類配件（邏輯刪除） */
export async function deleteCategoryAccessory(id: number): Promise<void> {
  try {
    await request.delete(`/eam/basic/category-accessories/item/${id}`)
  } catch (e) {
    if (!isBackendUnavailable(e)) throw e
    const all = readLocalCategoryAccessories()
    Object.keys(all).forEach((code) => {
      all[code] = all[code].filter((a) => a.id !== id)
    })
    writeLocalCategoryAccessories(all)
  }
}

/* ==================== API：採購申請 ==================== */

export function fetchPurchaseRequestList(params?: EamPageQuery): Promise<PageResult<PurchaseRequest>> {
  let list = [...mockPurchaseRequests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.status && params.status !== 'all') list = list.filter((r) => r.status === params.status)
  if (params?.department) list = list.filter((r) => r.department === params.department)
  if (params?.keyword) {
    list = list.filter((r) => matchKeyword(r, ['reqNo', 'title', 'applicant', 'department'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

export function fetchPurchaseRequestDetail(id: number): Promise<PurchaseRequest> {
  const item = mockPurchaseRequests.find((r) => r.id === id)
  if (!item) return Promise.reject(new Error('採購申請不存在'))
  return delay(item)
}

export function createPurchaseRequest(data: Omit<PurchaseRequest, 'id' | 'reqNo' | 'status' | 'createdAt'>): Promise<number> {
  const id = Math.max(0, ...mockPurchaseRequests.map((r) => r.id)) + 1
  const reqNo = genNo('CG', id)
  mockPurchaseRequests = [
    { ...data, id, reqNo, status: 'pending', createdAt: now() },
    ...mockPurchaseRequests,
  ]
  return delay(id)
}

export function updatePurchaseRequest(id: number, data: Partial<PurchaseRequest>): Promise<void> {
  const idx = mockPurchaseRequests.findIndex((r) => r.id === id)
  if (idx === -1) return Promise.reject(new Error('採購申請不存在'))
  if (mockPurchaseRequests[idx].status !== 'pending') return Promise.reject(new Error('僅待審批的申請可修改'))
  mockPurchaseRequests[idx] = { ...mockPurchaseRequests[idx], ...data }
  return delay(undefined as unknown as void)
}

export function deletePurchaseRequest(id: number): Promise<void> {
  const item = mockPurchaseRequests.find((r) => r.id === id)
  if (!item) return Promise.reject(new Error('採購申請不存在'))
  if (item.orderId) return Promise.reject(new Error('已生成採購訂單，無法刪除'))
  mockPurchaseRequests = mockPurchaseRequests.filter((r) => r.id !== id)
  return delay(undefined as unknown as void)
}

/**
 * 審批採購申請：通過時自動生成採購訂單（供應商取明細首個型號的供應商）
 * @returns 生成的訂單 ID（駁回時返回 undefined）
 */
export async function approvePurchaseRequest(
  id: number,
  approved: boolean,
  approver: string,
  remark?: string,
): Promise<number | undefined> {
  const idx = mockPurchaseRequests.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('採購申請不存在')
  if (mockPurchaseRequests[idx].status !== 'pending') throw new Error('該申請已審批')
  mockPurchaseRequests[idx] = {
    ...mockPurchaseRequests[idx],
    status: approved ? 'approved' : 'rejected',
    approver,
    approveRemark: remark,
  }
  if (!approved) return undefined

  const req = mockPurchaseRequests[idx]
  const amount = req.items.reduce((s, it) => s + it.qty * it.estPrice, 0)
  const orderId = Math.max(0, ...mockPurchaseOrders.map((o) => o.id)) + 1
  const order: PurchaseOrder = {
    id: orderId,
    poNo: genNo('PO', orderId),
    reqId: req.id,
    brand: req.brand,
    supplier: '待定供應商',
    amount,
    deliveryDate: shiftDay(today(), 14),
    items: req.items.map((it) => ({
      modelId: it.modelId, modelName: it.modelName, qty: it.qty, price: it.estPrice, receivedQty: 0,
    })),
    status: 'pending',
    execStatus: 'pending',
    remark: `由採購申請 ${req.reqNo} 審批通過自動生成`,
    createdAt: now(),
  }
  mockPurchaseOrders = [order, ...mockPurchaseOrders]
  mockPurchaseRequests[idx] = { ...mockPurchaseRequests[idx], orderId }
  return orderId
}

/* ==================== API：採購執行 ==================== */

export interface PurchaseOrderExecUpdate {
  execStatus?: ExecStatus
  supplier?: string
  trackingNo?: string
  purchaser?: string
  department?: string
  /** 所屬品牌：1=閃蜂, 2=mFood */
  brand?: number
  orderDate?: string
  contact?: string
  remark?: string
  /** 各型號實際成交單價（兼容舊數據） */
  confirmedPrices?: Record<number, number>
  /** 供應商分組（多供應商場景） */
  supplierGroups?: PurchaseOrderSupplierGroup[]
}

/* ---------- Mock 實現（後端不可用時兜底） ---------- */

// 仅为 Mock 订单关联 Mock 申请，页面不再按真实 reqId 补查本地模拟数据。
function enrichMockPurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  const req = mockPurchaseRequests.find((r) => r.id === order.reqId)
  return { ...order, reqNo: order.reqNo || req?.reqNo, brand: order.brand ?? req?.brand }
}

function mockUpdatePurchaseOrderExec(id: number, data: PurchaseOrderExecUpdate): Promise<void> {
  const idx = mockPurchaseOrders.findIndex((o) => o.id === id)
  if (idx === -1) return Promise.reject(new Error('採購執行單不存在'))
  const o = mockPurchaseOrders[idx]
  if (data.supplier !== undefined) o.supplier = data.supplier
  if (data.trackingNo !== undefined) o.trackingNo = data.trackingNo
  if (data.purchaser !== undefined) o.purchaser = data.purchaser
  if (data.department !== undefined) o.department = data.department
  if (data.brand !== undefined) o.brand = data.brand
  if (data.orderDate !== undefined) o.orderDate = data.orderDate
  if (data.contact !== undefined) o.contact = data.contact
  if (data.remark !== undefined) o.remark = data.remark
  if (data.execStatus !== undefined) o.execStatus = data.execStatus
  if (data.supplierGroups !== undefined) {
    o.supplierGroups = data.supplierGroups
    // 同步更新頂層 items（取所有分組的 items 合併）
    o.items = data.supplierGroups.flatMap((g) => g.items)
    // 重新計算成交金額
    o.confirmedAmount = o.items.reduce((s, it) => s + (it.confirmedPrice || 0) * it.qty, 0)
  }
  if (data.confirmedPrices) {
    const cp = data.confirmedPrices!
    o.items.forEach((it) => {
      const mid = it.modelId
      if (mid && cp[mid] !== undefined) {
        it.confirmedPrice = cp[mid]
      }
    })
    o.confirmedAmount = o.items.reduce((s, it) => s + (it.confirmedPrice || 0) * it.qty, 0)
  }
  mockPurchaseOrders[idx] = o
  o.updatedBy = currentUserName()
  o.updatedAt = now()
  return delay(undefined as unknown as void)
}

/** 更新採購執行信息（回填供應商/價格/快遞/狀態推進） */
export async function updatePurchaseOrderExec(id: number, data: PurchaseOrderExecUpdate): Promise<void> {
  try {
    await request.put(`/eam/purchase/${id}`, data)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockUpdatePurchaseOrderExec(id, data)
    throw e
  }
}

function mockFetchPurchaseOrderList(params?: PurchaseOrderQuery): Promise<PageResult<PurchaseOrder>> {
  let list = mockPurchaseOrders.map(enrichMockPurchaseOrder).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.status && params.status !== 'all') list = list.filter((o) => o.status === params.status)
  if (params?.execStatus && params.execStatus !== 'all') list = list.filter((o) => o.execStatus === params.execStatus)
  if (params?.keyword) {
    list = list.filter((o) => matchKeyword(o, ['poNo', 'supplier', 'contact'], params.keyword))
  }
  if (params?.poNo) {
    list = list.filter((o) => o.poNo.toLowerCase().includes(params.poNo!.toLowerCase()))
  }
  if (params?.supplier) {
    list = list.filter((o) => o.supplier.toLowerCase().includes(params.supplier!.toLowerCase()))
  }
  if (params?.processNo) {
    const matchedReqIds = mockPurchaseRequests
      .filter((r) => r.reqNo.toLowerCase().includes(params.processNo!.toLowerCase()))
      .map((r) => r.id)
    list = list.filter((o) => o.reqId && matchedReqIds.includes(o.reqId))
  }
  if (params?.purchaser) {
    list = list.filter((o) => o.purchaser && o.purchaser.toLowerCase().includes(params.purchaser!.toLowerCase()))
  }
  if (params?.createdAtStart) {
    list = list.filter((o) => o.createdAt >= params.createdAtStart!)
  }
  if (params?.createdAtEnd) {
    list = list.filter((o) => o.createdAt <= params.createdAtEnd! + ' 23:59:59')
  }
  if (params?.updatedAtStart) {
    list = list.filter((o) => o.updatedAt && o.updatedAt >= params.updatedAtStart!)
  }
  if (params?.updatedAtEnd) {
    list = list.filter((o) => o.updatedAt && o.updatedAt <= params.updatedAtEnd! + ' 23:59:59')
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 採購執行列表（優先後端，不可用時降級 Mock） */
export async function fetchPurchaseOrderList(params?: PurchaseOrderQuery): Promise<PageResult<PurchaseOrder>> {
  try {
    const data = await request.get<unknown, PageResult<Record<string, unknown>>>('/eam/purchase', {
      params: {
        page: params?.page,
        size: params?.size,
        poNo: params?.poNo,
        processNo: params?.processNo,
        supplier: params?.supplier,
        status: params?.status,
        purchaser: params?.purchaser,
        execStatus: params?.execStatus,
        createdAtStart: params?.createdAtStart,
        createdAtEnd: params?.createdAtEnd,
        updatedAtStart: params?.updatedAtStart,
        updatedAtEnd: params?.updatedAtEnd,
      },
      headers: { [SILENT_HEADER]: '1' },
    })
    return {
      records: (data.records || []).map((o) => normalizePurchaseOrder(o)),
      total: data.total || 0,
    }
  } catch (e) {
    if (isBackendUnavailable(e)) return mockFetchPurchaseOrderList(params)
    throw e
  }
}

function mockFetchPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  const item = mockPurchaseOrders.find((o) => o.id === id)
  if (!item) return Promise.reject(new Error('採購訂單不存在'))
  return delay(enrichMockPurchaseOrder(item))
}

/** 採購訂單詳情 */
export async function fetchPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  try {
    const data = await request.get<unknown, Record<string, unknown>>(`/eam/purchase/${id}`)
    return normalizePurchaseOrder(data)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockFetchPurchaseOrderDetail(id)
    throw e
  }
}

function mockCreatePurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNo' | 'status' | 'execStatus' | 'createdAt'>): Promise<number> {
  const id = Math.max(0, ...mockPurchaseOrders.map((o) => o.id)) + 1
  const createdAt = now()
  mockPurchaseOrders = [
    {
      ...data, id, poNo: genNo('PO', id), status: 'pending', execStatus: 'pending',
      createdAt,
      // 創建時最後更新人/時間直接取創建人與創建時間
      updatedBy: currentUserName(), updatedAt: createdAt,
    },
    ...mockPurchaseOrders,
  ]
  return delay(id)
}

/** 創建採購訂單（訂單編號由後端按規則配置生成） */
export async function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNo' | 'status' | 'execStatus' | 'createdAt'>): Promise<number> {
  try {
    return await request.post<unknown, number>('/eam/purchase', data)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockCreatePurchaseOrder(data)
    throw e
  }
}

export function updatePurchaseOrder(id: number, data: Partial<PurchaseOrder>): Promise<void> {
  const idx = mockPurchaseOrders.findIndex((o) => o.id === id)
  if (idx === -1) return Promise.reject(new Error('採購訂單不存在'))
  mockPurchaseOrders[idx] = { ...mockPurchaseOrders[idx], ...data }
  return delay(undefined as unknown as void)
}

function mockDeletePurchaseOrder(id: number): Promise<void> {
  const item = mockPurchaseOrders.find((o) => o.id === id)
  if (!item) return Promise.reject(new Error('採購訂單不存在'))
  // 與後端規則對齊：僅待處理（execStatus=pending）的訂單可刪除
  if (item.execStatus !== 'pending') return Promise.reject(new Error('僅待處理的訂單可刪除'))
  mockPurchaseOrders = mockPurchaseOrders.filter((o) => o.id !== id)
  return delay(undefined as unknown as void)
}

/** 刪除採購訂單（僅待處理可刪） */
export async function deletePurchaseOrder(id: number): Promise<void> {
  try {
    await request.delete(`/eam/purchase/${id}`)
  } catch (e) {
    if (isBackendUnavailable(e)) return mockDeletePurchaseOrder(id)
    throw e
  }
}

/* ==================== API：驗收入庫 ==================== */

export function fetchInboundList(params?: EamPageQuery): Promise<PageResult<InboundBatch>> {
  return request.get<unknown, PageResult<InboundBatch>>('/eam/inbound', { params })
}

/** 入庫批次詳情 */
export function fetchInboundDetail(batchId: number): Promise<InboundBatch> {
  return request.get<unknown, InboundBatch>(`/eam/inbound/${batchId}`)
}

/** 待入庫訂單（仍有未驗收數量的訂單） */
export async function fetchPendingInboundOrders(): Promise<PurchaseOrder[]> {
  const orders: PurchaseOrder[] = []
  for (let page = 1; ; page += 1) {
    const result = await fetchPurchaseOrderList({ page, size: 100, execStatus: 'completed' })
    orders.push(...result.records.filter((order) => order.status !== 'received'))
    if (page * 100 >= result.total || !result.records.length) return orders
  }
}

/** 上傳驗收照片，返回 {name, dataUrl} */
export async function uploadInboundPhoto(file: File): Promise<{ name: string; dataUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  try {
    // SILENT：由調用方統一展示後端校驗消息（如文件類型/大小/魔數不合法），避免全局攔截器與組件重複彈提示
    return await request.post<unknown, { name: string; dataUrl: string }>('/eam/inbound/photo/upload', formData, { headers: { [SILENT_HEADER]: '1' } })
  } catch (e) {
    if (isBackendUnavailable(e)) {
      // 後端不可用時本地 Base64 預覽
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string })
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    }
    throw e
  }
}

/**
 * 創建入庫批次：按型號+數量批量生成資產寫入台賬，並回寫訂單已驗收數量與狀態
 */
export interface InboundCreateData {
  poId: number
  inboundDate: string
  operator: string
  items: {
    orderItemId: number
    modelId?: number
    inboundDate?: string
    qty: number
    locationId: number
    /** 驗收處置方式：缺省視為 pass；不通過項不生成資產 */
    disposition?: 'pass' | 'return' | 'exchange' | 'concession'
    rejectReason?: string
    /** 驗收照片 [{name, dataUrl}] */
    photos?: { name: string; dataUrl: string }[]
    /** 配件清單 [{name, qty}]，隨驗收記錄保存 */
    accessories?: { name: string; qty: number }[]
  }[]
  remark?: string
}

export function createInboundBatch(data: InboundCreateData): Promise<InboundBatch> {
  // 编号、数量和来源快照统一由后端事务生成，不在浏览器预创建资产。
  return request.post<unknown, InboundBatch>('/eam/inbound', data)
}

/** 登記換貨二次發貨（PR-3）：寫入物流單號/預計到貨日，狀態置為 shipped */
export function registerExchangeShipment(
  batchId: number,
  itemId: number,
  data: { trackingNo: string; expectedDate?: string }
): Promise<InboundBatchItem> {
  return request.post<unknown, InboundBatchItem>(
    `/eam/inbound/${batchId}/items/${itemId}/exchange-shipment`, data)
}

/** 保存驗收入庫草稿（不創建資產，僅暫存當前驗收狀態；groupId 傳入時按供應商分組隔離） */
export function saveInboundDraft(data: {
  poId: number
  groupId?: string
  inboundDate: string
  operator: string
  items: { orderItemId?: number; modelId: number; inboundDate?: string; qty: number; locationId: number; status: 'pass' | 'return' | 'exchange' | 'concession'; reason?: string; accessories?: { name: string; qty: number }[] }[]
  remark?: string
}): Promise<void> {
  // 草稿暫存於 localStorage（分組級草稿獨立 key，避免多供應商互相覆蓋）
  const key = data.groupId ? `inbound_draft_${data.poId}_${data.groupId}` : `inbound_draft_${data.poId}`
  const draft = { ...data, savedAt: new Date().toISOString() }
  try { localStorage.setItem(key, JSON.stringify(draft)) } catch { /* quota */ }
  return delay(undefined as unknown as void)
}

/** 讀取驗收入庫草稿（groupId 傳入時優先讀分組級草稿，缺失時回退訂單級舊草稿） */
export function loadInboundDraft(poId: number, groupId?: string): Promise<{
  poId: number
  inboundDate: string
  operator: string
  items: { orderItemId?: number; modelId: number; inboundDate?: string; qty: number; locationId: number; status: 'pass' | 'return' | 'exchange' | 'concession'; reason?: string; accessories?: { name: string; qty: number }[] }[]
  remark?: string
  savedAt: string
} | null> {
  try {
    const raw = groupId
      ? (localStorage.getItem(`inbound_draft_${poId}_${groupId}`) || localStorage.getItem(`inbound_draft_${poId}`))
      : localStorage.getItem(`inbound_draft_${poId}`)
    return delay(raw ? JSON.parse(raw) : null)
  } catch {
    return delay(null)
  }
}

/** 刪除驗收入庫草稿（groupId 傳入時僅清該分組與訂單級舊草稿；未傳時清該訂單全部草稿） */
export function deleteInboundDraft(poId: number, groupId?: string): Promise<void> {
  try {
    if (groupId) {
      localStorage.removeItem(`inbound_draft_${poId}_${groupId}`)
      localStorage.removeItem(`inbound_draft_${poId}`)
    } else {
      const prefix = `inbound_draft_${poId}`
      Object.keys(localStorage)
        .filter((k) => k === prefix || k.startsWith(`${prefix}_`))
        .forEach((k) => localStorage.removeItem(k))
    }
  } catch { /* noop */ }
  return delay(undefined as unknown as void)
}

/* ==================== API：領用 ==================== */

export interface ClaimQuery extends EamPageQuery {
  assetNo?: string
  assetName?: string
  assetType?: string
  brand?: string
  claimant?: string
  operator?: string
  /** 领用日期范围 [start, end] */
  claimDateRange?: [string, string]
  /** 归还日期范围 [start, end] */
  returnDateRange?: [string, string]
}

/** 員工領用匯總（列表頁用） */
export interface EmployeeClaimSummary {
  /** 員工工號 */
  empNo: string
  /** 員工姓名 */
  empName: string
  department: string
  /** 在用資產數量 */
  claimedCount: number
  /** 已歸還資產數量 */
  returnedCount: number
  /** 最近領用日期 */
  lastClaimDate: string
}

/** 員工匯總查詢條件 */
export interface EmployeeClaimQuery extends EamPageQuery {
  empName?: string
  department?: string
}

/** 獲取員工領用匯總列表（從 mockClaims 聚合） */
export function fetchEmployeeClaimSummary(params?: EmployeeClaimQuery): Promise<PageResult<EmployeeClaimSummary>> {
  const map = new Map<string, EmployeeClaimSummary>()
  mockClaims.forEach((c) => {
    const key = c.claimant
    if (!map.has(key)) {
      map.set(key, {
        empNo: c.claimant.match(/\((.+)\)/)?.[1] || '',
        empName: c.claimant.replace(/\(.+\)/, ''),
        department: c.department,
        claimedCount: 0,
        returnedCount: 0,
        lastClaimDate: c.claimDate,
      })
    }
    const s = map.get(key)!
    if (c.status === 'claimed') s.claimedCount++
    else s.returnedCount++
    if (c.claimDate > s.lastClaimDate) s.lastClaimDate = c.claimDate
  })
  let list = Array.from(map.values()).sort((a, b) => (a.lastClaimDate < b.lastClaimDate ? 1 : -1))
  if (params?.empName) list = list.filter((e) => e.empName.includes(params.empName!) || e.empNo.includes(params.empName!))
  if (params?.department) list = list.filter((e) => e.department === params.department)
  if (params?.keyword) {
    list = list.filter((e) => matchKeyword(e, ['empName', 'empNo', 'department'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 獲取某員工的領用明細（分 Tab：在用 / 已歸還） */
export function fetchEmployeeClaimDetail(claimant: string): Promise<{ claimed: ClaimRecord[]; returned: ClaimRecord[] }> {
  const all = mockClaims.filter((c) => c.claimant === claimant)
  const claimed = all.filter((c) => c.status === 'claimed').sort((a, b) => (a.claimDate < b.claimDate ? 1 : -1))
  const returned = all.filter((c) => c.status === 'returned').sort((a, b) => ((a.returnDate || '') < (b.returnDate || '') ? 1 : -1))
  return delay({ claimed, returned })
}

export function fetchClaimList(params?: ClaimQuery): Promise<PageResult<ClaimRecord>> {
  let list = [...mockClaims].sort((a, b) => (a.claimDate < b.claimDate ? 1 : -1))
  if (params?.assetNo) list = list.filter((c) => c.assetNo.includes(params.assetNo!))
  if (params?.assetName) list = list.filter((c) => c.assetName.toLowerCase().includes(params.assetName!.toLowerCase()))
  if (params?.assetType) list = list.filter((c) => c.assetType === params.assetType)
  if (params?.brand) list = list.filter((c) => c.brand.toLowerCase().includes(params.brand!.toLowerCase()))
  if (params?.claimant) list = list.filter((c) => c.claimant.toLowerCase().includes(params.claimant!.toLowerCase()))
  if (params?.department) list = list.filter((c) => c.department === params.department)
  if (params?.operator) list = list.filter((c) => c.operator.toLowerCase().includes(params.operator!.toLowerCase()))
  if (params?.status && params.status !== 'all') list = list.filter((c) => c.status === params.status)
  if (params?.claimDateRange) {
    const [s, e] = params.claimDateRange
    list = list.filter((c) => c.claimDate >= s && c.claimDate <= e)
  }
  if (params?.returnDateRange) {
    const [s, e] = params.returnDateRange
    list = list.filter((c) => c.returnDate && c.returnDate >= s && c.returnDate <= e)
  }
  if (params?.keyword) {
    list = list.filter((c) => matchKeyword(c, ['claimNo', 'assetNo', 'assetName', 'claimant', 'department'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 閒置可領用/可借用資產 */
export async function fetchIdleAssets(keyword?: string): Promise<AssetItem[]> {
  const res = await fetchAssetList({ page: 1, size: 9999, status: 'idle', keyword })
  return res.records
}

/** 創建領用單：綁定使用人並置資產為在用（holdType=owned） */
export async function createClaim(data: {
  assetId: number
  claimant: string
  department: string
  claimDate: string
  claimReason?: string
  operator: string
  remark?: string
}): Promise<ClaimRecord> {
  const asset = await fetchAssetDetail(data.assetId)
  if (asset.status !== 'idle') throw new Error('僅閒置資產可領用')
  await claimAsset({
    assetId: data.assetId,
    userName: data.claimant,
    department: data.department,
    usageDate: data.claimDate,
    remark: data.remark,
  })
  await updateAsset(data.assetId, { holdType: 'owned' })
  const id = Math.max(0, ...mockClaims.map((c) => c.id)) + 1
  const record: ClaimRecord = {
    id,
    claimNo: genNo('LY', id),
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    assetType: asset.assetType,
    brand: asset.brand,
    claimant: data.claimant,
    department: data.department,
    claimDate: data.claimDate,
    claimReason: data.claimReason,
    operator: data.operator,
    status: 'claimed',
    remark: data.remark,
  }
  mockClaims = [record, ...mockClaims]
  return delay(record)
}

/* ==================== API：借用 ==================== */

/** 自動標記逾期：借用中且已過歸還期限 */
function markOverdueBorrows(): void {
  const t = today()
  mockBorrows.forEach((b) => {
    if (b.status === 'borrowing' && b.dueDate < t) b.status = 'overdue'
  })
}

export function fetchBorrowList(params?: BorrowQuery): Promise<PageResult<BorrowRecord>> {
  markOverdueBorrows()
  let list = [...mockBorrows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.status && params.status !== 'all') {
    if (params.status === 'borrowing') {
      // 借用中包含已逾期
      list = list.filter((b) => b.status === 'borrowing' || b.status === 'overdue')
    } else {
      list = list.filter((b) => b.status === params.status)
    }
  }
  if (params?.overdueOnly) list = list.filter((b) => b.status === 'overdue')
  if (params?.department) list = list.filter((b) => b.department === params.department)
  if (params?.borrower) list = list.filter((b) => b.borrower.includes(params.borrower!))
  if (params?.keyword) {
    list = list.filter((b) => matchKeyword(b, ['borrowNo', 'assetNo', 'assetName', 'borrower', 'purpose'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

export function fetchBorrowDetail(id: number): Promise<BorrowRecord> {
  const item = mockBorrows.find((b) => b.id === id)
  if (!item) return Promise.reject(new Error('借用記錄不存在'))
  return delay(item)
}

/** 創建借用：資產 idle → in_use（holdType=borrowed） */
export async function createBorrow(data: {
  assetId: number
  borrower: string
  department: string
  borrowDate: string
  dueDate: string
  purpose: string
  operator: string
  remark?: string
}): Promise<BorrowRecord> {
  const asset = await fetchAssetDetail(data.assetId)
  if (asset.status !== 'idle') throw new Error('僅閒置資產可借用')
  if (data.dueDate <= data.borrowDate) throw new Error('歸還期限須晚於借用日期')

  await updateAsset(data.assetId, {
    status: 'in_use',
    holdType: 'borrowed',
    userName: data.borrower,
    department: data.department,
    usageDate: data.borrowDate,
  })
  await logAssetOperation({
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    opType: 'borrow',
    operator: data.operator,
    operateTime: now(),
    description: `借用給 ${data.borrower}（${data.department}），應於 ${data.dueDate} 前歸還；用途：${data.purpose}`,
    toUser: data.borrower,
    toDepartment: data.department,
  })

  const id = Math.max(0, ...mockBorrows.map((b) => b.id)) + 1
  const record: BorrowRecord = {
    id,
    borrowNo: genNo('JY', id),
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    borrower: data.borrower,
    department: data.department,
    borrowDate: data.borrowDate,
    dueDate: data.dueDate,
    purpose: data.purpose,
    status: 'borrowing',
    renewCount: 0,
    operator: data.operator,
    remark: data.remark,
    createdAt: now(),
  }
  mockBorrows = [record, ...mockBorrows]
  return delay(record)
}

/** 續借：延長歸還期限，續借次數 +1，逾期狀態恢復為借用中 */
export async function renewBorrow(id: number, newDueDate: string, operator: string): Promise<void> {
  const idx = mockBorrows.findIndex((b) => b.id === id)
  if (idx === -1) throw new Error('借用記錄不存在')
  const b = mockBorrows[idx]
  if (b.status === 'returned') throw new Error('已歸還的借用單不可續借')
  if (newDueDate <= b.dueDate) throw new Error('續借日期須晚於原歸還期限')
  mockBorrows[idx] = { ...b, dueDate: newDueDate, renewCount: b.renewCount + 1, status: 'borrowing' }
  await logAssetOperation({
    assetId: b.assetId,
    assetNo: b.assetNo,
    assetName: b.assetName,
    opType: 'renew',
    operator,
    operateTime: now(),
    description: `第 ${mockBorrows[idx].renewCount} 次續借，歸還期限由 ${b.dueDate} 延長至 ${newDueDate}`,
  })
  return delay(undefined as unknown as void)
}

/** 借用歸還：寫歸還記錄 + 資產回到閒置 + 關閉借用單 */
export async function returnBorrow(id: number, data: {
  returnDate: string
  condition: 'normal' | 'damaged' | 'lost'
  operator: string
  remark?: string
}): Promise<ReturnRecord> {
  const idx = mockBorrows.findIndex((b) => b.id === id)
  if (idx === -1) throw new Error('借用記錄不存在')
  const b = mockBorrows[idx]
  if (b.status === 'returned') throw new Error('該借用單已歸還')
  const record = await mockCreateReturn({
    assetId: b.assetId,
    returnUser: b.borrower,
    returnDate: data.returnDate,
    condition: data.condition,
    operator: data.operator,
    remark: data.remark,
    borrowId: b.id,
  })
  mockBorrows[idx] = { ...b, status: 'returned', returnDate: data.returnDate }
  return record
}

/* ==================== API：歸還 ==================== */

const CONDITION_TEXT: Record<ReturnRecord['condition'], string> = {
  normal: '狀況正常',
  damaged: '損壞',
  lost: '遺失',
}

export function fetchReturnList(params?: EamPageQuery): Promise<PageResult<ReturnRecord>> {
  let list = [...mockReturns].sort((a, b) => (a.returnDate < b.returnDate ? 1 : -1))
  if (params?.status && params.status !== 'all') list = list.filter((r) => r.condition === params.status)
  if (params?.keyword) {
    list = list.filter((r) => matchKeyword(r, ['returnNo', 'assetNo', 'assetName', 'returnUser'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 歸還登記（領用資產歸還 / 借用歸還共用） */
export async function createReturn(data: {
  assetId: number
  returnUser: string
  returnDate: string
  condition: 'normal' | 'damaged' | 'lost'
  operator: string
  remark?: string
  borrowId?: number
}): Promise<ReturnRecord> {
  const record = await mockCreateReturn(data)
  if (data.borrowId) {
    const idx = mockBorrows.findIndex((b) => b.id === data.borrowId)
    if (idx !== -1) mockBorrows[idx] = { ...mockBorrows[idx], status: 'returned', returnDate: data.returnDate }
  }
  return record
}

async function mockCreateReturn(data: {
  assetId: number
  returnUser: string
  returnDate: string
  condition: 'normal' | 'damaged' | 'lost'
  operator: string
  remark?: string
  borrowId?: number
}): Promise<ReturnRecord> {
  const asset = await fetchAssetDetail(data.assetId)
  const fromUser = asset.userName
  const fromDept = asset.department
  await returnAsset({
    assetId: data.assetId,
    returnDate: data.returnDate,
    condition: CONDITION_TEXT[data.condition],
    applyBy: data.operator,
  })
  await updateAsset(data.assetId, { holdType: 'owned', department: '物资部' })
  await logAssetOperation({
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    opType: 'return',
    operator: data.operator,
    operateTime: now(),
    description: `歸還登記：${CONDITION_TEXT[data.condition]}${data.remark ? `；${data.remark}` : ''}`,
    fromUser,
    fromDepartment: fromDept,
    toUser: '無人',
  })
  const id = Math.max(0, ...mockReturns.map((r) => r.id)) + 1
  const record: ReturnRecord = {
    id,
    returnNo: genNo('GH', id),
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    returnUser: data.returnUser,
    returnDate: data.returnDate,
    condition: data.condition,
    operator: data.operator,
    borrowId: data.borrowId,
    remark: data.remark,
  }
  mockReturns = [record, ...mockReturns]
  return delay(record)
}

/* ==================== API：交接 ==================== */

/** 交接列表查询参数（精确条件，与后端 EamHandoverQuery 对应） */
export interface HandoverListParams {
  page?: number
  size?: number
  handoverNo?: string
  fromUserName?: string
  fromDepartment?: string
  toUserName?: string
  toDepartment?: string
  handoverDateStart?: string
  handoverDateEnd?: string
  reason?: string
  operatorName?: string
  receiverType?: string
}

export async function fetchHandoverList(params?: HandoverListParams): Promise<PageResult<HandoverRecord>> {
  try {
    const res = await request.get<unknown, PageResult<HandoverRecord>>('/eam/handovers', {
      params: {
        page: params?.page,
        size: params?.size,
        handoverNo: params?.handoverNo,
        fromUserName: params?.fromUserName,
        fromDepartment: params?.fromDepartment,
        toUserName: params?.toUserName,
        toDepartment: params?.toDepartment,
        handoverDateStart: params?.handoverDateStart,
        handoverDateEnd: params?.handoverDateEnd,
        reason: params?.reason,
        operatorName: params?.operatorName,
        receiverType: params?.receiverType,
      },
    })
    return res
  } catch (e) {
    if (isBackendUnavailable(e)) {
      let list = [...mockHandovers].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      if (params?.handoverNo) {
        const kw = params.handoverNo.toLowerCase()
        list = list.filter((h) => h.handoverNo.toLowerCase().includes(kw))
      }
      if (params?.fromUserName) list = list.filter((h) => (h.fromUserName || '').includes(params.fromUserName!))
      if (params?.toUserName) list = list.filter((h) => (h.toUserName || '').includes(params.toUserName!))
      if (params?.fromDepartment) list = list.filter((h) => h.fromDepartment === params.fromDepartment)
      if (params?.toDepartment) list = list.filter((h) => h.toDepartment === params.toDepartment)
      if (params?.handoverDateStart) list = list.filter((h) => h.handoverDate >= params.handoverDateStart!)
      if (params?.handoverDateEnd) list = list.filter((h) => h.handoverDate <= params.handoverDateEnd!)
      if (params?.reason) list = list.filter((h) => h.reason === params.reason)
      if (params?.operatorName) list = list.filter((h) => (h.operatorName || '').includes(params.operatorName!))
      if (params?.receiverType) list = list.filter((h) => (h.receiverType || 'employee') === params.receiverType)
      return delay(paginate(list, params?.page, params?.size))
    }
    throw e
  }
}

/** 交接詳情（含資產明細 items） */
export async function fetchHandoverDetail(id: number): Promise<HandoverRecord> {
  return normalizeHandoverRecord(await request.get<unknown, HandoverRecord>(`/eam/handovers/${id}`))
}

/** 查詢某使用人名下資產（交接頁勾選用） */
export async function fetchUserAssets(userName: string): Promise<AssetItem[]> {
  if (!userName) return []
  const res = await fetchAssetList({ page: 1, size: 9999, userName })
  return res.records.filter((a) => a.status !== 'scrapped')
}

/** 取消交接 */
export async function cancelHandover(id: number, reason: string): Promise<void> {
  try {
    await request.post(`/eam/handovers/${id}/cancel`, { reason })
  } catch (e) {
    if (isBackendUnavailable(e)) {
      // mock 降级：直接修改本地数据（实际场景中需刷新列表）
      return
    }
    throw e
  }
}

/** 批量交接：逐件變更使用人/部門並寫交接流水 */
export async function createHandover(data: HandoverSaveData): Promise<HandoverRecord> {
  try {
    const id = await request.post<unknown, number>('/eam/handovers', {
      fromUserName: data.fromUserName,
      fromDepartment: data.fromDepartment,
      toUserName: data.toUserName,
      toDepartment: data.toDepartment,
      receiverType: data.receiverType || 'employee',
      handoverDate: data.handoverDate,
      assetIds: data.assetIds,
      reason: data.reason,
      operatorName: data.operatorName,
      remark: data.remark,
    })
    return {
      id,
      handoverNo: '',
      fromUserName: data.fromUserName,
      fromDepartment: data.fromDepartment,
      toUserName: data.toUserName,
      toDepartment: data.toDepartment,
      receiverType: (data.receiverType || 'employee') as 'employee' | 'department',
      handoverDate: data.handoverDate,
      assetIds: data.assetIds,
      assetCount: data.assetIds.length,
      reason: data.reason,
      status: 'done',
      operatorName: data.operatorName,
      remark: data.remark,
      createdAt: new Date().toISOString(),
    }
  } catch (e) {
    if (isBackendUnavailable(e)) {
      // Mock fallback
      if (!data.assetIds.length) throw new Error('請至少選擇一件資產', { cause: e })
      if (data.receiverType !== 'department' && data.fromUserName === data.toUserName) throw new Error('接收人不可與交出人相同', { cause: e })
      const id = Math.max(0, ...mockHandovers.map((h) => h.id)) + 1
      const record: HandoverRecord = {
        id,
        handoverNo: genNo('JJ', id),
        fromUserName: data.fromUserName,
        fromDepartment: data.fromDepartment,
        toUserName: data.toUserName,
        toDepartment: data.toDepartment,
        receiverType: (data.receiverType || 'employee') as 'employee' | 'department',
        handoverDate: data.handoverDate,
        assetIds: data.assetIds,
        assetCount: data.assetIds.length,
        reason: data.reason,
        status: 'done',
        operatorName: data.operatorName,
        remark: data.remark,
        createdAt: now(),
      }
      mockHandovers = [record, ...mockHandovers]
      return delay(record)
    }
    throw e
  }
}

/* ==================== API：損壞賠付 ==================== */

export function fetchCompensationList(params?: EamPageQuery): Promise<PageResult<CompensationRecord>> {
  let list = [...mockCompensations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.status && params.status !== 'all') list = list.filter((c) => c.status === params.status)
  if (params?.department) list = list.filter((c) => c.responsibleDept === params.department)
  if (params?.keyword) {
    list = list.filter((c) => matchKeyword(c, ['compNo', 'assetNo', 'assetName', 'responsiblePerson'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

export function fetchCompensationDetail(id: number): Promise<CompensationRecord> {
  const item = mockCompensations.find((c) => c.id === id)
  if (!item) return Promise.reject(new Error('賠付單不存在'))
  return delay(item)
}

/** 創建賠付單（待定責） */
export async function createCompensation(data: {
  assetId: number
  damageType: 'damage' | 'loss'
  causeType: 'human' | 'natural' | 'third_party' | 'quality'
  liabilityDesc: string
  operator: string
  returnId?: number
  responsiblePerson?: string
  responsibleDept?: string
  compType?: 'repair_cost' | 'replace_price' | 'depreciated'
  compAmount?: number
}): Promise<CompensationRecord> {
  const asset = await fetchAssetDetail(data.assetId)
  const id = Math.max(0, ...mockCompensations.map((c) => c.id)) + 1
  const record: CompensationRecord = {
    id,
    compNo: genNo('PF', id),
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    damageType: data.damageType,
    causeType: data.causeType,
    responsiblePerson: data.responsiblePerson || '',
    responsibleDept: data.responsibleDept || '',
    liabilityDesc: data.liabilityDesc,
    compType: data.compType || 'repair_cost',
    compAmount: data.compAmount || 0,
    status: 'pending',
    returnId: data.returnId,
    operator: data.operator,
    createdAt: now(),
  }
  mockCompensations = [record, ...mockCompensations]
  await logAssetOperation({
    assetId: asset.id,
    assetNo: asset.assetNo,
    assetName: asset.assetName,
    opType: 'compensation',
    operator: data.operator,
    operateTime: now(),
    description: `登記損壞賠付單 ${record.compNo}：${data.liabilityDesc}`,
  })
  return delay(record)
}

/** 定責確認：補全責任人/賠付方式/金額，狀態轉已定責 */
export async function confirmCompensation(id: number, data: {
  responsiblePerson: string
  responsibleDept: string
  liabilityDesc: string
  compType: 'repair_cost' | 'replace_price' | 'depreciated'
  compAmount: number
  operator: string
}): Promise<void> {
  const idx = mockCompensations.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error('賠付單不存在')
  if (mockCompensations[idx].status === 'paid') throw new Error('已賠付的單據不可再定責')
  mockCompensations[idx] = { ...mockCompensations[idx], ...data, status: 'confirmed' }
  await logAssetOperation({
    assetId: mockCompensations[idx].assetId,
    assetNo: mockCompensations[idx].assetNo,
    assetName: mockCompensations[idx].assetName,
    opType: 'compensation',
    operator: data.operator,
    operateTime: now(),
    description: `定責確認：責任人 ${data.responsiblePerson}（${data.responsibleDept}），賠付金額 MOP ${data.compAmount}`,
  })
  return delay(undefined as unknown as void)
}

/** 賠付執行：登記賠付完成日期 */
export async function payCompensation(id: number, paidDate: string, operator: string): Promise<void> {
  const idx = mockCompensations.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error('賠付單不存在')
  if (mockCompensations[idx].status !== 'confirmed') throw new Error('請先完成定責確認')
  mockCompensations[idx] = { ...mockCompensations[idx], status: 'paid', paidDate }
  await logAssetOperation({
    assetId: mockCompensations[idx].assetId,
    assetNo: mockCompensations[idx].assetNo,
    assetName: mockCompensations[idx].assetName,
    opType: 'compensation',
    operator,
    operateTime: now(),
    description: `賠付完成：${paidDate} 收款 MOP ${mockCompensations[idx].compAmount}`,
  })
  return delay(undefined as unknown as void)
}

/** 回填歸還記錄關聯的賠付單 */
export function bindReturnCompensation(returnId: number, compensationId: number): Promise<void> {
  const idx = mockReturns.findIndex((r) => r.id === returnId)
  if (idx !== -1) mockReturns[idx] = { ...mockReturns[idx], compensationId }
  return delay(undefined as unknown as void)
}

/* ==================== API：資產看板 ==================== */

export async function fetchEamDashboard(): Promise<EamDashboard> {
  markOverdueBorrows()
  const [assets, models, categories] = await Promise.all([
    fetchAssetList({ page: 1, size: 9999 }),
    fetchModelList({ size: 9999 }),
    fetchCategoryList(),
  ])
  const categoryMap = new Map(categories.map((c) => [c.code, c.name]))
  const list = assets.records
  const total = list.length
  const inUse = list.filter((a) => a.status === 'in_use').length
  const idle = list.filter((a) => a.status === 'idle').length
  const inRepair = list.filter((a) => a.status === 'in_repair').length
  const scrapped = list.filter((a) => a.status === 'scrapped').length
  const totalValue = list.reduce((s, a) => s + (a.purchaseValue || 0), 0)

  const groupCount = (pick: (a: AssetItem) => string) => {
    const map = new Map<string, number>()
    list.forEach((a) => {
      const k = pick(a) || '未分類'
      map.set(k, (map.get(k) || 0) + 1)
    })
    return Array.from(map.entries()).map(([key, count]) => ({ key, count }))
  }

  const categoryName = (modelId?: number | null) => {
    if (!modelId) return ''
    const m = models.records.find((x) => x.id === modelId)
    if (!m) return ''
    return categoryMap.get(m.categoryCode) || m.categoryCode
  }

  // 月度入庫趨勢（近 6 個月，按創建時間聚合）
  const monthMap = new Map<string, { count: number; value: number }>()
  const base = new Date()
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    monthMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { count: 0, value: 0 })
  }
  list.forEach((a) => {
    const key = (a.createdAt || '').slice(0, 7)
    const bucket = monthMap.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.value += a.purchaseValue || 0
    }
  })

  return delay({
    totalCount: total,
    inUseCount: inUse,
    idleCount: idle,
    inRepairCount: inRepair,
    scrappedCount: scrapped,
    totalValue,
    idleRate: total ? Number(((idle / total) * 100).toFixed(1)) : 0,
    borrowingCount: mockBorrows.filter((b) => b.status !== 'returned').length,
    overdueCount: mockBorrows.filter((b) => b.status === 'overdue').length,
    pendingCompCount: mockCompensations.filter((c) => c.status !== 'paid').length,
    pendingReqCount: mockPurchaseRequests.filter((r) => r.status === 'pending').length,
    pendingOrderCount: mockPurchaseOrders.filter((o) => o.status !== 'received').length,
    typeDistribution: groupCount((a) => a.assetType).map(({ key, count }) => ({ type: key, count })),
    departmentDistribution: groupCount((a) => a.department).map(({ key, count }) => ({ department: key, count })),
    categoryDistribution: groupCount((a) => categoryName(a.modelId)).map(({ key, count }) => ({ category: key, count })),
    monthlyInbound: Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v })),
  })
}

/* ==================== API：參數庫 ==================== */

export async function fetchParamTypeList(params?: ParamTypeQuery & { categoryCode?: string }): Promise<PageResult<ParamType>> {
  return await request.get<unknown, PageResult<ParamType>>('/eam/basic/param-types', { params, headers: { [SILENT_HEADER]: '1' } })
}

export async function fetchAllParamTypes(): Promise<ParamType[]> {
  const res = await request.get<unknown, PageResult<ParamType>>('/eam/basic/param-types', { params: { size: 9999 }, headers: { [SILENT_HEADER]: '1' } })
  return res.records || []
}

export async function fetchParamValuesByType(paramTypeCode: string): Promise<ParamValue[]> {
  return await request.get<unknown, ParamValue[]>(`/eam/basic/param-types/${paramTypeCode}/values`, { headers: { [SILENT_HEADER]: '1' } })
}

export async function fetchAllParamValues(): Promise<ParamValue[]> {
  return await request.get<unknown, ParamValue[]>('/eam/basic/param-values', { headers: { [SILENT_HEADER]: '1' } })
}

export async function createParamType(data: Omit<ParamType, 'id'>): Promise<ParamType> {
  return await request.post<unknown, ParamType>('/eam/basic/param-types', data)
}

export async function updateParamType(id: number, data: Partial<ParamType>): Promise<ParamType> {
  return await request.put<unknown, ParamType>(`/eam/basic/param-types/${id}`, data)
}

export async function deleteParamType(id: number): Promise<void> {
  await request.delete(`/eam/basic/param-types/${id}`)
}

export async function createParamValue(data: Omit<ParamValue, 'id'>): Promise<ParamValue> {
  return await request.post<unknown, ParamValue>('/eam/basic/param-values', data)
}

export async function updateParamValue(id: number, data: Partial<ParamValue>): Promise<ParamValue> {
  return await request.put<unknown, ParamValue>(`/eam/basic/param-values/${id}`, data)
}

export async function deleteParamValue(id: number): Promise<void> {
  await request.delete(`/eam/basic/param-values/${id}`)
}
