/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 美食外卖两排筛选栏守卫。
 *
 * 命题：第一排=綜合排序+距離/配送下拉+篩選；第二排=优惠活动标签横滑，蜂蜜兌換仅閃蜂。
 * 距離下拉=时效/范围互斥单选；配送下拉=配送方式/配送保障互斥单选；
 * 面板为左分组页签+右 radio 单选行（复用附近面板视觉）；
 * 选中回写按钮文案并收起面板，再点同项取消；同一时刻只开一个下拉；
 * 綜合排序点击恢复默认（清空距離/配送）；篩選 sheet 七模块（大小图切换上报、时效范围/配送与列表共享、重置清空）。
 */
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DeliveryFilterBar, { useDeliveryFilters, type DeliveryFilterBrand } from './DeliveryFilterBar'

/** hook 测试挂载器：bar 与 sheet 同树渲染（真实页面的 DOM 位置不影响 jsdom 断言） */
function FilterHarness({ brand, layout, onLayoutChange }: { brand: DeliveryFilterBrand; layout?: 'small' | 'large'; onLayoutChange?: (mode: 'small' | 'large') => void }) {
  const f = useDeliveryFilters({ brand, layout, onLayoutChange })
  return (
    <>
      {f.bar}
      {f.sheet}
    </>
  )
}

