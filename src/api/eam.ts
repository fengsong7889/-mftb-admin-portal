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
import {
  bulkCreateAssets,
  claimAsset,
  fetchAssetDetail,
  fetchAssetList,
  logAssetOperation,
  returnAsset,
  transferAsset,
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

/** 品牌庫（所属分类 → 品牌） */
export interface AssetBrand {
  id: number
  /** 所属分类编码 */
  categoryCode: string
  /** 品牌中文 */
  brandZh: string
  /** 品牌英文 */
  brandEn: string
  /** 品牌LOGO URL */
  brandLogo?: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 产品庫（品牌 → 产品） */
export interface AssetModel {
  id: number
  /** 所属分类编码 */
  categoryCode: string
  /** 所属品牌ID */
  brandId: number
  /** 品牌中文（冗余，方便展示） */
  brandZh: string
  /** 品牌英文（冗余） */
  brandEn?: string
  /** 品牌LOGO（冗余） */
  brandLogo?: string
  /** 产品型号编码（如 X1 Carbon Gen11） */
  modelNo?: string
  /** 产品名称（如 ThinkPad X1 Carbon 笔记本） */
  name: string
  /** 计量单位 */
  unit: string
  /** 参考单价（澳门元） */
  refPrice?: number
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 存放位置（樹形：倉庫/樓層/辦公室） */
export interface AssetLocation {
  id: number
  code: string
  name: string
  parentId: number
  type: 'warehouse' | 'floor' | 'room'
  sort: number
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
  /** 唯一行 key（前端用） */
  key?: string
  modelId?: number
  modelName?: string
  /** 資產分類 */
  categoryId?: number
  categoryName?: string
  categoryCode?: string
  /** 品牌 */
  brandId?: number
  brandName?: string
  /** 參數信息 */
  params?: Record<string, string>
  /** 採購形式：購買 / 租賃 */
  purchaseType?: 'purchase' | 'lease'
  qty: number
  /** 參考單價 */
  price: number
  /** 實際成交單價 */
  confirmedPrice?: number
  /** 已驗收入庫數量 */
  receivedQty: number
}

/** 供應商分組（一個採購訂單可包含多個供應商） */
export interface PurchaseOrderSupplierGroup {
  id: string
  supplier: string
  contact?: string
  orderDate?: string
  trackingNo?: string
  /** 收貨方式：自取 / 供應商送貨上門 / 快遞發貨 */
  deliveryMethod?: 'self_pickup' | 'supplier_delivery' | 'express'
  /** 預計收貨日期（從全局移入分組） */
  expectedReceiveDate?: string
  items: PurchaseOrderItem[]
}

/** 採購執行狀態 */
export type ExecStatus = 'pending' | 'purchasing' | 'completed'

/** 採購執行單（原採購訂單） */
export interface PurchaseOrder {
  id: number
  poNo: string
  /** 關聯採購申請 ID（0 表示直接下單） */
  reqId: number
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
  /** 快遞/物流單號（兼容舊數據） */
  trackingNo?: string
  /** 採購經辦人 */
  purchaser?: string
  /** 服務部門 */
  department?: string
  /** 實際下單日期（兼容舊數據） */
  orderDate?: string
  contact?: string
  remark?: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/** 入庫批次明細行 */
export interface InboundBatchItem {
  modelId: number
  modelName: string
  qty: number
  locationId: number
  /** 入庫後生成的資產編號 */
  assetNos: string[]
}

/** 驗收入庫批次 */
export interface InboundBatch {
  id: number
  batchNo: string
  poId: number
  poNo: string
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
  /** 品牌 */
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

/** 交接記錄（離職/調崗批量交接） */
export interface HandoverRecord {
  id: number
  handoverNo: string
  /** 交出人 */
  fromUser: string
  fromDepartment: string
  /** 接收人 */
  toUser: string
  toDepartment: string
  handoverDate: string
  assetIds: number[]
  assetCount: number
  /** 交接原因：resign=離職 / transfer=調崗 / other */
  reason: 'resign' | 'transfer' | 'other'
  status: 'done'
  operator: string
  remark?: string
  createdAt: string
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
    id: 1, handoverNo: 'JJ-2024-001', fromUser: '錢七(M007)', fromDepartment: '设计部',
    toUser: '孫八(M008)', toDepartment: '产品部', handoverDate: '2024-08-10',
    assetIds: [6], assetCount: 1, reason: 'resign', status: 'done', operator: '人事部',
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
export async function fetchCategoryList(params?: { keyword?: string; name?: string; code?: string; updatedBy?: string; updatedAtStart?: string; updatedAtEnd?: string }): Promise<AssetCategory[]> {
  const data = await request.get<unknown, AssetCategory[]>('/eam/basic/categories', { params, headers: { [SILENT_HEADER]: '1' } })
  return (data || []).map((c: any) => ({
    ...c,
    paramTemplate: typeof c.paramTemplate === 'string' ? (() => { try { return JSON.parse(c.paramTemplate) } catch { return [] } })() : (c.paramTemplate || []),
  }))
}

export async function createCategory(data: Omit<AssetCategory, 'id'>): Promise<number> {
    return await request.post<unknown, number>('/eam/basic/categories', {
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

/* ==================== API：品牌庫 ==================== */

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

export async function fetchLocationList(params?: { name?: string; code?: string; type?: string; updatedBy?: string; keyword?: string }): Promise<AssetLocation[]> {
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
  orderDate?: string
  contact?: string
  remark?: string
  /** 各型號實際成交單價（兼容舊數據） */
  confirmedPrices?: Record<number, number>
  /** 供應商分組（多供應商場景） */
  supplierGroups?: PurchaseOrderSupplierGroup[]
}

/** 更新採購執行信息（回填供應商/價格/快遞/狀態推進） */
export function updatePurchaseOrderExec(id: number, data: PurchaseOrderExecUpdate): Promise<void> {
  const idx = mockPurchaseOrders.findIndex((o) => o.id === id)
  if (idx === -1) return Promise.reject(new Error('採購執行單不存在'))
  const o = mockPurchaseOrders[idx]
  if (data.supplier !== undefined) o.supplier = data.supplier
  if (data.trackingNo !== undefined) o.trackingNo = data.trackingNo
  if (data.purchaser !== undefined) o.purchaser = data.purchaser
  if (data.department !== undefined) o.department = data.department
  if (data.orderDate !== undefined) o.orderDate = data.orderDate
  if (data.contact !== undefined) o.contact = data.contact
  if (data.remark !== undefined) o.remark = data.remark
  if (data.execStatus !== undefined) o.execStatus = data.execStatus
  if (data.supplierGroups !== undefined) {
    o.supplierGroups = data.supplierGroups
    // 同步更新頂層 items（取所有分組的 items 合併）
    o.items = data.supplierGroups.flatMap((g) => g.items)
    // 重新計算成交金額
    o.confirmedAmount = o.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)
  }
  if (data.confirmedPrices) {
    const cp = data.confirmedPrices!
    o.items.forEach((it) => {
      const mid = it.modelId
      if (mid && cp[mid] !== undefined) {
        it.confirmedPrice = cp[mid]
      }
    })
    o.confirmedAmount = o.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)
  }
  mockPurchaseOrders[idx] = o
  o.updatedBy = 'current_user'
  o.updatedAt = now()
  return delay(undefined as unknown as void)
}

export function fetchPurchaseOrderList(params?: PurchaseOrderQuery): Promise<PageResult<PurchaseOrder>> {
  let list = [...mockPurchaseOrders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
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

export function fetchPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  const item = mockPurchaseOrders.find((o) => o.id === id)
  if (!item) return Promise.reject(new Error('採購訂單不存在'))
  return delay(item)
}

export function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNo' | 'status' | 'execStatus' | 'createdAt'>): Promise<number> {
  const id = Math.max(0, ...mockPurchaseOrders.map((o) => o.id)) + 1
  mockPurchaseOrders = [
    { ...data, id, poNo: genNo('PO', id), status: 'pending', execStatus: 'pending', createdAt: now() },
    ...mockPurchaseOrders,
  ]
  return delay(id)
}

export function updatePurchaseOrder(id: number, data: Partial<PurchaseOrder>): Promise<void> {
  const idx = mockPurchaseOrders.findIndex((o) => o.id === id)
  if (idx === -1) return Promise.reject(new Error('採購訂單不存在'))
  mockPurchaseOrders[idx] = { ...mockPurchaseOrders[idx], ...data }
  return delay(undefined as unknown as void)
}

export function deletePurchaseOrder(id: number): Promise<void> {
  const item = mockPurchaseOrders.find((o) => o.id === id)
  if (!item) return Promise.reject(new Error('採購訂單不存在'))
  if (item.status !== 'pending') return Promise.reject(new Error('已有入庫記錄，無法刪除'))
  mockPurchaseOrders = mockPurchaseOrders.filter((o) => o.id !== id)
  return delay(undefined as unknown as void)
}

/* ==================== API：驗收入庫 ==================== */

export function fetchInboundList(params?: EamPageQuery): Promise<PageResult<InboundBatch>> {
  let list = [...mockInboundBatches].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.keyword) {
    list = list.filter((b) => matchKeyword(b, ['batchNo', 'poNo', 'operator'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 入庫批次詳情 */
export function fetchInboundDetail(batchId: number): Promise<InboundBatch | null> {
  const batch = mockInboundBatches.find((b) => b.id === batchId) || null
  return delay(batch)
}

/** 待入庫訂單（仍有未驗收數量的訂單） */
export function fetchPendingInboundOrders(): Promise<PurchaseOrder[]> {
  const list = mockPurchaseOrders.filter((o) => o.execStatus === 'completed' && o.status !== 'received')
  return delay(list)
}

/**
 * 創建入庫批次：按型號+數量批量生成資產寫入台賬，並回寫訂單已驗收數量與狀態
 */
export async function createInboundBatch(data: {
  poId: number
  inboundDate: string
  operator: string
  items: { modelId: number; qty: number; locationId: number }[]
  remark?: string
}): Promise<InboundBatch> {
  // 並行加載型號、分類、位置數據
  const [models, categories, locations] = await Promise.all([
    fetchModelList({ page: 1, size: 1000 }),
    fetchCategoryList(),
    fetchLocationList(),
  ])

  const modelMap = new Map(models.records.map((m: AssetModel) => [m.id, m]))
  const categoryMap = new Map(categories.map((c) => [c.code, c.name]))
  const locationMap = new Map(locations.map((l) => [l.id, l.name]))

  // 逐條展開為單件資產（一物一碼）
  const flat: { model: AssetModel; locationId: number }[] = []
  data.items.forEach((it) => {
    const model = modelMap.get(it.modelId)
    if (!model) throw new Error('型號不存在')
    for (let i = 0; i < it.qty; i += 1) flat.push({ model, locationId: it.locationId })
  })

  const categoryOf = (code: string) => categoryMap.get(code) || code
  const locationOf = (id: number) => locationMap.get(id) || ''

  const payload = flat.map(({ model, locationId }) => ({
    assetName: model.name,
    assetType: categoryOf(model.categoryCode),
    brand: model.brandZh,
    unit: model.unit,
    quantity: 1,
    purchaseValue: model.refPrice || 0,
    purchaseDate: data.inboundDate,
    usageDate: null,
    source: 'self' as const,
    company: '澳觅科技',
    location: locationOf(locationId),
    department: '物资部',
    userName: '',
    status: 'idle' as const,
    images: null,
    remark: `採購訂單入庫`,
    applicant: data.operator,
    scrapTime: null,
    modelId: model.id,
    locationId,
    holdType: 'owned' as const,
  }))

  const assetNos = await bulkCreateAssets(payload as unknown as Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt' | 'assetNo'>[])

  // 組織批次明細（按型號聚合生成的編號）
  let cursor = 0
  const items: InboundBatchItem[] = data.items.map((it) => {
    const model = modelMap.get(it.modelId)!
    const nos = assetNos.slice(cursor, cursor + it.qty)
    cursor += it.qty
    return { modelId: it.modelId, modelName: model.name, qty: it.qty, locationId: it.locationId, assetNos: nos }
  })

  // 調用後端 API 創建入庫批次
  return await request.post<unknown, InboundBatch>('/eam/inbound/batch', {
    poId: data.poId,
    inboundDate: data.inboundDate,
    operator: data.operator,
    items,
    totalQty: assetNos.length,
    remark: data.remark,
  })
}

/** 保存驗收入庫草稿（不創建資產，僅暫存當前驗收狀態） */
export function saveInboundDraft(data: {
  poId: number
  inboundDate: string
  operator: string
  items: { modelId: number; qty: number; locationId: number; status: 'pass' | 'return' | 'exchange' | 'concession'; reason?: string }[]
  remark?: string
}): Promise<void> {
  // 草稿暫存於 localStorage
  const key = `inbound_draft_${data.poId}`
  const draft = { ...data, savedAt: new Date().toISOString() }
  try { localStorage.setItem(key, JSON.stringify(draft)) } catch { /* quota */ }
  return delay(undefined as unknown as void)
}

/** 讀取驗收入庫草稿 */
export function loadInboundDraft(poId: number): Promise<{
  poId: number
  inboundDate: string
  operator: string
  items: { modelId: number; qty: number; locationId: number; status: 'pass' | 'return' | 'exchange' | 'concession'; reason?: string }[]
  remark?: string
  savedAt: string
} | null> {
  const key = `inbound_draft_${poId}`
  try {
    const raw = localStorage.getItem(key)
    return delay(raw ? JSON.parse(raw) : null)
  } catch {
    return delay(null)
  }
}

/** 刪除驗收入庫草稿 */
export function deleteInboundDraft(poId: number): Promise<void> {
  try { localStorage.removeItem(`inbound_draft_${poId}`) } catch { /* noop */ }
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

export function fetchHandoverList(params?: EamPageQuery): Promise<PageResult<HandoverRecord>> {
  let list = [...mockHandovers].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.keyword) {
    list = list.filter((h) => matchKeyword(h, ['handoverNo', 'fromUser', 'toUser', 'fromDepartment', 'toDepartment'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

/** 查詢某使用人名下資產（交接頁勾選用） */
export async function fetchUserAssets(userName: string): Promise<AssetItem[]> {
  if (!userName) return []
  const res = await fetchAssetList({ page: 1, size: 9999, userName })
  return res.records.filter((a) => a.status !== 'scrapped')
}

/** 批量交接：逐件變更使用人/部門並寫交接流水 */
export async function createHandover(data: {
  fromUser: string
  fromDepartment: string
  toUser: string
  toDepartment: string
  handoverDate: string
  assetIds: number[]
  reason: 'resign' | 'transfer' | 'other'
  operator: string
  remark?: string
}): Promise<HandoverRecord> {
  if (!data.assetIds.length) throw new Error('請至少選擇一件資產')
  if (data.fromUser === data.toUser) throw new Error('接收人不可與交出人相同')
  const reasonText = data.reason === 'resign' ? '離職交接' : (data.reason === 'transfer' ? '調崗交接' : '其他交接')

  for (const assetId of data.assetIds) {
    await transferAsset({
      assetId,
      toUser: data.toUser,
      toDepartment: data.toDepartment,
      reason: `${reasonText}：${data.fromUser} → ${data.toUser}`,
      applyBy: data.operator,
    })
    const asset = await fetchAssetDetail(assetId)
    await logAssetOperation({
      assetId,
      assetNo: asset.assetNo,
      assetName: asset.assetName,
      opType: 'handover',
      operator: data.operator,
      operateTime: now(),
      description: `${reasonText}，批量交接至 ${data.toUser}（${data.toDepartment}）`,
      fromUser: data.fromUser,
      fromDepartment: data.fromDepartment,
      toUser: data.toUser,
      toDepartment: data.toDepartment,
    })
  }

  const id = Math.max(0, ...mockHandovers.map((h) => h.id)) + 1
  const record: HandoverRecord = {
    id,
    handoverNo: genNo('JJ', id),
    fromUser: data.fromUser,
    fromDepartment: data.fromDepartment,
    toUser: data.toUser,
    toDepartment: data.toDepartment,
    handoverDate: data.handoverDate,
    assetIds: data.assetIds,
    assetCount: data.assetIds.length,
    reason: data.reason,
    status: 'done',
    operator: data.operator,
    remark: data.remark,
    createdAt: now(),
  }
  mockHandovers = [record, ...mockHandovers]
  return delay(record)
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
