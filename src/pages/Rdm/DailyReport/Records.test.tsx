import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyReportRecords from './Records'
import i18n from '@/i18n'

const fetchRecords = vi.fn()

vi.mock('@/api/rdmDailyReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/rdmDailyReport')>()
  return { ...actual, fetchDailyReportRecords: (limit: number) => fetchRecords(limit) }
})

const ROWS = [
  {
    id: 1, reportDate: '2026-10-20', reportType: 'morning', ruleId: 1, ruleName: 'A產品-晨報',
    projectId: 1, projectNo: 'PROJ2026102001', projectName: '門戶改版', iterationCode: null,
    projectCount: 1, personalCount: 2, pushCount: 1, triggerType: 'schedule', triggerBy: null,
    lastPushAt: '2026-10-20 09:00:00', createdAt: '2026-10-20 09:00:00', updatedAt: '2026-10-20 09:00:00',
  },
  {
    id: 2, reportDate: '2026-10-21', reportType: 'manual', ruleId: null, ruleName: null,
    projectId: 2, projectNo: 'PROJ2026102002', projectName: 'E2E全流程驗收項目', iterationCode: 'SP202610001',
    scopeKey: 'rule:2',
    projectCount: 1, personalCount: 1, pushCount: 2, triggerType: 'manual', triggerBy: '系統管理員',
    lastPushAt: '2026-10-21 10:00:00', createdAt: '2026-10-21 10:00:00', updatedAt: '2026-10-21 10:00:00',
  },
  {
    id: 3, reportDate: '2026-10-21', reportType: 'manual', ruleId: null, ruleName: null,
    projectId: null, projectNo: null, projectName: null, scopeLabel: '全部在途項目', scopeKey: 'manual:all',
    iterationCode: null, projectCount: 6, personalCount: 3, pushCount: 1, triggerType: 'manual',
    triggerBy: '系統管理員', lastPushAt: '2026-10-21 11:00:00', createdAt: '2026-10-21 11:00:00',
    updatedAt: '2026-10-21 11:00:00',
  },
]

/** 記錄當前路由，用來斷言「查看日報」帶上了收斂參數 */
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}{loc.search}</div>
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DailyReportRecords />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('進度日報發送記錄', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    fetchRecords.mockResolvedValue(ROWS)
  })

  it('搜索区支持日期/檔位/觸發方式/最近推送時間/項目/迭代', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('PROJ2026102001 門戶改版')).toBeInTheDocument())

    const searchText = document.querySelector('.search-section')?.textContent ?? ''
    for (const label of ['日報日期', '檔位', '觸發方式', '最近推送時間', '項目', '迭代']) {
      expect(searchText).toContain(label)
    }
    expect(fetchRecords).toHaveBeenCalledWith(365)
  })

  it('列表把目標拆成「項目」「迭代」两列，不再显示合并列', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('PROJ2026102001 門戶改版')).toBeInTheDocument())

    const headers = Array.from(document.querySelectorAll('.ant-table-thead th'))
      .map(th => th.textContent?.trim())
    expect(headers).toContain('項目')
    expect(headers).toContain('迭代')
    expect(headers).not.toContain('目標（項目/迭代）')
    // 未指定迭代的行显示「全部迭代」（可能有多行）
    expect(screen.getByText('SP202610001')).toBeInTheDocument()
    expect(screen.getAllByText('全部迭代').length).toBeGreaterThan(0)
  })

  it('全部在途項目的記錄：項目列顯示範圍文案，查看日報帶上 scopeKey', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('全部在途項目')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: /查看日報/ })[2])

    await waitFor(() => {
      const loc = screen.getByTestId('location').textContent ?? ''
      expect(loc).toContain('/rdm-daily?date=2026-10-21&type=manual')
      expect(loc).toContain('scopeKey=manual%3Aall')
    })
  })

  it('按檔位筛选后只保留匹配记录', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('PROJ2026102001 門戶改版')).toBeInTheDocument())

    // 第 1 个下拉是「檔位」；用 option 节点点击，避免命中表格里同名的「手動補發」标签
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0])
    await waitFor(() => expect(document.querySelector('.ant-select-item-option[title="手動補發"]')).not.toBeNull())
    fireEvent.click(document.querySelector('.ant-select-item-option[title="手動補發"]') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /查詢/ }))

    await waitFor(() => {
      const body = document.querySelector('.ant-table-tbody')?.textContent ?? ''
      expect(body).toContain('E2E全流程驗收項目')
      expect(body).not.toContain('門戶改版')
    })
  })
})
