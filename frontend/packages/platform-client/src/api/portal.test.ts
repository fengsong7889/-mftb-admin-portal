import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPortalContext, type PortalContext } from './portal'
import request from './request'

vi.mock('./request', () => ({
  default: { get: vi.fn() },
  SILENT_HEADER: 'X-Silent-Error',
}))

const payload: PortalContext = { systems: [{ code: 'ai', name: 'AI 智能中心' }], superAdmin: false }

/** 让内部 `.catch().finally()` 链有机会跑完，模拟真实事件循环而非同一微任务批次。 */
const flush = () => new Promise(resolve => { setTimeout(resolve, 0) })

describe('portal.fetchPortalContext 在途去重', () => {
  beforeEach(() => {
    vi.mocked(request.get).mockReset()
  })

  it('并发调用只发一次请求，并把同一结果分发给所有调用方', async () => {
    let resolve!: (value: PortalContext) => void
    vi.mocked(request.get).mockReturnValue(new Promise(r => { resolve = r }))

    const calls = [fetchPortalContext(), fetchPortalContext(), fetchPortalContext()]

    expect(request.get).toHaveBeenCalledTimes(1)
    resolve(payload)
    await expect(Promise.all(calls)).resolves.toEqual([payload, payload, payload])
  })

  it('前一次落地后的新调用必须重新拉取：不做 TTL 缓存，避免已撤销系统变成幽灵入口', async () => {
    vi.mocked(request.get).mockResolvedValue(payload)

    await fetchPortalContext()
    await flush()
    await fetchPortalContext()

    expect(request.get).toHaveBeenCalledTimes(2)
  })

  it('失败也释放在途槽位，不让后续调用永久复用已失败的 Promise', async () => {
    vi.mocked(request.get)
      .mockRejectedValueOnce(new Error('timeout of 15000ms exceeded'))
      .mockResolvedValue(payload)

    await expect(fetchPortalContext()).rejects.toThrow('timeout')
    await flush()

    await expect(fetchPortalContext()).resolves.toBe(payload)
    expect(request.get).toHaveBeenCalledTimes(2)
  })
})
