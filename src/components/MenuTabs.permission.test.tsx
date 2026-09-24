import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createInstance } from 'i18next'
import zh from '../i18n/locales/zh-TW.json'
import en from '../i18n/locales/en.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MenuTabs from './MenuTabs'

/** 仅 home / asset-list 视为「有权限」；其余受控路由视为无权限（用于验证 403 路由不建标签） */
const allowed = vi.hoisted(() => new Set(['home', 'asset-list']))
/** 稳定引用：避免 t/i18n 每次渲染新建导致 getMenuName 抖动（生产 MenuTabs 依赖其稳定性） */
const i18nStub = createInstance()
await i18nStub.init({ lng: 'zh-TW', resources: { 'zh-TW': { translation: zh }, en: { translation: en } } })

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nStub.t, i18n: { language: i18nStub.language } }),
}))
vi.mock('../contexts/MenuContext', () => ({
  useMenu: () => ({ menuTree: null, status: 'online' }),
}))
// pathToKey 置空：路由→菜单 判定完全走 ROUTE_MENU_KEY_MAP（含本次新纳入受控的采购/基础数据/流水）
vi.mock('./Sidebar', () => ({ pathToKey: {} }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasMenuPermission: (key: string) => allowed.has(key),
  }),
}))

function mountAt(path: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <MenuTabs />
    </MemoryRouter>,
  )
  return container.querySelectorAll('.menu-tab-item').length
}

describe('MenuTabs 权限标签过滤', () => {
  beforeEach(async () => {
    await i18nStub.changeLanguage('zh-TW')
    cleanup()
    localStorage.clear()
    allowed.clear()
    allowed.add('home')
    allowed.add('asset-list')
  })

  it('被守卫拦成 403 的受控路由不创建标签（避免泄漏无权限菜单名）', () => {
    // /asset-supplier、/purchase-order、/consumable-stock-txn 均为新纳入受控、且当前用户无权限
    expect(mountAt('/asset-supplier')).toBe(1)      // 仅首頁
    expect(mountAt('/purchase-order')).toBe(1)
    expect(mountAt('/consumable-stock-txn')).toBe(1)
  })

  it('已授权的受控路由照常创建标签', () => {
    expect(mountAt('/asset-list')).toBe(2)          // 首頁 + 資產台賬
  })

  it('非受控（原型）路由不受权限过滤影响，照常创建标签', () => {
    expect(mountAt('/some-prototype-page')).toBe(2)
  })

  it.each(['/hr-dict', '/hr-dict-edit?type=EMPLOYER_COMPANY&id=1', '/contract-ledger'])(
    '无权限的独立员工功能 %s 不创建标签', path => {
      expect(mountAt(path)).toBe(1)
    },
  )

  it.each([
    ['/hr-dict', 'hr-dict'],
    ['/contract-ledger', 'contract-ledger'],
  ])('已授权的独立菜单 %s 照常创建标签（菜单名线上由后端树提供）', (path, key) => {
    allowed.add(key)
    expect(mountAt(path)).toBe(2)
  })

  it('字典编辑标签保留类型和记录参数', () => {
    allowed.add('hr-dict')
    const path = '/hr-dict-edit?type=EMPLOYER_COMPANY&id=123'
    expect(mountAt(path)).toBe(2)
    expect(screen.getByText('編輯 · 僱主法人')).toBeInTheDocument()
    const tabs = JSON.parse(localStorage.getItem('menu_tabs_history') || '[]') as Array<{ path: string }>
    expect(tabs.some(tab => tab.path === path)).toBe(true)
  })

  it('保存成功关闭当前表单标签并保留其他标签，普通返回不关闭', () => {
    allowed.add('hr-dict')
    const editPath = '/hr-dict-edit?type=WORK_LOCATION&id=123'
    localStorage.setItem('menu_tabs_history', JSON.stringify([
      { path: '/', title: '首頁' }, { path: '/asset-list', title: '資產台賬' },
      { path: '/hr-dict', title: '字典維護' }, { path: editPath, title: '編輯' },
    ]))
    function NavigationProbe() {
      const navigate = useNavigate()
      const location = useLocation()
      return <>
        <button onClick={() => navigate('/hr-dict')}>普通返回</button>
        <button onClick={() => navigate(editPath)}>重新进入</button>
        <button onClick={() => navigate('/hr-dict', { replace: true, state: { closeMenuTab: editPath } })}>模拟保存成功</button>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
      </>
    }
    render(<MemoryRouter initialEntries={[editPath]}><MenuTabs /><NavigationProbe /></MemoryRouter>)
    fireEvent.click(screen.getByText('普通返回'))
    expect(screen.getByText('編輯 · 工作地點')).toBeInTheDocument()
    fireEvent.click(screen.getByText('重新进入'))
    fireEvent.click(screen.getByText('模拟保存成功'))
    expect(screen.queryByText('編輯 · 工作地點')).not.toBeInTheDocument()
    const paths = (JSON.parse(localStorage.getItem('menu_tabs_history') || '[]') as Array<{ path: string }>).map(tab => tab.path)
    expect(paths).toEqual(['/', '/asset-list', '/hr-dict'])
    expect(screen.getByTestId('state')).not.toHaveTextContent('closeMenuTab')
  })

  it('字典表单标签使用当前语言，包括缺少类型参数的默认页', async () => {
    allowed.add('hr-dict')
    await i18nStub.changeLanguage('en')
    mountAt('/hr-dict-edit')
    expect(screen.getByText('Add · Employer Company')).toBeInTheDocument()
  })
})
