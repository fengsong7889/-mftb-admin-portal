// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题令牌映射表单测（方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §5.2）。
 *
 * 这里守的不是「函数算得对不对」，而是三条一旦破防就会造成大面积静默错误的判据：
 *
 * 1. **严格等值**：映射表里每个色值必须与目标令牌的浅色值完全相同。
 *    破防后果：浅色主题下颜色被悄悄改掉，「令牌化是视觉恒等变换」这个
 *    让整个方案能分批推进的前提直接失效，且 1 万处替换里找不出是哪一处错了。
 *    这条判据原本靠人工核对，实测已漏过一处（#FFF7ED 被映射到 --brand-soft #FFF7F0）。
 *
 * 2. **属性上下文可分类**：classifyProperty 必须同时认 CSS 连字符式与 React 驼峰式。
 *    破防后果：9042 处内联色值全部落到 null 被跳过，codemod 跑完 0 报错、一处未改。
 *
 * 3. **排除规则不误伤**：`.test.ts` 这类后缀规则只能用 endsWith。
 *    破防后果：`'a.tsx'.includes('.ts')` 为 true，整个前端被排除，统计恒为 0、棘轮形同虚设。
 */
import { describe, it, expect } from 'vitest'
// readFileSync 只为「读自己源码查重复键」那条断言服务：重复键在运行时会被静默合并，
// 只能像门禁核 theme.css 那样从文本层抓出来。
import { readFileSync } from 'node:fs'
import {
  COLOR_TO_TOKEN,
  COMPONENT_TOKENS,
  EXCLUDE_PATHS,
  INTENTIONAL_VALUE_DUPLICATES,
  NON_COLOR_TOKENS,
  REVIEW_REQUIRED,
  SCENE_COLOR_BASELINE,
  SEMANTIC_TOKENS,
  TOKEN_VALUES,
  classifyProperty,
  contrastRatio,
  countBareColors,
  isExcluded,
  isExcludedSelector,
  normalizeHex,
  relativeLuminance,
} from './theme-token-map.mjs'

/**
 * 深浅两主题有意保持同值的令牌。它们不是“忘了配深色”，而是**语义不随主题翻面**：
 *   brand / brand-hover —— 品牌橙是品牌识别锚点，深色下实测 5.37:1 反而优于浅色底；
 *   medal-* / on-medal —— 金/银/铜是**排名编码**，压暗就不再是金牌；而配套数字前景
 *     必须跟着金属色走而不是跟着主题走（主题翻面会弄断唯一达标的那对关系）。
 * 新加名字进本集合前先问：这个颜色代的是“品牌/实体/编码”，还是“主题表面”？
 * 后者永远不该出现在这里，它应该去配真正的深/浅两档。
 */
const INTENTIONAL_SAME_VALUE = new Set(['brand', 'brand-hover', 'medal-gold', 'medal-silver', 'medal-bronze', 'on-medal'])

const ALL_TOKEN_NAMES = [...SEMANTIC_TOKENS, ...COMPONENT_TOKENS]
const ALL_TOKEN_VALUES = { ...TOKEN_VALUES, ...NON_COLOR_TOKENS }

describe('令牌去重：不允许未登记的「浅深两值全同」重复令牌', () => {
  // 本次 --text-inverse 差点被当成新令牌 --on-brand 新增，就是靠这条抓出来的。
  // 浅深全同的令牌映射到任一侧渲染结果一致（不属于 #333333 那种真歧义），
  // 但必须当场决定「合并」还是「做别名并登记理由」，不能等到漂移后才追认。
  it('INTENTIONAL_VALUE_DUPLICATES 中的令牌名必须都存在', () => {
    const unknown = INTENTIONAL_VALUE_DUPLICATES
      .flatMap(([a, b]) => [a, b])
      .filter((name) => !(name in TOKEN_VALUES))
    expect(unknown, `白名单引了不存在的令牌：${unknown.join(', ')}`).toEqual([])
  })

  it('每条登记都必须给出为何保留两个名字的理由', () => {
    const thin = INTENTIONAL_VALUE_DUPLICATES.filter(([, , why]) => !why || why.length < 12).map((p) => p[0])
    expect(thin).toEqual([])
  })

  it('除已登记别名外，不得存在浅深两值都与另一令牌相同的令牌', () => {
    const names = Object.keys(TOKEN_VALUES)
    const allowed = new Set(INTENTIONAL_VALUE_DUPLICATES.map(([a, b]) => [a, b].sort().join('|')))
    const dup = []
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const [x, y] = [TOKEN_VALUES[names[i]], TOKEN_VALUES[names[j]]]
        const same = x.light.toLowerCase() === y.light.toLowerCase() && x.dark.toLowerCase() === y.dark.toLowerCase()
        if (same && !allowed.has([names[i], names[j]].sort().join('|'))) dup.push(`${names[i]} = ${names[j]}`)
      }
    }
    expect(dup, `未登记的重复令牌：${dup.join('; ')}`).toEqual([])
  })
})

