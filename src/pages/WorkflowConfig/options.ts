/**
 * 審批流程配置 — 選項數據（真實後端 API + 降級 Mock）
 *
 * 人員 / 角色 / 部門選項均從後端 API 異步加載，
 * 後端不可用時降級到本地 Mock 數據。
 * 加載結果緩存在模塊級，`getApproverOptions` 同步讀取緩存。
 */
import { fetchEmployees, type EmployeeItem } from '../../api/employee'
import { fetchDepartments, type DepartmentItem } from '../../api/department'
import { fetchWorkflowRoleOptions, type RoleOption } from '../../api/workflowConfig'

/* ==================== 模塊級緩存 ==================== */

interface ApproverCache {
  persons: { label: string; value: string }[]
  roles: { label: string; value: string }[]
  departments: { label: string; value: string }[]
}

let cache: ApproverCache | null = null
let loadPromise: Promise<ApproverCache> | null = null

/** Mock 降級數據（後端不可用時使用） */
const MOCK_PERSONS = [
  { label: '系統管理員(MF00001)', value: '1' },
]
const MOCK_ROLES: { label: string; value: string }[] = []
const MOCK_DEPARTMENTS: { label: string; value: string }[] = []

/** 觸發加載（冪等，多次調用共享同一 Promise） */
export function loadApproverOptions(): Promise<ApproverCache> {
  if (cache) return Promise.resolve(cache)
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const [empRes, roles, depts] = await Promise.allSettled([
      fetchEmployees({ page: 1, size: 200, status: 1 }),
      fetchWorkflowRoleOptions(),
      fetchDepartments(),
    ])

    const persons: ApproverCache['persons'] =
      empRes.status === 'fulfilled'
        ? (empRes.value.records || []).map((e: EmployeeItem) => ({
            label: `${e.name}(${e.empId})`,
            value: String(e.id),
          }))
        : MOCK_PERSONS

    const roleOptions: ApproverCache['roles'] =
      roles.status === 'fulfilled'
        ? roles.value.map((r: RoleOption) => ({
            label: r.name,
            value: String(r.id),
          }))
        : MOCK_ROLES

    const deptOptions: ApproverCache['departments'] =
      depts.status === 'fulfilled'
        ? depts.value.map((d: DepartmentItem) => ({
            label: d.name,
            value: String(d.id),
          }))
        : MOCK_DEPARTMENTS

    cache = { persons, roles: roleOptions, departments: deptOptions }
    return cache
  })()

  return loadPromise
}

/** 重置緩存（用於測試或強制刷新） */
export function resetApproverOptionsCache() {
  cache = null
  loadPromise = null
}

/* ==================== 同步讀取接口（與舊 API 兼容） ==================== */

/** 按審批人類型取對應選項（讀緩存，未加載時返回空數組） */
export function getApproverOptions(type: string) {
  if (!cache) return []
  if (type === 'person') return cache.persons
  if (type === 'role') return cache.roles
  if (type === 'department_leader') return cache.departments
  return []
}

/** 按審批人類型取選項單元名稱 */
export function getApproverUnitName(type: string) {
  if (type === 'person') return '人員'
  if (type === 'role') return '角色'
  if (type === 'department_leader') return '部門'
  return ''
}
