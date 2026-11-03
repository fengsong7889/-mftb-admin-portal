/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题 Provider：把「用户偏好 + 系统环境」落到 `<html data-theme>`，并通过 Context 暴露给消费方。
 *
 * 方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §3 / §6.9
 *
 * 装配位置在 `src/bootstrap.tsx` 的 `AppProviders` 外层 —— 那里是四个入口
 * （主站 + eam/hr/rdm）共用的唯一装配点，所以主题只需接一次就全站生效。
 * 反过来，绝不能在子应用里再套一层 Provider：那会产生两份互不同步的偏好状态。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme,
  getThemePreference,
  isThemeSwitchEnabled,
  resolveTheme,
  setThemePreference,
  subscribeSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './index'
import { ThemeContext, type ThemeContextValue } from './ThemeContext'

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getThemePreference())
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme())

  /**
   * 把主题落到 DOM。偏好变化时重跑一次。
   *
   * `applyTheme()` 是幂等的（赋相同值不产生副作用），因此 React StrictMode 在开发期的
   * 双调用不会造成任何可见差异 —— 这一点必须成立，否则首页那种「StrictMode 双调用」
   * 的历史坑（见 docs/HOME_REQUEST_STORM_2026-10.md）会在这里重演一遍。
   */
  useEffect(() => {
    setTheme(applyTheme(resolveTheme(preference)))
  }, [preference])

  /** 跟随系统时，OS 侧深浅色变化要即时响应；手动选过 light/dark 后由订阅内部自行短路 */
  useEffect(() => subscribeSystemTheme((next) => setTheme(applyTheme(next))), [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    // setThemePreference 负责写/删 storage 并落 DOM，返回落地后的实际主题
    setTheme(setThemePreference(next))
  }, [])

  const switchEnabled = isThemeSwitchEnabled()

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, switchEnabled }),
    [preference, theme, setPreference, switchEnabled],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
