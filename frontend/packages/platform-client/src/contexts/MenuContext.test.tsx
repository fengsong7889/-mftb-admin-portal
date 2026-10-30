import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, CanceledError } from 'axios'
import { MenuProvider, useMenu } from './MenuContext'
import { fetchMyMenuTree } from '@/api/menu'
import type { MenuVO } from '@/api/menu'

const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 1 } as { id: number } | null }))
vi.mock('./AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/api/menu', () => ({ fetchMyMenuTree: vi.fn() }))

beforeEach(() => {
  vi.mocked(fetchMyMenuTree).mockReset().mockResolvedValue([])
  auth.isAuthenticated = true
  auth.user = { id: 1 }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function timeoutError() {
  return new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED')
}

const savedTree: MenuVO[] = [{ id: 1, menuKey: 'private', name: '已授權菜單' } as MenuVO]

describe('菜单连接失败分级与恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  async function mountOnline() {
    vi.mocked(fetchMyMenuTree).mockResolvedValueOnce(savedTree)
    const hook = renderHook(useMenu, { wrapper: MenuProvider })
    await act(async () => {})
    expect(hook.result.current.status).toBe('online')
    return hook
  }

  it('一次超时保留导航，三秒后重试成功自动恢复', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(timeoutError())
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'degraded', issue: 'timeout', menuTree: savedTree })
    expect(result.current.refreshing).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(result.current).toMatchObject({ status: 'online', issue: null, menuTree: [] })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(3)
  })

  it('首次加载失败不伪造导航，连续三次失败才阻断，随后低频恢复', async () => {
    vi.mocked(fetchMyMenuTree).mockRejectedValue(timeoutError())
    const { result } = renderHook(useMenu, { wrapper: MenuProvider })
    await act(async () => {})
    expect(result.current).toMatchObject({ status: 'degraded', menuTree: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(result.current.status).toBe('degraded')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(result.current).toMatchObject({ status: 'offline', issue: 'timeout', menuTree: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(3)
    vi.mocked(fetchMyMenuTree).mockResolvedValue(savedTree)
    await act(async () => { await vi.advanceTimersByTimeAsync(21_000) })
    expect(result.current).toMatchObject({ status: 'online', issue: null, menuTree: savedTree })
  })

  it('恢复成功清零失败计数，下次抖动仍保留导航', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(timeoutError())
    await act(async () => { await result.current.refresh() })
    await act(async () => { await result.current.refresh() })
    vi.mocked(fetchMyMenuTree).mockResolvedValueOnce(savedTree)
    await act(async () => { await result.current.refresh() })
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(timeoutError())
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'degraded', menuTree: savedTree })
  })

  it.each([401, 403, 404])('%s 立即清理旧菜单，不按网络故障重试', async status => {
    const { result } = await mountOnline()
    const error = new AxiosError('拒绝请求', undefined, undefined, undefined, {
      status, statusText: '', headers: {}, config: { headers: {} }, data: null,
    } as NonNullable<AxiosError['response']>)
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(error)
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'error', issue: null, menuTree: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(2)
  })

  it('业务错误也立即清理菜单，不借保留导航放宽校验', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(new Error('无权限'))
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'error', menuTree: null })
  })

  it.each([500, 502, 503])('HTTP %s 标注服务响应异常，不冒充本机断网', async status => {
    const { result } = await mountOnline()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(Object.assign(new AxiosError('server error'), { response: { status } }))
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'degraded', issue: 'server', menuTree: savedTree })
  })

  it('网络中断有独立原因，online 事件立即重试而非等待轮询', async () => {
    const { result } = await mountOnline()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toMatchObject({ status: 'degraded', issue: 'network', menuTree: savedTree })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toMatchObject({ status: 'online', issue: null })
  })

  it('浏览器报告断网但 localhost 仍可达时，以成功响应为准', async () => {
    const { result } = await mountOnline()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toMatchObject({ status: 'online', issue: null })
  })

  it('无 HTTP 响应且未报告断网时，只标记暂时无法连接', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.issue).toBe('unreachable')
  })

  it('取消请求不计为连接失败', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(new CanceledError())
    await act(async () => { await result.current.refresh() })
    expect(result.current).toMatchObject({ status: 'online', issue: null, menuTree: savedTree })
  })

  it('聚焦、可见性与手动刷新合并在途请求，不反复取消', async () => {
    const { result } = await mountOnline()
    let resolve!: (tree: MenuVO[]) => void
    vi.mocked(fetchMyMenuTree).mockReturnValueOnce(new Promise(r => { resolve = r }))
    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.refresh()
      second = result.current.refresh()
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(first).toBe(second)
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetchMyMenuTree).mock.calls[1][0]?.aborted).toBe(false)
    expect(result.current.refreshing).toBe(true)
    await act(async () => { resolve(savedTree); await first })
    expect(result.current.refreshing).toBe(false)
  })

  it('焦点抖动成串时只拉一次菜单树，不超过最小间隔反复补拉', async () => {
    const { result } = await mountOnline()
    const before = vi.mocked(fetchMyMenuTree).mock.calls.length
    // 每 500ms 一轮 focus + visibilitychange，共 6 轮（3 秒）。请求串行返回，
    // inFlightRef 合并不了，只有真正的限流能挡住；未限流时会打 12 次。
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(500)
      })
    }
    // 3 秒总跨度远小于 10s 最小间隔：首个事件可以补一次，后续必须全部合并。
    expect(vi.mocked(fetchMyMenuTree).mock.calls.length - before).toBeLessThanOrEqual(1)
    expect(result.current.status).toBe('online')
  })

  it('同步抛错也释放在途状态，允许下一次重试', async () => {
    const { result } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockImplementationOnce(() => { throw new Error('请求初始化失败') })
    await act(async () => { await result.current.refresh() })
    expect(result.current.status).toBe('error')
    await act(async () => { await result.current.refresh() })
    expect(result.current.status).toBe('online')
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(3)
  })

  it('隐藏页面不轮询，切回后主动恢复', async () => {
    await mountOnline()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(2)
  })

  it('登出清理保留导航并取消待执行的重试', async () => {
    const { result, rerender } = await mountOnline()
    vi.mocked(fetchMyMenuTree).mockRejectedValueOnce(timeoutError())
    await act(async () => { await result.current.refresh() })
    auth.isAuthenticated = false
    auth.user = null
    rerender()
    expect(result.current.menuTree).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMyMenuTree).toHaveBeenCalledTimes(2)
  })
})

