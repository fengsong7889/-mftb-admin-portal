/**
 * 耗材入库视图切换测试
 *
 * 钉住规范 §9.1：新增与详情必须是独立页面，不得再用 Modal 弹窗承载。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsumableInbound from './index'

const api = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
  fetchDetail: vi.fn(),
  createOrder: vi.fn(),
  fetchItemOptions: vi.fn(),
  fetchCompanies: vi.fn(),
  fetchLocations: vi.fn(),
}))
// t 必须是稳定引用：真实 react-i18next 的 t 在渲染之间不变。写成每次新建的内联函数时，
// 把 t 放进 useCallback 依赖的 InboundList#loadData 会陷入「渲染→effect→setState」死循环，
// act() 永不收敛，用例表现为超时而非断言失败。
const t = vi.hoisted(() => (key: string) => key)

// InboundList 走 '@/api/consumable' 别名，InboundForm/InboundDetail 走相对路径，
// 两种写法解析到同一模块但必须分别注册 mock，否则真实 axios 会发出永不结算的请求把测试挂死
vi.mock('@/api/consumable', () => ({
  fetchConsumableInboundOrders: api.fetchOrders,
  fetchConsumableInboundOrderDetail: api.fetchDetail,
  createConsumableInboundOrder: api.createOrder,
  fetchConsumableItemOptions: api.fetchItemOptions,
  fetchPurchaseCompanyOptions: api.fetchCompanies,
}))
vi.mock('../../../api/consumable', () => ({
  fetchConsumableInboundOrders: api.fetchOrders,
  fetchConsumableInboundOrderDetail: api.fetchDetail,
  createConsumableInboundOrder: api.createOrder,
  fetchConsumableItemOptions: api.fetchItemOptions,
  fetchPurchaseCompanyOptions: api.fetchCompanies,
}))
vi.mock('@/api/eam', () => ({ fetchLocationList: api.fetchLocations }))
vi.mock('../../../api/eam', () => ({ fetchLocationList: api.fetchLocations }))
vi.mock('../../../contexts/CompanyBrandContext', () => ({
  useCompanyBrand: () => ({ numericOptions: [] }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))

const order = {
  id: 7, inboundNo: 'HCRK202610090001', inboundType: 'in_manual',
  companyBrandName: '閃蜂', purchaseCompany: '珠海閃蜂科技有限公司', supplierName: '得力',
  bizDate: '2026-10-09', remark: '辦公文具補貨', createdBy: '管理員', createdAt: '2026-10-09 10:00:00',
  updatedBy: '管理員', updatedAt: '2026-10-09 10:00:00',
  items: [{ id: 1, inboundId: 7, itemId: 100, itemCode: 'HC000001', itemName: '中性筆', spec: '0.5mm', locationName: '默認倉', qty: 5, unitPrice: 2, amount: 10 }],
  totalQty: 5, totalAmount: 10,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchOrders.mockResolvedValue({ records: [order], total: 1 })
  api.fetchDetail.mockResolvedValue(order)
  api.fetchItemOptions.mockResolvedValue([])
  api.fetchCompanies.mockResolvedValue([])
  api.fetchLocations.mockResolvedValue([])
})

async function mount() {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <ConsumableInbound />
    </ConfigProvider>)
  })
}

describe('耗材入库独立页面', () => {
  it('点新建进入独立表单页，全程不出现弹窗', async () => {
    await mount()
    // 冷启动下 antd 首屏与异步加载较慢，统一用 findBy 等待而非硬断言
    fireEvent.click(await screen.findByText('consumable.inboundBtnNew', undefined, { timeout: 30000 }))

    expect(await screen.findByText('consumable.sectionBasic', undefined, { timeout: 30000 })).toBeInTheDocument()
    expect(screen.getByText('consumable.sectionItems')).toBeInTheDocument()
    expect(screen.getByText('common.save')).toBeInTheDocument()
    expect(document.querySelector('.ant-modal')).toBeNull()
  }, 60000)

  it('点详情进入独立详情页并加载明细与最后更新', async () => {
    await mount()
    fireEvent.click(await screen.findByText('common.detail', undefined, { timeout: 30000 }))

    await waitFor(() => expect(api.fetchDetail).toHaveBeenCalledWith(7))
    expect(await screen.findByText('consumable.inboundDetailTitle', undefined, { timeout: 30000 })).toBeInTheDocument()
    expect(await screen.findByText('中性筆', undefined, { timeout: 30000 })).toBeInTheDocument()
    // 「管理員」同时出现在创建人与最后更新人，用 findAllByText 避免多命中
    const operators = await screen.findAllByText('管理員', undefined, { timeout: 30000 })
    expect(operators.length).toBeGreaterThan(1)
    expect(document.querySelector('.ant-modal')).toBeNull()
  }, 60000)
})
