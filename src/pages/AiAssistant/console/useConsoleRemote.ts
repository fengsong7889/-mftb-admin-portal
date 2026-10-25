import { useCallback, useEffect, useState } from 'react'

/**
 * 面板级数据加载：进入某个 pane 才请求，失败只影响本面板。
 *
 * <p>不提供“静默回退到示例数据”：接口失败必须让用户看见，
 * 否则会把示例当成生产数据（真实裁决仍在后端）。
 */
export function useConsoleRemote<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then(result => { if (!cancelled) setData(result) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '接口調用失敗')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => reload(), [reload])

  return { data, loading, error, reload }
}
