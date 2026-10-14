/**
 * 移动 APP 原型 · 轻量导航栈
 *
 * 原型刻意不复用后台 react-router（后台路由守卫按业务菜单 key 鉴权，原型页不属于任何业务系统），
 * 而是在手机外壳内部维护一个自管的屏幕栈，贴近真实 APP 的「压栈/出栈」转场语义，
 * 返回按钮统一由栈出栈，转场动画交给 CSS。
 *
 * 屏幕栈同时桥接浏览器 history：push 时压入一条「同 URL」的 history 条目，popstate 时按
 * history.state.navDepth 退栈。真机上 Android 返回键 / iOS 浏览器后退因此与机身内「‹ 返回」
 * 等价；不桥接时系统返回会直接跳出 APP 页，这是与原生体感差距最大的一处。
 * 用同 URL 压栈是因为宿主是 HashRouter：pushState 不改 hash、不触发 hashchange，
 * 后退时 react-router 读到的仍是同一路由，不会误判成业务菜单跳转。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 商家端屏幕（buy 系列为购买闭环的连续步骤） */
export type MerchantScreen =
  | { key: 'home' }
  | { key: 'store' }
  | { key: 'algo' }
  | { key: 'cells' }
  | { key: 'cart' }
  | { key: 'success'; orderNo: string; amount: number }
  | { key: 'orders' }
  | { key: 'orderDetail'; orderNo: string }

/** 底部主 Tab（决定首页/订单两个根屏之间切换时把栈重置到根） */
export const MERCHANT_ROOT: Record<'home' | 'orders', MerchantScreen> = {
  home: { key: 'home' },
  orders: { key: 'orders' },
}

/** 单栈导航对外 API（供各屏幕组件接收 nav prop） */
export interface MobileNavApi<S> {
  current: S
  canGoBack: boolean
  push: (screen: S) => void
  back: () => void
  reset: (screen: S) => void
  replace: (screen: S) => void
}

/** 本 hook 压入的 history 条目携带的栈深；宿主条目没有该字段 */
interface NavHistoryState {
  navDepth?: number
}

/**
 * 单栈导航 hook（栈深与浏览器 history 一一对应）：
 * - reset 回到某个根屏（清空历史栈），用于底部 Tab 切换；
 * - push 压入子屏（返回时可逐级退栈）；
 * - back 退栈，栈底时不再生效（根屏不显示返回箭头）。
 *
 * 为什么用 ref 而不是在 setState 更新函数里直接 pushState：main.tsx 开了 StrictMode，
 * 更新函数在开发环境会被重复调用，副作用会压出双份 history 条目（表现为要按两次返回）。
 */
export function useMobileNav<S>(root: S): MobileNavApi<S> {
  const [stack, setStack] = useState<S[]>([root])
  /** 栈的权威副本，供事件回调读取最新深度而不依赖闭包里的旧 state */
  const stackRef = useRef<S[]>([root])
  /** 本 hook 已压入的 history 条数，reset/replace 据此回退等量条目 */
  const pushedRef = useRef(0)

  const apply = useCallback((next: S[]) => {
    stackRef.current = next
    setStack(next)
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const depth = (event.state as NavHistoryState | null)?.navDepth
      // 落在本 hook 的条目上按栈深退屏；落回宿主条目（无 navDepth）退到根屏；
      // 再往前的后退交还浏览器（离开 APP 页），与「返回企業門戶」的预期一致
      const target = typeof depth === 'number' ? depth : 1
      pushedRef.current = Math.max(0, Math.min(target - 1, pushedRef.current))
      const current = stackRef.current
      if (current.length > target) apply(current.slice(0, Math.max(1, target)))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [apply])

  /** 回退本 hook 压入的全部条目，让「栈深 1」始终对应「宿主条目」 */
  const trimToRoot = useCallback(() => {
    const extra = pushedRef.current
    pushedRef.current = 0
    // go() 触发的 popstate 会命中宿主条目（target=1），此时栈已是 1 层，不会二次退屏
    if (extra > 0) history.go(-extra)
  }, [])

  const push = useCallback((screen: S) => {
    const next = [...stackRef.current, screen]
    apply(next)
    // 第二个参数 title 在多数浏览器被忽略，传空串保持当前 URL 不变
    history.pushState({ navDepth: next.length } satisfies NavHistoryState, '')
    pushedRef.current = next.length - 1
  }, [apply])

  /** 退栈交给 history 触发 popstate 来完成，避免 React 与浏览器各退一步造成双重退栈 */
  const back = useCallback(() => {
    if (stackRef.current.length > 1) history.back()
  }, [])

  const reset = useCallback((screen: S) => {
    apply([screen])
    trimToRoot()
  }, [apply, trimToRoot])

  /** 成功后清空历史栈并停留在结果页，避免用户返回到已提交的购物车 */
  const replace = useCallback((screen: S) => {
    apply([screen])
    trimToRoot()
  }, [apply, trimToRoot])

  const current = stack[stack.length - 1]
  const canGoBack = stack.length > 1

  return { current, canGoBack, push, back, reset, replace }
}
