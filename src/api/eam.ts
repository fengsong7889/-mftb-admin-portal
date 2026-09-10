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
  modelId: number
  modelName: string
  qty: number
  /** 預估單價（來自採購申請） */
  price: number
  /** 實際成交單價（採購人員回填） */
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
  /** 快遞/物流單號（兼容舊數據） */
  trackingNo?: string
  /** 採購經辦人 */
  purchaser?: string
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

/* ==================== Mock 數據：基礎數據 ==================== */

let mockCategories: AssetCategory[] = [
  // ===== 一级分类 =====
  { id: 1, code: '0101', name: '计算机和网络设备', parentId: 0, status: 'enabled', sort: 1, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 2, code: '0102', name: '办公设备', parentId: 0, status: 'enabled', sort: 2, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 3, code: '0103', name: '办公家具', parentId: 0, status: 'enabled', sort: 3, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 4, code: '0104', name: '办公电器', parentId: 0, status: 'enabled', sort: 4, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 5, code: '0105', name: '文艺体育设备', parentId: 0, status: 'enabled', sort: 5, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 6, code: '0106', name: '仪器仪表', parentId: 0, status: 'enabled', sort: 6, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 7, code: '0107', name: '车辆', parentId: 0, status: 'enabled', sort: 7, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 8, code: '0108', name: '图书、档案', parentId: 0, status: 'enabled', sort: 8, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 9, code: '0109', name: '专用设备', parentId: 0, status: 'enabled', sort: 9, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 40, code: '0110', name: '安防与通讯设备', parentId: 0, status: 'enabled', sort: 10, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0101 子分类 =====
  { id: 10, code: '010101', name: '笔记本电脑', parentId: 1, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'cpu', label: 'CPU', type: 'select', options: ['Intel Core i5-1340P', 'Intel Core i7-1360P', 'Intel Core i9-13900H', 'Intel Core Ultra 7 155H', 'Intel Core Ultra 9 185H', 'AMD Ryzen 7 7840U', 'AMD Ryzen 9 7940HS', 'Apple M3', 'Apple M3 Pro', 'Apple M3 Max'] },
    { key: 'memory', label: '内存', type: 'select', options: ['8GB', '16GB', '32GB', '64GB', '128GB'] },
    { key: 'disk', label: '硬盘', type: 'select', options: ['256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD', '4TB SSD'] },
    { key: 'screen', label: '屏幕', type: 'select', options: ['13.3英寸', '14英寸', '15.6英寸', '16英寸', '16.2英寸'] },
    { key: 'os', label: '操作系统', type: 'select', options: ['Windows 11', 'macOS', 'Linux', 'ChromeOS'] },
    { key: 'gpu', label: '显卡', type: 'select', options: ['Intel Iris Xe', 'Intel Arc Graphics', 'NVIDIA GeForce RTX 4050', 'NVIDIA GeForce RTX 4060', 'NVIDIA GeForce RTX 4070', 'AMD Radeon 780M', 'Apple M3 GPU', 'Apple M3 Pro GPU'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 11, code: '010102', name: '台式机', parentId: 1, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'cpu', label: 'CPU', type: 'text' }, { key: 'memory', label: '内存', type: 'number', unit: 'GB' },
    { key: 'disk', label: '硬盘', type: 'number', unit: 'GB' }, { key: 'gpu', label: '显卡', type: 'text' },
    { key: 'os', label: '操作系统', type: 'select', options: ['Windows 11', 'macOS', 'Linux'] },
    { key: 'formFactor', label: '机箱类型', type: 'select', options: ['塔式', '迷你', '小型'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 12, code: '010103', name: '一体机', parentId: 1, status: 'enabled', sort: 3, paramTemplate: [
    { key: 'cpu', label: 'CPU', type: 'text' }, { key: 'memory', label: '内存', type: 'number', unit: 'GB' },
    { key: 'disk', label: '硬盘', type: 'number', unit: 'GB' }, { key: 'screen', label: '屏幕', type: 'number', unit: '英寸' },
    { key: 'os', label: '操作系统', type: 'select', options: ['Windows 11', 'macOS'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 13, code: '010104', name: '手机', parentId: 1, status: 'enabled', sort: 4, paramTemplate: [
    { key: 'processor', label: '处理器', type: 'text' }, { key: 'memory', label: '内存', type: 'number', unit: 'GB' },
    { key: 'storage', label: '存储', type: 'number', unit: 'GB' }, { key: 'screen', label: '屏幕', type: 'number', unit: '英寸' },
    { key: 'os', label: '系统', type: 'select', options: ['iOS', 'Android', 'HarmonyOS'] },
    { key: 'camera', label: '摄像头', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 14, code: '010105', name: '平板电脑', parentId: 1, status: 'enabled', sort: 5, paramTemplate: [
    { key: 'processor', label: '处理器', type: 'text' }, { key: 'memory', label: '内存', type: 'number', unit: 'GB' },
    { key: 'storage', label: '存储', type: 'number', unit: 'GB' }, { key: 'screen', label: '屏幕', type: 'number', unit: '英寸' },
    { key: 'os', label: '系统', type: 'select', options: ['iPadOS', 'Android', 'Windows', 'HarmonyOS'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 15, code: '010106', name: '显示器', parentId: 1, status: 'enabled', sort: 6, paramTemplate: [
    { key: 'screen', label: '尺寸', type: 'number', unit: '英寸' }, { key: 'resolution', label: '分辨率', type: 'text' },
    { key: 'panel', label: '面板', type: 'select', options: ['IPS', 'VA', 'TN', 'OLED'] },
    { key: 'refreshRate', label: '刷新率', type: 'number', unit: 'Hz' },
    { key: 'interface', label: '接口', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 16, code: '010107', name: '主机', parentId: 1, status: 'enabled', sort: 7, paramTemplate: [
    { key: 'cpu', label: 'CPU', type: 'text' }, { key: 'memory', label: '内存', type: 'number', unit: 'GB' },
    { key: 'disk', label: '硬盘', type: 'text' }, { key: 'gpu', label: '显卡', type: 'text' },
    { key: 'rack', label: '规格', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 17, code: '010108', name: '路由器', parentId: 1, status: 'enabled', sort: 8, paramTemplate: [
    { key: 'wifiStandard', label: 'WiFi标准', type: 'select', options: ['WiFi 5', 'WiFi 6', 'WiFi 6E', 'WiFi 7'] },
    { key: 'ports', label: '端口数', type: 'number' }, { key: 'speed', label: '速率', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 41, code: '010109', name: '网络交换机', parentId: 1, status: 'enabled', sort: 9, paramTemplate: [
    { key: 'ports', label: '端口数', type: 'number' }, { key: 'speed', label: '速率', type: 'select', options: ['千兆', '万兆', '2.5G'] },
    { key: 'managed', label: '管理类型', type: 'select', options: ['网管型', '非网管型', '智能网管'] },
    { key: 'poe', label: 'PoE', type: 'select', options: ['支持', '不支持'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 42, code: '010110', name: '无线AP', parentId: 1, status: 'enabled', sort: 10, paramTemplate: [
    { key: 'wifiStandard', label: 'WiFi标准', type: 'select', options: ['WiFi 5', 'WiFi 6', 'WiFi 6E', 'WiFi 7'] },
    { key: 'coverage', label: '覆盖面积', type: 'text' }, { key: 'maxClients', label: '最大接入数', type: 'number' },
    { key: 'poe', label: 'PoE', type: 'select', options: ['支持', '不支持'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 43, code: '010111', name: 'UPS电源', parentId: 1, status: 'enabled', sort: 11, paramTemplate: [
    { key: 'capacity', label: '容量', type: 'number', unit: 'VA' }, { key: 'runtime', label: '续航时间', type: 'text' },
    { key: 'type', label: '类型', type: 'select', options: ['在线式', '后备式', '互动式'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0102 子分类 =====
  { id: 18, code: '010201', name: '打印机', parentId: 2, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'type', label: '打印类型', type: 'select', options: ['激光', '喷墨', '针式', '热敏'] },
    { key: 'speed', label: '打印速度', type: 'number', unit: '页/分' },
    { key: 'color', label: '色彩', type: 'select', options: ['黑白', '彩色'] },
    { key: 'connectivity', label: '连接方式', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 19, code: '010202', name: '投影仪', parentId: 2, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'brightness', label: '亮度', type: 'number', unit: '流明' },
    { key: 'resolution', label: '分辨率', type: 'text' },
    { key: 'projectionSize', label: '投影尺寸', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 20, code: '010203', name: 'LED显示屏', parentId: 2, status: 'enabled', sort: 3, paramTemplate: [
    { key: 'pixelPitch', label: '点间距', type: 'text' }, { key: 'size', label: '尺寸', type: 'text' },
    { key: 'brightness', label: '亮度', type: 'number', unit: 'cd/m²' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 21, code: '010204', name: '标签机', parentId: 2, status: 'enabled', sort: 4, paramTemplate: [
    { key: 'printWidth', label: '打印宽度', type: 'text' }, { key: 'connectivity', label: '连接方式', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 22, code: '010205', name: '会计器具', parentId: 2, status: 'enabled', sort: 5, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['点钞机', '验钞机', '装订机', '碎纸机'] },
    { key: 'speed', label: '速度', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 23, code: '010206', name: '其他办公设备', parentId: 2, status: 'enabled', sort: 6, paramTemplate: [], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 44, code: '010207', name: '扫描仪', parentId: 2, status: 'enabled', sort: 7, paramTemplate: [
    { key: 'speed', label: '扫描速度', type: 'number', unit: '页/分' },
    { key: 'resolution', label: '分辨率', type: 'text' },
    { key: 'adf', label: '自动进纸', type: 'select', options: ['支持', '不支持'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 45, code: '010208', name: '碎纸机', parentId: 2, status: 'enabled', sort: 8, paramTemplate: [
    { key: 'securityLevel', label: '保密等级', type: 'select', options: ['P-3', 'P-4', 'P-5', 'P-6', 'P-7'] },
    { key: 'capacity', label: '容量', type: 'number', unit: 'L' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 46, code: '010209', name: '复印机', parentId: 2, status: 'enabled', sort: 9, paramTemplate: [
    { key: 'speed', label: '复印速度', type: 'number', unit: '页/分' },
    { key: 'color', label: '色彩', type: 'select', options: ['黑白', '彩色'] },
    { key: 'format', label: '最大幅面', type: 'select', options: ['A4', 'A3', 'A2'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0103 子分类 =====
  { id: 24, code: '010301', name: '桌子', parentId: 3, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'size', label: '尺寸', type: 'text' }, { key: 'material', label: '材质', type: 'text' },
    { key: 'color', label: '颜色', type: 'text' },
    { key: 'adjustable', label: '升降', type: 'select', options: ['是', '否'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 25, code: '010302', name: '椅子', parentId: 3, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'size', label: '尺寸', type: 'text' }, { key: 'material', label: '材质', type: 'text' },
    { key: 'color', label: '颜色', type: 'text' },
    { key: 'ergonomic', label: '人体工学', type: 'select', options: ['是', '否'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 26, code: '010303', name: '沙发', parentId: 3, status: 'enabled', sort: 3, paramTemplate: [
    { key: 'size', label: '尺寸', type: 'text' }, { key: 'material', label: '材质', type: 'text' },
    { key: 'color', label: '颜色', type: 'text' }, { key: 'seats', label: '座位数', type: 'number' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 27, code: '010304', name: '文件柜', parentId: 3, status: 'enabled', sort: 4, paramTemplate: [
    { key: 'drawers', label: '抽屉数', type: 'number' }, { key: 'material', label: '材质', type: 'text' },
    { key: 'lock', label: '锁具', type: 'select', options: ['钥匙锁', '密码锁', '指纹锁'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 28, code: '010305', name: '保险柜', parentId: 3, status: 'enabled', sort: 5, paramTemplate: [
    { key: 'size', label: '尺寸', type: 'text' }, { key: 'securityLevel', label: '安全等级', type: 'text' },
    { key: 'lockType', label: '锁具类型', type: 'select', options: ['密码', '指纹', '钥匙', '电子'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 29, code: '010306', name: '其他柜', parentId: 3, status: 'enabled', sort: 6, paramTemplate: [
    { key: 'type', label: '类型', type: 'text' }, { key: 'material', label: '材质', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0104 子分类 =====
  { id: 30, code: '010401', name: '空调', parentId: 4, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'power', label: '功率', type: 'number', unit: 'W' }, { key: 'hp', label: '匹数', type: 'text' },
    { key: 'type', label: '类型', type: 'select', options: ['分体壁挂', '分体柜式', '中央空调', '吸顶式'] },
    { key: 'energyLevel', label: '能效等级', type: 'select', options: ['一级', '二级', '三级'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 31, code: '010402', name: '冰箱冰柜', parentId: 4, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'capacity', label: '容量', type: 'number', unit: 'L' }, { key: 'type', label: '类型', type: 'select', options: ['单门', '双门', '对开门', '冰柜'] },
    { key: 'energyLevel', label: '能效等级', type: 'select', options: ['一级', '二级', '三级'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 32, code: '010403', name: '饮水机', parentId: 4, status: 'enabled', sort: 3, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['温热型', '冷热型', '管线机', '净饮机'] },
    { key: 'capacity', label: '容量', type: 'number', unit: 'L' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 33, code: '010404', name: '热水器', parentId: 4, status: 'enabled', sort: 4, paramTemplate: [
    { key: 'capacity', label: '容量', type: 'number', unit: 'L' },
    { key: 'type', label: '类型', type: 'select', options: ['电热水器', '燃气热水器', '空气能'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 34, code: '010405', name: '烹调电器', parentId: 4, status: 'enabled', sort: 5, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['微波炉', '烤箱', '电磁炉', '电饭煲', '咖啡机'] },
    { key: 'power', label: '功率', type: 'number', unit: 'W' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 35, code: '010406', name: '灯具', parentId: 4, status: 'enabled', sort: 6, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['吸顶灯', '台灯', '筒灯', '灯管', 'LED面板灯'] },
    { key: 'power', label: '功率', type: 'number', unit: 'W' },
    { key: 'colorTemp', label: '色温', type: 'text' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0105 子分类 =====
  { id: 47, code: '010501', name: '电视', parentId: 5, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'screen', label: '尺寸', type: 'number', unit: '英寸' }, { key: 'resolution', label: '分辨率', type: 'text' },
    { key: 'type', label: '类型', type: 'select', options: ['LED', 'OLED', 'QLED'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 48, code: '010502', name: '音响设备', parentId: 5, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['音箱', '功放', '麦克风', '会议音响'] },
    { key: 'power', label: '功率', type: 'number', unit: 'W' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0109 子分类 =====
  { id: 49, code: '010901', name: '清洁设备', parentId: 9, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'type', label: '类型', type: 'select', options: ['吸尘器', '洗地机', '扫地机器人', '高压清洗机'] },
    { key: 'power', label: '功率', type: 'number', unit: 'W' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  // ===== 0110 子分类 =====
  { id: 50, code: '011001', name: '视频会议系统', parentId: 40, status: 'enabled', sort: 1, paramTemplate: [
    { key: 'cameraResolution', label: '摄像头分辨率', type: 'text' },
    { key: 'micRange', label: '麦克风拾音', type: 'number', unit: '米' },
    { key: 'displaySize', label: '显示尺寸', type: 'number', unit: '英寸' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 51, code: '011002', name: '监控摄像头', parentId: 40, status: 'enabled', sort: 2, paramTemplate: [
    { key: 'resolution', label: '分辨率', type: 'text' },
    { key: 'nightVision', label: '夜视', type: 'select', options: ['支持', '不支持'] },
    { key: 'storage', label: '存储方式', type: 'select', options: ['SD卡', 'NVR', '云存储'] },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
  { id: 52, code: '011003', name: '门禁系统', parentId: 40, status: 'enabled', sort: 3, paramTemplate: [
    { key: 'authMethod', label: '认证方式', type: 'text' },
    { key: 'userCapacity', label: '用户容量', type: 'number' },
  ], remark: '', updatedBy: '冯松', updatedAt: '2026-09-01 10:00:00' },
]


/* ==================== Mock 數據：品牌庫 ==================== */

let mockBrands: AssetBrand[] = [
  // 010101 笔记本电脑
  { id: 1, categoryCode: '010101', brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 2, categoryCode: '010101', brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 3, categoryCode: '010101', brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 4, categoryCode: '010101', brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 5, categoryCode: '010101', brandZh: '华硕', brandEn: 'ASUS', brandLogo: 'https://logo.clearbit.com/asus.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010102 台式机
  { id: 6, categoryCode: '010102', brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 7, categoryCode: '010102', brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 8, categoryCode: '010102', brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010103 一体机
  { id: 9, categoryCode: '010103', brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 10, categoryCode: '010103', brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010104 手机
  { id: 11, categoryCode: '010104', brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 12, categoryCode: '010104', brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 13, categoryCode: '010104', brandZh: '三星', brandEn: 'Samsung', brandLogo: 'https://logo.clearbit.com/samsung.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010105 平板电脑
  { id: 14, categoryCode: '010105', brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 15, categoryCode: '010105', brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010106 显示器
  { id: 16, categoryCode: '010106', brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 17, categoryCode: '010106', brandZh: '乐金', brandEn: 'LG', brandLogo: 'https://logo.clearbit.com/lg.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 18, categoryCode: '010106', brandZh: '三星', brandEn: 'Samsung', brandLogo: 'https://logo.clearbit.com/samsung.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010107 主机（服务器）
  { id: 19, categoryCode: '010107', brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 20, categoryCode: '010107', brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  // 010108 路由器
  { id: 21, categoryCode: '010108', brandZh: '普联', brandEn: 'TP-Link', brandLogo: 'https://logo.clearbit.com/tplink.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 22, categoryCode: '010108', brandZh: '思科', brandEn: 'Cisco', brandLogo: 'https://logo.clearbit.com/cisco.com', createdAt: '2024-01-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
]

let mockModels: AssetModel[] = [
  { id: 1, categoryCode: '010101', brandId: 1, brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', modelNo: 'X1 Carbon Gen11', name: 'ThinkPad X1 Carbon 笔记本', unit: '台', createdAt: '2024-01-05 10:00:00', updatedBy: '冯松', updatedAt: '2025-08-10 14:30:00' },
  { id: 2, categoryCode: '010101', brandId: 2, brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', modelNo: 'MacBook Pro 16 M3', name: 'MacBook Pro 16 笔记本', unit: '台', createdAt: '2024-01-05 10:05:00', updatedBy: '冯松', updatedAt: '2025-07-22 09:15:00' },
  { id: 3, categoryCode: '010101', brandId: 3, brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', modelNo: 'Latitude 7440', name: 'Dell Latitude 7440 笔记本', unit: '台', createdAt: '2024-01-06 09:00:00', updatedBy: '冯松', updatedAt: '2025-06-18 16:45:00' },
  { id: 4, categoryCode: '010101', brandId: 4, brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', modelNo: 'MateBook X Pro 2024', name: '华为 MateBook X Pro 笔记本', unit: '台', createdAt: '2024-02-01 11:00:00', updatedBy: '冯松', updatedAt: '2025-04-12 10:00:00' },
  { id: 5, categoryCode: '010102', brandId: 6, brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', modelNo: 'ThinkCentre M90q', name: '联想 ThinkCentre M90q 台式机', unit: '台', createdAt: '2024-01-10 09:00:00', updatedBy: '冯松', updatedAt: '2025-05-30 11:20:00' },
  { id: 6, categoryCode: '010102', brandId: 7, brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', modelNo: 'OptiPlex 7010', name: 'Dell OptiPlex 7010 台式机', unit: '台', createdAt: '2024-01-10 09:10:00', updatedBy: '冯松', updatedAt: '2025-03-25 15:30:00' },
  { id: 7, categoryCode: '010102', brandId: 8, brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', modelNo: 'Mac Mini M2', name: 'Apple Mac Mini M2 台式机', unit: '台', createdAt: '2024-02-15 14:00:00', updatedBy: '冯松', updatedAt: '2025-02-14 08:50:00' },
  { id: 8, categoryCode: '010103', brandId: 9, brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', modelNo: 'iMac 24 M3', name: 'Apple iMac 24 一体机', unit: '台', createdAt: '2024-03-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-01-08 13:10:00' },
  { id: 9, categoryCode: '010103', brandId: 10, brandZh: '联想', brandEn: 'Lenovo', brandLogo: 'https://logo.clearbit.com/lenovo.com', modelNo: 'ThinkCentre neo 30a', name: '联想 ThinkCentre neo 30a 一体机', unit: '台', createdAt: '2024-03-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-01-08 13:10:00' },
  { id: 10, categoryCode: '010104', brandId: 11, brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', modelNo: 'iPhone 15 Pro', name: 'Apple iPhone 15 Pro', unit: '部', createdAt: '2024-03-15 09:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 10:00:00' },
  { id: 11, categoryCode: '010104', brandId: 12, brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', modelNo: 'Mate 60 Pro', name: '华为 Mate 60 Pro', unit: '部', createdAt: '2024-03-15 09:10:00', updatedBy: '冯松', updatedAt: '2025-06-01 10:00:00' },
  { id: 12, categoryCode: '010104', brandId: 13, brandZh: '三星', brandEn: 'Samsung', brandLogo: 'https://logo.clearbit.com/samsung.com', modelNo: 'Galaxy S24 Ultra', name: '三星 Galaxy S24 Ultra', unit: '部', createdAt: '2024-04-01 11:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 10:00:00' },
  { id: 13, categoryCode: '010105', brandId: 14, brandZh: '苹果', brandEn: 'Apple', brandLogo: 'https://logo.clearbit.com/apple.com', modelNo: 'iPad Pro M4 12.9', name: 'Apple iPad Pro 12.9 平板', unit: '部', createdAt: '2024-04-10 14:00:00', updatedBy: '冯松', updatedAt: '2025-06-15 09:00:00' },
  { id: 14, categoryCode: '010105', brandId: 15, brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', modelNo: 'MatePad Pro 13.2', name: '华为 MatePad Pro 13.2 平板', unit: '部', createdAt: '2024-04-10 14:10:00', updatedBy: '冯松', updatedAt: '2025-06-15 09:00:00' },
  { id: 15, categoryCode: '010106', brandId: 16, brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', modelNo: 'U2723QE', name: 'Dell 27 吋 4K 显示器', unit: '台', createdAt: '2024-01-06 09:00:00', updatedBy: '冯松', updatedAt: '2025-06-18 16:45:00' },
  { id: 16, categoryCode: '010106', brandId: 17, brandZh: '乐金', brandEn: 'LG', brandLogo: 'https://logo.clearbit.com/lg.com', modelNo: '27UP850', name: 'LG 27 吋 4K 显示器', unit: '台', createdAt: '2024-01-06 09:10:00', updatedBy: '冯松', updatedAt: '2025-06-18 16:45:00' },
  { id: 17, categoryCode: '010106', brandId: 18, brandZh: '三星', brandEn: 'Samsung', brandLogo: 'https://logo.clearbit.com/samsung.com', modelNo: 'S27A800UJC', name: '三星 27 吋 4K 显示器', unit: '台', createdAt: '2024-02-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-18 16:45:00' },
  { id: 18, categoryCode: '010107', brandId: 19, brandZh: '戴尔', brandEn: 'Dell', brandLogo: 'https://logo.clearbit.com/dell.com', modelNo: 'PowerEdge R750', name: 'Dell PowerEdge R750 服务器', unit: '台', createdAt: '2024-01-06 09:10:00', updatedBy: '冯松', updatedAt: '2025-05-30 11:20:00' },
  { id: 19, categoryCode: '010107', brandId: 20, brandZh: '华为', brandEn: 'Huawei', brandLogo: 'https://logo.clearbit.com/huawei.com', modelNo: 'FusionServer 2288H V6', name: '华为 FusionServer 2288H V6', unit: '台', createdAt: '2024-02-01 09:00:00', updatedBy: '冯松', updatedAt: '2025-05-30 11:20:00' },
  { id: 20, categoryCode: '010108', brandId: 21, brandZh: '普联', brandEn: 'TP-Link', brandLogo: 'https://logo.clearbit.com/tplink.com', modelNo: 'TL-XDR5480', name: 'TP-Link WiFi 6 路由器', unit: '台', createdAt: '2024-03-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 21, categoryCode: '010108', brandId: 22, brandZh: '思科', brandEn: 'Cisco', brandLogo: 'https://logo.clearbit.com/cisco.com', modelNo: 'RV340', name: 'Cisco RV340 企业路由器', unit: '台', createdAt: '2024-03-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 22, categoryCode: '010109', brandId: 1, brandZh: '普联', brandEn: 'TP-Link', brandLogo: 'https://logo.clearbit.com/tplink.com', modelNo: 'TL-SG1024D', name: 'TP-Link 24口千兆交换机', unit: '台', createdAt: '2024-03-10 09:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 23, categoryCode: '010109', brandId: 1, brandZh: '新华三', brandEn: 'H3C', brandLogo: 'https://logo.clearbit.com/h3c.com', modelNo: 'S5130S-28P-EI', name: 'H3C 28口网管交换机', unit: '台', createdAt: '2024-03-10 09:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 24, categoryCode: '010110', brandId: 1, brandZh: '普联', brandEn: 'TP-Link', brandLogo: 'https://logo.clearbit.com/tplink.com', modelNo: 'EAP670', name: 'TP-Link WiFi 6 无线AP', unit: '台', createdAt: '2024-03-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 25, categoryCode: '010110', brandId: 1, brandZh: '新华三', brandEn: 'H3C', brandLogo: 'https://logo.clearbit.com/h3c.com', modelNo: 'WA6628X', name: 'H3C WiFi 6 无线AP', unit: '台', createdAt: '2024-03-15 10:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 26, categoryCode: '010111', brandId: 1, brandZh: '施耐德APC', brandEn: 'APC', brandLogo: 'https://logo.clearbit.com/apc.com', modelNo: 'BR1500G-CN', name: 'APC 1500VA UPS', unit: '台', createdAt: '2024-04-01 09:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 27, categoryCode: '010111', brandId: 1, brandZh: '伊顿', brandEn: 'Eaton', brandLogo: 'https://logo.clearbit.com/eaton.com', modelNo: '5PX 3000', name: 'Eaton 3000VA UPS', unit: '台', createdAt: '2024-04-01 09:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 28, categoryCode: '010201', brandId: 1, brandZh: '惠普', brandEn: 'HP', brandLogo: 'https://logo.clearbit.com/hp.com', modelNo: 'LaserJet Pro M404dn', name: 'HP 黑白激光打印机', unit: '台', createdAt: '2024-01-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-05-01 14:00:00' },
  { id: 29, categoryCode: '010201', brandId: 1, brandZh: '佳能', brandEn: 'Canon', brandLogo: 'https://logo.clearbit.com/canon.com', modelNo: 'imageCLASS MF645Cx', name: 'Canon 彩色激光一体机', unit: '台', createdAt: '2024-01-15 10:10:00', updatedBy: '冯松', updatedAt: '2025-05-01 14:00:00' },
  { id: 30, categoryCode: '010201', brandId: 1, brandZh: '爱普生', brandEn: 'Epson', brandLogo: 'https://logo.clearbit.com/epson.com', modelNo: 'L6270', name: 'Epson 墨仓式彩色打印机', unit: '台', createdAt: '2024-02-01 11:00:00', updatedBy: '冯松', updatedAt: '2025-05-01 14:00:00' },
  { id: 31, categoryCode: '010202', brandId: 1, brandZh: '爱普生', brandEn: 'Epson', brandLogo: 'https://logo.clearbit.com/epson.com', modelNo: 'CB-X06', name: 'Epson 商务投影仪', unit: '台', createdAt: '2024-02-10 09:00:00', updatedBy: '冯松', updatedAt: '2025-05-15 10:00:00' },
  { id: 32, categoryCode: '010202', brandId: 1, brandZh: '明基', brandEn: 'BenQ', brandLogo: 'https://logo.clearbit.com/benq.com', modelNo: 'MH733', name: 'BenQ 1080P 投影仪', unit: '台', createdAt: '2024-02-10 09:10:00', updatedBy: '冯松', updatedAt: '2025-05-15 10:00:00' },
  { id: 33, categoryCode: '010203', brandId: 1, brandZh: '利亚德', brandEn: 'Leyard', brandLogo: 'https://logo.clearbit.com/leyard.com', modelNo: 'TVH1.25', name: '利亚德 P1.25 小间距LED屏', unit: '套', createdAt: '2024-03-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 34, categoryCode: '010204', brandId: 1, brandZh: '兄弟', brandEn: 'Brother', brandLogo: 'https://logo.clearbit.com/brother.com', modelNo: 'PT-E550W', name: 'Brother 工业标签机', unit: '台', createdAt: '2024-03-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 35, categoryCode: '010205', brandId: 1, brandZh: '康艺', brandEn: 'Kangyi', brandLogo: 'https://logo.clearbit.com/kangyi.com', modelNo: 'JBYD-2870', name: '康艺点钞机', unit: '台', createdAt: '2024-03-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 36, categoryCode: '010207', brandId: 1, brandZh: '富士通', brandEn: 'Fujitsu', brandLogo: 'https://logo.clearbit.com/fujitsu.com', modelNo: 'fi-8170', name: '富士通高速扫描仪', unit: '台', createdAt: '2024-04-01 09:00:00', updatedBy: '冯松', updatedAt: '2025-06-15 10:00:00' },
  { id: 37, categoryCode: '010207', brandId: 1, brandZh: '佳能', brandEn: 'Canon', brandLogo: 'https://logo.clearbit.com/canon.com', modelNo: 'DR-C225W', name: 'Canon 文档扫描仪', unit: '台', createdAt: '2024-04-01 09:10:00', updatedBy: '冯松', updatedAt: '2025-06-15 10:00:00' },
  { id: 38, categoryCode: '010208', brandId: 1, brandZh: '齐心', brandEn: 'Comix', brandLogo: 'https://logo.clearbit.com/comix.com', modelNo: 'GD9915', name: 'Comix 高保密碎纸机', unit: '台', createdAt: '2024-04-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-15 10:00:00' },
  { id: 39, categoryCode: '010209', brandId: 1, brandZh: '理光', brandEn: 'Ricoh', brandLogo: 'https://logo.clearbit.com/ricoh.com', modelNo: 'IM C3000', name: 'Ricoh 彩色数码复印机', unit: '台', createdAt: '2024-04-15 09:00:00', updatedBy: '冯松', updatedAt: '2025-06-15 10:00:00' },
  { id: 40, categoryCode: '010301', brandId: 1, brandZh: '震旦', brandEn: 'Aurora', brandLogo: 'https://logo.clearbit.com/aurora.com', modelNo: 'AURORA-D140', name: '震旦 1.4米职员桌', unit: '张', createdAt: '2024-02-01 11:10:00', updatedBy: '冯松', updatedAt: '2025-02-14 08:50:00' },
  { id: 41, categoryCode: '010301', brandId: 1, brandZh: '世楷', brandEn: 'Steelcase', brandLogo: 'https://logo.clearbit.com/steelcase.com', modelNo: 'Ology', name: 'Steelcase 电动升降桌', unit: '张', createdAt: '2024-02-01 11:20:00', updatedBy: '冯松', updatedAt: '2025-02-14 08:50:00' },
  { id: 42, categoryCode: '010301', brandId: 1, brandZh: '震旦', brandEn: 'Aurora', brandLogo: 'https://logo.clearbit.com/aurora.com', modelNo: 'AURORA-M160', name: '震旦 1.6米主管桌', unit: '张', createdAt: '2024-02-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-02-14 08:50:00' },
  { id: 43, categoryCode: '010302', brandId: 1, brandZh: '赫曼米勒', brandEn: 'Herman Miller', brandLogo: 'https://logo.clearbit.com/hermanmiller.com', modelNo: 'Aeron Remastered', name: 'Herman Miller Aeron 人体工学椅', unit: '把', createdAt: '2024-02-01 11:00:00', updatedBy: '冯松', updatedAt: '2025-04-12 10:00:00' },
  { id: 44, categoryCode: '010302', brandId: 1, brandZh: '震旦', brandEn: 'Aurora', brandLogo: 'https://logo.clearbit.com/aurora.com', modelNo: 'AURORA-C21', name: '震旦标准职员椅', unit: '把', createdAt: '2024-02-01 11:05:00', updatedBy: '冯松', updatedAt: '2025-03-25 15:30:00' },
  { id: 45, categoryCode: '010302', brandId: 1, brandZh: '世楷', brandEn: 'Steelcase', brandLogo: 'https://logo.clearbit.com/steelcase.com', modelNo: 'Gesture', name: 'Steelcase Gesture 人体工学椅', unit: '把', createdAt: '2024-03-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-03-25 15:30:00' },
  { id: 46, categoryCode: '010303', brandId: 1, brandZh: '顾家', brandEn: 'Kuka', brandLogo: 'https://logo.clearbit.com/kuka.com', modelNo: 'KUKA-8088', name: '顾家三人位接待沙发', unit: '套', createdAt: '2024-03-01 11:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 47, categoryCode: '010303', brandId: 1, brandZh: '芝华仕', brandEn: 'Cheers', brandLogo: 'https://logo.clearbit.com/cheers.com', modelNo: 'Cheers-5038', name: '芝华仕单人功能沙发', unit: '套', createdAt: '2024-03-01 11:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 48, categoryCode: '010304', brandId: 1, brandZh: '震旦', brandEn: 'Aurora', brandLogo: 'https://logo.clearbit.com/aurora.com', modelNo: 'AURORA-F3', name: '震旦三层文件柜', unit: '个', createdAt: '2024-03-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 49, categoryCode: '010304', brandId: 1, brandZh: '高德利', brandEn: 'Godrej', brandLogo: 'https://logo.clearbit.com/godrej.com', modelNo: 'GSE-4D', name: 'Godrej 四层文件柜', unit: '个', createdAt: '2024-03-10 10:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 50, categoryCode: '010305', brandId: 1, brandZh: '艾谱', brandEn: 'Aipu', brandLogo: 'https://logo.clearbit.com/aipu.com', modelNo: 'FDX-A/D-45', name: '艾谱电子保险柜', unit: '个', createdAt: '2024-04-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-05-01 09:00:00' },
  { id: 51, categoryCode: '010305', brandId: 1, brandZh: '迪堡', brandEn: 'Diebold', brandLogo: 'https://logo.clearbit.com/diebold.com', modelNo: 'Nica 300', name: '迪堡 Nica 300 保险柜', unit: '个', createdAt: '2024-04-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-05-01 09:00:00' },
  { id: 52, categoryCode: '010401', brandId: 1, brandZh: '三菱', brandEn: 'Mitsubishi', brandLogo: 'https://logo.clearbit.com/mitsubishi.com', modelNo: 'MSZ-GV18VA', name: '三菱变频分体空调 2匹', unit: '台', createdAt: '2024-03-01 15:00:00', updatedBy: '冯松', updatedAt: '2025-01-08 13:10:00' },
  { id: 53, categoryCode: '010401', brandId: 1, brandZh: '大金', brandEn: 'Daikin', brandLogo: 'https://logo.clearbit.com/daikin.com', modelNo: 'FTXB35', name: '大金变频空调 1.5匹', unit: '台', createdAt: '2024-03-01 15:10:00', updatedBy: '冯松', updatedAt: '2025-01-08 13:10:00' },
  { id: 54, categoryCode: '010401', brandId: 1, brandZh: '格力', brandEn: 'Gree', brandLogo: 'https://logo.clearbit.com/gree.com', modelNo: 'KFR-72LW', name: '格力柜式空调 3匹', unit: '台', createdAt: '2024-03-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-01-08 13:10:00' },
  { id: 55, categoryCode: '010402', brandId: 1, brandZh: '海尔', brandEn: 'Haier', brandLogo: 'https://logo.clearbit.com/haier.com', modelNo: 'BCD-520WDPD', name: '海尔对开门冰箱 520L', unit: '台', createdAt: '2024-04-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-02-01 09:00:00' },
  { id: 56, categoryCode: '010402', brandId: 1, brandZh: '松下', brandEn: 'Panasonic', brandLogo: 'https://logo.clearbit.com/panasonic.com', modelNo: 'NR-EE35TP1', name: '松下三门冰箱 350L', unit: '台', createdAt: '2024-04-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-02-01 09:00:00' },
  { id: 57, categoryCode: '010403', brandId: 1, brandZh: '安吉尔', brandEn: 'Angel', brandLogo: 'https://logo.clearbit.com/angel.com', modelNo: 'Y1361', name: '安吉尔冷热型饮水机', unit: '台', createdAt: '2024-04-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-02-01 09:00:00' },
  { id: 58, categoryCode: '010403', brandId: 1, brandZh: '美的', brandEn: 'Midea', brandLogo: 'https://logo.clearbit.com/midea.com', modelNo: 'YR1626S-X', name: '美的温热型饮水机', unit: '台', createdAt: '2024-04-10 10:10:00', updatedBy: '冯松', updatedAt: '2025-02-01 09:00:00' },
  { id: 59, categoryCode: '010404', brandId: 1, brandZh: '海尔', brandEn: 'Haier', brandLogo: 'https://logo.clearbit.com/haier.com', modelNo: 'EC6002', name: '海尔电热水器 60L', unit: '台', createdAt: '2024-05-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-03-01 09:00:00' },
  { id: 60, categoryCode: '010405', brandId: 1, brandZh: '松下', brandEn: 'Panasonic', brandLogo: 'https://logo.clearbit.com/panasonic.com', modelNo: 'NN-GT35HM', name: '松下微波炉 23L', unit: '台', createdAt: '2024-05-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-03-01 09:00:00' },
  { id: 61, categoryCode: '010405', brandId: 1, brandZh: '德龙', brandEn: 'DeLonghi', brandLogo: 'https://logo.clearbit.com/delonghi.com', modelNo: 'ECAM23.260', name: '德龙全自动咖啡机', unit: '台', createdAt: '2024-05-01 10:20:00', updatedBy: '冯松', updatedAt: '2025-03-01 09:00:00' },
  { id: 62, categoryCode: '010406', brandId: 1, brandZh: '飞利浦', brandEn: 'Philips', brandLogo: 'https://logo.clearbit.com/philips.com', modelNo: 'BN065B', name: '飞利浦 LED面板灯 600x600', unit: '套', createdAt: '2024-05-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-03-01 09:00:00' },
  { id: 63, categoryCode: '010406', brandId: 1, brandZh: '飞利浦', brandEn: 'Philips', brandLogo: 'https://logo.clearbit.com/philips.com', modelNo: '69115', name: '飞利浦 LED筒灯', unit: '套', createdAt: '2024-05-10 10:10:00', updatedBy: '冯松', updatedAt: '2025-03-01 09:00:00' },
  { id: 64, categoryCode: '010501', brandId: 1, brandZh: '三星', brandEn: 'Samsung', brandLogo: 'https://logo.clearbit.com/samsung.com', modelNo: 'QB55R', name: '三星 55吋商用电视', unit: '台', createdAt: '2024-05-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 65, categoryCode: '010501', brandId: 1, brandZh: '海信', brandEn: 'Hisense', brandLogo: 'https://logo.clearbit.com/hisense.com', modelNo: '65E3F', name: '海信 65吋会议电视', unit: '台', createdAt: '2024-05-15 10:10:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 66, categoryCode: '010502', brandId: 1, brandZh: '杰宝', brandEn: 'JBL', brandLogo: 'https://logo.clearbit.com/jbl.com', modelNo: 'EON615', name: 'JBL 会议音响', unit: '套', createdAt: '2024-05-20 10:00:00', updatedBy: '冯松', updatedAt: '2025-04-01 09:00:00' },
  { id: 67, categoryCode: '010901', brandId: 1, brandZh: '戴森', brandEn: 'Dyson', brandLogo: 'https://logo.clearbit.com/dyson.com', modelNo: 'V15 Detect', name: '戴森无线吸尘器', unit: '台', createdAt: '2024-06-01 10:00:00', updatedBy: '冯松', updatedAt: '2025-05-01 09:00:00' },
  { id: 68, categoryCode: '010901', brandId: 1, brandZh: '艾罗伯特', brandEn: 'iRobot', brandLogo: 'https://logo.clearbit.com/irobot.com', modelNo: 'Roomba j7+', name: 'iRobot 扫地机器人', unit: '台', createdAt: '2024-06-01 10:10:00', updatedBy: '冯松', updatedAt: '2025-05-01 09:00:00' },
  { id: 69, categoryCode: '011001', brandId: 1, brandZh: '罗技', brandEn: 'Logitech', brandLogo: 'https://logo.clearbit.com/logitech.com', modelNo: 'Rally Bar', name: '罗技 Rally Bar 视频会议系统', unit: '套', createdAt: '2024-06-10 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 70, categoryCode: '011001', brandId: 1, brandZh: '宝利通', brandEn: 'Polycom', brandLogo: 'https://logo.clearbit.com/polycom.com', modelNo: 'Studio X50', name: 'Polycom Studio X50 视频会议', unit: '套', createdAt: '2024-06-10 10:10:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 71, categoryCode: '011002', brandId: 1, brandZh: '海康威视', brandEn: 'Hikvision', brandLogo: 'https://logo.clearbit.com/hikvision.com', modelNo: 'DS-2CD2T47G2', name: '海康威视 400万监控摄像头', unit: '台', createdAt: '2024-06-15 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 72, categoryCode: '011002', brandId: 1, brandZh: '大华', brandEn: 'Dahua', brandLogo: 'https://logo.clearbit.com/dahua.com', modelNo: 'IPC-HFW2431T', name: '大华 400万监控摄像头', unit: '台', createdAt: '2024-06-15 10:10:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 73, categoryCode: '011003', brandId: 1, brandZh: '中控', brandEn: 'ZKTeco', brandLogo: 'https://logo.clearbit.com/zkteco.com', modelNo: 'inBio460', name: '中控门禁控制器', unit: '套', createdAt: '2024-06-20 10:00:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
  { id: 74, categoryCode: '011003', brandId: 1, brandZh: '基', brandEn: 'Suprekey', brandLogo: 'https://logo.clearbit.com/suprekey.com', modelNo: 'SK-Face100', name: '基人脸识别门禁', unit: '套', createdAt: '2024-06-20 10:10:00', updatedBy: '冯松', updatedAt: '2025-06-01 09:00:00' },
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

/* ==================== Mock 數據：參數庫 ==================== */

let mockParamTypes: ParamType[] = [
  { id: 1, categoryCode: '010101', code: 'cpu', name: 'CPU/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '中央處理器型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 2, categoryCode: '010101', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 3, categoryCode: '010101', code: 'storage', name: '硬盤/存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '硬盤/存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 4, categoryCode: '010101', code: 'screen', name: '屏幕尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 4, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 5, categoryCode: '010101', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '屏幕分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 6, categoryCode: '010101', code: 'gpu', name: '顯卡', unit: '', valueType: 'select', status: 'enabled', sort: 6, description: '圖形處理器', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 7, categoryCode: '010101', code: 'os', name: '操作系統', unit: '', valueType: 'select', status: 'enabled', sort: 7, description: '預裝操作系統', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 8, categoryCode: '010101', code: 'battery', name: '電池容量', unit: 'Wh', valueType: 'select', status: 'enabled', sort: 8, description: '電池容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 9, categoryCode: '010101', code: 'weight', name: '重量', unit: 'kg', valueType: 'select', status: 'enabled', sort: 9, description: '產品重量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 10, categoryCode: '010101', code: 'interface', name: '接口', unit: '', valueType: 'select', status: 'enabled', sort: 10, description: '接口類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 11, categoryCode: '010101', code: 'connectivity', name: '連接方式', unit: '', valueType: 'select', status: 'enabled', sort: 11, description: '網絡/無線連接', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 12, categoryCode: '010101', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 12, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 13, categoryCode: '010102', code: 'cpu', name: 'CPU/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '中央處理器型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 14, categoryCode: '010102', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 15, categoryCode: '010102', code: 'storage', name: '硬盤/存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '硬盤/存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 16, categoryCode: '010102', code: 'gpu', name: '顯卡', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '圖形處理器', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 17, categoryCode: '010102', code: 'os', name: '操作系統', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '預裝操作系統', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 18, categoryCode: '010102', code: 'form_factor', name: '機箱類型', unit: '', valueType: 'select', status: 'enabled', sort: 6, description: '機箱形態', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 19, categoryCode: '010102', code: 'power', name: '電源功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 7, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 20, categoryCode: '010102', code: 'interface', name: '接口', unit: '', valueType: 'select', status: 'enabled', sort: 8, description: '接口類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 21, categoryCode: '010103', code: 'cpu', name: 'CPU/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '中央處理器型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 22, categoryCode: '010103', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 23, categoryCode: '010103', code: 'storage', name: '硬盤/存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '硬盤/存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 24, categoryCode: '010103', code: 'screen', name: '屏幕尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 4, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 25, categoryCode: '010103', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '屏幕分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 26, categoryCode: '010103', code: 'os', name: '操作系統', unit: '', valueType: 'select', status: 'enabled', sort: 6, description: '預裝操作系統', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 27, categoryCode: '010104', code: 'chip', name: '芯片/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: 'SoC 型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 28, categoryCode: '010104', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 29, categoryCode: '010104', code: 'storage', name: '存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 30, categoryCode: '010104', code: 'screen', name: '屏幕尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 4, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 31, categoryCode: '010104', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '屏幕分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 32, categoryCode: '010104', code: 'camera', name: '攝像頭', unit: '萬像素', valueType: 'select', status: 'enabled', sort: 6, description: '主攝像頭像素', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 33, categoryCode: '010104', code: 'battery', name: '電池容量', unit: 'mAh', valueType: 'select', status: 'enabled', sort: 7, description: '電池容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 34, categoryCode: '010104', code: 'os', name: '操作系統', unit: '', valueType: 'select', status: 'enabled', sort: 8, description: '操作系統', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 35, categoryCode: '010104', code: 'connectivity', name: '連接方式', unit: '', valueType: 'select', status: 'enabled', sort: 9, description: '網絡/無線連接', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 36, categoryCode: '010104', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 10, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 37, categoryCode: '010104', code: 'weight', name: '重量', unit: 'g', valueType: 'select', status: 'enabled', sort: 11, description: '產品重量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 38, categoryCode: '010105', code: 'chip', name: '芯片/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: 'SoC 型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 39, categoryCode: '010105', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 40, categoryCode: '010105', code: 'storage', name: '存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 41, categoryCode: '010105', code: 'screen', name: '屏幕尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 4, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 42, categoryCode: '010105', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '屏幕分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 43, categoryCode: '010105', code: 'battery', name: '電池容量', unit: 'mAh', valueType: 'select', status: 'enabled', sort: 6, description: '電池容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 44, categoryCode: '010105', code: 'os', name: '操作系統', unit: '', valueType: 'select', status: 'enabled', sort: 7, description: '操作系統', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 45, categoryCode: '010105', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 8, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 46, categoryCode: '010105', code: 'weight', name: '重量', unit: 'g', valueType: 'select', status: 'enabled', sort: 9, description: '產品重量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 47, categoryCode: '010106', code: 'screen', name: '屏幕尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 1, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 48, categoryCode: '010106', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '顯示分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 49, categoryCode: '010106', code: 'panel', name: '面板類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '面板技術', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 50, categoryCode: '010106', code: 'refresh_rate', name: '刷新率', unit: 'Hz', valueType: 'select', status: 'enabled', sort: 4, description: '刷新率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 51, categoryCode: '010106', code: 'interface', name: '接口', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '接口類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 52, categoryCode: '010106', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 6, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 53, categoryCode: '010107', code: 'cpu', name: 'CPU/處理器', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '中央處理器型號', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 54, categoryCode: '010107', code: 'memory', name: '內存', unit: 'GB', valueType: 'select', status: 'enabled', sort: 2, description: '運行內存容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 55, categoryCode: '010107', code: 'storage', name: '硬盤/存儲', unit: 'GB', valueType: 'select', status: 'enabled', sort: 3, description: '硬盤/存儲容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 56, categoryCode: '010107', code: 'gpu', name: '顯卡', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '圖形處理器', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 57, categoryCode: '010107', code: 'form_factor', name: '規格', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '機架規格', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 58, categoryCode: '010107', code: 'power', name: '電源功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 6, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 59, categoryCode: '010108', code: 'wifi_standard', name: 'WiFi標準', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: 'WiFi協議標準', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 60, categoryCode: '010108', code: 'ports', name: '端口數', unit: '個', valueType: 'select', status: 'enabled', sort: 2, description: 'LAN/WAN端口數量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 61, categoryCode: '010108', code: 'speed', name: '速率', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '網絡速率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 62, categoryCode: '010108', code: 'coverage', name: '覆蓋面積', unit: '㎡', valueType: 'select', status: 'enabled', sort: 4, description: '無線覆蓋面積', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 63, categoryCode: '010109', code: 'ports', name: '端口數', unit: '個', valueType: 'select', status: 'enabled', sort: 1, description: '端口數量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 64, categoryCode: '010109', code: 'speed', name: '速率', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '端口速率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 65, categoryCode: '010109', code: 'managed', name: '管理類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '管理方式', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 66, categoryCode: '010109', code: 'poe', name: 'PoE', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: 'PoE供電支持', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 67, categoryCode: '010110', code: 'wifi_standard', name: 'WiFi標準', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: 'WiFi協議標準', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 68, categoryCode: '010110', code: 'coverage', name: '覆蓋面積', unit: '㎡', valueType: 'select', status: 'enabled', sort: 2, description: '無線覆蓋面積', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 69, categoryCode: '010110', code: 'max_clients', name: '最大接入數', unit: '個', valueType: 'select', status: 'enabled', sort: 3, description: '最大同時接入設備數', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 70, categoryCode: '010110', code: 'poe', name: 'PoE', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: 'PoE供電支持', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 71, categoryCode: '010111', code: 'capacity', name: '容量', unit: 'VA', valueType: 'select', status: 'enabled', sort: 1, description: 'UPS容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 72, categoryCode: '010111', code: 'runtime', name: '續航時間', unit: '分鐘', valueType: 'select', status: 'enabled', sort: 2, description: '滿載續航時間', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 73, categoryCode: '010111', code: 'ups_type', name: '類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: 'UPS類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 74, categoryCode: '010201', code: 'print_type', name: '打印類型', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '打印技術類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 75, categoryCode: '010201', code: 'print_speed', name: '打印速度', unit: '頁/分', valueType: 'select', status: 'enabled', sort: 2, description: '每分鐘打印頁數', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 76, categoryCode: '010201', code: 'color_mode', name: '色彩', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '黑白/彩色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 77, categoryCode: '010201', code: 'connectivity', name: '連接方式', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '連接方式', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 78, categoryCode: '010201', code: 'format', name: '最大幅面', unit: '', valueType: 'select', status: 'enabled', sort: 5, description: '最大打印幅面', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 79, categoryCode: '010202', code: 'brightness', name: '亮度', unit: '流明', valueType: 'select', status: 'enabled', sort: 1, description: '投影亮度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 80, categoryCode: '010202', code: 'resolution', name: '分辨率', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '投影分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 81, categoryCode: '010202', code: 'projection_size', name: '投影尺寸', unit: '英寸', valueType: 'select', status: 'enabled', sort: 3, description: '投影畫面尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 82, categoryCode: '010202', code: 'projection_type', name: '投影方式', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '投影方式', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 83, categoryCode: '010203', code: 'pixel_pitch', name: '點間距', unit: 'mm', valueType: 'select', status: 'enabled', sort: 1, description: 'LED點間距', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 84, categoryCode: '010203', code: 'screen', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '顯示屏尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 85, categoryCode: '010203', code: 'brightness', name: '亮度', unit: 'cd/m²', valueType: 'select', status: 'enabled', sort: 3, description: '屏幕亮度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 86, categoryCode: '010204', code: 'print_width', name: '打印寬度', unit: 'mm', valueType: 'select', status: 'enabled', sort: 1, description: '最大打印寬度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 87, categoryCode: '010204', code: 'connectivity', name: '連接方式', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '連接方式', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 88, categoryCode: '010205', code: 'device_type', name: '設備類型', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '器具類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 89, categoryCode: '010205', code: 'speed', name: '速度', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '處理速度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 90, categoryCode: '010207', code: 'scan_speed', name: '掃描速度', unit: '頁/分', valueType: 'select', status: 'enabled', sort: 1, description: '掃描速度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 91, categoryCode: '010207', code: 'resolution', name: '分辨率', unit: 'dpi', valueType: 'select', status: 'enabled', sort: 2, description: '掃描分辨率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 92, categoryCode: '010207', code: 'adf', name: '自動進紙', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '自動進紙器支持', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 93, categoryCode: '010208', code: 'security_level', name: '保密等級', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '碎紙保密等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 94, categoryCode: '010208', code: 'capacity', name: '容量', unit: 'L', valueType: 'select', status: 'enabled', sort: 2, description: '碎紙箱容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 95, categoryCode: '010209', code: 'copy_speed', name: '複印速度', unit: '頁/分', valueType: 'select', status: 'enabled', sort: 1, description: '複印速度', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 96, categoryCode: '010209', code: 'color_mode', name: '色彩', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '黑白/彩色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 97, categoryCode: '010209', code: 'format', name: '最大幅面', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '最大複印幅面', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 98, categoryCode: '010301', code: 'furniture_size', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '桌椅尺寸規格', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 99, categoryCode: '010301', code: 'material', name: '材質', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '主要材質', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 100, categoryCode: '010301', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 101, categoryCode: '010301', code: 'adjustable', name: '升降功能', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '是否支持升降', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 102, categoryCode: '010302', code: 'furniture_size', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '桌椅尺寸規格', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 103, categoryCode: '010302', code: 'material', name: '材質', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '主要材質', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 104, categoryCode: '010302', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 105, categoryCode: '010302', code: 'ergonomic', name: '人體工學', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '是否人體工學設計', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 106, categoryCode: '010303', code: 'furniture_size', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '沙發尺寸規格', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 107, categoryCode: '010303', code: 'material', name: '材質', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '主要材質', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 108, categoryCode: '010303', code: 'color', name: '顏色', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '外觀顏色', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 109, categoryCode: '010303', code: 'seats', name: '座位數', unit: '人', valueType: 'select', status: 'enabled', sort: 4, description: '座位數量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 110, categoryCode: '010304', code: 'drawers', name: '抽屜數', unit: '個', valueType: 'select', status: 'enabled', sort: 1, description: '抽屜數量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 111, categoryCode: '010304', code: 'material', name: '材質', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '主要材質', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 112, categoryCode: '010304', code: 'lock_type', name: '鎖具類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '鎖具類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 113, categoryCode: '010305', code: 'safe_size', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '保險櫃尺寸', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 114, categoryCode: '010305', code: 'security_level', name: '安全等級', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '安全等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 115, categoryCode: '010305', code: 'lock_type', name: '鎖具類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '鎖具類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 116, categoryCode: '010306', code: 'furniture_size', name: '尺寸', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '書架尺寸規格', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 117, categoryCode: '010306', code: 'material', name: '材質', unit: '', valueType: 'select', status: 'enabled', sort: 2, description: '主要材質', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 118, categoryCode: '010306', code: 'layers', name: '層數', unit: '層', valueType: 'select', status: 'enabled', sort: 3, description: '層板數量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 119, categoryCode: '010401', code: 'capacity', name: '容量', unit: 'L', valueType: 'select', status: 'enabled', sort: 1, description: '內膽容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 120, categoryCode: '010401', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 2, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 121, categoryCode: '010401', code: 'energy_level', name: '能效等級', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '能效等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 122, categoryCode: '010402', code: 'capacity', name: '容量', unit: 'L', valueType: 'select', status: 'enabled', sort: 1, description: '總容積', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 123, categoryCode: '010402', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 2, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 124, categoryCode: '010402', code: 'energy_level', name: '能效等級', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '能效等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 125, categoryCode: '010402', code: 'fridge_type', name: '類型', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '冰箱類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 126, categoryCode: '010403', code: 'capacity', name: '容量', unit: 'L', valueType: 'select', status: 'enabled', sort: 1, description: '水箱容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 127, categoryCode: '010403', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 2, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 128, categoryCode: '010403', code: 'water_type', name: '出水類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '出水類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 129, categoryCode: '010404', code: 'coverage', name: '適用面積', unit: '㎡', valueType: 'select', status: 'enabled', sort: 1, description: '適用面積', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 130, categoryCode: '010404', code: 'cadr', name: 'CADR值', unit: 'm³/h', valueType: 'select', status: 'enabled', sort: 2, description: '潔淨空氣輸出比率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 131, categoryCode: '010404', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 3, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 132, categoryCode: '010404', code: 'energy_level', name: '能效等級', unit: '', valueType: 'select', status: 'enabled', sort: 4, description: '能效等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 133, categoryCode: '010405', code: 'fan_type', name: '類型', unit: '', valueType: 'select', status: 'enabled', sort: 1, description: '風扇類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 134, categoryCode: '010405', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 2, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 135, categoryCode: '010405', code: 'energy_level', name: '能效等級', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '能效等級', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 136, categoryCode: '010406', code: 'power', name: '功率', unit: 'W', valueType: 'select', status: 'enabled', sort: 1, description: '額定功率', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 137, categoryCode: '010406', code: 'capacity', name: '塵盒容量', unit: 'L', valueType: 'select', status: 'enabled', sort: 2, description: '塵盒容量', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 138, categoryCode: '010406', code: 'vacuum_type', name: '類型', unit: '', valueType: 'select', status: 'enabled', sort: 3, description: '吸塵器類型', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
]

let mockParamValues: ParamValue[] = [
  // chip 芯片/處理器
  { id: 1, paramTypeCode: 'chip', value: 'Apple A17 Pro', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 2, paramTypeCode: 'chip', value: 'Apple A18 Pro', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 3, paramTypeCode: 'chip', value: 'Apple M2', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 4, paramTypeCode: 'chip', value: 'Apple M3', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 5, paramTypeCode: 'chip', value: 'Apple M3 Pro', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 6, paramTypeCode: 'chip', value: 'Apple M4', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 7, paramTypeCode: 'chip', value: 'Intel Core i5-13500', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 8, paramTypeCode: 'chip', value: 'Intel Core i7-1360P', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 9, paramTypeCode: 'chip', value: 'Intel Core i7-13700', sort: 9, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 10, paramTypeCode: 'chip', value: 'Intel Xeon Gold 6330', sort: 10, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 11, paramTypeCode: 'chip', value: 'Intel Xeon Gold 6348', sort: 11, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 12, paramTypeCode: 'chip', value: 'AMD Ryzen 7 7700X', sort: 12, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 13, paramTypeCode: 'chip', value: 'Kirin 9000S', sort: 13, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 14, paramTypeCode: 'chip', value: 'Snapdragon 8 Gen3', sort: 14, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // memory 內存
  { id: 20, paramTypeCode: 'memory', value: '4', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 21, paramTypeCode: 'memory', value: '8', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 22, paramTypeCode: 'memory', value: '12', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 23, paramTypeCode: 'memory', value: '16', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 24, paramTypeCode: 'memory', value: '32', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 25, paramTypeCode: 'memory', value: '64', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 26, paramTypeCode: 'memory', value: '128', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 27, paramTypeCode: 'memory', value: '256', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // storage 存儲
  { id: 30, paramTypeCode: 'storage', value: '128', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 31, paramTypeCode: 'storage', value: '256', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 32, paramTypeCode: 'storage', value: '512', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 33, paramTypeCode: 'storage', value: '1024', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 34, paramTypeCode: 'storage', value: '2048', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 35, paramTypeCode: 'storage', value: '4096', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // screen 屏幕尺寸
  { id: 40, paramTypeCode: 'screen', value: '5.4', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 41, paramTypeCode: 'screen', value: '6.1', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 42, paramTypeCode: 'screen', value: '6.7', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 43, paramTypeCode: 'screen', value: '6.8', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 44, paramTypeCode: 'screen', value: '13.3', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 45, paramTypeCode: 'screen', value: '14', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 46, paramTypeCode: 'screen', value: '14.2', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 47, paramTypeCode: 'screen', value: '16', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 48, paramTypeCode: 'screen', value: '23.8', sort: 9, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 49, paramTypeCode: 'screen', value: '24', sort: 10, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 50, paramTypeCode: 'screen', value: '27', sort: 11, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 51, paramTypeCode: 'screen', value: '32', sort: 12, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 52, paramTypeCode: 'screen', value: '55', sort: 13, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 53, paramTypeCode: 'screen', value: '65', sort: 14, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // resolution 分辨率
  { id: 60, paramTypeCode: 'resolution', value: '1920x1080 (FHD)', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 61, paramTypeCode: 'resolution', value: '2560x1440 (2K)', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 62, paramTypeCode: 'resolution', value: '3840x2160 (4K)', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 63, paramTypeCode: 'resolution', value: '5120x2880 (5K)', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // os 操作系統
  { id: 70, paramTypeCode: 'os', value: 'Windows 11', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 71, paramTypeCode: 'os', value: 'macOS', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 72, paramTypeCode: 'os', value: 'iOS', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 73, paramTypeCode: 'os', value: 'iPadOS', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 74, paramTypeCode: 'os', value: 'HarmonyOS', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 75, paramTypeCode: 'os', value: 'Android', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // gpu 顯卡
  { id: 80, paramTypeCode: 'gpu', value: 'Intel Iris Xe', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 81, paramTypeCode: 'gpu', value: 'Intel UHD 770', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 82, paramTypeCode: 'gpu', value: 'Apple M3 Pro GPU', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 83, paramTypeCode: 'gpu', value: 'Apple M4 GPU', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 84, paramTypeCode: 'gpu', value: 'NVIDIA A30', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 85, paramTypeCode: 'gpu', value: 'NVIDIA RTX 4090', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // connectivity 連接方式
  { id: 90, paramTypeCode: 'connectivity', value: 'WiFi 6', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 91, paramTypeCode: 'connectivity', value: 'WiFi 6E', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 92, paramTypeCode: 'connectivity', value: 'WiFi 7', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 93, paramTypeCode: 'connectivity', value: 'Bluetooth 5.3', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 94, paramTypeCode: 'connectivity', value: 'Bluetooth 5.4', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 95, paramTypeCode: 'connectivity', value: '5G', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 96, paramTypeCode: 'connectivity', value: '4G LTE', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 97, paramTypeCode: 'connectivity', value: '千兆網口', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 98, paramTypeCode: 'connectivity', value: 'USB-C', sort: 9, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // color 顏色
  { id: 100, paramTypeCode: 'color', value: '黑色', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 101, paramTypeCode: 'color', value: '白色', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 102, paramTypeCode: 'color', value: '銀色', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 103, paramTypeCode: 'color', value: '深空灰', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 104, paramTypeCode: 'color', value: '原木色', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 105, paramTypeCode: 'color', value: '胡桃木色', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // material 材質
  { id: 110, paramTypeCode: 'material', value: '鋁合金', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 111, paramTypeCode: 'material', value: '不鏽鋼', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 112, paramTypeCode: 'material', value: '板材', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 113, paramTypeCode: 'material', value: '真皮', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 114, paramTypeCode: 'material', value: '布藝', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 115, paramTypeCode: 'material', value: '網布', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 116, paramTypeCode: 'material', value: '塑料', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // power 功率
  { id: 120, paramTypeCode: 'power', value: '33', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 121, paramTypeCode: 'power', value: '65', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 122, paramTypeCode: 'power', value: '120', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 123, paramTypeCode: 'power', value: '230', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 124, paramTypeCode: 'power', value: '800', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 125, paramTypeCode: 'power', value: '1000', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 126, paramTypeCode: 'power', value: '1200', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 127, paramTypeCode: 'power', value: '1450', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 128, paramTypeCode: 'power', value: '1800', sort: 9, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 129, paramTypeCode: 'power', value: '2500', sort: 10, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // capacity 容量
  { id: 130, paramTypeCode: 'capacity', value: '12', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 131, paramTypeCode: 'capacity', value: '15', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 132, paramTypeCode: 'capacity', value: '23', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 133, paramTypeCode: 'capacity', value: '60', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 134, paramTypeCode: 'capacity', value: '350', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 135, paramTypeCode: 'capacity', value: '520', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 136, paramTypeCode: 'capacity', value: '1500', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 137, paramTypeCode: 'capacity', value: '3000', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // camera 攝像頭
  { id: 140, paramTypeCode: 'camera', value: '1200', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 141, paramTypeCode: 'camera', value: '4800', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 142, paramTypeCode: 'camera', value: '5000', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 143, paramTypeCode: 'camera', value: '10000', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 144, paramTypeCode: 'camera', value: '20000', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // battery 電池
  { id: 150, paramTypeCode: 'battery', value: '3000', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 151, paramTypeCode: 'battery', value: '4000', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 152, paramTypeCode: 'battery', value: '5000', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 153, paramTypeCode: 'battery', value: '6000', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // weight 重量
  { id: 160, paramTypeCode: 'weight', value: '500以下', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 161, paramTypeCode: 'weight', value: '500-1000', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 162, paramTypeCode: 'weight', value: '1000-2000', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 163, paramTypeCode: 'weight', value: '2000-5000', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 164, paramTypeCode: 'weight', value: '5000以上', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // interface 接口
  { id: 170, paramTypeCode: 'interface', value: 'USB-A', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 171, paramTypeCode: 'interface', value: 'USB-C', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 172, paramTypeCode: 'interface', value: 'HDMI', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 173, paramTypeCode: 'interface', value: 'DP', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 174, paramTypeCode: 'interface', value: 'Lightning', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 175, paramTypeCode: 'interface', value: '3.5mm耳機孔', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // print_type 打印類型
  { id: 180, paramTypeCode: 'print_type', value: '激光', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 181, paramTypeCode: 'print_type', value: '噴墨', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 182, paramTypeCode: 'print_type', value: '熱敏', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 183, paramTypeCode: 'print_type', value: '針式', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // print_speed 打印速度
  { id: 190, paramTypeCode: 'print_speed', value: '15', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 191, paramTypeCode: 'print_speed', value: '21', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 192, paramTypeCode: 'print_speed', value: '30', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 193, paramTypeCode: 'print_speed', value: '40', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // energy_level 能效等級
  { id: 200, paramTypeCode: 'energy_level', value: '一級', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 201, paramTypeCode: 'energy_level', value: '二級', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 202, paramTypeCode: 'energy_level', value: '三級', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  // form_factor 形態
  { id: 210, paramTypeCode: 'form_factor', value: '塔式', sort: 1, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 211, paramTypeCode: 'form_factor', value: '迷你', sort: 2, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 212, paramTypeCode: 'form_factor', value: '一體機', sort: 3, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 213, paramTypeCode: 'form_factor', value: '翻蓋', sort: 4, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 214, paramTypeCode: 'form_factor', value: '直板', sort: 5, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 215, paramTypeCode: 'form_factor', value: '折疊屏', sort: 6, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 216, paramTypeCode: 'form_factor', value: '2U機架', sort: 7, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 217, paramTypeCode: 'form_factor', value: '4U機架', sort: 8, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 218, paramTypeCode: 'form_factor', value: '分體壁掛', sort: 9, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
  { id: 219, paramTypeCode: 'form_factor', value: '分體櫃式', sort: 10, status: 'enabled', updatedBy: '馮松', updatedAt: '2025-09-01 10:00:00' },
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
    confirmedAmount: 58500, deliveryDate: shiftDay(D, -5),
    items: [
      { modelId: 1, modelName: 'ThinkPad X1 Carbon 筆記本', qty: 3, price: 15800, confirmedPrice: 15500, receivedQty: 3 },
      { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 3, price: 4200, confirmedPrice: 4000, receivedQty: 3 },
    ],
    supplierGroups: [
      {
        id: 'sg1', supplier: '聯想澳門授權經銷商', contact: '陳先生 6233-0000',
        orderDate: '2024-09-06', trackingNo: 'SF1234567890',
        items: [
          { modelId: 1, modelName: 'ThinkPad X1 Carbon 筆記本', qty: 3, price: 15800, confirmedPrice: 15500, receivedQty: 3 },
          { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 3, price: 4200, confirmedPrice: 4000, receivedQty: 3 },
        ],
      },
    ],
    status: 'received', execStatus: 'completed',
    trackingNo: 'SF1234567890', purchaser: '李四(M002)', orderDate: '2024-09-06',
    contact: '陳先生 6233-0000', remark: '含三年上門保固',
    createdAt: '2024-09-05 10:00:00', updatedBy: '李四(M002)', updatedAt: '2024-09-06 14:30:00',
  },
  {
    id: 2, poNo: 'PO-2024-002', reqId: 0, supplier: '待定供應商', amount: 17200,
    deliveryDate: shiftDay(D, 10),
    items: [{ modelId: 8, modelName: '變頻分體空調 2 匹', qty: 2, price: 8600, receivedQty: 0 }],
    supplierGroups: [
      {
        id: 'sg2', supplier: '待定供應商',
        items: [{ modelId: 8, modelName: '變頻分體空調 2 匹', qty: 2, price: 8600, receivedQty: 0 }],
      },
    ],
    status: 'pending', execStatus: 'pending',
    createdAt: '2024-09-20 16:30:00',
  },
  {
    id: 3, poNo: 'PO-2024-003', reqId: 2, supplier: 'Dell 澳門', amount: 42000,
    deliveryDate: shiftDay(D, 7),
    items: [
      { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 5, price: 4200, confirmedPrice: 4000, receivedQty: 0 },
      { modelId: 5, modelName: '羅技 MX Keys 鍵盤', qty: 5, price: 800, receivedQty: 0 },
    ],
    supplierGroups: [
      {
        id: 'sg3a', supplier: 'Dell 澳門', contact: '林小姐 6688-1234',
        trackingNo: 'SF9876543210',
        items: [
          { modelId: 3, modelName: 'Dell 27 吋 4K 顯示器', qty: 5, price: 4200, confirmedPrice: 4000, receivedQty: 0 },
        ],
      },
      {
        id: 'sg3b', supplier: '羅技授權經銷商',
        items: [
          { modelId: 5, modelName: '羅技 MX Keys 鍵盤', qty: 5, price: 800, receivedQty: 0 },
        ],
      },
    ],
    status: 'pending', execStatus: 'purchasing',
    trackingNo: 'SF9876543210', purchaser: '王五(M003)',
    contact: '林小姐 6688-1234',
    createdAt: '2024-09-22 09:00:00', updatedBy: '王五(M003)', updatedAt: '2024-09-23 11:20:00',
  },
  {
    id: 4, poNo: 'PO-2024-004', reqId: 3, supplier: 'Apple 企業採購', amount: 89800,
    confirmedAmount: 87500, deliveryDate: shiftDay(D, 3),
    items: [
      { modelId: 2, modelName: 'iPhone 15 Pro', qty: 5, price: 9800, confirmedPrice: 9500, receivedQty: 0 },
      { modelId: 4, modelName: 'MacBook Air M3', qty: 3, price: 12800, confirmedPrice: 12500, receivedQty: 0 },
    ],
    supplierGroups: [
      {
        id: 'sg4', supplier: 'Apple 企業採購', contact: '張先生 6288-8888',
        orderDate: '2024-09-25', trackingNo: 'SF5555666677',
        items: [
          { modelId: 2, modelName: 'iPhone 15 Pro', qty: 5, price: 9800, confirmedPrice: 9500, receivedQty: 0 },
          { modelId: 4, modelName: 'MacBook Air M3', qty: 3, price: 12800, confirmedPrice: 12500, receivedQty: 0 },
        ],
      },
    ],
    status: 'pending', execStatus: 'completed',
    trackingNo: 'SF5555666677', purchaser: '李四(M002)', orderDate: '2024-09-25',
    contact: '張先生 6288-8888',
    createdAt: '2024-09-24 14:00:00', updatedBy: '李四(M002)', updatedAt: '2024-09-25 16:45:00',
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
    assetType: '笔记本电脑', brand: '联想', claimant: '張三(M001)', department: '研发部', claimDate: '2024-01-20',
    claimReason: '新員工入職配發', operator: '李四(M002)', status: 'claimed', remark: '',
  },
  {
    id: 2, claimNo: 'LY-2024-002', assetId: 3, assetNo: 'ZC-2024-0003', assetName: '人體工學椅',
    assetType: '办公家具', brand: '西昊', claimant: '趙六(M004)', department: '人事部', claimDate: '2024-02-25',
    claimReason: '办公室改造', returnDate: '2024-06-10', returnReason: '项目结束不再使用', operator: '李四(M002)',
    status: 'returned',
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

export function toggleCategoryStatus(id: number): Promise<void> {
  const cat = mockCategories.find((c) => c.id === id)
  if (!cat) return Promise.reject(new Error('分類不存在'))
  cat.status = cat.status === 'enabled' ? 'disabled' : 'enabled'
  return delay(undefined as unknown as void)
}

/* ==================== API：品牌庫 ==================== */

export interface BrandQuery {
  categoryCode?: string
  brandZh?: string
  updatedBy?: string
  updatedAtStart?: string
  updatedAtEnd?: string
}

export function fetchBrandList(params?: BrandQuery): Promise<AssetBrand[]> {
  let list = [...mockBrands]
  if (params?.categoryCode) list = list.filter((b) => b.categoryCode === params.categoryCode)
  if (params?.brandZh) list = list.filter((b) => b.brandZh.includes(params.brandZh!) || (b.brandEn && b.brandEn.toLowerCase().includes(params.brandZh!.toLowerCase())))
  if (params?.updatedBy) list = list.filter((b) => b.updatedBy && b.updatedBy.includes(params.updatedBy!))
  if (params?.updatedAtStart) list = list.filter((b) => b.updatedAt && b.updatedAt >= params.updatedAtStart!)
  if (params?.updatedAtEnd) list = list.filter((b) => b.updatedAt && b.updatedAt <= params.updatedAtEnd!)
  return delay(list)
}

export function createBrand(data: Omit<AssetBrand, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const id = Math.max(0, ...mockBrands.map((b) => b.id)) + 1
  const now = new Date().toLocaleString('zh-CN')
  mockBrands.push({ ...data, id, createdAt: now, updatedAt: now })
  return delay(id)
}

export function updateBrand(id: number, data: Partial<AssetBrand>): Promise<void> {
  const idx = mockBrands.findIndex((b) => b.id === id)
  if (idx === -1) return Promise.reject(new Error('品牌不存在'))
  mockBrands[idx] = { ...mockBrands[idx], ...data, updatedAt: new Date().toLocaleString('zh-CN') }
  return delay(undefined as unknown as void)
}

export function deleteBrand(id: number): Promise<void> {
  mockBrands = mockBrands.filter((b) => b.id !== id)
  return delay(undefined as unknown as void)
}

/* ==================== API：产品庫 ==================== */

export function fetchModelList(params?: ModelQuery): Promise<PageResult<AssetModel>> {
  let list = [...mockModels]
  if (params?.categoryCode) {
    const code = params.categoryCode
    list = list.filter((m) => m.categoryCode === code || m.categoryCode.startsWith(`${code}-`))
  }
  if (params?.brandId) list = list.filter((m) => m.brandId === params.brandId)
  if (params?.brandZh) list = list.filter((m) => m.brandZh.includes(params.brandZh!) || (m.brandEn && m.brandEn.toLowerCase().includes(params.brandZh!.toLowerCase())))
  if (params?.name) list = list.filter((m) => matchKeyword(m, ['name'], params.name))
  if (params?.updatedBy) list = list.filter((m) => matchKeyword(m, ['updatedBy'], params.updatedBy))
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
    o.items.forEach((it) => {
      if (data.confirmedPrices && data.confirmedPrices[it.modelId] !== undefined) {
        it.confirmedPrice = data.confirmedPrices[it.modelId]
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
    remark: `採購訂單 ${order.poNo} 驗收入庫`,
    applicant: data.operator,
    scrapTime: null,
    modelId: model.id,
    locationId,
    holdType: 'owned' as const,
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

/* ==================== API：參數庫 ==================== */

export function fetchParamTypeList(params?: ParamTypeQuery & { categoryCode?: string }): Promise<PageResult<ParamType>> {
  let list = [...mockParamTypes]
  if (params?.categoryCode) list = list.filter((t) => t.categoryCode === params.categoryCode)
  if (params?.name) list = list.filter((t) => t.name.includes(params.name!))
  if (params?.code) list = list.filter((t) => t.code.includes(params.code!))
  if (params?.status) list = list.filter((t) => t.status === params.status)
  if (params?.updatedBy) list = list.filter((t) => t.updatedBy?.includes(params.updatedBy!))
  if (params?.updatedAtStart) list = list.filter((t) => t.updatedAt && t.updatedAt >= params.updatedAtStart!)
  if (params?.updatedAtEnd) list = list.filter((t) => t.updatedAt && t.updatedAt <= params.updatedAtEnd!)
  list.sort((a, b) => a.sort - b.sort)
  return delay(paginate(list, params?.page, params?.size ?? 9999))
}

export function fetchAllParamTypes(): Promise<ParamType[]> {
  return delay([...mockParamTypes].sort((a, b) => a.sort - b.sort))
}

export function fetchParamValuesByType(paramTypeCode: string): Promise<ParamValue[]> {
  const values = mockParamValues
    .filter((v) => v.paramTypeCode === paramTypeCode && v.status === 'enabled')
    .sort((a, b) => a.sort - b.sort)
  return delay(values)
}

export function fetchAllParamValues(): Promise<ParamValue[]> {
  return delay([...mockParamValues].sort((a, b) => a.sort - b.sort))
}

export function createParamType(data: Omit<ParamType, 'id'>): Promise<ParamType> {
  const maxId = mockParamTypes.reduce((m, t) => Math.max(m, t.id), 0)
  const item: ParamType = { ...data, id: maxId + 1 }
  mockParamTypes.push(item)
  return delay(item)
}

export function updateParamType(id: number, data: Partial<ParamType>): Promise<ParamType> {
  const idx = mockParamTypes.findIndex((t) => t.id === id)
  if (idx < 0) return Promise.reject(new Error('參數類型不存在'))
  Object.assign(mockParamTypes[idx], data)
  return delay(mockParamTypes[idx])
}

export function deleteParamType(id: number): Promise<void> {
  const idx = mockParamTypes.findIndex((t) => t.id === id)
  if (idx >= 0) mockParamTypes.splice(idx, 1)
  return delay(undefined)
}

export function createParamValue(data: Omit<ParamValue, 'id'>): Promise<ParamValue> {
  const maxId = mockParamValues.reduce((m, v) => Math.max(m, v.id), 0)
  const item: ParamValue = { ...data, id: maxId + 1 }
  mockParamValues.push(item)
  return delay(item)
}

export function updateParamValue(id: number, data: Partial<ParamValue>): Promise<ParamValue> {
  const idx = mockParamValues.findIndex((v) => v.id === id)
  if (idx < 0) return Promise.reject(new Error('參數值不存在'))
  Object.assign(mockParamValues[idx], data)
  return delay(mockParamValues[idx])
}

export function deleteParamValue(id: number): Promise<void> {
  const idx = mockParamValues.findIndex((v) => v.id === id)
  if (idx >= 0) mockParamValues.splice(idx, 1)
  return delay(undefined)
}
