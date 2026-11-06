// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 内联色值 codemod 单测（方案 §5.3 / §18.2 档 C 流水线）。
 *
 * 为什么走「临时目录 + 真跑 CLI」而不是 import transform 做纯函数测试：
 * 这个脚本一被 import 就会执行参数校验和全站扫描（历史上它没有参数校验，
 * 第八批实踩过「漏敲 --dir → 作用域静默退成全站 300+ 文件」）。端到端跑一次
 * 同时覆盖到参数校验、作用域、写盘，且不会在测试里误改真实仓库。
 *
 * 覆盖的判据按重要性排：
 *   1. 只在 style 区段内替换（数据对象喂 ECharts/SVG/canvas 的裸值必须原样留着）；
 *   2. 简写内嵌色值（border: '1px solid #e8eaed'）可替换——否则同块背景变令牌、
 *      描边不跟着变，深色下是「深卡配近白边」，比不改更糟；
 *   3. 映射表没有严格等值项时不许动（宁缺毋滥，语义要人工判）；
 *   4. url(#id) 片段引用不许动（id 名叫 #feed 时会被当成 hex）；
 *   5. 参数不合法时必须拒跑且一个字节都不写。
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLOR_TO_TOKEN, normalizeHex } from './lib/theme-token-map.mjs'

const SCRIPT = new URL('./theme-tokenize-inline.mjs', import.meta.url).pathname
const FIXTURE_DIR = 'src/pages/__codemodFixture__'
const FIXTURE_FILE = join(FIXTURE_DIR, 'Case.tsx')

/**
 * 由映射表反推期望令牌名，避免把色值-令牌对应关系在测试里再抄一份（抄了就会漂）。
 * @param {string} hex 裸色值
 * @param {'bg'|'fg'|'border'} segment 属性分段
 */
function expectToken(hex, segment) {
  // 必须走工具自己的 normalizeHex（把 #fff 展开成 ffffff）：测试里另写一份归一化
  // 就会与工具漂移——本轮实踩：bg 段只有 6 位键，直接 slice(1) 查 `fff` 永远查不到。
  const norm = normalizeHex(hex.slice(1))
  const token = norm && !norm.hasAlpha ? COLOR_TO_TOKEN[segment]?.[norm.hex] : undefined
  if (!token) throw new Error(`映射表缺少 ${hex}（${segment} 段），测试夹具需要跟着映射表一起改`)
  return `var(--${token})`
}

const SOURCE = [
  'export function Case({ tone }: { tone: string }) {',
  "  const chartOption = { color: '#1890FF', backgroundColor: '#FFFFFF' }",
  '  return (',
  "    <div style={{ background: '#ffffff', color: '#1890FF', border: '1px solid #e8eaed', borderRadius: 4 }}>",
  "      <span style={{ color: '#FFE7BA' }}>未映射色值</span>",
  "      <p style={{ background: 'url(#feed) #ffffff' }}>片段引用不得当成颜色</p>",
  "      <b style={{ color: 'var(--text-2)', border: '1px solid #f0f0f0' }} />",
  // 合成夹具（仓内自然形态很少「同串无逗号却又混用 var+hex」，渐变那条会被逗号先截断）；
  // 它测的是串级守卫本身：一旦值段正则以后放宽，也不得只换串里的其中一段。
  // ⚠ 色值必须取 border 段里**确实存在**的 #f0f0f0：变异验证发现用 #ffffff（不在 border 段）
  // 时，拿掉守卫也不会发生替换，断言前后都成立——那就是一条无牙齿的空断言。
  "      <em style={{ border: '2px solid var(--brand) #f0f0f0' }} />",
  "      <u style={{ background: ok ? 'var(--success-soft)' : '#fafafa' }} />",
  // 成对锁定哨兵：#FFF7F0 在 bg 段确实有严格等值令牌（--brand-soft），
  // 但没有哨兵就应该刷、有哨兵就必须不动——拿真实可映射色值才能验出区别。
  "      <s style={{ background: '#FFF7F0', color: '#AD4E00' /* theme-pair-locked：两侧成对保持裸值，待 brand-deep 令牌 */ }} />",
  // 跳行写法（真实站点 RDM ResourceLoad 就是这种）：哨兵在第一行，待保护的颜色在下一行，
  // 只有「整块锁」能保住它——只锁行的旧行为会把 #1890FF 刷成令牌并反向造出半对。
  '      <div style={{',
  "        background: '#FFF7F0', /* theme-pair-locked：整块成对，不得单刷任一侧 */",
  "        color: '#1890FF',",
  '      }}>跳行块</div>',
  '      <i style={{ background: `linear-gradient(180deg, ${tone}, #ffffff)` }} />',
  '    </div>',
  '  )',
  '}',
  '',
].join('\n')

