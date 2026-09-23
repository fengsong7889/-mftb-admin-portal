import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { createDefaultCouponIntensityConfig, validateCouponIntensityConfig } from './organicTrafficConfig'

const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), create: vi.fn(), toggle: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/organicScore', () => ({
  fetchOrganicScoreConfig: api.fetch, updateOrganicRule: api.update,
  createOrganicRule: api.create, toggleOrganicRuleStatus: api.toggle, deleteOrganicRule: api.remove,
  updateDimensionWeights: vi.fn(),
}))
vi.mock('@/api/systemConfig', () => ({ getSystemConfig: vi.fn().mockResolvedValue(null), updateSystemConfig: vi.fn() }))
vi.mock('@/api/store', () => ({ fetchStores: vi.fn().mockResolvedValue({ records: [] }) }))
vi.mock('@/api/adPromotion', () => ({ fetchAdAlgorithms: vi.fn().mockResolvedValue({ records: [] }), fetchAdAlgorithmByCode: vi.fn() }))
vi.mock('@/hooks/useSystemRules', () => ({ getSystemRuleValue: () => false }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

function LocationIndicator() {
  const location = useLocation()
  return <output aria-label="当前位置">{location.pathname + location.search}</output>
}

async function mount(readOnly = false) {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/promotion-algorithm-add?type=7&id=123']}>
        <Form disabled={readOnly}><OrganicTrafficScoreConfig readOnly={readOnly} /></Form>
        <LocationIndicator />
      </MemoryRouter>
    </ConfigProvider>)
  })
}

// 分组定位后验证结构、值和交互，按钮查询跳过 jsdom 昂贵的 CSS 可见性遍历。
function openRule(id = 'COM_03', name = '進店領券') {
  fireEvent.click(screen.getByText(id))
  return within(screen.getByLabelText(`${name}優惠配置`))
}
function changeNumber(label: string, value: number) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } })
}
function openPreview(panel: ReturnType<typeof within>) {
  fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
  return within(screen.getByRole('dialog'))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('优惠配置原位编辑', () => {
  it('旧后端模式仍可展示新原型，编辑保存不跳路由、不写后端，折叠不丢草稿', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 3, ruleCode: 'COM_03', dimension: 1,
      name: '進店領券', description: '原有规则', mode: 4, score: 9, status: 1, builtin: 1 }] })
    await mount()
    let panel = openRule()
    expect(panel.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(panel.queryByRole('button', { hidden: true, name: '配置力度' })).not.toBeInTheDocument()
    expect(panel.queryByText('基準客單價 B（元）')).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('報名分值', 25)
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('報名分：+25 分')).toBeInTheDocument()
    expect(panel.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(message.info).toHaveBeenCalledWith(expect.stringContaining('當前頁面草稿'))
    fireEvent.click(screen.getByText('COM_03'))
    panel = openRule()
    expect(panel.getByText('報名分：+25 分')).toBeInTheDocument()
    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/promotion-algorithm-add?type=7&id=123')
    expect(api.update).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
  }, 60000) // 首次真实 Ant Design 渲染包含样式初始化，单独放宽冷启动时限。

  it('取消恢复原值，各活动草稿互不影响，折叠后保留正在编辑的值', async () => {
    await mount()
    const first = openRule()
    fireEvent.click(first.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('報名分值', 25)
    fireEvent.click(first.getByRole('button', { hidden: true, name: /保\s*存/ }))
    fireEvent.click(first.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('報名分值', 99)
    fireEvent.click(first.getByRole('button', { hidden: true, name: /取\s*消/ }))
    expect(first.getByText('報名分：+25 分')).toBeInTheDocument()
    let second = openRule('COM_04', '新客立減')
    expect(second.getByText('報名分：+10 分')).toBeInTheDocument()
    fireEvent.click(second.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('報名分值', 40)
    fireEvent.click(screen.getByText('COM_04'))
    second = openRule('COM_04', '新客立減')
    expect(second.getByRole('spinbutton', { hidden: true, name: '報名分值' })).toHaveValue('40')
    fireEvent.click(second.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(second.getByText('報名分：+40 分')).toBeInTheDocument()
    expect(first.getByText('報名分：+25 分')).toBeInTheDocument()
  }, 60000) // 多轮编辑/折叠交互，冷启动下放宽时限。

  it('非法区间阻止保存和试算，取消仍可退出编辑', async () => {
    await mount()
    const panel = openRule()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('第 1 檔優惠比例上界', 6)
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByRole('spinbutton', { hidden: true, name: '第 1 檔優惠比例上界' })).toHaveValue('6')
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(message.warning).toHaveBeenCalled()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /取\s*消/ }))
    expect(panel.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('添加比例档自动拆分末档，删除合并区间，保持合法配置', async () => {
    await mount()
    const panel = openRule()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '添加比例檔位' }))
    expect(panel.getByRole('spinbutton', { hidden: true, name: '第 6 檔優惠比例上界' })).toHaveValue('75')
    expect(panel.getByRole('spinbutton', { hidden: true, name: '第 7 檔優惠比例下界' })).toHaveValue('75')
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '刪除優惠比例第 7 檔' }))
    expect(panel.getByRole('spinbutton', { hidden: true, name: '第 6 檔優惠比例上界' })).toHaveValue('100')
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(message.warning).not.toHaveBeenCalled()
  })
})

