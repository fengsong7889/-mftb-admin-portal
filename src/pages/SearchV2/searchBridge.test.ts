import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock 整个 searchConfig API 模块（searchBridge 依赖其全部导出）
const api = vi.hoisted(() => ({
  fetchGuidance: vi.fn(), createGuidance: vi.fn(), updateGuidance: vi.fn(),
  fetchLexicon: vi.fn(), createLexicon: vi.fn(), updateLexicon: vi.fn(),
  fetchScenario: vi.fn(), createScenario: vi.fn(), updateScenario: vi.fn(),
  fetchIntervention: vi.fn(), createIntervention: vi.fn(), updateIntervention: vi.fn(),
  fetchRelease: vi.fn(), createRelease: vi.fn(),
  approveIntervention: vi.fn(), submitRelease: vi.fn(), approveRelease: vi.fn(),
}))
vi.mock('@/api/searchConfig', () => api)

import { advanceStatus, loadConfigPanes, saveConfigRecord, WIRED_PANES } from './searchBridge'
import { SEARCH_SCENES, STATUS, type RecordPane, type PrototypeRecord } from './prototypeData'

function rec(over: Partial<PrototypeRecord>): PrototypeRecord {
  return {
    id: 'x', pane: 'guidance', name: '午餐', channel: SEARCH_SCENES.DELIVERY, region: '全城',
    kind: 'placeholder', status: STATUS.DRAFT, values: {}, updatedAt: '', ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const f of [api.fetchGuidance, api.fetchLexicon, api.fetchScenario, api.fetchIntervention, api.fetchRelease]) f.mockResolvedValue([])
})

describe('searchBridge 审批分发 advanceStatus', () => {
  it('干预通过/驳回映射到 approveIntervention 的布尔参数', async () => {
    api.approveIntervention.mockResolvedValue(undefined)
    await expect(advanceStatus('interventions', '7', STATUS.APPROVED)).resolves.toBe(true)
    expect(api.approveIntervention).toHaveBeenCalledWith(7, true)
    await expect(advanceStatus('interventions', '7', STATUS.PAUSED)).resolves.toBe(true)
    expect(api.approveIntervention).toHaveBeenLastCalledWith(7, false)
  })

  it('发布送审/审批映射到各自端点', async () => {
    api.submitRelease.mockResolvedValue(undefined)
    api.approveRelease.mockResolvedValue(undefined)
    await expect(advanceStatus('releases', '3', STATUS.REVIEW)).resolves.toBe(true)
    expect(api.submitRelease).toHaveBeenCalledWith(3)
    await expect(advanceStatus('releases', '3', STATUS.APPROVED)).resolves.toBe(true)
    expect(api.approveRelease).toHaveBeenCalledWith(3)
  })

  it('非数字 id、未映射状态、端点异常均返回 false（回退本地演示）', async () => {
    await expect(advanceStatus('releases', 'DEMO-LOCAL-1', STATUS.REVIEW)).resolves.toBe(false)
    expect(api.submitRelease).not.toHaveBeenCalled()
    await expect(advanceStatus('releases', '3', STATUS.DRAFT)).resolves.toBe(false)
    api.approveRelease.mockRejectedValue(new Error('500'))
    await expect(advanceStatus('releases', '3', STATUS.APPROVED)).resolves.toBe(false)
  })
})

describe('searchBridge 加载降级 loadConfigPanes', () => {
  it('全部成功时 responded 覆盖五个已接域', async () => {
    const { responded, records } = await loadConfigPanes()
    expect(responded.sort()).toEqual([...WIRED_PANES].sort())
    expect(records).toEqual([])
  })

  it('某域请求失败则不纳入 responded，其余仍返回', async () => {
    api.fetchScenario.mockRejectedValue(new Error('offline'))
    const { responded } = await loadConfigPanes()
    expect(responded).not.toContain('scenarios')
    expect(responded).toContain('guidance')
  })

  it('后端返回的行被映射为 PrototypeRecord', async () => {
    api.fetchGuidance.mockResolvedValue([{ id: 1, wordType: 1, displayText: '午餐', targetQuery: '午餐', surface: 2, bizChannel: 1, approvalStatus: 1 }])
    const { records } = await loadConfigPanes()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ pane: 'guidance', id: '1', name: '午餐', kind: 'placeholder', status: STATUS.DRAFT })
  })
})

