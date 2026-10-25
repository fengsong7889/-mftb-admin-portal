import { useEffect, useState } from 'react'

/** 数据仅驻留当前页面；切换文档或查询时立即隐藏旧结果，丢弃晚到响应。 */
export function useDocNativeLoad<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ source: typeof load; attempt: number; data?: T; failed: boolean }>()
  useEffect(() => {
    let active = true
    void load().then(
      data => { if (active) setResult({ source: load, attempt, data, failed: false }) },
      () => { if (active) setResult({ source: load, attempt, failed: true }) },
    )
    return () => { active = false }
  }, [load, attempt])
  const current = result?.source === load && result.attempt === attempt ? result : undefined
  return {
    data: current?.data,
    loading: !current,
    failed: current?.failed ?? false,
    retry: () => setAttempt(value => value + 1),
  }
}
