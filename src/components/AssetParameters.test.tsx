import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AssetParameters, { AssetSummary } from './AssetParameters'
import { assetParameterFields, normalizeAssetParams, type AssetParameterCatalog } from '../utils/assetParams'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../hooks/useAssetParameterCatalog', () => ({ useAssetParameterCatalog: () => ({ categories: [], types: [] }) }))
afterEach(cleanup)

const catalog: AssetParameterCatalog = {
  categories: [],
  types: [
    { id: 1, categoryCode: '01', code: 'color', name: '颜色', valueType: 'text', status: 'enabled', sort: 1 },
    { id: 2, categoryCode: '0101', code: 'memory', name: '内存', unit: 'GB', valueType: 'number', status: 'enabled', sort: 2 },
    { id: 3, categoryCode: '02', code: 'memory', name: '其他分类同名参数', valueType: 'text', status: 'enabled', sort: 1 },
    { id: 4, categoryCode: '0101', code: 'old', name: '历史配置', valueType: 'text', status: 'disabled', sort: 3 },
  ],
}

describe('实物参数解析与紧凑展示', () => {
  it.each([undefined, null, '', 'broken json', '[]', 'null', [], 8])('安全处理空值或无效响应 %j', value => {
    expect(normalizeAssetParams(value)).toEqual({})
  })

  it('兼容 JSON 字符串，保留零、false、多选值，不显示对象字符串', () => {
    expect(normalizeAssetParams('{"count":0,"enabled":false,"color":["白","黑"],"invalid":{},"empty":null}'))
      .toEqual({ count: '0', enabled: 'false', color: '白、黑' })
  })

  it('按分类解析名称，继承父分类，不串用其他分类；历史未知字段不丢失', () => {
    const fields = assetParameterFields({ categoryCode: '0101', params: { memory: '16', old: '已录入', custom: '特殊配置' } }, catalog)
    expect(fields.map(f => f.label)).toEqual(['颜色', '内存', '历史配置', 'custom'])
    expect(assetParameterFields({ params: { memory: '16' } }, catalog)[0].label).toBe('memory')
  })

  it('展示真实值与单位，忽略未配置的模板字段和空值', () => {
    const { container } = render(<AssetParameters asset={{ categoryCode: '0101', params: { memory: '16', old: '保留', blank: '' } }} catalog={catalog} />)
    expect(screen.getByText('内存（GB）：')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('历史配置：')).toBeInTheDocument()
    expect(screen.queryByText('颜色：')).not.toBeInTheDocument()
    expect(screen.queryByText('blank：')).not.toBeInTheDocument()
    expect(container.querySelector('dl')).toBeInTheDocument()
    expect(container.querySelector('.ant-tag')).not.toBeInTheDocument()
  })

  it('缺少参数与确认未配置使用不同提示，历史单据标明当前配置', () => {
    const { rerender } = render(<AssetParameters asset={{}} current catalog={catalog} />)
    expect(screen.getByText('asset.paramsUnavailable')).toBeInTheDocument()
    expect(screen.getByText('asset.currentParamsHint')).toBeInTheDocument()
    rerender(<AssetParameters asset={{ params: {} }} catalog={catalog} />)
    expect(screen.getByText('asset.noParams')).toBeInTheDocument()
  })

  it('切换实物后立即清理前一件参数，长文本保持完整', () => {
    const { rerender } = render(<AssetParameters asset={{ params: { serial: '旧序号' } }} compact catalog={catalog} />)
    const longValue = '配置说明'.repeat(100)
    rerender(<AssetParameters asset={{ params: { description: longValue, count: 0, enabled: false } }} compact catalog={catalog} />)
    expect(screen.queryByText('旧序号')).not.toBeInTheDocument()
    expect(screen.getByText(longValue)).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('false')).toBeInTheDocument()
  })

  it('领用/借用共用摘要保留基础字段和参数，不再为每项创建灰色卡片', () => {
    const { container } = render(<AssetSummary asset={{ assetNo: 'A-1', assetName: '测试设备', purchaseValue: 0, params: { cpu: '真实芯片' } }} />)
    expect(screen.getByText('A-1')).toBeInTheDocument()
    expect(screen.getByText('MOP 0')).toBeInTheDocument()
    expect(screen.getByText('真实芯片')).toBeInTheDocument()
    expect(container.querySelector('.ant-descriptions-bordered')).not.toBeInTheDocument()
  })
})
