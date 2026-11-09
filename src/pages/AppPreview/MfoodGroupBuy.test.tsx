/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * MFOOD 特惠團購页 · 入口与结构门禁
 *
 * 钉住设计稿图1-3口径：首页分类宫格/底部 Tab 双入口、勁爆秒殺页签行、筛选胶囊、
 * 共享瀑布流卡（橙秒殺/紫搶購混排）、滚动后吸顶搜索行+文字下划线页签行（图3）。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '@/i18n'
import MfoodApp from './MfoodApp'
import MfoodGroupBuy from './MfoodGroupBuy'
import MfoodHome from './MfoodHome'

const noop = () => {}

describe('MFOOD 特惠團購', () => {
  beforeAll(async () => {
    // 文案已接入 i18n：不固定語言時斷言会命中英文分支
    await i18n.changeLanguage('zh-TW')
  })

  it('入口：首页分类宫格「特價團購」与底部 Tab「團購」均可进入', () => {
    const onOpenGroupBuy = vi.fn()
    const home = render(<MfoodHome onOpenGroupBuy={onOpenGroupBuy} />)
    // 分类宫格与分类切换页签同名，宫格在 DOM 中在前
    fireEvent.click(home.getAllByText('特價團購')[0])
    expect(onOpenGroupBuy).toHaveBeenCalledTimes(1)
    home.unmount()

    const app = render(<MfoodApp />)
    fireEvent.click(screen.getByRole('button', { name: '團購' }))
    expect(screen.getByText('更多優惠 ›')).toBeInTheDocument()
    // 回首页：底部 Tab 首頁
    fireEvent.click(screen.getByRole('button', { name: '首頁' }))
    expect(screen.queryByText('更多優惠 ›')).not.toBeInTheDocument()
    app.unmount()
  })

  it('图1/图2：头部+勁爆秒殺页签行+筛选胶囊+共享瀑布流齐备', () => {
    render(<MfoodGroupBuy onBack={noop} />)
    // 图1：勁爆秒殺 lead 页签 + 倒计时 + 横滑卡价格条 + 更多優惠
    expect(screen.getByText('勁爆秒殺')).toBeInTheDocument()
    expect(screen.getByText('01:41:32')).toBeInTheDocument()
    expect(screen.getByText('更多優惠 ›')).toBeInTheDocument()
    // 图2：双列 Banner + 筛选胶囊
    expect(screen.getByText('「全澳」自助餐')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '附近' })).toBeInTheDocument()
    // 排序胶囊与閃蜂同一真源（GroupBuyFilterBar），默认枚举文案为「智能排序」（原占位「默認排序」已废）
    expect(screen.getByRole('button', { name: '智能排序' })).toBeInTheDocument()
    // 瀑布流：数据与首页「特價團購」同源（MfoodHome.FEED），紫色搶購态 + 秒殺变体混排
    expect(screen.getByText('【連環賞推薦】50元代60元券（新華順）')).toBeInTheDocument()
    expect(screen.getAllByText('搶購 ▸').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/秒殺 ▸/)).toBeInTheDocument()
  })

  it('图3：滚动后吸顶搜索行出现；图标行被吸顶层完全盖住时文字下划线页签行接管（不与图标行同屏）', () => {
    const { container } = render(<MfoodGroupBuy onBack={noop} />)
    expect(container.querySelector('.mpg-sticky-header.is-visible')).toBeNull()

    const body = container.querySelector('.mpg-body') as HTMLElement
    const row = container.querySelector('.mpg-sticky-row') as HTMLElement
    const tabs = container.querySelector('.mpg-roundtabs') as HTMLElement
    expect(body).not.toBeNull()
    // jsdom 无布局：几何全 mock（吸顶搜索行高 44、图标行高 66），钉住「完全盖住才接管」的动态阈值
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    Object.defineProperty(row, 'offsetHeight', { value: 44 })
    Object.defineProperty(tabs, 'offsetHeight', { value: 66 })

    // 图标行尚在视口中部（顶距容器顶 200px > 44px）：文字行不出现，页签只有图标行一份
    vi.spyOn(tabs, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect)
    fireEvent.scroll(body, { target: { scrollTop: 400 } })
    expect(container.querySelector('.mpg-sticky-header.is-visible')).not.toBeNull()
    expect(container.querySelector('.mpg-sticky-tabs')).toBeNull()
    expect(screen.getAllByText('優選').length).toBe(1)

    // 图标行底边（-22+66=44）触及搜索行底边（44）= 图标行被完全盖住：文字下划线行接管
    vi.spyOn(tabs, 'getBoundingClientRect').mockReturnValue({ top: -22 } as DOMRect)
    fireEvent.scroll(body, { target: { scrollTop: 536 } })
    expect(container.querySelector('.mpg-sticky-tabs')).not.toBeNull()
  })

  it('附近好店页签：優選商家同款卡瀑布流（MFOOD 勐爆券标）+ 页签切换回流 + 大小圖跟随说明面板', () => {
    const onTabChange = vi.fn()
    const { rerender } = render(<MfoodGroupBuy onBack={noop} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('button', { name: '附近好店' }))
    expect(onTabChange).toHaveBeenCalledWith('preferred')
    // 優選商家同款卡（MFOOD 品牌）：红包标渲染为「勐爆券」，字段同構
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
    expect(screen.getAllByText('勐爆券')).toHaveLength(4)
    expect(screen.getByText('最高膨脹至$25')).toBeInTheDocument()
    // 说明面板切大圖：附近好店卡同步切大图（4 张卡封面出血）
    rerender(<MfoodGroupBuy onBack={noop} onTabChange={onTabChange} preferredLayout="large" />)
    expect(screen.getAllByAltText('商家封面')).toHaveLength(4)
  })

  it('说明面板联动：syncTab=preferred 切到附近好店瀑布流', () => {
    const { rerender } = render(<MfoodGroupBuy onBack={noop} syncTab="preferred" syncSeq={0} />)
    rerender(<MfoodGroupBuy onBack={noop} syncTab="preferred" syncSeq={1} />)
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
  })

  it('说明面板联动：syncCategory=preferred → 團購根屏切到附近好店', () => {
    const { rerender } = render(<MfoodApp syncCategory="preferred" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="preferred" syncSeq={1} />)
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
  })

  it('壳级回归：MFOOD 已在團購屏时点说明面板 preferred 仍切附近好店（防 syncTab 晚一帧丢命令）', () => {
    const { rerender } = render(<MfoodApp syncCategory="page-group" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="page-group" syncSeq={1} />)
    // 已进團購屏：優選页签团购券流
    expect(screen.getByText('【連環賞推薦】50元代60元券（新華順）')).toBeInTheDocument()
    // 面板切 preferred：seq 与 syncCategory 同帧到达 → 附近好店瀑布流
    rerender(<MfoodApp syncCategory="preferred" syncSeq={2} />)
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
  })

  it('附近好店篩選面板：大小图切换模块仅附近好店页签展示（与閃蜂同规则）', () => {
    render(<MfoodGroupBuy onBack={noop} />)
    // 默认優選页签（团购券流）：更多篩選无大小图模块
    fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
    expect(within(screen.getByRole('group', { name: '更多篩選面板' })).queryByText('列表大小圖切換')).not.toBeInTheDocument()
    // 再点同一篩選按鈕收起（togglePanel 互斥口径）
    fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
    // 切附近好店：模块出现
    fireEvent.click(screen.getByRole('button', { name: '附近好店' }))
    fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
    expect(within(screen.getByRole('group', { name: '更多篩選面板' })).getByText('列表大小圖切換')).toBeInTheDocument()
  })
})