describe('对比度门槛（方案 §4.5 实测矩阵的机验版）', () => {
  // 口径边界（诚实标注，不是假装全覆盖）：
  // 只断言 surface-1（页面底）与 surface-2（卡片底）——那是文字与图标的主场景。
  // 不含 surface-3(#262626 表头/只读底)：那里只放 text-1/text-2 级文字，不上彩色文字；
  // 实测 --purple on #262626 = 4.36，强行纳入会逼出一个当前并不可恶的提亮。
  const SURFACES = ['surface-1', 'surface-2']

  const assertAA = (tokens, floor = 4.5) => {
    const bad = []
    for (const token of tokens) {
      for (const surface of SURFACES) {
        const ratio = contrastRatio(TOKEN_VALUES[token].dark, TOKEN_VALUES[surface].dark)
        if (ratio < floor) bad.push(`${token}/${surface}=${ratio.toFixed(2)}`)
      }
    }
    expect(bad, `低于 ${floor}:1：${bad.join(', ')}`).toEqual([])
  }

  it('深色文字令牌在页面底/卡片底必须 ≥ 4.5:1', () => assertAA(['text-1', 'text-2', 'text-3', 'text-brand']))
  it('深色语义色在页面底/卡片底必须 ≥ 4.5:1', () => assertAA(['brand', 'brand-hover', 'success', 'info', 'warning', 'danger', 'purple']))

  it('--text-4 属非正文（禁用态/滚动条），按 3:1 口径守', () => assertAA(['text-4'], 3.0))

  it('边框类按例外①登记，不断言达标，但必须与底色有可感知差异（比值 > 1）', () => {
    const invisible = []
    for (const border of ['border-1', 'border-2', 'border-3', 'border-input']) {
      const ratio = contrastRatio(TOKEN_VALUES[border].dark, TOKEN_VALUES['surface-2'].dark)
      if (ratio <= 1.1) invisible.push(`${border}=${ratio.toFixed(2)}`)
    }
    expect(invisible, `深色下几乎不行在的边框：${invisible.join(', ')}`).toEqual([])
  })

  it('--on-brand 在品牌橙底上：深色必须达 AA，浅色维持现状（既有债务④不正在本次修）', () => {
    const bg = TOKEN_VALUES.brand.light
    const dark = contrastRatio(TOKEN_VALUES['on-brand'].dark, bg)
    const light = contrastRatio(TOKEN_VALUES['on-brand'].light, bg)
    // 深色取 #141414 → 6.00，是本次定版的根据
    expect(dark).toBeGreaterThanOrEqual(4.5)
    // 浅色保持 #FFFFFF（3.07）：改它会动全站主按钮观感，属方案 §4.5 登记的独立议题④
    expect(light).toBeGreaterThanOrEqual(3.0)
  })

  it('浅色正文主色必须达 AA（存量现状不得因改名或调值回退）', () => {
    const bg = TOKEN_VALUES['surface-2'].light
    expect(contrastRatio(TOKEN_VALUES['text-1'].light, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(TOKEN_VALUES['text-2'].light, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('补充阶令牌的合成对比度（danger-callout / warning-deep / info-hover-tint）', () => {
  /*
   * 为什么必须单独写这一组：上面那组的 SURFACES 只有 surface-1/2，而这三个令牌
   * 是叠在别的令牌上的「邻阶」：danger-callout / info-hover-tint 是背景，
   * warning-deep 是坐在 warning-soft 底上的前景。它们全部落在既有断言的覆盖范围之外，
   * 不补就是「令牌加了、门禁根本没看它」（§16.2 第 5 条那类静默空比对）。
   *
   * 深色值是 rgba，而 contrastRatio 不处理 alpha（传 rgba 会返回 null），
   * 所以先把 tint 合成到它实际所在的卡片底上再算——不手算：真源明写「禁止凭估算修改」。
   */
  const toRgb = (s) => {
    if (s.startsWith('#')) {
      const h = s.length === 4 ? `#${[...s.slice(1)].map((c) => c + c).join('')}` : s
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 1]
    }
    const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => Number(x.trim()))
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  /** 把带 alpha 的 tint 合成到不透明背板下，得到实际渲染色 */
  const over = (tint, base) => {
    const [fr, fg, fb, a] = toRgb(tint)
    const [br, bg, bb] = toRgb(base)
    return `#${[fr, fg, fb].map((v, i) => Math.round(v * a + [br, bg, bb][i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`
  }

  it('rgba 真处必须能合成出合法十六进制（防 tint 表达式写错后静默算出 NaN）', () => {
    for (const name of ['danger-callout', 'info-hover-tint', 'warning-soft', 'danger-soft']) {
      const composited = over(TOKEN_VALUES[name].dark, TOKEN_VALUES['surface-2'].dark)
      expect(composited, name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('--danger 深色在 danger-callout 合成底上必须达 AA', () => {
    const bg = over(TOKEN_VALUES['danger-callout'].dark, TOKEN_VALUES['surface-2'].dark)
    expect(contrastRatio(TOKEN_VALUES.danger.dark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('danger-callout 浅色侧不得低于存量值（实测 2.99，低于 AA 属既有债务，只守不变差）', () => {
    // 令牌化的目的是让深色跟随变化，不是顺手修浅色的对比度——那会动 29 处存量观感。
    // 但也不能因为建了令牌就把它当达标处理，所以按存量值卡下限而不是按 4.5 卡。
    expect(contrastRatio(TOKEN_VALUES.danger.light, TOKEN_VALUES['danger-callout'].light))
      .toBeGreaterThanOrEqual(2.9)
  })

  it('--warning-deep 深色在 warning-soft 合成底上必须达 AA', () => {
    const bg = over(TOKEN_VALUES['warning-soft'].dark, TOKEN_VALUES['surface-2'].dark)
    expect(contrastRatio(TOKEN_VALUES['warning-deep'].dark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('--warning-deep 浅色侧不得低于存量值（实测 3.34，低于正文 AA 属既有债务）', () => {
    // 这组存量就是 §18.6 登记的「提示条文字」形态：令牌化只保证两侧都跟随主题变，
    // 不把浅色从 3.34 拉到 4.5（那等于未讨论就改了全站 46 处观感）。
    expect(contrastRatio(TOKEN_VALUES['warning-deep'].light, TOKEN_VALUES['warning-soft'].light))
      .toBeGreaterThanOrEqual(3.3)
  })

  /*
   * geekblue 四件套与两个邻阶（info-deep / info-hover-border / warning-callout / brand-deep）。
   * 写这些断言的同一套合成算法，是因为 contrastRatio 不处理 alpha；数字全部来自实测。
   * 达标的按 AA 卡（≥ 4.5），不达标的按存量值卡住不回退，不假装达标（与 danger-callout 同一口径）。
   */
  it('info-deep 在 info-hover-tint 上两侧都必须达 AA（它是正文/图标前景）', () => {
    expect(contrastRatio(TOKEN_VALUES['info-deep'].light, TOKEN_VALUES['info-hover-tint'].light))
      .toBeGreaterThanOrEqual(4.5)
    const bg = over(TOKEN_VALUES['info-hover-tint'].dark, TOKEN_VALUES['surface-2'].dark)
    expect(contrastRatio(TOKEN_VALUES['info-deep'].dark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('brand-deep 在 brand-soft 上两侧都必须达 AA', () => {
    expect(contrastRatio(TOKEN_VALUES['brand-deep'].light, TOKEN_VALUES['brand-soft'].light))
      .toBeGreaterThanOrEqual(4.5)
    const bg = over(TOKEN_VALUES['brand-soft'].dark, TOKEN_VALUES['surface-2'].dark)
    expect(contrastRatio(TOKEN_VALUES['brand-deep'].dark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('两个 deep 前景令牌不得进 bg/border 段（同色值的背景用法必须继续人工判定）', () => {
    for (const seg of ['bg', 'border']) {
      for (const hex of ['2f54eb', 'ad4e00']) {
        expect(COLOR_TO_TOKEN[seg]?.[hex], `${seg} 段不该有 #${hex}`).toBeUndefined()
      }
    }
    // 反向也要卡住：描边令牌不能漏进背景段，否则 hover 底会被刷成描边令牌
    expect(COLOR_TO_TOKEN.bg?.d6e4ff).toBeUndefined()
  })

  /*
   * antd v4 实色灰两兄弟（text-hint / text-body）。
   * 它俩存量合计 229 处前景位，不建令牌则每个新批次撞上它们都会因为
   * 「一侧跟主题、一侧钉 #999/#666」而造出新半对（第九批就是在 AiAccessApply 的 hover 块上碰到的）。
   */
  it('text-body 两侧都必须达 AA（浅色 5.7418 / 深色 6.7710）', () => {
    expect(contrastRatio(TOKEN_VALUES['text-body'].light, TOKEN_VALUES['surface-2'].light))
      .toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(TOKEN_VALUES['text-body'].dark, TOKEN_VALUES['surface-2'].dark))
      .toBeGreaterThanOrEqual(4.5)
  })

  it('text-hint 深色必须达 AA；浅色按存量 2.84 卡下限（存量 a11y 欠标，不假装达标）', () => {
    expect(contrastRatio(TOKEN_VALUES['text-hint'].dark, TOKEN_VALUES['surface-2'].dark))
      .toBeGreaterThanOrEqual(4.5)
    // 实测 #999999 on 白底 = 2.8490，143 处都是这个观感。令牌化只保证两侧都跟随主题，
    // 不把下限抬到 4.5 来“做绿”（那会红），也不声称它达标：按存量卡住，防止取值被改得更差。
    expect(contrastRatio(TOKEN_VALUES['text-hint'].light, TOKEN_VALUES['surface-2'].light))
      .toBeGreaterThanOrEqual(2.8)
  })

  it('两个 v4 灰不得进 bg/border 段（#999 站内确有描边用法，不能被当背景色换）', () => {
    for (const seg of ['bg', 'border']) {
      for (const hex of ['999999', '666666']) {
        expect(COLOR_TO_TOKEN[seg]?.[hex], `${seg} 段不该有 #${hex}`).toBeUndefined()
      }
    }
  })

  it('同族文字令牌的亮度必须与重要性单调一致（浅色越不重要越浅、深色越不重要越暗）', () => {
    // 排序按浅色真值：#262626 < #595959 < #666666 < #8C8C8C < #999999 < #BFBFBF
    const rank = ['text-1', 'text-2', 'text-body', 'text-3', 'text-hint', 'text-4']
    for (let i = 1; i < rank.length; i += 1) {
      const prevL = parseInt(TOKEN_VALUES[rank[i - 1]].light.slice(1, 3), 16)
      const curL = parseInt(TOKEN_VALUES[rank[i]].light.slice(1, 3), 16)
      expect(curL, `浅色 ${rank[i]} 应不比 ${rank[i - 1]} 更深`).toBeGreaterThanOrEqual(prevL)
      const prevD = parseInt(TOKEN_VALUES[rank[i - 1]].dark.slice(1, 3), 16)
      const curD = parseInt(TOKEN_VALUES[rank[i]].dark.slice(1, 3), 16)
      expect(curD, `深色 ${rank[i]}(${TOKEN_VALUES[rank[i]].dark}) 不得比 ${rank[i - 1]}(${TOKEN_VALUES[rank[i - 1]].dark}) 更亮`).toBeLessThanOrEqual(prevD)
    }
  })

  it('每个段的 hex 键必须唯一：重复键会被后者静默覆盖，运行时根本看不出来', () => {
    /*
     * 真实踩过一次：本轮差点新建 --warning-callout（#FFF7E6），而 #FFF7E6 已是
     * --warning-soft 的浅色值且在 bg 段里。两个键入同一个对象不报错，后者胜，
     * 严格等值断言也照样通过（两个令牌的浅色值都与键相等）——所以这道检查必须读源码，
     * 像门禁核 theme.css 那样。另外只要把取值写错就会错得很静默。
     */
    const src = readFileSync(new URL('./theme-token-map.mjs', import.meta.url), 'utf8')
    const dupes = []
    for (const seg of ['bg', 'fg', 'border']) {
      const m = src.match(new RegExp(`\\n  ${seg}: \\{([\\s\\S]*?)\\n  \\},`))
      expect(m, `找不到 ${seg} 段，检查写法是否被动过`).toBeTruthy()
      const keys = [...m[1].matchAll(/^\s+'?([0-9a-f]{3,8})'?:/gm)].map((x) => x[1])
      const seen = new Set()
      for (const k of keys) {
        if (seen.has(k)) dupes.push(`${seg}.${k}`)
        seen.add(k)
      }
    }
    expect(dupes, `段内重复键（后者会静默覆盖前者）：${dupes.join(', ')}`).toEqual([])
  })

  it('同一浅色值不得在同一个段里映到两个不同令牌（跨段允许）', () => {
    // 上条查源码里的重复键；本条查「不同键但归一后同值」这种更阴的情况（如 #fff 与 #ffffff）。
    for (const seg of ['bg', 'fg', 'border']) {
      const byValue = new Map()
      for (const [hex, token] of Object.entries(COLOR_TO_TOKEN[seg])) {
        const norm = normalizeHex(hex)?.hex ?? hex
        const prev = byValue.get(norm)
        if (prev && prev !== token) expect.unreachable(`${seg} 段 #${norm} 同时映射到 --${prev} 与 --${token}`)
        byValue.set(norm, token)
      }
    }
  })

  it('--text-2 在 info-hover-tint 上两个主题都必须达 AA（hover 时文字不能消失）', () => {
    // 这条是第四批 ChannelStrategy 那个「hover 亮灰字压近白底 1.98:1」缺陷的回归锁：
    // 当时背景是裸值不跟随主题，前景已令牌化 → 深色下凑成低对比。
    expect(contrastRatio(TOKEN_VALUES['text-2'].light, TOKEN_VALUES['info-hover-tint'].light))
      .toBeGreaterThanOrEqual(4.5)
    const bg = over(TOKEN_VALUES['info-hover-tint'].dark, TOKEN_VALUES['surface-3'].dark)
    expect(contrastRatio(TOKEN_VALUES['text-2'].dark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('--info 图标在 info-hover-tint 色块上：深色必须达 3:1，浅色按存量值卡下限', () => {
    // 真实用法：EAM AssetInbound 的 icon-block 是 info-hover-tint 底 + --info 图标。
    // 不补这条，这个令牌就只被 text-2 场景守着，图标场景的取值变化没人管。
    //
    // ⚠ 写这条断言时才发现：**浅色侧本来就欠**——#1890FF on #F0F5FF 实测 2.97，
    //   低于非文本图形的 3.0 门槛。令牌化前后用的是同两个颜色，所以不是本次引入的回归。
    //   不把下限改成 2.9 来“做绿”，也不假装它达标：按存量值卡住回退，并把欠标这件事登记下来。
    const light = contrastRatio(TOKEN_VALUES.info.light, TOKEN_VALUES['info-hover-tint'].light)
    expect(light, '浅色侧存量 2.97，不得因改令牌取值而变差').toBeGreaterThanOrEqual(2.9)
    const bg = over(TOKEN_VALUES['info-hover-tint'].dark, TOKEN_VALUES['surface-3'].dark)
    expect(contrastRatio(TOKEN_VALUES.info.dark, bg)).toBeGreaterThanOrEqual(3.0)
  })

  /*
   * 描边阶令牌（danger/warning/success/info/purple-border）。
   * 必须单独写：上面两组断言算的是「文字/图形坐在背板上」，而描边两者都不是，
   * 不补就是「令牌加了、没人看它」。同时这里**不声称达到 WCAG**：描边本身就是
   * antd 预设的 1.2~1.9 细线，拿 3.0/4.5 卡它是假命题；正确的守卫是「不得比现状差」，
   * 下限取实测观测值：五个新令牌浅色最低 1.3731、深色合成最差 1.5833，
   * 既有 brand-border 是 1.1930 / 1.6212。所以卡 1.15 与 1.55：既容纳存量，又挡住回退。
   */
  const BORDER_TOKENS = ['danger-border', 'warning-border', 'success-border', 'info-border', 'purple-border', 'info-hover-border', 'brand-border']
  const CARD_BACKS = ['surface-1', 'surface-2', 'surface-3']

  it('描边阶深色值必须能合成出合法十六进制（rgba 写错会静默算出 NaN）', () => {
    for (const name of BORDER_TOKENS) {
      for (const back of CARD_BACKS) {
        const composited = over(TOKEN_VALUES[name].dark, TOKEN_VALUES[back].dark)
        expect(composited, `${name} on ${back}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('描边阶深色值必须是带 alpha 的 rgba 四元（缺 alpha 会被静默当成不透明）', () => {
    // 变异验证跑出来的真实缺口：`rgba(64,169,)` 这种写错形态，前面的「合成合法十六进制」
    // 断言抓不住——toRgb 拿到三个数、alpha 默认 1，照样合成出一个合法 hex，
    // 只是颜色完全错了。叠加型令牌的全部语义就建在 alpha 上，所以这里按严格四元卡。
    for (const name of BORDER_TOKENS) {
      const m = TOKEN_VALUES[name].dark.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/)
      expect(m, `${name} 的深色值必须是 rgba(r,g,b,a) 四元，实际：${TOKEN_VALUES[name].dark}`).not.toBeNull()
      const a = Number(m[4])
      expect(a, `${name} 的 alpha 必须落在 (0,1)`).toBeGreaterThan(0)
      expect(a, `${name} 的 alpha 必须落在 (0,1)`).toBeLessThan(1)
    }
  })

  it.each(BORDER_TOKENS)('%s 浅色侧可见性不得跌到 1.15 以下（存量下限 1.1930）', (name) => {
    expect(contrastRatio(TOKEN_VALUES[name].light, TOKEN_VALUES['surface-2'].light))
      .toBeGreaterThanOrEqual(1.15)
  })

  it.each(BORDER_TOKENS)('%s 深色侧合成后可见性不得跌到 1.55 以下（观测最差 1.5833）', (name) => {
    for (const back of CARD_BACKS) {
      const bg = over(TOKEN_VALUES[name].dark, TOKEN_VALUES[back].dark)
      expect(contrastRatio(bg, TOKEN_VALUES[back].dark), `${name} on ${back}`)
        .toBeGreaterThanOrEqual(1.55)
    }
  })
})

describe('严格等值判据（映射表 ↔ 令牌浅色值）', () => {
  it.each(['bg', 'fg', 'border'])('%s 段的每个映射都必须与令牌浅色值完全相同', (segment) => {
    const violations = []
    for (const [color, token] of Object.entries(COLOR_TO_TOKEN[segment])) {
      const expected = normalizeHex(TOKEN_VALUES[token]?.light ?? '')
      if (!expected || expected.hex !== color) {
        violations.push(`#${color} → --${token}（浅色值 ${TOKEN_VALUES[token]?.light ?? '未定义'}）`)
      }
    }
    expect(violations, `以下映射会改变浅色视觉：${violations.join('; ')}`).toEqual([])
  })

  it('映射表引用的令牌必须已在清单中声明', () => {
    const referenced = Object.values(COLOR_TO_TOKEN).flatMap((seg) => Object.values(seg))
    const undeclared = [...new Set(referenced)].filter((t) => !ALL_TOKEN_NAMES.includes(t))
    expect(undeclared, `引用了未声明令牌：${undeclared.join(', ')}`).toEqual([])
  })

  it('映射表键必须是归一化后的 6 位小写十六进制', () => {
    const bad = Object.values(COLOR_TO_TOKEN)
      .flatMap((seg) => Object.keys(seg))
      .filter((key) => !/^[0-9a-f]{6}$/.test(key))
    expect(bad, `未归一化的键会永远匹配不上：${bad.join(', ')}`).toEqual([])
  })
})

describe('令牌清单一致性', () => {
  it('令牌名清单与取值表的 key 集合必须双向相等', () => {
    expect([...ALL_TOKEN_NAMES].sort()).toEqual(Object.keys(ALL_TOKEN_VALUES).sort())
  })

  it('每个令牌都必须同时给出 light 与 dark 值', () => {
    const incomplete = Object.entries(ALL_TOKEN_VALUES)
      .filter(([, v]) => !v.light || !v.dark)
      .map(([k]) => k)
    expect(incomplete, `缺主题值会导致静默 fallback：${incomplete.join(', ')}`).toEqual([])
  })

  it('soft / tint / callout / 描边类令牌的深色值必须用 rgba 混合，不得用浅色实底', () => {
    // 后缀集合要覆盖所有「叠加型」令牌：只认 -soft 会让新加的 *-tint / *-callout / *-border 静默逃过。
    // 不会误伤中性描边：border-1/2/3/border-input 不以 -border 结尾（它们就该是实色）。
    const TINT_SUFFIXES = /(-soft|-tint|-callout|-border)$/
    const offenders = Object.entries(TOKEN_VALUES)
      .filter(([name]) => TINT_SUFFIXES.test(name))
      .filter(([, v]) => !v.dark.startsWith('rgba('))
      .map(([name, v]) => `${name}=${v.dark}`)
    expect(offenders, `深色下浅色实底会刺眼：${offenders.join(', ')}`).toEqual([])
  })

  it('深浅同值只能出现在已登记的语义编码上（其余同值意味着切换无效果）', () => {
    const same = Object.entries(TOKEN_VALUES)
      .filter(([, v]) => v.light.toLowerCase() === v.dark.toLowerCase())
      .map(([name]) => name)
    expect(same.filter((n) => !INTENTIONAL_SAME_VALUE.has(n))).toEqual([])
  })

  it('深色底不得用纯黑（方案 §4.3 规则 1）', () => {
    const pureBlack = Object.entries(TOKEN_VALUES)
      .filter(([name]) => name.startsWith('surface'))
      .filter(([, v]) => v.dark.toLowerCase() === '#000000')
      .map(([name]) => name)
    expect(pureBlack).toEqual([])
  })
})

describe('映射表与人工判定清单互斥', () => {
  it('同一色值不得既自动替换又列为待人工判定', () => {
    const auto = new Set(Object.values(COLOR_TO_TOKEN).flatMap((seg) => Object.keys(seg)))
    const overlap = Object.keys(REVIEW_REQUIRED).filter((c) => auto.has(c))
    expect(overlap, `口径冲突：${overlap.join(', ')}`).toEqual([])
  })

  it('每条 REVIEW_REQUIRED 都必须写明不能机械替换的理由', () => {
    const empty = Object.entries(REVIEW_REQUIRED).filter(([, why]) => !why || why.trim().length < 8).map(([c]) => c)
    expect(empty).toEqual([])
  })
})

describe('normalizeHex', () => {
  it('3 位缩写必须展开为 6 位，否则同一颜色会裂成两项让棘轮失真', () => {
    expect(normalizeHex('#FFF')).toEqual({ hex: 'ffffff', hasAlpha: false })
    expect(normalizeHex('fff')).toEqual({ hex: 'ffffff', hasAlpha: false })
  })

  it('大小写归一 + 8 位截前 6 位并标记 alpha', () => {
    expect(normalizeHex('#E8720C')).toEqual({ hex: 'e8720c', hasAlpha: false })
    expect(normalizeHex('#E8720CCC')).toEqual({ hex: 'e8720c', hasAlpha: true })
  })

  it('非法输入返回 null（4 位、含非十六进制字符、空串）', () => {
    expect(normalizeHex('#abcd')).toBeNull()
    expect(normalizeHex('#gggggg')).toBeNull()
    expect(normalizeHex('')).toBeNull()
  })
})

describe('classifyProperty', () => {
  it('CSS 连字符式：填充归 bg、文字归 fg、描边与阴影归 border', () => {
    expect(classifyProperty('background')).toBe('bg')
    expect(classifyProperty('background-color')).toBe('bg')
    expect(classifyProperty('fill')).toBe('bg')
    expect(classifyProperty('color')).toBe('fg')
    expect(classifyProperty('border')).toBe('border')
    expect(classifyProperty('border-top')).toBe('border')
    expect(classifyProperty('border-top-color')).toBe('border')
    expect(classifyProperty('box-shadow')).toBe('border')
    expect(classifyProperty('outline')).toBe('border')
    expect(classifyProperty('stroke')).toBe('border')
  })

  it('React 驼峰式必须同样可分类（漏了会让 9042 处内联替换静默失效）', () => {
    expect(classifyProperty('backgroundColor')).toBe('bg')
    expect(classifyProperty('color')).toBe('fg')
    expect(classifyProperty('boxShadow')).toBe('border')
    expect(classifyProperty('borderTopColor')).toBe('border')
    expect(classifyProperty('borderTop')).toBe('border')
  })

  it('vendor 前缀属性归 fg', () => {
    expect(classifyProperty('WebkitTextFillColor')).toBe('fg')
    expect(classifyProperty('-webkit-text-fill-color')).toBe('fg')
  })

  it('不承载颜色语义的属性返回 null（border-radius 虽以 border 开头但值是尺寸）', () => {
    expect(classifyProperty('borderRadius')).toBeNull()
    expect(classifyProperty('border-radius')).toBeNull()
    expect(classifyProperty('width')).toBeNull()
    expect(classifyProperty('transition')).toBeNull()
    expect(classifyProperty('marginBottom')).toBeNull()
    expect(classifyProperty('fontSize')).toBeNull()
  })
})

describe('isExcluded', () => {
  it('测试文件被排除，但普通 tsx 绝不能被 .test.ts 规则误伤', () => {
    expect(isExcluded('src/pages/OrderDetail/index.test.tsx')).toBe(true)
    expect(isExcluded('src/pages/OrderDetail/index.test.ts')).toBe(true)
    // 回归：曾用 includes('.ts') 判断，导致所有 .tsx 被排除、统计恒为 0
    expect(isExcluded('src/pages/OrderDetail/index.tsx')).toBe(false)
    expect(isExcluded('frontend/packages/ui/src/components/HeaderBar.tsx')).toBe(false)
  })

  it('登录页、门户插画本体、PetMascot、theme.css 自身按路径规则排除', () => {
    expect(isExcluded('src/pages/Login/index.tsx')).toBe(true)
    expect(isExcluded('src/pages/Portal/SystemArtwork.tsx')).toBe(true)
    expect(isExcluded('frontend/packages/ui/src/components/PetMascot.css')).toBe(true)
    expect(isExcluded('frontend/packages/ui/src/styles/theme.css')).toBe(true)
    // Portal/index.css 已故意**不再**整文件排除：否则卡片底/描边/文字也无法令牌化（深色下满屏白斑）。
    // scene 色改由下面的选择器块级排除保护。
    expect(isExcluded('src/pages/Portal/index.css')).toBe(false)
  })

  it('scene 色块与登录页区段由选择器级排除守住', () => {
    expect(isExcludedSelector(".portal-card-artwork[data-scene='ads']")).toBe(true)
    expect(isExcludedSelector('.login-card-v2')).toBe(true)
    expect(isExcludedSelector('.login-locale-corner .ant-select-selector')).toBe(true)
    // 门户非 scene 段必须可令牌化，否则白块清不掉
    expect(isExcludedSelector('.portal-card-body')).toBe(false)
    expect(isExcludedSelector('.content-area')).toBe(false)
  })

  it('门户目录下的非排除文件仍要参与统计', () => {
    expect(isExcluded('src/pages/Portal/Portal.test.tsx')).toBe(true)
    expect(isExcluded('src/pages/Portal/FavoriteBar.tsx')).toBe(false)
  })

  it('scene 基线必须与规则 §A.1.1 同数，且每项都是合法十六进制色', () => {
    const entries = Object.entries(SCENE_COLOR_BASELINE)
    expect(entries.length).toBeGreaterThanOrEqual(16)
    const bad = entries.filter(([, v]) => !/^#[0-9a-fA-F]{6}$/.test(v)).map(([k]) => k)
    expect(bad, `scene 基线含非法色值：${bad.join(', ')}`).toEqual([])
    // 18 个 scene 不得重色（与 Portal.test.tsx 的色调不重复用例同一约束）
    expect(new Set(entries.map(([, v]) => v.toLowerCase())).size).toBe(entries.length)
  })

  it('Windows 风格反斜杠路径归一后同样生效', () => {
    expect(isExcluded('src\\pages\\Login\\index.tsx')).toBe(true)
  })

  it('排除清单不得为空（空清单会让登录页与插画 scene 色被 codemod 改掉）', () => {
    expect(EXCLUDE_PATHS.length).toBeGreaterThan(5)
  })
})

describe('countBareColors', () => {
  it('CSS 剥注释后统计，注释里的色值不计入', () => {
    const css = '/* 旧值 #FF0000 已废弃 */\n.a { color: #262626; background: #fff; }'
    const stat = countBareColors(css, 'css')
    expect(stat.hex).toBe(2)
    expect(stat.hits.get('262626')).toBe(1)
    expect(stat.hits.get('ffffff')).toBe(1)
  })

  it('TSX 只统计引号直接包裹的色值，注释与说明文字里的裸值不误计', () => {
    const tsx = [
      '// 说明：主色是 #E8720C',
      "const s = { color: '#E8720C', borderColor: '#D9D9D9' }",
      "const note = '色值 #123456 只是文案里提到的颜色'",
    ].join('\n')
    const stat = countBareColors(tsx, 'inline')
    // 注释里的 #E8720C 不带引号不计，只有 style 对象里的计 1 次
    expect(stat.hits.get('e8720c')).toBe(1)
    expect(stat.hits.get('d9d9d9')).toBe(1)
    // 文案字符串内部的色值后面不紧跟引号，因此不计入：
    // 这是有意的，否则说明文字与 i18n 文案里提到的颜色会把棘轮基数抬高
    expect(stat.hits.get('123456')).toBeUndefined()
  })

  it('#FFF 与 #ffffff 归一到同一项', () => {
    const stat = countBareColors('.a{background:#FFF}.b{background:#ffffff}', 'css')
    expect(stat.hex).toBe(2)
    expect(stat.hits.get('ffffff')).toBe(2)
  })

  it('unmapped 排除已映射值与 REVIEW_REQUIRED，只留真正的长尾', () => {
    const css = '.a{color:#262626;background:#333333;border:1px solid #123abc}'
    const stat = countBareColors(css, 'css')
    expect(stat.unmapped.has('262626')).toBe(false) // 已映射
    expect(stat.unmapped.has('333333')).toBe(false) // 在 REVIEW_REQUIRED
    expect(stat.unmapped.get('123abc')).toBe(1) // 真长尾
  })

  it('黑色 rgba 阴影与 var(--) 用量分别计数', () => {
    const css = '.a{box-shadow:0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0, 0, 0, 0.1);color:var(--text-1)}'
    const stat = countBareColors(css, 'css')
    expect(stat.rgbaBlack).toBe(2)
    expect(stat.tokenized).toBe(1)
  })

  it('白色 rgba 不计入黑色阴影（毛玻璃等场景属独立债务）', () => {
    expect(countBareColors('.a{background:rgba(255,255,255,0.15)}', 'css').rgbaBlack).toBe(0)
  })
})

/**
 * 品牌橙实底上的玻璃面板族（门户 hero 顶部搜索框 = 用户报的图2）。
 *
 * 为何必须单独一组：族令牌的背板不是 surface-*，而是**品牌橙渐变本身**。
 * 既有对比度断言只覆盖固定背板集合，不补就是「令牌加了、门禁根本没看它」（§16.2 第 5 条）。
 */
const GLASS_TOKENS = ['brand-glass', 'brand-glass-hover', 'brand-glass-border']

describe('品牌玻璃面板族（--brand-glass*）', () => {
  /** hero 渐变的四个停靠色；搜索框在横幅最右（最亮）端，那里是最难的一档 */
  const HERO = ['#B14A05', '#E8720C', '#F59432', '#FFB347']
  /**
   * 合成方向必须是 tint×alpha + 背板×(1-alpha)。
   * 本轮手写探针时把它写成过反（背板×alpha + tint×(1-alpha)），算出
   * “黑玻璃压深底变亮绿 #4aaa1b”这种荒谬值——差点当作实测数字写进注释。
   * 这里不复用上面 describe 里的 toRgb（它不在本作用域），归一化仍走工具自己的 normalizeHex。
   */
  const rgb = (s) => {
    if (s.startsWith('#')) {
      // 3 位展开走工具自己的 normalizeHex，不在测试里再抄一份（抄了就会漂）
      const n = normalizeHex(s.slice(1))
      const h = n.hex
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
    }
    const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => Number(x.trim()))
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  const over = (tint, back) => {
    const t = rgb(tint)
    const b = rgb(back)
    return `#${[0, 1, 2].map((i) => Math.round(t[i] * t[3] + b[i] * (1 - t[3])).toString(16).padStart(2, '0')).join('')}`
  }

  it('深色值必须是带 alpha 的 rgba 四元（缺 alpha 会被合成函数静默当不透明）', () => {
    for (const name of [...GLASS_TOKENS, 'on-brand-glass']) {
      const m = TOKEN_VALUES[name].dark.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/)
      if (name === 'on-brand-glass') continue // 前景是不透明白，本来就不该有 alpha
      expect(m, `${name} 的深色值必须是 rgba(r,g,b,a) 四元，实际：${TOKEN_VALUES[name].dark}`).not.toBeNull()
      const a = Number(m[4])
      expect(a, `${name} 的 alpha 必须落在 (0,1)`).toBeGreaterThan(0)
      expect(a, `${name} 的 alpha 必须落在 (0,1)`).toBeLessThan(1)
    }
  })

  it('白字 on 玻璃底必须在 hero 每一个停靠色上都达 AA', () => {
    for (const name of ['brand-glass', 'brand-glass-hover']) {
      for (const hero of HERO) {
        const bg = over(TOKEN_VALUES[name].dark, hero)
        expect(bg, `${name} on ${hero} 合成失败`).toMatch(/^#[0-9a-f]{6}$/)
        expect(contrastRatio('#FFFFFF', bg), `${name} 的白字 on ${hero}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('族令牌的浅色值必须逐个等于它替换掉的 CSS 字面量（这是「浅色不变」的唯一机验）', () => {
    // 这四个值来自 Portal/index.css 搜索框原本的字面量；改动任何一项就意味着浅色观感被动了。
    expect(TOKEN_VALUES['brand-glass'].light).toBe('rgba(255,255,255,0.94)')
    expect(TOKEN_VALUES['brand-glass-hover'].light).toBe('#FFFFFF')
    expect(TOKEN_VALUES['brand-glass-border'].light).toBe('rgba(255,255,255,0.40)')
    // 配套前景的浅色值必须仍等于 --text-3，否则搜索图标在浅色下会变颜色
    expect(TOKEN_VALUES['on-brand-glass'].light).toBe(TOKEN_VALUES['text-3'].light)
  })

  it('配套前景必须在玻璃底上达非文本 3:1（只改背景会把图标弄没）', () => {
    for (const hero of HERO) {
      const bg = over(TOKEN_VALUES['brand-glass'].dark, hero)
      expect(contrastRatio(TOKEN_VALUES['on-brand-glass'].dark, bg), `on-brand-glass on ${hero}`)
        .toBeGreaterThanOrEqual(3.0)
    }
  })

  it('族令牌不得被当作背景段自动映射目标（它们不是 hex，也不该被 codemod 自刷）', () => {
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => String(token).includes('glass'))
      expect(hit, `${seg} 段不应映射到 glass 族`).toEqual([])
    }
  })
})

/**
 * 奖牌金属色族（图 6 自然流量详情）。本组同样全走对比度，而不是色值偏好。
 *
 * 为什么必须单独一组：这三档颜色与配套数字前景是**绑定关系**。
 * 只把金属色令牌化、数字仍留白字，就是把一个既有 AA 缺陷刷成“看起来已治理”的样子；
 * 而只改数字不登记金属色，codemod 下轮会把它们当裸值刷成别的令牌。
 */
describe('奖牌金属色族（--medal-* / --on-medal）', () => {
  const MEDALS = ['medal-gold', 'medal-silver', 'medal-bronze']

  it('旧现状必须真的不达标（钉住“为什么连数字前景一起改”，防止被当成过度设计删掉）', () => {
    // 这三对就是改动前 organic.css 里的真实组合：白字压在金属色上。
    // 它们跟深浅主题无关，在浅色下也一样红；不再 < 4.5 就说明有人动过金属色，
    // 那 on-medal 的存在理由需要重新评估，而不是默认它永远必要。
    for (const name of MEDALS) {
      expect(contrastRatio('#FFFFFF', TOKEN_VALUES[name].light), `${name} 上的白字不该被判为已达标`)
        .toBeLessThan(4.5)
    }
  })

  it('配套数字前景必须在三档金属底上都达 AA 4.5:1', () => {
    for (const name of MEDALS) {
      for (const theme of ['light', 'dark']) {
        expect(contrastRatio(TOKEN_VALUES['on-medal'][theme], TOKEN_VALUES[name][theme]),
          `${TOKEN_VALUES['on-medal'][theme]} on ${name}/${theme}`)
          .toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('三档金属色深浅必须同值（它们是排名语义编码，不是主题表面）', () => {
    // 一旦有人为了“深色更柔和”去压暗，实测会把两个方向都弄坏：
    // #FA8C16 压到 #D48806 后白字 2.87、#141414 字 6.19，都不如原值。
    for (const name of MEDALS) {
      expect(TOKEN_VALUES[name].dark, `${name} 不得随主题翻面`).toBe(TOKEN_VALUES[name].light)
    }
    expect(TOKEN_VALUES['on-medal'].dark).toBe(TOKEN_VALUES['on-medal'].light)
  })

  it('三档彼此亮度必须实拉开（金/银/铜 失去区分度比不达标更隐蔽）', () => {
    const [gold, silver, bronze] = MEDALS.map((n) => relativeLuminance(TOKEN_VALUES[n].light))
    expect(gold).toBeGreaterThan(silver)
    expect(silver).toBeGreaterThan(bronze)
    // 两两亮度差至少 0.04：低于这个值在 26px 小圆上肉眼已经分不出金银
    expect(gold - silver).toBeGreaterThanOrEqual(0.04)
    expect(silver - bronze).toBeGreaterThanOrEqual(0.04)
  })

  it('族令牌不得进 COLOR_TO_TOKEN（否则 codemod 会把无关站点刷成奖牌色）', () => {
    // #FA8C16 在站内还兼任其他语义主色的深色档（§廿四 故意没把它加进 bg 段），
    // #8C8C8C 在 fg 段已是 --text-3。这两条是真实存在过的手滑，所以单独钉住。
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => String(token).includes('medal'))
      expect(hit, `${seg} 段不应映射到奖牌族`).toEqual([])
    }
  })

  it('配套前景不得复用 --on-brand（它的浅色档是白，语义上是反的）', () => {
    expect(TOKEN_VALUES['on-medal'].light).not.toBe(TOKEN_VALUES['on-brand'].light)
    // 而深色档恰好同值——这是巧合不是可合并的理由，所以两边都钉住
    expect(TOKEN_VALUES['on-medal'].dark).toBe(TOKEN_VALUES['on-brand'].dark)
  })
})
