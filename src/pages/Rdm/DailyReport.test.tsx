/**
 * 移動端日報頁 —— 關鍵口徑測試
 *
 * 釘死四條（都是「數字說謊」級別的風險，不是樣式問題）：
 *  1. **零承諾短路**：deliveryItemTotal === 0 的項目必須顯示「尚未排定交付項」，
 *     絕不能顯示「剩餘 0 項」——那會把「還沒承諾任何交付項」謊報成「全部完成」；
 *  2. 進度數字直接取快照字段，不在前端重算（通知與頁面同源）；
 *  3. 晚報才展示當日完成/明日到期等復盤指標，晨報不展示（避免口径混用）；
 *  4. 快照缺失給空態、加載失敗給錯誤橫幅 + 重試，都不靜默顯示 0。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { fetchDailyReportSnapshot } from '../../api/rdmDailyReport'
import type { DailyReportSnapshot } from '../../api/rdmDailyReport'
import DailyReport from './DailyReport'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

vi.mock('../../api/rdmDailyReport', () => ({
  fetchDailyReportSnapshot: vi.fn(),
}))

const mockFetch = vi.mocked(fetchDailyReportSnapshot)

function makeSnapshot(overrides: Partial<DailyReportSnapshot> = {}): DailyReportSnapshot {
  return {
    reportDate: '2026-10-19',
    reportType: 'morning',
    reportTypeLabel: '晨報',
    generatedAt: '2026-10-19 09:00:00',
    summary: {
      projectCount: 1, todayDueItemCount: 2, overdueItemCount: 1, tomorrowDueItemCount: 3,
      riskProjectCount: 1, normalProjectCount: 0, todayDoneItemCount: 4, todayReleasedCount: 1,
      todayChangedCount: 6, requirementTotal: 3, deliveryItemTotal: 5, deliveryItemCompleted: 2,
      todoTotal: 7,
    },
    projects: [],
    unassignedIterations: [],
    ...overrides,
  }
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 1, projectNo: 'PROJ2026101901', projectName: '演示項目', status: 'in_progress',
    pmUserName: '張三', productOwnerUserName: '李四',
    riskFlag: 0, overdueFlag: 0, pausedFlag: 0,
    requirementTotal: 2, deliveryItemTotal: 5, deliveryItemCompleted: 2, remainingCount: 3,
    deliveryItemOverdue: 1, deliveryItemBlocked: 0, deliveryItemTesting: 1,
    deliveryItemPendingAcceptance: 0, taskTotal: 4, taskCompleted: 1, todoTotal: 2,
    nextDeliveryDate: '2026-10-22', attention: false,
    detailUrl: '/rdm-project-detail?id=1&mode=view',
    iterations: [], unscheduledRequirements: [],
    ...overrides,
  }
}

function renderPage(entry = '/rdm-daily?date=2026-10-19&type=morning') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DailyReport />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('移動端日報頁', () => {
  it('零承諾短路：未排交付項的項目顯示「尚未排定」，不得顯示「剩餘 0 項」', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({
      projects: [makeProject({ deliveryItemTotal: 0, deliveryItemCompleted: 0, remainingCount: 0 })],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('尚未排定交付項')).toBeInTheDocument())
    expect(screen.queryByText(/剩餘 0 項/)).not.toBeInTheDocument()
  })

  it('有交付項時如實展示 已完成/總數 與剩餘，並單獨標出逾期', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({
      projects: [makeProject({ deliveryItemTotal: 5, deliveryItemCompleted: 2, remainingCount: 3, deliveryItemOverdue: 1 })],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('交付項 2/5 完成')).toBeInTheDocument())
    expect(screen.getByText('剩餘 3 項')).toBeInTheDocument()
    expect(screen.getByText('逾期 1')).toBeInTheDocument()
    expect(screen.getByText(/下次交付/)).toBeInTheDocument()
  })

  it('層級渲染：項目 → 迭代 → 需求（編號、狀態標籤、優先級都來自快照）', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({
      projects: [makeProject({
        iterations: [{
          iterationId: 11, projectId: 1, code: 'SP202610001', name: '十月迭代',
          iterationType: 'sprint', status: 'active', startDate: '2026-10-08', endDate: '2026-10-22',
          ownerName: '王五', requirementCount: 1, requirementDoneCount: 0,
          requirements: [{
            reqId: 101, reqNo: 'XQ20261008001', title: '需求一', status: 'testing',
            statusLabel: '測試中', priority: 'P1', assigneePmName: '李四', iterationCode: 'SP202610001',
            planReleaseDate: '2026-10-20', overdueFlag: 0, blockedFlag: 0, progress: 60,
            detailUrl: '/rdm-detail?id=101',
          }],
        }],
      })],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('演示項目')).toBeInTheDocument())
    expect(screen.getByText('SP202610001')).toBeInTheDocument()
    expect(screen.getByText('進行中')).toBeInTheDocument()
    expect(screen.getByText('需求一')).toBeInTheDocument()
    expect(screen.getByText('測試中')).toBeInTheDocument()
    expect(screen.getByText('XQ20261008001')).toBeInTheDocument()
  })

  it('需求尚未發號時顯示「待發號」，不編造編號也不留白', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({
      projects: [makeProject({
        unscheduledRequirements: [{
          reqId: 102, reqNo: null, title: '未排期需求', status: 'pool', statusLabel: '需求池',
          priority: 'P2', assigneePmName: null, iterationCode: null, planReleaseDate: null,
          overdueFlag: 0, blockedFlag: 0, progress: 0, detailUrl: '/rdm-detail?id=102',
        }],
      })],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('未排期需求')).toBeInTheDocument())
    expect(screen.getByText('未排迭代')).toBeInTheDocument()
    expect(screen.getByText('待發號')).toBeInTheDocument()
  })

  it('未掛項目的迭代單獨成區，不塞進任何項目下', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({
      projects: [makeProject()],
      unassignedIterations: [{
        iterationId: 99, projectId: null, code: 'HF2026101901', name: '平台熱修',
        iterationType: 'hotfix', status: 'active', startDate: '2026-10-19', endDate: '2026-10-19',
        ownerName: null, requirementCount: 0, requirementDoneCount: 0, requirements: [],
      }],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('未掛項目的迭代')).toBeInTheDocument())
    expect(screen.getByText('HF2026101901')).toBeInTheDocument()
    expect(screen.getByText('未掛項目')).toBeInTheDocument()
  })

  it('晨報不展示晚報專屬的復盤指標（口徑不混用）', async () => {
    mockFetch.mockResolvedValue(makeSnapshot())
    renderPage('/rdm-daily?date=2026-10-19&type=morning')

    await waitFor(() => expect(screen.getByText('在途項目')).toBeInTheDocument())
    expect(screen.getByText('今日到期')).toBeInTheDocument()
    expect(screen.getByText('已逾期')).toBeInTheDocument()
    expect(screen.queryByText('今日完成')).not.toBeInTheDocument()
    expect(screen.queryByText('明日到期')).not.toBeInTheDocument()
  })

  it('晚報追加當日完成/上線/狀態變更/明日到期四個復盤指標', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({ reportType: 'evening', reportTypeLabel: '晚報' }))
    renderPage('/rdm-daily?date=2026-10-19&type=evening')

    await waitFor(() => expect(screen.getByText('今日完成')).toBeInTheDocument())
    expect(screen.getByText('今日上線')).toBeInTheDocument()
    expect(screen.getByText('狀態變更')).toBeInTheDocument()
    expect(screen.getByText('明日到期')).toBeInTheDocument()
  })

  it('URL 帶 projectId 時給出定位提示（個人通知點進來的場景）', async () => {
    mockFetch.mockResolvedValue(makeSnapshot({ projects: [makeProject()] }))
    renderPage('/rdm-daily?date=2026-10-19&type=morning&projectId=1')

    await waitFor(() => expect(screen.getByText('已定位到通知中的項目')).toBeInTheDocument())
  })

  it('當日無快照時給空態說明，而不是顯示一堆 0', async () => {
    mockFetch.mockResolvedValue(null)
    renderPage()

    await waitFor(() => expect(screen.getByText('當日尚無日報')).toBeInTheDocument())
    expect(screen.getByText(/還沒有生成快照/)).toBeInTheDocument()
    expect(screen.queryByText('在途項目')).not.toBeInTheDocument()
  })

  it('加載失敗給錯誤橫幅與重試入口，不靜默降级成空报表', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    renderPage()

    await waitFor(() => expect(screen.getByText('日報載入失敗')).toBeInTheDocument())
    expect(screen.getByText('network down')).toBeInTheDocument()
    // antd 会给「两个汉字」的按钮文本自动插入空格（重試 → 重 試），故用正则匹配
    expect(screen.getByRole('button', { name: /重\s*試/ })).toBeInTheDocument()
  })

  it('按 URL 的日期與檔位請求快照（不寫死今天/晨報）', async () => {
    mockFetch.mockResolvedValue(makeSnapshot())
    renderPage('/rdm-daily?date=2026-10-01&type=evening')

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // 第三个参数是 projectId：通知链接不带项目时为 null，用于多快照收敛
    expect(mockFetch).toHaveBeenCalledWith('2026-10-01', 'evening', null)
  })

  it('URL 帶 projectId 時用它收斂快照（同一天多份手動推送不能互相覆蓋）', async () => {
    mockFetch.mockResolvedValue(makeSnapshot())
    renderPage('/rdm-daily?date=2026-10-01&type=manual&projectId=6')

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith('2026-10-01', 'manual', 6)
  })
})
