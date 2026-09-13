import { useState, useEffect, useCallback, useRef } from 'react'
import { BUILD_TIME } from '../build-meta'

/** 版本检测返回结果 */
interface VersionCheckResult {
  /** 是否发现新版本 */
  updateAvailable: boolean
  /** 手动触发一次检测 */
  checkNow: () => void
}

/**
 * 定期拉取 server 上的 version.json，与构建时嵌入的时间戳对比，
 * 发现不一致时标记有新版本可用。
 *
 * - 仅在已登录状态下启用（由调用方控制挂载时机）
 * - 首次检测延迟 60 秒，之后每 5 分钟检测一次
 * - 使用 cache-busting query 避免浏览器缓存干扰
 * - 网络异常时静默忽略，不影响正常使用
 */
export default function useVersionCheck(): VersionCheckResult {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const currentBuildTime = BUILD_TIME

  const check = useCallback(async () => {
    if (!currentBuildTime) return
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.buildTime && data.buildTime !== currentBuildTime) {
        setUpdateAvailable(true)
        // 检测到新版本后停止轮询，避免重复提示
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } catch {
      // 网络异常静默忽略
    }
  }, [currentBuildTime])

  useEffect(() => {
    if (!currentBuildTime) return

    // 首次延迟 60 秒后检测，避免页面刚加载就触发
    const initialTimer = setTimeout(() => {
      check()
      // 之后每 5 分钟检测一次
      timerRef.current = setInterval(check, 5 * 60 * 1000)
    }, 60 * 1000)

    return () => {
      clearTimeout(initialTimer)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentBuildTime, check])

  const checkNow = useCallback(() => {
    check()
  }, [check])

  return { updateAvailable, checkNow }
}
