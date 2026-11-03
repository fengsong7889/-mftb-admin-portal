/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题偏好状态层（纯逻辑，不依赖 React / antd）。
 *
 * 方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §3 / §4.4 / §6.9
 *
 * 三个必须被同时守住的约定：
 *
 * 1. **偏好存三态、存储只写两态**。选「跟隨系統」时**删除** key 而不是写 `'system'`，
 *    于是「无记录」是唯一真值口径。若既写 `'system'` 又允许无记录，就会有两个表示同一含义的值，
 *    后续任何一处忘了处理其中一种，就会出现「明明选了跟随系统却不跟随」。
 *
 * 2. **feature flag 关闭时恒浅色**。`isThemeSwitchEnabled()` 未开启时 `resolveTheme()` 直接返回
 *    `'light'`，无视任何 storage 记录与系统偏好——这样基础设施可以先上主干、入口后开，
 *    对线上零视觉影响（方案 §十的上线节奏依赖这一点）。
 *
 * 3. **口径必须与首屏引导脚本一致**（`scripts/lib/theme-boot-script.mjs`）。两边算法不同会导致
 *    React 挂载后二次跳变：用户看到颜色闪两下，且深色首屏的防白闪努力全部作废。
 *
 * 命名与消费方对齐 `@/i18n` 的 `LANGUAGE_STORAGE_KEY` / `getSavedLanguage()`：
 * 全局偏好常量的导出位置与写法沿用既有惯例，不再另造一套风格。
 */
import { isThemeSwitchEnabled } from './featureFlag'

/** 开关读取放在独立模块（可测性），这里 re-export 以便消费方从 '@/theme' 一处取齐 */
export { isThemeSwitchEnabled }

/** 主题偏好持久化 key（localStorage）；与 scripts/lib/theme-boot-script.mjs 的引导脚本同值 */
export const THEME_STORAGE_KEY = 'app_theme'

/**
 * 主题变化事件名：供 charts / leaflet 等「CSS 变量管不到」的渲染面重绘。
 * 与 `TRANSLATION_BUNDLE_EVENT` 同一惯例（订阅方只 import 常量，不必载入整个实现模块）。
 */
export const THEME_CHANGED_EVENT = 'mftb:theme-changed'

/** 用户可选的偏好：淺色 / 深色 / 跟隨系統 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 偏好与实际环境计算后得到的主题（只有两个落点） */
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 读系统深色偏好；无 matchMedia（SSR / 老 jsdom）时按浅色处理，不得抛错 */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

/**
 * 读持久化偏好。
 * 只承认 `'light'` / `'dark'` 两种记录，其余（无记录、脏值、历史遗留的 `'system'`）一律归为 `'system'`，
 * 与 `getSavedLanguage()` 的「非法值回落默认」口径一致。
 */
export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    // 隐私模式 / storage 被禁用：退化为跟随系统，不得阻断首屏
    return 'system'
  }
}

/**
 * 偏好 + 系统环境 → 实际主题。
 * flag 关闭时无视一切输入，恒返回浅色（保证未开启期间零视觉变化）。
 */
export function resolveTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  if (!isThemeSwitchEnabled()) return 'light'
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

/**
 * 把主题落到 `<html data-theme>` 并广播变化事件。
 * 返回值即落地的主题，方便调用方同步自己的 state，避免两处各自计算导致不一致。
 */
export function applyTheme(theme: ResolvedTheme): ResolvedTheme {
  if (typeof document === 'undefined') return theme
  document.documentElement.dataset.theme = theme
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT))
  }
  return theme
}

/**
 * 写入偏好并立即生效，返回落地后的主题。
 *
 * 选「跟隨系統」时删除 key（见文件头约定 1）；storage 异常时仍然完成本次切换，
 * 只是不持久化——不能因为写不进 localStorage 就让按钮点了没反应。
 */
export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // 忽略持久化失败：本次会话内切换仍然有效
  }
  return applyTheme(resolveTheme(preference))
}

/**
 * 订阅系统主题变化。仅在「跟隨系統」时回调——用户手动选过浅色之后，
 * 操作系统的深色偏好变化不得覆盖他的选择，这是「手动覆盖系统」的基本语义。
 * 返回取消订阅函数。
 */
export function subscribeSystemTheme(callback: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}

  const mql = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (getThemePreference() !== 'system') return
    callback(resolveTheme('system'))
  }
  // addEventListener 在老 Safari 上不存在，退化为 addListener；两者都没有时静默不订阅
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange)
  else if (typeof (mql as unknown as { addListener?: (cb: () => void) => void }).addListener === 'function')
    (mql as unknown as { addListener: (cb: () => void) => void }).addListener(onChange)

  return () => {
    if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange)
    else if (typeof (mql as unknown as { removeListener?: (cb: () => void) => void }).removeListener === 'function')
      (mql as unknown as { removeListener: (cb: () => void) => void }).removeListener(onChange)
  }
}
