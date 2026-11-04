/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { SCORE_RULE_CONFIG } from '@/api/mock/trafficSandboxMock'
import { DEFAULT_ORGANIC_SCORE_RULES, RETIRED_ORGANIC_RULE_IDS } from '../Recommend/organicTrafficConfig'
import zhTW from '@/i18n/locales/zh-TW.json'

/**
 * 沙盘 mock 的规则表（算法推演 / 商家評分透視降级供数）是手工维护的演示数据集，最容易和界面目录走散：
 * 已下架编码漏删就会出现「界面看不到、沙盘还在算」两套口径；编码改名换号后则会引用到不存在的项。
 * 本守卫只卡"不得多、不得错"两个方向，不要求 mock 覆盖全部内置项（缺项属演示数据集重设计，另案处理）。
 */
describe('沙盘 mock 规则表与默认计分项目录对齐', () => {
  const codes = SCORE_RULE_CONFIG.map(rule => rule.ruleCode)
  const catalogIds = DEFAULT_ORGANIC_SCORE_RULES.map(rule => rule.id)

  it('不引用已下架的計分項編碼', () => {
    expect(codes.filter(code => RETIRED_ORGANIC_RULE_IDS.includes(code))).toEqual([])
  })

  it('每条编码都仍在现行目录内', () => {
    expect(codes.filter(code => !catalogIds.includes(code))).toEqual([])
  })

  it('编码不重复，且名称 key 能在繁中语言包取到', () => {
    expect(new Set(codes).size).toBe(codes.length)
    const missing = SCORE_RULE_CONFIG.map(rule => rule.nameKey).filter(key => {
      const [ns, leaf] = key.split('.')
      const node = (zhTW as Record<string, unknown>)[ns]
      return typeof node !== 'object' || node === null || typeof (node as Record<string, unknown>)[leaf] !== 'string'
    })
    expect(missing).toEqual([])
  })
})
