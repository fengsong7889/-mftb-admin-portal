/**
 * 集团人事 Mock 降级服务
 * 当后端不可用时（如 GitHub Pages 静态部署），使用 localStorage 模拟 CRUD 操作
 */
import type { EmployeeItem, EmployeePayload, PageResult, EmployeeQuery } from '../employee'
import type { RoleItem } from '../role'
import type { DepartmentItem } from '../department'
import type { PositionItem } from '../position'
import type { MenuPermission } from '../../pages/Permission/types'

const MOCK_PREFIX = 'mftb_mock_'
const KEY_EMPLOYEES = `${MOCK_PREFIX}employees`
const KEY_ROLES = `${MOCK_PREFIX}roles`
const KEY_DEPARTMENTS = `${MOCK_PREFIX}departments`
const KEY_POSITIONS = `${MOCK_PREFIX}positions`
const KEY_INIT = `${MOCK_PREFIX}hr_initialized`

// ============================================================
// 初始化种子数据
// ============================================================

const SEED_ROLES: RoleItem[] = [
  { id: 1, name: '系統管理員', description: '擁有全部菜單和操作權限', status: 1, permissions: [], userCount: 1, createdAt: '2025-01-01 00:00:00' },
  { id: 2, name: '運營管理員', description: '擁有運營相關菜單權限', status: 1, permissions: [], userCount: 2, createdAt: '2025-01-01 00:00:00' },
  { id: 3, name: '財務專員', description: '僅擁有財務模塊查看權限', status: 1, permissions: [], userCount: 0, createdAt: '2025-02-15 00:00:00' },
  { id: 4, name: '客服專員', description: '僅擁有用戶反饋處理權限', status: 0, permissions: [], userCount: 0, createdAt: '2025-03-01 00:00:00' },
]

const SEED_DEPARTMENTS: DepartmentItem[] = [
  { id: 1, code: 'HQ', name: '集團總部', parentId: null, leader: '張總', status: 1, sort: 1, permissions: [], userCount: 3, createdAt: '2025-01-01 00:00:00' },
  { id: 2, code: 'TECH', name: '技術部', parentId: 1, parentName: '集團總部', leader: '李工', status: 1, sort: 1, permissions: [], userCount: 2, createdAt: '2025-01-01 00:00:00' },
  { id: 3, code: 'OPS', name: '運營部', parentId: 1, parentName: '集團總部', leader: '王經理', status: 1, sort: 2, permissions: [], userCount: 1, createdAt: '2025-01-01 00:00:00' },
  { id: 4, code: 'FIN', name: '財務部', parentId: 1, parentName: '集團總部', leader: '趙會計', status: 1, sort: 3, permissions: [], userCount: 0, createdAt: '2025-01-01 00:00:00' },
  { id: 5, code: 'CS', name: '客服部', parentId: 3, parentName: '運營部', leader: '陳主管', status: 1, sort: 1, permissions: [], userCount: 0, createdAt: '2025-02-01 00:00:00' },
]

const SEED_POSITIONS: PositionItem[] = [
  { id: 1, name: '高級工程師', sequence: 'T', jobLevel: 'T7' },
  { id: 2, name: '中級工程師', sequence: 'T', jobLevel: 'T5' },
  { id: 3, name: '初級工程師', sequence: 'T', jobLevel: 'T3' },
  { id: 4, name: '高級產品經理', sequence: 'P', jobLevel: 'P7' },
  { id: 5, name: '產品經理', sequence: 'P', jobLevel: 'P5' },
  { id: 6, name: '運營專員', sequence: 'P', jobLevel: 'P3' },
  { id: 7, name: '部門經理', sequence: 'M', jobLevel: 'M5' },
  { id: 8, name: '總監', sequence: 'M', jobLevel: 'M7' },
]

const SEED_EMPLOYEES: EmployeeItem[] = [
  { id: 1, username: 'admin', name: '系統管理員', empId: 'EMP001', role: 'admin', departmentId: 1, department: '集團總部', positionId: 8, position: '總監', sequence: 'M', jobLevel: 'M7', status: 1, functionRoleIds: [1], createdAt: '2025-01-01 00:00:00' },
  { id: 2, username: 'zhangsan', name: '張三', empId: 'EMP002', role: 'guest', departmentId: 2, department: '技術部', positionId: 1, position: '高級工程師', sequence: 'T', jobLevel: 'T7', status: 1, functionRoleIds: [2], createdAt: '2025-01-15 10:30:00' },
  { id: 3, username: 'lisi', name: '李四', empId: 'EMP003', role: 'guest', departmentId: 2, department: '技術部', positionId: 2, position: '中級工程師', sequence: 'T', jobLevel: 'T5', status: 1, functionRoleIds: [2], createdAt: '2025-02-01 14:00:00' },
  { id: 4, username: 'wangwu', name: '王五', empId: 'EMP004', role: 'guest', departmentId: 3, department: '運營部', positionId: 6, position: '運營專員', sequence: 'P', jobLevel: 'P3', status: 1, functionRoleIds: [2], createdAt: '2025-03-10 09:00:00' },
  { id: 5, username: 'zhaoliu', name: '趙六', empId: 'EMP005', role: 'guest', departmentId: 4, department: '財務部', positionId: null, position: undefined, jobLevel: undefined, status: 0, functionRoleIds: [3], createdAt: '2025-04-01 16:00:00' },
]

