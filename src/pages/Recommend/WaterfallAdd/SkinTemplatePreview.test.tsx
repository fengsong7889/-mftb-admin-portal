/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/** SkinTemplatePreview 大图四版式结构冒烟：海报/LOGO 叠层与横滑商品行的渲染口径 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SkinTemplatePreview from './SkinTemplatePreview'
import type { LargeLayout, SkinSaleConfig } from '@/constants/popularSkinTemplates'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh-TW', language: 'zh-TW' } }),
}))

function makeSkin(layout: LargeLayout): SkinSaleConfig {
  return {
    templateKey: `large_${layout}`,
    displayMode: 'large',
    saleEnabled: true,
    name: '測試皮膚',
    price: 20,
    tier: 'classic',
    layout,
    fallbackPosterKey: 'poster_red',
    posterSource: 'fallback',
  }
}

describe('SkinTemplatePreview 大图四版式', () => {
  it('grid 大图拼列：海报+顶部LOGO、1大2小商品图、无横滑卡', () => {
    const { container } = render(<SkinTemplatePreview skin={makeSkin('grid')} />)
    expect(container.querySelector('.skin-studio__poster img')).toBeTruthy()
    expect(container.querySelector('.skin-stage__poster-logo')).toBeTruthy()
    expect(container.querySelector('.skin-stage__lead .skin-stage__dish-photo')).toBeTruthy()
    expect(container.querySelectorAll('.skin-stage__dishes--grid .skin-stage__dish')).toHaveLength(3)
    expect(container.querySelectorAll('.skin-stage__row-dish')).toHaveLength(0)
  })

  it('carousel 阶梯轮播：3张阶梯堆叠+折扣角标+底部名称行', () => {
    const { container } = render(<SkinTemplatePreview skin={makeSkin('carousel')} />)
    expect(container.querySelectorAll('.skin-stage__slide')).toHaveLength(3)
    expect(container.querySelector('.skin-stage__deal-badge')).toBeTruthy()
    expect(container.querySelector('.skin-stage__below-name')).toBeTruthy()
    expect(container.querySelector('.skin-stage__poster-logo')).toBeTruthy()
  })

  it('small 小图模式：门店LOGO+商家信息完整（回归守卫：不得丢 MerchantInfo）', () => {
    const { container } = render(<SkinTemplatePreview skin={{
      ...makeSkin('grid'), displayMode: 'small', layout: undefined, templateKey: 'small_red',
    }} />)
    expect(container.querySelector('.skin-stage__logo')).toBeTruthy()
    expect(container.querySelector('.skin-stage__title-row')).toBeTruthy()
    expect(container.querySelector('.skin-stage__rating')).toBeTruthy()
    expect(container.querySelector('.skin-stage__coupons')).toBeTruthy()
  })

  it('triple 爆款商品横滑：仅门店LOGO块无海报、5张横滑商品卡', () => {
    const { container } = render(<SkinTemplatePreview skin={makeSkin('triple')} />)
    expect(container.querySelector('.skin-stage--logo-only')).toBeTruthy()
    expect(container.querySelector('.skin-stage__logo-block')).toBeTruthy()
    expect(container.querySelector('.skin-studio__poster')).toBeNull()
    expect(container.querySelector('.skin-stage__poster-logo')).toBeNull()
    expect(container.querySelectorAll('.skin-stage__row-dish')).toHaveLength(5)
    expect(container.querySelectorAll('.skin-stage__dishes--row .skin-stage__dish-photo')).toHaveLength(5)
  })

  it('hero 主推商品横滑：海报+顶部LOGO、右侧5张横滑商品卡', () => {
    const { container } = render(<SkinTemplatePreview skin={makeSkin('hero')} />)
    expect(container.querySelector('.skin-studio__poster img')).toBeTruthy()
    expect(container.querySelector('.skin-stage__poster-logo')).toBeTruthy()
    expect(container.querySelectorAll('.skin-stage__dishes--hero .skin-stage__row-dish')).toHaveLength(5)
  })
})
