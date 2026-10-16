/**
 * 個人工作台布局层测试：身份推导 + 推荐布局 + 个人布局合并
 *
 * 钉死三条容易在后续改动里破掉的规则：
 *  1. 身份只由「菜单权限 / 后端角色标签 / 实际待办」推导，不能凭空多出一个身份；
 *  2. 没有权限的区块既不进推荐，也不进可勾选清单（不扩权）；
 *  3. 用户手动关掉的区块，不会被「推荐补齐」重新放出来；关掉后可以再打开并持久化。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  deriveRdmIdentities,
  recommendedLayout,
  useRdmWorkbenchLayout,
  type RdmAccessProbe,
} from './workbenchLayout'

const EMP_ID = 'MF0001'
const STORAGE_KEY = `rdm-workbench-layout:v1:${EMP_ID}`

/** 造一个只认给定菜单/动作的权限探针（与 AuthContext 的判定口径一致，但不受控菜单概念在此不需要） */
function probe(menus: string[], actions: string[] = []): RdmAccessProbe {
  return {
    hasMenuPermission: (menuKey: string) => menus.includes(menuKey),
    hasPermission: (permission: string) => actions.includes(permission),
  }
}

function renderLayout(menus: string[], actions: string[] = [], roleNames: string[] = [], hasApprovalTodo = false) {
  const access = probe(menus, actions)
  const identities = deriveRdmIdentities({ roleNames, access, hasApprovalTodo })
  return renderHook(() => useRdmWorkbenchLayout({ empId: EMP_ID, identities, access })).result
}

beforeEach(() => {
  localStorage.clear()
})

describe('deriveRdmIdentities', () => {
  it('研发/测试/发布菜单分别推出对应身份，并按执行角色优先排序', () => {
    const identities = deriveRdmIdentities({
      access: probe(['rdm-workbench', 'rdm-delivery-release', 'rdm-delivery-test', 'rdm-delivery-board']),
    })
    expect(identities).toEqual(['developer', 'tester', 'releaser', 'submitter'])
  })

  it('后端角色标签补齐产品/验收/项目负责人身份', () => {
    const identities = deriveRdmIdentities({
      roleNames: ['需求提出人', '產品經理', '業務驗收人'],
      access: probe(['rdm-workbench']),
    })
    expect(identities).toEqual(['acceptor', 'product', 'submitter'])
  })

  it('分配权新旧锚点任一命中即认技术负责人（view_all 不推导分配权）', () => {
    expect(deriveRdmIdentities({ access: probe([], ['rdm-intake:edit']) })).toContain('dispatcher')
    expect(deriveRdmIdentities({ access: probe([], ['rdm-requirement:dispatch']) })).toContain('dispatcher')
    // 全量可见是「看得见」，不等于「能分配」
    expect(deriveRdmIdentities({ access: probe([], ['rdm-requirement:view_all']) })).not.toContain('dispatcher')
  })

  it('审批人只在真的有审批待办时出现', () => {
    expect(deriveRdmIdentities({ access: probe(['rdm-intake-approval']), hasApprovalTodo: false })).not.toContain('approver')
    expect(deriveRdmIdentities({ access: probe(['rdm-intake-approval']), hasApprovalTodo: true })).toContain('approver')
  })
})

describe('recommendedLayout', () => {
  it('研发主模板排第一，业务方的提交追踪不在研发推荐里', () => {
    const keys = recommendedLayout(['developer', 'submitter'])
    expect(keys[0]).toBe('dev-tasks')
    expect(keys).toContain('my-tracking')
  })

  it('单身份研发不应被业务方专属区块占屏', () => {
    const keys = recommendedLayout(['developer'])
    expect(keys).not.toContain('my-tracking')
    expect(keys).not.toContain('activity')
  })

  it('多身份者的工作对象一次拿全：研发 + 验收人同时有任务与发布批次', () => {
    const keys = recommendedLayout(['developer', 'acceptor'])
    expect(keys.indexOf('dev-tasks')).toBeLessThan(keys.indexOf('release-batches'))
    expect(keys).toContain('release-batches')
  })
})

describe('useRdmWorkbenchLayout', () => {
  it('无权限的区块既不渲染也不可勾选', () => {
    const result = renderLayout(['rdm-workbench'])
    expect(result.current.visibleKeys).not.toContain('dev-tasks')
    expect(result.current.candidates.map(meta => meta.key)).not.toContain('dev-tasks')
  })

  it('手动关掉某区块后写盘，且不会被推荐逻辑重新放出来', () => {
    const result = renderLayout(['rdm-workbench', 'rdm-delivery-board'])
    expect(result.current.visibleKeys).toContain('dev-tasks')

    act(() => result.current.toggle('dev-tasks', false))
    expect(result.current.visibleKeys).not.toContain('dev-tasks')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ dismissed: ['dev-tasks'] })

    // 重新挂载（模拟刷新）：仍是关掉的，不会因为研发模板推荐 dev-tasks 就自己开回来
    const reloaded = renderLayout(['rdm-workbench', 'rdm-delivery-board'])
    expect(reloaded.current.visibleKeys).not.toContain('dev-tasks')
    expect(reloaded.current.customized).toBe(true)
  })

  it('关掉的区块可以重新打开，并出现在候选清单里', () => {
    const result = renderLayout(['rdm-workbench', 'rdm-delivery-test'])
    act(() => result.current.toggle('issues', false))
    expect(result.current.visibleKeys).not.toContain('issues')
    act(() => result.current.toggle('issues', true))
    expect(result.current.visibleKeys).toContain('issues')
  })

  it('排序只在可见区块之间生效', () => {
    const result = renderLayout(['rdm-workbench', 'rdm-delivery-board'])
    const before = [...result.current.visibleKeys]
    act(() => result.current.move(before[1], -1))
    expect(result.current.visibleKeys[0]).toBe(before[1])
    // 第一项已经到头，再上移不应该变化
    act(() => result.current.move(result.current.visibleKeys[0], -1))
    expect(result.current.visibleKeys[0]).toBe(before[1])
  })

  it('恢复推荐布局会清掉本地存储', () => {
    const result = renderLayout(['rdm-workbench', 'rdm-delivery-board'])
    act(() => result.current.toggle('dev-tasks', false))
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    act(() => result.current.reset())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.visibleKeys).toContain('dev-tasks')
    expect(result.current.customized).toBe(false)
  })

  it('旧版本残留的未知 key 被丢弃，不会渲染成空白区块', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1,
      order: ['legacy-section', 'metrics', 'my-tracking'],
      dismissed: [],
    }))
    const result = renderLayout(['rdm-workbench', 'rdm-delivery-board'])
    expect(result.current.visibleKeys).not.toContain('legacy-section')
    expect(result.current.visibleKeys).toContain('metrics')
  })
})
