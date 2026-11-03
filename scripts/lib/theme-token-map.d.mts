/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * `theme-token-map.mjs` 的类型声明。
 *
 * 为什么需要单独一份：那个 .mjs 必须同时被两类消费方使用 ——
 * node 侧的门禁与 codemod（只能 require/import 纯 JS）与前端测试（走 tsc 严格检查）。
 * 没有本文件时，`import ... from './theme-token-map.mjs'` 在 strict 下报 TS7016「隐式 any」，
 * 并把所有取到的值降级成 unknown，等于类型检查白做。
 *
 * 维护约定：新增或改名导出项时同步这里。忘同步的后果是消费方立刻报错（找不到导出），
 * 属于会当场暴露的失败模式，不会静默。
 */

export type ThemeTokenSide = 'light' | 'dark'
export type ColorPropertySegment = 'bg' | 'fg' | 'border'

export interface ThemeTokenValue {
  light: string
  dark: string
}

/** 语义令牌名清单 */
export const SEMANTIC_TOKENS: string[]

/** 组件层令牌名清单（仅壳层 CSS 可引用） */
export const COMPONENT_TOKENS: string[]

/** 色值类令牌的双主题取值 —— 唯一真源 */
export const TOKEN_VALUES: Record<string, ThemeTokenValue>

/** 非色值令牌（阴影与描边补偿） */
export const NON_COLOR_TOKENS: Record<string, ThemeTokenValue>

/** 完整 box-shadow 串 → 阴影令牌名（整串严格等值） */
export const SHADOW_VALUE_TO_TOKEN: Record<string, string>

/** 归一化阴影串，用于与 SHADOW_VALUE_TO_TOKEN 比对 */
export function normalizeShadowValue(value: string): string

/** 严格等值映射表：按属性上下文分三段，键为归一化小写 6 位十六进制 */
export const COLOR_TO_TOKEN: Record<ColorPropertySegment, Record<string, string>>

/** 需人工判定的色值：色值 → 不能机械替换的理由 */
export const REVIEW_REQUIRED: Record<string, string>

/** 有意浅深两值全同的令牌别名对 */
export const INTENTIONAL_VALUE_DUPLICATES: Array<[string, string, string]>

/** 路径级排除清单 */
export const EXCLUDE_PATHS: string[]

/** 选择器块级排除前缀（登录页等不参与主题切换的区段） */
export const EXCLUDE_SELECTOR_PREFIXES: string[]

/** 门户 16 个 scene 色基线（与规则 §A.1.1 对应），供门禁校验色板未被误改 */
export const SCENE_COLOR_BASELINE: Record<string, string>

/** 扫描根目录 */
export const SCAN_ROOTS: string[]

export interface NormalizedHex {
  hex: string
  hasAlpha: boolean
}

export function normalizeHex(raw: string): NormalizedHex | null

export function classifyProperty(prop: string): ColorPropertySegment | null

export function isExcluded(relPath: string): boolean

export function isExcludedSelector(selectorText: string): boolean

export interface BareColorStat {
  hex: number
  rgbaBlack: number
  tokenized: number
  /** 归一化色值 → 出现次数 */
  hits: Map<string, number>
  /** 既不在映射表也不在 REVIEW_REQUIRED 的长尾色值 */
  unmapped: Map<string, number>
}

export function countBareColors(text: string, kind: 'css' | 'inline'): BareColorStat

/** WCAG 2.1 相对亮度；非法输入返回 null */
export function relativeLuminance(hex: string): number | null

/** WCAG 对比度比值；任一输入非法返回 null */
export function contrastRatio(foreground: string, background: string): number | null
