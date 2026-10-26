/**
 * 供應商管理 Mock 降級服務
 * 當後端不可用時，使用 localStorage 模擬 CRUD 操作。
 */
import type { EamSupplier, SupplierSaveParams, SupplierContactItem, SupplierDropdownItem } from '../eam'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_SUPPLIERS = `${MOCK_PREFIX}eam_suppliers`
const KEY_SUPPLIER_INIT = `${MOCK_PREFIX}eam_supplier_initialized`
const KEY_CONTACTS = `${MOCK_PREFIX}eam_supplier_contacts`

// ============================================================
// 種子數據（預置示例供應商）
// ============================================================

const SEED_SUPPLIERS: EamSupplier[] = [
  {
    id: 1,
    code: 'CGSJ000001',
    name: '北京公贝科技有限公司',
    contactPerson: '錢寶龍',
    contactPhone: '400-181-9967',
    bankName: '中國工商銀行股份有限公司北京分行',
    bankAccount: '020000XXXXXX0128',
    remark: '',
    status: 'enabled',
    updatedBy: '系統管理員',
    updatedAt: '2025-08-01 10:00:00',
  },
  {
    id: 2,
    code: 'CGSJ000002',
    name: '深圳華聯電子設備有限公司',
    contactPerson: '李國強',
    contactPhone: '13800138000',
    bankName: '中國銀行深圳科技園支行',
    bankAccount: '7550 1888 XXXX 3210',
    remark: '筆記本/桌面機主要供應商',
    status: 'enabled',
    updatedBy: '系統管理員',
    updatedAt: '2025-08-05 14:30:00',
  },
  {
    id: 3,
    code: 'CGSJ000003',
    name: '澳門誠信辦公傢俬貿易行',
    contactPerson: '陳志明',
    contactPhone: '6688 1234',
    bankName: '大西洋銀行澳門分行',
    bankAccount: '9010-XXXX-8876',
    remark: '辦公傢俬類採購',
    status: 'enabled',
    updatedBy: '系統管理員',
    updatedAt: '2025-08-12 09:20:00',
  },
  {
    id: 4,
    code: 'CGSJ000004',
    name: '廣州迅捷物流服務有限公司',
    contactPerson: '黃小燕',
    contactPhone: '020-3828 XXXX',
    bankName: '中國建設銀行廣州天河支行',
    bankAccount: '4402 6655 XXXX 0092',
    remark: '',
    status: 'disabled',
    updatedBy: '系統管理員',
    updatedAt: '2025-08-18 16:45:00',
  },
]

function initMockData() {
  if (localStorage.getItem(KEY_SUPPLIER_INIT) === 'true') return
  localStorage.setItem(KEY_SUPPLIERS, JSON.stringify(SEED_SUPPLIERS))
  localStorage.setItem(KEY_SUPPLIER_INIT, 'true')
}

// ============================================================
// 通用工具
// ============================================================

function readList(): EamSupplier[] {
  initMockData()
  try {
    return JSON.parse(localStorage.getItem(KEY_SUPPLIERS) || '[]') as EamSupplier[]
  } catch {
    return []
  }
}

function writeList(list: EamSupplier[]) {
  localStorage.setItem(KEY_SUPPLIERS, JSON.stringify(list))
}

function nextId(list: EamSupplier[]): number {
  return list.length > 0 ? Math.max(...list.map(s => s.id)) + 1 : 1
}

function now(): string {
  return new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ')
}

// ============================================================
// Mock CRUD 導出
// ============================================================

export function mockFetchSupplierList(): Promise<EamSupplier[]> {
  const list = readList()
  return new Promise(resolve => setTimeout(() => resolve(list), 200))
}

/** 編碼自動生成：CGSJ + 6位全局自增（取現有最大序號+1，與後端規則一致） */
function nextSupplierCode(list: EamSupplier[]): string {
  let max = 0
  list.forEach((s) => {
    const m = /^CGSJ(\d{6})$/.exec(s.code)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  })
  return `CGSJ${String(max + 1).padStart(6, '0')}`
}

export function mockCreateSupplier(data: SupplierSaveParams): Promise<number> {
  const list = readList()
  const id = nextId(list)
  const item: EamSupplier = {
    ...data,
    code: nextSupplierCode(list),
    status: 'enabled',
    id,
    updatedAt: now(),
  }
  list.push(item)
  writeList(list)
  return new Promise(resolve => setTimeout(() => resolve(id), 200))
}

