/**
 * EAM 企業資產管理擴展 API
 *
 * 承載物資管理全生命週期閉環的業務數據：
 *   基礎數據（分類/型號/位置）→ 採購申請 → 採購訂單 → 驗收入庫 →
 *   台賬 → 領用/借用 → 歸還 → 調撥/交接 → 維修/賠付 → 報廢
 *
 * 台賬主數據與操作流水仍由 ./asset 承載，本文件僅擴展 EAM 專屬實體。
 */
import request, { SILENT_HEADER } from './request'
import type { AssetParameterSource } from '../utils/assetParams'
import {
  fetchAssetList,
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
  /** 业务类型：ASSET-资产, CONSUMABLE-耗材 */
  bizType?: 'ASSET' | 'CONSUMABLE'
  updatedBy?: string
  updatedAt?: string
}

/** 资产品牌庫（所属分类 → 资产品牌） */
export interface AssetBrand {
  id: number
  /** 品牌编码（AB 前缀） */
  code?: string
  /** 所属分类编码 */
  categoryCode: string
  /** 资产品牌中文 */
  brandZh: string
  /** 资产品牌英文 */
  brandEn: string
  /** 资产品牌LOGO URL */
  brandLogo?: string
  /** 业务类型：ASSET-资产, CONSUMABLE-耗材 */
  bizType?: 'ASSET' | 'CONSUMABLE'
  /** 状态：enabled / disabled */
  status?: 'enabled' | 'disabled'
  remark?: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 产品庫（资产品牌 → 产品） */
export interface AssetModel {
  id: number
  /** 产品编码（品牌编码-3位序号，如 AB01-001） */
  code?: string
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

/** 存放仓库（按省-市-区-详细地址维度，无层级关系） */
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
export const ASSET_FIELD_SAMPLE_VALUES: Record<string, string> = Object.fromEntries(
  ASSET_DISPLAY_FIELDS.map(({ key, label }) => [key, `{${label}}`]),
)

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
  borrowingCount: number | null
  /** 借用逾期數量 */
  overdueCount: number | null
  /** 待定責賠付單數量 */
  pendingCompCount: number | null
  /** 待審批採購申請數量 */
  pendingReqCount: number | null
  /** 待收貨訂單數量 */
  pendingOrderCount: number | null
  typeDistribution: { type: string; count: number }[]
  departmentDistribution: { department: string; count: number }[]
  categoryDistribution: { category: string; count: number }[]
  monthlyInbound: { month: string; count: number; value: number }[]
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

/* ==================== API：資產分類 ==================== */

/** 分類列表（平鋪返回，頁面自行構樹；bizType: ASSET/CONSUMABLE/ALL） */
export async function fetchCategoryList(params?: { bizType?: string; keyword?: string; name?: string; code?: string; updatedBy?: string; updatedAtStart?: string; updatedAtEnd?: string }): Promise<AssetCategory[]> {
  const data = await request.get<unknown, Array<Omit<AssetCategory, 'paramTemplate'> & { paramTemplate: ParamField[] | string }>>('/eam/basic/categories', { params, headers: { [SILENT_HEADER]: '1' } })
  return (data || []).map((c) => ({
    ...c,
    paramTemplate: typeof c.paramTemplate === 'string' ? (() => { try { return JSON.parse(c.paramTemplate) } catch { return [] } })() : (c.paramTemplate || []),
  }))
}

export async function createCategory(data: Omit<AssetCategory, 'id'>): Promise<number> {
  return request.post<unknown, number>('/eam/basic/categories', {
    ...data,
    paramTemplate: JSON.stringify(data.paramTemplate || []),
  })
}

export async function updateCategory(id: number, data: Partial<AssetCategory>): Promise<void> {
  const payload: Record<string, unknown> = { ...data }
  if (data.paramTemplate) payload.paramTemplate = JSON.stringify(data.paramTemplate)
  await request.put(`/eam/basic/categories/${id}`, payload)
}

export async function deleteCategory(id: number): Promise<void> {
  await request.delete(`/eam/basic/categories/${id}`)
}

export async function toggleCategoryStatus(id: number): Promise<void> {
  await request.put(`/eam/basic/categories/${id}/toggle`)
}

/* ==================== API：资产品牌庫 ==================== */

export interface BrandQuery {
  bizType?: string
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

/* ==================== API：存放仓库 ==================== */

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
  return request.get<unknown, EamSupplier[]>('/eam/basic/suppliers', { params, headers: { [SILENT_HEADER]: '1' } })
}

/** 供應商新增/編輯參數（編碼由後端按規則自動生成，狀態僅能透過 toggle 變更） */
export type SupplierSaveParams = Omit<EamSupplier, 'id' | 'updatedAt' | 'code' | 'status' | 'contactCount'> & {
  /** 聯繫人列表（新結構） */
  contacts?: SupplierContactItem[]
}

/** 新增供應商，編碼系統自動生成（CGSJ + 6位自增），返回新記錄 ID */
export async function createSupplier(data: SupplierSaveParams): Promise<number> {
  return request.post<unknown, number>('/eam/basic/suppliers', data)
}

/** 更新供應商（編碼不可修改） */
export async function updateSupplier(id: number, data: SupplierSaveParams): Promise<void> {
  await request.put(`/eam/basic/suppliers/${id}`, data)
}

/** 刪除供應商 */
export async function deleteSupplier(id: number): Promise<void> {
  await request.delete(`/eam/basic/suppliers/${id}`)
}

/** 切換供應商啟用/停用狀態 */
export async function toggleSupplierStatus(id: number): Promise<void> {
  await request.put(`/eam/basic/suppliers/${id}/toggle`)
}

/** 供應商下拉列表（精簡版：僅 id/code/name，支持關鍵字過濾） */
export async function fetchSuppliersDropdown(keyword?: string): Promise<SupplierDropdownItem[]> {
  return request.get<unknown, SupplierDropdownItem[]>('/eam/basic/suppliers/dropdown', {
    params: keyword ? { keyword } : undefined,
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 查詢指定供應商的所有啟用聯繫人 */
export async function fetchSupplierContacts(supplierId: number): Promise<SupplierContactItem[]> {
  return request.get<unknown, SupplierContactItem[]>(`/eam/basic/suppliers/${supplierId}/contacts`, {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 為指定供應商創建/更新聯繫人（採購訂單手動錄入同步用） */
export async function syncSupplierContact(supplierId: number, contactName: string, contactPhone: string): Promise<void> {
  await request.post('/eam/basic/supplier-contacts', { supplierId, contactName, contactPhone, status: 'enabled' }, {
    headers: { [SILENT_HEADER]: '1' },
  })
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

/** 分類配件列表（onlyEnabled=true 時僅返回啟用狀態，驗收彈窗選項用） */
export async function fetchCategoryAccessories(categoryCode: string, onlyEnabled = false): Promise<CategoryAccessory[]> {
  return await request.get<unknown, CategoryAccessory[]>('/eam/basic/category-accessories', { params: { categoryCode, onlyEnabled } })
}

/** 新增分類配件，返回新記錄 ID */
export async function createCategoryAccessory(categoryCode: string, item: { name: string; defaultQty: number }): Promise<number> {
  return await request.post<unknown, number>(`/eam/basic/category-accessories/${encodeURIComponent(categoryCode)}`, item)
}

/** 修改分類配件（名稱/默認數量） */
export async function updateCategoryAccessory(id: number, item: { name: string; defaultQty: number }): Promise<void> {
  await request.put(`/eam/basic/category-accessories/item/${id}`, item)
}

/** 啟用/停用分類配件（status: 1=啟用, 0=停用） */
export async function updateCategoryAccessoryStatus(id: number, status: number): Promise<void> {
  await request.put(`/eam/basic/category-accessories/item/${id}/status`, null, { params: { status } })
}

/** 刪除分類配件（邏輯刪除） */
export async function deleteCategoryAccessory(id: number): Promise<void> {
  await request.delete(`/eam/basic/category-accessories/item/${id}`)
}

/* ==================== API：採購申請 ==================== */

export function fetchPurchaseRequestList(params?: EamPageQuery): Promise<PageResult<PurchaseRequest>> {
  return Promise.resolve({ records: [], total: 0 })
}

export function fetchPurchaseRequestDetail(id: number): Promise<PurchaseRequest> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

export function createPurchaseRequest(data: Omit<PurchaseRequest, 'id' | 'reqNo' | 'status' | 'createdAt'>): Promise<number> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

export function updatePurchaseRequest(id: number, data: Partial<PurchaseRequest>): Promise<void> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

export function deletePurchaseRequest(id: number): Promise<void> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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

/** 更新採購執行信息（回填供應商/價格/快遞/狀態推進） */
export async function updatePurchaseOrderExec(id: number, data: PurchaseOrderExecUpdate): Promise<void> {
  await request.put(`/eam/purchase/${id}`, data)
}

/** 採購執行列表（優先後端，不可用時降級 Mock） */
export async function fetchPurchaseOrderList(params?: PurchaseOrderQuery): Promise<PageResult<PurchaseOrder>> {
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
    records: (data?.records || []).map((o) => normalizePurchaseOrder(o)),
    total: data?.total || 0,
  }
}

/** 採購訂單詳情 */
export async function fetchPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  const data = await request.get<unknown, Record<string, unknown>>(`/eam/purchase/${id}`)
  return normalizePurchaseOrder(data)
}

/** 創建採購訂單（訂單編號由後端按規則配置生成） */
export async function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNo' | 'status' | 'execStatus' | 'createdAt'>): Promise<number> {
  return await request.post<unknown, number>('/eam/purchase', data)
}

export function updatePurchaseOrder(id: number, data: Partial<PurchaseOrder>): Promise<void> {
  return request.put<unknown, void>(`/eam/purchase/${id}`, data)
}

/** 刪除採購訂單（僅待處理可刪） */
export async function deletePurchaseOrder(id: number): Promise<void> {
  await request.delete(`/eam/purchase/${id}`)
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
  return request.post<unknown, { name: string; dataUrl: string }>('/eam/inbound/photo/upload', formData, { headers: { [SILENT_HEADER]: '1' } })
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  return Promise.resolve(null)
}

/** 刪除驗收入庫草稿（groupId 傳入時僅清該分組與訂單級舊草稿；未傳時清該訂單全部草稿） */
export function deleteInboundDraft(poId: number, groupId?: string): Promise<void> {
  // 仅清理历史本地草稿，不再将其作为业务数据读取。
  try {
    const prefix = `inbound_draft_${poId}`
    Object.keys(localStorage)
      .filter(k => groupId ? k === prefix || k === `${prefix}_${groupId}` : k === prefix || k.startsWith(`${prefix}_`))
      .forEach(k => localStorage.removeItem(k))
  } catch { /* 本地存储不可用不影响真实入库 */ }
  return Promise.resolve()
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
  return Promise.resolve({ records: [], total: 0 })
}

/** 獲取某員工的領用明細（分 Tab：在用 / 已歸還） */
export function fetchEmployeeClaimDetail(claimant: string): Promise<{ claimed: ClaimRecord[]; returned: ClaimRecord[] }> {
  return Promise.resolve({ claimed: [], returned: [] })
}

export function fetchClaimList(params?: ClaimQuery): Promise<PageResult<ClaimRecord>> {
  return Promise.resolve({ records: [], total: 0 })
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

export function fetchBorrowList(params?: BorrowQuery): Promise<PageResult<BorrowRecord>> {
  return Promise.resolve({ records: [], total: 0 })
}

export function fetchBorrowDetail(id: number): Promise<BorrowRecord> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

/** 續借：延長歸還期限，續借次數 +1，逾期狀態恢復為借用中 */
export async function renewBorrow(id: number, newDueDate: string, operator: string): Promise<void> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

/** 借用歸還：寫歸還記錄 + 資產回到閒置 + 關閉借用單 */
export async function returnBorrow(id: number, data: {
  returnDate: string
  condition: 'normal' | 'damaged' | 'lost'
  operator: string
  remark?: string
}): Promise<ReturnRecord> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

export function fetchReturnList(params?: EamPageQuery): Promise<PageResult<ReturnRecord>> {
  return Promise.resolve({ records: [], total: 0 })
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  await request.post(`/eam/handovers/${id}/cancel`, { reason })
}

/** 批量交接：逐件變更使用人/部門並寫交接流水 */
export async function createHandover(data: HandoverSaveData): Promise<HandoverRecord> {
  const id = await request.post<unknown, number>('/eam/handovers', data)
  return fetchHandoverDetail(id)
}

/* ==================== API：損壞賠付 ==================== */

export function fetchCompensationList(params?: EamPageQuery): Promise<PageResult<CompensationRecord>> {
  return Promise.resolve({ records: [], total: 0 })
}

export function fetchCompensationDetail(id: number): Promise<CompensationRecord> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
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
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

/** 賠付執行：登記賠付完成日期 */
export async function payCompensation(id: number, paidDate: string, operator: string): Promise<void> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

/** 回填歸還記錄關聯的賠付單 */
export function bindReturnCompensation(returnId: number, compensationId: number): Promise<void> {
  return Promise.reject(new Error('此旧版功能尚未接入真实 API，请使用已接入的业务入口'))
}

/* ==================== API：資產看板 ==================== */

export async function fetchEamDashboard(): Promise<EamDashboard> {
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

  return {
    totalCount: total,
    inUseCount: inUse,
    idleCount: idle,
    inRepairCount: inRepair,
    scrappedCount: scrapped,
    totalValue,
    idleRate: total ? Number(((idle / total) * 100).toFixed(1)) : 0,
    borrowingCount: null,
    overdueCount: null,
    pendingCompCount: null,
    pendingReqCount: null,
    pendingOrderCount: null,
    typeDistribution: groupCount((a) => a.assetType).map(({ key, count }) => ({ type: key, count })),
    departmentDistribution: groupCount((a) => a.department).map(({ key, count }) => ({ department: key, count })),
    categoryDistribution: groupCount((a) => categoryName(a.modelId)).map(({ key, count }) => ({ category: key, count })),
    monthlyInbound: list.length ? Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v })) : [],
  }
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
