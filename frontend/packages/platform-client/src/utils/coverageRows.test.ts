/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import type { CoverageVO, LanguageVO, TranslationVO } from '@/api/translation'
import {
  averageRate,
  buildCoverageRows,
  hasEstimatedRow,
  hasMissingInDb,
} from './coverageRows'

/**
 * 完成率口径测试。
 *
 * 事故原型：库里 8504 条全部翻完 → 六语都报 ~100%，而简体中文实际只能解析 51.4%。
 * 分母取成「库里记录数」时，前端有、但没同步入库的词条根本不进分母。
 * 本文件的每条断言都在盯「分母是谁给的」这一件事。
 */

const langs: LanguageVO[] = [
  { id: 1, code: 'zh-TW', name: '繁體中文', flag: '🇨🇳' },
  { id: 2, code: 'ja', name: '日本語', flag: '🇯🇵' },
]

/** 模拟库里只有 2 条已入库字段（都翻完了）——旧口径下这就是 100% */
const fields: TranslationVO[] = [
  { id: 1, fieldKey: 'common.add', fieldName: '新增', category: 'common', translations: { 'zh-TW': '新增', ja: '追加' }, source: 'sync' },
  { id: 2, fieldKey: 'common.delete', fieldName: '刪除', category: 'common', translations: { 'zh-TW': '刪除', ja: '削除' }, source: 'sync' },
]

const coverage = (lang: string, overrides: Partial<CoverageVO> = {}): CoverageVO => ({
  langCode: lang,
  total: 16048,
  translated: 2,
  rate: 2 / 16048,
  status: 'partial',
  dbTotal: 2,
  mirrorTotal: 16048,
  missingInDb: 16046,
  ...overrides,
})

describe('完成率全站口径', () => {
  it('后端给分母时用全站口径，库里翻完也不得显示 100%', () => {
    const rows = buildCoverageRows(langs, [coverage('zh-TW'), coverage('ja')], fields)

    expect(rows[0].total).toBe(16048)
    expect(rows[0].translated).toBe(2)
    expect(rows[0].rate).toBe(0)
    expect(rows[0].status).toBe('partial')
    expect(rows[0].estimated).toBe(false)
    // 决定性断言：若沿用 fields.length 当分母，这里就是 2/2 = 100%
    expect(rows[0].rate).toBeLessThan(1)
  })

  it('未入库缺口要原样透出，页面才能指出「加了文案没跑同步」', () => {
    const rows = buildCoverageRows(langs, [coverage('zh-TW'), coverage('ja')], fields)

    expect(rows[0].missingInDb).toBe(16046)
    expect(hasMissingInDb(rows)).toBe(true)
  })

  it('后端不可用时的兜底口径必须标注 estimated，不能伪装成全站读数', () => {
    const rows = buildCoverageRows(langs, [null, null], fields)

    expect(rows[0].estimated).toBe(true)
    expect(rows[0].total).toBe(2)
    // 兜底口径没有镜像可比，未入库只能报 0，且状态不得是 ready
    expect(rows[0].missingInDb).toBe(0)
    expect(rows[0].status).not.toBe('ready')
    expect(hasEstimatedRow(rows)).toBe(true)
  })

  it('coverage 返回空分母（后端还没建表）时也走兜底，不显示 0/0', () => {
    const rows = buildCoverageRows(langs, [coverage('zh-TW', { total: 0, translated: 0, rate: 0 }), null], fields)

    expect(rows[0].estimated).toBe(true)
    expect(rows[0].total).toBe(2)
    expect(rows[1].estimated).toBe(true)
  })

  it('平均完成率按分子分母加权，不做「行百分比的算术平均」', () => {
    const rows = buildCoverageRows(langs, [
      coverage('zh-TW', { total: 100, translated: 100, rate: 1 }),
      coverage('ja', { total: 1000, translated: 100, rate: 0.1 }),
    ], fields)

    // 行均值会把 100% 与 10% 平均成 55%；按 key 加权应是 200/1100 ≈ 18%
    expect(averageRate(rows)).toBe(18)
  })

  it('没有任何语言时不炸', () => {
    expect(buildCoverageRows([], [], fields)).toEqual([])
    expect(averageRate([])).toBe(0)
    expect(hasMissingInDb([])).toBe(false)
    expect(hasEstimatedRow([])).toBe(false)
  })
})