export function mockUpdateSupplier(id: number, data: SupplierSaveParams): Promise<void> {
  const list = readList()
  const idx = list.findIndex(s => s.id === id)
  if (idx >= 0) {
    // 編碼/狀態不可透過更新接口變更（狀態只能走 toggle）
    list[idx] = { ...list[idx], ...data, updatedAt: now() }
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockDeleteSupplier(id: number): Promise<void> {
  let list = readList()
  list = list.filter(s => s.id !== id)
  writeList(list)
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

export function mockToggleSupplierStatus(id: number): Promise<void> {
  const list = readList()
  const item = list.find(s => s.id === id)
  if (item) {
    item.status = item.status === 'enabled' ? 'disabled' : 'enabled'
    item.updatedAt = now()
    writeList(list)
  }
  return new Promise(resolve => setTimeout(() => resolve(), 200))
}

// ============================================================
// 联系人 Mock
// ============================================================

function readContacts(): Record<number, SupplierContactItem[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY_CONTACTS) || '{}') as Record<number, SupplierContactItem[]>
  } catch {
    return {}
  }
}

function writeContacts(map: Record<number, SupplierContactItem[]>) {
  localStorage.setItem(KEY_CONTACTS, JSON.stringify(map))
}

/** 预置示例联系人（与种子供应商对应） */
const SEED_CONTACTS: Record<number, SupplierContactItem[]> = {
  1: [
    { id: 1, supplierId: 1, contactName: '錢寶龍', contactPhone: '400-181-9967', status: 'enabled', createdAt: '2025-08-01 10:00:00', updatedAt: '2025-08-01 10:00:00' },
  ],
  2: [
    { id: 2, supplierId: 2, contactName: '李國強', contactPhone: '13800138000', status: 'enabled', createdAt: '2025-08-05 14:30:00', updatedAt: '2025-08-05 14:30:00' },
    { id: 3, supplierId: 2, contactName: '張偉明', contactPhone: '13900139000', status: 'enabled', createdAt: '2025-08-06 09:00:00', updatedAt: '2025-08-06 09:00:00' },
  ],
  3: [
    { id: 4, supplierId: 3, contactName: '陳志明', contactPhone: '6688 1234', status: 'enabled', createdAt: '2025-08-12 09:20:00', updatedAt: '2025-08-12 09:20:00' },
  ],
  4: [
    { id: 5, supplierId: 4, contactName: '黃小燕', contactPhone: '020-3828 XXXX', status: 'enabled', createdAt: '2025-08-18 16:45:00', updatedAt: '2025-08-18 16:45:00' },
  ],
}

function initContacts() {
  if (localStorage.getItem(KEY_SUPPLIER_INIT) === 'true') {
    // 已有旧数据，不覆盖
    const existing = localStorage.getItem(KEY_CONTACTS)
    if (!existing) {
      localStorage.setItem(KEY_CONTACTS, JSON.stringify(SEED_CONTACTS))
    }
    return
  }
  localStorage.setItem(KEY_CONTACTS, JSON.stringify(SEED_CONTACTS))
}

export function mockFetchSupplierContacts(supplierId: number): Promise<SupplierContactItem[]> {
  initContacts()
  const map = readContacts()
  const list = map[supplierId] || []
  return new Promise(resolve => setTimeout(() => resolve(list), 150))
}

export function mockFetchSuppliersDropdown(keyword?: string): Promise<SupplierDropdownItem[]> {
  const list = readList().filter(s => s.status === 'enabled')
  let filtered = list
  if (keyword && keyword.trim()) {
    const kw = keyword.trim().toLowerCase()
    filtered = list.filter(s => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw))
  }
  const result: SupplierDropdownItem[] = filtered.slice(0, 50).map(s => ({ id: s.id, code: s.code, name: s.name }))
  return new Promise(resolve => setTimeout(() => resolve(result), 150))
}

/** Mock 同步聯繫人：若已存在同名聯繫人則更新電話，否則新增 */
export function mockSyncSupplierContact(supplierId: number, contactName: string, contactPhone: string): Promise<void> {
  initContacts()
  const map = readContacts()
  const list = map[supplierId] || []
  const existing = list.find(c => c.contactName === contactName)
  if (existing) {
    existing.contactPhone = contactPhone
    existing.updatedAt = now()
  } else {
    const maxId = list.length > 0 ? Math.max(...list.map(c => c.id || 0)) : 0
    list.push({
      id: maxId + 1,
      supplierId,
      contactName,
      contactPhone,
      status: 'enabled',
      createdAt: now(),
      updatedAt: now(),
    })
  }
  map[supplierId] = list
  writeContacts(map)
  return new Promise(resolve => setTimeout(() => resolve(), 150))
}
