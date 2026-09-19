import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * 侧边栏菜单真值来源回归测试。
 *
 * 业务规则：后端停服时只展示尚未对接后端业务接口的菜单。
 * - 菜单名称/层级唯一真值源是后端 /api/menus/tree；
 * - 前端只保留「完全未接入后端 API 的离线菜单」(src/constants/offlineMenus.ts)，
 *   后端树可用时它只能补挂 DB 完全缺失的项，且绝不覆盖 DB 名称；
 * - 后端不可用时只渲染离线菜单并显示提示条。
 */
vi.mock('../api/menu', () => ({
  fetchMenuTree: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ hasMenuPermission: () => true }),
}))

// 语言映射依赖 i18next 实例，测试里固定为「原样返回 DB 名称」
vi.mock('../i18n/menuNameEn', () => ({
  translateMenuName: (_menuKey: string, zhName: string) => zhName,
}))

import { fetchMenuTree } from '../api/menu'
import Sidebar from './Sidebar'

const mockTree = (menus: unknown[]) => {
  vi.mocked(fetchMenuTree).mockResolvedValue(menus as never)
}

const renderSidebar = () => render(
  <MemoryRouter>
    <Sidebar collapsed={false} />
  </MemoryRouter>,
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Sidebar 菜单真值来源', () => {
  it('后端菜单树可用时：名称以 DB 为准，本地离线快照不得覆盖 DB 名称', async () => {
    mockTree([{
      menuKey: 'search',
      name: '搜索管理（DB名）',
      type: 1,
      status: 1,
      sort: 5,
      children: [{ menuKey: 'word-segmentation', name: '分詞詞庫', type: 2, status: 1, sort: 1 }],
    }])

    renderSidebar()

    await waitFor(() => expect(screen.getByText('搜索管理（DB名）')).toBeInTheDocument())
    // 展开子菜单：叶子菜单名同样以 DB 为准
    fireEvent.click(screen.getByText('搜索管理（DB名）'))
    await waitFor(() => expect(screen.getByText('分詞詞庫')).toBeInTheDocument())
  })

  it('后端菜单树可用时：已对接后端的菜单不来自本地副本（DB 缺失的顶级菜单不显示）', async () => {
    mockTree([{ menuKey: 'search', name: '搜索管理', type: 1, status: 1, sort: 5 }])

    renderSidebar()

    await waitFor(() => expect(screen.getByText('搜索管理')).toBeInTheDocument())
    // 「商戶集團管理」「團購管理」等已对接后端的菜单在 DB 未返回时不得由本地副本冒出
    expect(screen.queryByText('商戶集團管理')).not.toBeInTheDocument()
    expect(screen.queryByText('團購管理')).not.toBeInTheDocument()
  })

  it('后端菜单树不可用时：只渲染离线菜单，并显示离线提示条', async () => {
    mockTree([])

    const { container } = renderSidebar()

    // 离线清单内的顶级菜单（搜索管理：完全未接后端 API）照常展示
    await waitFor(() => expect(screen.getByText('搜索管理')).toBeInTheDocument())
    // 已对接后端的模块不展示
    expect(screen.queryByText('商戶集團管理')).not.toBeInTheDocument()
    expect(screen.queryByText('團購管理')).not.toBeInTheDocument()
    expect(screen.queryByText('物資管理')).not.toBeInTheDocument()
    expect(screen.queryByText('財務管理')).not.toBeInTheDocument()
    expect(container.querySelector('.sidebar-offline-tip')).toBeInTheDocument()
  })
})
