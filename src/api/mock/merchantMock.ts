/**
 * 商户集团/门店 Mock 降级服务
 * 当后端不可用时（本地未启动后端、静态部署等），使用 localStorage 模拟 CRUD 操作，
 * 保证本地开发可直接用虚拟数据快速验证；后端可用时自动走真实接口（见 merchantGroup.ts / store.ts）。
 */
import type { OptionItem } from '../types'
import type {
  MerchantGroupItem,
  MerchantGroupPageResult,
  MerchantGroupPayload,
  MerchantGroupQueryParams,
} from '../merchantGroup'
import type { StoreBdItem, StoreItem, StorePageResult, StorePayload, StoreQueryParams } from '../store'
import { mockFetchEmployees } from './hr-mock'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_GROUPS = `${MOCK_PREFIX}merchant_groups`
const KEY_STORES = `${MOCK_PREFIX}stores`
const KEY_INIT = `${MOCK_PREFIX}merchant_initialized`

// ============================================================
// 种子数据（ID 规则与后端一致：集团 JT000001 / 门店 MD00001）
// ============================================================

interface MockGroup {
  id: number
  groupCode: string
  groupName: string
  loginAccount?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

const SEED_GROUPS: MockGroup[] = [
  { id: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', loginAccount: 'macau_food', updatedBy: '系統管理員', createdAt: '2025-01-06 10:00:00', updatedAt: '2025-06-18 14:30:00' },
  { id: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', loginAccount: 'zh_market', updatedBy: '張三', createdAt: '2025-02-12 09:20:00', updatedAt: '2025-07-01 11:05:00' },
  { id: 3, groupCode: 'JT000003', groupName: '氹仔美食廣場集團', loginAccount: 'taipa_plaza', updatedBy: '李四', createdAt: '2025-03-03 15:40:00', updatedAt: '2025-07-10 09:12:00' },
  { id: 4, groupCode: 'JT000004', groupName: '大灣區茶飲集團', loginAccount: 'gba_tea', updatedBy: '系統管理員', createdAt: '2025-04-21 13:00:00', updatedAt: '2025-07-15 16:45:00' },
]

const SEED_STORES: StoreItem[] = [
  { id: 1, groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeCode: 'MD00001', storeName: '豪華軒·新馬路店', brand: 'flashBee', bizType: '1', bizChannel: '1', loginAccount: 'hh_store01', bdList: [{ id: 1, bdEmpId: 'MT0003', bdName: '關山月', department: '市場部', position: '商務拓展經理', jobLevel: 'M2' }], updatedBy: '系統管理員', createdAt: '2025-01-08 10:30:00', updatedAt: '2025-06-20 10:00:00' },
  { id: 2, groupId: 1, groupCode: 'JT000001', groupName: '澳門豪華餐飲集團', storeCode: 'MD00002', storeName: '豪華軒·氹仔店', brand: 'mFood', bizType: '1', bizChannel: '1,3', loginAccount: 'hh_store02', bdList: [{ id: 2, bdEmpId: 'MT0004', bdName: '古月', department: '市場部', position: '商務拓展專員', jobLevel: 'P3' }], updatedBy: '張三', createdAt: '2025-01-15 09:00:00', updatedAt: '2025-06-25 15:20:00' },
  { id: 3, groupId: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', storeCode: 'MD00003', storeName: '珠海百貨·拱北店', brand: 'flashBee', bizType: '2', bizChannel: '2', loginAccount: 'zh_store01', updatedBy: '李四', createdAt: '2025-02-18 14:00:00', updatedAt: '2025-07-02 09:30:00' },
  { id: 4, groupId: 2, groupCode: 'JT000002', groupName: '珠海百貨連鎖集團', storeCode: 'MD00004', storeName: '珠海百貨·香洲店', brand: 'flashBee', bizType: '2', bizChannel: '2,3', loginAccount: 'zh_store02', updatedBy: '系統管理員', createdAt: '2025-02-25 11:10:00', updatedAt: '2025-07-08 13:50:00' },
  { id: 5, groupId: 3, groupCode: 'JT000003', groupName: '氹仔美食廣場集團', storeCode: 'MD00005', storeName: '美食廣場·官也街店', brand: 'mFood', bizType: '1', bizChannel: '1', loginAccount: 'tp_store01', updatedBy: '王五', createdAt: '2025-03-10 10:00:00', updatedAt: '2025-07-12 10:40:00' },
  { id: 6, groupId: 4, groupCode: 'JT000004', groupName: '大灣區茶飲集團', storeCode: 'MD00006', storeName: '灣區茶飲·澳門旗艦店', brand: 'flashBee', bizType: '1', bizChannel: '1,2', loginAccount: 'tea_store01', updatedBy: '系統管理員', createdAt: '2025-04-28 16:00:00', updatedAt: '2025-07-16 09:00:00' },
]

function initMockData() {
  if (localStorage.getItem(KEY_INIT) === 'true') return
  localStorage.setItem(KEY_GROUPS, JSON.stringify(SEED_GROUPS))
  localStorage.setItem(KEY_STORES, JSON.stringify(SEED_STORES))
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

/** 当前时间字符串 YYYY-MM-DD HH:mm:ss */
function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 当前登录人姓名（用于最后更新人） */
function currentOperator(): string {
  try {
    const info = JSON.parse(localStorage.getItem('user_info') || '{}')
    return info.name || '系統管理員'
  } catch {
    return '系統管理員'
  }
}

/** 日期范围过滤（值形如 2025-06-18 14:30:00，比较日期前缀） */
function inDateRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!value) return false
  const day = value.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

// ============================================================
// 集团 Mock API
// ============================================================

/** 附加门店数量 */
function toGroupItem(g: MockGroup, stores: StoreItem[]): MerchantGroupItem {
  return { ...g, storeCount: stores.filter(s => s.groupId === g.id).length }
}

export function mockFetchMerchantGroups(params: MerchantGroupQueryParams): MerchantGroupPageResult {
  const stores = read<StoreItem>(KEY_STORES)
  let list = read<MockGroup>(KEY_GROUPS).map(g => toGroupItem(g, stores))

  const kw = params.keyword?.trim().toLowerCase()
  if (kw) {
    list = list.filter(g => g.groupCode.toLowerCase().includes(kw) || g.groupName.toLowerCase().includes(kw))
  }
  if (params.updatedBy) {
    list = list.filter(g => (g.updatedBy || '').includes(params.updatedBy!))
  }
  list = list.filter(g => inDateRange(g.updatedAt, params.updatedFrom, params.updatedTo))
  list = list.filter(g => inDateRange(g.createdAt, params.createdFrom, params.createdTo))

  const page = params.page || 1
  const size = params.size || 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

export function mockFetchAllMerchantGroups(): MerchantGroupItem[] {
  const stores = read<StoreItem>(KEY_STORES)
  return read<MockGroup>(KEY_GROUPS).map(g => toGroupItem(g, stores))
}

export function mockFetchMerchantGroupOptions(keyword: string): OptionItem[] {
  const kw = keyword.trim().toLowerCase()
  return read<MockGroup>(KEY_GROUPS)
    .filter(g => !kw || g.groupCode.toLowerCase().includes(kw) || g.groupName.toLowerCase().includes(kw))
    .map(g => ({ value: g.groupCode, label: `${g.groupCode} - ${g.groupName}` }))
}

export function mockFetchMerchantGroupUpdatedByOptions(keyword: string): OptionItem[] {
  const kw = keyword.trim()
  const names = [...new Set(read<MockGroup>(KEY_GROUPS).map(g => g.updatedBy).filter(Boolean))] as string[]
  return names.filter(n => !kw || n.includes(kw)).map(n => ({ value: n, label: n }))
}

export function mockCreateMerchantGroup(data: MerchantGroupPayload): MerchantGroupItem {
  const groups = read<MockGroup>(KEY_GROUPS)
  const nextId = Math.max(0, ...groups.map(g => g.id)) + 1
  const item: MockGroup = {
    id: nextId,
    groupCode: `JT${String(nextId).padStart(6, '0')}`,
    groupName: data.groupName,
    loginAccount: data.loginAccount,
    updatedBy: currentOperator(),
    createdAt: now(),
    updatedAt: now(),
  }
  write(KEY_GROUPS, [...groups, item])
  return { ...item, storeCount: 0 }
}

export function mockUpdateMerchantGroup(id: number, data: MerchantGroupPayload): MerchantGroupItem {
  const groups = read<MockGroup>(KEY_GROUPS)
  const idx = groups.findIndex(g => g.id === id)
  if (idx < 0) throw new Error('集團不存在')
  groups[idx] = { ...groups[idx], ...data, updatedBy: currentOperator(), updatedAt: now() }
  write(KEY_GROUPS, groups)
  return toGroupItem(groups[idx], read<StoreItem>(KEY_STORES))
}

export function mockDeleteMerchantGroup(id: number): void {
  const groups = read<MockGroup>(KEY_GROUPS)
  const stores = read<StoreItem>(KEY_STORES)
  const storeCount = stores.filter(s => s.groupId === id).length
  if (storeCount > 0) {
    throw new Error(`該集團下還有 ${storeCount} 家門店，請先刪除門店後再刪除集團`)
  }
  const idx = groups.findIndex(g => g.id === id)
  if (idx < 0) throw new Error('集團不存在')
  groups.splice(idx, 1)
  write(KEY_GROUPS, groups)
}

// ============================================================
// 门店 Mock API
// ============================================================

export function mockFetchStores(params: StoreQueryParams): StorePageResult {
  let list = read<StoreItem>(KEY_STORES)

  if (params.groupId) {
    list = list.filter(s => s.groupId === params.groupId)
  }
  const gkw = params.groupKeyword?.trim().toLowerCase()
  if (gkw) {
    list = list.filter(s => s.groupCode.toLowerCase().includes(gkw) || s.groupName.toLowerCase().includes(gkw))
  }
  const kw = params.keyword?.trim().toLowerCase()
  if (kw) {
    list = list.filter(s => s.storeCode.toLowerCase().includes(kw) || s.storeName.toLowerCase().includes(kw))
  }
  if (params.brand) {
    list = list.filter(s => (s.brand || '').split(',').includes(params.brand!))
  }
  if (params.bizChannel) {
    list = list.filter(s => (s.bizChannel || '').split(',').includes(params.bizChannel!))
  }
  if (params.updatedBy) {
    list = list.filter(s => (s.updatedBy || '').includes(params.updatedBy!))
  }
  list = list.filter(s => inDateRange(s.updatedAt, params.updatedFrom, params.updatedTo))
  list = list.filter(s => inDateRange(s.createdAt, params.createdFrom, params.createdTo))

  const page = params.page || 1
  const size = params.size || 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

export function mockFetchStoresByGroup(groupId: number): StoreItem[] {
  return read<StoreItem>(KEY_STORES).filter(s => s.groupId === groupId)
}

export function mockFetchStoreOptions(keyword: string): OptionItem[] {
  const kw = keyword.trim().toLowerCase()
  return read<StoreItem>(KEY_STORES)
    .filter(s => !kw || s.storeCode.toLowerCase().includes(kw) || s.storeName.toLowerCase().includes(kw))
    .map(s => ({ value: s.storeCode, label: `${s.storeCode} - ${s.storeName}` }))
}

export function mockFetchStoreUpdatedByOptions(keyword: string): OptionItem[] {
  const kw = keyword.trim()
  const names = [...new Set(read<StoreItem>(KEY_STORES).map(s => s.updatedBy).filter(Boolean))] as string[]
  return names.filter(n => !kw || n.includes(kw)).map(n => ({ value: n, label: n }))
}

export function mockCreateStore(data: StorePayload): StoreItem {
  const stores = read<StoreItem>(KEY_STORES)
  const group = read<MockGroup>(KEY_GROUPS).find(g => g.id === data.groupId)
  if (!group) throw new Error('所屬集團不存在')
  const nextId = Math.max(0, ...stores.map(s => s.id)) + 1
  const item: StoreItem = {
    id: nextId,
    groupId: group.id,
    groupCode: group.groupCode,
    groupName: group.groupName,
    storeCode: `MD${String(nextId).padStart(5, '0')}`,
    storeName: data.storeName,
    brand: data.brand,
    bizChannel: data.bizChannel,
    loginAccount: data.loginAccount,
    updatedBy: currentOperator(),
    createdAt: now(),
    updatedAt: now(),
  }
  write(KEY_STORES, [...stores, item])
  return item
}

export function mockUpdateStore(id: number, data: StorePayload): StoreItem {
  const stores = read<StoreItem>(KEY_STORES)
  const idx = stores.findIndex(s => s.id === id)
  if (idx < 0) throw new Error('門店不存在')
  const group = read<MockGroup>(KEY_GROUPS).find(g => g.id === data.groupId)
  stores[idx] = {
    ...stores[idx],
    ...data,
    groupCode: group?.groupCode ?? stores[idx].groupCode,
    groupName: group?.groupName ?? stores[idx].groupName,
    updatedBy: currentOperator(),
    updatedAt: now(),
  }
  write(KEY_STORES, stores)
  return stores[idx]
}

export function mockDeleteStore(id: number): void {
  const stores = read<StoreItem>(KEY_STORES)
  const idx = stores.findIndex(s => s.id === id)
  if (idx < 0) throw new Error('門店不存在')
  stores.splice(idx, 1)
  write(KEY_STORES, stores)
}

/** 查询门店已绑定的BD列表 */
export function mockFetchStoreBds(storeId: number): StoreBdItem[] {
  const stores = read<StoreItem>(KEY_STORES)
  const store = stores.find(s => s.id === storeId)
  if (!store) throw new Error('門店不存在')
  return store.bdList || []
}

/** 为门店新增绑定BD（自动带出员工部门/职位/职级；重复绑定报错） */
export function mockAddStoreBd(storeId: number, bdEmpId: string): StoreBdItem {
  const stores = read<StoreItem>(KEY_STORES)
  const idx = stores.findIndex(s => s.id === storeId)
  if (idx < 0) throw new Error('門店不存在')
  const bdList = stores[idx].bdList || []
  if (bdList.some(b => b.bdEmpId === bdEmpId)) throw new Error('該員工已綁定為門店BD')
  const emp = mockFetchEmployees({ page: 1, size: 999 }).records.find(e => e.empId === bdEmpId)
  const bind: StoreBdItem = {
    id: Date.now(),
    bdEmpId,
    bdName: emp?.name || bdEmpId,
    department: emp?.department,
    position: emp?.position,
    jobLevel: emp?.jobLevel,
  }
  stores[idx] = {
    ...stores[idx],
    bdList: [...bdList, bind],
    updatedBy: currentOperator(),
    updatedAt: now(),
  }
  write(KEY_STORES, stores)
  return bind
}

/** 解除门店的某条BD绑定 */
export function mockRemoveStoreBd(storeId: number, bindId: number): void {
  const stores = read<StoreItem>(KEY_STORES)
  const idx = stores.findIndex(s => s.id === storeId)
  if (idx < 0) throw new Error('門店不存在')
  const bdList = stores[idx].bdList || []
  if (!bdList.some(b => b.id === bindId)) throw new Error('綁定記錄不存在')
  stores[idx] = {
    ...stores[idx],
    bdList: bdList.filter(b => b.id !== bindId),
    updatedBy: currentOperator(),
    updatedAt: now(),
  }
  write(KEY_STORES, stores)
}

/** 按集团ID（group_code）查询集团下门店已绑定的BD选项（去重） */
export function mockFetchStoreBdOptions(groupCode: string): OptionItem[] {
  const stores = read<StoreItem>(KEY_STORES)
  const seen = new Set<string>()
  const options: OptionItem[] = []
  for (const s of stores) {
    if (s.groupCode !== groupCode) continue
    for (const b of s.bdList || []) {
      if (seen.has(b.bdEmpId)) continue
      seen.add(b.bdEmpId)
      options.push({ value: b.bdEmpId, label: `${b.bdName || b.bdEmpId}(${b.bdEmpId})` })
    }
  }
  return options
}
