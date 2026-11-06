// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * zh-CN 语言包生成器的结构保真单测（scripts/gen-zh-cn-locale.mjs）。
 *
 * 钉住的事故：旧 flatten 把数组当叶子、`String(value)` 把数组压成逗号串，
 * 于是 zh-CN.json 的 8 个数组型 key 全部从数组变成字符串；前端 `t(key,{returnObjects:true})`
 * 拿到字符串后 `.map()` 抛 TypeError，「我的会议」日历视图整页被错误边界接走
 * （2026-11-06 E2E 实测，且只在简体中文复现）。
 * 更糟的是 `--check` 当时两侧都把数组当叶子，结构完全对称，一路绿灯——所以这里
 * 既要测「数组必须展开成下标叶子」（这是门禁能拦住的前提），也要直接对**真实产物**下断言
 * （只测函数不测产物，等于允许产物继续烂着而测试全绿）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flatten, unflatten, asIndex, EMPTY_OBJECT, EMPTY_ARRAY } from './gen-zh-cn-locale.mjs'

const LOCALE_DIR = join(process.cwd(), 'frontend', 'packages', 'i18n', 'src', 'i18n', 'locales')
const readLocale = lang => JSON.parse(readFileSync(join(LOCALE_DIR, `${lang}.json`), 'utf8'))

describe('flatten 必须把数组按下标展开', () => {
  it('字符串数组展开成 7 条下标叶子，而不是 1 条整串叶子', () => {
    const pairs = flatten({ meeting: { calendarWeekdays: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] } })
    expect(pairs).toHaveLength(7)
    expect(pairs.map(([path]) => path)).toEqual([
      'meeting.calendarWeekdays.[0]', 'meeting.calendarWeekdays.[1]', 'meeting.calendarWeekdays.[2]',
      'meeting.calendarWeekdays.[3]', 'meeting.calendarWeekdays.[4]', 'meeting.calendarWeekdays.[5]',
      'meeting.calendarWeekdays.[6]',
    ])
    // 阳性对照：旧写法会产出下面这一条。断言它**不再**出现，才叫钉住回归而不是描述现状。
    expect(pairs).not.toEqual([['meeting.calendarWeekdays', '週日,週一,週二,週三,週四,週五,週六']])
  })

  it('对象数组逐元素展开，不整条压成 [object Object]', () => {
    const pairs = flatten({ home: { todos: [{ title: '甲' }, { title: '乙' }] } })
    expect(pairs).toEqual([['home.todos.[0].title', '甲'], ['home.todos.[1].title', '乙']])
  })

  it('空容器保留结构占位，否则重建会把该 key 整个弄丢', () => {
    // 实测旧重建丢掉过 meeting.meta.minutesSend: {}
    expect(flatten({ meeting: { meta: { minutesSend: {} } } })).toEqual([['meeting.meta.minutesSend', EMPTY_OBJECT]])
    expect(flatten({ meeting: { list: [] } })).toEqual([['meeting.list', EMPTY_ARRAY]])
  })
})

describe('unflatten 与 flatten 严格互逆', () => {
  const cases = [
    { meeting: { calendarWeekdays: ['週日', '週一'] }, x: 1 },
    { home: { todos: [{ title: '甲', done: false }, { title: '乙' }] } },
    { meeting: { meta: { minutesSend: {} } }, emptyList: [] },
    { deep: { a: { b: { c: ['x', 'y', 'z'] } } } },
  ]
  cases.forEach((source, index) => {
    it(`用例 ${index + 1}：同形同序`, () => {
      expect(unflatten(flatten(source))).toEqual(source)
      expect(JSON.stringify(unflatten(flatten(source)))).toBe(JSON.stringify(source))
    })
  })

  it('[i] 段还原为数组下标而不是数字键对象', () => {
    const rebuilt = unflatten([['a.b.[0]', 'x'], ['a.b.[1]', 'y']])
    expect(Array.isArray(rebuilt.a.b)).toBe(true)
    expect(rebuilt.a.b).toEqual(['x', 'y'])
  })

  it('asIndex 只认 [数字]，普通键与 [abc] 一律按对象键处理', () => {
    expect(asIndex('[0]')).toBe(0)
    expect(asIndex('[12]')).toBe(12)
    expect(asIndex('weekday')).toBeNull()
    expect(asIndex('[abc]')).toBeNull()
  })
})

describe('真实语言包产物：数组型 key 必须仍是数组', () => {
  const tw = readLocale('zh-TW')
  const cn = readLocale('zh-CN')

  /** 直接遍历源结构找数组容器（不能从 flatten 的下标路径反推：对象数组的叶子路径带下标段，反推会落空） */
  const collectArrayPaths = (node, prefix = '', out = []) => {
    if (Array.isArray(node)) { out.push(prefix); return out }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        collectArrayPaths(value, prefix ? `${prefix}.${key}` : key, out)
      }
    }
    return out
  }
  const at = (root, path) => path.split('.').reduce((node, seg) => (node == null ? undefined : node[seg]), root)
  const arrayKeys = collectArrayPaths(tw)

  it('繁中真源确实有数组型 key（若为 0 则本组断言全部空转，必须先坐实）', () => {
    expect(arrayKeys.length).toBeGreaterThan(0)
  })

  it('zh-TW 与 zh-CN 在每个数组型 key 上同为数组且条数一致', () => {
    for (const path of arrayKeys) {
      const src = at(tw, path)
      const dst = at(cn, path)
      expect(Array.isArray(src), `繁中 ${path} 应为数组`).toBe(true)
      expect(Array.isArray(dst), `简中 ${path} 必须是数组，不能是逗号串（这是本次事故的形态）`).toBe(true)
      expect(dst).toHaveLength(src.length)
    }
  })

  it('事故 key 逐个点名复核（写死这几个路径，防止将来有人把它们改回字符串）', () => {
    expect(cn.meeting.calendarWeekdays).toHaveLength(7)
    expect(cn.adSales.weekdayShort).toHaveLength(7)
    expect(cn.portal.quotes).toHaveLength(30)
    // 事故当时的实际形态就是这一条：字符串。断言它不成立。
    expect(typeof cn.meeting.calendarWeekdays).not.toBe('string')
  })

  it('两份语言包摊平后的 key 序列完全一致（结构齐备，含数组下标）', () => {
    expect(flatten(cn).map(([path]) => path)).toEqual(flatten(tw).map(([path]) => path))
  })
})
