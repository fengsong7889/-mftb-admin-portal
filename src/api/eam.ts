/**
 * EAM 企業資產管理擴展 API
 *
 * 承載物資管理全生命週期閉環的業務數據（前端 mock 先行，待界面確認後再設計後端表/接口）：
 *   基礎數據（分類/型號/位置）→ 採購申請 → 採購訂單 → 驗收入庫 →
 *   台賬 → 領用/借用 → 歸還 → 調撥/交接 → 維修/賠付 → 報廢
 *
 * 台賬主數據與操作流水仍由 ./asset 承載，本文件僅擴展 EAM 專屬實體。
 */
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
  /** 分類編碼（唯一，如 DIANZI / DIANZI-NB） */
  code: string
  name: string
  /** 父級 ID，0 為頂級 */
  parentId: number
  /** 該分類下資產需填寫的參數模板 */
  paramTemplate: ParamField[]
  sort: number
  remark?: string
  updatedBy?: string
  updatedAt?: string
}

/** 品牌型號庫 */
export interface AssetModel {
  id: number
  /** 所屬分類編碼 */
  categoryCode: string
  brand: string
  /** 型號（如 X1 Carbon Gen11） */
  modelNo: string
  /** 型號名稱（如 ThinkPad X1 Carbon 筆記本） */
  name: string
  /** 參數實例（按分類 paramTemplate 填寫） */
  params: Record<string, string>
  /** 參考單價（澳門元） */
  refPrice: number
  unit: string
  supplier?: string
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
  modelId: number
  modelName: string
  qty: number
  /** 成交單價 */
  price: number
  /** 已驗收入庫數量 */
  receivedQty: number
}

/** 採購訂單 */
export interface PurchaseOrder {
  id: number
  poNo: string
  /** 關聯採購申請 ID（0 表示直接下單） */
  reqId: number
  supplier: string
  /** 訂單金額 */
  amount: number
  /** 預計交貨日期 */
  deliveryDate: string
  items: PurchaseOrderItem[]
  /** pending=待收貨 / partial=部分入庫 / received=全部入庫 */
  status: 'pending' | 'partial' | 'received'
  contact?: string
  remark?: string
  createdAt: string
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
  remark?: string
  createdAt: string
}

/* ==================== 領用 / 借用 / 歸還 ==================== */

