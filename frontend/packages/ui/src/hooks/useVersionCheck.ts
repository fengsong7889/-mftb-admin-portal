import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
// 构建常量由 vite-build-meta.ts 以虚拟模块注入（不落盘 src/），类型见 src/build-meta.d.ts
import { BUILD_TIME, COMMIT_HASH } from 'virtual:build-meta'

/** 单条提交记录：短哈希 + 标题，用于在更新弹窗里展示「本次更新内容」 */
export interface CommitChange {
  hash: string
  subject: string
}

/** 版本标识：commit 短哈希 + 构建时间，用于在更新提示里做具体对照 */
export interface VersionInfo {
  hash: string
  buildTime: string
  /** 该版本携带的最近提交清单；旧版 version.json 无此字段时为空数组 */
  changes: CommitChange[]
}

/**
 * version.json 是公开静态产物，内容按不可信处理：逐条校验字段形状，脏数据直接丢弃。
 */
function parseChanges(raw: unknown): CommitChange[] {
  if (!Array.isArray(raw)) return []
  const changes: CommitChange[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { hash, subject } = item as { hash?: unknown; subject?: unknown }
    if (typeof hash !== 'string' || typeof subject !== 'string') continue
    if (!hash.trim() || !subject.trim()) continue
    changes.push({ hash: hash.trim(), subject: subject.trim() })
  }
  return changes.slice(0, 20)
}

/** 版本检测返回结果 */
interface VersionCheckResult {
  /** 是否发现新版本 */
  updateAvailable: boolean
  /** 当前页面已加载的版本 */
  current: VersionInfo
  /** 服务端最新版本；未检测到前为 null */
  latest: VersionInfo | null
  /** 手动触发一次检测 */
  checkNow: () => void
}

/**
 * 定期拉取 server 上的 version.json，与构建时嵌入的时间戳对比，
 * 发现不一致时标记有新版本可用，并把两边的版本号一并交给提示组件展示。
 *
 * - 仅在已登录状态下启用（由调用方控制挂载时机）
 * - 首次检测延迟 60 秒，之后每 5 分钟检测一次
 * - 使用 cache-busting query 避免浏览器缓存干扰
 * - 网络异常时静默忽略，不影响正常使用
 */
export default function useVersionCheck(): VersionCheckResult {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [latest, setLatest] = useState<VersionInfo | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const currentBuildTime = BUILD_TIME
  const current = useMemo<VersionInfo>(() => ({ hash: COMMIT_HASH, buildTime: BUILD_TIME, changes: [] }), [])

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
        setLatest({ hash: data.commitHash ?? '—', buildTime: String(data.buildTime), changes: parseChanges(data.changes) })
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

  return { updateAvailable, current, latest, checkNow }
}
