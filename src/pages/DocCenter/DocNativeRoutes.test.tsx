import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import i18n from '@/i18n'
import request from '@/api/request'
import { docNativeDetailPath, fetchDocNativePage, fetchDocNativeView, formatDocNativeTime, parseDocNativeLink, buildDocNativeManifest, fetchDocNativeAcl, fetchDocNativeGrants, issueDocNativeGrant } from '@/api/docNative'
import type { DocNativeView } from '@/api/docNative'
import DocPlans from './DocPlans'
import DocPlanDetail from './DocPlanDetail'
import DocGovernance from './DocGovernance'

vi.mock('@/api/request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => false }) }))
const get = vi.mocked(request.get)
const post = request.post as unknown as ReturnType<typeof vi.fn>
const computedStyle = window.getComputedStyle

function view(id = 41, revisionId = 83): DocNativeView {
  return {
    document: { nodeId: id, documentNo: `PLAN-2026-${id}`, spaceId: 3, spaceName: '測試空間', ownerName: '測試負責人',
      draftRevisionId: revisionId, effectiveRevisionId: null, adoptedRevisionId: null, version: 1,
      lifecycle: 1, executionStatus: 1, updatedAt: 1792720800000, createdAt: 1792720800000, deletedAt: null },
    revision: { id: revisionId, nodeId: id, revisionNo: 1, title: `固定修訂 ${revisionId}`, summary: '測試摘要',
      markdown: `# 正文 ${revisionId}\n<img src="https://example.invalid/image" onerror="alert(1)">`,
      contentHash: 'a'.repeat(64), createdAt: 1792720800000, createdByUserId: 1, systemCode: 'doc', menuKey: 'doc-plans' },
  }
}

function NextVersion() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/doc-plans/detail?id=42&revision=84')}>切換版本</button>
}
function mount(path = '/doc-plans/detail?id=41&revision=83') {
  return render(<I18nextProvider i18n={i18n}><ConfigProvider theme={{ token: { motion: false } }} button={{ autoInsertSpace: false }}>
    <MemoryRouter initialEntries={[path]}><NextVersion /><Routes>
      <Route path="/doc-plans" element={<DocPlans />} />
      <Route path="/doc-plans/detail" element={<DocPlanDetail />} />
      <Route path="/doc-governance" element={<DocGovernance />} />
    </Routes></MemoryRouter>
  </ConfigProvider></I18nextProvider>)
}

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await i18n.changeLanguage('zh-TW')
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => computedStyle(element))
})
afterEach(() => vi.restoreAllMocks())

