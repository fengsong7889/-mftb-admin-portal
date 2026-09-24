import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import PromotionSlotConfigAdd from '../PromotionSlotConfigAdd'
import PromotionSlotConfigSlots from '../PromotionSlotConfigSlots'
import { emptyDraft, listLocalStrategies } from './waterfallExtStore'
import { writeDraft } from './waterfallDraft'
import zh from '../../i18n/locales/zh-TW.json'

vi.mock('../../api/adPromotion', () => ({
  fetchAdAlgorithms: vi.fn().mockResolvedValue({ records: [] }),
  fetchWaterfallDetail: vi.fn(), createWaterfall: vi.fn(), updateWaterfall: vi.fn(),
}))
vi.mock('../../components/DetailPageHeader', () => ({ default: () => <h2>瀑布流詳情</h2> }))
vi.mock('./WaterfallPreview', () => ({ default: () => <div>預覽</div> }))

const i18n = createInstance()

beforeAll(async () => {
  configure({ asyncUtilTimeout: 5000, defaultHidden: true })
  const getComputedStyle = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => getComputedStyle(element))
  await i18n.init({ lng: 'zh-TW', resources: { 'zh-TW': { promotionSlotConfig: zh.promotionSlotConfig, common: zh.common, recommend: zh.recommend } }, interpolation: { escapeValue: false } })
})
beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterAll(() => { vi.restoreAllMocks(); configure({ asyncUtilTimeout: 1000, defaultHidden: false }) })

function TestNavigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/promotion-slot-config-add?biz=groupBuy')}>切換到團購</button>
}

function renderForm(entry = '/promotion-slot-config-add?biz=groupBuy') {
  return render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <TestNavigation />
    <Routes>
      <Route path="/promotion-slot-config-add" element={<PromotionSlotConfigAdd />} />
      <Route path="/promotion-slot-config-slots" element={<PromotionSlotConfigSlots />} />
      <Route path="/promotion-slot-config" element={<div>已回到列表</div>} />
    </Routes>
  </MemoryRouter></I18nextProvider>)
}

async function selectOption(input: HTMLElement, option: string) {
  fireEvent.mouseDown(input.closest('.ant-select')!.querySelector('.ant-select-selector')!)
  const element = await waitFor(() => {
    const match = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')).find(item => item.textContent?.includes(option))
    expect(match).toBeDefined()
    return match!
  })
  fireEvent.click(element)
}

function customDraft(contentType: 'store' | 'product' = 'store') {
  const draft = { ...emptyDraft('groupBuy', 'flashBee'), key: 'new_groupBuy_test', strategyName: '验证自定义', displayCategoryMode: 'custom' as const, contentType, sortMode: 'distance' as const }
  writeDraft(draft)
  return draft
}

