/**
 * 物资管理 API
 *
 * 前端 mock 数据驱动，待后端接口就绪后切换为真实接口。
 * 物资管理菜单提供：资产台账 / 资产入库 / 资产领用 / 资产转移 / 资产归还 / 资产报废 / 资产维修 / 资产盘点 / 统计报表
 *
 * 支持双模式：
 *  - 物资部直操作（无需审批，直接落库）
 *  - 流程申请（走 OA 审批流，落库由审批通过触发）
 */
import request from './request'

/* ==================== 枚举类型 ==================== */

/** 资产状态 */
export type AssetStatus = 'idle' | 'in_use' | 'in_repair' | 'scrapped'

/** 自购/租用 */
export type AssetSource = 'self' | 'lease'

/** 操作类型（资产动态） */
export type AssetOpType =
  | 'create'        // 入库
  | 'inbound'       // 批量入库（采购验收）
  | 'claim'         // 领用
  | 'borrow'        // 借用
  | 'renew'         // 续借
  | 'transfer'      // 转移
  | 'return'        // 归还
  | 'handover'      // 交接
  | 'repair'        // 维修
  | 'repair_done'   // 维修完成
  | 'compensation'  // 损坏赔付
  | 'scrap'         // 报废
  | 'inventory'     // 盘点

/* ==================== 类型定义 ==================== */

