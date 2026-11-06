/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * readTextArray 单测 —— 数组型文案的读取兜底。
 *
 * 钉住的事故：`t(key, { returnObjects: true }) as string[]` 在语言包把数组压成字符串时
 * 返回字符串，`.map()` 抛 TypeError 把整页打成错误边界（2026-11-06「我的会议」实测，
 * 且只在简体中文复现，繁中开发路径永远碰不到）。
 * 这里必须覆盖到**腐化输入本身**：只测正常数组路径的话，兜底分支一次都没跑过，
 * 等于把崩溃留在生产里等下一次语言切换。
 *
 * 兜底值来自繁中真源（zh-TW.json，全站源语言），所以断言的期望文案就是真源里的那 7 格，
 * 而不是代码里另写的一份中文。
 */
import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { readTextArray } from './index'
import zhTW from './locales/zh-TW.json'

/** 真源里的星期表头（7 格）—— 兜底期望值直接由它推得，避免测试与实现各写一份 */
const SOURCE_WEEKDAYS = zhTW.meeting.calendarWeekdays as string[]
const SOURCE_SHORT_WEEKDAYS = zhTW.adSales.weekdayShort as string[]

/** 用假 t 直接给定 returnObjects 的返回值，不依赖真实 i18next 实例 */
const fakeT = (value: unknown): TFunction =>
  ((key: string) => (value === undefined ? key : value)) as unknown as TFunction

describe('readTextArray：真源有该键（结构型数组）', () => {
  it('当前语言取到合法数组时原样返回，不被真源覆盖', () => {
    const simplified = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    expect(readTextArray(fakeT(simplified), 'meeting.calendarWeekdays')).toEqual(simplified)
  })

  it('真源本身（繁中）取到就是它自己', () => {
    expect(readTextArray(fakeT(SOURCE_WEEKDAYS), 'meeting.calendarWeekdays')).toEqual(SOURCE_WEEKDAYS)
  })

  it('腐化逗号串被拆回 7 格，而不是让 .map 崩掉', () => {
    expect(readTextArray(fakeT('周日,周一,周二,周三,周四,周五,周六'), 'meeting.calendarWeekdays'))
      .toEqual(['周日', '周一', '周二', '周三', '周四', '周五', '周六'])
  })

  it('数据库镜像形态（带方括号与空格）也能拆回', () => {
    expect(readTextArray(fakeT('[Sun, Mon, Tue, Wed, Thu, Fri, Sat]'), 'meeting.calendarWeekdays'))
      .toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('条数不符时整组回落到繁中真源：缺一格就是表头与格子错位，不能凑数', () => {
    const result = readTextArray(fakeT(['周一', '周二']), 'meeting.calendarWeekdays')
    expect(result).toEqual(SOURCE_WEEKDAYS)
    expect(result).toHaveLength(7)
  })

  it('查不到 key 时（i18next 原样返回 key 字符串）回落真源，绝不把 key 拆成标签', () => {
    // 这条是最阴险的形态：'meeting.calendarWeekdays' 里没有逗号，但含点号，
    // 若按点号乱拆会得到 'meeting'/'calendarWeekdays' 之类的垃圾表头
    expect(readTextArray(fakeT(undefined), 'meeting.calendarWeekdays')).toEqual(SOURCE_WEEKDAYS)
  })

  it('空串与纯空白一律回落真源', () => {
    expect(readTextArray(fakeT(''), 'meeting.calendarWeekdays')).toEqual(SOURCE_WEEKDAYS)
    expect(readTextArray(fakeT('  ,, , '), 'meeting.calendarWeekdays')).toEqual(SOURCE_WEEKDAYS)
  })

  it('跨 namespace 调用必须显式给真源路径，否则回落不到值', () => {
    // 假 t 返回腐化串：sourcePath 给对 → 拆回；给错（真源无此路径）→ 空数组
    const broken = '日,一,二,三,四,五,六'
    expect(readTextArray(fakeT(broken), 'weekdayShort', 'adSales.weekdayShort'))
      .toEqual(['日', '一', '二', '三', '四', '五', '六'])
    expect(readTextArray(fakeT(undefined), 'weekdayShort', 'no.such.path')).toEqual([])
  })

  it('真源里确实有 adSales.weekdayShort 的 7 格（防止上面的断言空转）', () => {
    expect(SOURCE_SHORT_WEEKDAYS).toHaveLength(7)
  })
})

describe('readTextArray：真源没有该键', () => {
  it('返回当前语言取到的合法数组', () => {
    expect(readTextArray(fakeT(['甲', '乙']), 'no.such.key')).toEqual(['甲', '乙'])
  })

  it('腐化串不拆（真源没给出条数契约时无从校验），按「无数据」返回空', () => {
    expect(readTextArray(fakeT('把每一件简单的事做好，就是不简单,今天的推进'), 'no.such.key')).toEqual([])
  })

  it('数组里的空条目被过滤掉', () => {
    expect(readTextArray(fakeT(['甲', '', '  ', '乙']), 'no.such.key')).toEqual(['甲', '乙'])
  })

  it('全是空条目的数组视为无数据', () => {
    expect(readTextArray(fakeT(['', '  ']), 'no.such.key')).toEqual([])
  })
})