describe('团购瀑布流表单和路由往返', () => {
  it('同一路由由外卖切团购不会复用旧表单状态', async () => {
    renderForm('/promotion-slot-config-add?biz=delivery')
    fireEvent.click(screen.getByText('切換到團購'))
    await waitFor(() => expect(screen.getByRole('radio', { name: '門店' })).toBeChecked())
    expect(screen.getByText('展示維度')).toBeInTheDocument()
    expect(screen.queryByText('美食外賣')).not.toBeInTheDocument()
    await selectOption(document.querySelector('#app')!, '閃蜂')
    await waitFor(() => expect(document.querySelector('#app')!.closest('.ant-select')).toHaveTextContent('閃蜂'))
    await selectOption(screen.getByLabelText('展示類目'), '自定義')
    expect(screen.getByRole('radio', { name: '銷量排序' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '商品' }))
    expect(screen.getByRole('radio', { name: '近30天銷量排序' })).toBeInTheDocument()
  }, 60000)

  it('导入仅在主表单；独立编辑只搜索和分配位置，两次返回保留全部配置', async () => {
    customDraft()
    renderForm('/promotion-slot-config-add?biz=groupBuy&draftKey=new_groupBuy_test')
    expect(await screen.findByRole('button', { name: /批量導入/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '距離排序' })).toBeChecked()
    for (const [id, pos] of [['MD1001', 1], ['MD3001', 2]] as const) {
      fireEvent.click(screen.getByRole('button', { name: /新增\/編輯/ }))
      const search = await screen.findByRole('combobox', { name: '選擇門店' })
      expect(screen.queryByRole('button', { name: /批量導入/ })).not.toBeInTheDocument()
      expect(screen.queryByText('所屬分類')).not.toBeInTheDocument()
      expect(screen.queryByText('所屬品牌')).not.toBeInTheDocument()
      await selectOption(search, id)
      fireEvent.keyDown(screen.getByRole('button', { name: `${pos}號位` }), { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: /應用並返回/ }))
      await screen.findByRole('button', { name: /批量導入/ })
      expect(screen.getByDisplayValue('验证自定义')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: '距離排序' })).toBeChecked()
      expect(screen.getByText(id)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('已回到列表')
    const [saved] = listLocalStrategies()
    expect(saved).toMatchObject({ strategyName: '验证自定义', brand: 'flashBee', displayCategoryMode: 'custom', sortMode: 'distance', fallbackCategoryIds: [] })
    expect(saved.fixedSlots.map(slot => slot.position)).toEqual([1, 2])
  }, 120000)

  it('超市百货同步内容模式和排序，美食外卖不显示扩展控件', async () => {
    const draft = { ...emptyDraft('delivery', 'flashBee'), key: 'new_delivery_superTest', strategyName: '验证超市', bizChannel: 'supermarket' as const, displayCategoryMode: 'custom' as const, contentType: 'product' as const, sortMode: 'sales' as const }
    writeDraft(draft)
    renderForm('/promotion-slot-config-add?biz=delivery&draftKey=new_delivery_superTest')
    await screen.findByRole('button', { name: /批量導入/ })
    expect(screen.getByText('超市百貨')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '近30天銷量排序' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /新增\/編輯/ }))
    const search = await screen.findByRole('combobox', { name: '選擇商品' })
    await selectOption(search, 'SP1001')
    fireEvent.click(screen.getByRole('button', { name: '1號位' }))
    fireEvent.click(screen.getByRole('button', { name: /應用並返回/ }))
    await screen.findByRole('button', { name: /批量導入/ })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('已回到列表')
    expect(listLocalStrategies()[0]).toMatchObject({ businessType: 'delivery', bizChannel: 'supermarket', sortMode: 'sales', contentType: 'product' })
  }, 60000)

  it('主表单导入跨品牌整批拒绝，同品牌导入直接回显且可保存', async () => {
    customDraft('product')
    const { container } = renderForm('/promotion-slot-config-add?biz=groupBuy&draftKey=new_groupBuy_test')
    await screen.findByRole('button', { name: /批量導入/ })
    const { default: ExcelJS } = await import('exceljs')
    const upload = async (ids: string[]) => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Import')
      sheet.addRow(['ID', '排序'])
      ids.forEach((id, index) => sheet.addRow([id, index + 1]))
      const buffer = await workbook.xlsx.writeBuffer()
      const file = new File([buffer], 'import.xlsx')
      Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    }
    await act(async () => { await upload(['GD9001', 'GD9003']) })
    expect(await screen.findByText(/所屬品牌與當前配置不一致/)).toBeInTheDocument()
    expect(within(container.querySelector<HTMLElement>('.ant-table-body')!).queryByText('GD9001')).not.toBeInTheDocument()
    await act(async () => { await upload(['GD9001', 'GD9002']) })
    await waitFor(() => expect(within(container.querySelector<HTMLElement>('.ant-table-body')!).getByText('GD9001')).toBeInTheDocument())
    expect(within(container.querySelector<HTMLElement>('.ant-table-body')!).getByText('GD9002')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('已回到列表')
    expect(listLocalStrategies()[0].fixedSlots).toHaveLength(2)
  }, 60000)
})