/** 资产主信息 */
export interface AssetItem {
  id: number
  /** 资产编号（人工输入，唯一） */
  assetNo: string
  /** 资产名称 */
  assetName: string
  /** 资产类型 */
  assetType: string
  /** 品牌 */
  brand: string
  /** 单位 */
  unit: string
  /** 数量 */
  quantity: number
  /** 购买时价值（澳门元） */
  purchaseValue: number
  /** 购买日期 */
  purchaseDate: string | null
  /** 使用日期（首次投入使用） */
  usageDate: string | null
  /** 资产来源：自购/租用 */
  source: AssetSource
  /** 所属公司 */
  company: string
  /** 存放地点 */
  location: string
  /** 所在部门 */
  department: string
  /** 使用人 */
  userName: string
  /** 资产状态 */
  status: AssetStatus
  /** 资产图片（base64 dataUrl，可多张逗号分隔） */
  images: string | null
  /** 备注 */
  remark: string | null
  /** 申请人（最后操作人） */
  applicant: string
  /** 报废时间 */
  scrapTime: string | null
  /** 关联品牌型号 ID（EAM 型号库） */
  modelId?: number | null
  /** 关联存放位置 ID（EAM 位置树） */
  locationId?: number | null
  /** 持有方式：自有领用/借用（借用语义由 BorrowRecord 承载） */
  holdType?: 'owned' | 'borrowed'
  /** 型号参数实例（如 CPU/内存/硬盘） */
  params?: Record<string, string>
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/** 资产操作动态 */
export interface AssetLog {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  opType: AssetOpType
  /** 操作人 */
  operator: string
  /** 操作时间 */
  operateTime: string
  /** 操作描述/说明 */
  description: string
  /** 关联流程编号（走流程时有值） */
  flowNo?: string
  /** 变更前部门 */
  fromDepartment?: string
  /** 变更后部门 */
  toDepartment?: string
  /** 变更前使用人 */
  fromUser?: string
  /** 变更后使用人 */
  toUser?: string
  /** 变更前位置 */
  fromLocation?: string
  /** 变更后位置 */
  toLocation?: string
}

/** 资产盘点记录 */
export interface AssetInventoryRecord {
  id: number
  /** 盘点任务编号 */
  taskNo: string
  /** 盘点任务名称 */
  taskName: string
  /** 盘点日期 */
  inventoryDate: string
  /** 盘点人 */
  operator: string
  /** 应盘数量 */
  expectedCount: number
  /** 实盘数量 */
  actualCount: number
  /** 差异数（实盘-应盘） */
  diffCount: number
  /** 状态：completed/in_progress */
  status: 'in_progress' | 'completed'
  /** 备注 */
  remark: string
}

/** 资产维修记录 */
export interface AssetRepairRecord {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  /** 维修日期 */
  repairDate: string
  /** 故障描述 */
  faultDesc: string
  /** 维修内容 */
  repairContent: string
  /** 维修费用 */
  cost: number
  /** 维修方 */
  repairBy: string
  /** 完成日期 */
  finishDate: string | null
  /** 状态：repairing/done */
  status: 'repairing' | 'done'
  /** 申请人 */
  applicant: string
  /** 损坏原因分类（EAM 增强） */
  causeType?: 'human' | 'natural' | 'third_party' | 'quality'
}

/* ==================== 查询参数 ==================== */

export interface AssetListQuery {
  page?: number
  size?: number
  keyword?: string
  assetNo?: string
  assetName?: string
  assetType?: string
  brand?: string
  status?: AssetStatus | 'all'
  company?: string
  department?: string
  userName?: string
  source?: AssetSource
  /** 购买日期范围 [start, end] */
  purchaseDate?: [string, string]
  /** 报废日期范围 [start, end] */
  scrapDate?: [string, string]
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间范围 [start, end] */
  updatedAt?: [string, string]
}

export interface PageResult<T> {
  records: T[]
  total: number
}

/* ==================== 后端 API（占位，前端 mock 实现） ==================== */

/** 资产分页列表 */
export function fetchAssetList(params?: AssetListQuery): Promise<PageResult<AssetItem>> {
  // 待后端接口就绪后切换为真实接口：
  // return request.get('/asset/list', { params })
  return mockFetchAssetList(params)
}

/** 资产详情 */
export function fetchAssetDetail(id: number): Promise<AssetItem> {
  return mockFetchAssetDetail(id)
}

/** 新增资产 */
export function createAsset(data: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  return mockCreateAsset(data)
}

/** 更新资产 */
export function updateAsset(id: number, data: Partial<AssetItem>): Promise<void> {
  return mockUpdateAsset(id, data)
}

/** 删除资产（软删除） */
export function deleteAsset(id: number): Promise<void> {
  return mockDeleteAsset(id)
}

/** 批量入库（采购验收调用）：按传入条目生成资产编号并写入台账，返回生成的编号列表 */
export function bulkCreateAssets(items: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt' | 'assetNo'>[]): Promise<string[]> {
  return mockBulkCreateAssets(items)
}

/** 校验资产编号唯一性 */
export function checkAssetNoUnique(assetNo: string, excludeId?: number): Promise<boolean> {
  return mockCheckAssetNoUnique(assetNo, excludeId)
}

/** 资产操作动态查询参数（EAM 变更历史页共用） */
export interface AssetLogQuery {
  assetId?: number
  assetNo?: string
  /** 资产名称/使用人等模糊关键字 */
  keyword?: string
  opType?: AssetOpType | 'all'
  /** 操作时间范围 [start, end]（按日期比较） */
  dateRange?: [string, string]
  page?: number
  size?: number
}

/** 资产操作动态 */
export function fetchAssetLogs(params?: AssetLogQuery): Promise<PageResult<AssetLog>> {
  return mockFetchAssetLogs(params)
}

/** 写入一条资产操作流水（EAM 业务模块共用：借用/续借/交接/赔付等） */
export function logAssetOperation(data: Omit<AssetLog, 'id'>): Promise<void> {
  return mockLogAssetOperation(data)
}

/** 资产领用 */
export function claimAsset(data: { assetId: number; userName: string; department: string; usageDate: string; remark?: string }): Promise<void> {
  return mockClaimAsset(data)
}

/** 资产转移 */
export function transferAsset(data: { assetId: number; toUser: string; toDepartment: string; reason: string; applyBy: string }): Promise<void> {
  return mockTransferAsset(data)
}

/** 资产归还 */
export function returnAsset(data: { assetId: number; returnDate: string; condition: string; applyBy: string }): Promise<void> {
  return mockReturnAsset(data)
}

/** 资产报废 */
export function scrapAsset(data: { assetId: number; reason: string; scrapDate: string; applyBy: string }): Promise<void> {
  return mockScrapAsset(data)
}

/** 资产维修 */
export function repairAsset(data: Omit<AssetRepairRecord, 'id'>): Promise<number> {
  return mockRepairAsset(data)
}

/** 维修记录列表（按资产ID过滤） */
export function fetchRepairList(params?: { assetId?: number; status?: 'repairing' | 'done' }): Promise<AssetRepairRecord[]> {
  return mockFetchRepairList(params)
}

/** 维修完成 */
export function finishRepair(id: number, finishDate: string): Promise<void> {
  return mockFinishRepair(id, finishDate)
}

/** 资产盘点列表 */
export function fetchInventoryList(params?: { page?: number; size?: number }): Promise<PageResult<AssetInventoryRecord>> {
  return mockFetchInventoryList(params)
}

/** 发起盘点 */
export function createInventory(taskName: string, operator: string): Promise<string> {
  return mockCreateInventory(taskName, operator)
}

/** 提交盘点结果 */
export function submitInventoryResult(taskNo: string, actual: { assetId: number; status: 'normal' | 'lost' | 'damaged'; remark?: string }[]): Promise<void> {
  return mockSubmitInventoryResult(taskNo, actual)
}

/** 资产统计 */
export function fetchAssetStatistics(): Promise<AssetStatistics> {
  return mockFetchAssetStatistics()
}

/* ==================== 统计 ==================== */

export interface AssetStatistics {
  /** 资产总数 */
  totalCount: number
  /** 在用数 */
  inUseCount: number
  /** 闲置数 */
  idleCount: number
  /** 维修中数 */
  inRepairCount: number
  /** 已报废数 */
  scrappedCount: number
  /** 资产总价值 */
  totalValue: number
  /** 资产类型分布 */
  typeDistribution: { type: string; count: number }[]
  /** 部门分布 */
  departmentDistribution: { department: string; count: number }[]
  /** 来源分布 */
  sourceDistribution: { source: AssetSource; count: number }[]
  /** 月度入库趋势 */
  monthlyTrend: { month: string; count: number; value: number }[]
}

/* ==================== Mock 数据实现 ==================== */

let mockAssetList: AssetItem[] = [
  {
    id: 1, assetNo: 'ZC-2024-0001', assetName: 'ThinkPad X1 Carbon 笔记本',
    assetType: '电子设备', brand: 'Lenovo', unit: '台', quantity: 1,
    purchaseValue: 15800, purchaseDate: '2024-01-15', usageDate: '2024-01-20',
    source: 'self', company: '澳觅科技', location: '总部-研发部-A座3楼',
    department: '研发部', userName: '张三(M001)', status: 'in_use',
    images: null, remark: '研发专用', applicant: '李四(M002)',
    scrapTime: null, createdAt: '2024-01-15 10:00:00', updatedAt: '2024-01-20 14:30:00',
  },
  {
    id: 2, assetNo: 'ZC-2024-0002', assetName: 'iPhone 15 Pro',
    assetType: '电子设备', brand: 'Apple', unit: '台', quantity: 1,
    purchaseValue: 8999, purchaseDate: '2024-03-10', usageDate: '2024-03-15',
    source: 'self', company: '澳觅科技', location: '总部-市场部-B座2楼',
    department: '市场部', userName: '王五(M003)', status: 'in_use',
    images: null, remark: '市场部专用测试机', applicant: '王五(M003)',
    scrapTime: null, createdAt: '2024-03-10 09:30:00', updatedAt: '2024-03-15 11:00:00',
  },
  {
    id: 3, assetNo: 'ZC-2024-0003', assetName: '人体工学椅',
    assetType: '办公家具', brand: 'Herman Miller', unit: '把', quantity: 1,
    purchaseValue: 12000, purchaseDate: '2024-02-20', usageDate: '2024-02-25',
    source: 'self', company: '澳觅科技', location: '总部-人事部-A座2楼',
    department: '人事部', userName: '赵六(M004)', status: 'in_use',
    images: null, remark: null, applicant: '李四(M002)',
    scrapTime: null, createdAt: '2024-02-20 14:00:00', updatedAt: '2024-02-25 10:00:00',
  },
  {
    id: 4, assetNo: 'ZC-2023-0156', assetName: '戴尔服务器 R750',
    assetType: '电子设备', brand: 'Dell', unit: '台', quantity: 1,
    purchaseValue: 65000, purchaseDate: '2023-06-10', usageDate: '2023-06-15',
    source: 'self', company: '澳觅科技', location: '总部-机房',
    department: '技术部', userName: '机房管理员', status: 'in_use',
    images: null, remark: '生产环境核心服务器', applicant: '系统管理员',
    scrapTime: null, createdAt: '2023-06-10 11:00:00', updatedAt: '2023-06-15 16:00:00',
  },
  {
    id: 5, assetNo: 'ZC-2022-0089', assetName: '投影仪',
    assetType: '办公设备', brand: 'Epson', unit: '台', quantity: 1,
    purchaseValue: 5800, purchaseDate: '2022-09-15', usageDate: '2022-09-20',
    source: 'self', company: '澳觅科技', location: '总部-会议室B-301',
    department: '行政部', userName: '会议室公用', status: 'in_use',
    images: null, remark: '会议室公用', applicant: '行政部',
    scrapTime: null, createdAt: '2022-09-15 10:00:00', updatedAt: '2022-09-20 15:00:00',
  },
  {
    id: 6, assetNo: 'ZC-2021-0042', assetName: '台式机 iMac',
    assetType: '电子设备', brand: 'Apple', unit: '台', quantity: 1,
    purchaseValue: 18000, purchaseDate: '2021-04-10', usageDate: '2021-04-15',
    source: 'self', company: '澳觅科技', location: '总部-设计部-A座4楼',
    department: '设计部', userName: '钱七(M007)', status: 'idle',
    images: null, remark: '员工离职归还', applicant: '人事部',
    scrapTime: null, createdAt: '2021-04-10 10:00:00', updatedAt: '2024-08-10 14:00:00',
  },
  {
    id: 7, assetNo: 'ZC-2020-0021', assetName: '打印机 HP M404',
    assetType: '办公设备', brand: 'HP', unit: '台', quantity: 1,
    purchaseValue: 2800, purchaseDate: '2020-08-15', usageDate: '2020-08-20',
    source: 'self', company: '澳觅科技', location: '总部-财务部',
    department: '财务部', userName: '财务部公用', status: 'in_repair',
    images: null, remark: '送修中，2024-08送修', applicant: '财务部',
    scrapTime: null, createdAt: '2020-08-15 10:00:00', updatedAt: '2024-08-20 11:00:00',
  },
  {
    id: 8, assetNo: 'ZC-2019-0008', assetName: '旧服务器 DELL R720',
    assetType: '电子设备', brand: 'Dell', unit: '台', quantity: 1,
    purchaseValue: 28000, purchaseDate: '2019-03-10', usageDate: '2019-03-15',
    source: 'self', company: '澳觅科技', location: '总部-仓库',
    department: '技术部', userName: '报废待处理', status: 'scrapped',
    images: null, remark: '使用年限过长已报废', applicant: '技术部',
    scrapTime: '2024-05-15 10:00:00', createdAt: '2019-03-10 10:00:00', updatedAt: '2024-05-15 10:00:00',
  },
  {
    id: 9, assetNo: 'ZC-2024-0004', assetName: '会议桌',
    assetType: '办公家具', brand: '震旦', unit: '张', quantity: 1,
    purchaseValue: 3600, purchaseDate: '2024-04-10', usageDate: '2024-04-15',
    source: 'self', company: '澳觅科技', location: '总部-会议室A-201',
    department: '行政部', userName: '会议室公用', status: 'in_use',
    images: null, remark: null, applicant: '行政部',
    scrapTime: null, createdAt: '2024-04-10 10:00:00', updatedAt: '2024-04-15 10:00:00',
  },
  {
    id: 10, assetNo: 'ZC-2024-0005', assetName: 'MacBook Pro 16',
    assetType: '电子设备', brand: 'Apple', unit: '台', quantity: 1,
    purchaseValue: 25000, purchaseDate: '2024-05-20', usageDate: '2024-05-25',
    source: 'lease', company: '澳觅科技', location: '总部-产品部-B座3楼',
    department: '产品部', userName: '孙八(M008)', status: 'in_use',
    images: null, remark: '租赁设备', applicant: '产品部',
    scrapTime: null, createdAt: '2024-05-20 10:00:00', updatedAt: '2024-05-25 10:00:00',
  },
]

let mockAssetLogList: AssetLog[] = [
  {
    id: 1, assetId: 1, assetNo: 'ZC-2024-0001', assetName: 'ThinkPad X1 Carbon 笔记本',
    opType: 'create', operator: '李四(M002)', operateTime: '2024-01-15 10:00:00',
    description: '资产入库',
  },
  {
    id: 2, assetId: 1, assetNo: 'ZC-2024-0001', assetName: 'ThinkPad X1 Carbon 笔记本',
    opType: 'claim', operator: '李四(M002)', operateTime: '2024-01-20 14:30:00',
    description: '领用给研发部-张三', fromDepartment: '仓库', toDepartment: '研发部',
    fromUser: '无人', toUser: '张三(M001)',
  },
  {
    id: 3, assetId: 6, assetNo: 'ZC-2021-0042', assetName: '台式机 iMac',
    opType: 'return', operator: '人事部', operateTime: '2024-08-10 14:00:00',
    description: '员工离职归还，资产状态变为闲置',
    fromUser: '钱七(M007)', toUser: '无人',
  },
  {
    id: 4, assetId: 7, assetNo: 'ZC-2020-0021', assetName: '打印机 HP M404',
    opType: 'repair', operator: '财务部', operateTime: '2024-08-20 11:00:00',
    description: '送修：打印卡纸严重',
  },
  {
    id: 5, assetId: 8, assetNo: 'ZC-2019-0008', assetName: '旧服务器 DELL R720',
    opType: 'scrap', operator: '技术部', operateTime: '2024-05-15 10:00:00',
    description: '使用年限超过5年，申请报废',
  },
]

let mockRepairList: AssetRepairRecord[] = [
  {
    id: 1, assetId: 7, assetNo: 'ZC-2020-0021', assetName: '打印机 HP M404',
    repairDate: '2024-08-20', faultDesc: '打印卡纸严重，无法正常使用',
    repairContent: '更换搓纸轮+清洁打印头', cost: 380,
    repairBy: 'HP 授权维修点', finishDate: null,
    status: 'repairing', applicant: '财务部',
  },
  {
    id: 2, assetId: 4, assetNo: 'ZC-2023-0156', assetName: '戴尔服务器 R750',
    repairDate: '2024-06-15', faultDesc: '电源模块故障告警',
    repairContent: '更换冗余电源模块', cost: 2800,
    repairBy: 'Dell 售后', finishDate: '2024-06-18',
    status: 'done', applicant: '技术部',
  },
]

let mockInventoryList: AssetInventoryRecord[] = [
  {
    id: 1, taskNo: 'PD-2024-001', taskName: '2024 Q3 季度盘点',
    inventoryDate: '2024-09-30', operator: '李四(M002)',
    expectedCount: 156, actualCount: 154, diffCount: -2,
    status: 'completed', remark: '缺失 2 台待跟进',
  },
  {
    id: 2, taskNo: 'PD-2024-002', taskName: '2024 Q4 季度盘点',
    inventoryDate: '2024-12-30', operator: '李四(M002)',
    expectedCount: 168, actualCount: 0, diffCount: 0,
    status: 'in_progress', remark: '',
  },
]

/* ----- Mock API ----- */

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

async function mockFetchAssetList(params?: AssetListQuery): Promise<PageResult<AssetItem>> {
  let list = [...mockAssetList]
  if (params) {
    if (params.keyword) {
      const q = params.keyword.toLowerCase().trim()
      list = list.filter((a) =>
        a.assetNo.toLowerCase().includes(q) ||
        a.assetName.toLowerCase().includes(q) ||
        (a.userName || '').toLowerCase().includes(q),
      )
    }
    if (params.assetNo) list = list.filter((a) => a.assetNo.includes(params.assetNo!))
    if (params.assetName) list = list.filter((a) => a.assetName.includes(params.assetName!))
    if (params.assetType) list = list.filter((a) => a.assetType === params.assetType)
    if (params.brand) list = list.filter((a) => a.brand === params.brand)
    if (params.status && params.status !== 'all') list = list.filter((a) => a.status === params.status)
    if (params.company) list = list.filter((a) => a.company === params.company)
    if (params.department) list = list.filter((a) => a.department === params.department)
    if (params.userName) list = list.filter((a) => a.userName.includes(params.userName!))
    if (params.source) list = list.filter((a) => a.source === params.source)
    if (params.purchaseDate) {
      const [start, end] = params.purchaseDate
      list = list.filter((a) => a.purchaseDate && a.purchaseDate >= start && a.purchaseDate <= end)
    }
    if (params.scrapDate) {
      const [start, end] = params.scrapDate
      list = list.filter((a) => a.scrapTime && a.scrapTime.slice(0, 10) >= start && a.scrapTime.slice(0, 10) <= end)
    }
    if (params.updatedBy) {
      const q = params.updatedBy.toLowerCase()
      list = list.filter((a) => (a.applicant || '').toLowerCase().includes(q))
    }
    if (params.updatedAt) {
      const [start, end] = params.updatedAt
      list = list.filter((a) => a.updatedAt && a.updatedAt.slice(0, 10) >= start && a.updatedAt.slice(0, 10) <= end)
    }
  }
  const page = params?.page || 1
  const size = params?.size || 10
  const start = (page - 1) * size
  const end = start + size
  return delay({ records: list.slice(start, end), total: list.length })
}

async function mockFetchAssetDetail(id: number): Promise<AssetItem> {
  const item = mockAssetList.find((a) => a.id === id)
  if (!item) throw new Error('资产不存在')
  return delay(item)
}

async function mockCreateAsset(data: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  if (mockAssetList.some((a) => a.assetNo === data.assetNo)) {
    throw new Error('资产编号已存在')
  }
  const newId = Math.max(0, ...mockAssetList.map((a) => a.id)) + 1
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const newItem: AssetItem = { ...data, id: newId, createdAt: now, updatedAt: now }
  mockAssetList = [newItem, ...mockAssetList]
  mockAssetLogList = [
    {
      id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
      assetId: newId,
      assetNo: data.assetNo,
      assetName: data.assetName,
      opType: 'create',
      operator: data.applicant,
      operateTime: now,
      description: '资产入库',
    },
    ...mockAssetLogList,
  ]
  return delay(newId)
}

async function mockUpdateAsset(id: number, data: Partial<AssetItem>): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error('资产不存在')
  if (data.assetNo && data.assetNo !== mockAssetList[idx].assetNo) {
    if (mockAssetList.some((a) => a.assetNo === data.assetNo && a.id !== id)) {
      throw new Error('资产编号已存在')
    }
  }
  mockAssetList[idx] = {
    ...mockAssetList[idx],
    ...data,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  return delay(undefined as unknown as void)
}

async function mockDeleteAsset(id: number): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error('资产不存在')
  // 软删除：从 mock 列表中移除（后续接后端时改为 UPDATE deleted=1）
  mockAssetList = mockAssetList.filter((a) => a.id !== id)
  return delay(undefined as unknown as void)
}