function initMockData() {
  if (localStorage.getItem(KEY_INIT) === 'true') return
  localStorage.setItem(KEY_ROLES, JSON.stringify(SEED_ROLES))
  localStorage.setItem(KEY_DEPARTMENTS, JSON.stringify(SEED_DEPARTMENTS))
  localStorage.setItem(KEY_POSITIONS, JSON.stringify(SEED_POSITIONS))
  localStorage.setItem(KEY_EMPLOYEES, JSON.stringify(SEED_EMPLOYEES))
  localStorage.setItem(KEY_INIT, 'true')
}

// 确保初始化
initMockData()

// ============================================================
// 通用工具
// ============================================================

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[]
  } catch {
    return []
  }
}

function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

function nextId(items: { id: number }[]): number {
  return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** 生成下一个工号 (MT 前缀 + 4 位自增, 与后端规则一致) */
function nextEmpId(employees: EmployeeItem[]): string {
  const maxSeq = employees.reduce((max, emp) => {
    const match = /^MT(\d+)$/.exec(emp.empId ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `MT${String(maxSeq + 1).padStart(4, '0')}`
}

// ============================================================
// 员工 Mock CRUD
// ============================================================

export function mockFetchEmployees(query: EmployeeQuery): PageResult<EmployeeItem> {
  const list = read<EmployeeItem>(KEY_EMPLOYEES)
  const filtered = list.filter(emp => {
    if (query.keyword) {
      const kw = query.keyword.toLowerCase()
      const match = emp.username.toLowerCase().includes(kw)
        || emp.name.toLowerCase().includes(kw)
        || emp.empId.toLowerCase().includes(kw)
      if (!match) return false
    }
    if (query.status !== undefined && query.status !== null) {
      if (emp.status !== query.status) return false
    }
    return true
  })
  const start = (query.page - 1) * query.size
  return {
    records: filtered.slice(start, start + query.size),
    total: filtered.length,
  }
}

export function mockCreateEmployee(data: EmployeePayload): EmployeeItem {
  const employees = read<EmployeeItem>(KEY_EMPLOYEES)
  const departments = read<DepartmentItem>(KEY_DEPARTMENTS)
  const positions = read<PositionItem>(KEY_POSITIONS)
  const dept = departments.find(d => d.id === data.departmentId)
  const pos = positions.find(p => p.id === data.positionId)
  // 工号即登录账号, 由系统自动生成
  const empId = nextEmpId(employees)
  const item: EmployeeItem = {
    id: nextId(employees),
    username: empId,
    name: data.name,
    empId,
    role: 'guest',
    departmentId: data.departmentId ?? null,
    department: dept?.name,
    positionId: data.positionId ?? null,
    position: pos?.name,
    positionEn: pos?.nameEn,
    sequence: pos?.sequence,
    jobLevel: pos?.jobLevel,
    rank: data.rank ?? undefined,
    status: 1,
    functionRoleIds: data.functionRoleIds ?? [],
    createdAt: now(),
    updatedBy: '系統管理員',
    updatedAt: now(),
  }
  employees.push(item)
  write(KEY_EMPLOYEES, employees)
  return item
}

export function mockUpdateEmployee(id: number, data: EmployeePayload): EmployeeItem | null {
  const employees = read<EmployeeItem>(KEY_EMPLOYEES)
  const departments = read<DepartmentItem>(KEY_DEPARTMENTS)
  const positions = read<PositionItem>(KEY_POSITIONS)
  const idx = employees.findIndex(e => e.id === id)
  if (idx === -1) return null
  const dept = departments.find(d => d.id === data.departmentId)
  const pos = positions.find(p => p.id === data.positionId)
  employees[idx] = {
    ...employees[idx],
    name: data.name,
    departmentId: data.departmentId ?? null,
    department: dept?.name,
    positionId: data.positionId ?? null,
    position: pos?.name,
    positionEn: pos?.nameEn,
    sequence: pos?.sequence,
    jobLevel: pos?.jobLevel,
    rank: data.rank ?? undefined,
    functionRoleIds: data.functionRoleIds ?? [],
    updatedBy: '系統管理員',
    updatedAt: now(),
  }
  write(KEY_EMPLOYEES, employees)
  return employees[idx]
}

export function mockResetPassword(id: number): boolean {
  const employees = read<EmployeeItem>(KEY_EMPLOYEES)
  return employees.some(e => e.id === id)
}

export function mockUpdateEmployeeStatus(id: number, status: number): boolean {
  const employees = read<EmployeeItem>(KEY_EMPLOYEES)
  const idx = employees.findIndex(e => e.id === id)
  if (idx === -1) return false
  employees[idx].status = status
  write(KEY_EMPLOYEES, employees)
  return true
}

export function mockDeleteEmployee(id: number): boolean {
  const employees = read<EmployeeItem>(KEY_EMPLOYEES)
  const idx = employees.findIndex(e => e.id === id)
  if (idx === -1) return false
  employees.splice(idx, 1)
  write(KEY_EMPLOYEES, employees)
  return true
}

// ============================================================
// 角色 Mock
// ============================================================

export function mockFetchRoles(): RoleItem[] {
  return read<RoleItem>(KEY_ROLES)
}

// ============================================================
// 部门 Mock
// ============================================================

export function mockFetchDepartments(): DepartmentItem[] {
  return read<DepartmentItem>(KEY_DEPARTMENTS)
}

// ============================================================
// 职位 Mock
// ============================================================

export function mockFetchPositions(): PositionItem[] {
  return read<PositionItem>(KEY_POSITIONS)
}

/** 重置全部 Mock 数据（用于调试） */
export function resetMockData() {
  localStorage.removeItem(KEY_INIT)
  localStorage.removeItem(KEY_EMPLOYEES)
  localStorage.removeItem(KEY_ROLES)
  localStorage.removeItem(KEY_DEPARTMENTS)
  localStorage.removeItem(KEY_POSITIONS)
  initMockData()
}
