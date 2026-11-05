/**
 * 用户端统一搜索页 · 交互门禁
 *
 * 数据层的隔离由 consumerSearchData.test.ts 钉住；这里只验证界面把「作用域」表达清楚：
 * 激活页文案与热搜跟着 scope 变、结果 Tab 计数正确、跨域空态能一键转全站、
 * 店内搜索能加购本店商品。避免原型改样式时把入口语义弄丢。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import ConsumerSearch from './ConsumerSearch'

const noop = () => {}

beforeAll(async () => {
  // 文案已接入 i18n：不固定語言時斷言会命中英文分支
  await i18n.changeLanguage('zh-TW')
})

describe('用户端统一搜索页', () => {
  it('外卖作用域展示外卖专属提示与热搜，不混入全站热搜', () => {
    render(<ConsumerSearch scope="delivery" onBack={noop} />)

    expect(screen.getByPlaceholderText('搜尋外賣商家、商品')).toBeInTheDocument()
    expect(screen.getByText('僅搜尋美食外賣頻道的商家與商品')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /珍珠奶茶/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /紙巾/ })).not.toBeInTheDocument()
  })

  it('全站搜索提交后按频道给出带图胶囊 Tab 与商家卡', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    await user.type(screen.getByPlaceholderText('搜尋商家、商品、團購'), '麥當勞{Enter}')

    expect(screen.getByText(/為你找到/)).toBeInTheDocument()
    const deliveryTab = screen.getAllByRole('tab').find((tab) => tab.textContent?.includes('外賣'))
    expect(deliveryTab).toBeDefined()
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

  it('联想行带频道图标与评分/地址，点击店铺联想直达店铺（需求 1.3.1/1.5/1.8）', async () => {
    const user = userEvent.setup()
    const onOpenStore = vi.fn()
    render(<ConsumerSearch scope="global" onBack={noop} onOpenStore={onOpenStore} />)

    // 联想态用 fireEvent.change 驱动受控输入；关键词避开前面用例的页面级记忆（sessions 跨用例残留）
    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '肯德基' } })

    const merchantSug = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('apcs-sug') && btn.textContent?.includes('肯德基KFC（氹仔店）'))
    // 频道由图标方块的 aria-label 表达；第二行带评分与地址
    expect(merchantSug).toHaveAccessibleName(/外賣/)
    expect(merchantSug?.textContent).toContain('4.4')
    expect(merchantSug?.textContent).toContain('哥英布拉街')
    expect(merchantSug?.textContent).toContain('1.8km')

    await user.click(merchantSug!)
    expect(onOpenStore).toHaveBeenCalledWith('d-kfc')
  })

  it('打烊店铺联想行展示休息中状态', () => {
    render(<ConsumerSearch scope="global" onBack={noop} />)

    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '鮨山' } })

    const restSug = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('apcs-sug') && btn.textContent?.includes('休息中'))
    expect(restSug?.textContent).toContain('鮨山日本料理')
  })

  it('输入词无任何匹配时展示 🔍 搜索行，点击可直接提交搜索（需求 1.6）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: 'zzz' } })

    const searchRow = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('apcs-sug--search'))
    expect(searchRow?.textContent).toContain('搜尋「zzz」')
    expect(searchRow?.textContent).toContain('沒有匹配的店鋪或商品，點擊直接搜尋')

    await user.click(searchRow!)
    expect(screen.getByText('沒有找到與「zzz」相關的結果')).toBeInTheDocument()
  })

  it('超出配送范围的命中置灰并归入独立分组', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    // 先清空会话残留关键词，再输入并提交（点搜索按钮进结果页，需求 1.4）
    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '自助餐' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))

    expect(screen.getByText('超出當前配送範圍')).toBeInTheDocument()
    const farCard = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('apcs-merchant') && btn.textContent?.includes('澳門銀河自助餐'))
    expect(farCard?.className).toContain('is-far')
    expect(farCard?.textContent).toContain('超出範圍')
  })

  it('取消搜索回调 onBack，由外层导航栈负责退屏', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ConsumerSearch scope="market" onBack={onBack} />)

    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