/** 領用單（長期配給） */
export interface ClaimRecord {
  id: number
  claimNo: string
  assetId: number
  assetNo: string
  assetName: string
  /** 領用人 */
  claimant: string
  department: string
  claimDate: string
  operator: string
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

export interface ModelQuery extends EamPageQuery {
  categoryCode?: string
  brand?: string
  name?: string
  supplier?: string
  updatedBy?: string
  createdAtStart?: string
  createdAtEnd?: string
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

/* ==================== Mock 數據：基礎數據 ==================== */

let mockCategories: AssetCategory[] = [
  {
    id: 1, code: 'DIANZI', name: '電子設備', parentId: 0, sort: 1,
    paramTemplate: [{ key: 'sn', label: '序列號', type: 'text' }],
    remark: '電腦/顯示器/服務器等',
    updatedBy: '張三', updatedAt: '2025-08-15 10:30:00',
  },
  {
    id: 2, code: 'DIANZI-NB', name: '筆記本電腦', parentId: 1, sort: 1,
    paramTemplate: [
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '內存', type: 'number', unit: 'GB' },
      { key: 'disk', label: '硬盤', type: 'number', unit: 'GB' },
      { key: 'screen', label: '屏幕尺寸', type: 'number', unit: '英寸' },
      { key: 'os', label: '操作系統', type: 'select', options: ['Windows 11', 'macOS', 'Ubuntu'] },
    ],
    updatedBy: '李四', updatedAt: '2025-08-20 14:22:00',
  },
  {
    id: 3, code: 'DIANZI-MON', name: '顯示器', parentId: 1, sort: 2,
    paramTemplate: [
      { key: 'screen', label: '屏幕尺寸', type: 'number', unit: '英寸' },
      { key: 'resolution', label: '分辨率', type: 'text' },
      { key: 'panel', label: '面板類型', type: 'select', options: ['IPS', 'VA', 'OLED'] },
    ],
    updatedBy: '王五', updatedAt: '2025-07-10 09:15:00',
  },
  {
    id: 4, code: 'DIANZI-SRV', name: '服務器', parentId: 1, sort: 3,
    paramTemplate: [
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '內存', type: 'number', unit: 'GB' },
      { key: 'disk', label: '硬盤', type: 'number', unit: 'TB' },
      { key: 'rack', label: '機架規格', type: 'select', options: ['1U', '2U', '4U'] },
    ],
    updatedBy: '趙六', updatedAt: '2025-09-01 16:45:00',
  },
  {
    id: 5, code: 'JIAJU', name: '辦公家具', parentId: 0, sort: 2,
    paramTemplate: [{ key: 'material', label: '材質', type: 'text' }],
    remark: '桌椅/文件櫃等',
    updatedBy: '張三', updatedAt: '2025-06-20 11:00:00',
  },
  {
    id: 6, code: 'JIAJU-CHAIR', name: '辦公椅', parentId: 5, sort: 1,
    paramTemplate: [
      { key: 'size', label: '尺寸', type: 'text', unit: 'mm' },
      { key: 'material', label: '材質', type: 'select', options: ['網布', '皮質', '布藝'] },
      { key: 'color', label: '顏色', type: 'select', options: ['黑色', '灰色', '藍色'] },
    ],
    updatedBy: '李四', updatedAt: '2025-07-05 13:30:00',
  },
  {
    id: 7, code: 'JIAJU-DESK', name: '辦公桌', parentId: 5, sort: 2,
    paramTemplate: [
      { key: 'size', label: '尺寸', type: 'text', unit: 'mm' },
      { key: 'material', label: '材質', type: 'select', options: ['實木', '板材', '鋼木'] },
      { key: 'color', label: '顏色', type: 'select', options: ['原木色', '白色', '胡桃色'] },
    ],
    updatedBy: '王五', updatedAt: '2025-08-01 10:20:00',
  },
  {
    id: 8, code: 'SHEBEI', name: '辦公設備', parentId: 0, sort: 3,
    paramTemplate: [{ key: 'power', label: '功率', type: 'number', unit: 'W' }],
    remark: '空調/打印機/投影儀等',
    updatedBy: '趙六', updatedAt: '2025-08-25 15:10:00',
  },
  {
    id: 9, code: 'SHEBEI-AC', name: '空調', parentId: 8, sort: 1,
    paramTemplate: [
      { key: 'power', label: '功率', type: 'number', unit: 'W' },
      { key: 'hp', label: '匹數', type: 'select', options: ['1匹', '1.5匹', '2匹', '3匹'] },
    ],
    updatedBy: '張三', updatedAt: '2025-09-05 09:00:00',
  },
]