let root = ''
/** CSS 夹具目录：与 TSX 夹具分开，否则两边“共 N 处”的精确计数断言会互相污染 */
const CSS_FIXTURE_DIR = 'src/pages/__codemodCss__'
const CSS_FIXTURE_FILE = join(CSS_FIXTURE_DIR, 'case.css')
/**
 * CSS 侧夹具。每一块都对应一个真实会错的地方，不是凑数：
 *   ① 单行规则——第一版实现只处理多行块，会静默漏改（Portal/index.css 里大量这种写法）；
 *   ② 分段纪律——`background: #595959` 是前景位的值，进 bg 段就是语义失真；
 *   ③④ 选择器排除与多选择器组——登录页品牌固定样式不得被动；
 *   ⑤ 嵌套继承——`&:hover` 自身不含 `.login-`，不继承上层锁定就会去改登录页 hover 色；
 *   ⑥ @media print——打印恒浅色是已定版策略；
 *   ⑦⑧⑨ 渐变 / var 混用 / url 片段引用，三种“只换一半会更糟”的形态；
 *   ⑩ 哨兵锁整块；⑪ 无严格等值项不动。
 */
const CSS_SOURCE = [
  '/* ① 单行规则 */',
  '.one-line { color: #595959; }',
  '',
  '/* ② 多行块：三种分段各一处，段不匹配那条必须原样 */',
  '.segmented {',
  '  background: #fff;',
  '  border: 1px solid #e8eaed;',
  '  background: #595959;',
  '}',
  '',
  '/* ③ 选择器排除 */',
  '.login-card-v2 { background: #fff; }',
  '',
  '/* ④ 多选择器组：有一个命中就整块不动 */',
  '.grouped, .biz-panel { color: #fff; }',
  '',
  '/* ⑤ 嵌套选择器继承上层锁定 */',
  '.login-card-v2 {',
  '  &:hover { color: #fff; }',
  '}',
  '',
  '/* ⑥ 打印恒浅色 */',
  '@media print {',
  '  .hero { background: #fff; }',
  '}',
  '',
  '/* ⑦⑧⑨ 三种“只换一半会更糟”的形态 */',
  '.gradient { background: linear-gradient(180deg, #f7f8fa, #ffffff); }',
  '.mixed { border-color: var(--brand) #f0f0f0; }',
  '.fragment { background: url(#feed) #ffffff; }',
  '',
  '/* ⑩ 哨兵锁整块 */',
  '.locked {',
  '  /* theme-pair-locked：两侧成对保持裸值 */',
  '  background: #fff;',
  '  color: #595959;',
  '}',
  '',
  '/* ⑪ 无严格等值项 */',
  '.unmapped { color: #123456; }',
  '',
].join('\n')

/** ① 1 处 + ② 2 处 = 3；其余全部必须不动，多刷一处这里就会露出来 */
const CSS_EXPECTED_REPLACED = 3

