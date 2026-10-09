import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal, message } from 'antd'
import i18n from '../../../i18n'
import type { MenuVO } from '../../../api/menu'
import * as menuApi from '../../../api/menu'
import * as roleApi from '../../../api/role'
import * as deptApi from '../../../api/department'
import * as sysApi from '../../../api/systemAuthorization'
import * as centerApi from '../../../api/authorizationCenter'
import PermissionWorkbench from './PermissionWorkbench'

vi.mock('../../../api/menu', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/menu')>(),
  fetchMenuTree: vi.fn(),
}))
vi.mock('../../../api/role', () => ({ fetchRoles: vi.fn() }))
vi.mock('../../../api/department', () => ({ fetchDepartments: vi.fn() }))
vi.mock('../../../api/systemAuthorization', () => ({
  fetchSystemsCatalog: vi.fn(), saveRoleAuthorization: vi.fn(), saveDepartmentAuthorization: vi.fn(),
}))
vi.mock('../../../api/authorizationCenter', () => ({
  fetchRoleOverview: vi.fn(), fetchDepartmentOverview: vi.fn(),
}))
vi.mock('../../../hooks/useSystemNavigation', () => ({ invalidateSystemNavigation: vi.fn() }))
/** 菜单名保持后端原文：本用例只锁「批量授权」两个按钮的可辨识度，不测翻译回退 */
vi.mock('../../../i18n/menuNameEn', () => ({
  translateMenuName: (_menuKey: string, zhName: string) => zhName,
}))

/**
 * 叶子菜单显式带 3 个动作，让「全部權限」与「僅查看」的差异可被断言；
 * 分组目录不给 actions，用于验证目录只会被授予 view。
 */
const MENU_TREE: MenuVO[] = [{
  id: 1, parentId: null, menuKey: 'eam-group', name: '資產運營', type: 1, status: 1, sort: 1, systemCode: 'eam',
  children: [
    { id: 2, parentId: 1, menuKey: 'asset-list', name: '資產台賬', type: 2, status: 1, sort: 1, systemCode: 'eam', path: '/asset-list', actions: ['view', 'create', 'export'] },
  ],
}]

const SYSTEM = { targetType: 'role', targetId: 7, systemCode: 'eam', systemAccess: true, permissions: [], revision: 3 }

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><PermissionWorkbench /></MemoryRouter>
    </I18nextProvider>,
  )
}

/** 选中授权目标后工作台才会载入快照；这里把两步交互收敛成一个前置动作 */
async function mountWithTargetSelected() {
  const view = mount()
  // 菜单树与批量按钮只在「选中授权目标 + 载入该系统快照」后才渲染，顺序不能反
  await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2))
  const targetSelect = screen.getAllByRole('combobox')[1]
  await act(async () => { fireEvent.mouseDown(targetSelect) })
  await act(async () => { fireEvent.click(await screen.findByText('測試角色 (test)')) })
  await waitFor(() => expect(centerApi.fetchRoleOverview).toHaveBeenCalledWith(7))
  await waitFor(() => expect(screen.getByText('資產運營')).toBeInTheDocument())
  return view
}

/**
 * 读取右侧「功能操作」面板里已勾选的动作名。
 * <p>用类名定位而非文本：树节点标题与面板顶部的菜单名是同一串文字，getByText 会撞多个元素。
 */
function checkedActionsInPanel(container: HTMLElement): string[] {
  const panel = container.querySelector('.authz-action-panel')
  expect(panel).not.toBeNull()
  // 排除面板顶部的「本菜單全部功能」全选框：它反映的是聚合状态，不是被授予的具体动作
  return Array.from(panel!.querySelectorAll('.ant-checkbox-wrapper-checked'))
    .map(n => n.textContent?.trim() ?? '')
    .filter(label => label !== '本菜單全部功能')
    .sort()
}

/** 面板顶部「本菜單全部功能」全选框是否处于全选态——深度差异最直观的体现 */
function selectAllBoxChecked(container: HTMLElement): boolean {
  const box = container.querySelector('.authz-action-select-all')
  expect(box).not.toBeNull()
  return !!box!.querySelector('.ant-checkbox-checked')
}

/** 选中树里的某个菜单节点，让右侧面板展示它的动作 */
async function selectTreeNode(container: HTMLElement, title: string) {
  const node = Array.from(container.querySelectorAll('.ant-tree-treenode'))
    .find(n => n.textContent?.includes(title))
  expect(node).toBeDefined()
  await act(async () => { fireEvent.click(node!.querySelector('.ant-tree-title')!) })
}

/** 取某个树节点的勾选框状态 */
function treeCheckboxChecked(container: HTMLElement, title: string): boolean {
  const node = Array.from(container.querySelectorAll('.ant-tree-treenode'))
    .find(n => n.textContent?.includes(title))
  expect(node).toBeDefined()
  return !!node?.querySelector('.ant-tree-checkbox-checked')
}

/**
 * Modal.confirm / message 静态方法渲染到 document.body，不随组件卸载清理；
 * 不销毁的话下一个用例的 findByRole('dialog') 会命中上一个用例残留的弹窗，
 * 点到的「確認授予」是旧闭包里的回调，表现为「点了没反应」的假失败。
 */
