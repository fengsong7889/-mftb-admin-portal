// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * CSS 色值 codemod 单测（方案 §5.2 档 B / §卅七）。
 *
 * 这个脚本此前**没有任何单测**，而它 2026-11-11 之前用的是「以 { 结尾的行才算规则头」
 * 的归属判据：单行规则 `.login-card{color:#262626}` 会被归到**上一个块的上下文**，
 * 上一个块没被排除时就会把登录页/scene/拟真壳内这些「必须整块跳过」的固定配色改掉。
 * 实测仓内确实存在这种形态（`.apw-star{...}`、`.portal-card-artwork[data-scene=...]`），
 * 所以归属改成走 `walkCssBlocks` 的行区间映射，并由本文件钉住。
 *
 * 覆盖的判据按重要性排：
 *   1. 单行规则归它自己的选择器（本批修掉的缺陷）；
 *   2. 排除区整块跳过，且「任一环在排除区」就整块不动（混排选择器不能改一半）；
 *   3. `@keyframes` 整块不动；`@media` 只是容器，内部规则各自成块；
 *   4. 注释里的色值不动（注释是设计决策的证据）；
 *   5. 映射表没有严格等值项时不许动，且要报进 skipped；
 *   6. box-shadow 走整串映射，未命中的复合阴影整条不动；
 *   7. 参数不合法时拒跑且一个字节都不写。
 *
 * 每个「不改」的用例都配一个同文件里的「改了」对照：解析判据坏掉时会全都跳过，
 * 看起来像通过——阳性对照是本仓踩过多次的必修课。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLOR_TO_TOKEN } from './lib/theme-token-map.mjs'
import { transform } from './theme-tokenize-css.mjs'

const SCRIPT = new URL('./theme-tokenize-css.mjs', import.meta.url).pathname

/** 由映射表反推期望令牌名，避免把色值-令牌对应关系在测试里再抄一份（抄了就会漂）。 */
const tokenFor = (segment, hex) => COLOR_TO_TOKEN[segment][hex.replace('#', '').toLowerCase()]

const FG = '#262626' // → text-1
const BG = '#f5f5f5' // → surface-1

