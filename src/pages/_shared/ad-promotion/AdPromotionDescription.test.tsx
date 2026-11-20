/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { act, render } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { AlgorithmType } from '@mftb/contracts/recommendConstants'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh-CN.json'
import en from '@/i18n/locales/en.json'
import AdPromotionDescription from './AdPromotionDescription'

const CASES = [
  [AlgorithmType.INVINCIBLE_STAR, 'descInvincibleStar'],
  [AlgorithmType.HOT_REVIVE_AD, 'descHotRevive'],
  [AlgorithmType.NEW_STORE_AD, 'descNewStore'],
  [AlgorithmType.BRAND_MERCHANT, 'descBrandMerchant'],
  [AlgorithmType.EXCLUSIVE_MERCHANT, 'descExclusiveMerchant'],
  [AlgorithmType.GOLDEN_SIGNBOARD, 'descGoldenSignboard'],
  [AlgorithmType.TRAFFIC_AD, 'descTraffic'],
  [AlgorithmType.GUESS_YOU_LIKE, 'descGuessYouLike'],
  [AlgorithmType.ORGANIC_TRAFFIC, 'descOrganicTraffic'],
  [AlgorithmType.POPULAR_MERCHANT_KA, 'descPopularMerchant'],
  [AlgorithmType.TIME_SLOT_AD, 'descTimeSlotAd'],
] as const
const resources = { 'zh-TW': { translation: zhTW }, 'zh-CN': { translation: zhCN }, en: { translation: en } }

describe('广告卡片共用双行文案', () => {
  it.each(CASES)('广告 %s 使用既有键 %s，真实切换三语仍保持两段完整文案', async (type, key) => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({ lng: 'zh-TW', resources, fallbackLng: 'en', interpolation: { escapeValue: false } })
    const { container } = render(<I18nextProvider i18n={i18n}><AdPromotionDescription type={type} /></I18nextProvider>)
    for (const language of ['zh-TW', 'zh-CN', 'en'] as const) {
      await act(async () => { await i18n.changeLanguage(language) })
      const expected = resources[language].translation.algorithm[key]
      expect(expected.split('\n')).toHaveLength(2)
      expect(expected.split('\n').every(line => line.trim().length > 0)).toBe(true)
      expect(container.querySelector('.algo-card-desc')?.textContent).toBe(expected)
      expect(expected).not.toContain('algorithm.')
    }
  })

  it('没有恢复已撤回的夸张承诺或遗漏下午茶的四时段文案', () => {
    expect(zhCN.algorithm.descInvincibleStar).toBe('跨商圈抢占黄金展位\n门店商品强势曝光')
    expect(zhCN.algorithm.descTimeSlotAd).toBe('覆盖五个餐饮时段\n按时段触达用餐客群')
    const copy = CASES.map(([, key]) => zhCN.algorithm[key]).join('\n')
    expect(copy).not.toMatch(/无视区域|品质认证|免费高曝光|拉满|老客流/)
  })
})
