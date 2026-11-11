/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 優選商家卡「搜索态商品二选一」守卫。
 *
 * 命题：行列表券（id5）与带图商品横滑行（id17）本质同为商品/券，搜索态只渲染带图行；
 * 页签瀑布流（不传 showProducts）维持行列表。带图行须带 券/惠/秒 角标 + 名称 + 优惠价 + 划线原价。
 * 断言用 class 不用文案（文案走 i18n，拿名字定位会跟着语言包抖）。
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PreferredMerchantCard, { type PreferredGood, type PreferredMerchant } from './PreferredMerchantCard'

const base: PreferredMerchant = {
  key: 'm1',
  name: '翡翠茶餐廳',
  rating: '4.6',
  perPerson: '$76/人',
  cateArea: '淮揚菜·新馬路商圈',
  dist: '231m',
  logoText: '翡翠',
  logoTone: 'green',
  sales: '半年售300+',
  coupons: [{ icon: '惠', price: '90', discount: '5.8折', name: '代金券名称' }],
  cover: 'cover.jpg',
}

const goods: PreferredGood[] = [
  { name: '代10元券', image: 'a.jpg', price: '8', origin: '10', icon: '券' },
  { name: '雙人套餐券', image: 'b.jpg', price: '150', origin: '200', icon: '惠' },
  { name: '秒殺魚蛋粉', image: 'c.jpg', price: '19', origin: '32', icon: '秒' },
]

describe('搜索态商品二选一（行列表 vs 带图横滑行）', () => {
  it('搜索态：只渲染带图横滑行，行列表券不渲染', () => {
    const { container } = render(<PreferredMerchantCard item={{ ...base, goods }} showProducts />)
    expect(container.querySelector('.apq-goods')).toBeTruthy()
    expect(container.querySelector('.apq-coupons')).toBeNull()
  })

  it('搜索态不渲染收藏按钮，页签态保留', () => {
    const search = render(<PreferredMerchantCard item={{ ...base, goods }} showProducts />)
    expect(search.container.querySelector('.apq-fav')).toBeNull()
    const tab = render(<PreferredMerchantCard item={{ ...base, goods }} />)
    expect(tab.container.querySelector('.apq-fav')).toBeTruthy()
  })

  it('搜索态带图行字段齐备：券/惠/秒角标 + 名称 + 优惠价 + 划线原价', () => {
    const { container } = render(<PreferredMerchantCard item={{ ...base, goods }} showProducts />)
    expect(container.querySelectorAll('.apq-good')).toHaveLength(3)
    expect(container.querySelectorAll('.apq-good-ico')).toHaveLength(3)
    expect(container.querySelector('.apq-good-ico--quan')).toBeTruthy()
    expect(container.querySelector('.apq-good-ico--hui')).toBeTruthy()
    expect(container.querySelector('.apq-good-ico--miao')).toBeTruthy()
    expect(container.querySelector('.apq-good-name')?.textContent).toBe('代10元券')
    expect(container.querySelector('.apq-good-price em')?.textContent).toBe('$8')
    expect(container.querySelector('.apq-good-price s')?.textContent).toBe('$10')
  })

  it('页签态（不传 showProducts）：维持行列表券，不渲染带图行', () => {
    const { container } = render(<PreferredMerchantCard item={{ ...base, goods }} />)
    expect(container.querySelector('.apq-coupons')).toBeTruthy()
    expect(container.querySelector('.apq-goods')).toBeNull()
  })

  it('搜索态但无 goods：回退行列表券，不渲染空带图行', () => {
    const { container } = render(<PreferredMerchantCard item={base} showProducts />)
    expect(container.querySelector('.apq-coupons')).toBeTruthy()
    expect(container.querySelector('.apq-goods')).toBeNull()
  })

  it('未入驻 + 搜索态：券与带图行均不渲染', () => {
    const { container } = render(<PreferredMerchantCard item={{ ...base, goods, notJoined: true }} showProducts />)
    expect(container.querySelector('.apq-coupons')).toBeNull()
    expect(container.querySelector('.apq-goods')).toBeNull()
  })

  it('大圖模式不受搜索态二选一影响：仍渲染行列表券', () => {
    const { container } = render(<PreferredMerchantCard item={{ ...base, goods }} layout="large" showProducts />)
    expect(container.querySelector('.apq-coupons')).toBeTruthy()
    expect(container.querySelector('.apq-goods')).toBeNull()
  })
})
