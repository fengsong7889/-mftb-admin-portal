/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 双源一致性单测（方案 §4.4 / §8.1 第 2 组用例）。
 *
 * 为什么必须存在：antd 的 token 会经 derivative 算法派生衍生色，传 `var(--x)` 字符串会解析失败，
 * 所以 CSS 令牌层与 themeTokens.ts 天然是两份色值。两份就会漂移，漂移的表现是
 * 「深色下某些区域跟 antd 组件不是一个颜色」——零星、难复现、只在切换后出现。
 *
 * 本文件守三层：
 * 1. theme.css 的生成物与真源 TOKEN_VALUES 一致（防有人手改 CSS 或忘了跑生成脚本）。
 * 2. theme.css 的浅深两块 key 集合一致（漏一个深色值不会报错，只会静默回落浅色，是最难查的一类）。
 * 3. antd 的**每一个色值 token** 都能对应到一个语义令牌；对不上的必须写进 KNOWN_DRIFT 说明理由。
 *    第 3 层是「白名单反向」写法：新增 antd 色值而不同步令牌会直接失败，而不是等肉眼发现。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NON_COLOR_TOKENS, TOKEN_VALUES } from '../../../../../scripts/lib/theme-token-map.mjs'
import { ANTD_COMPONENTS, ANTD_TOKENS } from './themeTokens'

/**
 * 用 process.cwd() 而不是 import.meta.url：后者的 scheme 在 jsdom 环境下不是 file:，
 * `fileURLToPath` 会直接抛「The URL must be of scheme file」让整个文件加载失败（实测踩过）。
 * 与仓库其它门禁脚本保持同一惯例（均以 process.cwd() 为仓库根）。
 */
const THEME_CSS = readFileSync(join(process.cwd(), 'frontend/packages/ui/src/styles/theme.css'), 'utf8')

/**
 * 抽出某个选择器块里的 `--x: value` 键值对。
 * 不复用 scripts/check-theme-tokens.mjs 里的同名实现：前端测试不应反向依赖构建工具目录。
 * 这里只依赖生成脚本的固定产出格式（块内无嵌套花括号），所以 indexOf 命中的第一块就是主块
 * ——文件里 @media print 内还有一次 html[data-theme='dark']，靠顺序天然避开。
 */
function tokensIn(selector: string): Map<string, string> {
  const at = THEME_CSS.indexOf(selector)
  if (at < 0) throw new Error(`theme.css 里找不到选择器 ${selector}`)
  const open = THEME_CSS.indexOf('{', at)
  const close = THEME_CSS.indexOf('}', open)
  const out = new Map<string, string>()
  for (const matched of THEME_CSS.slice(open + 1, close).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(matched[1], matched[2].trim())
  }
  return out
}

const ALL_TOKENS = { ...TOKEN_VALUES, ...NON_COLOR_TOKENS }
const light = tokensIn(':root {')
const dark = tokensIn("html[data-theme='dark'] {")

