import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 丢弃过期响应；失败清空旧数据，避免筛选条件与展示结果不一致。 */
export function useTransferData<T>(fetcher: () => Promise<T>) {
  const { t } = useTranslation()
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    setData(undefined)
    fetcher().then(result => { if (active) setData(result) }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : t('transfer.loadError'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetcher, revision, t])
  return { data, loading, error, refresh }
}
