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
import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: '默認排序' })).toBeInTheDocument()
    // 瀑布流：数据与首页「特價團購」同源（MfoodHome.FEED），紫色搶購态 + 秒殺变体混排
    expect(screen.getByText('【連環賞推薦】50元代60元券（新華順）')).toBeInTheDocument()
    expect(screen.getAllByText('搶購 ▸').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/秒殺 ▸/)).toBeInTheDocument()
  })

  it('图3：滚动后吸顶搜索行与文字下划线页签行出现', () => {
    const { container } = render(<MfoodGroupBuy onBack={noop} />)
    expect(container.querySelector('.mpg-sticky-header.is-visible')).toBeNull()

    const body = container.querySelector('.mpg-body')
    expect(body).not.toBeNull()
    fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 400 } })
    expect(container.querySelector('.mpg-sticky-header.is-visible')).not.toBeNull()
    // 吸顶文字页签行与圆形页签行同数据双份渲染（優選为激活态）
    expect(screen.getAllByText('優選').length).toBe(2)
    expect(screen.getAllByText('連環賞推薦').length).toBe(2)
  })
})
