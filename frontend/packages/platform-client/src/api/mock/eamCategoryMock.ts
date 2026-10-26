/**
 * 資產分類 Mock 降級服務
 * 當後端不可用時（本地未啟動後端、靜態部署等），使用 localStorage 模擬 CRUD 操作，
 * 保證本地開發可直接用虛擬數據快速驗證；後端可用時自動走真實接口。
 */
import type { AssetCategory } from '../eam'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_CATEGORIES = `${MOCK_PREFIX}eam_categories`
const KEY_CAT_INIT = `${MOCK_PREFIX}eam_cat_initialized`

// ============================================================
// 種子數據（預置常見資產分類）
// ============================================================

const SEED_CATEGORIES: AssetCategory[] = [
  { id: 1, code: '10001', name: 'IT設備', parentId: 0, status: 'enabled', paramTemplate: [], sort: 1, remark: '電腦、伺服器、網路設備等', updatedBy: '系統管理員', updatedAt: '2025-06-01 10:00:00' },
  { id: 2, code: '10001001', name: '筆記型電腦', parentId: 1, status: 'enabled', paramTemplate: [], sort: 1, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-01 10:00:00' },
  { id: 3, code: '10001002', name: '桌上型電腦', parentId: 1, status: 'enabled', paramTemplate: [], sort: 2, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-01 10:00:00' },
  { id: 4, code: '10001003', name: '伺服器', parentId: 1, status: 'enabled', paramTemplate: [], sort: 3, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-01 10:00:00' },
  { id: 5, code: '10001004', name: '網路設備', parentId: 1, status: 'enabled', paramTemplate: [], sort: 4, remark: '路由器、交換機等', updatedBy: '系統管理員', updatedAt: '2025-06-01 10:00:00' },
  { id: 6, code: '10002', name: '辦公設備', parentId: 0, status: 'enabled', paramTemplate: [], sort: 2, remark: '印表機、投影儀、電話等', updatedBy: '系統管理員', updatedAt: '2025-06-02 09:00:00' },
  { id: 7, code: '10002001', name: '印表機', parentId: 6, status: 'enabled', paramTemplate: [], sort: 1, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-02 09:00:00' },
  { id: 8, code: '10002002', name: '投影儀', parentId: 6, status: 'enabled', paramTemplate: [], sort: 2, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-02 09:00:00' },
  { id: 9, code: '10003', name: '移動設備', parentId: 0, status: 'enabled', paramTemplate: [], sort: 3, remark: '手機、平板等', updatedBy: '系統管理員', updatedAt: '2025-06-03 14:00:00' },
  { id: 10, code: '10003001', name: '手機', parentId: 9, status: 'enabled', paramTemplate: [], sort: 1, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-03 14:00:00' },
  { id: 11, code: '10003002', name: '平板電腦', parentId: 9, status: 'enabled', paramTemplate: [], sort: 2, remark: '', updatedBy: '系統管理員', updatedAt: '2025-06-03 14:00:00' },
  { id: 12, code: '10004', name: '家具', parentId: 0, status: 'enabled', paramTemplate: [], sort: 4, remark: '辦公桌椅、櫃子等', updatedBy: '系統管理員', updatedAt: '2025-06-04 11:00:00' },
]

function initMockData() {
  if (localStorage.getItem(KEY_CAT_INIT) === 'true') return
  localStorage.setItem(KEY_CATEGORIES, JSON.stringify(SEED_CATEGORIES))
  localStorage.setItem(KEY_CAT_INIT, 'true')
}

// ============================================================
// 通用工具
// ============================================================

function readList(): AssetCategory[] {
  initMockData()
  try {
    return JSON.parse(localStorage.getItem(KEY_CATEGORIES) || '[]') as AssetCategory[]
  } catch {
    return []
  }
}

function writeList(list: AssetCategory[]) {
  localStorage.setItem(KEY_CATEGORIES, JSON.stringify(list))
}

function nextId(list: AssetCategory[]): number {
  return list.length > 0 ? Math.max(...list.map(c => c.id)) + 1 : 1
}

function now(): string {
  return new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ')
}

// ============================================================
// Mock CRUD 導出
// ============================================================

export function mockFetchCategoryList(): Promise<AssetCategory[]> {
  const list = readList()
  return new Promise(resolve => setTimeout(() => resolve(list), 200))
}

export function mockCreateCategory(data: Omit<AssetCategory, 'id'>): Promise<number> {
  const list = readList()
  const id = nextId(list)
  const item: AssetCategory = { ...data, id, updatedAt: now() }
  list.push(item)
  writeList(list)
  return new Promise(resolve => setTimeout(() => resolve(id), 200))
}

export function mockUpdateCategory(id: number, data: Partial<AssetCategory>): Promise<void> {
  const list = readList()
  const idx = list.findIndex(c => c.id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data, updatedAt: now() }
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockDeleteCategory(id: number): Promise<void> {
  let list = readList()
  list = list.filter(c => c.id !== id)
  writeList(list)
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockToggleCategoryStatus(id: number): Promise<void> {
  const list = readList()
  const item = list.find(c => c.id === id)
  if (item) {
    item.status = item.status === 'enabled' ? 'disabled' : 'enabled'
    item.updatedAt = now()
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}
