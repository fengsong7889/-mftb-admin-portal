// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * CSS 侧半对门禁单测（方案 §卅八 第 3 步）。
 *
 * 这个门禁是从一次性差分脚本升上来的，一次性脚本的两个老毛病必须各自有用例钉住：
 *   1. **空输入假绿**：扫到 0 个文件或 0 个块时必须拒绝出结论，而不是报「干净」；
 *   2. **判据过宽**：只看「一侧令牌一侧裸值」会把品牌固定色渐变全误报
 *      （§卅八 实测 48 处告警里 30 处是这种），翻面性判据必须单独有反例。
 * 另外它与棘轮共享 walkCssBlocks / isExcludedCssBlock / classifyProperty，
 * 所以这里也钉住「排除块不报」——豁免区由 findExcludedBlockPollution 反向守，
 * 两套门禁不能互相重复计数，也不能互相漏。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CSS_CLASSES_KEYS, classifyCssBlock, colorPropsOfCssBlock, pinnedHexes, scan, selfCheck, tokenFlips,
} from './audit-theme-halfpair-css.mjs'
import { compareRatchet, diffHazards, hazardKey } from './audit-theme-halfpair.mjs'

describe('CSS 半对判据本身', () => {
  it('自检必须全过（自检不过就说明门禁空转，调用方会 exit 2）', () => {
    expect(selfCheck()).toEqual([])
  })

  it('翻面性：品牌色不翻、表面色翻', () => {
    expect(tokenFlips('brand')).toBe(false)
    expect(tokenFlips('surface-2')).toBe(true)
    expect(tokenFlips('apcs-pink')).toBe(false)   // 局部变量不在真源里，按不翻面处理
  })

  it('pinnedHexes：8 位 alpha 与 url(#) 都不算钉住', () => {
    expect(pinnedHexes('#FFF7E6')).toBe(1)
    expect(pinnedHexes('#722ED166')).toBe(0)
    expect(pinnedHexes('url(#feed) #D6E4FF')).toBe(0)
    expect(pinnedHexes('linear-gradient(90deg, #FFF, #F59432)')).toBe(2)
  })

  it('分段必须与门禁 classifyProperty 同口径（否则 codemod 能改而门禁看不见）', () => {
    const props = colorPropsOfCssBlock('color: #999; background: #fff; border: 1px solid #eee; width: 10px;')
    expect(props.map((p) => p.seg)).toEqual(['fg', 'bg', 'border'])
  })

  const CASES = [
    ['翻面令牌 + 钉住前景', 'background: var(--surface-2); color: #94A3B8;', [CSS_CLASSES_KEYS[0]]],
    ['翻面令牌 + 钉住背景', 'border: 1px solid var(--info-border); background: #FFFDFB;', [CSS_CLASSES_KEYS[1]]],
    ['翻面令牌 + 钉住描边', 'background: var(--surface-2); border: 1px solid #eef0f3;', [CSS_CLASSES_KEYS[2]]],
    ['同一条声明里混用（渐变只换了一半）', 'background: linear-gradient(135deg, var(--brand-soft), #FFFDFB);', [CSS_CLASSES_KEYS[1]]],
    ['两侧都不翻面（品牌固定色渐变）', 'background: linear-gradient(90deg, var(--brand), #F59432);', []],
    ['全令牌', 'background: var(--surface-2); color: var(--text-1);', []],
    ['全裸值（是债务但不是半对）', 'background: #FFF7E6; color: #C2410C;', []],
    ['钉住侧只有 alpha 底色', 'background: var(--surface-2); color: #722ED166;', []],
  ]
  it.each(CASES)('%s → %j', (_label, body, expectKeys) => {
    expect(Object.keys(classifyCssBlock(body)).sort()).toEqual([...expectKeys].sort())
  })
})

