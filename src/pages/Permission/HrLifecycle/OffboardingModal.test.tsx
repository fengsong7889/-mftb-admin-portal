import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import OffboardingModal from './OffboardingModal'
import { fetchOffboardingTasks } from '../../../api/hrOffboarding'
import type { OffboardingTaskItem } from '../../../api/hrOffboarding'

vi.mock('../../../api/hrOffboarding', async () => {
  const actual = await vi.importActual<typeof import('../../../api/hrOffboarding')>('../../../api/hrOffboarding')
  return { ...actual, fetchOffboardingTasks: vi.fn(), assignOffboardingReceiver: vi.fn(), retryOffboardingTask: vi.fn() }
})

const mockedFetch = vi.mocked(fetchOffboardingTasks)

const tasks: OffboardingTaskItem[] = [
  {
    id: 1, requestId: 88, reqNo: 'HR202610180088', taskType: 'EAM_ASSET_HANDOVER',
    status: 'FAILED', attempts: 2, lastError: '尚未指定交接接收人，請先在離職單據指定接收人後重試',
    resultSummary: null, targetRef: null, effectiveDate: '2026-10-18',
  },
  {
    id: 2, requestId: 88, reqNo: 'HR202610180088', taskType: 'OA_TODO_TRANSFER',
    status: 'DONE', attempts: 1, lastError: null,
    resultSummary: '已改派待辦 2 個節點 → 王小美', targetRef: '11,12', effectiveDate: '2026-10-18',
  },
]

/**
 * 离职交接联动面板。
 * 钉住三条：等待原因必须原样可见（否则 HR 只看到红色状态不知道该做什么）、
 * 终态任务不给重试入口、无管理权限时整个操作区不渲染。
 */
describe('OffboardingModal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
    mockedFetch.mockResolvedValue(tasks)
  })

  it('打开时按单据取任务，并显示类型与状态文案', async () => {
    render(<OffboardingModal open requestId={88} reqNo="HR202610180088" onClose={vi.fn()} canManage />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(88))
    expect(await screen.findByText('資產交接')).toBeInTheDocument()
    expect(screen.getByText('待辦改派')).toBeInTheDocument()
    expect(screen.getByText('執行失敗')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    // 跨模块产物引用要能回指：交接单号 / 被改派的节点 id
    expect(screen.getByText(/11,12/)).toBeInTheDocument()
  })

  it('失败原因原样展示，让人知道下一步做什么', async () => {
    render(<OffboardingModal open requestId={88} onClose={vi.fn()} canManage />)

    expect(await screen.findByText(/尚未指定交接接收人/)).toBeInTheDocument()
  })

  it('已完成的任务不给重试，失败的任务给', async () => {
    render(<OffboardingModal open requestId={88} onClose={vi.fn()} canManage />)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))

    // Modal 在 body portal 里，从 document 取；「重試」只出现在行内操作列（刷新叫「重新取數」）
    const retryButtons = Array.from(document.querySelectorAll('button'))
      .filter(btn => btn.textContent?.trim() === '重試')
    expect(retryButtons).toHaveLength(1)
    expect(retryButtons[0].closest('tr')?.textContent).toContain('尚未指定交接接收人')
  })

  it('无管理权限时不渲染接收人选择与操作列', async () => {
    render(<OffboardingModal open requestId={88} onClose={vi.fn()} canManage={false} />)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))

    expect(screen.queryByText('交接接收人')).not.toBeInTheDocument()
    expect(screen.queryByText('指定接收人')).not.toBeInTheDocument()
  })
})