let mockModels: AssetModel[] = [
  {
    id: 1, categoryCode: 'DIANZI-NB', brand: 'Lenovo', modelNo: 'X1 Carbon Gen11',
    name: 'ThinkPad X1 Carbon 筆記本',
    params: { cpu: 'Intel i7-1360P', memory: '32', disk: '1024', screen: '14', os: 'Windows 11' },
    refPrice: 15800, unit: '台', supplier: '聯想澳門授權經銷商', createdAt: '2024-01-05 10:00:00',
    updatedBy: '張三', updatedAt: '2025-08-10 14:30:00',
  },
  {
    id: 2, categoryCode: 'DIANZI-NB', brand: 'Apple', modelNo: 'MacBook Pro 16 M3',
    name: 'MacBook Pro 16 筆記本',
    params: { cpu: 'Apple M3 Pro', memory: '36', disk: '1024', screen: '16', os: 'macOS' },
    refPrice: 25000, unit: '台', supplier: 'Apple 企業採購', createdAt: '2024-01-05 10:05:00',
    updatedBy: '李四', updatedAt: '2025-07-22 09:15:00',
  },
  {
    id: 3, categoryCode: 'DIANZI-MON', brand: 'Dell', modelNo: 'U2723QE',
    name: 'Dell 27 吋 4K 顯示器',
    params: { screen: '27', resolution: '3840x2160', panel: 'IPS' },
    refPrice: 4200, unit: '台', supplier: 'Dell 澳門', createdAt: '2024-01-06 09:00:00',
    updatedBy: '王五', updatedAt: '2025-06-18 16:45:00',
  },
  {
    id: 4, categoryCode: 'DIANZI-SRV', brand: 'Dell', modelNo: 'PowerEdge R750',
    name: '戴爾服務器 R750',
    params: { cpu: 'Xeon Gold 6330 x2', memory: '128', disk: '8', rack: '2U' },
    refPrice: 65000, unit: '台', supplier: 'Dell 澳門', createdAt: '2024-01-06 09:10:00',
    updatedBy: '張三', updatedAt: '2025-05-30 11:20:00',
  },
  {
    id: 5, categoryCode: 'JIAJU-CHAIR', brand: 'Herman Miller', modelNo: 'Aeron Remastered',
    name: '人體工學椅 Aeron',
    params: { size: '680x680x1050', material: '網布', color: '黑色' },
    refPrice: 12000, unit: '把', supplier: '優比辦公家具', createdAt: '2024-02-01 11:00:00',
    updatedBy: '趙六', updatedAt: '2025-04-12 10:00:00',
  },
  {
    id: 6, categoryCode: 'JIAJU-CHAIR', brand: '震旦', modelNo: 'AURORA-C21',
    name: '標準職員椅',
    params: { size: '600x600x950', material: '布藝', color: '灰色' },
    refPrice: 980, unit: '把', supplier: '震旦辦公', createdAt: '2024-02-01 11:05:00',
    updatedBy: '李四', updatedAt: '2025-03-25 15:30:00',
  },
  {
    id: 7, categoryCode: 'JIAJU-DESK', brand: '震旦', modelNo: 'AURORA-D140',
    name: '1.4 米職員桌',
    params: { size: '1400x700x750', material: '板材', color: '原木色' },
    refPrice: 1580, unit: '張', supplier: '震旦辦公', createdAt: '2024-02-01 11:10:00',
    updatedBy: '王五', updatedAt: '2025-02-14 08:50:00',
  },
  {
    id: 8, categoryCode: 'SHEBEI-AC', brand: 'Mitsubishi', modelNo: 'MSZ-GV18VA',
    name: '變頻分體空調 2 匹',
    params: { power: '1800', hp: '2匹' },
    refPrice: 8600, unit: '台', supplier: '三菱電機澳門', createdAt: '2024-03-01 15:00:00',
    updatedBy: '張三', updatedAt: '2025-01-08 13:10:00',
  },
]

let mockLocations: AssetLocation[] = [
  { id: 1, code: 'WH-HQ', name: '總部倉庫', parentId: 0, type: 'warehouse', sort: 1, address: '澳門南灣大馬路 100 號', updatedBy: '張三', updatedAt: '2026-09-01 10:30:00' },
  { id: 2, code: 'WH-B1', name: 'B1 備品倉', parentId: 0, type: 'warehouse', sort: 2, address: '澳門氹仔工業園 B1 棟', updatedBy: '李四', updatedAt: '2026-08-28 14:20:00' },
  { id: 3, code: 'FL-A3', name: 'A 座 3 樓', parentId: 0, type: 'floor', sort: 3, address: '澳門科學園 A 座 3F', updatedBy: '張三', updatedAt: '2026-08-25 09:15:00' },
  { id: 4, code: 'RM-A301', name: 'A301 研發辦公室', parentId: 3, type: 'room', sort: 1, address: 'A 座 3F-301', updatedBy: '王五', updatedAt: '2026-09-05 16:40:00' },
  { id: 5, code: 'RM-A302', name: 'A302 會議室', parentId: 3, type: 'room', sort: 2, address: 'A 座 3F-302', updatedBy: '王五', updatedAt: '2026-09-05 16:45:00' },
  { id: 6, code: 'FL-B2', name: 'B 座 2 樓', parentId: 0, type: 'floor', sort: 4, address: '澳門科學園 B 座 2F', updatedBy: '李四', updatedAt: '2026-08-20 11:00:00' },
  { id: 7, code: 'RM-B201', name: 'B201 市场部', parentId: 6, type: 'room', sort: 1, address: 'B 座 2F-201', updatedBy: '趙六', updatedAt: '2026-09-02 08:30:00' },
  { id: 8, code: 'RM-SRV', name: '總部機房', parentId: 0, type: 'room', sort: 5, address: '澳門南灣大馬路 100 號 B1', updatedBy: '張三', updatedAt: '2026-09-08 17:00:00' },
]

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

let mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 1, poNo: 'PO-2024-001', reqId: 1, supplier: '聯想澳門授權經銷商', amount: 60000,
    deliveryDate: shiftDay(D, -5),
    items: [
      { modelId: 1, modelName: 'ThinkPad X1 Carbon 筆記本', qty: 3, price: 15800, receivedQty: 3 },
      { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 3, price: 4200, receivedQty: 3 },
    ],
    status: 'received', contact: '陳先生 6233-0000', remark: '含三年上門保固',
    createdAt: '2024-09-05 10:00:00',
  },
  {
    id: 2, poNo: 'PO-2024-002', reqId: 0, supplier: '三菱電機澳門', amount: 17200,
    deliveryDate: shiftDay(D, 10),
    items: [{ modelId: 8, modelName: '變頻分體空調 2 匹', qty: 2, price: 8600, receivedQty: 0 }],
    status: 'pending', contact: '林小姐 6688-1234',
    createdAt: '2024-09-20 16:30:00',
  },
]

let mockInboundBatches: InboundBatch[] = [
  {
    id: 1, batchNo: 'RK-2024-001', poId: 1, poNo: 'PO-2024-001',
    inboundDate: shiftDay(D, -3), operator: '李四(M002)',
    items: [
      { modelId: 1, modelName: 'ThinkPad X1 Carbon 筆記本', qty: 3, locationId: 1, assetNos: ['ZC-2024-0101', 'ZC-2024-0102', 'ZC-2024-0103'] },
      { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 3, locationId: 1, assetNos: ['ZC-2024-0104', 'ZC-2024-0105', 'ZC-2024-0106'] },
    ],
    totalQty: 6, remark: '驗收合格，全部入庫', createdAt: '2024-09-25 11:00:00',
  },
]

/* ==================== Mock 數據：領用 / 借用 / 歸還 ==================== */

