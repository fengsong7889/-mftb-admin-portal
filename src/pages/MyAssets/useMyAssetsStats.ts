/**
 * 「我的资产」统计取数 Hook（领用 / 借用 / 耗材三个页签共用）。
 *
 * 为什么需要它：统计与列表是两个接口，如果统计只在挂载时取一次，用户在本页签详情里
 * 签完字、或在别处办完归还再回来时，列表已经重新拉取而卡片还停在旧数字——现场就是
 * 「在用資產显示 1，点进在用頁簽却有 2 条」。因此统计必须与列表同刻重取：
 *  - refreshKey 变化（切页签、进出详情）→ 重取；
 *  - 窗口重新聚焦 / 标签页切回可见 → 重取（覆盖外部操作）。
 *
 * 失败静默降级为 undefined，交给卡片显示「—」——不能显示 0，那会被读成"确实没有"。
 * 请求用票据防迟到响应：前一次请求晚回时不得覆盖后一次的结果。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useMyAssetsStats<T>(fetcher: () => Promise<T>, refreshKey = ''): T | undefined {
  const [stats, setStats] = useState<T>()
  const ticket = useRef(0)

  const load = useCallback(() => {
    const current = ++ticket.current
    fetcher()
      .then((result) => { if (current === ticket.current) setStats(result) })
      .catch(() => { if (current === ticket.current) setStats(undefined) })
  }, [fetcher])

  useEffect(() => { load() }, [load, refreshKey])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return stats
}

export default useMyAssetsStats