describe('试算抽屉', () => {
  it('使用编辑草稿，试算输入不改配置，关闭保留编辑并可保存后再次试算', async () => {
    await mount()
    const panel = openRule()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    changeNumber('報名分值', 25)
    let drawer = openPreview(panel)
    expect(drawer.getByText('未保存配置試算')).toBeInTheDocument()
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('125 分')
    expect(drawer.queryByRole('button', { hidden: true, name: /保\s*存/ })).not.toBeInTheDocument()
    changeNumber('券面金額', 3)
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('25 分')
    fireEvent.click(drawer.getByRole('button', { hidden: true, name: '重置試算' }))
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('125 分')
    fireEvent.click(drawer.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(panel.getByRole('spinbutton', { hidden: true, name: '報名分值' })).toHaveValue('25')
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /保\s*存/ }))
    drawer = openPreview(panel)
    expect(drawer.getByText('當前頁面草稿試算')).toBeInTheDocument()
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('125 分')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('父表单为只读时仍可操作试算，但没有配置编辑或保存入口', async () => {
    await mount(true)
    const panel = openRule()
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    const drawer = openPreview(panel)
    expect(drawer.getByRole('spinbutton', { hidden: true, name: '基準客單價 B' })).not.toBeDisabled()
    changeNumber('基準客單價 B', 0)
    expect(drawer.getByText(/缺少可信基準客單價/)).toBeInTheDocument()
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('10 分')
    expect(drawer.queryByRole('button', { hidden: true, name: /保\s*存/ })).not.toBeInTheDocument()
  })

  it('六个典型案例与百分比边界命中正确，超高门槛不获得力度分', async () => {
    await mount()
    const drawer = openPreview(openRule())
    const cases = [
      ['早餐店滿 10 減 3', 80], ['早餐店無門檻減 3', 80], ['正常餐廳滿 100 減 60', 110],
      ['早餐店超高門檻券', 10], ['高客單餐廳（基準 6000）', 110], ['高客單餐廳（基準 5000）', 90],
    ] as const
    for (const [name, total] of cases) {
      fireEvent.click(drawer.getByRole('button', { name }))
      expect(drawer.getByLabelText('單項總得分')).toHaveTextContent(`${total} 分`)
    }
    fireEvent.click(drawer.getByRole('button', { hidden: true, name: '重置試算' }))
    for (const [amount, total] of [[0, 10], [4.99, 10], [5, 20], [10, 40], [20, 60], [30, 80], [50, 110], [100, 110]]) {
      changeNumber('券面金額', amount)
      expect(drawer.getByLabelText('單項總得分')).toHaveTextContent(`${total} 分`)
    }
  })
})

describe('通用计分项：模块卡片与减免运费开关', () => {
  it('减免运费以「报名计分」开关只读展示，配置包裹在计分明细模块卡片', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_02'))
    expect(screen.getByText('計分明細')).toBeInTheDocument()
    const sw = screen.getByRole('switch', { name: '報名計分' })
    expect(sw).toBeChecked()
    expect(sw).toBeDisabled()
    expect(screen.queryByText('前提條件')).not.toBeInTheDocument()
  })

  it('减免运费编辑态可切换报名计分开关，未保存不写后端', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_02'))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(screen.getByText('計分配置')).toBeInTheDocument()
    const sw = screen.getByRole('switch', { name: '報名計分' })
    expect(sw).not.toBeDisabled()
    expect(sw).toBeChecked()
    fireEvent.click(sw)
    expect(screen.getByRole('switch', { name: '報名計分' })).not.toBeChecked()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('其他计分项配置同样以模块卡片呈现', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_09'))
    expect(screen.getByText('計分明細')).toBeInTheDocument()
  })
})

describe('原型配置校验', () => {
  it('默认配置合法，拒绝门槛重复、系数递增和非有限分值', () => {
    const config = createDefaultCouponIntensityConfig()
    expect(validateCouponIntensityConfig(config)).toBeNull()
    config.thresholdTiers[1].maxMultiplier = 1
    expect(validateCouponIntensityConfig(config)).toContain('嚴格遞增')
    config.thresholdTiers[1].maxMultiplier = 1.5
    config.thresholdTiers[1].coefficient = 0.1
    expect(validateCouponIntensityConfig(config)).toContain('不增加')
    config.enrollmentScore = NaN
    expect(validateCouponIntensityConfig(config)).toContain('報名分')
  })
})