describe('美食外卖两排筛选栏', () => {
  it('第一排四项齐备；第二排首项随品牌分流（閃蜂神會員/MFOOD勁爆券）、蜂蜜兌換仅閃蜂', () => {
    const bee = render(<DeliveryFilterBar brand="bee" />)
    const b = within(bee.container)
    expect(b.getByRole('button', { name: '綜合排序' })).toBeTruthy()
    expect(b.getByRole('button', { name: '距離' })).toBeTruthy()
    expect(b.getByRole('button', { name: '配送' })).toBeTruthy()
    expect(b.getByRole('button', { name: '篩選' })).toBeTruthy()
    expect(b.getByText('神會員')).toBeTruthy()
    expect(b.getByText('蜂蜜兌換')).toBeTruthy()
    // 说明行悬停联动锚点：第一排+第二排共 6 处（id1 整栏 / id13 綜合排序 / id2 距離 / id3 配送 / id4 标签行 / id5 篩選）
    expect(bee.container.querySelectorAll('[data-spec-id]')).toHaveLength(6)
    bee.unmount()

    const mfood = render(<DeliveryFilterBar brand="mfood" />)
    const m = within(mfood.container)
    expect(m.queryByText('神會員')).toBeNull()
    expect(m.getByText('勁爆券')).toBeTruthy()
    expect(m.queryByText('蜂蜜兌換')).toBeNull()
    expect(m.getByText('收藏送券')).toBeTruthy()
  })

  it('距離下拉：左时效/范围页签+右单选行，互斥回写、取消与 has-pick 标橙', () => {
    const { container } = render(<DeliveryFilterBar brand="bee" />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '距離' }))
    const p = within(c.getByRole('group', { name: '距離篩選面板' }))
    // 左页签齐备；默认浏览时效：右列时效行在、范围行不在
    expect(p.getByRole('button', { name: '時效' })).toBeTruthy()
    expect(p.getByRole('button', { name: '範圍' })).toBeTruthy()
    expect(p.getByRole('button', { name: '60分鐘' })).toBeTruthy()
    expect(p.queryByRole('button', { name: '5KM' })).toBeNull()
    // 切范围页签浏览范围行
    fireEvent.click(p.getByRole('button', { name: '範圍' }))
    expect(p.getByRole('button', { name: '5KM' })).toBeTruthy()
    expect(p.queryByRole('button', { name: '60分鐘' })).toBeNull()

    // 选时效：面板收起，按钮回写 30分鐘
    fireEvent.click(p.getByRole('button', { name: '時效' }))
    fireEvent.click(p.getByRole('button', { name: '30分鐘' }))
    expect(c.queryByRole('group', { name: '距離篩選面板' })).toBeNull()
    expect(c.getByRole('button', { name: '30分鐘' })).toBeTruthy()

    // 重开改选范围：时效被互斥清除
    fireEvent.click(c.getByRole('button', { name: '30分鐘' }))
    const p2 = within(c.getByRole('group', { name: '距離篩選面板' }))
    fireEvent.click(p2.getByRole('button', { name: '範圍' }))
    fireEvent.click(p2.getByRole('button', { name: '2KM' }))
    expect(c.getByRole('button', { name: '2KM' })).toBeTruthy()
    expect(c.queryByRole('button', { name: '30分鐘' })).toBeNull()

    // 重开浏览时效：持有选中值的范围页签仍 has-pick 标橙
    fireEvent.click(c.getByRole('button', { name: '2KM' }))
    const panel3 = c.getByRole('group', { name: '距離篩選面板' })
    fireEvent.click(within(panel3).getByRole('button', { name: '時效' }))
    expect(panel3.querySelector('.apg-region.has-pick')?.textContent).toBe('範圍')

    // 再点同项取消：回默认文案 距離
    fireEvent.click(within(panel3).getByRole('button', { name: '範圍' }))
    fireEvent.click(within(panel3).getByRole('button', { name: '2KM' }))
    expect(c.getByRole('button', { name: '距離' })).toBeTruthy()
  })

  it('配送下拉：左配送/配送保障页签+右单选行，互斥单选', () => {
    const { container } = render(<DeliveryFilterBar brand="mfood" />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '配送' }))
    const p = within(c.getByRole('group', { name: '配送篩選面板' }))
    expect(p.getByRole('button', { name: '配送保障' })).toBeTruthy()
    for (const name of ['平台送', '商家送', '到店自取']) {
      expect(p.getByRole('button', { name })).toBeTruthy()
    }
    // 默认浏览配送：準時寶行不在；切保障页签才在
    expect(p.queryByRole('button', { name: '準時寶' })).toBeNull()
    fireEvent.click(p.getByRole('button', { name: '配送保障' }))
    expect(p.getByRole('button', { name: '準時寶' })).toBeTruthy()

    // 切回配送选平台送：收起并回写
    fireEvent.click(p.getByRole('button', { name: '配送' }))
    fireEvent.click(p.getByRole('button', { name: '平台送' }))
    expect(c.queryByRole('group', { name: '配送篩選面板' })).toBeNull()
    expect(c.getByRole('button', { name: '平台送' })).toBeTruthy()

    // 改选準時寶：方式被互斥清除
    fireEvent.click(c.getByRole('button', { name: '平台送' }))
    const p2 = within(c.getByRole('group', { name: '配送篩選面板' }))
    fireEvent.click(p2.getByRole('button', { name: '配送保障' }))
    fireEvent.click(p2.getByRole('button', { name: '準時寶' }))
    expect(c.getByRole('button', { name: '準時寶' })).toBeTruthy()
    expect(c.queryByRole('button', { name: '平台送' })).toBeNull()
  })

  it('同一时刻只开一个下拉：开配送即收距離', () => {
    const { container } = render(<DeliveryFilterBar brand="bee" />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '距離' }))
    expect(c.getByRole('group', { name: '距離篩選面板' })).toBeTruthy()
    fireEvent.click(c.getByRole('button', { name: '配送' }))
    expect(c.queryByRole('group', { name: '距離篩選面板' })).toBeNull()
    expect(c.getByRole('group', { name: '配送篩選面板' })).toBeTruthy()
  })

  it('綜合排序点击：距離/配送两个下拉恢复默认并收起面板', () => {
    const { container } = render(<DeliveryFilterBar brand="bee" />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '距離' }))
    fireEvent.click(within(c.getByRole('group', { name: '距離篩選面板' })).getByRole('button', { name: '30分鐘' }))
    expect(c.getByRole('button', { name: '30分鐘' })).toBeTruthy()
    fireEvent.click(c.getByRole('button', { name: '綜合排序' }))
    expect(c.getByRole('button', { name: '距離' })).toBeTruthy()
    expect(c.queryByRole('button', { name: '30分鐘' })).toBeNull()
    expect(c.queryByRole('group', { name: '距離篩選面板' })).toBeNull()
  })

  it('篩選 sheet：七模块齐备、大小图切换上报、时效范围与列表共享、活动优惠含超值換購', () => {
    const onLayoutChange = vi.fn()
    const { container } = render(<FilterHarness brand="bee" layout="small" onLayoutChange={onLayoutChange} />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '篩選' }))
    const s = within(c.getByRole('group', { name: '美食外賣篩選面板' }))
    // 七模块标题齐备（多选模块带 (可多選) 尾缀；h4 直接文本不含子元素内容，故用锚定正则匹配标题本体）
    for (const title of ['列表大小圖切換', '人均價', '時效範圍', '配送', '商家', '品質', '活动优惠']) {
      expect(s.getByText(new RegExp(`^${title}$`))).toBeTruthy()
    }
    // 商家模块 2026-11 回补：四选项可多選
    for (const name of ['必試新店', '金牌商家', '品牌商家', '連鎖商家']) {
      expect(s.getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.click(s.getByRole('button', { name: '金牌商家' }))
    expect(s.getByRole('button', { name: '金牌商家' }).getAttribute('aria-pressed')).toBe('true')
    // 大小图切换即时上报（瀑布流由父级随 deliveryPageMode 重渲染）
    fireEvent.click(s.getByRole('button', { name: '大圖模式' }))
    expect(onLayoutChange).toHaveBeenCalledWith('large')
    // 時效範圍与列表下拉共享：sheet 选 2KM → bar 下拉按钮回写 2KM（sheet 胶囊 + bar 触发器两处）
    fireEvent.click(s.getByRole('button', { name: '2KM' }))
    expect(c.getAllByRole('button', { name: '2KM' })).toHaveLength(2)
    expect(c.queryByRole('button', { name: '距離' })).toBeNull()
    // 人均价滑杆两端值（$0–$100+）
    expect(s.getByText('$0')).toBeTruthy()
    expect(s.getByText('$100+')).toBeTruthy()
    // 活动优惠=DELIVERY_PROMO_TAGS 真源：蜂蜜兌換閃蜂在、超值換購按 2026-11 口径恢复；sheet 内锚点 7 处（id6~12），bar 上 6 处（id1/13/2/3/4/5），合计 13
    expect(s.getByText('蜂蜜兌換')).toBeTruthy()
    for (const tag of ['組合優惠', '半價優惠', '自取折扣', '集點返券', '超值換購']) {
      expect(s.getByText(tag)).toBeTruthy()
    }
    expect(c.getAllByRole('group', { name: '美食外賣篩選面板' })[0].querySelectorAll('[data-spec-id]')).toHaveLength(7)
    expect(container.querySelectorAll('[data-spec-id]')).toHaveLength(13)
    // 完成：收起 sheet
    fireEvent.click(s.getByRole('button', { name: /完成/ }))
    expect(c.queryByRole('group', { name: '美食外賣篩選面板' })).toBeNull()
  })

  it('篩選 sheet：重置清空全部模块（含共享的时效范围/配送），蜂蜜兌換 MFOOD 不展示', () => {
    const { container } = render(<FilterHarness brand="mfood" />)
    const c = within(container)
    fireEvent.click(c.getByRole('button', { name: '篩選' }))
    const s = within(c.getByRole('group', { name: '美食外賣篩選面板' }))
    expect(s.queryByText('蜂蜜兌換')).toBeNull()
    fireEvent.click(s.getByRole('button', { name: '2KM' }))
    fireEvent.click(s.getByRole('button', { name: '準時寶' }))
    fireEvent.click(s.getByRole('button', { name: '五星好評' }))
    fireEvent.click(s.getByRole('button', { name: '金牌商家' }))
    fireEvent.click(s.getByRole('button', { name: '勁爆券' }))
    fireEvent.click(s.getByRole('button', { name: '重置' }))
    for (const name of ['2KM', '準時寶', '五星好評', '金牌商家', '勁爆券']) {
      expect(s.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false')
    }
    expect(c.getByRole('button', { name: '距離' })).toBeTruthy()
    expect(c.getByRole('button', { name: '配送' })).toBeTruthy()
  })
})