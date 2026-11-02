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
import type { Coordinate } from './organic/types'

const permissions = vi.hoisted(() => ({ view: true, export: true }))
const exportMock = vi.hoisted(() => vi.fn())
const algorithmsMock = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasMenuPermission: () => permissions.view, hasPermission: (key: string) => key.endsWith(':export') ? permissions.export : permissions.view }) }))
vi.mock('@/utils/exportCSV', () => ({ exportToCSV: exportMock }))
vi.mock('@/api/adPromotion', () => ({ fetchAdAlgorithms: algorithmsMock }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => (({ 'common.back': '返回', 'recommend.channelDelivery': '美食外賣', 'recommend.channelHome': '大首頁', 'recommend.channelSupermarket': '超市百貨', 'recommend.channelGroupBuy': '團購到店', 'recommend.appShanfeng': '閃蜂', 'recommend.appMfood': 'mFood' }) as Record<string, string>)[key] ?? key }) }))
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
beforeEach(() => {
  permissions.view = true; permissions.export = true
  localStorage.clear(); exportMock.mockClear()
  algorithmsMock.mockReset().mockResolvedValue({ records: [
    { id: 1, algoCode: 'ZRL001', algoName: '自然流量算法甲', algoType: 7, status: 1 },
    { id: 2, algoCode: 'ZRL002', algoName: '自然流量算法乙', algoType: 7, status: 1 },
  ], total: 2 })
})

