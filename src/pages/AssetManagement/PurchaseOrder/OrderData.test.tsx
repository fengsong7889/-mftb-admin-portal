import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OrderDetail from './OrderDetail'
import OrderEdit from './OrderEdit'
import { fetchAllParamTypes, fetchPurchaseOrderDetail, fetchPurchaseRequestDetail, type PurchaseOrder } from '../../../api/eam'
import { fetchEmployees } from '../../../api/employee'
import { BrandEnum } from '../../../constants/brand'

vi.mock('../../../api/eam')
vi.mock('../../../api/employee')
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
vi.mock('react-i18next', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

const order: PurchaseOrder = {
  id: 30,
  poNo: 'DDCG202609150003',
  reqId: 3,
  reqNo: 'CG202609150002',
  brand: BrandEnum.SHANFENG,
  supplier: '待定供應商',
  amount: 0,
  deliveryDate: '',
  items: [],
  execStatus: 'pending',
  status: 'pending',
  createdAt: '2026-09-15 21:32:41',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchPurchaseOrderDetail).mockResolvedValue({ ...order })
  vi.mocked(fetchAllParamTypes).mockResolvedValue([])
  vi.mocked(fetchEmployees).mockResolvedValue({ records: [], total: 0 })
})

describe('采购订单品牌与流程编号展示', () => {
  it('详情渲染接口品牌和真实流程编号，点击仍传递关联申请 ID', async () => {
    const onViewRequest = vi.fn()
    render(<OrderDetail id={30} onBack={vi.fn()} onEdit={vi.fn()} onInbound={vi.fn()} onViewRequest={onViewRequest} />)

    const link = await screen.findByRole('button', { name: 'CG202609150002' })
    expect(screen.getByText('閃蜂')).toBeInTheDocument()
    expect(screen.queryByText('CG-2024-003')).not.toBeInTheDocument()
    expect(fetchPurchaseRequestDetail).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onViewRequest).toHaveBeenCalledWith(3)
  })

  it('缺少真实流程编号时不显示 Mock 编号或内部 ID', async () => {
    vi.mocked(fetchPurchaseOrderDetail).mockResolvedValue({ ...order, reqNo: undefined })
    render(<OrderDetail id={30} onBack={vi.fn()} onEdit={vi.fn()} onInbound={vi.fn()} onViewRequest={vi.fn()} />)

    await screen.findByText('閃蜂')
    expect(fetchPurchaseRequestDetail).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'CG-2024-003' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
  })

  it.each([
    [BrandEnum.SHANFENG, '閃蜂'],
    [BrandEnum.MFOOD, 'mFood'],
  ] as const)('编辑表单回显品牌 %s（%s）', async (brand, label) => {
    vi.mocked(fetchPurchaseOrderDetail).mockResolvedValue({ ...order, brand })
    render(<OrderEdit id={30} onBack={vi.fn()} onSaved={vi.fn()} />)

    const field = await screen.findByLabelText('所屬品牌')
    await waitFor(() => {
      const formItem = field.closest('.ant-form-item')
      expect(formItem).not.toBeNull()
      expect(within(formItem as HTMLElement).getByText(label)).toBeInTheDocument()
    })
  })
})