async function mockBulkCreateAssets(items: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt' | 'assetNo'>[]): Promise<string[]> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const year = new Date().getFullYear()
  let seq = Math.max(0, ...mockAssetList.map((a) => {
    const m = a.assetNo.match(/ZC-\d{4}-(\d+)/)
    return m ? Number(m[1]) : 0
  }))
  const nos: string[] = []
  const newItems: AssetItem[] = items.map((it) => {
    seq += 1
    const no = `ZC-${year}-${String(seq).padStart(4, '0')}`
    nos.push(no)
    return { ...it, assetNo: no, id: Math.max(0, ...mockAssetList.map((a) => a.id)) + 1 + nos.length, createdAt: now, updatedAt: now }
  })
  // id 需唯一：重新按序分配
  let maxId = Math.max(0, ...mockAssetList.map((a) => a.id))
  newItems.forEach((it) => { maxId += 1; it.id = maxId })
  mockAssetList = [...newItems, ...mockAssetList]
  newItems.forEach((it) => {
    mockAssetLogList = [
      {
        id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
        assetId: it.id,
        assetNo: it.assetNo,
        assetName: it.assetName,
        opType: 'inbound',
        operator: it.applicant,
        operateTime: now,
        description: '采购验收批量入库',
      },
      ...mockAssetLogList,
    ]
  })
  return delay(nos)
}

