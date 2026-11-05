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
import { COLOR_TO_TOKEN } from './lib/theme-token-map.mjs'

const SCRIPT = new URL('./theme-tokenize-inline.mjs', import.meta.url).pathname
const FIXTURE_DIR = 'src/pages/__codemodFixture__'
const FIXTURE_FILE = join(FIXTURE_DIR, 'Case.tsx')

/**
 * 由映射表反推期望令牌名，避免把色值-令牌对应关系在测试里再抄一份（抄了就会漂）。
 * @param {string} hex 裸色值
 * @param {'bg'|'fg'|'border'} segment 属性分段
 */
function expectToken(hex, segment) {
  const token = COLOR_TO_TOKEN[segment]?.[hex.slice(1).toLowerCase()]
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
  '      <i style={{ background: `linear-gradient(180deg, ${tone}, #ffffff)` }} />',
  '    </div>',
  '  )',
  '}',
  '',
].join('\n')

let root = ''
/** @param {...string} args 传给 codemod 的命令行参数 */
function runCli(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' })
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tokenize-inline-'))
  mkdirSync(join(root, FIXTURE_DIR), { recursive: true })
  writeFileSync(join(root, FIXTURE_FILE), SOURCE)
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
})
