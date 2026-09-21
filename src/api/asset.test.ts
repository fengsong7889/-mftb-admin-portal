import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from './request'
import { fetchAssetList, fetchAssetDetail, updateAsset, parseAssetImages, fetchRepairApplicantOptions, repairAsset, updateRepair, type AssetItem } from './asset'

vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

beforeEach(() => { vi.clearAllMocks() })

const DATA_URL_A = 'data:image/png;base64,iVBORw0KGgo='
const DATA_URL_B = 'data:image/jpeg;base64,/9j/4AAQ='

describe('parseAssetImages', () => {
  it('保留 Data URL 内部 base64 逗号，仅按图片边界拆分', () => {
    expect(parseAssetImages(`${DATA_URL_A},${DATA_URL_B}`)).toEqual([DATA_URL_A, DATA_URL_B])
  })

  it('兼容 JSON 数组格式', () => {
    expect(parseAssetImages(JSON.stringify([DATA_URL_A, DATA_URL_B]))).toEqual([DATA_URL_A, DATA_URL_B])
  })

  it('兼容普通 http 逗号拼接并过滤空值', () => {
    expect(parseAssetImages('https://a/1.png,https://a/2.png,')).toEqual(['https://a/1.png', 'https://a/2.png'])
  })

  it.each([null, undefined, '', '[]'])('空输入返回空数组（%s）', (v) => {
    expect(parseAssetImages(v as string | null | undefined)).toEqual([])
  })
})

describe('维修申请人选项与保存', () => {
  it.each([' MF00002 ', ' 测试员工 '])('通过维修菜单接口搜索姓名或工号：%s', async keyword => {
    const employees = [{ employeeId: 2, empName: '测试员工', empNo: 'MF00002' }]
    vi.mocked(request.get).mockResolvedValueOnce(employees)
    await expect(fetchRepairApplicantOptions(keyword)).resolves.toEqual(employees)
    expect(request.get).toHaveBeenCalledWith('/eam/repairs/applicant-options', {
      params: { keyword: keyword.trim() },
    })
  })

  it('首次展开加载默认选项，空白关键字不作为筛选条件', async () => {
    vi.mocked(request.get).mockResolvedValueOnce([])
    await expect(fetchRepairApplicantOptions('  ')).resolves.toEqual([])
    expect(request.get).toHaveBeenCalledWith('/eam/repairs/applicant-options', {
      params: { keyword: undefined },
    })
  })

  it('搜索失败向上抛出，不伪造员工选项', async () => {
    vi.mocked(request.get).mockRejectedValueOnce(new Error('forbidden'))
    await expect(fetchRepairApplicantOptions('MF00002')).rejects.toThrow('forbidden')
  })

  it('新增和编辑均保留申请人姓名及工号快照，编辑锁定具体记录', async () => {
    const applicant = '测试员工（MF00002）'
    const record = {
      assetId: 1, assetNo: 'FA0001', assetName: '电脑', repairDate: '2026-09-21',
      faultDesc: '屏幕损坏', repairContent: '更换屏幕', repairBy: '自修', cost: 200,
      applicant, finishDate: null, status: 'repairing' as const,
    }
    vi.mocked(request.post).mockResolvedValueOnce(123)
    await expect(repairAsset(record)).resolves.toBe(123)
    expect(request.post).toHaveBeenCalledWith('/eam/repairs', expect.objectContaining({ applicant, cost: 200 }))
    await updateRepair(123, { applicant, cost: 300 })
    expect(request.put).toHaveBeenCalledWith('/eam/repairs/123', { applicant, cost: 300 })
  })
})

describe('fetchAssetList 查询映射', () => {
  const backendAsset = {
    id: 1, assetNo: 'FA0001', assetName: 'iPhone', assetType: '電子設備',
    brand: null, unit: null, quantity: 1, purchaseValue: 8999, purchaseDate: null,
    usageDate: null, source: 'self', company: null, location: '倉庫A', department: null,
    userName: null, status: 'idle', images: null, remark: null, applicant: '',
    scrapTime: null, createdAt: '2026-09-15T10:00:00', updatedAt: '2026-09-15T10:00:00',
    updatedBy: '張三',
  }

  it('日期区间展开为 Start/End，status=all 被剔除，记录字段补默认值', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [backendAsset], total: 1 })

    const res = await fetchAssetList({
      status: 'all',
      purchaseDate: ['2026-01-01', '2026-12-31'],
      keyword: 'FA',
    })

    const [url, config] = vi.mocked(request.get).mock.calls[0]
    expect(url).toBe('/eam/assets')
    const params = (config as { params: Record<string, unknown> }).params
    expect(params.status).toBeUndefined()
    expect(params.purchaseDateStart).toBe('2026-01-01')
    expect(params.purchaseDateEnd).toBe('2026-12-31')
    expect(params.keyword).toBe('FA')

    const record = res.records[0] as AssetItem
    expect(record.brand).toBe('')
    expect(record.department).toBe('')
    expect(record.params).toEqual({})
    // applicant 回退到后端 updatedBy，保证列表「最后更新人」列有值
    expect(record.applicant).toBe('張三')
    expect(res.total).toBe(1)
  })

  it.each([{ memory: '16GB', count: 0 }, '{"memory":"16GB","count":0}'])('列表与详情保留相同的真实参数 %j', async params => {
    vi.mocked(request.get).mockResolvedValueOnce({ records: [{ ...backendAsset, params }], total: 1 })
      .mockResolvedValueOnce({ ...backendAsset, params })
    const list = await fetchAssetList()
    const detail = await fetchAssetDetail(1)
    expect(list.records[0].params).toEqual({ memory: '16GB', count: '0' })
    expect(detail.params).toEqual(list.records[0].params)
    expect(request.get).toHaveBeenLastCalledWith('/eam/assets/1')
  })

  it('编辑保存透传原始参数 key 和真实值', async () => {
    const params = { memory: '16GB', custom: '历史配置' }
    await updateAsset(1, { params })
    expect(request.put).toHaveBeenCalledWith('/eam/assets/1', { params })
  })

  it('台账请求失败不回退到本地 Mock 资产', async () => {
    vi.mocked(request.get).mockRejectedValueOnce(new Error('offline'))
    await expect(fetchAssetDetail(1)).rejects.toThrow('offline')
  })

  it('透传 orderId / batchId 以便按订单或批次溯源', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [], total: 0 })

    await fetchAssetList({ orderId: 5, batchId: 100 })

    const [, config] = vi.mocked(request.get).mock.calls[0]
    const params = (config as { params: Record<string, unknown> }).params
    expect(params.orderId).toBe(5)
    expect(params.batchId).toBe(100)
  })
})
