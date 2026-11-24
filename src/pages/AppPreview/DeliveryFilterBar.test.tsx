/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 美食外卖单行筛选栏守卫。
 *
 * 命题：顶部只保留优惠活动标签横滑 + 右缘筛选图标；时效范围/配送移至筛选 sheet，
 * 蜂蜜兑换仅闪蜂展示，sheet 七模块、单选/多选、重置和大小图切换保持可用。
 */
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DeliveryFilterBar, { useDeliveryFilters, type DeliveryFilterBrand } from './DeliveryFilterBar'

/** hook 测试挂载器：bar 与 sheet 同树渲染（真实页面的 DOM 位置不影响 jsdom 断言） */
function FilterHarness({ brand, layout, onLayoutChange }: { brand: DeliveryFilterBrand; layout?: 'small' | 'large'; onLayoutChange?: (mode: 'small' | 'large') => void }) {
  const filters = useDeliveryFilters({ brand, layout, onLayoutChange })
  return (
    <>
      {filters.bar}
      {filters.sheet}
    </>
  )
}

describe('美食外卖单行筛选栏', () => {
  it('移除顶部旧入口，优惠标签按品牌分流且蜂蜜兑换仅闪蜂', () => {
    const bee = render(<DeliveryFilterBar brand="bee" />)
    const beeScope = within(bee.container)
    for (const name of ['綜合排序', '距離', '配送']) {
      expect(beeScope.queryByRole('button', { name })).toBeNull()
    }
    expect(beeScope.getByRole('button', { name: '篩選' })).toBeTruthy()
    expect(beeScope.getByText('神會員')).toBeTruthy()
    expect(beeScope.getByText('官方神券')).toBeTruthy()
    expect(beeScope.getByText('蜂蜜兌換')).toBeTruthy()
    // 单行栏锚点：id14 整栏 / id4 优惠标签 / id5 筛选按钮
    expect(bee.container.querySelectorAll('[data-spec-id]')).toHaveLength(3)
    bee.unmount()

    const mfood = render(<DeliveryFilterBar brand="mfood" />)
    const mfoodScope = within(mfood.container)
    expect(mfoodScope.queryByText('神會員')).toBeNull()
    expect(mfoodScope.getByText('勁爆券')).toBeTruthy()
    expect(mfoodScope.queryByText('蜂蜜兌換')).toBeNull()
    expect(mfoodScope.getByText('收藏送券')).toBeTruthy()
  })

  it('筛选 sheet 七模块齐备，单选/多选、大小图切换与活动优惠保持可用', () => {
    const onLayoutChange = vi.fn()
    const { container } = render(<FilterHarness brand="bee" layout="small" onLayoutChange={onLayoutChange} />)
    const scope = within(container)
    fireEvent.click(scope.getByRole('button', { name: '篩選' }))
    const sheet = within(scope.getByRole('group', { name: '美食外賣篩選面板' }))

    for (const title of ['列表大小圖切換', '人均價', '時效範圍', '配送', '商家', '品質', '活动优惠']) {
      expect(sheet.getByText(new RegExp(`^${title}$`))).toBeTruthy()
    }
    for (const name of ['必試新店', '金牌商家', '品牌商家', '連鎖商家']) {
      expect(sheet.getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.click(sheet.getByRole('button', { name: '金牌商家' }))
    expect(sheet.getByRole('button', { name: '金牌商家' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(sheet.getByRole('button', { name: '大圖模式' }))
    expect(onLayoutChange).toHaveBeenCalledWith('large')

    fireEvent.click(sheet.getByRole('button', { name: '2KM' }))
    expect(sheet.getByRole('button', { name: '2KM' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(sheet.getByRole('button', { name: '平台送' }))
    expect(sheet.getByRole('button', { name: '平台送' }).getAttribute('aria-pressed')).toBe('true')

    expect(sheet.getByText('$0')).toBeTruthy()
    expect(sheet.getByText('$100+')).toBeTruthy()
    expect(sheet.getByText('蜂蜜兌換')).toBeTruthy()
    for (const tag of ['組合優惠', '半價優惠', '自取折扣', '集點返券', '超值換購']) {
      expect(sheet.getByText(tag)).toBeTruthy()
    }
    // bar 3 个锚点 + sheet 7 个锚点
    expect(container.querySelectorAll('[data-spec-id]')).toHaveLength(10)

    fireEvent.click(sheet.getByRole('button', { name: /完成/ }))
    expect(scope.queryByRole('group', { name: '美食外賣篩選面板' })).toBeNull()
  })

  it('重置清空全部模块，MFOOD 不展示蜂蜜兑换', () => {
    const { container } = render(<FilterHarness brand="mfood" />)
    const scope = within(container)
    fireEvent.click(scope.getByRole('button', { name: '篩選' }))
    const sheet = within(scope.getByRole('group', { name: '美食外賣篩選面板' }))

    expect(sheet.queryByText('蜂蜜兌換')).toBeNull()
    for (const name of ['2KM', '準時寶', '五星好評', '金牌商家', '勁爆券']) {
      fireEvent.click(sheet.getByRole('button', { name }))
    }
    fireEvent.click(sheet.getByRole('button', { name: '重置' }))
    for (const name of ['2KM', '準時寶', '五星好評', '金牌商家', '勁爆券']) {
      expect(sheet.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false')
    }
  })
})
