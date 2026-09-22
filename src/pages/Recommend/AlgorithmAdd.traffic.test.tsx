import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AlgorithmAdd from './AlgorithmAdd'
import { readTrafficParams } from './TrafficAlgorithmConfig/config'
import { AlgorithmType } from './constants'

const api = vi.hoisted(() => ({ fetch: vi.fn(), create: vi.fn(), update: vi.fn(), t: (key: string) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: api.t }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(), message: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/adPromotion')>(),
  fetchAdAlgorithmDetail: api.fetch, createAdAlgorithm: api.create, updateAdAlgorithm: api.update,
}))
vi.mock('./OrganicTrafficScoreConfig', () => ({ default: () => null }))
vi.mock('../../components/PopularLayoutPreviewModal', () => ({ default: () => null }))
vi.mock('../../components/DetailPageHeader', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }))

function LocationIndicator() {
  const location = useLocation()
  return <output aria-label="当前路由">{location.pathname}</output>
}
function mountPage(query: string) {
  return render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/promotion-algorithm-add?${query}`]}>
      <AlgorithmAdd /><LocationIndicator />
    </MemoryRouter>
  </ConfigProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({
    id: 7, algoCode: 'SFLL0007', algoName: '实际父页面投流', algoType: 15, brand: 'flashBee',
    params: JSON.stringify({ ...readTrafficParams({}), consistencyCheckInterval: 15, statusRest: true }),
  })
  api.create.mockResolvedValue({ id: 8 })
  api.update.mockResolvedValue({ id: 7 })
})

describe('算法库统一表单样式', () => {
  const statusTypes = [AlgorithmType.INVINCIBLE_STAR, AlgorithmType.NEW_STORE_AD, AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.EXCLUSIVE_MERCHANT, AlgorithmType.GUESS_YOU_LIKE, AlgorithmType.BRAND_MERCHANT]
  const cases = statusTypes.flatMap(type => ['add', 'edit', 'detail'].map(mode => ({ type, mode })))

  it.each(cases)('类型 $type 的 $mode 模式使用同一商家状态组件', async ({ type, mode }) => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '统一样式', algoType: type, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11, statusOpen: true, statusRest: true, statusOverwhelmed: false, statusClosed: false }),
    })
    const { container } = mountPage(`type=${type}${mode !== 'add' ? '&id=7' : ''}${mode === 'detail' ? '&mode=detail' : ''}`)
    if (mode !== 'add') await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('统一样式'))
    const group = within(screen.getByTestId('algorithm-merchant-status'))
    expect(group.getAllByRole('switch')).toHaveLength(4)
    expect(group.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(group.getByRole('switch', { name: 'recommend.statusOpen' })).toBeDisabled()
    expect(group.getByRole('switch', { name: 'recommend.statusOpen' })).toBeChecked()
    const rest = group.getByRole('switch', { name: 'recommend.statusRest' })
    expect(rest).toHaveAttribute('aria-checked', mode === 'add' ? 'false' : 'true')
    if (mode === 'detail') {
      group.getAllByRole('switch').forEach(control => expect(control).toBeDisabled())
      expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
      expect(container.querySelector('.algorithm-form__footer')).toHaveTextContent('最后更新人')
    } else expect(rest).not.toBeDisabled()
    expect(container.querySelectorAll('.algorithm-section').length).toBeGreaterThanOrEqual(3)
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    // 消耗残留的 mockResolvedValueOnce，防止泄漏到下一个测试
    await api.fetch().catch(() => {})
  })

  it('商家状态改为开关后仍按原字段和布尔值提交', async () => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '状态测试', algoType: 1, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11, statusRest: false }),
    })
    mountPage('type=1&id=7')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('状态测试'))
    fireEvent.click(screen.getByRole('switch', { name: 'recommend.statusRest' }))
    fireEvent.click(screen.getByRole('button', { name: /common:save/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    expect(api.update.mock.calls[0][1].params).toMatchObject({ statusOpen: true, statusRest: true, statusOverwhelmed: false, statusClosed: false, consistencyCheckInterval: 11 })
  })

  it('金字招牌详情可切换标签查看，字段仍只读', async () => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '招牌详情', algoType: AlgorithmType.GOLDEN_SIGNBOARD, brand: 'flashBee', params: '{}' })
    mountPage(`type=${AlgorithmType.GOLDEN_SIGNBOARD}&id=7&mode=detail`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('招牌详情'))
    const favorites = screen.getByRole('button', { name: /收藏/ })
    fireEvent.click(favorites)
    expect(favorites).toHaveAttribute('aria-pressed', 'true')
    screen.queryAllByRole('spinbutton').forEach(control => expect(control).toBeDisabled())
    expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it.each([AlgorithmType.POPULAR_MERCHANT_KA, AlgorithmType.GOLDEN_SIGNBOARD, AlgorithmType.GOLD_AD, AlgorithmType.PRODUCT_PROMO])('类型 %s 保留原参数边界，不新增商家状态', type => {
    const { container } = mountPage(`type=${type}`)
    expect(container.querySelector('.algorithm-section')).toBeInTheDocument()
    expect(screen.queryByTestId('algorithm-merchant-status')).not.toBeInTheDocument()
  })
})

describe('算法库父页面投流接入', () => {
  it('编辑只加载一次，使用投流保存分支并带上曾漏存的字段', async () => {
    mountPage('type=15&id=7')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('实际父页面投流'))
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(screen.getAllByLabelText('投流配置概览')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /common:save/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    expect(api.update.mock.calls[0]).toEqual([7, expect.objectContaining({
      algoName: '实际父页面投流', algoType: 15, brand: 'flashBee',
      params: expect.objectContaining({ statusRest: true, consistencyCheckInterval: 15, merchantExposureStrategy: 'trafficProportional' }),
    })])
    await waitFor(() => expect(screen.getByLabelText('当前路由').textContent).toBe('/promotion-algorithm'))
  })

  it('真实父页面加载失败时显示重试且保存被禁用', async () => {
    api.fetch.mockRejectedValueOnce(new Error('不可用'))
    mountPage('type=15&id=7')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('已禁止保存'))
    expect(screen.getByRole('button', { name: /common:save/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('实际父页面投流'))
    expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('非投流算法继续走原有加载与界面，不初始化投流配置', async () => {
    api.fetch.mockResolvedValueOnce({
      id: 1, algoCode: 'SFX0001', algoName: '原有无敌星星', algoType: 1, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11 }),
    })
    await act(async () => { mountPage('type=1&id=1') })
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('投流配置概览')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('原有无敌星星')
    expect(api.update).not.toHaveBeenCalled()
  })
})
