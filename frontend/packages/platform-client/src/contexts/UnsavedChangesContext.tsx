/**
 * 未保存内容离开保护。
 *
 * 为什么放在 Context 而不是各页面自己判断：离开动作可能来自顶部页签、右键关闭、
 * 关闭全部、页面内返回按钮等多个入口，页面无法预知用户会从哪条路走。
 * 由页面登记「脏状态 + 暂存动作」，导航入口统一询问，才能避免漏一条路径就丢内容。
 *
 * 覆盖范围（必须如实告知）：
 * - 已覆盖：顶部页签点击/关闭/关闭其他/关闭右侧/关闭全部、PRD 页内返回与取消、刷新与关闭浏览器；
 * - 浏览器前进/后退与其它导航由 Data Router 的单一 blocker 处理。
 * - 会话失效、撤权时立即取消确认；内容保护不能阻塞安全退出。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Button, Modal } from 'antd'
import { useBlocker, type BlockerFunction } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

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
  confirmLeave: (targetPath?: string) => boolean | Promise<boolean>
  shouldBlock: () => boolean
  /** 确认后即将前往的路径；blocker 命中该目标时放行一次 */
  takeApprovedTarget: (target: string) => boolean
  cancelPending: () => void
}

const UnsavedChangesContext = createContext<UnsavedChangesValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t
  const guards = useRef(new Set<UnsavedGuard>())
  const pending = useRef<{ promise: Promise<boolean>; cancel: () => void } | null>(null)
  /*
   * 页签入口会「先确认再导航」，那一次导航不应重复弹框。
   * 用目标路径精确匹配取代早先的「一次时间窗口」：后者在后台标签里 setTimeout
   * 会被节流，标记残留会让真正该拦的浏览器后退被静默放行。
   */
  const approvedTarget = useRef<string | null>(null)
  const shouldBlock = useCallback(() => [...guards.current].some(g => g.isDirty()), [])
  const takeApprovedTarget = useCallback((target: string) => {
    if (approvedTarget.current && approvedTarget.current === target) {
      approvedTarget.current = null
      return true
    }
    return false
  }, [])
  const cancelPending = useCallback(() => {
    approvedTarget.current = null
    pending.current?.cancel()
  }, [])
  useEffect(() => cancelPending, [cancelPending])

  const register = useCallback((guard: UnsavedGuard) => {
    guards.current.add(guard)
    return () => {
      guards.current.delete(guard)
    }
  }, [])

  const confirmLeave = useCallback((targetPath?: string): boolean | Promise<boolean> => {
    const t = tRef.current
    const active = [...guards.current].filter(g => g.isDirty())
    if (active.length === 0) return true
    if (pending.current) return pending.current.promise

    let cancel = () => { /* 在同步创建弹窗后赋值 */ }
    const promise = new Promise<boolean>(resolve => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        pending.current = null
        if (value) approvedTarget.current = targetPath ?? null
        resolve(value)
      }

      let discardModal: ReturnType<typeof Modal.confirm> | null = null
      const modal = Modal.confirm({
        title: t('rdm.prd.leaveTitle'),
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        content: (
          <div>
            <div className="confirm-info-card">
              <div className="confirm-info-row">
                <span>{t('rdm.prd.leaveCurrent')}</span>
                <b>{active[0]?.describe?.() || t('rdm.prd.notSaved')}</b>
              </div>
              <div className="confirm-info-row">
                <span>{t('rdm.prd.afterLeave')}</span>
                <b>{t('rdm.prd.recoverHint')}</b>
              </div>
            </div>
            <Button
              type="link"
              danger
              size="small"
              style={{ padding: 0, marginTop: 8 }}
              onClick={() => {
                if (discardModal || settled) return
                discardModal = Modal.confirm({
                  title: t('rdm.prd.discardTitle'),
                  className: 'custom-confirm-modal',
                  icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
                  content: t('rdm.prd.discardWarning'),
                  okText: t('rdm.prd.discardConfirm'),
                  okButtonProps: { danger: true },
                  cancelText: t('rdm.prd.keepEditing'),
                  onCancel: () => { discardModal = null },
                  onOk: () => {
                    if (settled) return
                    active.forEach(g => g.discard())
                    modal.destroy()
                    finish(true)
                  },
                })
              }}
            >
              {t('rdm.prd.discardLeave')}
            </Button>
          </div>
        ),
        okText: t('rdm.prd.stashLeave'),
        cancelText: t('rdm.prd.keepEditing'),
        onOk: () => {
          if (settled) return
          let ok = false
          try { ok = active.every(g => g.stash()) } catch { /* 存储异常也保持当前页面 */ }
          if (!ok) {
            // 不结束本次确认，用户释放空间后可重试，也可取消，不能留下永不解决的 Promise。
            modal.update({ content: t('rdm.prd.stashFailed') })
            return Promise.reject(new Error('stash-failed'))
          }
          finish(true)
        },
        onCancel: () => finish(false),
      })
      cancel = () => { discardModal?.destroy(); modal.destroy(); finish(false) }
    })
    pending.current = { promise, cancel: () => cancel() }
    return promise
  }, [])

  const value = useMemo<UnsavedChangesValue>(() => ({ register, confirmLeave, shouldBlock, takeApprovedTarget, cancelPending }),
    [register, confirmLeave, shouldBlock, takeApprovedTarget, cancelPending])

  /*
   * 仅开发期的诊断钩子：真实浏览器里排查「未弹提醒」时，需要区分
   * “页面根本没登记 guard”与“blocker 未生效”，两者修法完全不同。
   * 生产构建不暴露（import.meta.env.DEV 为假时被摇树）。
   */
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__unsavedGuardDebug = () => ({
      guards: guards.current.size,
      dirty: [...guards.current].filter(g => g.isDirty()).length,
      pending: !!pending.current,
      approvedTarget: approvedTarget.current,
    })
  }
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

