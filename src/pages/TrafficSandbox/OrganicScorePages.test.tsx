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
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasMenuPermission: () => permissions.view, hasPermission: (key: string) => key.endsWith(':export') ? permissions.export : permissions.view }) }))
vi.mock('@/utils/exportCSV', () => ({ exportToCSV: exportMock }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key === 'common.back' ? '返回' : key === 'recommend.channelDelivery' ? '美食外賣' : key }) }))
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
})

describe('商家權重分排名', () => {
  it('只保留區域搜索與排名列表，表格列为规定的八列', async () => {
    await mount()
    expect(screen.getByRole('heading', { name: '商家權重分排名' })).toBeInTheDocument()
    expect(screen.getByText('演示資料 · 未接入門店真實報名與計分')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '運營區域' })).toBeInTheDocument()
    expect(screen.queryByLabelText('門店搜尋')).not.toBeInTheDocument()
    const headers = Array.from(document.querySelectorAll('.ant-table-thead th')).map(th => th.textContent?.trim())
    expect(headers).toEqual(['排名', '門店ID', '門店名稱', '業務頻道', '商業維度分', '店鋪維度分', '平台維度分', '操作'])
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
  it('排名按区域重新从1连续编号，展示三个维度的得分', async () => {
    await mount()
    const first = bodyRows()[0]
    expect(within(first).getByText('1')).toBeInTheDocument()
    expect(within(first).getByText('DEMO-001')).toBeInTheDocument()
    expect(within(first).getByText('美食外賣')).toBeInTheDocument()
    const scoreCells = first.querySelectorAll('td')
    for (const index of [4, 5, 6]) expect(scoreCells[index].textContent).toMatch(/^\d+\.\d{2}$/)
    expect(within(bodyRows()[1]).getByText('2')).toBeInTheDocument()
    const snapshot = getSampleSnapshot()
    const ranked = snapshot.stores.filter(s => s.totalScore != null)
    expect(screen.getByText(`共 ${ranked.length} 家參排名門店`)).toBeInTheDocument()
  })
  it('区域筛选只收窄榜单并重置名次，不出现非本区域门店', async () => {
    const snapshot = getSampleSnapshot()
    const expected = snapshot.stores.filter(s => s.totalScore != null && [1, 6].includes(s.regionId))
    await mount('board', '?regions=1,6')
    expect(screen.getByText(`共 ${expected.length} 家參排名門店`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    await waitFor(() => expect(routeParam('regions')).toBe('1,6'))
    expect(bodyRows()[0].textContent).toContain(expected[0].storeId)
  })
  it('詳情展示三个维度得分与逐项原因，返回后保留区域筛选', async () => {
    await mount('board', '?regions=1,6')
    fireEvent.click(screen.getAllByRole('button', { name: '詳情' })[0])
    expect(await screen.findByRole('heading', { name: '門店計分詳情' })).toBeInTheDocument()
    expect(screen.getByText('綜合得分＝商業維度＋店鋪維度＋平台維度')).toBeInTheDocument()
    expect(screen.getAllByText('商業維度').length).toBeGreaterThan(0)
    expect(screen.getAllByText('店鋪維度').length).toBeGreaterThan(0)
    expect(screen.getAllByText('平台維度').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('table')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /返\s*回/ }))
    expect(await screen.findByRole('heading', { name: '商家權重分排名' })).toBeInTheDocument()
    expect(routeParam('regions')).toBe('1,6')
  })
  it('展开券类计分项可核对子项与业务指标，未得分项给出原因', async () => {
    await mount('board', '?view=detail&storeId=DEMO-090')
    await screen.findByRole('heading', { name: '門店計分詳情' })
    expect(screen.getByText('樣例門店未報名收藏送券')).toBeInTheDocument()
    const couponRow = bodyRows().find(row => row.textContent?.includes('COM_03'))!
    fireEvent.click(couponRow.querySelector('.ant-table-row-expand-icon')!)
    const evidence = document.querySelector<HTMLElement>('.organic__rule-evidence')!
    expect(within(evidence).getByText('報名分').parentElement).toHaveTextContent('+10.00')
    expect(within(evidence).getByText('門店客單價').parentElement).toHaveTextContent('50 MOP')
    expect(within(evidence).getByText('本項合計 56.00 分')).toBeInTheDocument()
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