/** @param {...string} args 传给 codemod 的命令行参数 */
function runCli(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' })
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tokenize-inline-'))
  mkdirSync(join(root, FIXTURE_DIR), { recursive: true })
  writeFileSync(join(root, FIXTURE_FILE), SOURCE)
  mkdirSync(join(root, CSS_FIXTURE_DIR), { recursive: true })
  writeFileSync(join(root, CSS_FIXTURE_FILE), CSS_SOURCE)
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('theme-tokenize-inline codemod', () => {
  it('style 区段内：纯色值与简写内嵌色值都换成严格等值令牌', () => {
    const res = runCli('--run', '--dir', FIXTURE_DIR)
    expect(res.status).toBe(0)
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')

    expect(out).toContain(`background: '${expectToken('#ffffff', 'bg')}'`)
    expect(out).toContain(`color: '${expectToken('#1890FF', 'fg')}'`)
    // 盲区②：这一条是本批新增能力的核心断言
    expect(out).toContain(`border: '1px solid ${expectToken('#e8eaed', 'border')}'`)
    // 报告口径 = 实际替换处数，多刷/漏刷都会在这里露出来
    expect(res.stdout).toMatch(/改写 1 个文件、共 5 处/)
  })

  it('style 区段外的数据对象必须保持裸值（喂 ECharts/SVG/canvas 不解析 var()）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain("const chartOption = { color: '#1890FF', backgroundColor: '#FFFFFF' }")
  })

  it('映射表没有严格等值项时不许动，且要作为未覆盖行报出来', () => {
    writeFileSync(join(root, FIXTURE_FILE), SOURCE)
    const res = runCli('--run', '--dir', FIXTURE_DIR)
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain("color: '#FFE7BA'")
    expect(out).toContain("background: 'url(#feed) #ffffff'")
    // 未覆盖行 = 淡彩描边那行（无严格等值令牌）+ url 片段引用那行 + 同串混用那行，共 3 行；
    // 注：行计数打在逐文件那行摘要上，不在末尾的总计行上。
    expect(res.stdout).toMatch(/Case\.tsx：5 处（3 行含未覆盖色值）/)
  })

  it('url(#id) 片段引用整条跳过，同串里的合法色值也不换（宁可漏改）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain("background: 'url(#feed) #ffffff'")
  })

  it('模板字符串不参与替换', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain('`linear-gradient(180deg, ${tone}, #ffffff)`')
  })

  it('同串已混用令牌与裸色 → 整串跳过（不得只换其中一段）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain("'2px solid var(--brand) #f0f0f0'")
  })

  it('行级守卫收窄后：一侧已令牌、另一侧裸值的半对可被配对（旧行为会把整行护住）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    // 已有令牌那一侧不得被动
    expect(out).toContain("color: 'var(--text-2)'")
    // 钉住的那一侧必须被配对
    expect(out).toContain(`border: '1px solid ${expectToken('#f0f0f0', 'border')}'`)
  })

  it('三元表达式：裸色分支若有严格等值令牌也要配对（已令牌那侧不动）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    expect(out).toContain("ok ? 'var(--success-soft)' : ")
    expect(out).toContain(expectToken('#fafafa', 'bg'))
  })

  it('theme-pair-locked 哨兵行不得被动（人工成对回退靠它才能挡住重跑）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    // #FFF7F0 本身是可映射的，哨兵必须让它保持裸值
    expect(out).toContain("background: '#FFF7F0'")
    expect(out).not.toContain("background: '" + expectToken('#FFF7F0', 'bg') + "'")
    expect(out).toContain("color: '#AD4E00'")
  })

  it('theme-pair-locked 跳行块：哨兵在上一行，下一行的可映射色值也必须不动（整块锁）', () => {
    const out = readFileSync(join(root, FIXTURE_FILE), 'utf8')
    // 按精确缩进定位被保护的那一行（不能写 not.toContain(var(--info))：
    // 夹具开头的 div 行本来就该刷成 var(--info)，那样断言会误报）。
    expect(out).toContain("        color: '#1890FF',")
    // #1890FF 应当只剩两处：区段外的 chartOption + 被哨兵护住的跳行块（div 行已刷成令牌）
    expect(out.split('#1890FF').length - 1).toBe(2)
  })

  describe('参数校验：不合法必须拒跑且不写盘', () => {
    it('把目录写成位置参数（漏敲 --dir）→ 拒跑，因为会静默退成全站作用域', () => {
      writeFileSync(join(root, FIXTURE_FILE), SOURCE)
      const res = runCli(FIXTURE_DIR)
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('多余的位置参数')
      expect(readFileSync(join(root, FIXTURE_FILE), 'utf8')).toBe(SOURCE)
    })

    it('--run 不带 --dir → 拒跑（全站刷色值不是任何一批的意图）', () => {
      writeFileSync(join(root, FIXTURE_FILE), SOURCE)
      const res = runCli('--run')
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('缺 --dir')
      expect(readFileSync(join(root, FIXTURE_FILE), 'utf8')).toBe(SOURCE)
    })

    it('未实现的参数（--report）→ 拒跑并指向真正实现它的门禁脚本', () => {
      const res = runCli('--report')
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('check-theme-tokens.mjs --report')
    })
  })
  
  /**
   * CSS 侧（档 B 的工具缺口）。2026-11-06 之前 codemod 只认 .tsx/.ts，
   * 导致页面 CSS 只能手工改（用户报的 5 张图里图1/图5 就落在这个缺口上）。
   * 默认不开 --css 就不碰 CSS：现有各批的作用域必须一字不变。
   */
  describe('theme-tokenize-inline --css（CSS 侧改写）', () => {
    it('不加 --css 时 CSS 完全不动（防静默扩大作用域）', () => {
      writeFileSync(join(root, CSS_FIXTURE_FILE), CSS_SOURCE)
      const res = runCli('--run', '--dir', CSS_FIXTURE_DIR)
      expect(res.status).toBe(0)
      expect(readFileSync(join(root, CSS_FIXTURE_FILE), 'utf8')).toBe(CSS_SOURCE)
      expect(res.stdout).toContain('共 0 处')
    })
  
    it('加 --css：单行规则、背景/描边/前景三分段都换成严格等值令牌，且总数精确', () => {
      // 先把夹具写回原样：vitest 会重试失败用例，不重置的话第二次跑自然是 0 处，
      // “共 3 处”这条精确断言就会因重试而假红（本轮实踩）。
      writeFileSync(join(root, CSS_FIXTURE_FILE), CSS_SOURCE)
      const res = runCli('--run', '--css', '--dir', CSS_FIXTURE_DIR)
      expect(res.status).toBe(0)
      expect(res.stdout).toContain(`共 ${CSS_EXPECTED_REPLACED} 处`)
      const out = readFileSync(join(root, CSS_FIXTURE_FILE), 'utf8')
      // ① 单行规则（旧实现会静默漏改）
      expect(out).toContain(`.one-line { color: ${expectToken('#595959', 'fg')}; }`)
      // ② 多行块
      expect(out).toContain(`background: ${expectToken('#fff', 'bg')};`)
      expect(out).toContain(`border: 1px solid ${expectToken('#e8eaed', 'border')};`)
    })
  
    it('段不匹配、无等值项、选择器排除、多选择器组、嵌套继承、@media print 全部保持原样', () => {
      const out = readFileSync(join(root, CSS_FIXTURE_FILE), 'utf8')
      expect(out).toContain('  background: #595959;')        // 前景位的值不得进 bg 段
      expect(out).toContain('.unmapped { color: #123456; }')  // 无严格等值项
      expect(out).toContain('.login-card-v2 { background: #fff; }')  // ③ 排除前缀
      expect(out).toContain('.grouped, .biz-panel { color: #fff; }') // ④ 组内有一个命中
      expect(out).toContain('  &:hover { color: #fff; }')            // ⑤ 嵌套继承锁定
      expect(out).toContain('  .hero { background: #fff; }')         // ⑥ 打印块
    })
  
    it('渐变 / var 混用 / url 片段引用 / 哨兵块，四种形态整值不动', () => {
      const out = readFileSync(join(root, CSS_FIXTURE_FILE), 'utf8')
      expect(out).toContain('background: linear-gradient(180deg, #f7f8fa, #ffffff);')
      expect(out).toContain('border-color: var(--brand) #f0f0f0;')
      expect(out).toContain('background: url(#feed) #ffffff;')
      // 哨兵块内两个色值都是真实可映射的（#fff→bg、#595959→fg），没哨兵就会被刷
      expect(out).toContain('  background: #fff;\n  color: #595959;\n}')
    })
  
    it('幂等：第二次跑必须 0 处（否则回填轮会反复刷同一批）', () => {
      const res = runCli('--run', '--css', '--dir', CSS_FIXTURE_DIR)
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('共 0 处')
    })
  
    it('改写后不得破坏格式：原缩进与分号必须逐字保留', () => {
      const out = readFileSync(join(root, CSS_FIXTURE_FILE), 'utf8')
      expect(out).toContain('  border: 1px solid ')
      // 重建 `prop: value` 的旧写法会把 `background : #fff` 这类空格归一化；
      // 这里用原始行逐字对比，只允许色值部分变化
      expect(out).toMatch(/^  background: var\(--/m)
    })
  })
})