describe('theme-tokenize-css · 块归属', () => {
  it('单行规则归它自己的选择器，同时把同文件的多行规则改掉', () => {
    const src = [
      `.plain { color: ${FG}; }`,
      `.login-card{color:${FG}}`,
    ].join('\n')
    const { next, replaced } = transform(src)
    expect(replaced, '只应改 .plain 一处').toBe(1)
    expect(next).toContain(`.plain { color: var(--${tokenFor('fg', FG)}); }`)
    // 阳性对照：同文件确实有一处被改，排除行没动不是「解析器空转」造成的
    expect(next).toContain(`.login-card{color:${FG}}`)
  })

  it('排除区多行块整块不动，非排除块照改', () => {
    const src = [
      '.login-card {',
      `  color: ${FG};`,
      `  background: ${BG};`,
      '}',
      '.app-card {',
      `  color: ${FG};`,
      '}',
    ].join('\n')
    const { next, replaced } = transform(src)
    expect(replaced, '登录页两处不许动，.app-card 一处要动').toBe(1)
    expect(next).toContain(`  color: ${FG};\n  background: ${BG};`)
    expect(next).toContain(`  color: var(--${tokenFor('fg', FG)});`)
  })

  it('混排选择器（任一环排除）整块不动', () => {
    const src = `.login-card, .app-card { color: ${FG}; }`
    const { next, replaced } = transform(src)
    expect(replaced).toBe(0)
    expect(next).toBe(src)
  })

  it('@keyframes 整块不动，@media 内部规则各自成块', () => {
    const src = [
      '@keyframes pulse {',
      // 故意用**映射表里真有等值项**的 BG：上一版这里用 #3b82f6（未命中），
      // 导致「不跳过关键帧」的变异照样绿——断言必须能被打红才算存在。
      `  0% { background: ${BG}; }`,
      '}',
      '@media (max-width: 480px) {',
      `  .in-media { color: ${FG}; }`,
      '}',
    ].join('\n')
    const { next, replaced } = transform(src)
    expect(replaced, '关键帧不动，@media 内的单行规则要动').toBe(1)
    expect(next, '关键帧里的可映射色值也不许动').toContain(`0% { background: ${BG}; }`)
    expect(next).not.toContain('var(--surface-1)')
    expect(next).toContain(`.in-media { color: var(--${tokenFor('fg', FG)}); }`)
  })

  it('注释里的色值与花括号原样保留', () => {
    const src = [
      `/* 原值 ${FG} 已废弃，形如 .login-card{color:${FG}} 的写法仅作说明 */`,
      `.real { color: ${FG}; }`,
    ].join('\n')
    const { next, replaced } = transform(src)
    expect(replaced).toBe(1)
    expect(next).toContain(`/* 原值 ${FG} 已废弃`)
    expect(next).toContain(`.real { color: var(--${tokenFor('fg', FG)}); }`)
  })

  it('映射表没有等值项时不许动，但要报进 skipped', () => {
    const unmapped = '#123456'
    const src = [
      `.case { color: ${unmapped}; }`,
      `.other { color: ${FG}; }`,
    ].join('\n')
    const { next, replaced, skipped } = transform(src)
    expect(replaced, '只有等值那条被改').toBe(1)
    expect(next).toContain(`color: ${unmapped}`)
    expect(skipped.length, '未命中必须留痕，否则信息被静默扔掉').toBeGreaterThan(0)
  })

  it('box-shadow 走整串映射；未命中的复合阴影整条不动', () => {
    const src = [
      '.a { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }',
      '.b { box-shadow: inset 0 1px 0 rgba(0,0,0,0.06); }',
    ].join('\n')
    const { next, replaced } = transform(src)
    expect(replaced).toBe(1)
    expect(next).toContain('.a { box-shadow: var(--shadow-1); }')
    expect(next).toContain('.b { box-shadow: inset 0 1px 0 rgba(0,0,0,0.06); }')
  })

  it('幂等：跑第二遍不再改任何一处', () => {
    const once = transform(`.x { color: ${FG}; background: ${BG}; }`).next
    const twice = transform(once)
    expect(twice.replaced).toBe(0)
    expect(twice.next).toBe(once)
  })
})

describe('theme-tokenize-css · CLI 参数与作用域', () => {
  const TMP = join(tmpdir(), 'tokenize-css-cli')
  const REL = 'fixtures/Case.css'
  const ABS = join(TMP, REL)

  beforeAll(() => {
    mkdirSync(join(TMP, 'fixtures'), { recursive: true })
  })
  afterAll(() => rmSync(TMP, { recursive: true, force: true }))

  const seed = () => writeFileSync(ABS, `.x { color: ${FG}; }\n`)

  it('未知 flag 必须拒跑（exit 1）且一个字节都不写', () => {
    seed()
    const before = readFileSync(ABS, 'utf8')
    const r = spawnSync('node', [SCRIPT, '--run', '--dirs', 'fixtures'], { cwd: TMP, encoding: 'utf8' })
    expect(r.status, `应当拒跑，实际 stderr：${r.stderr}`).toBe(1)
    expect(r.stderr).toContain('未知参数')
    expect(readFileSync(ABS, 'utf8')).toBe(before)
  })

  it('--files 后面漏敲路径也必须拒跑', () => {
    seed()
    const r = spawnSync('node', [SCRIPT, '--run', '--files'], { cwd: TMP, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(readFileSync(ABS, 'utf8')).toContain(FG)
  })

  it('--run --files 指定文件时只改该文件', () => {
    seed()
    const r = spawnSync('node', [SCRIPT, '--run', '--files', REL], { cwd: TMP, encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(readFileSync(ABS, 'utf8')).toContain(`var(--${tokenFor('fg', FG)})`)
  })

  it('--dry-run 不写盘', () => {
    seed()
    const r = spawnSync('node', [SCRIPT, '--dry-run', '--files', REL], { cwd: TMP, encoding: 'utf8' })
    expect(r.status ?? 0).toBe(0)
    expect(readFileSync(ABS, 'utf8')).toContain(FG)
  })
})