async function mockCheckAssetNoUnique(assetNo: string, excludeId?: number): Promise<boolean> {
  if (!assetNo.trim()) return false
  return !mockAssetList.some((a) => a.assetNo === assetNo && a.id !== excludeId)
}

async function mockFetchAssetLogs(params?: AssetLogQuery): Promise<PageResult<AssetLog>> {
  let list = [...mockAssetLogList]
  if (params?.assetId != null) list = list.filter((l) => l.assetId === params.assetId)
  if (params?.assetNo) list = list.filter((l) => l.assetNo.includes(params.assetNo!))
  if (params?.keyword) {
    const q = params.keyword.toLowerCase().trim()
    list = list.filter((l) =>
      l.assetName.toLowerCase().includes(q) ||
      l.assetNo.toLowerCase().includes(q) ||
      (l.operator || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q),
    )
  }
  if (params?.opType && params.opType !== 'all') list = list.filter((l) => l.opType === params.opType)
  if (params?.dateRange) {
    const [start, end] = params.dateRange
    list = list.filter((l) => l.operateTime.slice(0, 10) >= start && l.operateTime.slice(0, 10) <= end)
  }
  // 按操作时间倒序
  list.sort((a, b) => (a.operateTime < b.operateTime ? 1 : -1))
  const page = params?.page || 1
  const size = params?.size || 10
  return delay({ records: list.slice((page - 1) * size, page * size), total: list.length })
}