describe('theme.css 生成物与真源 TOKEN_VALUES 一致', () => {
  it.each(['light', 'dark'] as const)('%s 侧每个令牌的 CSS 值都等于真源', (side) => {
    const block = side === 'light' ? light : dark
    const drift = Object.entries(ALL_TOKENS)
      .filter(([name, values]) => block.get(name) !== values[side])
      .map(([name, values]) => `--${name}: css=${block.get(name) ?? '缺失'} 真源=${values[side]}`)
    expect(drift, `漂移项：${drift.join('; ')}`).toEqual([])
  })

  it('浅深两块的 key 集合必须完全一致（漏深色值会静默回落浅色）', () => {
    const missingDark = [...light.keys()].filter((k) => !dark.has(k))
    const missingLight = [...dark.keys()].filter((k) => !light.has(k))
    expect(missingDark, `深色块缺：${missingDark.join(', ')}`).toEqual([])
    expect(missingLight, `浅色块缺：${missingLight.join(', ')}`).toEqual([])
  })

  it('令牌总数与真源一致，防止漏生成', () => {
    expect(light.size).toBe(Object.keys(ALL_TOKENS).length)
  })

  it('两块都必须声明 color-scheme，否则深色下原生控件仍是白底', () => {
    expect(THEME_CSS).toMatch(/:root \{[\s\S]*?color-scheme: light;/)
    expect(THEME_CSS).toMatch(/html\[data-theme='dark'\] \{[\s\S]*?color-scheme: dark;/)
  })
})

/** antd 色值 token → 语义令牌名的对齐表；未列出的色值 token 会触发「未纳管」失败 */
const TOKEN_ALIGN: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    colorPrimary: 'brand',
    colorPrimaryActive: 'brand-active',
    colorBgContainer: 'surface-2',
    colorBgLayout: 'surface-1',
  },
  dark: {
    colorPrimary: 'brand',
    colorPrimaryHover: 'brand-hover',
    colorPrimaryActive: 'brand-active',
    colorBgContainer: 'surface-2',
    colorBgLayout: 'surface-1',
    colorBgElevated: 'surface-3',
  },
}

/**
 * 已知且有意保留的漂移：antd 侧取值 ≠ 对应语义令牌取值。
 * 每一项都必须写清「为什么不修」，否则本表就会变成掩盖问题的垃圾桶。
 */
const KNOWN_DRIFT: Record<'light' | 'dark', Record<string, { expect: string; why: string }>> = {
  light: {
    colorPrimaryHover: {
      expect: '#F58A2E',
      why: '仓库既有事实：CSS 规范值是 --brand-hover #F59432（全站 261 处），但 antd token 一直是 #F58A2E。'
        + '主要按钮 hover 早被 components.css 直接选择器覆写成 #F59432，本方案要求浅色视觉恒等，'
        + '所以浅色侧照抄现状；收敛这处漂移属独立议题，不得夹带进主题改造。',
    },
  },
  dark: {},
}

const COMPONENT_ALIGN: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    'Menu.itemBg': 'sidebar-bg',
    'Menu.subMenuItemBg': 'sidebar-bg',
    'Menu.itemColor': 'sidebar-item-color',
    'Menu.itemHoverBg': 'sidebar-item-hover-bg',
    'Menu.itemActiveBg': 'sidebar-item-active-bg',
    'Menu.itemSelectedBg': 'brand',
    'Menu.itemSelectedColor': 'on-brand',
    'Table.headerBg': 'surface-3',
  },
  dark: {
    'Menu.itemBg': 'sidebar-bg',
    'Menu.subMenuItemBg': 'sidebar-bg',
    'Menu.itemColor': 'sidebar-item-color',
    'Menu.itemHoverBg': 'sidebar-item-hover-bg',
    'Menu.itemActiveBg': 'sidebar-item-active-bg',
    'Menu.itemSelectedBg': 'brand',
    'Menu.itemSelectedColor': 'on-brand',
    'Table.headerBg': 'surface-3',
    'Table.headerColor': 'text-1',
    // 主按钮前景必须跟 --on-brand 走：它是本次定版的「橙底取深色前景」在 antd 侧的唯一落点
    'Button.primaryColor': 'on-brand',
    // Menu.itemHoverColor 的底是深灰 #2E2E2E 而非品牌橙，白字 12.6:1，本就该白：不参与 on-brand
  },
}