describe('商家權重分排名', () => {
  it('列表页标准结构：无定制页头，搜索条件与十二列齐全', async () => {
    await mount()
    // 列表设计规范 §E.7：搜索区置顶，不允许 hero 式定制页头；顶部说明横条已按需求移除
    expect(document.querySelector('.organic__header')).toBeNull()
    expect(document.querySelector('.organic__notice')).toBeNull()
    expect(screen.getByRole('combobox', { name: '運營商圈' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '集團ID/名稱' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '門店ID/名稱' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '排名下限' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '所屬品牌' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '業務頻道' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '算法名稱' })).toBeInTheDocument()
    // 算法名称必选且排第一位（红星标记）
    expect(document.querySelector('.organic__filter-grid > label:first-child .organic__label--required')).toBeInTheDocument()
    expect(screen.queryByLabelText('門店搜尋')).not.toBeInTheDocument()
    const headers = Array.from(document.querySelectorAll('.ant-table-thead th')).map(th => th.textContent?.trim())
    expect(headers).toEqual(['排名', '算法ID/名稱', '集團ID/名稱', '門店ID/名稱', '所屬品牌', '業務頻道', '運營商圈', '商業維度分', '店鋪維度分', '平台維度分', '綜合得分', '操作'])
    // 統計卡、圖表、覆蓋矩陣、對比與導出均已移除
    expect(document.querySelector('.organic__stats')).toBeNull()
    expect(screen.queryByText('計分覆蓋')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /導出/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
  it('占比配置已停用：页面不出现占比、加权贡献或维度权重', async () => {
    await mount()
    expect(document.body.textContent).not.toMatch(/占比|加權|權重\s*\d/)
    await mount('board', '?view=detail&storeId=DEMO-090')
    expect(await screen.findByRole('heading', { name: '門店計分詳情' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/占比|加權|權重\s*\d/)
  })
  it('未選算法時不展示榜單，查詢提示必選', async () => {
    await mount()
    expect(bodyRows()).toHaveLength(0)
    expect(screen.getByText('請先選擇算法後再查看排名')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    expect(await screen.findByText('算法名稱為必選條件，請先選擇算法')).toBeInTheDocument()
  })
  it('排名按筛选结果从1连续编号，展示品牌频道与三个维度的得分', async () => {
    await mount('board', '?algo=ZRL001')
    await waitFor(() => expect(bodyRows()).toHaveLength(20))
    const first = bodyRows()[0]
    expect(within(first).getByText('1')).toBeInTheDocument()
    expect(within(first).getByText('DEMO-001')).toBeInTheDocument()
    expect(within(first).getByText('閃蜂')).toBeInTheDocument()
    expect(within(first).getByText('大首頁')).toBeInTheDocument()
    const scoreCells = first.querySelectorAll('td')
    for (const index of [7, 8, 9, 10]) expect(scoreCells[index].textContent).toMatch(/^\d+\.\d{2}$/)
    // 算法库加载后按门店序号轮转归属：DEMO-001 → 第一家算法
    expect(await within(first).findByText('ZRL001')).toBeInTheDocument()
    expect(within(bodyRows()[1]).getByText('2')).toBeInTheDocument()
    // 名次徽章：金银铜奖牌与 4-10 名胶囊，第 11 名起纯数字
    expect(bodyRows()[0].querySelector('.organic__rank-medal--gold')).toBeTruthy()
    expect(bodyRows()[1].querySelector('.organic__rank-medal--silver')).toBeTruthy()
    expect(bodyRows()[2].querySelector('.organic__rank-medal--bronze')).toBeTruthy()
    expect(bodyRows()[9].querySelector('.organic__rank-pill')).toBeTruthy()
    expect(bodyRows()[10].querySelector('.organic__rank-medal, .organic__rank-pill')).toBeNull()
    const snapshot = getSampleSnapshot()
    // 算法必选：ZRL001 按轮转只覆盖奇数序号门店
    const ranked = snapshot.stores.filter(s => s.totalScore != null && Number(s.storeId.slice(-3)) % 2 === 1)
    expect(screen.getByText(`共 ${ranked.length} 家參排名門店`)).toBeInTheDocument()
  })
  it('区域筛选只收窄榜单并重置名次，不出现非本区域门店', async () => {
    const snapshot = getSampleSnapshot()
    const expected = snapshot.stores.filter(s => s.totalScore != null && [1, 6].includes(s.regionId) && Number(s.storeId.slice(-3)) % 2 === 1)
    await mount('board', '?algo=ZRL001&regions=1,6')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    expect(screen.getByText(`共 ${expected.length} 家參排名門店`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    await waitFor(() => expect(routeParam('regions')).toBe('1,6'))
    expect(bodyRows()[0].textContent).toContain(expected[0].storeId)
  })
  it('门店下拉筛选按ID精确收窄并重新编号，重置后回到必选引导', async () => {
    await mount('board', '?algo=ZRL001&store=DEMO-003')
    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(within(bodyRows()[0]).getByText('DEMO-003')).toBeInTheDocument()
    expect(within(bodyRows()[0]).getByText('1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
    await waitFor(() => expect(bodyRows()).toHaveLength(0))
    expect(screen.getByText('請先選擇算法後再查看排名')).toBeInTheDocument()
    expect(routeParam('store')).toBeNull()
  })
  it('集团下拉筛选按ID精确收窄', async () => {
    await mount('board', '?algo=ZRL001&merchant=GROUP-3')
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0))
    for (const row of bodyRows()) expect(row.textContent).toContain('GROUP-3')
  })
  it('品牌筛选与名次区间叠加：先重新编号再按区间收窄', async () => {
    await mount('board', '?algo=ZRL002&brand=2&rankMin=2&rankMax=3')
    await waitFor(() => expect(bodyRows()).toHaveLength(2))
    expect(within(bodyRows()[0]).getByText('DEMO-006')).toBeInTheDocument()
    expect(within(bodyRows()[0]).getByText('2')).toBeInTheDocument()
    for (const row of bodyRows()) expect(within(row).getByText('mFood')).toBeInTheDocument()
  })
  it('算法名称筛选只保留该算法的门店并重新编号', async () => {
    await mount('board', '?algo=ZRL002')
    await waitFor(() => expect(within(bodyRows()[0]).getByText('DEMO-002')).toBeInTheDocument())
    expect(bodyRows()).toHaveLength(20)
    for (const row of bodyRows()) expect(within(row).getByText('ZRL002')).toBeInTheDocument()
    expect(within(bodyRows()[0]).getByText('1')).toBeInTheDocument()
  })
  it('詳情展示三个维度得分与逐项原因，返回后保留区域筛选', async () => {
    await mount('board', '?algo=ZRL001&regions=1,6')
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
