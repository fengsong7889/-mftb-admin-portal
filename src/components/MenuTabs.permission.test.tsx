import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MenuTabs from './MenuTabs'

/** 仅 home / asset-list 视为「有权限」；其余受控路由视为无权限（用于验证 403 路由不建标签） */
const allowed = vi.hoisted(() => new Set(['home', 'asset-list']))
/** 稳定引用：避免 t/i18n 每次渲染新建导致 getMenuName 抖动（生产 MenuTabs 依赖其稳定性） */
const i18nStub = vi.hoisted(() => ({ t: (key: string) => key, language: 'zh-TW' }))

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
  beforeEach(() => { localStorage.clear() })

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
})
