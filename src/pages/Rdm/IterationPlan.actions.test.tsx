/**
 * 迭代排期操作列权限收敛回归。
 *
 * 钉三件事：
 * 1. 详情入口对所有能进列表的人开放（只读视图），不能因为没编辑权就只剩「僅查看」；
 * 2. 编辑/改状态/删除按 rdm-delivery-iteration 的动作逐项渲染，避免「按钮能点但接口 403」；
 * 3. 删除必须先二次确认；已挂需求的迭代在确认框里直接禁用确认键，不白跑一次必然失败的请求。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Modal } from 'antd'
import i18n from '../../i18n'
import { deleteIteration, fetchIterations } from '../../api/rdm'
import IterationPlan from './IterationPlan'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

/** 本用例授予的动作集；默认空集 = 只有查看权 */
const granted = vi.hoisted(() => new Set<string>())

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: (key: string) => granted.has(key) }),
}))

vi.mock('../../api/rdm', () => ({
  fetchIterations: vi.fn(),
  updateIterationStatus: vi.fn(),
  deleteIteration: vi.fn(),
}))

const row = {
  id: 1,
  code: 'SP202610001',
  name: '11月第一版迭代',
  iterationType: 'sprint',
  startDate: '2026-11-02',
  endDate: '2026-11-13',
  capacityHours: 100,
  ownerName: '測試入职员',
  status: 'active',
  remark: '完成推广金上线',
  reqCount: 0,
  taskCount: 0,
  taskHours: 18,
}

function renderPage() {
  return render(<MemoryRouter><IterationPlan /></MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  granted.clear()
  vi.clearAllMocks()
  vi.mocked(fetchIterations).mockResolvedValue([row])
})

// Modal.confirm 是静态挂载到 body 的，cleanup() 不会回收；不销毁会让下一条用例
// 同时命中原弹窗与新的弹窗（表现为 Found multiple elements）
afterEach(() => {
  Modal.destroyAll()
})

describe('迭代排期操作列权限收敛', () => {
  it('无编辑/删除权限时仍能进只读详情', async () => {
    renderPage()
    await screen.findByText(row.name)
    expect(screen.getByRole('button', { name: '詳情' })).toBeInTheDocument()
    // 过去无编辑权时整列只剩「僅查看」，连详情都进不去
    expect(screen.queryByText('僅查看')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '修改狀態' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
  })

  it('有编辑与删除权限时按钮齐备，删除走二次确认并真调接口', async () => {
    granted.add('rdm-delivery-iteration:edit')
    granted.add('rdm-delivery-iteration:delete')
    vi.mocked(deleteIteration).mockResolvedValue(undefined)
    renderPage()
    await screen.findByText(row.name)

    expect(screen.getByRole('button', { name: '詳情' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改狀態' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    // antd confirm 同时渲染 .ant-modal-title 与 .ant-modal-confirm-title 两份标题
    expect((await screen.findAllByText('確認刪除迭代')).length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('僅未掛需求的迭代可刪除')
    fireEvent.click(await screen.findByRole('button', { name: '確認刪除' }))
    await waitFor(() => expect(deleteIteration).toHaveBeenCalledWith(1))
    // 删除成功后重新取数，避免本地残留已删行
    await waitFor(() => expect(fetchIterations).toHaveBeenCalledTimes(2))
  })

  it('已挂需求的迭代在确认框里禁用确认键，不发起删除', async () => {
    granted.add('rdm-delivery-iteration:delete')
    vi.mocked(fetchIterations).mockResolvedValue([{ ...row, reqCount: 2 }])
    renderPage()
    await screen.findByText(row.name)

    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    expect((await screen.findAllByText('確認刪除迭代')).length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('該迭代下仍有需求')
    const ok = screen.getByRole('button', { name: '確認刪除' }) as HTMLButtonElement
    expect(ok.disabled).toBe(true)
    fireEvent.click(ok)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(deleteIteration).not.toHaveBeenCalled()
  })
})
