import { describe, expect, it } from 'vitest'
import { CONSOLE_PANES, DEMO_ACTIONS, DEMO_APPS, DEMO_POOLS, readinessOf, usageRate } from './consoleModel'

describe('企業 Agent 控制台樣板資料', () => {
  it('頁籤順序覆蓋方案要求的八個控制面', () => {
    expect(CONSOLE_PANES.map(pane => pane.key)).toEqual([
      'overview', 'apps', 'budget', 'actions', 'knowledge', 'data', 'runs', 'evaluation',
    ])
    expect(CONSOLE_PANES.every(pane => pane.menuKey.startsWith('agent-'))).toBe(true)
  })

  it('使用率把預占與已用合併計算，並夾在 0~100', () => {
    expect(usageRate({ limit: 100, reserved: 20, used: 30 })).toBe(50)
    expect(usageRate({ limit: 100, reserved: 80, used: 80 })).toBe(100)
    expect(usageRate({ limit: 0, reserved: 0, used: 0 })).toBe(100)
  })

  it('未配置預算池上限時視為不可用，而不是顯示安全', () => {
    expect(usageRate({ limit: 0, reserved: 0, used: 10 })).toBe(100)
  })

  it('就緒判斷按固定順序列出阻斷項', () => {
    const result = readinessOf({ dataClasses: 0, approvedEndpoints: 0, acls: 0, publishedApps: 0 })
    expect(result.readyForModelCalls).toBe(false)
    expect(result.readyForKnowledgeSearch).toBe(false)
    expect(result.blocking).toEqual([
      'data_class_missing', 'endpoint_not_approved', 'knowledge_acl_missing', 'application_not_published',
    ])
  })

  it('分級與端點都具備才算可調用模型', () => {
    expect(readinessOf({ dataClasses: 1, approvedEndpoints: 0, acls: 0, publishedApps: 0 }).readyForModelCalls).toBe(false)
    expect(readinessOf({ dataClasses: 1, approvedEndpoints: 1, acls: 0, publishedApps: 0 }).readyForModelCalls).toBe(true)
  })

  it('樣板資料自身是自洽的：已發布應用才有工具白名單', () => {
    DEMO_APPS.forEach(app => {
      if (app.state === 'draft') expect(app.tools).toHaveLength(0)
      if (app.state === 'published') expect(app.publishedVersion).toBeGreaterThan(0)
    })
    DEMO_ACTIONS.forEach(action => {
      if (action.status !== 'pending') expect(action.approvalRef).toBeTruthy()
    })
    DEMO_POOLS.forEach(pool => expect(pool.limit).toBeGreaterThanOrEqual(0))
  })
})
