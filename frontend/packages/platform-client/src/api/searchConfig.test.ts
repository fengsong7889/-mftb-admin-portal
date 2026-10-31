import { beforeEach, describe, expect, it, vi } from 'vitest'

const unavailable = vi.fn((_err: unknown) => false)
vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  SILENT_HEADER: 'X-Request-Silent',
  isBackendUnavailable: (err: unknown) => unavailable(err),
}))

import request from './request'
import {
  fetchGuidance, createGuidance, updateGuidance,
  createScenario,
  approveIntervention, submitRelease, approveRelease,
  type SearchGuidanceItem, type SearchScenarioItem,
} from './searchConfig'

beforeEach(() => { vi.clearAllMocks(); unavailable.mockReturnValue(false) })

describe('搜索配置前端 API 契约', () => {
  it('fetchGuidance 走静默头请求 /search/guidance', async () => {
    const rows: SearchGuidanceItem[] = [{ wordType: 1, displayText: '午餐', targetQuery: '午餐', surface: 2 }]
    vi.mocked(request.get).mockResolvedValueOnce(rows)
    await expect(fetchGuidance()).resolves.toEqual(rows)
    expect(request.get).toHaveBeenCalledWith('/search/guidance', expect.objectContaining({
      headers: { 'X-Request-Silent': '1' },
    }))
  })

  it('后端不可用时读操作降级为空数组，不抛错', async () => {
    unavailable.mockReturnValue(true)
    vi.mocked(request.get).mockRejectedValueOnce(new Error('network'))
    await expect(fetchGuidance()).resolves.toEqual([])
  })

  it('后端业务错误（非不可用）仍抛出，不静默吞掉', async () => {
    unavailable.mockReturnValue(false)
    vi.mocked(request.get).mockRejectedValueOnce(new Error('403'))
    await expect(fetchGuidance()).rejects.toThrow('403')
  })

  it('createGuidance/updateGuidance 命中正确路径与方法', async () => {
    vi.mocked(request.post).mockResolvedValueOnce(42)
    const payload: SearchGuidanceItem = { wordType: 2, displayText: '紙巾', targetQuery: '紙巾', surface: 2, bizChannel: 2 }
    await expect(createGuidance(payload)).resolves.toBe(42)
    expect(request.post).toHaveBeenCalledWith('/search/guidance', payload)
    await updateGuidance(42, payload)
    expect(request.put).toHaveBeenCalledWith('/search/guidance/42', payload)
  })

  it('createScenario 提交权重与广告上限', async () => {
    vi.mocked(request.post).mockResolvedValueOnce(7)
    const s: SearchScenarioItem = { surface: 2, weightRelevance: 65, weightQuality: 15, weightDistance: 15, weightHeat: 5, adLimitPerPage: 4 }
    await expect(createScenario(s)).resolves.toBe(7)
    expect(request.post).toHaveBeenCalledWith('/search/scenario', s)
  })

  it('approveIntervention 走独立审批端点并带 approved 体', async () => {
    vi.mocked(request.post).mockResolvedValueOnce(undefined)
    await approveIntervention(9, true)
    expect(request.post).toHaveBeenCalledWith('/search/intervention/9/approve', { approved: true })
  })

  it('发布提交与审批命中各自状态端点', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined)
    await submitRelease(3)
    expect(request.post).toHaveBeenCalledWith('/search/release/3/submit', {})
    await approveRelease(3)
    expect(request.post).toHaveBeenCalledWith('/search/release/3/approve', {})
  })
})
