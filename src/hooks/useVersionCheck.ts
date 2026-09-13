import { useState, useEffect, useCallback, useRef } from 'react'
import { BUILD_TIME } from '../build-meta'

/** 版本檢測返回結果 */
interface VersionCheckResult {
  /** 是否發現新版本 */
  updateAvailable: boolean
  /** 手動觸發一次檢測 */
  checkNow: () => void
}

/**
 * 定期拉取 server 上的 version.json，與構建時嵌入的時間戳對比，
 * 發現不一致時標記有新版本可用。
 *
 * - 僅在已登錄狀態下啟用（由調用方控制掛載時機）
 * - 首次檢測延遲 60 秒，之後每 5 分鐘檢測一次
 * - 使用 cache-busting query 避免瀏覽器緩存干擾
 * - 網絡異常時靜默忽略，不影響正常使用
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
        // 檢測到新版本後停止輪詢，避免重複提示
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } catch {
      // 網絡異常靜默忽略
    }
  }, [currentBuildTime])

  useEffect(() => {
    if (!currentBuildTime) return

    // 首次延遲 60 秒後檢測，避免頁面剛加載就觸發
    const initialTimer = setTimeout(() => {
      check()
      // 之後每 5 分鐘檢測一次
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