afterEach(() => {
  Modal.destroyAll()
  message.destroy()
  // destroyAll 走关闭动画，jsdom 下节点不会立刻消失；不显式摘掉的话，下一个用例
  // findByRole('dialog') 会命中上一个用例的陈旧弹窗，点到旧闭包里的回调，表现为「点了没反应」
  document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-message').forEach(n => n.remove())
})

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  await i18n.changeLanguage('zh-TW')
  vi.mocked(roleApi.fetchRoles).mockResolvedValue([
    { id: 7, name: '測試角色', code: 'test', status: 1, permissions: [], userCount: 2 } as never,
  ])
  vi.mocked(deptApi.fetchDepartments).mockResolvedValue([])
  vi.mocked(sysApi.fetchSystemsCatalog).mockResolvedValue([
    { code: 'eam', name: '物資管理系統', nameEn: 'EAM', sort: 70 },
  ])
  vi.mocked(menuApi.fetchMenuTree).mockResolvedValue(MENU_TREE)
  vi.mocked(centerApi.fetchRoleOverview).mockResolvedValue([SYSTEM])
})

describe('授权中心 · 批量授权两个入口必须可区分', () => {
  it('按钮名称必须自带「权限深度」限定词，不得再出现裸的「全選菜單」', async () => {
    // 批量授权按钮只在选中授权目标、载入该系统快照后才出现
    await mountWithTargetSelected()
    const viewOnly = screen.getByRole('button', { name: /全部菜單 · 僅查看/ })
    const fullAccess = screen.getByRole('button', { name: /全部菜單 · 全部權限/ })
    expect(viewOnly).toBeInTheDocument()
    expect(fullAccess).toBeInTheDocument()
    // 旧文案「全選菜單 / 授予全部功能」让用户以为全选就等于给了全部权限
    expect(screen.queryByRole('button', { name: /^全選菜單$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^授予全部功能$/ })).not.toBeInTheDocument()
    // 单菜单作用域的复选框也必须与顶部批量按钮区分开
    expect(screen.queryByText('全選全部功能')).not.toBeInTheDocument()
  })

  it('「僅查看」也必须先二次确认，且确认框要写明「只给查看」', async () => {
    const { container } = await mountWithTargetSelected()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /全部菜單 · 僅查看/ }))
    })
    const dialog = await screen.findByRole('dialog')
    // 与「全部權限」的确认框必须能一眼区分，否则等于重新制造本次要消除的误解
    expect(within(dialog).getByText('僅「查看」')).toBeInTheDocument()
    expect(within(dialog).getByText('不含新增／編輯／刪除／導入／導出')).toBeInTheDocument()
    // 仅查看侧必须是绿色主词，且绝不能出现「全部功能」这个提权措辞
    expect(dialog.querySelector('.authz-depth-safe')).not.toBeNull()
    expect(dialog.querySelector('.authz-depth-full')).toBeNull()
    expect(within(dialog).queryByText(/全部功能/)).not.toBeInTheDocument()
    // 确认前不得改动草稿
    expect(treeCheckboxChecked(container, '資產台賬')).toBe(false)

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /確認勾選/ }))
    })
    // 叶子菜单被勾上
    await waitFor(() => expect(treeCheckboxChecked(container, '資產台賬')).toBe(true))
    // 选中该菜单后，右侧动作面板只应勾了「查看」——这正是用户误以为「等于给了全部权限」的地方
    await selectTreeNode(container, '資產台賬')
    await waitFor(() => expect(checkedActionsInPanel(container)).toEqual(['查看']))
    // 关键区分点：给了 3 个动作里的 1 个，「本菜單全部功能」不能是全选态
    expect(selectAllBoxChecked(container)).toBe(false)
  })

  it('「全部權限」必须先二次确认，未确认前不得改动草稿', async () => {
    const { container } = await mountWithTargetSelected()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /全部菜單 · 全部權限/ }))
    })
    const dialog = await screen.findByRole('dialog')
    // 确认框必须把真实影响面摊出来（菜单数 / 功能项数 / 权限深度）
    expect(within(dialog).getByText(/影響菜單/)).toBeInTheDocument()
    expect(within(dialog).getByText(/權限深度/)).toBeInTheDocument()
    // 提权侧必须是红色主词 + 灰色动作明细，与「僅查看」的绿色形成对照
    expect(within(dialog).getByText('全部功能')).toBeInTheDocument()
    expect(dialog.querySelector('.authz-depth-full')).not.toBeNull()
    expect(dialog.querySelector('.authz-depth-safe')).toBeNull()
    // 取消前不得静默提权
    expect(treeCheckboxChecked(container, '資產台賬')).toBe(false)

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /取\s*消/ })) })
    // antd Modal 关闭后仍留有隐藏 wrapper，因此断言真实状态而不是断弹窗节点消失
    await waitFor(() => expect(treeCheckboxChecked(container, '資產台賬')).toBe(false))
  })

  it('确认「全部權限」后，叶子菜单授予全部功能、分组目录只授予查看', async () => {
    const { container } = await mountWithTargetSelected()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /全部菜單 · 全部權限/ }))
    })
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /確認授予/ }))
    })

    await waitFor(() => expect(treeCheckboxChecked(container, '資產台賬')).toBe(true))
    await selectTreeNode(container, '資產台賬')
    // 与菜单声明的 actions 一致：view + create + export 全给，这才叫「全部權限」
    await waitFor(() => expect(checkedActionsInPanel(container)).toEqual(['查看', '新增', '導出'].sort()))
    expect(selectAllBoxChecked(container)).toBe(true)
    // 分组目录本身没有可授权功能：它被勾上（授予 view 以进入导航），但面板不给动作复选框，
    // 因此不会被塞进 create/delete 之类噪声动作让审计看起来像越权
    await selectTreeNode(container, '資產運營')
    await waitFor(() => expect(
      within(container as HTMLElement).queryByText(/分組目錄/),
    ).not.toBeNull())
    expect(checkedActionsInPanel(container)).toEqual([])
    expect(treeCheckboxChecked(container, '資產運營')).toBe(true)
  })
})