const COMPONENT_DRIFT: Record<'light' | 'dark', Record<string, { expect: string; why: string }>> = {
  light: {
    'Table.rowHoverBg': {
      expect: '#FFF7ED',
      why: 'antd Table 行 hover 的既有淡橙底，与 --brand-soft #FFF7F0 差一档且已被全站视觉依赖；'
        + '浅色侧必须恒等，不能顺手统一。',
    },
    'Menu.itemHoverColor': {
      expect: '#FFFFFF',
      why: 'hover 底是 #2A2A2A 深灰而不是品牌橙，白字对比达 12.6:1；它不属于 --on-brand 的场景，必须保持白。',
    },
  },
  dark: {
    'Table.rowHoverBg': {
      expect: 'rgba(232,114,12,0.12)',
      why: '行 hover 是「brand 色 + 低透明度」的派生值，透明度(0.12)与 soft 令牌(0.14~0.18)不同档，'
        + '刻意不并进令牌表，避免为它增设一个只被一处使用的令牌。',
    },
    'Menu.itemHoverColor': {
      expect: '#FFFFFF',
      why: 'hover 底是深灰 #2E2E2E（不是品牌橙），白字 12.6:1，属于 --on-brand 的反面场景，必须保持白。',
    },
  },
}

/** 非颜色的 antd token（尺寸/阴影/字体）不参与色值对齐 */
const NON_COLOR_KEYS = new Set(['iconSize', 'iconMarginInlineEnd', 'primaryShadow', 'headerColor'])

