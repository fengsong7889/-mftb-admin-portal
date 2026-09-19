import { useCallback, useEffect, useState } from 'react'

/** 配置列表读取失败时清空旧数据，取消过期请求，避免筛选与快速切换页签的竞态。 */
export function useNotificationList<T>(fetchList: (signal: AbortSignal) => Promise<T[]>) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    fetchList(controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result)
    }).catch(() => {
      if (!controller.signal.aborted) { setData([]); setFailed(true) }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [fetchList, revision])
  return { data, loading, failed, reload }
}
