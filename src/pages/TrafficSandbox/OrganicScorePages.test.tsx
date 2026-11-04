/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MerchantScoreInsight from './MerchantScoreInsight'
import LocationSimulation from './organic/LocationSimulation'
import { getSampleSnapshot } from './organic/fixtures'
import { setExtension } from '../waterfallConfig/waterfallExtStore'
import { defaultExtension } from '@mftb/contracts/waterfallTypes'
import type { Coordinate } from './organic/types'

const permissions = vi.hoisted(() => ({ view: true, export: true }))
const exportMock = vi.hoisted(() => vi.fn())
const waterfallsMock = vi.hoisted(() => vi.fn())
const algorithmsMock = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasMenuPermission: () => permissions.view, hasPermission: (key: string) => key.endsWith(':export') ? permissions.export : permissions.view }) }))
vi.mock('@/utils/exportCSV', () => ({ exportToCSV: exportMock }))
// 只mock两个取数函数；保留模块的纯映射助手（brandToAppType 等）给页面的品牌导出口径用
vi.mock('@/api/adPromotion', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchWaterfallList: waterfallsMock,
  fetchAdAlgorithms: algorithmsMock,
}))
// 页面只用到少量 i18n 短标签：这里按白名单给真实繁中值（含 {{var}} 插值），未登记的 key 会原样露出键名
// 注：频道/品牌白名单与语言包取值有意不同（页面口径走代码内硬编码同源文字），因此不直接加载整份 zh-TW.json
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const text = (({
        'common.back': '返回',
        'recommend.channelDelivery': '美食外賣',
        'recommend.channelHome': '大首頁',
        'recommend.channelSupermarket': '超市百貨',
        'recommend.channelGroupBuy': '團購到店',
        'recommend.appShanfeng': '閃蜂',
        'recommend.appMfood': 'mFood',
        'recommend.statusDisabled': '停用',
        'trafficSandbox.boundWaterfall': '綁定瀑布流',
        'trafficSandbox.boundWaterfallCount': '{{count}} 條',
        'trafficSandbox.viewAllBoundWaterfall': '查看全部 {{count}} 條綁定瀑布流',
      }) as Record<string, string>)[key] ?? key
      return Object.entries(options ?? {}).reduce((acc, [name, value]) => acc.split(`{{${name}}}`).join(String(value)), text)
    },
  }),
}))
vi.mock('@ant-design/charts', () => ({ Line: () => <div aria-label="距離曲線" /> }))
vi.mock('./organic/LocationMap', () => ({ default: ({ onPick }: { onPick: (p: Coordinate) => void }) => <button onClick={() => onPick({ lat: 22.18, lng: 113.56 })}>地圖點選新位置</button> }))

function RouteProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output aria-label="路由">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>瀏覽器後退</button></>
}
async function mount(page: 'board' | 'simulation' = 'board', search = '') {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}><MemoryRouter initialEntries={[`/${page === 'board' ? 'merchant-score-insight' : 'algorithm-simulation'}${search}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {page === 'board' ? <MerchantScoreInsight /> : <LocationSimulation />}<RouteProbe />
    </MemoryRouter></ConfigProvider>)
  })
}
const bodyRows = () => Array.from(document.querySelectorAll<HTMLElement>('.ant-table-tbody tr.ant-table-row'))
const routeParam = (name: string) => {
  const text = screen.getByLabelText('路由').textContent ?? ''
  return new URLSearchParams(text.split('?')[1] ?? '').get(name)
}
const openDropdown = (name: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }))
  const dropdown = document.querySelector<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  expect(dropdown, `下拉未展開：${name}`).toBeTruthy()
  return dropdown as HTMLElement
}
beforeEach(() => {
  permissions.view = true; permissions.export = true
  localStorage.clear(); exportMock.mockClear()
  waterfallsMock.mockReset().mockResolvedValue({ records: [
    { id: 11, strategyCode: 'PB001', strategyName: '外賣首頁瀑布流', brand: 'flashBee', naturalAlgoId: 'SFZR001', naturalAlgoName: '外賣自然流量', status: 1 },
    { id: 12, strategyCode: 'PB002', strategyName: '超市首頁瀑布流', brand: 'mFood', naturalAlgoId: 'SFZR002', naturalAlgoName: '超市自然流量', status: 1 },
    // 同一條算法可被多條瀑布流引用：綁定列要能列出全部引用者
    { id: 14, strategyCode: 'PB004', strategyName: '超市分類瀑布流', brand: 'flashBee', naturalAlgoId: 'SFZR002', naturalAlgoName: '超市自然流量', status: 1 },
    // 停用的瀑布流也是歷史引用，綁定列要帶 (停用) 標記
    { id: 15, strategyCode: 'PB005', strategyName: '外賣停用瀑布流', brand: 'flashBee', naturalAlgoId: 'SFZR001', naturalAlgoName: '外賣自然流量', status: 2 },
    // 內容型瀑布流：可以不綁定算法，此類記錄沒有自然流量算法
    { id: 13, strategyCode: 'PB003', strategyName: '超市門店瀑布流（未綁算法）', brand: 'mFood', naturalAlgoId: null, status: 1 },
  ], total: 5 })
  algorithmsMock.mockReset().mockResolvedValue({ records: [
    { id: 1, algoCode: 'SFZR001', algoName: '外賣自然流量', algoType: 7, status: 1, brand: 'flashBee' },
    { id: 2, algoCode: 'SFZR002', algoName: '超市自然流量', algoType: 7, status: 1, brand: 'mFood' },
    // 業務場景：新增後還沒綁任何瀑布流的算法，也要能出榜算分
    { id: 3, algoCode: 'SFZR003', algoName: '未綁定瀑布流的算法', algoType: 7, status: 1, brand: 'flashBee' },
  ], total: 3 })
  // 業務頻道存在「瀑布流策略」的本地擴展存儲（後端本期無頻道列），口徑用例需預置擴展
  setExtension(11, { ...defaultExtension('delivery'), bizChannel: 'food', confirmed: true })
  setExtension(12, { ...defaultExtension('delivery'), bizChannel: 'supermarket', confirmed: true })
  setExtension(14, { ...defaultExtension('delivery'), bizChannel: 'supermarket', confirmed: true })
})

describe('商家權重分', () => {
  it('列表页标准结构：算法首位必选、瀑布流为带出入口，綁定瀑布流在操作列前', async () => {
    await mount()
    // 列表设计规范 §E.7：搜索区置顶，不允许 hero 式定制页头
    expect(document.querySelector('.organic__header')).toBeNull()
    expect(screen.getByRole('combobox', { name: '自然流量算法' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '瀑布流' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '排名下限' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '集團ID/名稱' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '門店ID/名稱' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '運營商圈' })).toBeInTheDocument()
    // 品牌/频道是算法口径的派生展示，不做筛选控件
    expect(screen.queryByRole('combobox', { name: '所屬品牌' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: '業務頻道' })).toBeNull()
    // 算法是榜单唯一必选口径（红星），第二位的瀑布流只是带出入口不带红星
    expect(document.querySelector('.organic__filter-grid > label:first-child .organic__label--required')).toBeInTheDocument()
    expect(document.querySelector('.organic__filter-grid > label:nth-child(2) .organic__label--required')).toBeNull()
    const headers = Array.from(document.querySelectorAll('.ant-table-thead th')).map(th => th.textContent?.trim())
    expect(headers).toEqual(['', '排名', '算法ID/名稱', '集團ID/名稱', '門店ID/名稱', '所屬品牌', '業務頻道', '運營商圈', '商業維度分', '店鋪維度分', '平台維度分', '綜合得分', '綁定瀑布流', '操作'])
    // 多选列（供勾选导出）：表头全选框存在
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    // 列表页标配：導出 + 字段設置（顯隱/排序）
    expect(screen.getByRole('button', { name: /導出/ })).toBeInTheDocument()
    expect(document.querySelector('.table-column-config-btn')).toBeTruthy()
    expect(document.querySelector('.organic__stats')).toBeNull()
  })
  it('未選算法不出榜，查詢提示算法必選', async () => {
    await mount()
    expect(bodyRows()).toHaveLength(0)
    expect(screen.getByText('請先選擇自然流量算法後再查看排名')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    expect(await screen.findByText('自然流量算法為必選條件，請先選擇算法')).toBeInTheDocument()
  })
  it('選已綁定算法即出榜：綁定列只展首条，+N 面板看全部', async () => {
    await mount('board', '?algo=SFZR001')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    const first = bodyRows()[0]
    // 列内只放第一条，第二条折叠成 +1
    expect(within(first).getByText('外賣首頁瀑布流(PB001)')).toBeInTheDocument()
    expect(within(first).queryByText(/PB005/)).toBeNull()
    const moreBtn = within(first).getByRole('button', { name: '查看全部 2 條綁定瀑布流' })
    expect(moreBtn).toHaveTextContent('+1 ▾')
    // 可点入口必须跟操作列同一套色彩语言（link 按钮：静态品牌橙 + hover 变亮带浅橙底），不自造描边胶囊也不手写色值
    expect(moreBtn.className).toContain('ant-btn-link')
    expect(moreBtn.className).toContain('organic__wf-more')
    // 点 +N 展开面板：三层结构（口径头 → 条目卡 → 尾注），逐条展示编号/频道/状态
    fireEvent.click(within(first).getByRole('button', { name: '查看全部 2 條綁定瀑布流' }))
    const panel = await screen.findByRole('tooltip')
    expect(within(panel).getByText('綁定瀑布流')).toBeInTheDocument()
    expect(within(panel).getByText('2 條')).toBeInTheDocument()
    const wfItems = panel.querySelectorAll<HTMLElement>('.organic__wf-item')
    expect(wfItems).toHaveLength(2)
    expect(within(panel).getByText('外賣首頁瀑布流')).toBeInTheDocument()
    expect(within(panel).getByText('PB001')).toBeInTheDocument()
    expect(within(panel).getByText('外賣停用瀑布流')).toBeInTheDocument()
    expect(within(panel).getByText('PB005')).toBeInTheDocument()
    // 兩條均歸類美食外賣：每條条目卡各一個頻道 chip
    expect(within(panel).getAllByText('美食外賣')).toHaveLength(2)
    // 停用标记只跟着已停用那条，不串到启用条目上
    expect(within(wfItems[1]).getByText('停用')).toBeInTheDocument()
    expect(wfItems[1].className).toContain('organic__wf-item--disabled')
    expect(within(wfItems[0]).queryByText('停用')).toBeNull()
    // 頻道集合列去重後單值；品牌取算法自身配置
    expect(within(first).getByText('美食外賣')).toBeInTheDocument()
    expect(within(first).getByText('閃蜂')).toBeInTheDocument()
    expect(within(first).getByText('SFZR001')).toBeInTheDocument()
    for (const row of bodyRows()) expect(within(row).getByText('外賣首頁瀑布流(PB001)')).toBeInTheDocument()
  })
  it('未綁定瀑布流的算法同樣出榜：綁定列與頻道列顯示無', async () => {
    await mount('board', '?algo=SFZR003')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    const first = bodyRows()[0]
    // 綁定瀑布流、業務頻道兩列都如實顯示「無」，不猜頻道也不阻断出榜
    expect(within(first).getAllByText('無')).toHaveLength(2)
    // 品牌取算法自身配置
    expect(within(first).getByText('閃蜂')).toBeInTheDocument()
    expect(within(first).getByText('SFZR003')).toBeInTheDocument()
  })
  it('只帶瀑布流的舊链接：自動補出綁定算法並出榜', async () => {
    await mount('board', '?wf=PB002')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    await waitFor(() => expect(routeParam('algo')).toBe('SFZR002'))
    expect(screen.getByRole('combobox', { name: '自然流量算法' }).closest('label')).toHaveTextContent('超市自然流量(SFZR002)')
  })
  it('瀑布流未綁算法時空態指向瀑布流配置，不誤報算法庫問題', async () => {
    await mount('board', '?wf=PB003')
    expect(bodyRows()).toHaveLength(0)
    expect(await screen.findByText('該瀑布流未綁定自然流量算法，請改選算法，或到「瀑布流策略」為其補綁')).toBeInTheDocument()
  })
  it('選瀑布流帶出算法後改選其它算法會清空瀑布流', async () => {
    await mount('board', '?wf=PB002')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    fireEvent.click(within(openDropdown('自然流量算法')).getByText('外賣自然流量(SFZR001)'))
    // PB002 绑的是 SFZR002，改選 SFZR001 後瀑布流草稿被清空，但未查询前 URL 不變
    const wfLabel = screen.getByRole('combobox', { name: '瀑布流' }).closest('label')!
    expect(wfLabel).not.toHaveTextContent('超市首頁瀑布流')
    expect(wfLabel).toHaveTextContent('可選，選後帶出其算法')
    expect(routeParam('wf')).toBe('PB002')
  })
  it('導出全量榜單：含綁定瀑布流、頻道集合與演示性質標記', async () => {
    await mount('board', '?algo=SFZR002&regions=1,6')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: /導出/ }))
    expect(exportMock).toHaveBeenCalledTimes(1)
    const [filename, fields, data] = exportMock.mock.calls[0] as [string, { title: string }[], Record<string, unknown>[]]
    expect(filename).toBe('商家權重分_SFZR002')
    expect(fields.map(field => field.title)).toEqual(['排名', '算法ID', '算法名稱', '綁定瀑布流', '集團ID', '集團名稱', '門店ID', '門店名稱', '所屬品牌', '業務頻道', '運營商圈', '商業維度分', '店鋪維度分', '平台維度分', '綜合得分', '榜單口徑', '資料性質'])
    // 导出不只当前页：跟当前筛选条件走的全量榜單
    const snapshot = getSampleSnapshot()
    const expected = snapshot.stores.filter(s => s.totalScore != null && [1, 6].includes(s.regionId)).length
    expect(data).toHaveLength(expected)
    expect(data[0]).toMatchObject({
      rank: 1, algoCode: 'SFZR002', algoName: '超市自然流量',
      wfBindings: '超市首頁瀑布流(PB002)、超市分類瀑布流(PB004)',
      brand: 'mFood', channel: '超市百貨',
      scope: '算法 SFZR002 · 綁定瀑布流 2 條 · 業務頻道 超市百貨',
      dataNature: '前端演示快照，非真實計分結果',
    })
  })
  it('勾选后只导出所选门店，未勾选导出全量，可一键清空选择', async () => {
    await mount('board', '?algo=SFZR001')
    await waitFor(() => expect(bodyRows()).toHaveLength(20))
    fireEvent.click(within(bodyRows()[0]).getByRole('checkbox'))
    fireEvent.click(within(bodyRows()[1]).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /導出\(2\)/ })).toBeInTheDocument()
    expect(screen.getByText(/已選 2 家，導出僅含所選/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /導出\(2\)/ }))
    expect(exportMock).toHaveBeenCalledTimes(1)
    const selected = exportMock.mock.calls[0][2] as Record<string, unknown>[]
    expect(selected).toHaveLength(2)
    expect(selected.map(row => row.rank)).toEqual([1, 2])
    // 清空选择后回到「不勾选=全量」口径
    fireEvent.click(screen.getByRole('button', { name: /清空選擇/ }))
    expect(screen.queryByRole('button', { name: /導出\(2\)/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /導出/ }))  // 已無勾選，按钮回到「導出」
    const snapshot = getSampleSnapshot()
    const all = exportMock.mock.calls[1][2] as Record<string, unknown>[]
    expect(all).toHaveLength(snapshot.stores.filter(s => s.totalScore != null).length)
  })
  it('無導出權限時不顯示導出按鈕，字段設置仍可用', async () => {
    permissions.export = false
    await mount('board', '?algo=SFZR002')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /導出/ })).toBeNull()
    expect(document.querySelector('.table-column-config-btn')).toBeTruthy()
  })
  it('字段設置保存後列顯隱與順序立即生效', async () => {
    // 用户配置：隱藏業務頻道，並把綜合得分提到排名第二
    localStorage.setItem('table-config-merchant-score-insight', JSON.stringify([
      { key: 'rank', title: '排名', visible: true, locked: 'head' },
      { key: 'total', title: '綜合得分', visible: true, locked: null },
      { key: 'algo', title: '算法ID/名稱', visible: true, locked: null },
      { key: 'merchantIdName', title: '集團ID/名稱', visible: true, locked: null },
      { key: 'storeIdName', title: '門店ID/名稱', visible: true, locked: null },
      { key: 'brand', title: '所屬品牌', visible: true, locked: null },
      { key: 'channel', title: '業務頻道', visible: false, locked: null },
      { key: 'region', title: '運營商圈', visible: true, locked: null },
      { key: 'commercial', title: '商業維度分', visible: true, locked: null },
      { key: 'storeScore', title: '店鋪維度分', visible: true, locked: null },
      { key: 'platform', title: '平台維度分', visible: true, locked: null },
      { key: 'wfBindings', title: '綁定瀑布流', visible: true, locked: null },
      { key: 'action', title: '操作', visible: true, locked: 'tail' },
    ]))
    await mount('board', '?algo=SFZR002')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    const headers = Array.from(document.querySelectorAll('.ant-table-thead th')).map(th => th.textContent?.trim())
    expect(headers).toEqual(['', '排名', '綜合得分', '算法ID/名稱', '集團ID/名稱', '門店ID/名稱', '所屬品牌', '運營商圈', '商業維度分', '店鋪維度分', '平台維度分', '綁定瀑布流', '操作'])
  })
  it('排名按筛选结果从1连续编号，展示三个维度的得分与名次徽章', async () => {
    await mount('board', '?algo=SFZR001')
    await waitFor(() => expect(bodyRows()).toHaveLength(20))
    const first = bodyRows()[0]
    expect(within(first).getByText('1')).toBeInTheDocument()
    expect(within(first).getByText('DEMO-001')).toBeInTheDocument()
    const scoreCells = first.querySelectorAll('td')
    // 13 列中第 9~12 列为三个维度分与综合得分
    for (const index of [8, 9, 10, 11]) expect(scoreCells[index].textContent).toMatch(/^\d+\.\d{2}$/)
    expect(within(bodyRows()[1]).getByText('2')).toBeInTheDocument()
    expect(bodyRows()[0].querySelector('.organic__rank-medal--gold')).toBeTruthy()
    expect(bodyRows()[1].querySelector('.organic__rank-medal--silver')).toBeTruthy()
    expect(bodyRows()[2].querySelector('.organic__rank-medal--bronze')).toBeTruthy()
    expect(bodyRows()[9].querySelector('.organic__rank-pill')).toBeTruthy()
    expect(bodyRows()[10].querySelector('.organic__rank-medal, .organic__rank-pill')).toBeNull()
    const snapshot = getSampleSnapshot()
    const ranked = snapshot.stores.filter(s => s.totalScore != null)
    expect(screen.getByText(`共 ${ranked.length} 家參排名門店`)).toBeInTheDocument()
  })
  it('区域筛选只收窄榜单并重置名次，不出现非本区域门店', async () => {
    const snapshot = getSampleSnapshot()
    const expected = snapshot.stores.filter(s => s.totalScore != null && [1, 6].includes(s.regionId))
    await mount('board', '?algo=SFZR001&regions=1,6')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    expect(screen.getByText(`共 ${expected.length} 家參排名門店`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    await waitFor(() => expect(routeParam('regions')).toBe('1,6'))
    expect(bodyRows()[0].textContent).toContain(expected[0].storeId)
  })
  it('门店下拉筛选按ID精确收窄并重新编号，重置后回到必选引导', async () => {
    await mount('board', '?algo=SFZR001&store=DEMO-003')
    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(within(bodyRows()[0]).getByText('DEMO-003')).toBeInTheDocument()
    expect(within(bodyRows()[0]).getByText('1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
    await waitFor(() => expect(bodyRows()).toHaveLength(0))
    expect(screen.getByText('請先選擇自然流量算法後再查看排名')).toBeInTheDocument()
    expect(routeParam('store')).toBeNull()
  })
  it('集团下拉筛选按ID精确收窄', async () => {
    await mount('board', '?algo=SFZR001&merchant=GROUP-3')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    for (const row of bodyRows()) expect(row.textContent).toContain('GROUP-3')
  })
  it('名次區間先重新編號再收窄', async () => {
    await mount('board', '?algo=SFZR002&rankMin=2&rankMax=3')
    await waitFor(() => expect(bodyRows()).toHaveLength(2))
    expect(within(bodyRows()[0]).getByText('2')).toBeInTheDocument()
    expect(within(bodyRows()[1]).getByText('3')).toBeInTheDocument()
  })
  it('詳情展示三个维度得分与逐项原因，返回后保留区域筛选', async () => {
    await mount('board', '?algo=SFZR001&regions=1,6')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: '詳情' })[0])
    expect(await screen.findByRole('heading', { name: '門店計分詳情' })).toBeInTheDocument()
    expect(screen.getByText('綜合得分＝商業維度＋店鋪維度＋平台維度')).toBeInTheDocument()
    expect(screen.getAllByText('商業維度').length).toBeGreaterThan(0)
    expect(screen.getAllByText('店鋪維度').length).toBeGreaterThan(0)
    expect(screen.getAllByText('平台維度').length).toBeGreaterThan(0)
    // 逐項得分改为维度页签（无全部维度），默认只展示当前维度的 1 张规则表
    expect(screen.getAllByRole('table')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /返\s*回/ }))
    expect(await screen.findByRole('combobox', { name: '門店ID/名稱' })).toBeInTheDocument()
    expect(routeParam('regions')).toBe('1,6')
  })
  it('展开券类计分项可核对子项与业务指标，未得分项在展开行给出原因', async () => {
    await mount('board', '?view=detail&storeId=DEMO-090')
    await screen.findByRole('heading', { name: '門店計分詳情' })
    // 原因列已移除，未得分原因改为展开行内的「匹配原因」描述
    const missedRow = bodyRows().find(row => row.textContent?.includes('COM_05'))!
    fireEvent.click(missedRow.querySelector('.ant-table-row-expand-icon')!)
    expect(await screen.findByText('樣例門店未報名收藏送券')).toBeInTheDocument()
    const couponRow = bodyRows().find(row => row.textContent?.includes('COM_03'))!
    fireEvent.click(couponRow.querySelector('.ant-table-row-expand-icon')!)
    const evidence = document.querySelector<HTMLElement>('.organic__rule-evidence')!
    expect(within(evidence).getByText('報名分').parentElement).toHaveTextContent('+10.00')
    // 资料依据块已删除，子项卡内展示算法库命中梯度与公式；活动匹配梯度渲染为金额而非参数名
    expect(within(evidence).getByText('滿25減10')).toBeInTheDocument()
    expect(within(evidence).getByText('使用門檻 ÷ 門店客單價 = 25 ÷ 50 = 0.5倍 → 命中#2梯度 (+16)')).toBeInTheDocument()
    expect(within(evidence).getByText('本項合計 56.00 分')).toBeInTheDocument()
    expect(within(evidence).queryByText('資料依據')).toBeNull()
  })
  it('资料不全门店不给总分和名次，只展示已知分项', async () => {
    await mount('board', '?view=detail&storeId=DEMO-109')
    expect((await screen.findAllByText(/缺少可信門店座標，完整計分尚未就緒/)).length).toBeGreaterThan(0)
    expect(document.querySelector('.organic__total-box')).toHaveTextContent('—')
    expect(screen.queryByText('第0名')).not.toBeInTheDocument()
  })
  it('无查看权限时不展示排名列表', async () => {
    permissions.view = false
    await mount()
    expect(screen.getByText('沒有查看權限')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('定位模拟交互', () => {
  it('任意手填坐标立即隐藏B结果，应用后明确待接入，重置恢复', async () => {
    await mount('simulation')
    expect(screen.getByRole('heading', { name: '定位排名模擬' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /導出演示對比/ })).toBeEnabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: '經度 lng' }), { target: { value: '113.56' } })
    expect(await screen.findByText('B點已更改，結果尚未更新')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /導出演示對比/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /應用位置/ }))
    expect(screen.getByText('該位置待接入真實試算')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重置A/B點' }))
    expect(screen.queryByText('該位置待接入真實試算')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /導出演示對比/ })).toBeEnabled()
  })
  it('地图选点与输入框同步；越界无法应用', async () => {
    await mount('simulation')
    fireEvent.click(await screen.findByRole('button', { name: '地圖點選新位置' }))
    expect(screen.getByRole('spinbutton', { name: '緯度 lat' })).toHaveValue('22.1800')
    fireEvent.change(screen.getByRole('spinbutton', { name: '緯度 lat' }), { target: { value: '91' } })
    fireEvent.click(screen.getByRole('button', { name: /應用位置/ }))
    expect(screen.getByText('緯度須為 -90～90，經度須為 -180～180')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /將此位置設為A點/ })).toBeDisabled()
  })
  it('切完整场景显示资格变化；切回单因素恢复', async () => {
    await mount('simulation', '?storeId=DEMO-108')
    fireEvent.change(screen.getByLabelText('對比門店搜尋'), { target: { value: 'DEMO-108' } })
    fireEvent.click(screen.getByText('完整場景'))
    await waitFor(() => expect(screen.getAllByText('退出').length).toBeGreaterThan(0))
    const notes = Array.from(document.querySelectorAll<HTMLElement>('.organic__deduction-note')).map(el => el.textContent)
    expect(notes.some(text => text?.includes('ranked → filtered'))).toBe(true)
    fireEvent.click(screen.getByText('僅距離變化'))
    expect(screen.queryByText('退出')).not.toBeInTheDocument()
  })
  it('距离模式仅改变PLT_01，不把其他分项变化混入结果', async () => {
    await mount('simulation', '?storeId=DEMO-001&scene=normal')
    const row = screen.getByRole('row', { name: /DEMO-001/ })
    expect(within(row).getByText('距離衰減（PLT_01）')).toBeInTheDocument()
    expect(within(row).queryByText(/配送範圍/)).not.toBeInTheDocument()
    expect(within(row).queryByText(/資格變化/)).not.toBeInTheDocument()
  })
})
