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

  it('全站搜索提交后进入瀑布流结果页：5 分类可横滑，默认外賣 Tab（需求 3.1/3.3）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    await user.type(screen.getByPlaceholderText('搜尋商家、商品、團購'), '麥當勞{Enter}')

    // 5 个分类 Tab 齐备（全部/外賣/團購/超市/百貨；百貨被裁切靠横滑露出，由 CSS overflow-x 保证）
    expect(screen.getByRole('tab', { name: /全部/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /百貨/ })).toBeInTheDocument()
    // 默认落「外賣」并直接展示首页同款外卖瀑布流（小图模式门店卡）
    expect(screen.getByRole('tab', { name: /外賣/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('毛氏海鮮火鍋飯店（湘粵融合菜）')).toBeInTheDocument()
    // 人氣商家廣告門店僅首頁展示，搜索結果頁不含（需求：去掉最後幾個廣告門店）
    expect(screen.queryByText('朱記燒臘飯店（氹仔店）')).not.toBeInTheDocument()
    expect(screen.queryByText(/上海生煎王/)).not.toBeInTheDocument()
    // 超出配送範圍 / 未入駐商家展示態：燒鵝 LOGO 蒙阴影+「超出範圍」膠囊；小貝（未入駐）評分「暫無」且 LOGO 不加標識
    expect(screen.getByText('燒鵝仔餐廳（路環店）')).toBeInTheDocument()
    expect(screen.getByText('小貝廚房（關閘店）')).toBeInTheDocument()
    expect(screen.getAllByText('超出範圍')).toHaveLength(1)
    expect(screen.getByText(/暫無/)).toBeInTheDocument()
    // 全站不再走「綜合列表」版式：摘要与商家卡不出现
    expect(screen.queryByText(/為你找到/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /麥當勞（威尼斯人店）/ })).not.toBeInTheDocument()
  })

  it('全站结果页切换分类：團購复用首页团购瀑布流，其余分类提示還未實現（需求 3.2/3.4）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="global" onBack={noop} />)

    // 用 change 覆写输入，避开前面用例页面级记忆（sessions 跨用例残留）里的关键词
    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '火鍋' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await user.click(screen.getByRole('tab', { name: /團購/ }))
    // 团购瀑布流 = 特惠團購页「優選商家」小图瀑布流（数据同源 consumerPreferredFeed）
    expect(screen.getByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).toBeInTheDocument()
    // 搜索专属展示样例：超出范围（LOGO 阴影+胶囊）/ 未入驻（♥暫無）/ 开业时间横条
    expect(screen.getByText('海灣火鍋城（路環店）')).toBeInTheDocument()
    expect(screen.getAllByText('超出範圍')).toHaveLength(1)
    expect(screen.getByText('小貝廚房（關閘店）')).toBeInTheDocument()
    expect(screen.getByText(/暫無/)).toBeInTheDocument()
    expect(screen.getByText('10:00 營業')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /超市/ }))
    expect(screen.getByText('「超市」瀑布流還未實現')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /全部/ }))
    expect(screen.getByText('「全部」瀑布流還未實現')).toBeInTheDocument()

    // 切回外賣恢复正常瀑布流
    await user.click(screen.getByRole('tab', { name: /外賣/ }))
    expect(screen.getByText('毛氏海鮮火鍋飯店（湘粵融合菜）')).toBeInTheDocument()
  })

  it('外卖频道搜索结果=首页搜索结果页外卖瀑布流，且无分类切换 Tab（频道内搜索口径）', async () => {
    const user = userEvent.setup()
    const onSearchGlobal = vi.fn()
    render(<ConsumerSearch scope="delivery" onBack={noop} onSearchGlobal={onSearchGlobal} />)

    await user.type(screen.getByPlaceholderText('搜尋外賣商家、商品'), '紙巾{Enter}')

    // 瀑布流与首页搜索结果页同款（含超出范围/未入驻样例）；频道内搜索不展示分类 Tab，也不再有跨域空态出口
    expect(screen.getByText('毛氏海鮮火鍋飯店（湘粵融合菜）')).toBeInTheDocument()
    expect(screen.getByText('燒鵝仔餐廳（路環店）')).toBeInTheDocument()
    expect(screen.getByText('小貝廚房（關閘店）')).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /在全站搜尋/ })).not.toBeInTheDocument()
    expect(onSearchGlobal).not.toHaveBeenCalled()
  })

  it('团购频道搜索结果=首页搜索结果页团购瀑布流（優選商家卡），同样无分类 Tab', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="groupbuy" onBack={noop} />)

    await user.type(screen.getByPlaceholderText('搜尋團購套餐、商家'), '火鍋{Enter}')

    expect(screen.getByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).toBeInTheDocument()
    expect(screen.getByText('10:00 營業')).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('超市频道保留列表版式：分类 Tab/摘要与商品卡（含关键词高亮）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="market" onBack={noop} />)

    await user.type(screen.getByPlaceholderText('搜尋超市商品、商家'), '紙巾{Enter}')

    expect(screen.getAllByText(/紙巾/).length).toBeGreaterThan(0)
    expect(screen.getByText(/為你找到/)).toBeInTheDocument()
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0)
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
    // 全站结果页已改为瀑布流版式：无匹配也落默认外賣瀑布流（关键词过滤待接搜索接口后补）
    expect(screen.getByRole('tab', { name: /外賣/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('毛氏海鮮火鍋飯店（湘粵融合菜）')).toBeInTheDocument()
    expect(screen.queryByText(/沒有找到與/)).not.toBeInTheDocument()
  })

  it('超出配送范围的命中置灰并归入独立分组（超市频道列表版式回归锁）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch scope="market" onBack={noop} />)

    fireEvent.change(screen.getByPlaceholderText('搜尋超市商品、商家'), { target: { value: '遠倉' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))

    expect(screen.getByText('超出當前配送範圍')).toBeInTheDocument()
    const farCard = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('apcs-merchant') && btn.textContent?.includes('橫琴遠倉超市'))
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

  it('MFOOD 品牌搜索结果页：外卖=勁爆券皮门店卡、团购=附近好店卡（閃蜂同理复刻）', async () => {
    const user = userEvent.setup()
    render(<ConsumerSearch brand="mfood" scope="global" onBack={noop} />)

    fireEvent.change(screen.getByPlaceholderText('搜尋商家、商品、團購'), { target: { value: '奶茶' } })
    await user.click(screen.getByRole('button', { name: '搜索' }))

    // 默认外賣瀑布流 = MFOOD 门店卡（基础门店，不含人气商家广告）+ 超出范围/未入驻样例
    expect(screen.getByText('恆友魚蛋王（三盞燈總店）')).toBeInTheDocument()
    expect(screen.queryByText(/洪馨椰子雪糕/)).not.toBeInTheDocument()
    expect(screen.getByText('路環橋記咖啡（路環店）')).toBeInTheDocument()
    expect(screen.getAllByText('超出範圍')).toHaveLength(1)
    expect(screen.getByText(/暫無/)).toBeInTheDocument()

    // 團購瀑布流 = 附近好店（勐爆券标）+ 超出范围/未入驻/开业时间三样例
    await user.click(screen.getByRole('tab', { name: /團購/ }))
    expect(screen.getByText('澳門燒味工房🔥-新橋店')).toBeInTheDocument()
    expect(screen.getAllByText('勐爆券').length).toBeGreaterThan(0)
    expect(screen.getByText('10:00 營業')).toBeInTheDocument()
  })
})
