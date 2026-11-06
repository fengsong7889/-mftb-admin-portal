// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 半对门禁单测（scripts/audit-theme-halfpair.mjs）。
 *
 * 这个门禁存在的意义是「拦住改了一半的令牌化」，所以它自己**绝不能是那个静默返回 0 的东西**：
 * 第六批的一次性审计脚本就是因为基线读成空、字符类写错，把「空输入」读成了「本批没新增」
 * （方案 §18.1 / §18.4 坑 3）。因此这里的测试按两类写：
 *   1. 三类危险形态必须各自命中，且**成对的完整写法不得误报**（漏报与误报都要测）；
 *   2. 阳性对照：自检不过时必须**拒绝出结论**（exit 2），而不是给个数字继续跑。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compareRatchet, classify, classifyWithCounts, colorPropsOfBlock, scan, selfCheck, SELF_SAMPLES, styleBlocks, hazardKey, diffHazards } from './audit-theme-halfpair.mjs'

describe('块切分', () => {
  it('跳行书写的 style 必须整块看到（单行正则会漏）', () => {
    const src = '<div style={{\n  background: "var(--surface-2)",\n  border: "1px solid #e8eaed",\n}} />'
    const blocks = styleBlocks(src)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].body).toContain('#e8eaed')
  })

  it('嵌套对象（styles={{ header: {...} }}）也要配平，不能只吃到第一个 }', () => {
    const src = '<Card styles={{ header: { background: "#FFF", color: "var(--text-1)" } }} />'
    const blocks = styleBlocks(src)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].body).toContain('#FFF')
  })
})

describe('属性归类', () => {
  it('borderRadius / padding 这类非颜色属性不得参与判定（否则误报刷屏）', () => {
    const props = colorPropsOfBlock(` padding: '8px 16px', borderRadius: 4, borderWidth: 1 `)
    expect(props).toEqual([])
  })

  it('borderBottom / borderColor / boxShadow 都归入描边段', () => {
    const props = colorPropsOfBlock(` borderBottom: '1px solid #D6E4FF', borderColor: '#ADC6FF', boxShadow: '0 1px 0 #F0F0F0' `)
    expect(props.map((p) => p.cls)).toEqual(['compound', 'compound', 'compound'])
    expect(props.every((p) => p.bareHex === 1)).toBe(true)
  })
})

describe('三类危险形态各自必须命中', () => {
  it('A 背景已令牌 + 前景钉裸值', () => {
    expect(classify(` background: 'var(--danger-soft)', color: '#F5222D' `)).toContain('前景钉裸值（半对）')
  })

  it('B 背景钉裸值 + 前景已令牌', () => {
    expect(classify(` background: '#FFF1F0', color: 'var(--danger)' `)).toContain('背景钉裸值（半对）')
  })

  it('D 同块另一侧已令牌 + 描边钉在简写串里', () => {
    expect(classify(` background: 'var(--surface-2)', border: '1px solid #FFE7BA' `)).toContain('描边钉裸值（半对）')
  })

  it('渐变只换了一半也算 B（背景侧仍是裸值）', () => {
    expect(classify(` background: 'linear-gradient(90deg, #E8720C, var(--brand-hover))', color: 'var(--text-1)' `))
      .toContain('背景钉裸值（半对）')
  })

  it('一个块里可以同时命中多类，但同一个属性不被重复数', () => {
    const c = classifyWithCounts(` background: '#FFF1F0', color: 'var(--danger)', border: '1px solid #FFCCC7' `)
    expect(c['背景钉裸值（半对）']).toBe(1)
    expect(c['描边钉裸值（半对）']).toBe(1)
    expect(c['前景钉裸值（半对）']).toBeUndefined()
  })
})

describe('不得误报的合法形态（漏报与误报都要防）', () => {
  it('两侧都成对令牌化：干净', () => {
    expect(classify(` background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' `)).toEqual([])
  })

  it('两侧都保持裸值（人工成对回退）：不是半对', () => {
    expect(classify(` background: '#FFEBEE', color: '#FF4D4F' `)).toEqual([])
  })

  it('8 位带 alpha 的色值随下层合成、本身自适应：按既有例外跳过', () => {
    expect(classify(` color: 'var(--purple)', borderColor: '#722ED166', background: '#722ED112' `)).toEqual([])
  })

  it('url(#id) 片段引用里的 #xxx 不是颜色（同串还带真 hex，只能靠这道守卫）', () => {
    expect(classify(` background: 'var(--surface-2)', stroke: 'url(#grad) #D6E4FF' `)).toEqual([])
  })

  it('fill / stroke 也必须参与判定（与 codemod 的 classifyProperty 同口径）', () => {
    expect(classify(` background: 'var(--surface-2)', stroke: '1px solid #D6E4FF' `)).toContain('描边钉裸值（半对）')
    expect(classify(` background: '#F0F5FF', fill: 'var(--brand)' `)).toContain('背景钉裸值（半对）')
  })

  it('非颜色属性里出现 # 字样（如文案、id）不得算色值', () => {
    expect(classify(` title: '编号 #123456', color: 'var(--text-1)' `)).toEqual([])
  })
})

describe('棘轮比较（拦住新增的最终判据）', () => {
  const K = ['前景钉裸值（半对）', '背景钉裸值（半对）', '描边钉裸值（半对）']
  const zero = Object.fromEntries(K.map((k) => [k, 0]))

  it('计数上升必须报错', () => {
    expect(compareRatchet({ ...zero, '背景钉裸值（半对）': 3 }, { ...zero, '背景钉裸值（半对）': 4 })).toHaveLength(1)
  })

  it('持平与下降都必须放行（否则任何一批都过不去）', () => {
    const b = { ...zero, '背景钉裸值（半对）': 3 }
    expect(compareRatchet(b, { ...zero, '背景钉裸值（半对）': 3 })).toEqual([])
    expect(compareRatchet(b, { ...zero, '背景钉裸值（半对）': 1 })).toEqual([])
  })

  it('基线里没记录的项当 0：新增一类得立刻补基线，不能默认放行', () => {
    expect(compareRatchet({}, { ...zero, '描边钉裸值（半对）': 1 })).toHaveLength(1)
  })
})

