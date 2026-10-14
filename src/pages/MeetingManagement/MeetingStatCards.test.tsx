/**
 * 统计卡片回归用例（§B.7 数据指标卡标准）。
 *
 * <p>为什么要钉住 loading：浏览器实测发现进页面首屏先报「0 間會議室」，
 * 而下方矩阵已经列出 4 间——用户第一反应是"筛选坏了"。
 * 计数动画从 0 起步本身没错，错在把"还没取到数"渲染成了"取到的数是 0"。
 * 现在加载中显示占位符「—」，取到数才走计数动画。
 */
import { act, render, screen } from '@testing-library/react'
import { HomeOutlined } from '@ant-design/icons'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingStatCards, { type StatItem } from './MeetingStatCards'

const ITEMS: StatItem[] = [
  { icon: <HomeOutlined />, color: '#1890FF', bg: '#E6F7FF', value: 12, label: '會議室總數' },
  { icon: <HomeOutlined />, color: '#52C41A', bg: '#F6FFED', value: 3, label: '使用中' },
]

describe('會議域統計卡片', () => {
  // useCountUp 靠 requestAnimationFrame 推进，jsdom 不会自己走时钟：
  // 用假定时器把 1200ms 动画一次性拨完，断言终值而不是某个中间帧
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  it('加载中显示占位符而不是 0', () => {
    const { container } = render(<MeetingStatCards items={ITEMS} loading />)
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toContain('12')
    expect(container.textContent).not.toContain('0')
  })

  it('取到数后走计数动画并停在真实数值', async () => {
    const { container } = render(<MeetingStatCards items={ITEMS} />)
    // 假时钟下不等 waitFor（它自己也依赖定时器），拨完动画时间后直接断言终值
    act(() => { vi.advanceTimersByTime(1500) })
    expect(container.textContent).toContain('會議室總數')
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('非计数字段可以直接传 ReactNode 原样展示', () => {
    render(<MeetingStatCards items={[{ ...ITEMS[0], value: '—', label: '待定' }]} />)
    expect(screen.getByText('待定')).toBeInTheDocument()
  })
})
