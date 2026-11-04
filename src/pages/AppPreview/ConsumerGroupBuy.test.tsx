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
 * 钉住设计稿三张图的口径：附近=距离单选 + 三区域商圈多选、分類=多选、排序=单选；
 * 同一时刻只展开一个面板，选中结果要回写到胶囊文案。避免后续改样式时把交互语义弄丢。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
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

    await user.click(screen.getByRole('button', { name: '附近' }))
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

  it('附近面板：区域商圈可多选，胶囊回写首个商圈与数量', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近' }))
    await user.click(screen.getByRole('button', { name: '澳門區域' }))
    expect(screen.getByLabelText('選擇商圈 黑沙環區')).toBeInTheDocument()

    await user.click(screen.getByLabelText('選擇商圈 黑沙環區'))
    await user.click(screen.getByLabelText('選擇商圈 高士德區'))
    // 多选面板保持展开，由 × 收起
    expect(screen.getByLabelText('選擇商圈 新馬路區')).toBeInTheDocument()
    await user.click(screen.getByLabelText('收起篩選面板'))

    const chip = screen.getByRole('button', { name: '黑沙環區+1' })
    expect(chip).toBeInTheDocument()
  })

  it('距离档与商圈互斥：同一个附近胶囊只能承载一种地点口径', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近' }))
    await user.click(screen.getByLabelText('選擇距離 2km'))
    expect(screen.getByRole('button', { name: '2km' })).toBeInTheDocument()

    // 改选商圈：距离档作废，胶囊改显商圈（胶囊文案已变，只能按当前文案重新展开）
    await user.click(screen.getByRole('button', { name: '2km' }))
    await user.click(screen.getByRole('button', { name: '澳門區域' }))
    await user.click(screen.getByLabelText('選擇商圈 高士德區'))
    await user.click(screen.getByLabelText('收起篩選面板'))
    expect(screen.getByRole('button', { name: '高士德區' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2km' })).not.toBeInTheDocument()

    // 改选距离档：商圈作废
    await user.click(screen.getByRole('button', { name: '高士德區' }))
    await user.click(screen.getByRole('button', { name: '附近' }))
    await user.click(screen.getByLabelText('選擇距離 500m'))
    expect(screen.getByRole('button', { name: '500m' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '高士德區' })).not.toBeInTheDocument()
  })

  it('分类面板：十个分类可多选，胶囊回写首个分类与数量', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '全部分類' }))
    // 页面上方十宮格也有同名分类，必须把断言限定在面板容器内
    const panel = screen.getByRole('group', { name: '分類篩選面板' })
    expect(within(panel).getByRole('button', { name: /火鍋燒肉$/ })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /美容美髮$/ })).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: /甜品飲品$/ }))
    await user.click(within(panel).getByRole('button', { name: /自助餐$/ }))
    expect(within(panel).getByRole('button', { name: /甜品飲品$/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByLabelText('收起篩選面板'))

    expect(screen.getByRole('button', { name: '甜品飲品+1' })).toBeInTheDocument()
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

  it('面板互斥：展开一个即收起另一个，重复点同一按钮收起', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '附近' }))
    await user.click(screen.getByRole('button', { name: '全部分類' }))
    expect(screen.queryByLabelText(/^選擇距離/)).not.toBeInTheDocument()
    const panel = screen.getByRole('group', { name: '分類篩選面板' })
    expect(within(panel).getByRole('button', { name: /火鍋燒肉$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部分類' }))
    expect(screen.queryByRole('group', { name: '分類篩選面板' })).not.toBeInTheDocument()
  })
})
