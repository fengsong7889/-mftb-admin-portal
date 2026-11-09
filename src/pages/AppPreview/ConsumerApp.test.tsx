/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 閃蜂壳同步命令门禁（频道内搜索面板）
 *
 * 钉住：说明面板「美食外卖页 / 特惠团购页 · 搜索结果瀑布流」命令（delivery-search / groupbuy-search）
 * 使閃蜂进入对应频道内搜索并携带关键词直达结果页瀑布流（无分类切换 Tab），与 MFOOD 壳同口径。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import i18n from '@/i18n'
import ConsumerApp from './ConsumerApp'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('閃蜂壳频道搜索同步命令', () => {
  it('美食外卖页·搜索结果瀑布流面板：进入外卖频道内搜索（门店卡瀑布流，无分类 Tab）', () => {
    const { rerender } = render(<ConsumerApp syncCategory="delivery-search" syncSeq={0} />)
    rerender(<ConsumerApp syncCategory="delivery-search" syncSeq={1} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('毛氏海鮮火鍋飯店（湘粵融合菜）')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0)
  })

  it('特惠团购页·搜索结果瀑布流面板：进入团购频道内搜索（優選商家卡瀑布流，无分类 Tab）', () => {
    const { rerender } = render(<ConsumerApp syncCategory="groupbuy-search" syncSeq={0} />)
    rerender(<ConsumerApp syncCategory="groupbuy-search" syncSeq={1} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0)
  })
})