async function mockLogAssetOperation(data: Omit<AssetLog, 'id'>): Promise<void> {
  mockAssetLogList = [
    { ...data, id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1 },
    ...mockAssetLogList,
  ]
  return delay(undefined as unknown as void)
}

async function mockClaimAsset(data: { assetId: number; userName: string; department: string; usageDate: string; remark?: string }): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === data.assetId)
  if (idx === -1) throw new Error('资产不存在')
  const fromUser = mockAssetList[idx].userName
  const fromDept = mockAssetList[idx].department
  mockAssetList[idx] = {
    ...mockAssetList[idx],
    userName: data.userName,
    department: data.department,
    usageDate: data.usageDate,
    status: 'in_use',
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  mockAssetLogList = [
    {
      id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
      assetId: data.assetId,
      assetNo: mockAssetList[idx].assetNo,
      assetName: mockAssetList[idx].assetName,
      opType: 'claim',
      operator: data.userName,
      operateTime: now,
      description: `领用：${data.remark || '绑定使用人'}`,
      fromDepartment: fromDept,
      toDepartment: data.department,
      fromUser,
      toUser: data.userName,
    },
    ...mockAssetLogList,
  ]
  return delay(undefined as unknown as void)
}

async function mockTransferAsset(data: { assetId: number; toUser: string; toDepartment: string; reason: string; applyBy: string }): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === data.assetId)
  if (idx === -1) throw new Error('资产不存在')
  const fromUser = mockAssetList[idx].userName
  const fromDept = mockAssetList[idx].department
  mockAssetList[idx] = {
    ...mockAssetList[idx],
    userName: data.toUser,
    department: data.toDepartment,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  mockAssetLogList = [
    {
      id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
      assetId: data.assetId,
      assetNo: mockAssetList[idx].assetNo,
      assetName: mockAssetList[idx].assetName,
      opType: 'transfer',
      operator: data.applyBy,
      operateTime: now,
      description: `转移：${data.reason}`,
      fromDepartment: fromDept,
      toDepartment: data.toDepartment,
      fromUser,
      toUser: data.toUser,
    },
    ...mockAssetLogList,
  ]
  return delay(undefined as unknown as void)
}