const isColor = (value: unknown): value is string =>
  typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgba(') || value.startsWith('rgb('))

function flatten(components: unknown, prefix = ''): Array<[string, string]> {
  return Object.entries(components as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (isColor(value)) return [[path, value]]
    if (value && typeof value === 'object') return flatten(value, path)
    return []
  })
}

describe('antd 色值 token 必须逐项对齐语义令牌', () => {
  it.each(['light', 'dark'] as const)('%s 侧全局 token 不得出现未纳管的色值', (side) => {
    const align = TOKEN_ALIGN[side]
    const drift = KNOWN_DRIFT[side]
    const unmanaged = Object.entries(ANTD_TOKENS[side] ?? {}).flatMap(([key, value]) => {
      if (!isColor(value)) return []
      if (align[key] || drift[key]) return []
      return [`${key}=${value}`]
    })
    expect(unmanaged, `新增 antd 色值 token 未与令牌对齐：${unmanaged.join(', ')}`).toEqual([])
  })

  it.each(['light', 'dark'] as const)('%s 侧对齐项的取值必须等于令牌值', (side) => {
    const mismatch = Object.entries(TOKEN_ALIGN[side]).flatMap(([key, tokenName]) => {
      const antdValue = String((ANTD_TOKENS[side] as Record<string, unknown>)[key] ?? '').toLowerCase()
      const tokenValue = ALL_TOKENS[tokenName][side].toLowerCase()
      return antdValue === tokenValue ? [] : [`${key}: antd=${antdValue} 令牌=${tokenValue}`]
    })
    expect(mismatch, `双源取值不一致：${mismatch.join('; ')}`).toEqual([])
  })

  it.each(['light', 'dark'] as const)('%s 侧组件级色值不得出现未纳管项', (side) => {
    const align = COMPONENT_ALIGN[side]
    const drift = COMPONENT_DRIFT[side]
    const unmanaged = flatten(ANTD_COMPONENTS[side]).flatMap(([path, value]) => {
      const leaf = path.split('.').pop() ?? ''
      if (NON_COLOR_KEYS.has(leaf)) return []
      return align[path] || drift[path] ? [] : [`${path}=${value}`]
    })
    expect(unmanaged, `新增组件色值未与令牌对齐：${unmanaged.join(', ')}`).toEqual([])
  })

  it.each(['light', 'dark'] as const)('%s 侧组件级对齐项的取值必须等于令牌值', (side) => {
    const flat = new Map(flatten(ANTD_COMPONENTS[side]))
    const mismatch = Object.entries(COMPONENT_ALIGN[side]).flatMap(([path, tokenName]) => {
      const antdValue = String(flat.get(path) ?? '缺失').toLowerCase()
      const tokenValue = ALL_TOKENS[tokenName][side].toLowerCase()
      return antdValue === tokenValue ? [] : [`${path}: antd=${antdValue} 令牌=${tokenValue}`]
    })
    expect(mismatch, `双源取值不一致：${mismatch.join('; ')}`).toEqual([])
  })

  it.each(['light', 'dark'] as const)('%s 侧登记的每处已知漂移都必须仍然成立且带理由', (side) => {
    const flat = new Map<string, string>([
      ...Object.entries(ANTD_TOKENS[side] ?? {}).filter(([, v]) => isColor(v)).map(([k, v]) => [k, String(v)]),
      ...flatten(ANTD_COMPONENTS[side]),
    ] as Array<[string, string]>)
    const stale = Object.entries(KNOWN_DRIFT[side]).flatMap(([path, { expect }]) => {
      const current = flat.get(path)
      if (!current) return [`${path} 已不存在，登记项该删`]
      return current.toLowerCase() === expect.toLowerCase() ? [] : [`${path} 现为 ${current}，登记值 ${expect} 已过期`]
    })
    expect(stale, `KNOWN_DRIFT 登记过期：${stale.join('; ')}`).toEqual([])
  })
})

describe('深色主题的关键取值必须是实测过的值，不得回落到浅色', () => {
  it('深色三阶表面必须比浅色暗，且明度顺序为 侧边栏 < 内容区 < 浮层', () => {
    expect(ALL_TOKENS['sidebar-bg'].dark).toBe('#1A1A1A')
    expect(ALL_TOKENS['surface-2'].dark).toBe('#1F1F1F')
    expect(ALL_TOKENS['surface-3'].dark).toBe('#262626')
  })

  it('品牌橙底前景在深色必须取深色（这是 §4.6 的定版结论，不能被改回白色而无人发现）', () => {
    expect(ALL_TOKENS['on-brand'].dark).toBe('#141414')
    expect(ALL_TOKENS['on-brand'].light).toBe('#FFFFFF')
    expect(ANTD_COMPONENTS.dark.Button?.primaryColor).toBe('#141414')
    expect(ANTD_COMPONENTS.dark.Menu?.itemSelectedColor).toBe('#141414')
  })

  it('深色阴影必须比浅色更深，且描边补偿必须是**可叠加的 box-shadow 形式**', () => {
    expect(ALL_TOKENS['shadow-1'].dark).toContain('0.45')
    /*
     * card-outline 写成 `1px solid …`（border 简写）时无法与 box-shadow 叠加，
     * 改用 border 又会改变盒模型尺寸。所以两侧都必须是 `<offset> <size> <color>` 形式的阴影。
     * 浅色也不能用 none：none 会让整条 `box-shadow: var(--shadow-1), var(--card-outline)` 声明非法。
     */
    for (const side of ['light', 'dark'] as const) {
      const outline = ALL_TOKENS['card-outline'][side]
      // 不能是 border 简写（`Npx solid <color>`）；注意不能用 /border/ 判，
      // 深色值 `0 0 0 1px var(--border-2)` 里的令牌名含 border 字样，会被误判。
      expect(outline).not.toMatch(/^\d+px\s+solid\s/)
      expect(outline).toMatch(/^0 0 0 1px /)
    }
    expect(ALL_TOKENS['card-outline'].light).toContain('transparent')
    expect(ALL_TOKENS['card-outline'].dark).toContain('var(--border-2)')
  })

  it('每档黑色阴影的深色 alpha 必须比浅色更深（否则切深色后层次依旧糊）', () => {
    const alphaOf = (v: string) => Number(v.match(/rgba\([^)]*,\s*([0-9.]+)\)/)?.[1] ?? '1')
    const offenders = Object.entries(NON_COLOR_TOKENS)
      .filter(([name]) => name.startsWith('shadow-') || name === 'sidebar-shadow')
      .filter(([, v]) => !v.light.includes('rgba(0,0,0')) // 彩色阴影不参与
      .filter(([, v]) => alphaOf(v.dark) <= alphaOf(v.light))
      .map(([name]) => name)
    expect(offenders, `深色未加强的黑色阴影档：${offenders.join(', ')}`).toEqual([])
  })
})
