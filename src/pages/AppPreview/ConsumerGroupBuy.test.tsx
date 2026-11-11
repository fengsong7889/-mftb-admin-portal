/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 用户端特價團購页 · 筛选面板交互门禁
 *
 * 钉住设计稿口径：附近=距离单选 + 三区域右列「全部」+商圈单选、分類=「全部」+单选、排序=单选；
 * 同一时刻只展开一个面板，单选点击即执行筛选并收起，选中结果要回写到胶囊文案。避免后续改样式时把交互语义弄丢。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import ConsumerApp from './ConsumerApp'
import ConsumerGroupBuy from './ConsumerGroupBuy'

const noop = () => {}

function renderPage() {
  return render(<ConsumerGroupBuy onBack={noop} onSearch={noop} />)
}

describe('特價團購筛选面板', () => {
  beforeAll(async () => {
    // 文案已接入 i18n：不固定語言時斷言会命中英文分支
    await i18n.changeLanguage('zh-TW')
  })

  it('附近面板：左列为附近/三个定版区域，附近对应 500m-3km 距离单选', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近商家' }))
    // 区域与商圈必须用全系统定版枚举（recommendConstants.REGION_TREE_DATA），不得自造地名
    expect(screen.getByRole('button', { name: '澳門區域' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '氹仔區域' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '珠海區域' })).toBeInTheDocument()
    expect(screen.getByLabelText('選擇距離 500m')).toBeInTheDocument()
    expect(screen.getByLabelText('選擇距離 3km')).toBeInTheDocument()

    // 距离单选：选中即收起面板，胶囊显示距离档
    await user.click(screen.getByLabelText('選擇距離 1km'))
    expect(screen.queryByLabelText('選擇距離 500m')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1km' })).toBeInTheDocument()
  })

  it('附近面板：区域右列顶部全部+商圈单选，点击即收起并回写', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近商家' }))
    await user.click(screen.getByRole('button', { name: '澳門區域' }))
    expect(screen.getByRole('button', { name: '選擇全部' })).toBeInTheDocument()
    expect(screen.getByLabelText('選擇商圈 黑沙環區')).toBeInTheDocument()

    // 单选：点商圈即执行筛选并收起面板，胶囊回写该商圈
    await user.click(screen.getByLabelText('選擇商圈 黑沙環區'))
    expect(screen.queryByLabelText('選擇商圈 高士德區')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '黑沙環區' })).toBeInTheDocument()
  })

  it('附近面板：区域+全部=筛选整个区域，胶囊回写区域名', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近商家' }))
    await user.click(screen.getByRole('button', { name: '氹仔區域' }))
    await user.click(screen.getByRole('button', { name: '選擇全部' }))
    expect(screen.getByRole('button', { name: '氹仔區域', expanded: false })).toBeInTheDocument()
  })

  it('距离档与商圈互斥：同一个附近胶囊只能承载一种地点口径', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近商家' }))
    await user.click(screen.getByLabelText('選擇距離 2km'))
    expect(screen.getByRole('button', { name: '2km' })).toBeInTheDocument()

    // 改选商圈：距离档作废，胶囊改显商圈（胶囊文案已变，只能按当前文案重新展开）
    await user.click(screen.getByRole('button', { name: '2km' }))
    await user.click(screen.getByRole('button', { name: '澳門區域' }))
    await user.click(screen.getByLabelText('選擇商圈 高士德區'))
    expect(screen.getByRole('button', { name: '高士德區' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2km' })).not.toBeInTheDocument()

    // 改选距离档：商圈作废
    await user.click(screen.getByRole('button', { name: '高士德區' }))
    await user.click(screen.getByRole('button', { name: '附近' }))
    await user.click(screen.getByLabelText('選擇距離 500m'))
    expect(screen.getByRole('button', { name: '500m' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '高士德區' })).not.toBeInTheDocument()
  })

  it('分类面板：顶部全部+分类单选，点击即收起并回写', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '全部分類' }))
    // 页面上方十宮格也有同名分类，必须把断言限定在面板容器内
    const panel = screen.getByRole('group', { name: '分類篩選面板' })
    expect(within(panel).getByRole('button', { name: '全部' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /火鍋燒肉$/ })).toBeInTheDocument()

    // 单选：点分类即收起，胶囊回写该分类（expanded:false 区分页签同名按钮）
    await user.click(within(panel).getByRole('button', { name: /甜品飲品$/ }))
    expect(screen.queryByRole('group', { name: '分類篩選面板' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '甜品飲品', expanded: false })).toBeInTheDocument()

    // 选全部：回写全部分類
    await user.click(screen.getByRole('button', { name: '甜品飲品', expanded: false }))
    const panel2 = screen.getByRole('group', { name: '分類篩選面板' })
    await user.click(within(panel2).getByRole('button', { name: '全部' }))
    expect(screen.getByRole('button', { name: '全部分類', expanded: false })).toBeInTheDocument()
  })

  it('排序面板：五个枚举单选，选中即收起并回写胶囊', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '智能排序' }))
    expect(screen.getByLabelText('排序方式 距離優先')).toBeInTheDocument()
    expect(screen.getByLabelText('排序方式 高價優先')).toBeInTheDocument()

    await user.click(screen.getByLabelText('排序方式 低價優先'))
    expect(screen.queryByLabelText('排序方式 距離優先')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '低價優先' })).toBeInTheDocument()
  })

  it('更多篩選面板：五大模块齐备，单选/多选/重置/完成口径', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '篩選條件' }))
    const panel = screen.getByRole('group', { name: '更多篩選面板' })
    // 五模块（设计稿图2-5）：人均篩選器/營業時間/使用人數/偏好优惠/店鋪服務
    expect(within(panel).getByText('人均篩選器')).toBeInTheDocument()
    // 列表大小圖切換仅優選商家页签的篩選面板展示：团购券类页签（推薦）不展示
    expect(within(panel).queryByText('列表大小圖切換')).not.toBeInTheDocument()
    expect(within(panel).getByText('營業時間')).toBeInTheDocument()
    expect(within(panel).getByText('使用人數')).toBeInTheDocument()
    expect(within(panel).getByText(/偏好优惠/)).toBeInTheDocument()
    expect(within(panel).getByText(/店鋪服務/)).toBeInTheDocument()

    // 单选胶囊：再点同一个取消
    await user.click(within(panel).getByRole('button', { name: '0-5 時' }))
    expect(within(panel).getByRole('button', { name: '0-5 時' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(panel).getByRole('button', { name: '0-5 時' }))
    expect(within(panel).getByRole('button', { name: '0-5 時' })).toHaveAttribute('aria-pressed', 'false')

    // 多选胶囊：可勾可消
    await user.click(within(panel).getByRole('button', { name: '有 WIFI' }))
    await user.click(within(panel).getByRole('button', { name: '可包場' }))
    expect(within(panel).getByRole('button', { name: '可包場' })).toHaveAttribute('aria-pressed', 'true')

    // 重置：清空全部模块，面板保持展开
    await user.click(within(panel).getByRole('button', { name: '重置' }))
    expect(within(panel).getByRole('button', { name: '有 WIFI' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(panel).getByRole('button', { name: '可包場' })).toHaveAttribute('aria-pressed', 'false')

    // 完成：收起面板
    await user.click(within(panel).getByRole('button', { name: '完成 (可多選)' }))
    expect(screen.queryByRole('group', { name: '更多篩選面板' })).not.toBeInTheDocument()
  })

  it('優選商家页签：点击切换商家瀑布流（图2口径），切回推薦恢复团购瀑布流', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '優選商家' }))
    expect(screen.getByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).toBeInTheDocument()
    expect(screen.getByText('最高膨脹至$6')).toBeInTheDocument()
    expect(screen.getAllByText('代金券名稱代代金券名稱…').length).toBeGreaterThanOrEqual(3)

    // 收藏钮：麥田初始橙星（取消收藏），点击后全列表无收藏态
    await user.click(screen.getByRole('button', { name: '取消收藏' }))
    expect(screen.queryByRole('button', { name: '取消收藏' })).not.toBeInTheDocument()

    // 切回推薦：商家瀑布流卸载，团购瀑布流恢复
    await user.click(screen.getByRole('button', { name: '推薦' }))
    expect(screen.queryByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).not.toBeInTheDocument()
    expect(screen.getByText('雞蛋10只（散裝）')).toBeInTheDocument()
  })

  it('優選商家篩選面板：列表大小圖切換模块单选（图2口径）', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '優選商家' }))
    await user.click(screen.getByRole('button', { name: '篩選條件' }))
    const panel = screen.getByRole('group', { name: '更多篩選面板' })
    expect(within(panel).getByText('列表大小圖切換')).toBeInTheDocument()

    // 默认大圖模式选中；点小圖切换单选态
    const large = within(panel).getByRole('button', { name: '大圖模式' })
    const small = within(panel).getByRole('button', { name: '小圖模式' })
    expect(large).toHaveAttribute('aria-pressed', 'true')
    expect(small).toHaveAttribute('aria-pressed', 'false')
    await user.click(small)
    expect(small).toHaveAttribute('aria-pressed', 'true')
    expect(large).toHaveAttribute('aria-pressed', 'false')

    // 完成：收起面板；小圖模式 → 優選商家瀑布流为当前小图卡（无封面）
    await user.click(within(panel).getByRole('button', { name: '完成 (可多選)' }))
    expect(screen.queryAllByAltText('商家封面')).toHaveLength(0)

    // 重开面板切回大圖：瀑布流切换为带封面的大图卡（5 张全带封面，收藏钮移至封面右上）
    await user.click(screen.getByRole('button', { name: '篩選條件' }))
    const panel2 = screen.getByRole('group', { name: '更多篩選面板' })
    await user.click(within(panel2).getByRole('button', { name: '大圖模式' }))
    await user.click(within(panel2).getByRole('button', { name: '完成 (可多選)' }))
    expect(screen.getAllByAltText('商家封面')).toHaveLength(5)
  })

  it('優選商家篩選面板：大小圖切换上报 onPreferredLayoutChange（说明面板闭环双机同步）', async () => {
    const user = userEvent.setup()
    const onPreferredLayoutChange = vi.fn()
    render(<ConsumerGroupBuy onBack={noop} onSearch={noop} onPreferredLayoutChange={onPreferredLayoutChange} />)
    await user.click(screen.getByRole('button', { name: '優選商家' }))
    await user.click(screen.getByRole('button', { name: '篩選條件' }))
    await user.click(within(screen.getByRole('group', { name: '更多篩選面板' })).getByRole('button', { name: '小圖模式' }))
    expect(onPreferredLayoutChange).toHaveBeenLastCalledWith('small')
  })

  it('说明面板联动：syncTab 命令切到優選商家，页签切换回流 onTabChange', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    const { rerender } = render(
      <ConsumerGroupBuy onBack={noop} onSearch={noop} onTabChange={onTabChange} syncTab="preferred" syncSeq={0} />,
    )
    // syncSeq 自增 = 壳外说明面板下发命令 → 切到優選商家瀑布流
    rerender(
      <ConsumerGroupBuy onBack={noop} onSearch={noop} onTabChange={onTabChange} syncTab="preferred" syncSeq={1} />,
    )
    expect(screen.getByText('翡翠茶餐廳🏆-關閘店（🔥全澳…')).toBeInTheDocument()

    // 壳内点页签回流：推薦 → page-group（壳外「特惠团购页·推荐」面板）
    await user.click(screen.getByRole('button', { name: '推薦' }))
    expect(onTabChange).toHaveBeenLastCalledWith('page-group')
  })

  it('壳级联动：syncCategory=preferred → 進入特惠團購屏并切到優選商家（雙機同步口径）', () => {
    const { rerender } = render(<ConsumerApp syncCategory="preferred" syncSeq={0} />)
    rerender(<ConsumerApp syncCategory="preferred" syncSeq={1} />)
    // 優選商家大圖模式（默认）5 张卡出现 = 團購屏已打开且页签已切到優選商家
    expect(screen.getAllByAltText('商家封面')).toHaveLength(5)
    expect(screen.getAllByText('神會員')).toHaveLength(5)
  })

  it('面板互斥：展开一个即收起另一个，重复点同一按钮收起', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近商家' }))
    await user.click(screen.getByRole('button', { name: '全部分類' }))
    expect(screen.queryByLabelText(/^選擇距離/)).not.toBeInTheDocument()
    const panel = screen.getByRole('group', { name: '分類篩選面板' })
    expect(within(panel).getByRole('button', { name: /火鍋燒肉$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部分類' }))
    expect(screen.queryByRole('group', { name: '分類篩選面板' })).not.toBeInTheDocument()
  })
})