async function mockReturnAsset(data: { assetId: number; returnDate: string; condition: string; applyBy: string }): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === data.assetId)
  if (idx === -1) throw new Error('资产不存在')
  const fromUser = mockAssetList[idx].userName
  const fromDept = mockAssetList[idx].department
  mockAssetList[idx] = {
    ...mockAssetList[idx],
    userName: '',
    status: 'idle',
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  mockAssetLogList = [
    {
      id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
      assetId: data.assetId,
      assetNo: mockAssetList[idx].assetNo,
      assetName: mockAssetList[idx].assetName,
      opType: 'return',
      operator: data.applyBy,
      operateTime: now,
      description: `归还：${data.condition}`,
      fromDepartment: fromDept,
      fromUser,
      toUser: '无人',
    },
    ...mockAssetLogList,
  ]
  return delay(undefined as unknown as void)
}

async function mockScrapAsset(data: { assetId: number; reason: string; scrapDate: string; applyBy: string }): Promise<void> {
  const idx = mockAssetList.findIndex((a) => a.id === data.assetId)
  if (idx === -1) throw new Error('资产不存在')
  mockAssetList[idx] = {
    ...mockAssetList[idx],
    status: 'scrapped',
    scrapTime: data.scrapDate,
    remark: data.reason,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  mockAssetLogList = [
    {
      id: Math.max(0, ...mockAssetLogList.map((l) => l.id)) + 1,
      assetId: data.assetId,
      assetNo: mockAssetList[idx].assetNo,
      assetName: mockAssetList[idx].assetName,
      opType: 'scrap',
      operator: data.applyBy,
      operateTime: now,
      description: `报废：${data.reason}`,
    },
    ...mockAssetLogList,
  ]
  return delay(undefined as unknown as void)
}

async function mockFetchRepairList(params?: { assetId?: number; status?: 'repairing' | 'done' }): Promise<AssetRepairRecord[]> {
  let list = [...mockRepairList]
  if (params?.assetId != null) list = list.filter((r) => r.assetId === params.assetId)
  if (params?.status) list = list.filter((r) => r.status === params.status)
  return delay(list)
}

async function mockRepairAsset(data: Omit<AssetRepairRecord, 'id'>): Promise<number> {
  const newId = Math.max(0, ...mockRepairList.map((r) => r.id)) + 1
  const newRecord: AssetRepairRecord = { ...data, id: newId }
  mockRepairList = [newRecord, ...mockRepairList]
  const idx = mockAssetList.findIndex((a) => a.id === data.assetId)
  if (idx !== -1) {
    mockAssetList[idx] = { ...mockAssetList[idx], status: 'in_repair', updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }
  }
  return delay(newId)
}

async function mockFinishRepair(id: number, finishDate: string): Promise<void> {
  const idx = mockRepairList.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('维修记录不存在')
  mockRepairList[idx] = { ...mockRepairList[idx], finishDate, status: 'done' }
  const assetIdx = mockAssetList.findIndex((a) => a.id === mockRepairList[idx].assetId)
  if (assetIdx !== -1) {
    mockAssetList[assetIdx] = { ...mockAssetList[assetIdx], status: 'in_use', updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }
  }
  return delay(undefined as unknown as void)
}

async function mockFetchInventoryList(params?: { page?: number; size?: number }): Promise<PageResult<AssetInventoryRecord>> {
  const page = params?.page || 1
  const size = params?.size || 10
  return delay({ records: mockInventoryList.slice((page - 1) * size, page * size), total: mockInventoryList.length })
}

async function mockCreateInventory(taskName: string, operator: string): Promise<string> {
  const taskNo = `PD-${new Date().getFullYear()}-${String(mockInventoryList.length + 1).padStart(3, '0')}`
  const newRecord: AssetInventoryRecord = {
    id: Math.max(0, ...mockInventoryList.map((r) => r.id)) + 1,
    taskNo,
    taskName,
    inventoryDate: new Date().toISOString().slice(0, 10),
    operator,
    expectedCount: mockAssetList.length,
    actualCount: 0,
    diffCount: 0,
    status: 'in_progress',
    remark: '',
  }
  mockInventoryList = [newRecord, ...mockInventoryList]
  return delay(taskNo)
}

async function mockSubmitInventoryResult(taskNo: string, actual: { assetId: number; status: 'normal' | 'lost' | 'damaged' }[]): Promise<void> {
  const idx = mockInventoryList.findIndex((r) => r.taskNo === taskNo)
  if (idx === -1) throw new Error('盘点任务不存在')
  const lost = actual.filter((a) => a.status === 'lost').length
  mockInventoryList[idx] = {
    ...mockInventoryList[idx],
    actualCount: mockInventoryList[idx].expectedCount - lost,
    diffCount: -lost,
    status: 'completed',
  }
  return delay(undefined as unknown as void)
}

async function mockFetchAssetStatistics(): Promise<AssetStatistics> {
  const total = mockAssetList.length
  const inUse = mockAssetList.filter((a) => a.status === 'in_use').length
  const idle = mockAssetList.filter((a) => a.status === 'idle').length
  const inRepair = mockAssetList.filter((a) => a.status === 'in_repair').length
  const scrapped = mockAssetList.filter((a) => a.status === 'scrapped').length
  const totalValue = mockAssetList.reduce((sum, a) => sum + (a.purchaseValue || 0), 0)

  const typeMap = new Map<string, number>()
  mockAssetList.forEach((a) => typeMap.set(a.assetType, (typeMap.get(a.assetType) || 0) + 1))
  const typeDistribution = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }))

  const deptMap = new Map<string, number>()
  mockAssetList.forEach((a) => deptMap.set(a.department, (deptMap.get(a.department) || 0) + 1))
  const departmentDistribution = Array.from(deptMap.entries()).map(([department, count]) => ({ department, count }))

  const sourceDistribution: { source: AssetSource; count: number }[] = [
    { source: 'self', count: mockAssetList.filter((a) => a.source === 'self').length },
    { source: 'lease', count: mockAssetList.filter((a) => a.source === 'lease').length },
  ]

  const monthlyTrend = [
    { month: '2024-01', count: 1, value: 15800 },
    { month: '2024-02', count: 1, value: 12000 },
    { month: '2024-03', count: 1, value: 8999 },
    { month: '2024-04', count: 1, value: 3600 },
    { month: '2024-05', count: 1, value: 25000 },
    { month: '2024-06', count: 0, value: 0 },
    { month: '2024-07', count: 0, value: 0 },
    { month: '2024-08', count: 0, value: 0 },
    { month: '2024-09', count: 0, value: 0 },
  ]

  return delay({
    totalCount: total,
    inUseCount: inUse,
    idleCount: idle,
    inRepairCount: inRepair,
    scrappedCount: scrapped,
    totalValue,
    typeDistribution,
    departmentDistribution,
    sourceDistribution,
    monthlyTrend,
  })
}
