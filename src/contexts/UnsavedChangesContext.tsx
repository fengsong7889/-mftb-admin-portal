/**
 * 未保存内容离开保护。
 *
 * 为什么放在 Context 而不是各页面自己判断：离开动作可能来自顶部页签、右键关闭、
 * 关闭全部、页面内返回按钮等多个入口，页面无法预知用户会从哪条路走。
 * 由页面登记「脏状态 + 暂存动作」，导航入口统一询问，才能避免漏一条路径就丢内容。
 *
 * 覆盖范围（必须如实告知）：
 * - 已覆盖：顶部页签点击/关闭/关闭其他/关闭右侧/关闭全部、PRD 页内返回与取消、刷新与关闭浏览器；
 * - 未覆盖：浏览器前进/后退。当前项目使用声明式 HashRouter，官方 useBlocker 需要 Data Router，
 *   该迁移必须单独立项并做全站路由回归，不能顺手改。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from 'antd'

export interface UnsavedGuard {
  /** 是否存在未保存修改 */
  isDirty: () => boolean
  /**
   * 暂存到本机。返回 true 表示已写入；false 表示存储不可用/内容过大，
   * 此时不允许静默离开，必须停留在页面并提示用户先保存。
   */
  stash: () => boolean
  /** 用户明确选择放弃时清理暂存 */
  discard: () => void
  /** 提示主体（如 PRD 标题），用于确认框上下文 */
  describe?: () => string
}

interface UnsavedChangesValue {
  /** 登记当前页面的保护；返回注销函数。页面卸载必须调用它 */
  register: (guard: UnsavedGuard) => () => void
  /**
   * 导航入口调用：返回 true 表示可以离开。
   * <p>无脏页面时必须是**同步** true：页签点击等同步交互依赖这一点，
   * 统一返回 Promise 会让导航延后一个微任务，既有测试与用户感知都会变。
   */
  confirmLeave: () => boolean | Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Set<UnsavedGuard>())
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)

  const register = useCallback((guard: UnsavedGuard) => {
    guards.current.add(guard)
    return () => {
      guards.current.delete(guard)
    }
  }, [])

  const confirmLeave = useCallback((): boolean | Promise<boolean> => {
    const active = [...guards.current].filter(g => g.isDirty())
    if (active.length === 0) return true
    if (confirmingRef.current) return false // 已有确认框在前台，避免叠加
    confirmingRef.current = true
    setConfirming(true)

    return new Promise<boolean>(resolve => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        confirmingRef.current = false
        setConfirming(false)
        resolve(value)
      }

      const modal = Modal.confirm({
        title: '有未保存的內容，確定要離開嗎？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        content: (
          <div>
            <div className="confirm-info-card">
              <div className="confirm-info-row">
                <span>目前內容：</span>
                <b>{active[0]?.describe?.() || '尚未保存到伺服器'}</b>
              </div>
              <div className="confirm-info-row">
                <span>離開後：</span>
                <b>可從本機暫存恢復（僅限本分頁、24 小時內）</b>
              </div>
            </div>
            <Button
              type="link"
              danger
              size="small"
              style={{ padding: 0, marginTop: 8 }}
              onClick={() => {
                active.forEach(g => g.discard())
                modal.destroy()
                finish(true)
              }}
            >
              放棄暫存並離開
            </Button>
          </div>
        ),
        okText: '暫存並離開',
        cancelText: '繼續編輯',
        onOk: () => {
          const ok = active.every(g => g.stash())
          if (!ok) {
            // 暂存失败时不放行：留在页面并保持内容，避免"提示已暂存"却什么都没写
            finish(false)
            return Promise.reject(new Error('stash-failed'))
          }
          finish(true)
        },
        onCancel: () => finish(false),
      })
    })
  }, [])

  const value = useMemo<UnsavedChangesValue>(() => ({ register, confirmLeave }), [register, confirmLeave])

  // confirming 只用于调试可观测性；不参与渲染，避免整棵树因一次确认框重渲染
  void confirming
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

/**
 * 页面侧使用：登记未保存保护。
 * <p>未包 Provider 时返回空实现（单页测试/嵌入场景不应因为缺 Provider 直接崩）。
 */
export function useUnsavedGuard(): { register: (guard: UnsavedGuard) => () => void } {
  const ctx = useContext(UnsavedChangesContext)
  return useMemo(() => ({
    register: ctx ? ctx.register : () => () => undefined,
  }), [ctx])
}

/** 导航侧使用：询问是否允许离开 */
export function useConfirmLeave(): () => boolean | Promise<boolean> {
  const ctx = useContext(UnsavedChangesContext)
  return useCallback(() => (ctx ? ctx.confirmLeave() : true), [ctx])
}
