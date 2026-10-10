/**
 * 用车管理 — 共享引用数据（部门树 / 员工候选 / 驾驶人候选）
 *
 * 为什么不直接复用 AssetClaim 里的 buildDeptTree：跨模块导入会把车辆模块和
 * 资产领用模块绑成隐式耦合（改领用会影响车辆）。部门/员工都是只读引用数据，
 * 在本模块内自持一份轻量实现更稳；两侧都走同一批已有只读接口，不新增后端工作。
 *
 * 失败策略：这些是引用数据，取不到时降级为空列表并让页面给出提示，
 * 不再回退到"演示部门/演示法人"——B1 起界面上不允许出现看起来真实的假候选，
 * 否则用户会拿它做真实选择并提交了个不存在的 ID。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import request, { SILENT_HEADER } from '../../api/request'
import { fetchDepartments, type DepartmentItem } from '../../api/department'
import { fetchEmployees } from '../../api/employee'
import { fetchEligibleDrivers } from '../../api/vehicle'
import type { QualificationVO } from '../../api/vehicle'
import { QUALIFICATION_RESULT } from './vehicleTypes'
import { QUALIFICATION_LABEL } from './vehicleMeta'

export interface DeptTreeNode {
  value: number
  title: string
  children: DeptTreeNode[]
}

/** 扁平部门列表 → 树（按 parentId 挂接，父缺失时作为根，避免整棵丢节点） */
export function buildDeptTree(departments: DepartmentItem[]): DeptTreeNode[] {
  const nodes = new Map(
    departments.map(d => [d.id, { value: d.id, title: d.name, children: [] as DeptTreeNode[] }]),
  )
  const roots: DeptTreeNode[] = []
  for (const d of departments) {
    const node = nodes.get(d.id)
    if (!node) continue
    const parent = d.parentId != null && d.parentId !== d.id ? nodes.get(d.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** 部门树 + id→名称查找（列表筛选、表单 TreeSelect、详情展示共用一次请求） */
export function useVehicleDeptTree() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchDepartments()
      setDepartments(Array.isArray(list) ? list : [])
      setFailed(!Array.isArray(list) || list.length === 0)
    } catch {
      setDepartments([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const treeData = useMemo(() => buildDeptTree(departments), [departments])
  const nameById = useMemo(
    () => new Map(departments.map(d => [d.id, d.name] as const)),
    [departments],
  )

  return { treeData, nameById, departments, loading, failed, refetch: load }
}

export interface EmployeeOption {
  empId: number
  empNo: string
  empName: string
  departmentId?: number | null
  department?: string
}

/**
 * 法人主体（购买公司字典）候选。
 *
 * <p>走已有只读接口 GET /api/purchase-companies（登录即可，无需额外菜单权限）。
 * <p>法人主体与「公司品牌」是两个独立维度，车辆档案必须分开保存，不能共用一个 brand 字段。
 * <p>静默请求 + 失败置空：不给演示回退项，否则用户会选中一个不存在的法人并提交。
 */
export interface PurchaseCompanyOption { value: number; label: string }

export function usePurchaseCompanies() {
  const [options, setOptions] = useState<PurchaseCompanyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await request.get<unknown, Array<{ id: number; name?: string; label?: string }>>(
        '/purchase-companies', { headers: { [SILENT_HEADER]: '1' } },
      )
      setOptions(Array.isArray(list)
        ? list.map(c => ({ value: c.id, label: c.label ?? c.name ?? `公司#${c.id}` }))
        : [])
      setFailed(false)
    } catch {
      setOptions([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { options, loading, failed, refetch: load }
}

/** 在职员工候选（用车人、管理人员选择用） */
export function useVehicleEmployees() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (keyword?: string) => {
    setLoading(true)
    try {
      const res = await fetchEmployees({ page: 1, size: 50, keyword: keyword?.trim() || undefined, employmentStatus: 'active' })
      setEmployees((res.records ?? []).map(e => ({
        empId: e.id, empNo: e.empId, empName: e.name,
        departmentId: e.departmentId, department: e.department,
      })))
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { employees, loading, search: load }
}

/**
 * 可安排驾驶人候选：只取"已核验且未过期"的资格记录（后端 eligible-drivers 已过滤）。
 *
 * 说明：这里不做前端二次过滤，也不对"待核验/失效"的人做静默隐藏后再让人猜——
 * 需要展示全部资格时走车辆档案的驾驶资格 Tab，那里明确标出核验结果。
 */
export function useDriverOptions() {
  const [quals, setQuals] = useState<QualificationVO[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchEligibleDrivers()
      setQuals(Array.isArray(list) ? list : [])
      setFailed(false)
    } catch {
      setQuals([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const options = useMemo(() => quals.map(q => ({
    value: q.userId,
    label: `${q.empName}（${q.empNo}） · ${q.region} · ${q.licenseClass} · ${QUALIFICATION_LABEL[QUALIFICATION_RESULT.VERIFIED]}`,
    qualification: q,
  })), [quals])

  return { options, quals, loading, failed, refetch: load }
}

/** 驾驶人候选的选项类型（供表单与校验复用） */
export type DriverOption = {
  value: number
  label: string
  qualification: QualificationVO
}
