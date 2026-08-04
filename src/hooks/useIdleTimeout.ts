import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from 'antd'

/** 空闲超时时间（毫秒）：30 分钟无操作自动退出 */
const IDLE_TIMEOUT = 30 * 60 * 1000
/** 倒计时警告提前时间（毫秒）：超时前 1 分钟弹出警告 */
const WARNING_BEFORE = 60 * 1000

/** 用户活动事件列表 */
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
]

/**
 * 空闲超时自动登出 Hook
 * - 监听用户的鼠标、键盘、滚动、触摸等操作
 * - 超过 IDLE_TIMEOUT 无任何操作 → 自动登出
 * - 超时前 WARNING_BEFORE 弹出倒计时警告弹窗，用户有操作则重置计时
 */
export function useIdleTimeout() {
  const { isAuthenticated, logout } = useAuth()
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const modalRef = useRef<{ destroy: () => void } | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const resetTimerRef = useRef<() => void>(() => {})

  /** 清除所有定时器 */
  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    idleTimerRef.current = null
    warningTimerRef.current = null
    countdownRef.current = null
  }, [])

  /** 关闭警告弹窗 */
  const closeWarningModal = useCallback(() => {
    if (modalRef.current) {
      modalRef.current.destroy()
      modalRef.current = null
    }
  }, [])

  /** 执行登出 */
  const doLogout = useCallback(() => {
    clearAllTimers()
    closeWarningModal()
    logout()
    // 跳转登录页（HashRouter 兼容）
    window.location.hash = '#/login'
  }, [logout, clearAllTimers, closeWarningModal])

  /** 显示倒计时警告弹窗 */
  const showWarningModal = useCallback(() => {
    closeWarningModal()

    let remaining = Math.ceil(WARNING_BEFORE / 1000) // 剩余秒数

    const modal = Modal.warning({
      title: '空闲超时提醒',
      content: `您已长时间未操作，${Math.ceil(remaining / 60)} 分钟后将自动退出登录。请点击任意位置继续操作。`,
      okText: '继续操作',
      centered: true,
      onOk: () => {
        // 用户点击"继续操作"，重置计时器
        closeWarningModal()
        resetTimerRef.current()
      },
    })
    modalRef.current = modal as unknown as { destroy: () => void }

    // 每秒更新倒计时
    countdownRef.current = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current)
        return
      }
      // 更新弹窗内容
      const modalInstance = modalRef.current
      if (modalInstance) {
        modal.update({
          content: `您已长时间未操作，${Math.ceil(remaining / 60)} 分钟后将自动退出登录。请点击任意位置继续操作。`,
        })
      }
    }, 1000)
  }, [closeWarningModal])

  /** 重置空闲计时器 */
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    clearAllTimers()
    closeWarningModal()

    // 设置警告定时器：超时前 N 秒弹出警告
    warningTimerRef.current = setTimeout(() => {
      showWarningModal()
    }, IDLE_TIMEOUT - WARNING_BEFORE)

    // 设置空闲超时定时器：到期后自动登出
    idleTimerRef.current = setTimeout(() => {
      doLogout()
    }, IDLE_TIMEOUT)
  }, [clearAllTimers, closeWarningModal, showWarningModal, doLogout])

  // 保持 ref 指向最新的 resetTimer，供 showWarningModal 通过 ref 调用
  resetTimerRef.current = resetTimer

  /** 用户活动回调：重置计时器 */
  const onActivity = useCallback(() => {
    // 避免频繁重置（200ms 节流）
    const now = Date.now()
    if (now - lastActivityRef.current < 200) return
    resetTimer()
  }, [resetTimer])

  useEffect(() => {
    // 仅登录状态下启用（依赖 React 状态，不直接检查 localStorage）
    if (!isAuthenticated) return

    // 启动计时器
    resetTimer()

    // 注册活动监听
    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, onActivity, { passive: true })
    })

    return () => {
      clearAllTimers()
      closeWarningModal()
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, onActivity)
      })
    }
  }, [isAuthenticated, resetTimer, onActivity, clearAllTimers, closeWarningModal])
}