describe('差分键与棘轮', () => {
  const h = (line, kind = CSS_CLASSES_KEYS[0], body = '.x { a }') => ({ file: 'a.css', line, kind, body })

  it('行号漂移不得被算成「新增 + 消失」各一次', () => {
    const { fresh, gone } = diffHazards([h(10)], [h(14)])
    expect(fresh).toEqual([])
    expect(gone).toEqual([])
  })

  it('同一段落里内容不同必须判为新增', () => {
    const { fresh, gone } = diffHazards([h(10)], [h(10, CSS_CLASSES_KEYS[0], '.y { b }')])
    expect(fresh.length).toBe(1)
    expect(gone.length).toBe(1)
    expect(hazardKey(h(10))).not.toBe(hazardKey(h(10, CSS_CLASSES_KEYS[0], '.y { b }')))
  })

  it('棘轮只降不升：高于基线必须报错，低于基线必须放行', () => {
    const baseline = { [CSS_CLASSES_KEYS[0]]: 10, [CSS_CLASSES_KEYS[1]]: 5, [CSS_CLASSES_KEYS[2]]: 2 }
    expect(compareRatchet(baseline, { ...baseline, [CSS_CLASSES_KEYS[0]]: 11 }, CSS_CLASSES_KEYS).length).toBeGreaterThan(0)
    expect(compareRatchet(baseline, { ...baseline, [CSS_CLASSES_KEYS[0]]: 9 }, CSS_CLASSES_KEYS)).toEqual([])
  })

  it('不传 CSS 类别时必须抓不到新增（钉住“复用判据集合不匹配”这个静默空转）', () => {
    // 本门禁刚写时就踩了：compareRatchet 默认遍历 TSX 侧键名，CSS 计数里没有那些键，
    // `undefined > 0` 为 false → 无论新增多少都报「无错」。这条用例把必须显式传 keys 钉住。
    const baseline = { [CSS_CLASSES_KEYS[0]]: 0, [CSS_CLASSES_KEYS[1]]: 0, [CSS_CLASSES_KEYS[2]]: 0 }
    const worse = { ...baseline, [CSS_CLASSES_KEYS[0]]: 99 }
    expect(compareRatchet(baseline, worse)).toEqual([])          // 不传 keys：空转（反例）
    expect(compareRatchet(baseline, worse, CSS_CLASSES_KEYS).length).toBe(1)  // 传了才拦得住
  })
})

describe('scan：真实仓库与临时夹具', () => {
  const TMP = join(tmpdir(), 'halfpair-css-fixture')

  beforeAll(() => {
    mkdirSync(join(TMP, 'src/pages/Demo'), { recursive: true })
    writeFileSync(join(TMP, 'package.json'), '{}')
    writeFileSync(join(TMP, 'src/pages/Demo/a.css'), [
      // 半对：翻面令牌 + 钉住描边
      '.card-a { background: var(--surface-2); border: 1px solid #eef0f3; }',
      // 非半对：两侧都不翻面
      '.card-b { background: linear-gradient(90deg, var(--brand), #F59432); }',
      // 排除块（拟真壳内）：里面有翻面令牌也不该由本门禁报，那是污染守卫的职责
      '.apc-card { background: var(--surface-2); color: #999999; }',
      '@media print {',
      // print 内锁定浅色是刻意的，不算半对
      '  .card-c { background: var(--surface-2); color: #000000; }',
      '}',
      '@media (max-width: 480px) {',
      // 普通响应式容器不豁免
      '  .card-d { background: var(--surface-2); color: #94A3B8; }',
      '}',
    ].join('\n'))
  })
  afterAll(() => rmSync(TMP, { recursive: true, force: true }))

  it('临时夹具上的计数必须等于手算值（排除块与 print 都不计入）', () => {
    const r = scan(TMP)
    expect(r.files).toBe(1)
    expect(r.counts[CSS_CLASSES_KEYS[2]]).toBe(1)   // .card-a 的描边
    expect(r.counts[CSS_CLASSES_KEYS[0]]).toBe(1)   // .card-d 的前景（@media 宽度容器不豁免）
    expect(r.excludedBlocks).toBe(1)
    expect(r.printSkipped).toBe(1)
    expect(r.hazards.length).toBe(2)
  })

  it('阳性对照：扫真仓时文件数与块数都不可能为 0，且三类合计 ≡ 危险点数', () => {
    const r = scan()
    expect(r.files).toBeGreaterThan(20)
    expect(r.blocks).toBeGreaterThan(500)
    const sum = Object.values(r.counts).reduce((a, b) => a + b, 0)
    expect(sum, '分桶合计必须等于危险点总数，否则有站点被静默丢弃').toBe(r.hazards.length)
  })

  it('真仓现状：96 处半对分布在 16 个文件（数字变了说明判据或代码动过，必须重新定性）', () => {
    const r = scan()
    expect(r.hazards.length).toBe(96)
    expect(new Set(r.hazards.map((x) => x.file)).size).toBe(16)
  })
})
