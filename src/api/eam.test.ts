import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from './request'
import {
  createPurchaseRequest, fetchPurchaseRequestDetail, approvePurchaseRequest,
  fetchPurchaseOrderDetail, fetchPurchaseOrderList, fetchHandoverDetail, fetchCategoryList,
} from './eam'

vi.mock('./request', () => ({
  default: { get: vi.fn() },
  isBackendUnavailable: vi.fn(() => false),
  SILENT_HEADER: 'X-Silent',
}))

const backendOrder = {
  id: 30,
  poNo: 'DDCG202609150003',
  reqId: 3,
  reqNo: 'CG202609150002',
  brand: 1,
  amount: '0.00',
  createdAt: '2026-09-15T21:32:41',
}

beforeEach(() => { vi.clearAllMocks() })

describe('资产参数数据来源', () => {
  it('交接详情失败不拿同 ID 的 Mock 单据代替真实参数', async () => {
    vi.mocked(request.get).mockRejectedValueOnce(new Error('offline'))
    await expect(fetchHandoverDetail(1)).rejects.toThrow('offline')
  })

  it('实物展示使用的参数分类字典禁用 Mock 回退', async () => {
    vi.mocked(request.get).mockRejectedValueOnce(new Error('offline'))
    await expect(fetchCategoryList()).rejects.toThrow('offline')
  })
})

describe('采购订单接口映射', () => {
  it.each([1, 2, '1', '2'])('保留真实流程编号，并将品牌 %s 转为编辑框的数字枚举', async (brand) => {
    vi.mocked(request.get).mockResolvedValue({ ...backendOrder, brand })

    const result = await fetchPurchaseOrderDetail(30)

    expect(request.get).toHaveBeenCalledExactlyOnceWith('/eam/purchase/30')
    expect(result.brand).toBe(Number(brand))
    expect(result.reqNo).toBe('CG202609150002')
    expect(result.reqId).toBe(3)
  })

  it('列表与详情共用相同的品牌和流程编号映射', async () => {
    vi.mocked(request.get).mockResolvedValueOnce({ records: [backendOrder], total: 1 })
      .mockResolvedValueOnce(backendOrder)

    const list = await fetchPurchaseOrderList()
    const detail = await fetchPurchaseOrderDetail(30)

    expect(list.records[0]).toEqual(detail)
  })

  it.each([null, undefined, '', 'unknown', 0])('品牌缺失或无效（%s）时不填入默认品牌', async (brand) => {
    vi.mocked(request.get).mockResolvedValue({ ...backendOrder, brand })
    expect((await fetchPurchaseOrderDetail(30)).brand).toBeUndefined()
  })

  it('真实接口缺少流程编号时不得关联同 ID 的本地 Mock 申请', async () => {
    vi.mocked(request.get).mockResolvedValue({ ...backendOrder, reqNo: null, brand: null })

    const detail = await fetchPurchaseOrderDetail(30)

    expect(detail.reqNo).toBeUndefined()
    expect(detail.brand).toBeUndefined()
    expect(request.get).toHaveBeenCalledTimes(1)
  })

  it('旧版采购写操作尚未接入真实 API，直接拒绝', async () => {
    await expect(createPurchaseRequest({
      title: '测试采购申请', department: '测试部门', applicant: '测试申请人',
      budget: 0, reason: '测试', items: [], brand: 1,
    })).rejects.toThrow('尚未接入真实 API')
    await expect(fetchPurchaseRequestDetail(1)).rejects.toThrow('尚未接入真实 API')
    await expect(approvePurchaseRequest(1, true, '审批人')).rejects.toThrow('尚未接入真实 API')
  })

  it('真实接口失败时不生成模拟采购单据', async () => {
    vi.mocked(request.get).mockRejectedValue(new Error('后端不可用'))
    await expect(fetchPurchaseOrderList()).rejects.toThrow('后端不可用')
    await expect(fetchPurchaseOrderDetail(30)).rejects.toThrow('后端不可用')
  })
})
