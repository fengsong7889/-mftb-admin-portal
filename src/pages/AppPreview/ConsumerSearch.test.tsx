/**
 * 用户端统一搜索页 · 交互门禁
 *
 * 数据层的隔离由 consumerSearchData.test.ts 钉住；这里只验证界面把「作用域」表达清楚：
 * 激活页文案与热搜跟着 scope 变、结果 Tab 计数正确、跨域空态能一键转全站、
 * 店内搜索能加购本店商品。避免原型改样式时把入口语义弄丢。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConsumerSearch from './ConsumerSearch'

const noop = () => {}

describe('用户端统一搜索页', () => {
  it('外卖作用域展示外卖专属提示与热搜，不混入全站热搜', () => {
    render(<ConsumerSearch scope="delivery" onBack={noop} />)

    expect(screen.getByPlaceholderText('搜尋外賣商家、商品')).toBeInTheDocument()
    expect(screen.getByText('僅搜尋美食外賣頻道的商家與商品')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /珍珠奶茶/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /紙巾/ })).not.toBeInTheDocument()
  })

  it('全站搜索提交后按频道给出 Tab 计数与商家卡', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    await user.type(screen.getByPlaceholderText('搜尋商家、商品、團購'), '麥當勞{Enter}')

    expect(screen.getByText(/為你找到/)).toBeInTheDocument()
    const deliveryTab = screen.getAllByRole('tab').find((tab) => tab.textContent?.includes('外賣'))
    expect(deliveryTab).toBeDefined()
    expect(deliveryTab?.textContent).toContain('3')
    expect(screen.getAllByText(/麥當勞/).length).toBeGreaterThan(0)
  })

  it('外卖搜不到超市商品时，提供「在全站搜尋」出口', async () => {
    const user = userEvent.setup()
    const onSearchGlobal = vi.fn()
    render(<ConsumerSearch scope="delivery" onBack={noop} onSearchGlobal={onSearchGlobal} />)

    await user.type(screen.getByPlaceholderText('搜尋外賣商家、商品'), '紙巾{Enter}')

    expect(screen.getByText('沒有找到與「紙巾」相關的結果')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '在全站搜尋「紙巾」' }))
    expect(onSearchGlobal).toHaveBeenCalledWith('紙巾')
  })

  it('店内搜索标明本店范围，加购回传的是本店商品', async () => {
    const user = userEvent.setup()
    const onAddToCart = vi.fn()
    render(
      <ConsumerSearch
        scope="store"
        merchantId="d-tai2"
        onBack={noop}
        onAddToCart={onAddToCart}
      />,
    )

    expect(screen.getByText('店內 · 太二酸菜魚（澳門店）')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('搜尋店內商品'), '酸菜魚{Enter}')

    expect(screen.getByRole('button', { name: '酸菜魚' })).toBeInTheDocument()
    // 店名本身含「酸菜魚」，本店 3 个 SKU 都会命中（商品名或商家名）
    const addButtons = screen.getAllByRole('button', { name: /加入購物車：/ })
    expect(addButtons).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: '加入購物車：太二酸菜魚（2人份）' }))
    expect(onAddToCart).toHaveBeenCalledTimes(1)
    expect(onAddToCart.mock.calls[0][0]).toMatchObject({
      id: 'p-tai2-1',
      merchantId: 'd-tai2',
    })
  })

  it('取消搜索回调 onBack，由外层导航栈负责退屏', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ConsumerSearch scope="market" onBack={onBack} />)

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