/** 只挂载一次，覆盖 PUSH/REPLACE/POP；鉴权失效时立即放行安全跳转。 */
export function UnsavedNavigationGuard({ enabled }: { enabled: boolean }) {
  const ctx = useContext(UnsavedChangesContext)
  /** 开发期调用计数：blocker 没被调用（注册问题）与调用了但返回 false（条件问题）修法不同 */
  const blockCalls = useRef(0)
  const lastArgs = useRef<string>('')
  const lastDecision = useRef<Record<string, unknown>>({})
  const shouldBlock = useCallback<BlockerFunction>((args) => {
    blockCalls.current += 1
    lastArgs.current = `${args?.currentLocation?.pathname} -> ${args?.nextLocation?.pathname} (${args?.historyAction})`
    const differs = (args?.currentLocation?.pathname !== args?.nextLocation?.pathname
      || args?.currentLocation?.search !== args?.nextLocation?.search)
    const target = `${args?.nextLocation?.pathname ?? ''}${args?.nextLocation?.search ?? ''}`
    const approved = enabled && !!ctx?.takeApprovedTarget(target)
    const dirty = !!ctx?.shouldBlock()
    const decision = !approved && enabled && differs && dirty
    lastDecision.current = { enabled, differs, dirty, approved, ctx: !!ctx, decision, target }
    return decision
  }, [ctx, enabled])
  const blocker = useBlocker(shouldBlock)
  /* 开发期诊断：真实浏览器里“未弹提醒”必须先分清 enabled 为假还是 blocker 未进入 blocked。 */
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__unsavedNavDebug = () => ({
      enabled, blocked: blocker.state === 'blocked', state: blocker.state,
      calls: blockCalls.current, lastArgs: lastArgs.current, lastDecision: lastDecision.current,
    })
  }
  const latest = useRef(blocker)
  latest.current = blocker
  const asking = useRef(false)
  useEffect(() => {
    if (!enabled) {
      ctx?.cancelPending()
      if (blocker.state === 'blocked') blocker.proceed()
      return
    }
    if (blocker.state !== 'blocked' || asking.current || !ctx) return
    asking.current = true
    void Promise.resolve(ctx.confirmLeave()).then(allowed => {
      asking.current = false
      if (latest.current.state !== 'blocked') return
      if (allowed) latest.current.proceed()
      else latest.current.reset()
    })
  }, [blocker, ctx, enabled])
  return null
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

/** 导航侧使用：询问是否允许离开；传 targetPath 时该目标在 blocker 中只放行一次 */
export function useConfirmLeave(): (targetPath?: string) => boolean | Promise<boolean> {
  const ctx = useContext(UnsavedChangesContext)
  return useCallback((targetPath?: string) => (ctx ? ctx.confirmLeave(targetPath) : true), [ctx])
}
