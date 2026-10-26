/**
 * 考勤模块共用的筛选项数据源（考勤组下拉 + 部门树）。
 *
 * 为什么抽成 hook：工作台、打卡、异常、日报、月报、排班六个页面都要这两个下拉，
 * 各页自己 fetch 会有三份问题——① 同一次进入系统打六遍相同请求；
 * ② 某页忘了 catch 就会因一个下拉失败而整页报错；③ 部门树构建逻辑复制六份。
 *
 * 口径说明：
 * - 考勤组不带 status 过滤：停用的组仍要能筛出历史数据，否则查不到停用期间的异常；
 * - 一次最多取 200 条（后端 PageResult 的分页上限）；考勤组属长期主数据，
 *   超过 200 个组时应该按名称搜索而不是继续加大分页，因此这里不做无限拉取。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ENABLE_STATUS, fetchGroups, type GroupVO } from '@/api/attendance'
import { fetchDepartments } from '@/api/department'
import { buildDeptTree, type DeptNode } from '@/utils/deptTree'

export interface AttendanceOptions {
  groups: GroupVO[]
  groupOptions: Array<{ value: number; label: string }>
  deptTree: DeptNode[]
}

export function useAttendanceOptions(): AttendanceOptions {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<GroupVO[]>([])
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])

  useEffect(() => {
    // 下拉数据加载失败不该让整页报错：筛选项为空时用户仍能看表格，故各自 catch 兜底
    fetchGroups({ page: 1, size: 200 })
      .then(res => setGroups(res.records ?? []))
      .catch(() => setGroups([]))
    fetchDepartments()
      .then(list => setDeptTree(buildDeptTree(list ?? [])))
      .catch(() => setDeptTree([]))
  }, [])

  return {
    groups,
    // 停用的组仍列出来（要能筛历史数据），但加上后缀避免用户误选去排新班
    groupOptions: groups.map(g => ({
      value: g.id,
      label: g.status === ENABLE_STATUS.DISABLED
        ? t('attendance.groupDisabledSuffix', { name: g.groupName })
        : g.groupName,
    })),
    deptTree,
  }
}
