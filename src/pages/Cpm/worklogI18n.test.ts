/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { SPECIAL_DAY_TYPES, TASK_STATUS_META, weekdayShort } from './worklogGanttModel'

/**
 * 台账/汇报文案的语言包落地校验。
 *
 * check:i18n 的「引用解析」扫的是全仓 t('字面量')，但它看不到两件事：
 * ①数组型 key（星期缩写）是否真的还是 7 个元素；②嵌套节点写歪造成的
 * `cpm.gantt.gantt.*` 双层重复（key 存在但界面永远回落 defaultValue）。
 * 这里用源码提取 + 真读语言包的方式把这两条钉住，不靠肉眼切语言。
 */

const FILES = [
  'src/pages/Cpm/WorklogGantt.tsx',
  'src/pages/Cpm/worklogGanttModel.ts',
  'src/pages/Cpm/worklogReport.ts',
  'src/pages/Cpm/MyReport.tsx',
  'src/pages/Cpm/HolidayConfig.tsx',
  'src/pages/Cpm/CpmReportArchive.tsx',
]
const KEY_RE = /(?:\bi18n\.)?\bt\(\s*['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]/g
const LOCALE_DIR = join(process.cwd(), 'frontend/packages/i18n/src/i18n/locales')

function resolve(doc: unknown, dotted: string): unknown {
  let node: unknown = doc
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in (node as Record<string, unknown>))) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

const locales = {
  'zh-TW': JSON.parse(readFileSync(join(LOCALE_DIR, 'zh-TW.json'), 'utf-8')) as unknown,
  en: JSON.parse(readFileSync(join(LOCALE_DIR, 'en.json'), 'utf-8')) as unknown,
}

/** 源码里出现过的全部静态 key（去重） */
const referenced = new Set<string>()
for (const file of FILES) {
  const text = readFileSync(join(process.cwd(), file), 'utf-8')
  for (const match of text.matchAll(KEY_RE)) referenced.add(match[1])
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('语言包落地', () => {
  it('台账与汇报引用的每个静态 key 在繁中/英文都取得到非空文案', () => {
    expect(referenced.size).toBeGreaterThan(200)
    const problems: string[] = []
    for (const key of referenced) {
      for (const [lang, doc] of Object.entries(locales)) {
        const value = resolve(doc, key)
        if (value === undefined) problems.push(`${lang} 缺 key：${key}`)
        else if (typeof value === 'string' && !value.trim()) problems.push(`${lang} 空串：${key}`)
      }
    }
    expect(problems, problems.slice(0, 20).join('\n')).toEqual([])
  })

  it('没有 cpm.gantt.gantt 这类双层重复节点（写歪时界面永远回落兜底文案）', () => {
    for (const ns of ['cpm', 'recommend']) {
      for (const dup of [`${ns}.${ns}`, 'cpm.gantt.gantt', 'cpm.holiday.holiday', 'cpm.workReport.workReport']) {
        expect(resolve(locales['zh-TW'], dup), `zh-TW 出现双层节点 ${dup}`).toBeUndefined()
      }
    }
  })

  it('星期缩写是 7 元素数组，两语一致（数组型 key 不进翻译库，只能由静态包供数）', () => {
    const tw = resolve(locales['zh-TW'], 'cpm.gantt.weekdayShort')
    const en = resolve(locales['en'], 'cpm.gantt.weekdayShort')
    expect(Array.isArray(tw) && tw.length).toBe(7)
    expect(Array.isArray(en) && en.length).toBe(7)
    expect(weekdayShort(0)).toBe('日')
    expect(weekdayShort(6)).toBe('六')
  })

  it('状态与特殊日期标签表切语言立刻换词（模块级常量表必须用 getter）', async () => {
    const twLabels = (Object.keys(TASK_STATUS_META) as (keyof typeof TASK_STATUS_META)[]).map(k => TASK_STATUS_META[k].label)
    const twTypes = SPECIAL_DAY_TYPES.map(x => x.label)
    expect(twLabels).toEqual(['已完成', '進行中', '待處理', '待排期'])
    expect(twTypes).toEqual(['節假日', '補班', '調休', '請假'])

    await i18n.changeLanguage('en')
    const enLabels = (Object.keys(TASK_STATUS_META) as (keyof typeof TASK_STATUS_META)[]).map(k => TASK_STATUS_META[k].label)
    const enTypes = SPECIAL_DAY_TYPES.map(x => x.label)
    expect(enLabels).toEqual(['Done', 'In progress', 'Pending', 'Unscheduled'])
    expect(enTypes).toEqual(['Holiday', 'Makeup shift', 'Comp leave', 'Leave'])
    // 兜底防线：语言包缺词时 t() 会返回 key 本身，界面就会显示 "cpm.gantt.dayType.holiday"
    expect([...enLabels, ...enTypes].some(v => v.includes('cpm.'))).toBe(false)

    await i18n.changeLanguage('zh-TW')
  })
})
