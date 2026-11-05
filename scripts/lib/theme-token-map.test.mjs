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
} from './theme-token-map.mjs'

/** 深浅两主题有意保持同值的令牌：品牌橙是品牌识别锚点，深色下实测 5.37:1 反而优于浅色底 */
const INTENTIONAL_SAME_VALUE = new Set(['brand', 'brand-hover'])

const ALL_TOKEN_NAMES = [...SEMANTIC_TOKENS, ...COMPONENT_TOKENS]
const ALL_TOKEN_VALUES = { ...TOKEN_VALUES, ...NON_COLOR_TOKENS }

describe('令牌去重：不允许未登记的「浅深两值全同」重复令牌', () => {
  // 本次 --text-inverse 差点被当成新令牌 --on-brand 新增，就是靠这条拓出来的。
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

  it('soft / tint / callout 类背景令牌的深色值必须用 rgba 混合，不得用浅色实底', () => {
    // 后缀集合要覆盖所有「叠加型底色」：只认 -soft 会让新加的 *-tint / *-callout 静默逃过这条规则。
    const TINT_SUFFIXES = /(-soft|-tint|-callout)$/
    const offenders = Object.entries(TOKEN_VALUES)
      .filter(([name]) => TINT_SUFFIXES.test(name))
      .filter(([, v]) => !v.dark.startsWith('rgba('))
      .map(([name, v]) => `${name}=${v.dark}`)
    expect(offenders, `深色下浅色实底会刺眼：${offenders.join(', ')}`).toEqual([])
  })

  it('深浅同值的令牌只允许品牌色（其余同值意味着切换无效果）', () => {
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
