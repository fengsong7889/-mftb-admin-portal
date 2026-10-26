/**
 * 資產-標籤綁定關係 Mock 降級服務
 *
 * 標籤綁定後端尚未實現（前端先行策略），綁定關係暫存 localStorage；
 * 每個資產可綁定多個標籤（1 個主標籤 + N 個次標籤），
 * 模板列表的 boundCount 由本文件 mockCountBindingsByTag 實時聚合，
 * 保證「已綁定資產數」為真實關係數據而非寫死值。
 */
import type { AssetTagTemplate } from '../eam'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_BINDINGS = `${MOCK_PREFIX}eam_asset_tag_bindings`
const KEY_BINDINGS_INIT = `${MOCK_PREFIX}eam_asset_tag_bindings_initialized_v1`

/** 綁定關係記錄 */
export interface AssetTagBindingRecord {
  id: number
  assetId: number
  tagId: number
  /** 主標籤：每個資產至多 1 個，解綁後自動遞補最早綁定的次標籤 */
  isPrimary: boolean
  createdBy: string
  createdAt: string
}

const SEED_BINDINGS: AssetTagBindingRecord[] = [
  { id: 1, assetId: 1, tagId: 1, isPrimary: true, createdBy: '系統管理員', createdAt: '2025-08-02 09:00:00' },
  { id: 2, assetId: 1, tagId: 2, isPrimary: false, createdBy: '系統管理員', createdAt: '2025-08-06 14:20:00' },
  { id: 3, assetId: 2, tagId: 1, isPrimary: true, createdBy: '系統管理員', createdAt: '2025-08-07 10:10:00' },
  { id: 4, assetId: 3, tagId: 4, isPrimary: true, createdBy: '系統管理員', createdAt: '2025-08-11 15:30:00' },
  { id: 5, assetId: 3, tagId: 3, isPrimary: false, createdBy: '系統管理員', createdAt: '2025-08-12 09:45:00' },
  { id: 6, assetId: 4, tagId: 2, isPrimary: true, createdBy: '系統管理員', createdAt: '2025-08-13 11:00:00' },
  { id: 7, assetId: 5, tagId: 1, isPrimary: true, createdBy: '系統管理員', createdAt: '2025-08-14 16:25:00' },
]

function initMockData() {
  if (localStorage.getItem(KEY_BINDINGS_INIT) === 'true') return
  localStorage.setItem(KEY_BINDINGS, JSON.stringify(SEED_BINDINGS))
  localStorage.setItem(KEY_BINDINGS_INIT, 'true')
}

function readBindings(): AssetTagBindingRecord[] {
  initMockData()
  try {
    return JSON.parse(localStorage.getItem(KEY_BINDINGS) || '[]') as AssetTagBindingRecord[]
  } catch {
    return []
  }
}

function writeBindings(list: AssetTagBindingRecord[]) {
  localStorage.setItem(KEY_BINDINGS, JSON.stringify(list))
}

function now(): string {
  return new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ')
}

function delay<T>(value: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), 200))
}

/** 查詢資產已綁標籤（主標籤排前，其餘按綁定時間先後） */
export function mockFetchAssetTagBindings(assetId: number): Promise<AssetTagBindingRecord[]> {
  const list = readBindings()
    .filter(b => b.assetId === assetId)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.id - b.id)
  return delay(list)
}

/** 反查模板綁定的資產 ID 列表（批量列印「按模板」數據源） */
export function mockFetchAssetIdsByTag(tagId: number): Promise<number[]> {
  return delay(readBindings().filter(b => b.tagId === tagId).map(b => b.assetId))
}

/**
 * 綁定標籤。主標籤策略：
 * - 顯式指定 isPrimary 時清除該資產原主標籤；
 * - 未指定時若該資產尚無主標籤，則本條自動設為主標籤（單綁首個 / 批量綁定均適用）。
 */
export function mockBindAssetTag(assetId: number, tagId: number, isPrimary?: boolean): Promise<void> {
  const list = readBindings()
  if (list.some(b => b.assetId === assetId && b.tagId === tagId)) return delay(undefined)
  const hasPrimary = list.some(b => b.assetId === assetId && b.isPrimary)
  const shouldBePrimary = isPrimary === true || (isPrimary === undefined && !hasPrimary)
  if (shouldBePrimary) list.forEach(b => { if (b.assetId === assetId) b.isPrimary = false })
  list.push({
    id: list.length > 0 ? Math.max(...list.map(b => b.id)) + 1 : 1,
    assetId, tagId, isPrimary: shouldBePrimary,
    createdBy: '當前用戶', createdAt: now(),
  })
  writeBindings(list)
  return delay(undefined)
}

/** 解綁標籤；主標籤被解綁後自動遞補最早綁定的次標籤 */
export function mockUnbindAssetTag(assetId: number, tagId: number): Promise<void> {
  const all = readBindings()
  const target = all.find(b => b.assetId === assetId && b.tagId === tagId)
  const list = all.filter(b => !(b.assetId === assetId && b.tagId === tagId))
  if (target?.isPrimary) {
    const rest = list.filter(b => b.assetId === assetId).sort((a, b) => a.id - b.id)
    if (rest.length > 0) rest[0].isPrimary = true
  }
  writeBindings(list)
  return delay(undefined)
}

/** 設為主標籤（原主標籤自動降級為次標籤） */
export function mockSetPrimaryAssetTag(assetId: number, tagId: number): Promise<void> {
  const list = readBindings()
  list.forEach(b => {
    if (b.assetId === assetId) b.isPrimary = b.tagId === tagId
  })
  writeBindings(list)
  return delay(undefined)
}

/** 按模板聚合綁定數（供模板列表 boundCount 實時計算，替代寫死假數據） */
export function mockCountBindingsByTag(): Map<number, number> {
  const counter = new Map<number, number>()
  readBindings().forEach(b => counter.set(b.tagId, (counter.get(b.tagId) || 0) + 1))
  return counter
}

/** 刪除模板時同步清理綁定關係（保持引用完整性） */
export function mockCleanupBindingsByTag(tagId: number): void {
  writeBindings(readBindings().filter(b => b.tagId !== tagId))
}

/** 綁定記錄 → 模板配置組裝（供 eam.ts 返回含模板信息的綁定項） */
export interface AssetTagBindingAssembled {
  bindingId: number
  isPrimary: boolean
  createdBy?: string
  createdAt?: string
  tag: AssetTagTemplate
}

export function assembleBindings(
  records: AssetTagBindingRecord[],
  templates: AssetTagTemplate[],
): AssetTagBindingAssembled[] {
  const result: AssetTagBindingAssembled[] = []
  records.forEach(r => {
    const tag = templates.find(t => t.id === r.tagId)
    if (tag) result.push({ bindingId: r.id, isPrimary: r.isPrimary, createdBy: r.createdBy, createdAt: r.createdAt, tag })
  })
  return result
}
