/**
 * 部门树构建（考勤假勤模块内共享）。
 *
 * 为什么放模块内而不是 src/utils：这是 TreeSelect 的展示适配，只有考勤的
 * 考勤组表单与几个列表页的部门筛选在用；仓内其它模块各自有同形实现
 * （AssetList / AssetAdd / OaPurchaseRequest），跨模块统一属另一件事，不在本模块顺手改。
 *
 * value 用**部门 id**（数字）：后端筛选参数 deptId 就是 id，用名称当 value
 * 会在部门改名后让筛选项与历史数据对不上。
 */
import type { DepartmentItem } from '../../api/department'

export interface DeptNode {
  title: string
  value: number
  children?: DeptNode[]
}

/** 两层树（根部门 + 直属子部门）：与仓内既有部门筛选控件的展开深度一致 */
export function buildDeptTree(depts: DepartmentItem[]): DeptNode[] {
  const childrenMap = new Map<number, DepartmentItem[]>()
  const roots: DepartmentItem[] = []
  depts.forEach(d => {
    if (d.parentId && d.parentId !== 0) {
      if (!childrenMap.has(d.parentId)) childrenMap.set(d.parentId, [])
      childrenMap.get(d.parentId)!.push(d)
    } else {
      roots.push(d)
    }
  })
  return roots.map(r => ({
    title: r.name,
    value: r.id,
    children: (childrenMap.get(r.id) || []).map(c => ({ title: c.name, value: c.id })),
  }))
}