describe('Doc Native 回执链接与响应契约', () => {
  it('保存回执路径可以解析回精确文档和版本', () => {
    expect(docNativeDetailPath(41, 83)).toBe('/doc-plans/detail?id=41&revision=83')
    expect(parseDocNativeLink('?id=41&revision=83')).toEqual({ id: 41, revisionId: 83 })
    expect(parseDocNativeLink('?id=41')).toEqual({ id: 41 })
  })
  it.each(['', '?id=-1', '?id=0', '?id=1e2', '?id=9007199254740993', '?id=41&revision=',
    '?id=41&revision=bad', '?id=41&revision=0', '?id=41&revision=83&revision=84', '?id=41&id=42'])('拒绝非法链接 %s，不退回当前版本', search => {
    expect(parseDocNativeLink(search)).toBeNull()
  })
  it('固定版本只调用 v2 固定修订端点', async () => {
    get.mockResolvedValueOnce(view())
    await expect(fetchDocNativeView(41, 83)).resolves.toMatchObject(view())
    expect(get).toHaveBeenCalledExactlyOnceWith('/doc/v2/documents/41/revisions/83')
  })
  it('兼容 Jackson non_null 与毫秒时间戳，列表可以省略正文', async () => {
    const payload: unknown = JSON.parse(JSON.stringify(view(), (_key, value) => value === null ? undefined : value))
    get.mockResolvedValueOnce(payload)
    await expect(fetchDocNativeView(41, 83)).resolves.toMatchObject(payload as object)
    const listView = { ...view(), revision: { ...view().revision, markdown: undefined } }
    get.mockResolvedValueOnce({ records: [listView], total: 1, page: 1, size: 20 })
    await expect(fetchDocNativePage({ keyword: '', view: 'effective', page: 1, size: 20 })).resolves.toMatchObject({ total: 1 })
    expect(formatDocNativeTime(1792720800000)).toMatch(/^2026-10-23 \d{2}:\d{2}:\d{2}$/)
    expect(formatDocNativeTime(undefined)).toBe('—')
  })
  it('无指定版本时由后端选择授权版本', async () => {
    get.mockResolvedValueOnce(view())
    await fetchDocNativeView(41)
    expect(get).toHaveBeenCalledExactlyOnceWith('/doc/v2/documents/41')
  })
  it.each([view(42, 83), view(41, 84), { ...view(), revision: { ...view().revision, nodeId: 42 } },
    { ...view(), revision: { ...view().revision, markdown: null } }, null])('拒绝错文档、错版本及缺失正文的响应', async payload => {
    get.mockResolvedValueOnce(payload)
    await expect(fetchDocNativeView(41, 83)).rejects.toThrow('契約')
    expect(get).toHaveBeenCalledTimes(1)
  })
  it('导出清单只含编号、版本、关系与 hash，不带正文与敏感元数据', () => {
    const manifest = buildDocNativeManifest({
      ...view(),
      revisions: [view().revision],
      allowedActions: ['read', 'edit'],
      confirmations: [{ id: 5, revisionId: 83, reviewerUserId: 7, status: 2 }],
      handoffs: [],
    })
    const text = JSON.stringify(manifest)
    expect(manifest.document.documentNo).toBe('PLAN-2026-41')
    expect(manifest.revision.contentHash).toBe('a'.repeat(64))
    expect(manifest.confirmations[0].status).toBe(2)
    expect(text).not.toContain('正文')
    expect(text).not.toContain('docint_')
    expect(text).not.toContain('restricted')
    expect(text).not.toContain('audit')
  })
  it('收窄授权与凭据清单按契约校验', async () => {
    get.mockResolvedValueOnce({ restricted: true, members: [{ userId: 8, name: '甲', permissions: 3 }] })
    await expect(fetchDocNativeAcl(41)).resolves.toMatchObject({ restricted: true })
    get.mockResolvedValueOnce({ restricted: true, members: [{ userId: 8, name: '甲', permissions: 15 }] })
    await expect(fetchDocNativeAcl(41)).rejects.toThrow('契約')
    get.mockResolvedValueOnce([{ id: 1, spaceId: 3, name: '憑據', canWrite: true }])
    await expect(fetchDocNativeGrants()).resolves.toHaveLength(1)
    get.mockResolvedValueOnce([{ id: 1, spaceId: 3, canWrite: true }])
    await expect(fetchDocNativeGrants()).rejects.toThrow('契約')
  })
  it('签发凭据只接受 docint_ 前缀的一次性明文', async () => {
    post.mockResolvedValueOnce({ id: 1, token: `docint_${'x'.repeat(43)}` })
    await expect(issueDocNativeGrant({ spaceId: 3, name: 'IDE', canWrite: false, days: 7 }))
      .resolves.toMatchObject({ id: 1 })
    expect(post).toHaveBeenCalledWith('/doc/v2/grants', { spaceId: 3, name: 'IDE', canWrite: false, days: 7 })
    post.mockResolvedValueOnce({ id: 1, token: 'bad' })
    await expect(issueDocNativeGrant({ spaceId: 3, name: 'IDE', canWrite: false, days: 7 })).rejects.toThrow('契約')
  })
  it('分页原样使用服务端计数，不把坏响应当空列表', async () => {
    const query = { keyword: '原生', view: 'drafts' as const, page: 2, size: 20 }
    const page = { records: [view()], total: 31, page: 2, size: 20 }
    get.mockResolvedValueOnce(page)
    await expect(fetchDocNativePage(query)).resolves.toEqual(page)
    expect(get).toHaveBeenCalledWith('/doc/v2/documents', { params: query })
    get.mockResolvedValueOnce({ records: [], total: '31', page: 2, size: 20 })
    await expect(fetchDocNativePage(query)).rejects.toThrow('契約')
  })
})

