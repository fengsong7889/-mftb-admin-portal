import { describe, expect, it } from 'vitest'
import {
  HR_LIFECYCLE_MENU_KEY,
  HR_LIFECYCLE_TYPE,
  HR_LIFECYCLE_LIST_PATH,
  HR_LIFECYCLE_ROUTE,
  HR_LIFECYCLE_STATUS,
} from '../../../api/hrLifecycle'
import { EDITABLE_STATUSES, STATUS_TABS, STATUS_TAG_COLOR, TYPE_LABEL_KEY, buildDeptTree } from './meta'

/** 入转调离共享元数据：菜单/路由映射与状态机常量的自洽性（与后端 HrLifecycleConstants 同口径） */
describe('HR 入转调离 meta', () => {
  it('四类单据都有独立的授权菜单与列表路由', () => {
    const types = Object.values(HR_LIFECYCLE_TYPE)
    expect(new Set(types)).toEqual(new Set(['onboard', 'regular', 'transfer', 'dimission', 'renew']))
    for (const type of types) {
      expect(TYPE_LABEL_KEY[type]).toContain('hrLifecycle.')
      expect(HR_LIFECYCLE_MENU_KEY[type]).toBeTruthy()
      expect(STATUS_TAG_COLOR[HR_LIFECYCLE_STATUS.COMPLETED]).toBeTruthy()
    }
    // 四类入转调离单据各自独立菜单，且列表路由与菜单 key 同名
    for (const type of ['onboard', 'regular', 'transfer', 'dimission'] as const) {
      expect(HR_LIFECYCLE_MENU_KEY[type]).toMatch(/^hr-/)
      expect(HR_LIFECYCLE_LIST_PATH[type]).toBe(`/${HR_LIFECYCLE_MENU_KEY[type]}`)
    }
    // 续签复用合同台账菜单：回到台账列表，表单/详情走独立路由（与后端 TYPE_TO_MENU_KEY 一致）
    expect(HR_LIFECYCLE_MENU_KEY.renew).toBe('contract-ledger')
    expect(HR_LIFECYCLE_LIST_PATH.renew).toBe('/contract-ledger')
    expect(HR_LIFECYCLE_ROUTE.renew).toBe('/hr-contract-renew')
  })

  it('状态 Tab 覆盖全部可筛选状态且不重复', () => {
    const keys = STATUS_TABS.map(tab => tab.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('all')
    for (const status of Object.values(HR_LIFECYCLE_STATUS)) {
      expect(STATUS_TAG_COLOR[status]).toBeTruthy()
    }
  })

  it('可编辑状态与后端 requireEditable 一致（草稿/驳回/已撤销）', () => {
    expect([...EDITABLE_STATUSES].sort()).toEqual([
      HR_LIFECYCLE_STATUS.CANCELLED, HR_LIFECYCLE_STATUS.DRAFT, HR_LIFECYCLE_STATUS.REJECTED,
    ].sort())
    expect(EDITABLE_STATUSES).not.toContain(HR_LIFECYCLE_STATUS.PENDING)
    expect(EDITABLE_STATUSES).not.toContain(HR_LIFECYCLE_STATUS.COMPLETED)
  })

  it('buildDeptTree 按 parentId 组树并过滤停用部门', () => {
    const tree = buildDeptTree([
      { id: 1, name: '集團', parentId: null, status: 1 },
      { id: 2, name: '技術部', parentId: 1, status: 1 },
      { id: 3, name: '已停用部', parentId: 1, status: 0 },
      { id: 4, name: '孤兒部門', parentId: 99, status: 1 },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('集團')
    expect(tree[0].children?.map(c => c.title)).toEqual(['技術部'])
  })
})
