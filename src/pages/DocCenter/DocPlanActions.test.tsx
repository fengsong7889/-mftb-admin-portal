import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Modal } from 'antd'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '@/i18n'
import request from '@/api/request'
import DocPlanEdit from './DocPlanEdit'
import DocPlanConfirm from './DocPlanConfirm'
import DocPlanHandoff from './DocPlanHandoff'
import DocPlanDetail from './DocPlanDetail'

vi.mock('@/api/request', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'doc-test', name: '測試人員' }, hasPermission: () => true }),
}))
const get = request.get as unknown as ReturnType<typeof vi.fn>
const post = request.post as unknown as ReturnType<typeof vi.fn>
const realConfirm = Modal.confirm
const computedStyle = window.getComputedStyle

function documentView(overrides: Record<string, unknown> = {}) {
  return {
    document: { nodeId: 41, documentNo: 'PLAN-2026-000041', spaceId: 3, spaceName: '測試空間', ownerUserId: 7,
      ownerName: '測試負責人', draftRevisionId: 83, effectiveRevisionId: 83, adoptedRevisionId: null, version: 1,
      lifecycle: 1, executionStatus: 1, restricted: false, deletedAt: null, updatedAt: 1792720800000,
      ...overrides },
    revision: { id: 83, nodeId: 41, revisionNo: 2, title: '固定修訂 83', summary: '測試摘要',
      markdown: '# 正文', contentHash: 'a'.repeat(64), createdAt: 1792720800000, createdByUserId: 7,
      systemCode: 'doc', menuKey: 'doc-plans', tagsJson: '["標籤"]' },
    revisions: [{ id: 83, nodeId: 41, revisionNo: 2, title: '固定修訂 83', contentHash: 'a'.repeat(64),
      createdByUserId: 7 }],
    allowedActions: ['read', 'edit', 'confirm-request', 'handoff', 'trash', 'restore'],
    confirmations: [], handoffs: [],
  }
}
function mount(path: string, element: ReactNode) {
  return render(<I18nextProvider i18n={i18n}><ConfigProvider theme={{ token: { motion: false } }} button={{ autoInsertSpace: false }}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/doc-plans/edit" element={element} />
        <Route path="/doc-plans/confirm" element={element} />
        <Route path="/doc-plans/handoff" element={element} />
        <Route path="/doc-plans/detail" element={<><DocPlanDetail /><div>DETAIL-PAGE</div></>} />
        <Route path="/doc-plans" element={<div>LIST-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  </ConfigProvider></I18nextProvider>)
}
async function confirmDialog(name: string | RegExp) {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await i18n.changeLanguage('zh-TW')
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => computedStyle(element))
  vi.spyOn(Modal, 'confirm').mockImplementation(options => realConfirm({ ...options, transitionName: '', maskTransitionName: '' }))
})
afterEach(() => { Modal.destroyAll(); vi.restoreAllMocks() })

