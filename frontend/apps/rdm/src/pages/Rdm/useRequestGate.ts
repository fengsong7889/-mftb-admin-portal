/**
 * RDM 读取请求的「最新一次生效」与取消/重试策略。
 *
 * 为什么需要：列表页会因查询条件、视角、刷新、路由返回连续发多次请求，
 * 网络乱序时先发的旧响应可能后到，把用户刚切到的条件覆盖成旧结果；
 * 页面卸载后迟到的响应还会写入已不存在的组件。仅凭 catch 里“再试一次”
 * 无法区分取消与真失败，反而会把正常返回渲染成「載入失敗」。
 *
 * 策略：
 * - 同一数据域只允许最新一次请求写入（序号 + AbortController）；
 * - 卸载或发起新请求时取消旧请求；
 * - 取消不报错、不重试；
 * - 只对幂等 GET 的传输故障与 502/503/504 重试一次，401/403/业务 4xx/500 不重试。
 */
import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface RequestTicket {
  signal: AbortSignal
  /** 本次请求是否仍是最新的一次（旧请求的 success/catch/finally 都必须丢弃） */
  isLatest: () => boolean
}

export interface RequestGate {
  /** 开一次新请求：取消上一轮，返回本轮票据 */
  next: () => RequestTicket
  /** 取消当前请求（不触发失败提示） */
  cancel: () => void
}

export function useRequestGate(): RequestGate {
  const seq = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => {
    // 卸载时让序号失效并取消在途请求，避免迟到响应写回已卸载页面
    seq.current += 1
    controller.current?.abort()
    controller.current = null
  }, [])

  return useMemo<RequestGate>(() => ({
    next: () => {
      controller.current?.abort()
      const ctrl = new AbortController()
      controller.current = ctrl
      const mine = ++seq.current
      return {
        signal: ctrl.signal,
        isLatest: () => mine === seq.current && !ctrl.signal.aborted,
      }
    },
    cancel: () => {
      seq.current += 1
      controller.current?.abort()
      controller.current = null
    },
  }), [])
}

/** 请求被取消（主动切换条件/卸载），不是产品失败 */
export function isCanceledError(err: unknown): boolean {
  if (axios.isCancel(err)) return true
  const code = (err as { code?: string } | null)?.code
  return code === 'ERR_CANCELED'
}

/**
 * 是否值得对一次 GET 自动重试。
 * <p>只有“请求根本没拿到业务响应”的传输故障，以及网关级 502/503/504 重试；
 * 业务 4xx、400（参数错）、500（服务端逻辑异常）重试只会重复失败并拖慢提示。
 */
export function isRetryableReadError(err: unknown): boolean {
  if (isCanceledError(err)) return false
  if (!axios.isAxiosError(err)) return false
  if (!err.response) return true
  return [502, 503, 504].includes(err.response.status)
}

/** 可被取消的读取函数 */
export type SignalRead<T> = (signal: AbortSignal) => Promise<T>

/**
 * 执行一次读取，失败时按策略最多重试一次（300ms 退避）。
 * <p>每次重试前重新检查取消，取消后不再发起第二次请求。
 */
export async function readWithRetry<T>(read: SignalRead<T>, signal: AbortSignal): Promise<T> {
  try {
    return await read(signal)
  } catch (err) {
    if (signal.aborted || !isRetryableReadError(err)) throw err
    await new Promise(resolve => setTimeout(resolve, 300))
    if (signal.aborted) throw err
    return read(signal)
  }
}

/**
 * 页面内常用的“取数 + 只认最新”包装。
 * <p>返回 undefined 表示本次结果已过期或被取消，调用方应直接 return，不写任何状态。
 */
export function useLatestRead(): <T>(read: SignalRead<T>) => Promise<{ value: T } | null> {
  const gate = useRequestGate()
  return useCallback(async <T,>(read: SignalRead<T>) => {
    const ticket = gate.next()
    try {
      const value = await readWithRetry(read, ticket.signal)
      if (!ticket.isLatest()) return null
      return { value }
    } catch (err) {
      if (!ticket.isLatest() || isCanceledError(err)) return null
      throw err
    }
  }, [gate])
}
