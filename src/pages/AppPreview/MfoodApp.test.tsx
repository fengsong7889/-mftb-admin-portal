/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD 壳同步命令门禁
 *
 * 回归背景：MFOOD 搜索是独立覆盖层 state（不在根屏状态里），说明面板切「首页/特惠团购页/美食外卖页」
 * 时只切了根屏、覆盖层没关，用户看到 MFOOD「不跟随」（閃蜂搜索在导航栈里会被 nav.reset 连带关闭，故仅閃蜂跟随）。
 * 这里钉住：非搜索类面板命令必须先关搜索覆盖层再切根屏；
 * 美食外賣 / 特惠團購频道搜索框 → 频道内搜索结果瀑布流（MFOOD 门店卡 / 附近好店卡，无分类 Tab），与閃蜂频道内搜索同口径。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import MfoodApp from './MfoodApp'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('MFOOD 壳同步命令', () => {
  it('面板搜索命令使 MFOOD 直达结果页瀑布流（携带关键词，同閃蜂口径）', () => {
    const { rerender } = render(<MfoodApp syncCategory="search-delivery" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="search-delivery" syncSeq={1} />)

    // 无需手动输入：携带关键词「火鍋」直达结果页，外賣瀑布流为 MFOOD 同款门店卡 + 4 分类 Tab
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('恆友魚蛋王（三盞燈總店）')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('tab')).toHaveLength(4)
  })

  it('美食外卖页·搜索结果瀑布流面板：进入外卖频道内搜索（无分类 Tab）', () => {
    const { rerender } = render(<MfoodApp syncCategory="delivery-search" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="delivery-search" syncSeq={1} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('恆友魚蛋王（三盞燈總店）')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0)
  })

  it('特惠团购页·搜索结果瀑布流面板：进入团购频道内搜索（附近好店卡，无分类 Tab）', () => {
    const { rerender } = render(<MfoodApp syncCategory="groupbuy-search" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="groupbuy-search" syncSeq={1} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0)
  })

  it('搜索覆盖层打开后，首页类命令关闭覆盖层并回首页根屏', () => {
    const { rerender } = render(<MfoodApp syncCategory="search-delivery" syncSeq={0} />)

    // 面板三级切到搜索结果·外卖：MFOOD 打开搜索覆盖层
    rerender(<MfoodApp syncCategory="search-delivery" syncSeq={1} />)
    expect(screen.getByPlaceholderText('搜尋商家、商品、團購')).toBeInTheDocument()

    // 面板切回首页·外卖瀑布流：覆盖层必须关闭，落回首页根屏（勁爆秒殺为首页标记）
    rerender(<MfoodApp syncCategory="delivery" syncSeq={2} />)
    expect(screen.queryByPlaceholderText('搜尋商家、商品、團購')).not.toBeInTheDocument()
    expect(screen.getByText('勁爆秒殺')).toBeInTheDocument()
  })

  it('特惠团购页类命令同样关闭搜索覆盖层并进入特惠團購界面', () => {
    const { rerender } = render(<MfoodApp syncCategory="search-group" syncSeq={0} />)

    rerender(<MfoodApp syncCategory="search-group" syncSeq={1} />)
    expect(screen.getByPlaceholderText('搜尋商家、商品、團購')).toBeInTheDocument()

    // 面板切到特惠团购页·推荐/其它：覆盖层关闭并进入特惠團購界面（附近好店页签为其标记）
    rerender(<MfoodApp syncCategory="page-group" syncSeq={2} />)
    expect(screen.queryByPlaceholderText('搜尋商家、商品、團購')).not.toBeInTheDocument()
    expect(screen.getByText('附近好店')).toBeInTheDocument()
  })

  it('美食外卖页命令关闭搜索覆盖层并进入美食外賣频道页', () => {
    const { rerender } = render(<MfoodApp syncCategory="search-delivery" syncSeq={0} />)

    rerender(<MfoodApp syncCategory="search-delivery" syncSeq={1} />)
    expect(screen.getByPlaceholderText('搜尋商家、商品、團購')).toBeInTheDocument()

    rerender(<MfoodApp syncCategory="delivery-page" syncSeq={2} />)
    expect(screen.queryByPlaceholderText('搜尋商家、商品、團購')).not.toBeInTheDocument()
    // 美食外賣频道页标记（Banner 侧卡文案）
    expect(screen.getByText('品牌專場')).toBeInTheDocument()
  })

  it('美食外賣频道搜索框 → 频道内搜索结果瀑布流（MFOOD 门店卡，无分类 Tab）', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MfoodApp syncCategory="delivery-page" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="delivery-page" syncSeq={1} />)

    // 频道页顶部搜索框 → 搜索覆盖层（delivery 作用域）
    await user.click(screen.getByText('搜尋店名或菜品'))
    expect(screen.getByPlaceholderText('搜尋外賣商家、商品')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜尋外賣商家、商品'), { target: { value: '奶茶' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))
    // 结果页 = 首页搜索结果页外卖瀑布流 MFOOD 同款（含超出范围/未入驻样例），且无分类切换 Tab
    // （频道页本体在覆盖层下也渲染同款瀑布流，故查询限定在搜索覆盖层 dialog 内）
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('恆友魚蛋王（三盞燈總店）')).toBeInTheDocument()
    expect(within(dialog).getByText('路環橋記咖啡（路環店）')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0)
  })

  it('特惠團購频道搜索框 → 团购搜索结果瀑布流（附近好店卡，无分类 Tab）', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MfoodApp syncCategory="page-group" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="page-group" syncSeq={1} />)

    // 团购页两个搜索入口（顶部搜索框 + 吸顶搜索行），取第一个
    await user.click(screen.getAllByText('搜尋店名或菜品')[0])
    expect(screen.getByPlaceholderText('搜尋團購套餐、商家')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜尋團購套餐、商家'), { target: { value: '火鍋' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
    expect(screen.queryByText('10:00 營業')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('面板从团购根屏拉回首页时，首页分类随命令初值生效（挂载丢同步回归锁）', () => {
    const { rerender } = render(<MfoodApp syncCategory="page-group" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="page-group" syncSeq={1} />)
    expect(screen.getByText('附近好店')).toBeInTheDocument()

    // 点「首页 · 外卖瀑布流」：根屏回首页并重挂载，分类应落在美食外賣而非默认特價團購
    rerender(<MfoodApp syncCategory="delivery" syncSeq={2} />)
    const activeTab = screen.getAllByRole('button').find((btn) => btn.className.includes('apm-tab') && btn.className.includes('is-on'))
    expect(activeTab?.textContent).toContain('美食外賣')
  })

  it('面板搜索命令把频道内搜索替换为首页搜索（双壳与面板口径对应）', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MfoodApp syncCategory="delivery-page" syncSeq={0} />)
    rerender(<MfoodApp syncCategory="delivery-page" syncSeq={1} />)

    // 先进频道内搜索（无分类 Tab）
    await user.click(screen.getByText('搜尋店名或菜品'))
    expect(screen.getByPlaceholderText('搜尋外賣商家、商品')).toBeInTheDocument()

    // 面板切「首页 · 搜索结果瀑布流」：覆盖层替换为首页搜索（4 分类 Tab 齐备）
    rerender(<MfoodApp syncCategory="search-delivery" syncSeq={2} />)
    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '火鍋' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getAllByRole('tab')).toHaveLength(4)
  })
})
