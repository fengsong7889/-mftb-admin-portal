/**
 * 菜单权限路由守卫测试（重点是「任一菜单即可」豁免表）
 *
 * 钉死三件事：
 *  1. /approval-detail 是所有审批类型共用的落地页，历史上只认财务的 approval-center，
 *     导致申请人从「流程事項」点自己单据的详情会被 403；现在持有 oa-requests 也应放行；
 *  2. 豁免只对声明过的路由生效，别的受控路由（如 /role-management）仍严格按主菜单判定，
 *     防止这张表被当成"后门"放宽整个权限模型；
 *  3. 两个菜单都没有时仍然 403——放宽的是"跨业务可见"，不是把详情页变成公开页。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import zh from '../i18n/locales/zh-TW.json'
import MenuPermissionGuard from './MenuPermissionGuard'

const mockAuth = { user: { role: 'guest' }, hasMenuPermission: vi.fn() }
const mockMenu = { status: 'online' }
beforeEach(() => { mockMenu.status = 'online' })

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}))
vi.mock('../contexts/MenuContext', () => ({
  useMenu: () => mockMenu,
}))

function mount(path: string, granted: string[]) {
  mockAuth.hasMenuPermission = vi.fn((key?: string) => !!key && granted.includes(key))
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <MenuPermissionGuard>
          <div>page-body</div>
        </MenuPermissionGuard>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('Doc Native 路由权限与离线门禁', () => {
  it('仅持方案权限即可打开回执详情', () => {
    mount('/doc-plans/detail?id=41&revision=83', ['doc-plans'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })
  it('知识库详情复用文档库权限，分类治理复用治理菜单权限', () => {
    mount('/doc-center/knowledge?id=41', ['doc-library'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
    cleanup()
    mount('/doc-governance/taxonomy', ['doc-governance'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
    cleanup()
    mount('/doc-governance/clearance', ['doc-governance'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
    cleanup()
    mount('/doc-center/my-acks', ['doc-library'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })
  it.each(['/doc-plans', '/doc-plans/detail?id=41&revision=83', '/doc-governance'])('无对应权限不能访问 %s', path => {
    mount(path, ['doc-library'])
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.queryByText('page-body')).not.toBeInTheDocument()
  })
  it.each(['/doc-plans', '/doc-plans/detail?id=41&revision=83', '/doc-governance'])('离线时阻断 %s，不放行演示数据', path => {
    mockMenu.status = 'offline'
    mount(path, ['doc-plans', 'doc-governance'])
    expect(screen.getByText('503')).toBeInTheDocument()
    expect(screen.queryByText('page-body')).not.toBeInTheDocument()
  })
})

describe('MenuPermissionGuard：跨业务共用页的任一菜单豁免', () => {
  it('审批详情页：只有 OA 流程事項权限（申请人/审批人）也能进入', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/approval-detail', ['oa-requests'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })

  it('审批详情页：只有财务审批中心权限也能进入（原口径不回退）', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/approval-detail', ['approval-center'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })

  it('审批详情页：两个菜单都没有时仍然 403', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/approval-detail', ['role-management'])
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByText(zh.guard['403Sub'])).toBeInTheDocument()
    expect(screen.queryByText('page-body')).not.toBeInTheDocument()
  })

  it('豁免表不作用于其他路由：无 employee-management 仍 403', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/employee-management', ['oa-requests'])
    expect(screen.getByText('403')).toBeInTheDocument()
  })

  it('非受控路由不受影响：未登记的路径直接放行', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/system-access-apply', [])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })

  it('移动端日报页：项目经理只有需求菜单（无推送配置权）也能打开钉钉链接', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/rdm-daily', ['rdm-requirement'])
    expect(screen.getByText('page-body')).toBeInTheDocument()
  })

  it('移动端日报页：没有任何 RDM 菜单时仍然 403（豁免不等于公开）', async () => {
    await i18n.changeLanguage('zh-TW')
    mount('/rdm-daily', ['role-management'])
    expect(screen.getByText('403')).toBeInTheDocument()
  })
})
