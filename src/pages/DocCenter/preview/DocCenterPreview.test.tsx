import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider, Modal } from 'antd'
import DocCenterPreview from './DocCenterPreview'
import DocCenter from '../index'
import { fetchEmployee, fetchEmployees } from '@/api/employee'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key === 'common.back' ? '返回' : key }) }))
vi.mock('@/api/employee', () => ({ fetchEmployee: vi.fn(), fetchEmployees: vi.fn() }))
vi.mock('../DocLibrary', () => ({ default: () => <div>現有文檔庫內容</div> }))

const realConfirm = Modal.confirm
const realComputedStyle = window.getComputedStyle

function show(page = 'plans', sample?: string) {
  return render(<ConfigProvider theme={{ token: { motion: false } }} button={{ autoInsertSpace: false }}><MemoryRouter initialEntries={[`/doc-center?preview=${page}${sample ? `&sample=${sample}` : ''}`]}><DocCenterPreview /></MemoryRouter></ConfigProvider>)
}

async function confirmDialog() {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: '確認演示' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // jsdom 不实现伪元素测量与动画结束事件；只去除测试环境动画，不模拟确认结果。
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => realComputedStyle(element))
  vi.spyOn(Modal, 'confirm').mockImplementation(options => realConfirm({ ...options, transitionName: '', maskTransitionName: '' }))
})
afterEach(async () => {
  await act(async () => { Modal.destroyAll() })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('文档中心第一阶段隔离预览', () => {
  it('历史文件别名可查找，结果与统计位于正确位置', async () => {
    const { container } = show()
    fireEvent.change(screen.getByPlaceholderText('標題、正文、編號或歷史檔名'), { target: { value: '企業_HCM' } })
    fireEvent.click(screen.getByRole('button', { name: /查詢/ }))
    expect(screen.getByText('PLAN-DEMO-002')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('PLAN-DEMO-001')).not.toBeInTheDocument())
    expect(screen.getByText('共 1 筆（演示）')).toBeInTheDocument()
    const search = container.querySelector('.search-section')!
    const stats = screen.getByTestId('preview-filtered-stats')
    const actions = container.querySelector('.action-section')!
    expect(search.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(stats.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('包含历史选项能找到被替代方案', () => {
    show()
    expect(screen.queryByText('PLAN-DEMO-005')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '包含已歸檔 / 已被替代' }))
    expect(screen.getByText('PLAN-DEMO-005')).toBeInTheDocument()
    expect(screen.getByText('PLAN-DEMO-006')).toBeInTheDocument()
  })

  it('确认需要核对勾选和二次确认，生效版更新但执行基线保持 v1', async () => {
    const { container } = show('confirm', 'demo-1')
    const approve = screen.getByRole('button', { name: '確認生效（演示）' })
    expect(approve).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /我已核對 v2/ }))
    fireEvent.click(approve)
    await confirmDialog()
    await screen.findByText('方案詳情')
    const banner = container.querySelector('.doc-preview__version-banner')!
    expect(within(banner as HTMLElement).getByText('v2')).toBeInTheDocument()
    expect(within(banner as HTMLElement).getByText('v1')).toBeInTheDocument()
    expect(screen.getByText('已生效')).toBeInTheDocument()
    expect(fetchEmployees).not.toHaveBeenCalled()
    expect(fetchEmployee).not.toHaveBeenCalled()
  })

  it('退回必须填写原因，不能无说明驳回', async () => {
    show('confirm', 'demo-1')
    fireEvent.click(screen.getByRole('radio', { name: '退回修改' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /我已核對/ }))
    fireEvent.click(screen.getByRole('button', { name: '退回修改（演示）' }))
    expect(await screen.findByText('退回必須填寫原因')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('修改草稿标题不会覆盖当前有效版，也不持久化原文', async () => {
    show('edit', 'demo-3')
    fireEvent.change(screen.getByLabelText('方案標題'), { target: { value: '只屬於新草稿的標題' } })
    fireEvent.change(screen.getByLabelText('本次調整原因'), { target: { value: '補充範圍' } })
    fireEvent.click(screen.getByRole('button', { name: /保存草稿（演示）/ }))
    await screen.findByText('方案詳情')
    expect(screen.getByRole('heading', { level: 1, name: '資產盤點快照與差異核對' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: '只屬於新草稿的標題' })).not.toBeInTheDocument()
    expect(vi.mocked(localStorage.setItem).mock.calls.some(([, value]) => value.includes('只屬於新草稿的標題'))).toBe(false)
    expect(fetchEmployees).not.toHaveBeenCalled()
    expect(fetchEmployee).not.toHaveBeenCalled()
  })

  it('待确认内容不能通过编辑页面直接修改', () => {
    show('edit', 'demo-1')
    expect(screen.getByText('目前記錄不可編輯')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /保存草稿（演示）/ })).not.toBeInTheDocument()
  })

  it('原文输入作为文本展示，不执行 HTML', async () => {
    const { container } = show('edit', 'demo-2')
    fireEvent.change(screen.getByLabelText('方案內容'), { target: { value: '<img src="invalid" onerror="alert(1)">' } })
    fireEvent.change(screen.getByLabelText('本次調整原因'), { target: { value: '安全文本示例' } })
    fireEvent.click(screen.getByRole('button', { name: /保存草稿（演示）/ }))
    await screen.findByText('方案詳情')
    expect(screen.getByText('<img src="invalid" onerror="alert(1)">')).toBeInTheDocument()
    expect(container.querySelector('img[src="invalid"]')).toBeNull()
  })

  it('回收站恢复保留编号且不调用真实接口', async () => {
    show('trash')
    expect(screen.getByText('PLAN-DEMO-007')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢復' }))
    await confirmDialog()
    expect(screen.queryByText('PLAN-DEMO-007')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回方案管理' }))
    expect(await screen.findByText('PLAN-DEMO-007')).toBeInTheDocument()
  })

  it('接手必须确认版本，保留填写的下一步', async () => {
    show('handoff', 'demo-3')
    fireEvent.change(screen.getByLabelText('下一步 / 剩餘項'), { target: { value: '先完成權限用例，再接 API' } })
    fireEvent.click(screen.getByRole('button', { name: '確認接手（演示）' }))
    expect(await screen.findByText('請先核對採用版本')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /已核對採用版本/ }))
    fireEvent.click(screen.getByRole('button', { name: '確認接手（演示）' }))
    await confirmDialog()
    await screen.findByText('方案詳情')
    fireEvent.click(screen.getByRole('button', { name: '按版本交接' }))
    expect(screen.getByLabelText('下一步 / 剩餘項')).toHaveValue('先完成權限用例，再接 API')
  })

  it('离开编辑需要确认，取消则保留输入', async () => {
    show('edit', 'demo-2')
    fireEvent.change(screen.getByLabelText('方案標題'), { target: { value: '尚未保存' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /取\s*消/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('方案標題')).toHaveValue('尚未保存')
  })

  it('治理页明确标记备份和 MCP 未接入', () => {
    show('governance')
    fireEvent.click(screen.getByRole('tab', { name: /AI 接入/ }))
    expect(screen.getByText('尚未連線 MCP，也未建立任何集成憑據。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /備份與恢復/ }))
    expect(screen.getByText('備份尚未接入，恢復尚未演練。不能以此頁判定資料已受保護。')).toBeInTheDocument()
  })

  it('不存在的演示记录显示明确空态', () => {
    show('read', 'missing')
    expect(screen.getByText('找不到這筆演示記錄')).toBeInTheDocument()
  })

  it('生产环境不展示预览入口，查询参数不替换原有文档库', () => {
    vi.stubEnv('DEV', false)
    render(<MemoryRouter initialEntries={['/doc-center?preview=plans']}><DocCenter /></MemoryRouter>)
    expect(screen.getByText('現有文檔庫內容')).toBeInTheDocument()
    expect(screen.queryByText('查看新版方案管理')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '新版文檔中心導航' })).not.toBeInTheDocument()
  })
})
