import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import i18n from '../../i18n'
import zhTW from '../../i18n/locales/zh-TW.json'
import type { MenuVO } from '../../api/menu'
import * as menuApi from '../../api/menu'
import * as systemApi from '../../api/systemAuthorization'
import MenuConfig from './index'

/** 当前登录角色：用例内切换以验证「高级设置/新增」仅超管可见 */
const auth = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'guest' }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: auth.role }, hasMenuPermission: () => true }),
}))
vi.mock('../../hooks/useColumnConfig', () => ({
  useColumnConfig: () => ({ configComponent: null, applyConfig: (value: unknown) => value }),
}))
vi.mock('../../api/menu', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/menu')>(),
  fetchMenuTree: vi.fn(), updateMenu: vi.fn(), updateMenuStatus: vi.fn(),
}))
vi.mock('../../api/systemAuthorization', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/systemAuthorization')>(),
  fetchSystemsCatalog: vi.fn(),
}))

/**
 * 数据库里 sys_system.name 仍是旧写法「HR 系統」，语言包真值是「人力資源系統」。
 * 本用例锁死「以门户为准」的取名口径：界面必须显示语言包名称。
 */
const SYSTEMS = [
  { code: 'hr', name: 'HR 系統', nameEn: 'Human Resources', sort: 60 },
  { code: 'eam', name: '物資管理系統', nameEn: 'EAM', sort: 70 },
]

const MENU_TREE: MenuVO[] = [
  {
    id: 48, parentId: null, menuKey: 'hr', name: '集團人事(HR)', nameEn: 'Group HR',
    type: 1, sort: 9, status: 1, systemCode: 'hr',
    children: [
      {
        id: 1084, parentId: 48, menuKey: 'hr-lifecycle', name: '入轉調離', nameEn: 'Lifecycle',
        type: 1, sort: 1, status: 1, systemCode: 'hr',
        children: [
          {
            id: 30, parentId: 1084, menuKey: 'employee-management', name: '員工管理', nameEn: 'Employees',
            path: '/employee-management', type: 2, sort: 1, status: 1, systemCode: 'hr', actions: ['view', 'edit'],
          },
        ],
      },
    ],
  },
  {
    id: 222, parentId: null, menuKey: 'asset-management', name: '物資管理', nameEn: 'Material Management',
    type: 1, sort: 14, status: 1, systemCode: 'eam',
  },
]

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConfigProvider theme={{ token: { colorPrimary: '#E8720C' } }}>
        <MemoryRouter initialEntries={['/menu-config']}>
          <MenuConfig />
        </MemoryRouter>
      </ConfigProvider>
    </I18nextProvider>,
  )
}

/** 展开树形表格中所有可展开行（antd 展开图标无稳定文案，按类名驱动） */
async function expandAllRows(container: HTMLElement) {
  for (let round = 0; round < 3; round += 1) {
    const collapsed = Array.from(container.querySelectorAll('.ant-table-row-expand-icon-collapsed')) as HTMLElement[]
    if (collapsed.length === 0) return
    for (const button of collapsed) {
      await act(async () => { fireEvent.click(button) })
    }
  }
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  auth.role = 'admin'
  await i18n.changeLanguage('zh-TW')
  vi.mocked(systemApi.fetchSystemsCatalog).mockResolvedValue(SYSTEMS)
  vi.mocked(menuApi.fetchMenuTree).mockResolvedValue(MENU_TREE)
  vi.mocked(menuApi.updateMenu).mockResolvedValue(MENU_TREE[0])
})

describe('菜单配置 · 系统名称统一', () => {
  it('左侧系统列表按门户口径取名，不直接显示 sys_system.name 原文', async () => {
    const { baseElement } = mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())
    const names = Array.from(baseElement.querySelectorAll('.menucfg-sys-name')).map(node => node.textContent)
    expect(names).toEqual(['人力資源系統', '物資管理系統'])
    expect(names).not.toContain('HR 系統')
  })
})

describe('菜单配置 · 任意层级菜单都可改名', () => {
  /** 平台只锁左侧系统名称，右侧菜单不限层级 */
  it('一级菜单与叶子菜单都能进入行内编辑，保存时原样保留结构字段', async () => {
    const { baseElement } = mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())

    // 一级菜单（系统入口目录）不再锁定，编辑按钮可用
    const topRow = screen.getByText('集團人事(HR)').closest('tr') as HTMLElement
    const topEdit = within(topRow).getByRole('button', { name: /編\s*輯/ })
    expect(topEdit).not.toBeDisabled()

    // 展开两级后编辑叶子菜单
    await expandAllRows(baseElement)
    const leafRow = (await screen.findByText('員工管理')).closest('tr') as HTMLElement
    await act(async () => { fireEvent.click(within(leafRow).getByRole('button', { name: /編\s*輯/ })) })
    const nameInput = within(leafRow).getByPlaceholderText(zhTW.menuConfig.namePlaceholder) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '員工檔案' } })
    await act(async () => { fireEvent.click(within(leafRow).getByRole('button', { name: /保\s*存/ })) })

    await waitFor(() => expect(menuApi.updateMenu).toHaveBeenCalled())
    const [id, payload] = vi.mocked(menuApi.updateMenu).mock.calls[0]
    expect(id).toBe(30)
    // 名称改了，但 Key/路径/类型/actions 必须原样回传，否则存量授权会被结构字段清空波及
    expect(payload).toMatchObject({
      menuKey: 'employee-management',
      path: '/employee-management',
      type: 2,
      parentId: 1084,
      actions: ['view', 'edit'],
      name: '員工檔案',
    })
  })

  it('系统名称在页面上没有任何可编辑入口', async () => {
    const { baseElement } = mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())
    // 系统列表项不是输入框/按钮，只能点击选中
    expect(baseElement.querySelector('.menucfg-sys-panel input')).toBeNull()
    expect(baseElement.querySelector('.menucfg-sys-panel button')).toBeNull()
  })
})

describe('菜单配置 · 结构变更仅超管', () => {
  it('超管可见高级设置与新增入口，普通管理员不可见', async () => {
    const { unmount } = mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '高級設置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新\s*增/ })).toBeInTheDocument()
    unmount()

    auth.role = 'guest'
    mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '高級設置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新\s*增/ })).not.toBeInTheDocument()
  })
})

describe('菜单配置 · 按系统裁剪', () => {
  it('切换系统后只展示该系统的菜单树', async () => {
    const { baseElement } = mount()
    await waitFor(() => expect(screen.getByText('集團人事(HR)')).toBeInTheDocument())
    const eamItem = Array.from(baseElement.querySelectorAll('.menucfg-sys-item'))
      .find(node => node.textContent?.includes('物資管理系統')) as HTMLElement
    await act(async () => { fireEvent.click(eamItem) })
    await waitFor(() => expect(screen.getByText('物資管理')).toBeInTheDocument())
    expect(screen.queryByText('集團人事(HR)')).not.toBeInTheDocument()
    expect(screen.queryByText('員工管理')).not.toBeInTheDocument()
  })
})
