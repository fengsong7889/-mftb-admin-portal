/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 */
/**
 * 品牌底前景覆写的**特异性守卫**（方案 §4.6.5；补 PR #43 留下的那句「jsdom 证不了赢没赢」）。
 *
 * 为什么值得单独一个文件：#43 的断言只能钉「规则存在 + 取值正确」，而真正要紧的问题是
 * 「这三条能不能压过 antd CSS-in-JS 注入的同一条声明」。浏览器截图能回答它，但要人工点、
 * 且不进 CI；本文件把它变成每次 PR 都跑的机验。
 *
 * 三条实测前提（不是假设，全部来自本仓 antd 5.29.3 的注入文本）：
 * 1. antd 把 hashId 包在 `:where(.css-dev-only-do-not-override-…)` 里，而 `:where()` 特异性**恒为 0**
 *    → antd 规则的权重只由真类名贡献（已在本文件的自证用例里钉住）。
 * 2. Checkbox 勾号用**单冒号 `:after`**，Radio 内圆点用 `::after` → 两者同属伪元素列，
 *    匹配前必须把两侧都规范化（`::` → `:`），否则一刀切会漏掉 radio 或漏掉 checkbox。
 * 3. Checkbox 的白色写在**基态** `.ant-checkbox .ant-checkbox-inner:after`（不在 -checked 作用域里），
 *    并且用 `border` 简写声明 —— 简写同样设定 border-color，所以它是竞品，必须计入比较。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Checkbox, Radio, Switch } from 'antd'

const COMPONENTS_CSS = readFileSync(join(process.cwd(), 'frontend/packages/ui/src/styles/components.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '') // 注释里会写 #fff 等取值，不能参与选择器/声明匹配

/** 规范化：去掉零权重的 :where() 外壳，并把 :: 折成 : 让两种冒号写法可比 */
const canon = (sel: string) => sel.replace(/:where\([^)]*\)/g, '').replace(/::/g, ':').replace(/\s+/g, ' ').trim()

/**
 * 标准特异性 (a,b,c) → 可比较整数：a=ID，b=类/属性/伪类，c=元素与伪元素。
 * 两个必须做对的点（都是本轮实测踩的坑）：
 *  - `:where()` 内部**不贡献任何权重**（antd 5 的 hashId 就包在里面）；
 *  - 伪元素不论单/双冒号都计入 c，**不能当伪类算**（探针初版把 `:after` 归入 b，虚高了 100）。
 */
function specificity(selector: string): number {
  let s = selector.replace(/:where\([^)]*\)/g, ' ').replace(/:is\([^)]*\)/g, ' ')
  const pe = (s.match(/::?(?:after|before|first-line|first-letter|selection)\b/g) || []).length
  s = s.replace(/::?(?:after|before|first-line|first-letter|selection)\b/g, ' ')
  const ids = (s.match(/#[\w-]+/g) || []).length
  s = s.replace(/#[\w-]+/g, ' ')
  const attrs = (s.match(/\[[^\]]*\]/g) || []).length
  s = s.replace(/\[[^\]]*\]/g, ' ')
  const classes = (s.match(/\.[\w-]+/g) || []).length
  s = s.replace(/\.[\w-]+/g, ' ')
  const pseudoClasses = (s.match(/:[\w-]+(?:\([^)]*\))?/g) || []).length
  s = s.replace(/:[\w-]+(?:\([^)]*\))?/g, ' ')
  const elements = (s.match(/[a-zA-Z][\w-]*/g) || []).length
  return ids * 10000 + (attrs + classes + pseudoClasses) * 100 + (elements + pe)
}

/** 手算对照表：先把工具钉住，再用它去比。工具本身错的话后面全部结论作废 */
const SPEC_CASES: Array<[string, number]> = [
  ['.ant-checkbox-wrapper', 100],
  ['.a .b:after', 201],
  ['.a .b::after', 201],
  [':where(.css-dev-only-do-not-override-abc).ant-checkbox-wrapper', 100],
  ['html[data-theme=\'dark\'] .ant-checkbox-checked .ant-checkbox-inner::after', 302],
  [':where(.hash).ant-switch .ant-switch-inner .ant-switch-inner-unchecked', 300],
  [':where(.hash).ant-radio-wrapper .ant-radio-checked .ant-radio-inner::after', 301],
]

function rulesOf(css: string): Array<{ sel: string; decl: string }> {
  return css
    .split('}')
    .map((b) => (b.includes('{')
      ? { head: b.slice(0, b.indexOf('{')).replace(/\s+/g, ' ').trim(), body: b.slice(b.indexOf('{') + 1).trim() }
      : null))
    .filter((x): x is { head: string; body: string } =>
      x !== null && x.head.length > 0 && !x.head.startsWith('@'))
    .flatMap((x) => x.head.split(',').map((sel) => ({ sel: sel.trim(), decl: x.body })))
}

/** 属性等价：`border` 简写同样设定 border-color，`background` 同样设定 background-color */
const ALIASES = {
  'border-color': ['border-color', 'border'],
  'background-color': ['background-color', 'background'],
  color: ['color'],
} as const

type Prop = keyof typeof ALIASES

