/**
 * 「当前所处业务系统」的存储与广播原语。
 *
 * 为什么从 ui/hooks/useCurrentSystem 下沉到这里：AuthContext（platform-client）需要在
 * 登出/切换账号时清空当前系统，而 hooks 属于 ui 包，platform-client → ui 会形成包环
 * （ui 的组件又依赖 AuthContext）。存储原语不依赖任何 UI，放在 platform-client 后
 * 依赖方向收敛为 ui → platform-client → contracts（scripts/check-boundary.mjs 强制）。
 */

export const CURRENT_SYSTEM_STORAGE_KEY = 'current_system_code'
export const CURRENT_SYSTEM_CHANGE_EVENT = 'current-system:change'

/** 与后端 `SystemCode.PORTAL` 对齐：个人工作台/公共入口，不作为业务系统持久化 */
export const PORTAL_SENTINEL = 'portal'

/** 判断 code 是否为业务系统（排除 portal 哨兵与空值） */
export function isBusinessSystemCode(code: string | null | undefined): code is string {
  return !!code && code !== PORTAL_SENTINEL
}

/** 读取当前系统 code（未设置返回 null） */
export function readCurrentSystemCode(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_SYSTEM_STORAGE_KEY)
    return raw && raw !== 'null' && raw !== PORTAL_SENTINEL ? raw : null
  } catch {
    return null
  }
}

/** 写入或清空当前系统 code；同步广播给同域其他标签页 */
export function writeCurrentSystemCode(code: string | null): void {
  try {
    if (code && code !== PORTAL_SENTINEL) {
      localStorage.setItem(CURRENT_SYSTEM_STORAGE_KEY, code)
    } else {
      localStorage.removeItem(CURRENT_SYSTEM_STORAGE_KEY)
    }
  } catch {
    /* localStorage 不可用时忽略（隐私模式等） */
  }
  // storage 仅通知其他标签页；同页所有 Hook 实例必须同步接收变更，包括登出清空。
  window.dispatchEvent(new CustomEvent<string | null>(CURRENT_SYSTEM_CHANGE_EVENT, {
    detail: isBusinessSystemCode(code) ? code : null,
  }))
}