describe('按目录扫描（与 --baseline 差分同一条代码路径）', () => {
  let dir = ''
  const hazard = `<div style={{ background: 'var(--surface-2)', border: '1px solid #D6E4FF' }} />\n`

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'halfpair-'))
    mkdirSync(join(dir, 'src/pages/Demo'), { recursive: true })
    mkdirSync(join(dir, 'src/pages/Login'), { recursive: true })
    // 真缺陷
    writeFileSync(join(dir, 'src/pages/Demo/a.tsx'), `export default () => (
  <div>
    {hazard}
  </div>
)`.replace('{hazard}', hazard))
    // 注释里的色值不得当真（门禁自己及方案文档里大量 hex 示例）
    writeFileSync(join(dir, 'src/pages/Demo/b.tsx'), `/*
 * 反例：background: 'var(--x)', color: '#F5222D'
 */
export default () => <div style={{ color: 'var(--text-1)' }} />
`)
    // 排除区：登录页不参与主题，不得计入
    writeFileSync(join(dir, 'src/pages/Login/c.tsx'), `export default () => (
  <div style={{ background: 'var(--brand)', color: '#FFFFFF' }} />
)
`)
    // 测试文件内的色值是防漂移锚点，不算缺陷
    writeFileSync(join(dir, 'src/pages/Demo/a.test.tsx'), `export const t = <div style={{ background: 'var(--brand)', color: '#FFFFFF' }} />
`)
  })

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('只计入非排除区的真实缺陷块', () => {
    const r = scan(dir)
    expect(r.files).toBe(2) // a.tsx + b.tsx（登录页与 .test.tsx 已排除）
    expect(r.counts['描边钉裸值（半对）']).toBe(1)
    expect(r.counts['前景钉裸值（半对）']).toBe(0) // 注释里那个不得被数进来
    // 相对路径必须相对**被扫描的根**算：写成模块 ROOT 会得到带临时目录名的碎片，
    // 而 isExcluded 用的是 includes，碎片仍然能撞上排除串 → 只靠上面的计数测不出来（H6 实踩）。
    expect(r.hazards.map((h) => h.file)).toEqual(['src/pages/Demo/a.tsx'])
  })

  it('扫描空目录必须报 0 文件，而不是静默给出“干净”结论', () => {
    const empty = mkdtempSync(join(tmpdir(), 'halfpair-empty-'))
    try {
      const r = scan(empty)
      expect(r.files).toBe(0)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('阳性对照自检（结论的前提，不是可选步骤）', () => {
  it('样本表必须全部通过；不通过说明分类器坏了', () => {
    expect(selfCheck(), selfCheck().join('; ')).toEqual([])
  })

  it('样本表至少包含 3 个危险样本与 3 个合法样本，防止被改成空表后自检失去意义', () => {
    // 自检本身靠样本表；如果样本表被清空，selfCheck 会「永远通过」而掩盖分类器坏掉。
    const dangerous = SELF_SAMPLES.filter((s) => s.expect !== null)
    const clean = SELF_SAMPLES.filter((s) => s.expect === null)
    expect(dangerous.length).toBeGreaterThanOrEqual(3)
    expect(clean.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * 差分定位本身的守卫（2026-11-06 实踩：旧版把 POST 全量前 12 条当成「本批新增」打印，
 * 标题与实际不符，差点让人去改历史存量站点）。
 */
describe('差分只把真正新增的站点当新增', () => {
  const h = (file, line, kind, body) => ({ file, line, kind, body })
  const A = h('src/a.tsx', 10, '前景钉裸值（半对）', `background: 'var(--x)', color: '#fff'`)

  it('行号漂移不算新增也不算消失（键故意不含行号）', () => {
    const moved = h('src/a.tsx', 88, A.kind, A.body)
    expect(diffHazards([A], [moved])).toEqual({ fresh: [], gone: [] })
  })

  it('真新增只列出那一个，修好的列进 gone', () => {
    const B = h('src/b.tsx', 5, '描边钉裸值（半对）', `background: 'var(--y)', border: '1px solid #eee'`)
    const d = diffHazards([A, B], [A])
    expect(d.fresh).toEqual([])
    expect(d.gone).toHaveLength(1)
    expect(d.gone[0].file).toBe('src/b.tsx')

    const d2 = diffHazards([A], [A, B])
    expect(d2.fresh).toHaveLength(1)
    expect(d2.fresh[0].file).toBe('src/b.tsx')
    expect(d2.gone).toEqual([])
  })

  it('同块体不同类别 / 不同文件都必须算不同站点', () => {
    expect(hazardKey(A)).not.toBe(hazardKey({ ...A, kind: '背景钉裸值（半对）' }))
    expect(hazardKey(A)).not.toBe(hazardKey({ ...A, file: 'src/c.tsx' }))
    expect(hazardKey(A)).toBe(hazardKey({ ...A, line: 999 }))
  })

  it('空基线不得被当成「没新增」（旧版曾因 import 不存在的模块而拿到空 PRE 树）', () => {
    // 主流程已有 PRE files=0 就 exit 2 的护栏；这里钉的是 diffHazards 自身语义：
    // PRE 为空时 POST 全部应被当作新增，而不是被当成“无对比基准”而静默返回空。
    const d = diffHazards([], [A, A])
    expect(d.fresh).toHaveLength(2)
  })
})
