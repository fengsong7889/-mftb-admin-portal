import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 面板级数据加载：进入某个 pane 才请求，失败只影响本面板。
 *
 * <p>不提供“静默回退到示例数据”：接口失败必须让用户看见，
 * 否则会把示例当成生产数据（真实裁决仍在后端）。
 *
 * <p>关于 StrictMode：开发态 React 18 会把 mount effect 双调用一次
 * （setup → cleanup → setup），同一面板实例因此发出两个相同的 GET。
 * 这里用 deps 签名记住“本实例已自动拉取过什么”，跳过重复的那一次 setup。
 *
 * <p>⚠️ 不能用 effect cleanup 做取消：被跳过的那次 setup 没有返回新的清理函数，
 * 而第一次 setup 返回的 cleanup 仍会被 React 执行——一旦把“取消”绑在 cleanup 上，
 * 唯一那次真实请求的结果就会被 cancelled 标记吞掉，表现为 loading 永久为真、
 * 数据永远为空（本仓库 2026-10-29 实测踩过）。因此改为“最新请求胜出”语义：
 * 每次发起分配一个递增序号，回包时只有仍是最新、且组件仍挂载的那一次才落状态。
 */
export function useConsoleRemote<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0)
  const mountedRef = useRef(true)
  const autoFetchedRef = useRef<string | null>(null)

  // 必须声明在取数 effect 之前：挂载时先置真，卸载时置假，
  // 这样 StrictMode 的 setup→cleanup→setup 之后最终仍是「已挂载」。
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const reload = useCallback(() => {
    const seq = ++seqRef.current
    setLoading(true)
    setError(null)
    const isCurrent = () => mountedRef.current && seq === seqRef.current
    loader()
      .then(result => { if (isCurrent()) setData(result) })
      .catch((cause: unknown) => {
        if (isCurrent()) setError(cause instanceof Error ? cause.message : '接口調用失敗')
      })
      .finally(() => { if (isCurrent()) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const signature = JSON.stringify(deps)
    if (autoFetchedRef.current === signature) return
    autoFetchedRef.current = signature
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  return { data, loading, error, reload }
}
