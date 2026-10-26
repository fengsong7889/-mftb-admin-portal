/**
 * 資產標籤模板 Mock 降級服務
 * 當後端不可用時，使用 localStorage 模擬 CRUD 操作。
 */
import type { AssetTagTemplate } from '../eam'
import { mockCountBindingsByTag, mockCleanupBindingsByTag } from './eamAssetTagBindingMock'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_TAGS = `${MOCK_PREFIX}eam_asset_tags`
const KEY_TAG_INIT = `${MOCK_PREFIX}eam_asset_tag_initialized_v2`

// ============================================================
// 種子數據（預置常見資產標籤模板）
// ============================================================

const SEED_TAGS: AssetTagTemplate[] = [
  {
    id: 1,
    name: 'IT設備標籤',
    description: '用於筆記本、桌上型電腦、伺服器等 IT 類資產',
    bgColor: '#1890FF',
    textColor: '#FFFFFF',
    displayFields: ['assetNo', 'assetType', 'brand', 'status', 'userName'],
    status: 'enabled',
    sort: 1,
    boundCount: 36,
    updatedBy: '系統管理員',
    updatedAt: '2025-08-01 10:00:00',
  },
  {
    id: 2,
    name: '高價值資產',
    description: '原值超過 10,000 MOP 的資產',
    bgColor: '#E8720C',
    textColor: '#FFFFFF',
    displayFields: ['assetNo', 'assetName', 'brand', 'company', 'source'],
    status: 'enabled',
    sort: 2,
    boundCount: 12,
    updatedBy: '系統管理員',
    updatedAt: '2025-08-05 14:30:00',
  },
  {
    id: 3,
    name: '待處置資產',
    description: '已報廢或待維修的資產',
    bgColor: '#FF4D4F',
    textColor: '#FFFFFF',
    displayFields: ['assetNo', 'assetType', 'status', 'location', 'userName'],
    status: 'enabled',
    sort: 3,
    boundCount: 8,
    updatedBy: '系統管理員',
    updatedAt: '2025-08-10 09:15:00',
  },
  {
    id: 4,
    name: '辦公設備標籤',
    description: '印表機、投影儀等辦公設備',
    bgColor: '#52C41A',
    textColor: '#FFFFFF',
    displayFields: ['assetNo', 'assetType', 'brand', 'location', 'department'],
    status: 'enabled',
    sort: 4,
    boundCount: 21,
    updatedBy: '系統管理員',
    updatedAt: '2025-08-12 16:45:00',
  },
  {
    id: 5,
    name: '移動設備標籤',
    description: '手機、平板等移動設備',
    bgColor: '#722ED1',
    textColor: '#FFFFFF',
    displayFields: ['assetNo', 'assetName', 'brand', 'userName', 'department', 'status'],
    status: 'disabled',
    sort: 5,
    boundCount: 0,
    updatedBy: '系統管理員',
    updatedAt: '2025-08-15 11:20:00',
  },
]

function initMockData() {
  if (localStorage.getItem(KEY_TAG_INIT) === 'true') return
  localStorage.setItem(KEY_TAGS, JSON.stringify(SEED_TAGS))
  localStorage.setItem(KEY_TAG_INIT, 'true')
}

// ============================================================
// 通用工具
// ============================================================

function readList(): AssetTagTemplate[] {
  initMockData()
  try {
    return JSON.parse(localStorage.getItem(KEY_TAGS) || '[]') as AssetTagTemplate[]
  } catch {
    return []
  }
}

function writeList(list: AssetTagTemplate[]) {
  localStorage.setItem(KEY_TAGS, JSON.stringify(list))
}

function nextId(list: AssetTagTemplate[]): number {
  return list.length > 0 ? Math.max(...list.map(c => c.id)) + 1 : 1
}

function now(): string {
  return new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ')
}

// ============================================================
// Mock CRUD 導出
// ============================================================

/**
 * 模板列表：boundCount 由綁定關係實時聚合（替代種子寫死值），
 * 保證「已綁定資產數」與實際綁定操作聯動。
 */
export function mockFetchAssetTagList(): Promise<AssetTagTemplate[]> {
  const counter = mockCountBindingsByTag()
  const list = readList().map(t => ({ ...t, boundCount: counter.get(t.id) || 0 }))
  return new Promise(resolve => setTimeout(() => resolve(list), 200))
}

export function mockCreateAssetTag(data: Omit<AssetTagTemplate, 'id' | 'boundCount'>): Promise<number> {
  const list = readList()
  const id = nextId(list)
  const item: AssetTagTemplate = { ...data, id, boundCount: 0, updatedAt: now() }
  list.push(item)
  writeList(list)
  return new Promise(resolve => setTimeout(() => resolve(id), 200))
}

export function mockUpdateAssetTag(id: number, data: Partial<AssetTagTemplate>): Promise<void> {
  const list = readList()
  const idx = list.findIndex(c => c.id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data, updatedAt: now() }
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockDeleteAssetTag(id: number): Promise<void> {
  let list = readList()
  list = list.filter(c => c.id !== id)
  writeList(list)
  // 同步清理該模板的綁定關係，保持引用完整性
  mockCleanupBindingsByTag(id)
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockToggleAssetTagStatus(id: number): Promise<void> {
  const list = readList()
  const item = list.find(c => c.id === id)
  if (item) {
    item.status = item.status === 'enabled' ? 'disabled' : 'enabled'
    item.updatedAt = now()
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}
