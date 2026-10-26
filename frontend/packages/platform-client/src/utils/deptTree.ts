/**
 * 部门树构建（跨域共享：考勤假勤 + 产研交付的负责人/部门筛选都在用）。
 *
 * 为什么从 src/pages/Attendance/ 上移到 platform-client：产研应用隔离后不允许
 * app-rdm 反向依赖考勤页面目录（scripts/check-boundary.mjs 的包依赖白名单），
 * 而两边需要同一棵树的构建口径，故下沉为共享工具。
 * 仓内其它模块仍有同形实现（AssetList / AssetAdd / OaPurchaseRequest），
 * 跨模块统一属另一件事，不在本文件顺手改。
 *
 * value 用**部门 id**（数字）：后端筛选参数 deptId 就是 id，用名称当 value
 * 会在部门改名后让筛选项与历史数据对不上。
 */
import type { DepartmentItem } from '@/api/department'

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