describe('Doc Native 真实只读页面', () => {
  it('显示服务端固定版本、校验值与纯文本正文，不执行 HTML 或加载远程图片', async () => {
    get.mockResolvedValueOnce(view())
    const { container } = mount()
    expect(await screen.findByText('固定修訂 83')).toBeInTheDocument()
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument()
    expect(screen.getByLabelText('版本原文（Markdown）').textContent).toBe(view().revision.markdown)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('草稿（尚未生效）')).toBeInTheDocument()
    expect(get).toHaveBeenCalledExactlyOnceWith('/doc/v2/documents/41/revisions/83')
  })
  it('非法版本显示链接错误且不发请求', () => {
    mount('/doc-plans/detail?id=41&revision=oops')
    expect(screen.getByText('方案版本連結無效')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })
  it.each([403, 404, 500])('读取失败 %s 显示失败而非 mock，重试仍读取同一版本', async code => {
    get.mockRejectedValueOnce(Object.assign(new Error('不可訪問'), { code })).mockResolvedValueOnce(view())
    mount()
    expect(await screen.findByText('暫時無法讀取原生文檔')).toBeInTheDocument()
    expect(screen.queryByText('固定修訂 83')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }))
    expect(await screen.findByText('固定修訂 83')).toBeInTheDocument()
    expect(get.mock.calls.map(call => call[0])).toEqual(Array(2).fill('/doc/v2/documents/41/revisions/83'))
  })
  it('跨文档切换时晚到响应不能覆盖新版本', async () => {
    let resolveOld!: (value: DocNativeView) => void
    get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    get.mockResolvedValueOnce(view(42, 84))
    mount()
    fireEvent.click(screen.getByRole('button', { name: '切換版本' }))
    expect(await screen.findByText('固定修訂 84')).toBeInTheDocument()
    await act(async () => resolveOld(view()))
    expect(screen.queryByText('固定修訂 83')).not.toBeInTheDocument()
  })
  it('列表读取 v2，查询重置到第一页，行按钮跳到固定版本', async () => {
    get.mockResolvedValue({ records: [view()], total: 1, page: 1, size: 20 })
    mount('/doc-plans')
    expect(await screen.findByText('PLAN-2026-41')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('標題、正文、編號或歷史檔名'), { target: { value: ' 原生 ' } })
    fireEvent.click(screen.getByRole('button', { name: /查詢/ }))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/doc/v2/documents', { params: { keyword: '原生', view: 'effective', page: 1, size: 20 } }))
    get.mockResolvedValueOnce(view())
    fireEvent.click(screen.getByRole('button', { name: '查看版本' }))
    expect(await screen.findByLabelText('版本原文（Markdown）')).toBeInTheDocument()
    expect(get).toHaveBeenLastCalledWith('/doc/v2/documents/41/revisions/83')
  })
  it('治理入口读取空间与凭据，不自动签发', async () => {
    get.mockResolvedValueOnce([{ id: 3, name: '測試空間', permissions: 15 }])
      .mockResolvedValueOnce([])
    mount('/doc-governance')
    expect(await screen.findByText('原生空間與成員治理')).toBeInTheDocument()
    expect(await screen.findByText('測試空間')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/doc/v2/spaces')
    expect(get).toHaveBeenCalledWith('/doc/v2/grants')
  })
})
