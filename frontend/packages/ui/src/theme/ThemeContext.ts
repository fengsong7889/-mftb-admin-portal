/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题 Context 与消费 hook。
 *
 * 与 `ThemeProvider.tsx` 拆成两个文件的原因不是架构洁癖，而是 ESLint 的
 * `react-refresh/only-export-components`：同一模块里既导出组件又导出 hook/常量，
 * 会让该模块无法被 HMR 干净替换（bootstrap.tsx 是靠显式 disable 注释处理的入口装配模块，
 * 这里没必要复制那个豁免）。
 */
import { createContext, useContext } from 'react'
import type { ResolvedTheme, ThemePreference } from './index'

export interface ThemeContextValue {
  /** 用户选择的偏好（三态） */
  preference: ThemePreference
  /** 偏好与环境算出的实际主题（两态），CSS 与 antd 都按它走 */
  theme: ResolvedTheme
  /** 切换偏好；传 `'system'` 会删除持久化记录而不是写入字面量 */
  setPreference: (next: ThemePreference) => void
  /** 入口开关是否开启；关闭时调用方不得渲染任何主题切换 UI */
  switchEnabled: boolean
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * 读取当前主题状态。
 * 放在 Provider 之外单独导出，是为了让「脱离 Provider 的测试渲染」直接抛错定位，
 * 而不是静默拿到 null 后在某个组件里以更难排查的方式崩掉。
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme() 必须在 <ThemeProvider> 内调用')
  }
  return ctx
}