describe('原生方案写操作页面', () => {
  it('编辑页回填草稿并按固定版本提交，携带幂等键', async () => {
    get.mockImplementation((url: string) => url === '/doc/v2/spaces'
      ? Promise.resolve([{ id: 3, name: '測試空間', permissions: 15 }])
      : Promise.resolve(documentView()))
    post.mockResolvedValue({ documentId: 41, documentNo: 'PLAN-2026-000041', revisionId: 84, contentHash: 'b'.repeat(64), version: 2, versionUrl: '/doc-plans/detail?id=41&revision=84' })
    const { container } = mount('/doc-plans/edit?id=41', <DocPlanEdit />)
    await waitFor(() => expect(screen.getByDisplayValue('固定修訂 83')).toBeInTheDocument())
    const textareas = container.querySelectorAll('textarea')
    fireEvent.change(textareas[0], { target: { value: '# 修改後正文' } })
    fireEvent.change(screen.getByPlaceholderText('簡要說明本次修改原因'), { target: { value: '補充執行批次' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [url, payload, config] = post.mock.calls[0] as [string, Record<string, unknown>, { headers: Record<string, string> }]
    expect(url).toBe('/doc/v2/documents/41/revisions')
    expect(payload).toMatchObject({ spaceId: 3, markdown: '# 修改後正文', changeReason: '補充執行批次', expectedVersion: 1 })
    expect(config.headers['Idempotency-Key']).toMatch(/^revise-/)
    expect(await screen.findByText('DETAIL-PAGE')).toBeInTheDocument()
  })

  it('保存冲突不回退为覆盖，提示重新载入', async () => {
    get.mockImplementation((url: string) => url === '/doc/v2/spaces'
      ? Promise.resolve([{ id: 3, name: '測試空間', permissions: 15 }])
      : Promise.resolve(documentView()))
    post.mockRejectedValue(Object.assign(new Error('內容已更新，請重新載入後再操作'), { code: 409 }))
    mount('/doc-plans/edit?id=41', <DocPlanEdit />)
    await waitFor(() => expect(screen.getByDisplayValue('固定修訂 83')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('簡要說明本次修改原因'), { target: { value: '并发提交' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    expect(await screen.findByText('內容已被他人更新')).toBeInTheDocument()
  })

  it('退回必须填写原因，填写后才调用决策接口', async () => {
    get.mockImplementation((url: string) => url === '/doc/v2/spaces/3/members'
      ? Promise.resolve([{ userId: 7, name: '審核人', empId: 'MF00007', permissions: 15 }])
      : Promise.resolve({ ...documentView({ draftRevisionId: 83, effectiveRevisionId: null }),
        allowedActions: ['read', 'confirm-decision'],
        confirmations: [{ id: 5, revisionId: 83, reviewerUserId: 7, status: 1 }] }))
    post.mockResolvedValue(undefined)
    mount('/doc-plans/confirm?id=41', <DocPlanConfirm />)
    expect(await screen.findByText('待確認')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '退回修改' }))
    expect(await screen.findByText('退回必須填寫原因')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('退回時必須填寫原因'), { target: { value: '缺少回滾方案' } })
    fireEvent.click(screen.getByRole('button', { name: '退回修改' }))
    // 静态 Modal.confirm 不消费 ConfigProvider，antd 会在两个汉字的按钮中间插空格
    await confirmDialog(/確\s*認/)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/doc/v2/confirmations/5/decision',
      { expectedVersion: 1, decision: 'reject', note: '缺少回滾方案' })
  })

  it('接手人可接收绑定固定版本的交接', async () => {
    get.mockImplementation((url: string) => url === '/doc/v2/spaces/3/members'
      ? Promise.resolve([])
      : Promise.resolve({ ...documentView(), allowedActions: ['read', 'handoff'],
        handoffs: [{ id: 9, revisionId: 83, senderUserId: 8, recipientUserId: 7, completedText: '已完成', remainingText: '剩餘', status: 1 }] }))
    post.mockResolvedValue(undefined)
    mount('/doc-plans/handoff?id=41', <DocPlanHandoff />)
    expect(await screen.findByText('剩餘')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '接收' }))
    await confirmDialog(/接\s*收/)
    await waitFor(() => expect(post).toHaveBeenCalledWith('/doc/v2/handoffs/9/accept', { expectedVersion: 1 }))
  })

  it('移入回收站必须填写原因，确认后才提交', async () => {
    get.mockResolvedValue(documentView())
    post.mockResolvedValue(undefined)
    mount('/doc-plans/detail?id=41&revision=83', <DocPlanDetail />)
    expect(await screen.findByLabelText('版本原文（Markdown）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移入回收站' }))
    const trashDialog = await screen.findByRole('dialog')
    expect(trashDialog.textContent).toContain('將方案移入回收站？')
    fireEvent.change(screen.getByPlaceholderText('請填寫移入原因'), { target: { value: '需求已下線' } })
    await confirmDialog('移入回收站')
    await waitFor(() => expect(post).toHaveBeenCalledWith('/doc/v2/documents/41/trash', { expectedVersion: 1, reason: '需求已下線' }))
  })
})