describe('searchBridge 保存映射 saveConfigRecord', () => {
  it('新建走 create，字段按枚举编码映射', async () => {
    api.createGuidance.mockResolvedValue(9)
    const id = await saveConfigRecord(rec({ values: { text: '午餐', target: '午', priority: 1, source: '人工策劃', start: '2026-11-01', end: '2026-11-07' } }), 'guidance')
    expect(id).toBe('9')
    expect(api.createGuidance).toHaveBeenCalledWith(expect.objectContaining({ wordType: 1, configName: '午餐', displayText: '午餐', targetQuery: '午', surface: 2, bizChannel: 1 }))
  })

  /** 方案 §11.1 定版：表单「名稱」为权威业务字段，五个域均必须随载荷下发到后端，不得静默丢弃。 */
  it('五个配置域保存时都把名称下发到各自的 *_name 字段', async () => {
    const cases: [RecordPane, string, string][] = [
      ['guidance', 'createGuidance', 'configName'],
      ['lexicon', 'createLexicon', 'entryName'],
      ['scenarios', 'createScenario', 'scenarioName'],
      ['interventions', 'createIntervention', 'ruleName'],
      ['releases', 'createRelease', 'releaseName'],
    ]
    for (const [pane, method, key] of cases) {
      vi.clearAllMocks()
      const spy = api[method as keyof typeof api] as ReturnType<typeof vi.fn>
      spy.mockResolvedValue(1)
      await saveConfigRecord(rec({ pane, name: '人類可讀名稱', values: pane === 'releases' ? { version: 'V9', changes: 'x', rollback: 'V8' } : {} }), pane)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ [key]: '人類可讀名稱' }))
    }
  })

  /** 存量行名称列为 NULL（补列前写入）：读取必须回退到业务字段组合，不得显示空白。 */
  it('后端行有名称那么用名称，无名称那么回退为业务字段组合', async () => {
    api.fetchLexicon.mockResolvedValue([
      { id: 11, entryName: '英文同義詞對', wordType: 3, sourceTerm: 'burger', targetTerm: '漢堡', status: 1 },
      { id: 12, wordType: 3, sourceTerm: '奶茶', targetTerm: '鮮奶茶', status: 1 },
    ])
    const { records } = await loadConfigPanes()
    const named = records.find(r => r.id === '11')
    const legacy = records.find(r => r.id === '12')
    expect(named?.name).toBe('英文同義詞對')
    expect(legacy?.name).toBe('奶茶 → 鮮奶茶')
  })

  it('更新（数字 id）走 update，不重复 create', async () => {
    api.updateLexicon.mockResolvedValue(undefined)
    const id = await saveConfigRecord(rec({ pane: 'lexicon', kind: 'directionSynonym', values: { source: '漢堡', target: 'burger' } }), 'lexicon', '5')
    expect(id).toBe('5')
    expect(api.updateLexicon).toHaveBeenCalledWith(5, expect.objectContaining({ wordType: 3, sourceTerm: '漢堡', targetTerm: 'burger' }))
    expect(api.createLexicon).not.toHaveBeenCalled()
  })

  it('精確準入/打散强制乘数为 1（无商业加权）', async () => {
    api.createIntervention.mockResolvedValue(2)
    await saveConfigRecord(rec({ pane: 'interventions', kind: 'exactAdmit', values: { merchant: '示例集團', terms: '星港', factor: 0.9, reason: '精確保護' } }), 'interventions')
    expect(api.createIntervention).toHaveBeenCalledWith(expect.objectContaining({ actionType: 2, multiplier: 1 }))
  })

  it('发布仅新建草稿', async () => {
    api.createRelease.mockResolvedValue(4)
    const id = await saveConfigRecord(rec({ pane: 'releases', name: 'V1', values: { version: 'DEMO-1.0', changes: '基準', rollback: 'DEMO-0.9' } }), 'releases')
    expect(id).toBe('4')
    expect(api.createRelease).toHaveBeenCalledWith({ versionNo: 'DEMO-1.0', releaseName: 'V1', changeSummary: '基準', rollbackVersion: 'DEMO-0.9' })
  })
})
