import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AssetAdd from './AssetAdd'
import AssetDetail from './AssetDetail'
import AssetClaim from './AssetClaim'
import { fetchAssetDetail, fetchAssetList, updateAsset, type AssetItem } from '../../api/asset'
import { fetchAllParamTypes, type ParamType } from '../../api/eam'

const { t } = vi.hoisted(() => ({ t: (key: string) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => false }) }))
vi.mock('../../contexts/CompanyBrandContext', () => ({ useCompanyBrand: () => ({ numericOptions: [] }) }))
vi.mock('../../components/DetailPageHeader', () => ({ default: () => null }))
vi.mock('./AssetTag/AssetTagBindingSection', () => ({ default: () => null }))
vi.mock('../../api/asset', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/asset')>(),
  fetchAssetDetail: vi.fn(), fetchAssetList: vi.fn(), updateAsset: vi.fn(),
}))
vi.mock('../../api/eam', () => ({
  fetchCategoryList: vi.fn(async () => []), fetchLocationList: vi.fn(async () => []),
  fetchAllParamTypes: vi.fn(async () => []), fetchBrandList: vi.fn(async () => []),
  fetchModelList: vi.fn(async () => ({ records: [], total: 0 })), fetchParamValuesByType: vi.fn(async () => []),
}))
vi.mock('../../api/department', () => ({ fetchDepartments: vi.fn(async () => []) }))
vi.mock('../../api/employee', () => ({ fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })) }))

const asset: AssetItem = {
  id: 1, assetNo: 'TEST-001', assetName: '测试实物', assetType: '手机', categoryCode: '0101',
  brand: '测试品牌', unit: '台', quantity: 1, purchaseValue: 10, purchaseDate: null, usageDate: null,
  source: 'self', company: '测试公司', location: '测试仓库', department: '', userName: '', status: 'idle',
  images: null, remark: null, applicant: '测试员', scrapTime: null, createdAt: '', updatedAt: '',
  params: { memory: '16', custom: '历史实物参数' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAssetDetail).mockResolvedValue(asset)
  vi.mocked(fetchAssetList).mockResolvedValue({ records: [asset], total: 1 })
  vi.mocked(fetchAllParamTypes).mockResolvedValue([])
})
afterEach(() => { cleanup(); window.location.hash = '' })

function page(component: React.ReactNode, route: string) {
  return render(<MemoryRouter initialEntries={[route]}>{component}</MemoryRouter>)
}

describe('资产参数页面链路', () => {
  it('台账详情渲染 API 实物参数而非型号默认值', async () => {
    page(<AssetDetail />, '/asset-detail?id=1')
    expect(await screen.findByText('历史实物参数')).toBeInTheDocument()
    expect(fetchAssetDetail).toHaveBeenCalledWith(1)
  })

  it('编辑页字典后到时更新标签但保留已编辑的参数，保存不丢历史 key', async () => {
    let resolveTypes!: (types: ParamType[]) => void
    vi.mocked(fetchAllParamTypes).mockImplementationOnce(() => new Promise(resolve => { resolveTypes = resolve }))
    page(<AssetAdd />, '/asset-add?id=1')
    fireEvent.change(await screen.findByLabelText('memory：'), { target: { value: '32' } })
    await act(async () => resolveTypes([{ id: 1, categoryCode: '0101', code: 'memory', name: '内存', unit: 'GB', valueType: 'text', status: 'enabled', sort: 1 }]))
    expect(await screen.findByLabelText('内存（GB）：')).toHaveValue('32')
    expect(screen.getByLabelText('custom：')).toHaveValue('历史实物参数')
    fireEvent.click(screen.getByRole('button', { name: /common.save/ }))
    await waitFor(() => expect(updateAsset).toHaveBeenCalledWith(1, expect.objectContaining({ params: { memory: '32', custom: '历史实物参数' } })))
  })

  it('领用深链预填保留同一 API 的参数', async () => {
    window.location.hash = '#/asset-claim/add?assetId=1'
    page(<AssetClaim />, '/asset-claim/add?assetId=1')
    expect(await screen.findByText('历史实物参数')).toBeInTheDocument()
    expect(fetchAssetDetail).toHaveBeenCalledWith(1)
  })

  it('领用下拉选择保留列表 API 的参数', async () => {
    window.location.hash = '#/asset-claim/add'
    const { container } = page(<AssetClaim />, '/asset-claim/add')
    await waitFor(() => expect(fetchAssetList).toHaveBeenCalled())
    fireEvent.mouseDown(container.querySelector('.ant-select-selector')!)
    // rc-virtual-list 会在列表数据落地时重建选项节点：若 click 打在已被替换的脱离文档的旧节点上，
    // onChange 根本不会触发，选不中资产→参数区永远不渲染（本用例在连续运行下 50% 偶发红的根因）。
    // 因此在 waitFor 内重试「定位选项根节点 + 点击」，断言目标与原用例一致（params 来自列表 API），不放宽。
    await waitFor(() => {
      const content = Array.from(document.querySelectorAll('.ant-select-item-option-content'))
        .find((node) => node.textContent?.includes('TEST-001 / 测试实物'))
      const option = content?.closest('.ant-select-item-option')
      expect(option).toBeTruthy()
      fireEvent.click(option!)
      expect(screen.getByText('历史实物参数')).toBeInTheDocument()
    })
  })
})
