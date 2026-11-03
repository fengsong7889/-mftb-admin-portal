/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * antd 侧主题配置（浅色 / 深色两套），由 `src/bootstrap.tsx` 按当前主题取用。
 *
 * 方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §4.4 / §4.6.5
 *
 * 三条约束决定了这里的写法，改动前务必先读：
 *
 * 1. **只传真实色值，禁止传 `var(--x)`**。antd 的 token 会经 derivative 算法派生出
 *    `colorTextPlaceholder`、`colorPrimaryBorder` 等一批衍生色，传字符串变量会让解析失败、衍生色全错。
 *    因此 CSS 令牌层与这里必然是双源；一致性由 `themeTokens.test.ts` 逐项断言（方案 §4.4）。
 *
 * 2. **浅色侧逐字保留原 `bootstrap.tsx` 的取值**，包括一处已知漂移：
 *    `colorPrimaryHover` 是 `#F58A2E`，而 CSS 规范值是 `--brand-hover` `#F59432`（全站 261 处用后者）。
 *    两者不一致是仓库既有事实：`.search-section/.action-section .ant-btn-primary:hover` 等
 *    主要场景早已被 components.css 的直接选择器覆写成 #F59432，`#F58A2E` 只在未被覆写的 antd 组件上生效。
 *    本方案的目标是「浅色视觉恒等 + 深色新增场景做对」，所以浅色侧照抄现状、不改；
 *    深色侧直接用规范值 #F59432，不把这个漂移带进新场景。漂移本身登记为既有债务，单独立项收敛。
 *
 * 3. **深色侧只覆盖与浅色侧对称的几项**，其余交给 `darkAlgorithm` 自行派生。
 *    少覆盖就是少风险：不确定的值一律让算法算，不猜。
 *
 * 关于 `--on-brand`（品牌橙底前景取深色）在这里的落点，见文件末尾 COMPONENTS.dark 注释：
 * 只有 Button / Menu 有可靠的组件级 token 覆写点；Switch / Checkbox / Radio 的选中态前景
 * 直接消费全局 `colorTextLightSolid` 且无对应组件 token，改到壳层 CSS 用直接选择器处理
 * ——**不要猜 token 名**，antd 对未知键静默忽略，猜错就是「看起来改了其实没改」。
 */
import { theme, type ThemeConfig } from 'antd'
import type { ResolvedTheme } from './index'

/** 字体栈两主题共用，与现状一致 */
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** 全局 token：浅色 = 原 bootstrap.tsx 现状，逐字未改 */
const TOKENS_LIGHT: ThemeConfig['token'] = {
  colorPrimary: '#E8720C',
  colorPrimaryHover: '#F58A2E',
  colorPrimaryActive: '#CC6200',
  colorBgContainer: '#ffffff',
  colorBgLayout: '#F5F5F5',
  borderRadius: 4,
  fontFamily: FONT_FAMILY,
}

/**
 * 全局 token：深色。三阶表面取自 --surface-2 / --surface-1 / --surface-3，
 * 品牌三态取自 --brand / --brand-hover / --brand-active 的深色值。
 * `colorBgElevated`（浮层：弹窗、下拉、抽屉）必须给出，否则深色下浮层仍是白底。
 */
const TOKENS_DARK: ThemeConfig['token'] = {
  colorPrimary: '#E8720C',
  colorPrimaryHover: '#F59432',
  colorPrimaryActive: '#D4670A',
  colorBgContainer: '#1F1F1F',
  colorBgLayout: '#141414',
  colorBgElevated: '#262626',
  borderRadius: 4,
  fontFamily: FONT_FAMILY,
}

/** 组件级覆写：浅色 = 原 bootstrap.tsx 现状，逐字未改 */
const COMPONENTS_LIGHT: ThemeConfig['components'] = {
  Menu: {
    itemBg: '#1E1E1E',
    itemColor: '#B0B0B0',
    itemHoverBg: '#2A2A2A',
    itemHoverColor: '#FFFFFF',
    itemSelectedBg: '#E8720C',
    itemSelectedColor: '#FFFFFF',
    subMenuItemBg: '#1E1E1E',
    itemActiveBg: '#333333',
    iconSize: 16,
    iconMarginInlineEnd: 10,
  },
  Button: {
    primaryShadow: 'none',
  },
  Table: {
    headerBg: '#FAFAFA',
    headerColor: '#333333',
    rowHoverBg: '#FFF7ED',
  },
}

/**
 * 组件级覆写：深色。
 *
 * - Menu 侧边栏在浅色主题下本就是深色（#1E1E1E），深色主题只需比内容区再深一档（#1A1A1A），
 *   维持「侧边栏 < 内容区 < 浮层」的明度递增关系，不改变现有视觉语言。
 * - `itemHoverColor` 保持白色：它的底是 #2E2E2E（深灰）而不是品牌橙，白字 12.6:1，本就该白。
 * - `itemSelectedColor` / `Button.primaryColor` 换成 #141414：这两处的底是品牌橙，
 *   橙底白字实测只有 3.07:1，黑字 6.00:1（方案 §4.6 定版）。
 *   `Button.primaryColor` 一个键即覆盖主按钮的静态 / hover / active 三态
 *   （antd 内部 `genSolidButtonStyle(token, token.primaryColor, token.colorPrimary, …)` 三处共用它），
 *   无需再找 primaryHoverColor —— 那个 token 不存在。
 * - Table.rowHoverBg 用 alpha 混合而非淡色实底：深色下 #FFF7ED 类淡底会变成刺眼亮块（方案 §4.3 规则 3）。
 */
const COMPONENTS_DARK: ThemeConfig['components'] = {
  Menu: {
    itemBg: '#1A1A1A',
    itemColor: '#A6A6A6',
    itemHoverBg: '#2E2E2E',
    itemHoverColor: '#FFFFFF',
    itemSelectedBg: '#E8720C',
    itemSelectedColor: '#141414',
    subMenuItemBg: '#1A1A1A',
    itemActiveBg: '#383838',
    iconSize: 16,
    iconMarginInlineEnd: 10,
  },
  Button: {
    primaryShadow: 'none',
    primaryColor: '#141414',
  },
  Table: {
    headerBg: '#262626',
    headerColor: '#E8E8E8',
    rowHoverBg: 'rgba(232,114,12,0.12)',
  },
}

/**
 * 按已解析的主题构造 antd 配置。
 *
 * 刻意**不开 `cssVar`**：它会改变 antd 输出 CSS 的形式（变量引用替代字面值），
 * 而本项目对 antd 有 2400 行直接选择器覆写，优先级相互作用需要单独评估
 * （方案 §十二 风险 11 预告的正是这一条）。深色只在用户主动切换时触发一次重算，
 * 不在渲染热路径上，性能收益小；先用最小改动上线路径，需要时再单独开并做全量视觉核对。
 */
export function buildThemeConfig(resolved: ResolvedTheme): ThemeConfig {
  const dark = resolved === 'dark'
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: dark ? TOKENS_DARK : TOKENS_LIGHT,
    components: dark ? COMPONENTS_DARK : COMPONENTS_LIGHT,
  }
}

/**
 * 导出两套 token 常量供单测比对 —— `themeTokens.test.ts` 要把这里的色值
 * 与 `theme.css` 的同语义令牌值逐项对齐，双源漂移当场失败。
 */
export const ANTD_TOKENS = {
  light: TOKENS_LIGHT,
  dark: TOKENS_DARK,
} as const

export const ANTD_COMPONENTS = {
  light: COMPONENTS_LIGHT,
  dark: COMPONENTS_DARK,
} as const
