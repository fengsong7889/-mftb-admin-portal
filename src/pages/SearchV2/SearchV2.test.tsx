import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Modal } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsavedChangesProvider, UnsavedNavigationGuard } from '@/contexts/UnsavedChangesContext'
import SearchV2Prototype from './index'
import GlobalConfig from '../SearchConfigNew/GlobalConfig'
import { PANES, prototypeUrl, type Pane } from './prototypeData'

const mocks = vi.hoisted(() => ({ permission: true, request: vi.fn(), fetch: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasMenuPermission: () => mocks.permission, hasPermission: () => false, user: { username: 'prototype-test' } }) }))
vi.mock('@/api/request', () => ({ default: mocks.request, SILENT_HEADER: 'X-Request-Silent', isBackendUnavailable: () => false }))
vi.mock('@/components/AnimatedNumber', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-TW' } }) }))

function mount(pane: Pane = 'overview', view = 'list', id?: string, wrapper = false) {
  const router = createMemoryRouter([{ path: '*', element: <ConfigProvider theme={{ token: { motion: false } }}>
    <UnsavedChangesProvider><UnsavedNavigationGuard enabled />{wrapper ? <GlobalConfig /> : <SearchV2Prototype />}</UnsavedChangesProvider>
  </ConfigProvider> }], { initialEntries: [prototypeUrl(pane, view, id)] })
  render(<RouterProvider router={router} />)
  return router
}
async function select(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }))
  const matches = await screen.findAllByText(option, { selector: '.ant-select-item-option-content' })
  fireEvent.click(matches[matches.length - 1])
}
const originalConfirm = Modal.confirm
beforeEach(() => {
  mocks.permission = true; mocks.request.mockClear(); mocks.fetch.mockClear(); vi.stubGlobal('fetch', mocks.fetch)
  // jsdom 不执行 CSS 退场动画；保留真实弹窗与事件，只取消测试中的动画等待。
  vi.spyOn(Modal, 'confirm').mockImplementation(config => originalConfirm({ ...config, transitionName: '', maskTransitionName: '' }))
})
afterEach(async () => {
  cleanup()
  act(() => Modal.destroyAll())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('搜索 U1 原型交互', () => {
  it('保留入口权限，拒绝未授权用户', () => {
    mocks.permission = false
    mount()
    expect(screen.getByText('searchV2.deniedTitle')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
  it('既有全局配置路由可懒加载原型，九个导航可达', async () => {
    const router = mount('overview', 'list', undefined, true)
    const nav = await screen.findByRole('navigation', { name: '搜索新版原型導航' })
    expect(within(nav).getAllByRole('button')).toHaveLength(9)
    for (const pane of PANES) {
      fireEvent.click(within(nav).getByRole('button', { name: new RegExp(pane.title) }))
      await waitFor(() => expect(router.state.location.search).toContain(`pane=${pane.key}`))
      expect(screen.getByRole('heading', { name: pane.title, level: 2 })).toBeInTheDocument()
    }
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('编辑保存只改变会话样例，详情只读，浏览器后退仍正确', async () => {
    const router = mount('lexicon', 'edit', 'DEMO-L01')
    fireEvent.change(screen.getByLabelText('searchV2.form.fieldName'), { target: { value: '測試同義詞草稿' } })
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.form.saveDraft' }))
    await waitFor(() => expect(router.state.location.search).toContain('view=detail'))
    expect(screen.getByLabelText('searchV2.form.fieldName')).toHaveValue('測試同義詞草稿')
    expect(screen.getByLabelText('searchV2.form.fieldName')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'searchV2.form.saveDraft' })).not.toBeInTheDocument()
    await act(async () => { await router.navigate(-1) })
    expect(screen.getByLabelText('searchV2.form.fieldName')).not.toBeDisabled()
    expect(screen.getByLabelText('searchV2.form.fieldName')).toHaveValue('測試同義詞草稿')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('未保存改动切导航，取消保留输入，放弃才离开', async () => {
    const router = mount('lexicon', 'edit', 'DEMO-L01')
    fireEvent.change(screen.getByLabelText('searchV2.form.fieldName'), { target: { value: '尚未保存' } })
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /searchV2\.pane\.overview/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '繼續編輯' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('searchV2.form.fieldName')).toHaveValue('尚未保存')
    expect(router.state.location.search).toContain('pane=lexicon')
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /searchV2\.pane\.overview/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '放棄並離開' }))
    await waitFor(() => expect(router.state.location.search).toContain('pane=overview'))
  })
  it('权重合计不合法不能保存，不生成成功假象', async () => {
    const router = mount('scenarios', 'edit', 'DEMO-S02')
    fireEvent.change(screen.getByLabelText('相關性 R（%）'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.form.saveDraft' }))
    expect(await screen.findByText('四項權重合計必須為 100%')).toBeInTheDocument()
    expect(router.state.location.search).toContain('view=edit')
  })
  it('过滤样例列表，重置恢复，统计在搜索之后', async () => {
    mount('lexicon')
    fireEvent.change(screen.getByLabelText('searchV2.list.labelName'), { target: { value: '紙巾' } })
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.list.btnQuery' }))
    await waitFor(() => expect(screen.queryByText('漢堡英文同義')).not.toBeInTheDocument())
    expect(screen.getByText('紙巾錯詞候選')).toBeInTheDocument()
    const stats = document.querySelector('.sv2__stats')!
    const filter = document.querySelector('.search-section')!
    expect(filter.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.list.btnReset' }))
    expect(await screen.findByText('漢堡英文同義')).toBeInTheDocument()
  })
  it('店内、价格排序、未知词与错误态边界清晰', async () => {
    mount('lab')
    expect(screen.getAllByTestId('preview-card').filter(card => card.dataset.ad === 'true')).toHaveLength(1)
    await select('searchV2.lab.fieldSort', 'searchV2.lab.sortPrice')
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.lab.btnLoad' }))
    await waitFor(() => expect(screen.getAllByTestId('preview-card').every(card => card.dataset.ad === 'false')).toBe(true))
    await select('searchV2.lab.fieldScene', 'searchV2.enum.scene.store')
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.lab.btnLoad' }))
    await waitFor(() => expect(screen.getAllByTestId('preview-card')).toHaveLength(3))
    expect(screen.getAllByTestId('preview-card').every(card => card.dataset.ad === 'false')).toBe(true)
    fireEvent.change(screen.getByLabelText('searchV2.lab.fieldKeyword'), { target: { value: '未收錄示例' } })
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.lab.btnLoad' }))
    expect(await screen.findByText('searchV2.preview.noSample')).toBeInTheDocument()
    await select('searchV2.lab.displayH3', 'searchV2.lab.dsError')
    expect(await screen.findByText('searchV2.preview.errorTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.preview.btnRetry' }))
    expect(await screen.findByText('searchV2.preview.noSample')).toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('历史快照只载入固定示例，不能冒用真实用户查询', async () => {
    mount('lab')
    fireEvent.click(screen.getByRole('tab', { name: 'searchV2.lab.tabHistory' }))
    expect(screen.getByPlaceholderText('searchV2.lab.historyPlaceholder')).toBeDisabled()
    expect(screen.queryAllByTestId('preview-card')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.lab.historyLoadBtn' }))
    expect(await screen.findByText('searchV2.lab.ctxSourceHistory')).toBeInTheDocument()
    expect(screen.getByLabelText('searchV2.preview.searchAria')).toBeDisabled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('演示审核状态可推进，但真实发布和回滚一直禁用', async () => {
    mount('releases', 'detail', 'DEMO-R02')
    expect(screen.getByRole('button', { name: 'searchV2.form.publishOnline' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'searchV2.form.rollbackOnline' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'searchV2.form.demoNext' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'searchV2.form.demoConfirmOk' }))
    expect(await screen.findByText('已批准 · 示例')).toBeInTheDocument()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('错误 ID 不能自动落入新增模式', () => {
    mount('ads', 'edit', 'UNKNOWN')
    expect(screen.getByText('searchV2.missingTitle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'searchV2.form.saveDraft' })).not.toBeInTheDocument()
  })
})