let mockClaims: ClaimRecord[] = [
  {
    id: 1, claimNo: 'LY-2024-001', assetId: 1, assetNo: 'ZC-2024-0001', assetName: 'ThinkPad X1 Carbon 筆記本',
    claimant: '張三(M001)', department: '研发部', claimDate: '2024-01-20', operator: '李四(M002)',
    remark: '新員工入職配發',
  },
  {
    id: 2, claimNo: 'LY-2024-002', assetId: 3, assetNo: 'ZC-2024-0003', assetName: '人體工學椅',
    claimant: '趙六(M004)', department: '人事部', claimDate: '2024-02-25', operator: '李四(M002)',
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
export function fetchCategoryList(params?: { keyword?: string; name?: string; code?: string; updatedBy?: string; updatedAtStart?: string; updatedAtEnd?: string }): Promise<AssetCategory[]> {
  let list = [...mockCategories].sort((a, b) => a.parentId - b.parentId || a.sort - b.sort)
  if (params?.keyword) list = list.filter((c) => matchKeyword(c, ['code', 'name'], params.keyword))
  if (params?.name) list = list.filter((c) => c.name.toLowerCase().includes(params.name!.toLowerCase()))
  if (params?.code) list = list.filter((c) => c.code.toLowerCase().includes(params.code!.toLowerCase()))
  if (params?.updatedBy) list = list.filter((c) => c.updatedBy && c.updatedBy.includes(params.updatedBy!))
  if (params?.updatedAtStart) list = list.filter((c) => c.updatedAt && c.updatedAt >= params.updatedAtStart!)
  if (params?.updatedAtEnd) list = list.filter((c) => c.updatedAt && c.updatedAt <= params.updatedAtEnd!)
  return delay(list)
}

export function createCategory(data: Omit<AssetCategory, 'id'>): Promise<number> {
  if (mockCategories.some((c) => c.code === data.code)) return Promise.reject(new Error('分類編碼已存在'))
  const id = Math.max(0, ...mockCategories.map((c) => c.id)) + 1
  mockCategories = [...mockCategories, { ...data, id }]
  return delay(id)
}

export function updateCategory(id: number, data: Partial<AssetCategory>): Promise<void> {
  const idx = mockCategories.findIndex((c) => c.id === id)
  if (idx === -1) return Promise.reject(new Error('分類不存在'))
  if (data.code && mockCategories.some((c) => c.code === data.code && c.id !== id)) {
    return Promise.reject(new Error('分類編碼已存在'))
  }
  mockCategories[idx] = { ...mockCategories[idx], ...data }
  return delay(undefined as unknown as void)
}

export function deleteCategory(id: number): Promise<void> {
  const idx = mockCategories.findIndex((c) => c.id === id)
  if (idx === -1) return Promise.reject(new Error('分類不存在'))
  if (mockCategories.some((c) => c.parentId === id)) return Promise.reject(new Error('請先刪除下級分類'))
  const code = mockCategories[idx].code
  if (mockModels.some((m) => m.categoryCode === code)) return Promise.reject(new Error('該分類下已存在型號，無法刪除'))
  mockCategories = mockCategories.filter((c) => c.id !== id)
  return delay(undefined as unknown as void)
}

/* ==================== API：品牌型號庫 ==================== */

export function fetchModelList(params?: ModelQuery): Promise<PageResult<AssetModel>> {
  let list = [...mockModels]
  if (params?.categoryCode) {
    const code = params.categoryCode
    list = list.filter((m) => m.categoryCode === code || m.categoryCode.startsWith(`${code}-`))
  }
  if (params?.brand) list = list.filter((m) => m.brand === params.brand)
  if (params?.name) list = list.filter((m) => matchKeyword(m, ['name'], params.name))
  if (params?.supplier) list = list.filter((m) => matchKeyword(m, ['supplier'], params.supplier))
  if (params?.updatedBy) list = list.filter((m) => matchKeyword(m, ['updatedBy'], params.updatedBy))
  if (params?.createdAtStart) list = list.filter((m) => m.createdAt >= params.createdAtStart!)
  if (params?.createdAtEnd) list = list.filter((m) => m.createdAt <= params.createdAtEnd!)
  if (params?.updatedAtStart) list = list.filter((m) => m.updatedAt && m.updatedAt >= params.updatedAtStart!)
  if (params?.updatedAtEnd) list = list.filter((m) => m.updatedAt && m.updatedAt <= params.updatedAtEnd!)
  return delay(paginate(list, params?.page, params?.size ?? 9999))
}

export function fetchModelDetail(id: number): Promise<AssetModel> {
  const item = mockModels.find((m) => m.id === id)
  if (!item) return Promise.reject(new Error('型號不存在'))
  return delay(item)
}

export function createModel(data: Omit<AssetModel, 'id' | 'createdAt'>): Promise<number> {
  if (mockModels.some((m) => m.brand === data.brand && m.modelNo === data.modelNo)) {
    return Promise.reject(new Error('該品牌型號已存在'))
  }
  const id = Math.max(0, ...mockModels.map((m) => m.id)) + 1
  mockModels = [{ ...data, id, createdAt: now() }, ...mockModels]
  return delay(id)
}

export function updateModel(id: number, data: Partial<AssetModel>): Promise<void> {
  const idx = mockModels.findIndex((m) => m.id === id)
  if (idx === -1) return Promise.reject(new Error('型號不存在'))
  mockModels[idx] = { ...mockModels[idx], ...data }
  return delay(undefined as unknown as void)
}

export function deleteModel(id: number): Promise<void> {
  mockModels = mockModels.filter((m) => m.id !== id)
  return delay(undefined as unknown as void)
}

/* ==================== API：存放位置 ==================== */

export function fetchLocationList(params?: { name?: string; code?: string; type?: string; updatedBy?: string; keyword?: string }): Promise<AssetLocation[]> {
  let list = [...mockLocations].sort((a, b) => a.parentId - b.parentId || a.sort - b.sort)
  if (params?.keyword) list = list.filter((l) => matchKeyword(l, ['code', 'name'], params.keyword))
  if (params?.name) list = list.filter((l) => l.name.toLowerCase().includes(params.name!.toLowerCase()))
  if (params?.code) list = list.filter((l) => l.code.toLowerCase().includes(params.code!.toLowerCase()))
  if (params?.type) list = list.filter((l) => l.type === params.type)
  if (params?.updatedBy) list = list.filter((l) => l.updatedBy?.toLowerCase().includes(params.updatedBy!.toLowerCase()))
  return delay(list)
}

export function createLocation(data: Omit<AssetLocation, 'id'>): Promise<number> {
  const id = Math.max(0, ...mockLocations.map((l) => l.id)) + 1
  // 編碼自動生成：CK(倉庫) / CKDZ(樓層) / CKDZXQ(辦公室) + YYYYMMDD + 3位自增
  let code = data.code
  if (code === '__auto__') {
    const prefix: Record<AssetLocation['type'], string> = { warehouse: 'CK', floor: 'CKDZ', room: 'CKDZXQ' }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const p = prefix[data.type] + today
    const sameDay = mockLocations.filter((l) => l.code.startsWith(p)).length
    code = p + String(sameDay + 1).padStart(3, '0')
  }
  if (mockLocations.some((l) => l.code === code)) return Promise.reject(new Error('位置編碼已存在'))
  mockLocations = [...mockLocations, { ...data, code, id, updatedBy: '當前用戶', updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) }]
  return delay(id)
}

export function updateLocation(id: number, data: Partial<AssetLocation>): Promise<void> {
  const idx = mockLocations.findIndex((l) => l.id === id)
  if (idx === -1) return Promise.reject(new Error('位置不存在'))
  if (data.code && data.code !== '__auto__' && mockLocations.some((l) => l.code === data.code && l.id !== id)) {
    return Promise.reject(new Error('位置編碼已存在'))
  }
  mockLocations[idx] = {
    ...mockLocations[idx], ...data,
    updatedBy: '當前用戶',
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  }
  return delay(undefined as unknown as void)
}

export function deleteLocation(id: number): Promise<void> {
  if (mockLocations.some((l) => l.parentId === id)) return Promise.reject(new Error('請先刪除下級位置'))
  mockLocations = mockLocations.filter((l) => l.id !== id)
  return delay(undefined as unknown as void)
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
  const firstModel = mockModels.find((m) => m.id === req.items[0]?.modelId)
  const amount = req.items.reduce((s, it) => s + it.qty * it.estPrice, 0)
  const orderId = Math.max(0, ...mockPurchaseOrders.map((o) => o.id)) + 1
  const order: PurchaseOrder = {
    id: orderId,
    poNo: genNo('PO', orderId),
    reqId: req.id,
    supplier: firstModel?.supplier || '待定供應商',
    amount,
    deliveryDate: shiftDay(today(), 14),
    items: req.items.map((it) => ({
      modelId: it.modelId, modelName: it.modelName, qty: it.qty, price: it.estPrice, receivedQty: 0,
    })),
    status: 'pending',
    remark: `由採購申請 ${req.reqNo} 審批通過自動生成`,
    createdAt: now(),
  }
  mockPurchaseOrders = [order, ...mockPurchaseOrders]
  mockPurchaseRequests[idx] = { ...mockPurchaseRequests[idx], orderId }
  return orderId
}

/* ==================== API：採購訂單 ==================== */

export function fetchPurchaseOrderList(params?: EamPageQuery): Promise<PageResult<PurchaseOrder>> {
  let list = [...mockPurchaseOrders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  if (params?.status && params.status !== 'all') list = list.filter((o) => o.status === params.status)
  if (params?.keyword) {
    list = list.filter((o) => matchKeyword(o, ['poNo', 'supplier', 'contact'], params.keyword))
  }
  return delay(paginate(list, params?.page, params?.size))
}

export function fetchPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  const item = mockPurchaseOrders.find((o) => o.id === id)
  if (!item) return Promise.reject(new Error('採購訂單不存在'))
  return delay(item)
}

export function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'poNo' | 'status' | 'createdAt'>): Promise<number> {
  const id = Math.max(0, ...mockPurchaseOrders.map((o) => o.id)) + 1
  mockPurchaseOrders = [
    { ...data, id, poNo: genNo('PO', id), status: 'pending', createdAt: now() },
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

/** 待入庫訂單（仍有未驗收數量的訂單） */
export function fetchPendingInboundOrders(): Promise<PurchaseOrder[]> {
  const list = mockPurchaseOrders.filter((o) => o.status !== 'received')
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
  const orderIdx = mockPurchaseOrders.findIndex((o) => o.id === data.poId)
  if (orderIdx === -1) throw new Error('採購訂單不存在')
  const order = mockPurchaseOrders[orderIdx]

  // 校驗入庫數量不可超過訂單剩餘未驗收數量
  data.items.forEach((it) => {
    const line = order.items.find((l) => l.modelId === it.modelId)
    if (!line) throw new Error('入庫型號不在訂單明細中')
    if (line.receivedQty + it.qty > line.qty) throw new Error(`${line.modelName} 入庫數量超出訂單未驗收數量`)
  })

  // 逐條展開為單件資產（一物一碼）
  const flat: { model: AssetModel; locationId: number }[] = []
  data.items.forEach((it) => {
    const model = mockModels.find((m) => m.id === it.modelId)
    if (!model) throw new Error('型號不存在')
    for (let i = 0; i < it.qty; i += 1) flat.push({ model, locationId: it.locationId })
  })

  const categoryOf = (code: string) => mockCategories.find((c) => c.code === code)?.name || code
  const locationOf = (id: number) => mockLocations.find((l) => l.id === id)?.name || ''

  const payload = flat.map(({ model, locationId }) => ({
    assetName: model.name,
    assetType: categoryOf(model.categoryCode),
    brand: model.brand,
    unit: model.unit,
    quantity: 1,
    purchaseValue: model.refPrice,
    purchaseDate: data.inboundDate,
    usageDate: null,
    source: 'self' as const,
    company: '澳觅科技',
    location: locationOf(locationId),
    department: '物资部',
    userName: '',
    status: 'idle' as const,
    images: null,
    remark: `採購訂單 ${order.poNo} 驗收入庫`,
    applicant: data.operator,
    scrapTime: null,
    modelId: model.id,
    locationId,
    holdType: 'owned' as const,
    params: model.params,
  }))

  const assetNos = await bulkCreateAssets(payload as unknown as Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt' | 'assetNo'>[])

  // 回寫訂單已驗收數量與狀態
  order.items.forEach((line) => {
    const inboundQty = data.items.find((it) => it.modelId === line.modelId)?.qty || 0
    line.receivedQty += inboundQty
  })
  const allReceived = order.items.every((line) => line.receivedQty >= line.qty)
  const anyReceived = order.items.some((line) => line.receivedQty > 0)
  order.status = allReceived ? 'received' : (anyReceived ? 'partial' : 'pending')

  // 組織批次明細（按型號聚合生成的編號）
  let cursor = 0
  const items: InboundBatchItem[] = data.items.map((it) => {
    const model = mockModels.find((m) => m.id === it.modelId)!
    const nos = assetNos.slice(cursor, cursor + it.qty)
    cursor += it.qty
    return { modelId: it.modelId, modelName: model.name, qty: it.qty, locationId: it.locationId, assetNos: nos }
  })

  const batchId = Math.max(0, ...mockInboundBatches.map((b) => b.id)) + 1
  const batch: InboundBatch = {
    id: batchId,
    batchNo: genNo('RK', batchId),
    poId: order.id,
    poNo: order.poNo,
    inboundDate: data.inboundDate,
    operator: data.operator,
    items,
    totalQty: assetNos.length,
    remark: data.remark,
    createdAt: now(),
  }
  mockInboundBatches = [batch, ...mockInboundBatches]
  return delay(batch)
}

/* ==================== API：領用 ==================== */

export function fetchClaimList(params?: EamPageQuery): Promise<PageResult<ClaimRecord>> {
  let list = [...mockClaims].sort((a, b) => (a.claimDate < b.claimDate ? 1 : -1))
  if (params?.department) list = list.filter((c) => c.department === params.department)
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
    claimant: data.claimant,
    department: data.department,
    claimDate: data.claimDate,
    operator: data.operator,
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
  const [assets, models] = await Promise.all([
    fetchAssetList({ page: 1, size: 9999 }),
    fetchModelList({ size: 9999 }),
  ])
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
    return mockCategories.find((c) => c.code === m.categoryCode)?.name || m.categoryCode
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
