import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { isCanceledError, isRetryableReadError, readWithRetry, useRequestGate } from './useRequestGate'

/** 构造带 HTTP 状态的 axios 错误（无 response 表示没拿到业务响应） */
function httpError(status?: number) {
  const response = status == null
    ? undefined
    : ({ status, data: { code: status }, statusText: '', headers: {}, config: {} } as AxiosResponse)
  return new AxiosError('failed', status == null ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

describe('useRequestGate（只认最新一次请求）', () => {
  it('后发请求会让先发请求的票据失效并被取消', () => {
    const { result } = renderHook(() => useRequestGate())
    const first = result.current.next()
    const second = result.current.next()

    expect(first.isLatest()).toBe(false)
    expect(first.signal.aborted).toBe(true)
    expect(second.isLatest()).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('卸载会取消在途请求，迟到结果不再是最新', () => {
    const { result, unmount } = renderHook(() => useRequestGate())
    const ticket = result.current.next()
    unmount()

    expect(ticket.signal.aborted).toBe(true)
    expect(ticket.isLatest()).toBe(false)
  })

  it('cancel 后不再有新票据可用旧结果', () => {
    const { result } = renderHook(() => useRequestGate())
    const ticket = result.current.next()
    result.current.cancel()

    expect(ticket.signal.aborted).toBe(true)
    expect(ticket.isLatest()).toBe(false)
  })
})

describe('取消与重试判读', () => {
  it('取消错误不当成业务失败', () => {
    const canceled = new AxiosError('canceled', 'ERR_CANCELED')
    expect(isCanceledError(canceled)).toBe(true)
    expect(isRetryableReadError(canceled)).toBe(false)
  })

  it('传输故障与 502/503/504 可重试，业务 4xx/500 不重试', () => {
    expect(isRetryableReadError(httpError())).toBe(true)
    expect(isRetryableReadError(httpError(502))).toBe(true)
    expect(isRetryableReadError(httpError(503))).toBe(true)
    expect(isRetryableReadError(httpError(504))).toBe(true)
    expect(isRetryableReadError(httpError(400))).toBe(false)
    expect(isRetryableReadError(httpError(401))).toBe(false)
    expect(isRetryableReadError(httpError(403))).toBe(false)
    expect(isRetryableReadError(httpError(500))).toBe(false)
  })

  it('只重试一次：两次都失败时向上抛出第二次错误', async () => {
    const read = vi.fn().mockRejectedValue(httpError(503))
    const controller = new AbortController()

    await expect(readWithRetry(read, controller.signal)).rejects.toBeInstanceOf(AxiosError)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('第一次失败、第二次成功时返回第二次结果', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(httpError())
      .mockResolvedValueOnce({ ok: true })
    const controller = new AbortController()

    await expect(readWithRetry(read, controller.signal)).resolves.toEqual({ ok: true })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('业务失败不重试', async () => {
    const read = vi.fn().mockRejectedValue(httpError(500))
    const controller = new AbortController()

    await expect(readWithRetry(read, controller.signal)).rejects.toBeInstanceOf(AxiosError)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('已取消时不再发起重试', async () => {
    const controller = new AbortController()
    const read = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.reject(httpError(503))
    })

    await expect(readWithRetry(read, controller.signal)).rejects.toBeInstanceOf(AxiosError)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