/** 目标尾段（规范化后的形式），Checkbox/Radio 归一到 `:after` 以同时命中两种冒号写法 */
const OURS: Array<{ prop: Prop; tail: string; label: string }> = [
  { prop: 'border-color', tail: 'ant-checkbox-inner:after', label: 'Checkbox 勾号' },
  { prop: 'background-color', tail: 'ant-radio-inner:after', label: 'Radio 内圆点' },
  { prop: 'color', tail: 'ant-switch-inner-checked', label: 'Switch 选中文字' },
]

describe('品牌底前景覆写必须赢下 antd 的同属性声明（特异性机验）', () => {
  let antdCss = ''

  beforeAll(() => {
    render(
      <div>
        <Checkbox checked />
        <Radio checked />
        <Switch checked checkedChildren="啟用" />
      </div>,
    )
    antdCss = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
  })

  it.each(SPEC_CASES)('特异性工具本身：%s 必须等于手算值 %i', (sel, want) => {
    expect(specificity(sel), `手算对照失败：${sel}`).toBe(want)
  })

  it('自证探针有效：抓到 antd 注入规则，且 :where 包 hashId 不带来任何权重', () => {
    expect(rulesOf(antdCss).length, '没抓到 antd 注入样式，后续比较全部无意义').toBeGreaterThan(10)
    expect(specificity(':where(.css-dev-only-do-not-override-abc).ant-checkbox-wrapper'))
      .toBe(specificity('.ant-checkbox-wrapper'))
    // 伪元素冒号形态不能影响权重（探针第一版就是在这里算错的）
    expect(specificity('.a .b:after')).toBe(specificity('.a .b::after'))
  })

  it.each(OURS)('$label：$prop 的覆写权重必须严格高于 antd 全部竞品', ({ prop, tail }) => {
    const ours = rulesOf(COMPONENTS_CSS).filter(
      (r) => canon(r.sel).endsWith(tail) && r.sel.includes("data-theme='dark'") &&
        new RegExp(`(^|;)\\s*${prop}\\s*:\\s*var\\(--on-brand\\)\\s*!?`, 'i').test(r.decl),
    )
    expect(ours.length, `components.css 里找不到「…${tail} { ${prop}: var(--on-brand) }」`).toBeGreaterThan(0)

    const competitors = rulesOf(antdCss)
      .filter((r) => canon(r.sel).endsWith(tail))
      .filter((r) => ALIASES[prop].some((p) => new RegExp(`(^|;)\\s*${p}\\s*:`, 'i').test(r.decl)))
      .map((r) => ({ sel: r.sel, spec: specificity(r.sel) }))

    // 阳性对照：竞品为空说明口径写错了，绝不允许「没找到对手」被当成通过
    expect(competitors.length, `antd 侧没有任何规则设定 ${prop}（尾段 ${tail}）——探针口径失效`).toBeGreaterThan(0)

    const worst = Math.max(...competitors.map((c) => c.spec))
    const mine = Math.min(...ours.map((o) => specificity(o.sel)))
    expect(mine,
      `我们 ${mine} 必须严格大于 antd 最大 ${worst}` +
      `\n  我们: ${ours.map((o) => `${specificity(o.sel)} ${o.sel}`).join('\n        ')}` +
      `\n  antd: ${competitors.map((c) => `${c.spec} ${c.sel}`).join('\n        ')}`,
    ).toBeGreaterThan(worst)
  })

  it('不动清单不得出现在覆写里（滑柄白圆点 / 半选方块 / 未选中文字）', () => {
    const touched = rulesOf(COMPONENTS_CSS)
      .filter((r) => r.sel.includes("data-theme='dark'") && /--on-brand/.test(r.decl))
      .map((r) => canon(r.sel))
    const forbidden = ['ant-switch-inner-unchecked', 'ant-checkbox-indeterminate', 'ant-switch-handle']
    const wrong = forbidden.filter((f) => touched.some((sel) => sel.includes(f)))
    expect(wrong, `这三处的底不是品牌橙，覆写会制造新的不可读：${wrong.join(' | ')}`).toEqual([])
  })
})

/**
 * 登录页画布必须不随主题变（§8.5 第 1 项，真实浏览器实测后补的守卫）。
 *
 * 背景：theme.css 的 FOUC 规则 `html { background: var(--surface-2) }` 会跟随主题，
 * 而登录页根容器是透明的（颜色来自视频本体）。浏览器实测：切深色后 html 计算值
 * 从 rgb(255,255,255) 变成 rgb(31,31,31)，但 23 个可见文字元素的颜色 0 处变化
 * → “登录页不变”在文字/玻璃面板上成立，**只在画布这一层泄露**。
 * 本项把这个结论钉住，而不是留在一次性实测里。
 */
describe('登录页不受主题接管（画布层也要钉住）', () => {
  it('必须存在 html:has(.login-page-video) 的固定背景规则，且不取任何主题令牌', () => {
    const rule = rulesOf(COMPONENTS_CSS).find(
      (r) => r.sel.includes(':has(.login-page-video)') && /(^|;)\s*background\s*:/i.test(r.decl),
    )
    expect(rule, '缺少登录页期间的画布固定规则，深色下会露出 var(--surface-2) 深画布').toBeTruthy()
    expect(rule!.decl.toLowerCase()).not.toContain('var(--')
    // 特异性必须高于 theme.css 的 `html`（0,0,1），否则静默失效
    expect(specificity(rule!.sel)).toBeGreaterThan(specificity('html'))
  })
})