describe('用户导航数据边界', () => {
  it('已授权空树保留为空，不冒充菜单服务不可用', async () => {
    const { result } = renderHook(useMenu, { wrapper: MenuProvider })
    await waitFor(() => expect(result.current.status).toBe('online'))
    expect(result.current.menuTree).toEqual([])
    expect(fetchMyMenuTree).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('登出使旧请求取消，迟到响应不恢复旧菜单', async () => {
    let resolve!: (tree: MenuVO[]) => void
    vi.mocked(fetchMyMenuTree).mockReturnValue(new Promise(r => { resolve = r }))
    const { result, rerender } = renderHook(useMenu, { wrapper: MenuProvider })
    const signal = vi.mocked(fetchMyMenuTree).mock.calls[0][0]
    auth.isAuthenticated = false
    auth.user = null
    rerender()
    expect(signal?.aborted).toBe(true)
    await act(async () => { resolve([{ menuKey: 'private' } as MenuVO]) })
    expect(result.current.menuTree).toBeNull()
  })

  it('账号切换重新取数，拒绝把前一账号菜单展示为新账号结果', async () => {
    let resolve!: (tree: MenuVO[]) => void
    vi.mocked(fetchMyMenuTree).mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result, rerender } = renderHook(useMenu, { wrapper: MenuProvider })
    auth.user = { id: 2 }
    rerender()
    await waitFor(() => expect(result.current.status).toBe('online'))
    await act(async () => { resolve([{ menuKey: 'old-user' } as MenuVO]) })
    expect(result.current.menuTree).toEqual([])
  })
})
