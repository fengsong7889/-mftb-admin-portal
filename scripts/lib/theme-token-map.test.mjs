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
import { execFileSync } from 'node:child_process'
import {
  APP_PREVIEW_PLATFORM_ROOTS,
  COLOR_TO_TOKEN,
  COMPONENT_TOKENS,
  EXCLUDE_PATHS,
  EXCLUDE_SELECTOR_PREFIXES,
  INTENTIONAL_VALUE_DUPLICATES,
  NON_COLOR_TOKENS,
  REVIEW_REQUIRED,
  SCENE_COLOR_BASELINE,
  SEMANTIC_TOKENS,
  TOKEN_VALUES,
  classifyProperty,
  compositeOnto,
  isExcludedCssBlock,
  stripCssCommentsKeepLines,
  walkCssBlocks,
  contrastRatio,
  countBareColors,
  findExcludedBlockPollution,
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
const INTENTIONAL_SAME_VALUE = new Set(['brand', 'brand-hover', 'medal-gold', 'medal-silver', 'medal-bronze', 'on-medal', 'on-brand-pill',
  // 品牌渐变胶囊的四个端点（§35.3 / §卅六）：背景是不翻面的品牌资产，浅深同值是设计决定而不是漏改
  'brand-pill-bee-from', 'brand-pill-bee-to', 'brand-pill-mfood-from', 'brand-pill-mfood-to',
  // 说明面板脉冲高亮四色（§卅八）：画在浅色手机内容上，翻面就看不清，浅深同值是设计决定
  'pulse-blue', 'pulse-purple', 'pulse-pink', 'pulse-amber'])

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
 * 插画角色表面 --art-figure（用户报的图3：「人工智能系统 SVG 图深色下有点恐怖」）。
 *
 * 为何必须单独一组：这个令牌存在的**全部理由就是对比度**，而不是色值偏好。
 * 不钉住它，下任把它“为了统一”改回 --art-surface 时，门禁不会报错，而机器人会重新变成灰脸空洞。
 */
describe('插画角色表面（--art-figure）', () => {
  /** AI 场景的面罩与瞳孔都是 scene 主色紫（Portal/index.css 里 data-scene='ai' 的 color） */
  const SCENE_AI = '#722ED1'
  const CARD = TOKEN_VALUES['surface-2'].dark

  it('深色下角色表面与卡片底必须拉开 ≥ 3:1（否则脸没有轮廓）', () => {
    expect(contrastRatio(TOKEN_VALUES['art-figure'].dark, CARD))
      .toBeGreaterThanOrEqual(3.0)
  })

  it('深色下角色表面与场景紫（面罩/瞳孔）必须双向 ≥ 3:1', () => {
    const c = contrastRatio(TOKEN_VALUES['art-figure'].dark, SCENE_AI)
    expect(c, '眼白 on 面罩').toBeGreaterThanOrEqual(3.0)
    expect(c, '瞳孔 on 眼白（同一对颜色）').toBeGreaterThanOrEqual(3.0)
  })

  it('浅色值必须仍为 #FFFFFF（浅色逐像素不变）', () => {
    expect(TOKEN_VALUES['art-figure'].light).toBe('#FFFFFF')
  })

  it('不得与 --art-surface 同值（同值就等于这个令牌没意义，应该直接用纸面令牌）', () => {
    expect(TOKEN_VALUES['art-figure'].dark).not.toBe(TOKEN_VALUES['art-surface'].dark)
  })

  it('旧现状必须真的不达标（钉住“为什么需要这个令牌”，防止被当成过度设计删掉）', () => {
    // 这两个数字是本轮实测写进注释的；如果哪天它们不再低于 3.0，说明场景色/卡片底变了，
    // 需要重新评估本令牌是否保留，而不是默认它永远必要。
    expect(contrastRatio(TOKEN_VALUES['art-surface'].dark, SCENE_AI)).toBeLessThan(3.0)
    expect(contrastRatio(TOKEN_VALUES['art-surface'].dark, CARD)).toBeLessThan(3.0)
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

/**
 * 首页「今日會議」提示栏一族（--info-bar-*）。
 *
 * 为什么必须单独一组：这一栏上**最弱的前景不是文字，而是「查看我的會議」那条品牌橙链接**。
 * 不钉住它，下任为了“让提示栏更显眼”把蓝色调调浓，就会把那条链接压到 AA 以下，
 * 而肉眼完全看不出问题（底仍然很暗）。所以除了“现在达标”，还必须钉“更浓就不达标”。
 *
 * ⚠ alpha 一律从 TOKEN_VALUES 里解出来，不在测试里重抄一遍：
 *   重抄的话改深色调时测试不会红，等于断言没有牙。
 */
describe('今日會議提示栏（--info-bar-*）', () => {
  const CARD = TOKEN_VALUES['surface-2'].dark

  const toRgb = (s) => {
    if (s.startsWith('#')) {
      const h = normalizeHex(s).hex
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
    }
    const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => Number(x.trim()))
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  /** 合成方向必须是 tint×alpha + 背板×(1-alpha)。写反会得出“深底变亮”的荒谬值（§廿六 实踩）。 */
  const over = (tint, back) => {
    const t = toRgb(tint), b = toRgb(back)
    return '#' + [0, 1, 2].map((i) => Math.round(t[i] * t[3] + b[i] * (1 - t[3])).toString(16).padStart(2, '0')).join('')
  }
  /** 把任意 alpha 的 info 色调合成到卡片底，用于扫“调浓一档会怎样” */
  const barAt = (alpha) => over(`rgba(24, 144, 255, ${alpha})`, CARD)

  it('深色底必须是带 alpha 的四元 rgba，且 alpha 不得大于 0.12', () => {
    const m = TOKEN_VALUES['info-bar-from'].dark
      .match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/)
    expect(m, `必须是 rgba(r,g,b,a) 四元，实际：${TOKEN_VALUES['info-bar-from'].dark}`).not.toBeNull()
    // 上限不是审美而是扫出来的：α=0.12 时品牌橙链接实测 4.588（仍达标），α=0.14 起跌破 4.5。
    // 取 0.12 作硬上限是为了给“再调浓一点”留一个会红的边界，而不是鼓动用到 0.12。
    expect(Number(m[4]), 'alpha 超过 0.12 会把品牌橙链接压到 AA 以下').toBeLessThanOrEqual(0.12)
  })

  it('栏上四种前景在合成底上全部达 AA 4.5:1', () => {
    const bg = barAt(toRgb(TOKEN_VALUES['info-bar-from'].dark)[3])
    const fg = ['text-2', 'text-3', 'info', 'brand']
    for (const name of fg) {
      const c = contrastRatio(TOKEN_VALUES[name].dark, bg)
      expect(c, `${name}(${TOKEN_VALUES[name].dark}) on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('更浓一档必须真的不达标（钉住 0.10 这个选择，防止被当成“不够显眼”而调浓）', () => {
    // 这三对就是本轮定档时扫出来的实测数字；如果哪天它们不再 < 4.5，
    // 说明品牌橙或卡片底变了，需要重新评估本族 alpha，而不是默认 0.10 永远对。
    expect(contrastRatio(TOKEN_VALUES.brand.dark, barAt(0.14)), 'α=0.14 上的品牌橙链接')
      .toBeLessThan(4.5)
    expect(contrastRatio(TOKEN_VALUES.brand.dark, barAt(0.20)), 'α=0.20 上的品牌橙链接')
      .toBeLessThan(4.5)
  })

  it('浅色值必须逐个等于被替换的原字面量（这是「浅色不变」的唯一机验）', () => {
    // 这四个值就是 TodayMeetingCard 原先 inline style 里的字面量，改动任何一项就意味着浅色观感被动了。
    expect(TOKEN_VALUES['info-bar-from'].light).toBe('#F0F7FF')
    expect(TOKEN_VALUES['info-bar-border'].light).toBe('#E6F0FB')
    expect(TOKEN_VALUES['info-bar-divider'].light).toBe('#DCE7F2')
    // 渐变右端复用 --surface-2，不另建档（它的浅色档就是原来的 #FFFFFF）
    expect(TOKEN_VALUES['surface-2'].light).toBe('#FFFFFF')
  })

  it('族令牌不得进 COLOR_TO_TOKEN（它们藏在串内部，codemod 本来就扫不到）', () => {
    // 这正是它们能逃过十几轮批次的原因；入了反向映射只会多三个用不上的条目，
    // 而且一旦渐变里出现同值的不同语义（比如白底卡片），就会被误刷。
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => String(token).includes('info-bar'))
      expect(hit, `${seg} 段不应映射到 info-bar 族`).toEqual([])
    }
  })

  it('描边与分隔线必须比栏底更亮（深色下“靠底色区分”很弱，主要靠边）', () => {
    const bg = barAt(toRgb(TOKEN_VALUES['info-bar-from'].dark)[3])
    expect(relativeLuminance(over(TOKEN_VALUES['info-bar-border'].dark, CARD)))
      .toBeGreaterThan(relativeLuminance(bg))
    expect(relativeLuminance(over(TOKEN_VALUES['info-bar-divider'].dark, CARD)))
      .toBeGreaterThan(relativeLuminance(bg))
    // 而分隔线要比外框弱一档，否则两个 1px 线在深色下分不清主次
    expect(relativeLuminance(over(TOKEN_VALUES['info-bar-divider'].dark, CARD)))
      .toBeLessThan(relativeLuminance(over(TOKEN_VALUES['info-bar-border'].dark, CARD)))
  })
})

/**
 * 品牌渐变胶囊前景（--on-brand-pill）。
 *
 * 为什么必须单独一组：这个缺陷**门禁结构性看不见**——背景在渐变串内部不计数，
 * 前景 #FFFFFF 在 fg 段又无等值映射，所以棘轮与 codemod 两边都碰不到它。
 * 没有断言，它就只会停在“有人看过一次源码”的状态。
 *
 * ⚠ 与 §4.6 已登记的「债务④」（#E8720C 上白字 3.07，靠 14px/500 字重成立）不同：
 *   胶囊渐变最差的两个端点连 3.0 都不达，那条理由在这里不适用。
 */
describe('品牌渐变胶囊前景（--on-brand-pill）', () => {
  // 这四个端点就是 BrandTag.tsx 里写死的渐变（下一条用例跨文件锚定它）
  const ENDPOINTS = ['#FFB300', '#FB8C00', '#FF7A45', '#F5680C']

  it('渐变端点必须与 BrandTag.tsx 源码一致（跨文件锚定，防止改了组件忘了断言依据）', () => {
    const src = readFileSync(
      new URL('../../frontend/packages/ui/src/components/BrandTag.tsx', import.meta.url), 'utf8')
    const found = [...src.matchAll(/linear-gradient\(135deg, (#[0-9A-Fa-f]{6}) 0%, (#[0-9A-Fa-f]{6}) 100%\)/g)]
      .flatMap((m) => [m[1].toUpperCase(), m[2].toUpperCase()])
    expect(found.length, 'BrandTag 里应该能找到渐变端点').toBeGreaterThan(0)
    // 双向相等：组件新增端点时本组必须跟着重新实测，而不是默默少守一个
    expect([...new Set(found)].sort()).toEqual([...ENDPOINTS].sort())
  })

  it('前景深字在每个渐变端点上都达 AA 4.5:1', () => {
    for (const ep of ENDPOINTS) {
      for (const theme of ['light', 'dark']) {
        const c = contrastRatio(TOKEN_VALUES['on-brand-pill'][theme], ep)
        expect(c, `${TOKEN_VALUES['on-brand-pill'][theme]} on ${ep}（${theme}）`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('白字必须真的不达标（钉住“为何改深字”，防止被当成审美改动回退）', () => {
    // 全部 < 4.5；且最差的两个连大字号的 3.0 门槛都不达，
    // 所以 §4.6「债务④：靠 14px/500 字重勉强成立」那条理由在这里不适用。
    for (const ep of ENDPOINTS) {
      expect(contrastRatio('#FFFFFF', ep), `白字 on ${ep} 不该被判为达 AA`).toBeLessThan(4.5)
    }
    const worst = Math.min(...ENDPOINTS.map((ep) => contrastRatio('#FFFFFF', ep)))
    expect(worst, '最差的端点应仍低于大字号 3.0 门槛').toBeLessThan(3.0)
  })

  it('两档必须同值（背景是不翻面的品牌资产，前景翻回去就是白字不达标）', () => {
    expect(TOKEN_VALUES['on-brand-pill'].dark).toBe(TOKEN_VALUES['on-brand-pill'].light)
    // 而且不得复用 --on-brand：它的浅色档是白，正是本组要修的缺陷本身
    expect(TOKEN_VALUES['on-brand'].light).toBe('#FFFFFF')
    expect(TOKEN_VALUES['on-brand-pill'].light).not.toBe(TOKEN_VALUES['on-brand'].light)
  })

  it('不得进 COLOR_TO_TOKEN（#141414 还兼任 surface-1/on-brand 的深色档）', () => {
    // 进了 fg 段，codemod 会把无关站点的深色前景全刷成“胶囊专用”语义。
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => String(token).includes('brand-pill'))
      expect(hit, `${seg} 段不应映射到 on-brand-pill`).toEqual([])
    }
    // 而 #141414 确实已存在于其它段的映射里，这正是不能复用的实证
    const dup = Object.entries(TOKEN_VALUES).filter(([n, v]) =>
      n !== 'on-brand-pill' && (v.light === '#141414' || v.dark === '#141414')).map(([n]) => n)
    expect(dup.length, '#141414 已被哪些令牌占用').toBeGreaterThan(0)
  })
})

/*
 * AppPreview 原型页的平台侧一族（§卅六：深浅色白斑修复第一批）。
 *
 * 为什么不能只靠棘轮守这批：本批之后会把壳内前缀族（.apc-/.apf-/…）加进选择器排除区，
 * 一旦排除，「有人把说明面板的颜色写回字面量」在 cssHex 上完全看不出来。
 * 所以下面用**跨文件锚定**直接读 appPreview.css：平台侧选择器里再出现裸 hex 就当场判红。
 * 这与 §34.2 给 BrandTag 做的那条同一个理由：排除区必须配一条不受排除影响的守卫。
 */
describe('AppPreview 平台侧令牌族（说明面板 / 舞台底 / 品牌胶囊，§卅六）', () => {
  const PANEL = TOKEN_VALUES['surface-2'].dark // #1F1F1F，说明面板深色下的实际背板
  /** 本轮替换掉的站内字面量：浅色档必须逐个与之相等（「令牌化不得改浅色观感」的硬判据） */
  const ORIGINAL = {
    'spec-ink-strong': '#1E293B', 'spec-ink': '#475569', 'spec-ink-faint': '#94A3B8',
    'spec-accent': '#3B82F6', 'spec-th-soft': '#DBEAFE', 'spec-th-ink': '#1E40AF',
    'spec-blue-border': '#93C5FD', 'spec-row-line': '#F1F5F9', 'spec-field-soft': '#EFF6FF',
    'spec-row-soft': '#F0F9FF', 'spec-divider-line': '#E2E8F0',
    'spec-note-soft': '#FFF7ED', 'spec-note-border': '#FED7AA', 'spec-note-ink': '#C2410C',
    'stage-glow-from': '#FFF3E6', 'stage-mid': '#F4F6FB', 'stage-edge': '#EEF1F7', 'stage-flat': '#F5F6F8',
    'brand-pill-bee-from': '#FFC107', 'brand-pill-bee-to': '#FF9800',
    'brand-pill-mfood-from': '#FF6B35', 'brand-pill-mfood-to': '#E65100',
  }
  const BRAND_PILLS = ['brand-pill-bee-from', 'brand-pill-bee-to', 'brand-pill-mfood-from', 'brand-pill-mfood-to']

  it('浅色档必须逐个等于被替换的站内字面量', () => {
    for (const [name, literal] of Object.entries(ORIGINAL)) {
      expect(TOKEN_VALUES[name].light.toLowerCase(), name).toBe(literal.toLowerCase())
    }
  })

  it('除品牌胶囊四端点外，深色档必须真的与浅色不同（同值就是白斑复活）', () => {
    const same = Object.keys(ORIGINAL)
      .filter((n) => !BRAND_PILLS.includes(n))
      .filter((n) => TOKEN_VALUES[n].dark.toLowerCase() === TOKEN_VALUES[n].light.toLowerCase())
    expect(same, `这些令牌没有深色档：${same.join(', ')}`).toEqual([])
  })

  it('说明面板前景在深色面板底上必须全部达 AA 4.5', () => {
    for (const name of ['spec-ink-strong', 'spec-ink', 'spec-ink-faint', 'spec-accent']) {
      expect(contrastRatio(TOKEN_VALUES[name].dark, PANEL), `${name} 深色 on ${PANEL}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('深色档坐在合成底（表头 / 行 hover / 输入框 / 提示条）上仍必须达 AA', () => {
    // contrastRatio 不处理 alpha，先把 rgba tint 合成到面板底再算（唯一实现 compositeOnto）。
    const th = compositeOnto(TOKEN_VALUES['spec-th-soft'].dark, PANEL)
    expect(contrastRatio(TOKEN_VALUES['spec-th-ink'].dark, th), `th-ink on ${th}`).toBeGreaterThanOrEqual(4.5)
    const note = compositeOnto(TOKEN_VALUES['spec-note-soft'].dark, PANEL)
    expect(contrastRatio(TOKEN_VALUES['spec-note-ink'].dark, note), `note-ink on ${note}`).toBeGreaterThanOrEqual(4.5)
    for (const tint of ['spec-row-soft', 'spec-field-soft']) {
      const bg = compositeOnto(TOKEN_VALUES[tint].dark, PANEL)
      for (const fg of ['spec-ink-strong', 'spec-ink']) {
        expect(contrastRatio(TOKEN_VALUES[fg].dark, bg), `${fg} on ${tint} 合成底 ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('浅色侧两处存量欠标按存量卡下限，不假装达标（修它要动观感，另案）', () => {
    // #3B82F6 on 白 = 3.6779（§33.3 已登记）；#94A3B8 on 白 = 2.5640（本轮实测新登记）。
    expect(contrastRatio(TOKEN_VALUES['spec-accent'].light, '#FFFFFF')).toBeGreaterThanOrEqual(3.6)
    expect(contrastRatio(TOKEN_VALUES['spec-ink-faint'].light, '#FFFFFF')).toBeGreaterThanOrEqual(2.5)
    // 同时钉住「它们确实不达标」，否则后来人会把 ≥3.6 读成已达 AA。
    expect(contrastRatio(TOKEN_VALUES['spec-accent'].light, '#FFFFFF')).toBeLessThan(4.5)
    expect(contrastRatio(TOKEN_VALUES['spec-ink-faint'].light, '#FFFFFF')).toBeLessThan(4.5)
  })

  it('舞台深色四档必须都暗于面板底，否则面板在深色下浮不起来', () => {
    const panelL = relativeLuminance(PANEL)
    for (const name of ['stage-glow-from', 'stage-mid', 'stage-edge', 'stage-flat']) {
      expect(relativeLuminance(TOKEN_VALUES[name].dark), `${name} 深色必须比 ${PANEL} 更暗`).toBeLessThan(panelL)
    }
  })

  it('品牌胶囊端点两档同值，深字达标而白字必须仍然不达标', () => {
    for (const name of BRAND_PILLS) {
      expect(TOKEN_VALUES[name].dark).toBe(TOKEN_VALUES[name].light)
      const ep = TOKEN_VALUES[name].light
      expect(contrastRatio(TOKEN_VALUES['on-brand-pill'].light, ep), `深字 on ${ep}`).toBeGreaterThanOrEqual(4.5)
      // 钉住「前景为什么是深字」，防止被当成审美改动回退（与 BrandTag 那组同一手法）
      expect(contrastRatio('#FFFFFF', ep), `白字 on ${ep} 不该被判为达 AA`).toBeLessThan(4.5)
    }
  })

  it('全族不得进 COLOR_TO_TOKEN（面板专用语义不能让 codemod 套到无关站点）', () => {
    const names = new Set(Object.keys(ORIGINAL))
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => names.has(String(token)))
      expect(hit, `${seg} 段不应映射到 AppPreview 面板族`).toEqual([])
    }
  })

  it('appPreview.css 平台侧选择器里不得再出现裸 hex（排除区的补偿守卫）', () => {
    const css = readFileSync(
      new URL('../../src/pages/AppPreview/appPreview.css', import.meta.url), 'utf8')
      // 注释里的十六进制是取证数字，不是声明值；门禁同样先剥注释再计数。
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const PLATFORM_ROOTS = ['.ap-spec-', '.ap-dual-', '.ap-stage', '.ap-preview-', '.ap-page', '.ap-toolbar']
    let cur = null
    let depth = 0
    let kf = null
    let platformRules = 0
    const offenders = []
    for (const line of css.split('\n')) {
      const head = line.includes('{') ? line.split('{')[0].trim() : ''
      const isKf = head.startsWith('@keyframes') || head.startsWith('@-webkit-keyframes')
      if (isKf) kf = depth
      else if (head && kf === null) cur = head
      const isPlatform = cur !== null && kf === null && PLATFORM_ROOTS.some((p) => cur.startsWith(p))
      if (isPlatform) {
        platformRules += 1
        const hexes = line.match(/#[0-9a-fA-F]{3,8}\b/g)
        if (hexes) offenders.push(`${cur}: ${hexes.join(' ')}`)
      }
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      if (kf !== null && depth <= kf) kf = null
    }
    // 阳性对照：扫不到平台侧规则说明判据本身失效，不能当成「已经干净」。
    expect(platformRules, '平台侧规则数为 0 = 解析判据失效，不是通过').toBeGreaterThan(15)
    expect(offenders, `平台侧残留裸 hex：${offenders.join(' | ')}`).toEqual([])
    // 反向对照：本批的 var() 确实在文件里（空扫描与「真的用了令牌」两种情况要能区分）
    expect((css.match(/var\(--spec-/g) || []).length).toBeGreaterThan(15)
  })

  it('说明面板阴影必须走 --shadow-panel（黑色 rgba 阴影在深色下几乎不可见）', () => {
    expect(NON_COLOR_TOKENS['shadow-panel'].light).toBe('0 4px 24px rgba(0,0,0,0.08)')
    expect(NON_COLOR_TOKENS['shadow-panel'].dark).toBe('0 4px 24px rgba(0,0,0,0.6)')
  })

  it('appPreview.css 引用的每个 var(--*) 都必须能解析（令牌名写错没有门禁会报）', () => {
    /*
     * 这一条不在任何其它守格里：`var(--spec-ink-stron)` 这种拼错的令牌名既不报错也不计数，
     * 深色下只会静静地渲成无效值。本仓以前只能靠渲染层探针发现（§28.5），
     * 但探针不入库也不进 CI，所以这里用静态比对常驻守住；渲染层仍负责验级联真的生效。
     */
    const raw = readFileSync(
      new URL('../../src/pages/AppPreview/appPreview.css', import.meta.url), 'utf8')
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    const used = new Set([...css.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)].map((m) => m[1]))
    // 文件内自备的局部令牌（搜索覆盖层的 --apcs-* 族）不算未解析
    const local = new Set([...css.matchAll(/^\s*(--[A-Za-z0-9-]+)\s*:/gm)].map((m) => m[1]))
    const known = new Set(
      [...Object.keys(TOKEN_VALUES), ...Object.keys(NON_COLOR_TOKENS)].map((n) => `--${n}`))
    const missing = [...used].filter((v) => !known.has(v) && !local.has(v)).sort()
    // 阳性对照：不能拿「var 总数 > N」当对照——§卅八 把壳内 var 回退成字面量后总数就掉了，
    // 阈值绑在一个会变的量上会把正确状态误判成判据失效。改钉「本批引入的平台侧令牌必须真在文件里」。
    const REQUIRED = ['--surface-2', '--shadow-panel', '--on-brand-pill', '--spec-ink-strong',
      '--spec-th-soft', '--spec-note-ink', '--stage-glow-from', '--brand-pill-bee-from']
    for (const name of REQUIRED) {
      expect(used.has(name), `平台侧令牌 ${name} 不在 appPreview.css 里了（被回退或被删）`).toBe(true)
    }
    expect(missing, `无法解析的 var 名：${missing.join(', ')}`).toEqual([])
  })
})

/*
 * AppPreview 壳内豁免（§卅六 第三步）与「平台侧优先」判定。
 *
 * 这批断言的意义不在于排除本身，而在于排除**没有吃进平台侧**：
 * `.ap-` 这一段同时是设备外壳（`.ap-phone`）、模拟 APP 内容（`.ap-btn`）
 * 和壳外 chrome（`.ap-spec-panel`、`.ap-stage`）的公共前缀，
 * 子串匹配一旦没有反向白名单，就会把说明面板一起豁免掉——深色下白斑复活而棘轮一声不响。
 */
describe('AppPreview 壳内选择器排除与平台侧优先', () => {
  const SHELL = [
    '.apc-group-card', '.apf-card', '.apm-feed-list', '.apw-pill', '.apd-header',
    '.apg-panel', '.apmk-kpi', '.apcs', '.apcs-channel--groupbuy', '.apst-hero',
    '.apdl-cat', '.apq-coupons', '.apmf-tag',
    // 设备外壳与商家端内容（`.ap-` 段）
    '.ap-phone', '.ap-phone-side--l1', '.ap-statusbar-time', '.ap-viewport',
    '.ap-btn', '.ap-cell-price', '.ap-hero-balance', '.ap-cart-row',
  ]
  const PLATFORM = ['.ap-spec-panel', '.ap-dual-label', '.ap-stage', '.ap-exit', '.ap-toolbar']

  it('`.ap-` 必须确实在排除清单里（否则下面的平台侧用例是空转）', () => {
    expect(EXCLUDE_SELECTOR_PREFIXES).toContain('.ap-')
    expect(EXCLUDE_SELECTOR_PREFIXES).toContain('.apc-')
  })

  it.each(SHELL)('壳内模拟 APP 选择器 %s 被排除', (sel) => {
    expect(isExcludedSelector(sel)).toBe(true)
  })

  it.each(PLATFORM)('壳外平台侧选择器 %s 不得被排除', (sel) => {
    expect(isExcludedSelector(sel)).toBe(false)
  })

  it('复合选择器里只要有一环是平台侧，整条都不得排除', () => {
    expect(isExcludedSelector('.ap-phone .ap-spec-example')).toBe(false)
    expect(isExcludedSelector('.ap-spec-panel .apc-card')).toBe(false)
    // 而纯壳内链仍要排除
    expect(isExcludedSelector('.ap-phone .apf-card')).toBe(true)
  })

  it('排除项不得误伤形近的非原型命名', () => {
    // `.ap-` 不能命中 `.app-` / `.apex-`：那是主站别的模块的命名，被豁免就等于失去门禁
    expect(isExcludedSelector('.app-header')).toBe(false)
    expect(isExcludedSelector('.apex-chart')).toBe(false)
    expect(isExcludedSelector('.content-area')).toBe(false)
  })

  it('登录页与 scene 的既有排除不受平台侧白名单影响', () => {
    expect(isExcludedSelector('.login-card-v2')).toBe(true)
    expect(isExcludedSelector(".portal-card-artwork[data-scene='ads']")).toBe(true)
  })

  it('平台侧名单必须与审计脚本的 PLATFORM_ROOTS 逐个相等（跨文件锚定）', () => {
    const py = readFileSync(new URL('../audit-app-preview-hex.py', import.meta.url), 'utf8')
    const m = py.match(/^PLATFORM_ROOTS = \(([^)]*)\)/m)
    expect(m, '审计脚本里找不到 PLATFORM_ROOTS 常量，判据已经不存在了').not.toBeNull()
    const pyRoots = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    const jsRoots = [...APP_PREVIEW_PLATFORM_ROOTS].sort()
    // 双向相等：任何一侧单独加/减名字都会红，避免「工具与门禁各守一套平台侧」
    expect(jsRoots).toEqual(pyRoots)
  })
})

/*
 * 选择器感知的 CSS 计数（§卅七 口径变更）。
 *
 * 变更动机：豁免（EXCLUDE_SELECTOR_PREFIXES）原先只约束 codemod 与摸底工具，
 * `countBareColors` 根本不认块——于是「壳内拟真配色已豁免」但账上仍当债务挂着，
 * 两套口径互相看不见，回收三步做完 cssHex 也不降，很容易被误读成「白干了」。
 * 下面这组断言守的是新口径的**边界**：什么该退出、什么绝不能退出。
 */
const HEX_LIT = /#[0-9a-fA-F]{3,8}\b/

describe('walkCssBlocks 与选择器感知计数（§卅七）', () => {
  const FIXTURE = [
    '/* 注释里有 .login-card{color:#fff} 与花括号 { } 必须整块忽略 */',
    '.plain { color: #111111; }',
    '.single{background:#222222}',
    '.multi,',
    '.multi-b {',
    '  border: 1px solid #333333;',
    '}',
    '@media (max-width: 480px) {',
    '  .in-media { color: #444444; }',
    '  .login-card { color: #555555; }',
    '}',
    '@keyframes pulse {',
    '  0% { box-shadow: 0 0 0 2px #666666; }',
    '  100% { box-shadow: 0 0 0 2px #666666; }',
    '}',
    '.login-card, .app-card { background: #777777; }',
    '.apc-card { background: #888888; }',
    '.ap-spec-panel { background: #999999; }',
  ].join('\n')
  const src = stripCssCommentsKeepLines(FIXTURE)
  const blocks = walkCssBlocks(src)
  const bySel = (sel) => blocks.find((b) => b.selector === sel)

  it('阳性对照：块数与归属必须等于手算值（解析器坏了不能当成「没有排除块」）', () => {
    // 注释里那两个假块不得被当成真块；@media 内部两条各自成块；关键帧整体只算一块
    expect(blocks.length).toBe(9)
    expect(bySel('.single')).toBeTruthy()
    expect(bySel('.multi, .multi-b'), '多行选择器列表要归成一个块').toBeTruthy()
    expect(bySel('.in-media'), '@media 是容器，内部规则要按普通规则交出来').toBeTruthy()
    expect(bySel('.login-card')).toBeTruthy()
    expect(blocks.filter((b) => b.atRule === 'keyframes').length).toBe(1)
    expect(blocks.filter((b) => /^\s*\d+%/.test(b.selector)).length, '关键帧步不得单独成块').toBe(0)
  })

  it('rings 按逗号拆环，供「全环排除」判据使用', () => {
    expect(bySel('.multi, .multi-b').rings).toEqual(['.multi', '.multi-b'])
    expect(bySel('.login-card, .app-card').rings).toEqual(['.login-card', '.app-card'])
  })

  it('排除判定：整块全环排除才算排除，混排块仍计债', () => {
    expect(isExcludedCssBlock(bySel('.login-card'))).toBe(true)
    expect(isExcludedCssBlock(bySel('.apc-card')), '拟真 APP 壳内前缀应被豁免').toBe(true)
    expect(isExcludedCssBlock(bySel('.ap-spec-panel')), '平台侧优先：命中平台根不得豁免').toBe(false)
    expect(isExcludedCssBlock(bySel('.login-card, .app-card')), '混排块的另一侧是真债务').toBe(false)
    expect(isExcludedCssBlock(blocks.find((b) => b.atRule === 'keyframes')),
      '关键帧不参与选择器排除').toBe(false)
  })

  it('计数：豁免块内的 hex 退出 cssHex 并进 excluded', () => {
    const stat = countBareColors(FIXTURE, 'css')
    // 手算：保留的 hex = .plain 1 + .single 1 + .multi 1 + .in-media 1 + keyframes 2 + 混排 1 + .ap-spec-panel 1 = 8
    expect(stat.hex).toBe(8)
    // 豁免掉的 = .login-card 1 + .apc-card 1 = 2
    expect(stat.excluded).toBe(2)
  })

  it('不变式：旧口径 hex === 新口径 hex + excluded（口径变更必须可逐块对账）', () => {
    const off = countBareColors(FIXTURE, 'css', { honorSelectorExclusion: false })
    const on = countBareColors(FIXTURE, 'css')
    expect(off.hex, '旧口径应当等于全部声明 hex').toBe(10)
    expect(off.hex).toBe(on.hex + on.excluded)
  })

  it('inline 口径不受影响（TSX 没有选择器概念）', () => {
    const stat = countBareColors('<div style={{ color: "#123456" }} />', 'inline')
    expect(stat.hex).toBe(1)
    expect(stat.excluded).toBe(0)
  })

  it('注释里的 hex 与花括号既不计入也不改变块归属', () => {
    const only = '/* .login-card{color:#fff} 原值 #E8720C */\n.a{color:#000000}'
    const stat = countBareColors(only, 'css')
    expect(stat.hex).toBe(1)
    expect(stat.excluded).toBe(0)
  })

  it('全仓不变式：旧口径 hex === 新口径 hex + excluded（逐文件闭合，不是抽查）', () => {
    /*
     * 口径变更最怕「少算了什么没人知道」。这条把整个 CSS 面跑一遍，逐文件要求
     * 旧计数与新计数加豁免量精确相等；任何一块被两个口径同时漏掉（解析器坏掉）
     * 或同时多算（豁免过宽）都会当场红，而不是等下一轮人工对账才发现。
     */
    const files = execFileSync('git', ['ls-files', '--', '*.css'], { encoding: 'utf8' })
      .split('\n').filter((p) => p && !isExcluded(p))
    expect(files.length, '一个 CSS 都没扫到 = 判据失效').toBeGreaterThan(20)
    const broken = []
    let sumOld = 0
    let sumNew = 0
    let sumExcluded = 0
    for (const rel of files) {
      const body = readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
      const off = countBareColors(body, 'css', { honorSelectorExclusion: false })
      const on = countBareColors(body, 'css')
      if (off.hex !== on.hex + on.excluded) broken.push(`${rel}: ${off.hex} ≠ ${on.hex} + ${on.excluded}`)
      sumOld += off.hex
      sumNew += on.hex
      sumExcluded += on.excluded
    }
    expect(broken, `对账失败：${broken.slice(0, 5).join(' | ')}`).toEqual([])
    // 阳性对照：豁免确实吃掉了东西（否则这条不变式可能只是「两边都等于全量」的空转）
    expect(sumExcluded, '豁免区一个色值都没有 = 排除清单或解析判据失效').toBeGreaterThan(100)
    expect(sumOld).toBe(sumNew + sumExcluded)
  })
})

/*
 * 豁免区的补偿守卫（§卅八）。
 *
 * §卅七 之后计数不再看豁免区，于是「豁免区内部跟着主题翻面」在棘轮上完全隐形；
 * 而拟真壳内/登录页/scene 的语义就是不跟随主题。实测回退前 30 个壳内元素全部跟随主题
 * （一台手机一半深一半浅），靠的就是这条检测把它挡在门禁里。
 */
describe('findExcludedBlockPollution：豁免区不得引用主题令牌', () => {
  const FIXTURE = [
    '.login-card { background: var(--surface-2); }',           // 豁免区 + 主题令牌 → 污染
    '.apc-card { color: var(--text-1); }',                     // 壳内前缀 + 主题令牌 → 污染
    '.apc-card { color: var(--apg-gold, #FA8C16); }',          // 局部变量 → 不算污染
    '.apc-card { background: #FFFFFF; }',                      // 固定值 → 不算污染
    '.ap-spec-panel { background: var(--surface-2); }',        // 平台侧优先，不算污染
    '.app-header { color: var(--text-1); }',                   // 非豁免区，不算污染
  ].join('\n')

  it('命中集合必须恰好是「豁免区 × 主题令牌」那两条', () => {
    const hits = findExcludedBlockPollution(FIXTURE)
    expect(hits.map((h) => h.selector).sort()).toEqual(['.apc-card', '.login-card'])
  })

  it('阳性对照：解析判据坏掉时不能报「零污染」', () => {
    const hits = findExcludedBlockPollution(FIXTURE)
    expect(hits.length, '一条都没命中说明块归属或令牌清单失效').toBeGreaterThan(0)
    expect(hits[0].vars.length).toBeGreaterThan(0)
  })

  it('局部变量与平台侧都不得误报（否则会把 §卅六 的修复也判成污染）', () => {
    const clean = [
      '.apc-card { color: var(--apcs-pink); background: #fff; }',
      '.ap-spec-panel { background: var(--surface-2); }',
      '.ap-stage { background: var(--stage-mid); }',
    ].join('\n')
    expect(findExcludedBlockPollution(clean)).toEqual([])
  })

  it('门禁确实接了这条检测（wiring 锚定，防止只写函数不接线）', () => {
    // 单元测只证明函数本身对；真正保护 CI 的是 check-theme-tokens.mjs 有没有调用它并把结果计入 errors。
    // 这类「判据存在但没接线」的洞本仓踩过多次（注释声称有门禁、grep 发现无人消费）。
    const gate = readFileSync(new URL('../check-theme-tokens.mjs', import.meta.url), 'utf8')
    expect(gate, '门禁没有 import findExcludedBlockPollution').toContain('findExcludedBlockPollution')
    expect(gate, '门禁没有把命中结果计入 blockPollution').toContain('blockPollution.push(')
    expect(gate, '门禁没有因 blockPollution 报错').toContain('if (result.blockPollution.length)')
  })

  it('本仓现状必须为零污染（这条一旦变红就是有人把令牌写进了豁免区）', () => {
    const files = execFileSync('git', ['ls-files', '--', '*.css'], { encoding: 'utf8' })
      .split('\n').filter((p) => p && !isExcluded(p))
    const hits = []
    for (const rel of files) {
      for (const h of findExcludedBlockPollution(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'))) {
        hits.push(`${rel} → ${h.selector}`)
      }
    }
    expect(hits, `豁免区里引用了主题令牌：${hits.slice(0, 5).join(' | ')}`).toEqual([])
  })
})

/*
 * 说明面板脉冲高亮环（§卅八 Batch C）：把 §36.7 的「第三桶」收进令牌体系。
 *
 * 这一桶之所以危险，是因为它既不在选择器排除区（关键帧没有类选择器，`isExcludedCssBlock`
 * 对 atRule 直接返回 false），也没有登记例外——棘轮数字对不上时最容易误判成「漏改」或「回归」。
 */
describe('脉冲高亮令牌族 --pulse-*（§卅八）', () => {
  const PULSE = { 'pulse-blue': '#3B82F6', 'pulse-purple': '#8B5CF6', 'pulse-pink': '#EC4899', 'pulse-amber': '#F59E0B' }

  it('浅色档必须等于关键帧里被替换掉的字面量', () => {
    for (const [name, literal] of Object.entries(PULSE)) {
      expect(TOKEN_VALUES[name].light.toLowerCase(), name).toBe(literal.toLowerCase())
    }
  })

  it('四档必须浅深同值（画在浅色手机内容上，翻面就成了深色环套浅色卡）', () => {
    for (const name of Object.keys(PULSE)) {
      expect(TOKEN_VALUES[name].dark, name).toBe(TOKEN_VALUES[name].light)
    }
  })

  it('三个达标的脉冲色在非文本图形门槛 3.0 之上，amber 按存量卡下限并钉住它确实不达标', () => {
    for (const name of ['pulse-blue', 'pulse-purple', 'pulse-pink']) {
      expect(contrastRatio(TOKEN_VALUES[name].light, '#FFFFFF'), name).toBeGreaterThanOrEqual(3.0)
    }
    const amber = contrastRatio(TOKEN_VALUES['pulse-amber'].light, '#FFFFFF')
    expect(amber, 'pulse-amber 存量欠标不得被读成达标').toBeLessThan(3.0)
    expect(amber).toBeGreaterThanOrEqual(2.1)
  })

  it('四个值都不进 COLOR_TO_TOKEN（站内其它 violet/pink/amber 与脉冲语义无关）', () => {
    for (const seg of Object.keys(COLOR_TO_TOKEN)) {
      for (const hex of Object.keys(PULSE).map((n) => PULSE[n].slice(1).toLowerCase())) {
        const hit = Object.entries(COLOR_TO_TOKEN[seg]).filter(([, token]) => String(token).startsWith('pulse-'))
        expect(hit, `${seg} 段不应映射到 pulse-*`).toEqual([])
        void hex
      }
    }
  })

  it('appPreview.css 的关键帧里不得再留裸 hex（第三桶已收口）', () => {
    const css = stripCssCommentsKeepLines(readFileSync(
      new URL('../../src/pages/AppPreview/appPreview.css', import.meta.url), 'utf8'))
    const blocks = walkCssBlocks(css).filter((b) => b.atRule === 'keyframes')
    expect(blocks.length, '没扫到关键帧块说明解析判据失效').toBeGreaterThan(0)
    const left = blocks.flatMap((b) => b.body.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
    expect(left, `关键帧仍留裸 hex：${left.join(', ')}`).toEqual([])
  })
})
