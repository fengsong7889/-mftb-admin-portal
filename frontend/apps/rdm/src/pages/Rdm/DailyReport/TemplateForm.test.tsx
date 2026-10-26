import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyReportTemplateForm from './TemplateForm'
import i18n from '@/i18n'

const fetchTemplates = vi.fn()
const previewReport = vi.fn()

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

vi.mock('@/api/rdmDailyReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/rdmDailyReport')>()
  return {
    ...actual,
    fetchDailyReportTemplates: () => fetchTemplates(),
    previewDailyReport: (form: unknown) => previewReport(form),
    saveDailyReportTemplate: vi.fn(),
  }
})

const TEMPLATE = {
  id: 1, templateKey: 'group_morning_overview', name: '群報·晨報總覽', channel: 'group', reportType: 'morning',
  titleTpl: '晨報 {{reportDate}}', contentTpl: '今日 {{reportDate}}', preset: false, defaultTemplate: true,
  enabled: true, remark: '',
}

const PREVIEW = {
  title: '晨報 2026-10-20',
  content: '今日 2026-10-20\n詳情：https://example.com/#/rdm-daily-view?token=abc',
  unknownPlaceholders: [] as string[],
  reportDate: '2026-10-20',
  reportType: 'morning',
  detailUrl: 'https://example.com/#/rdm-daily-view?token=abc',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/rdm-daily-report-template-form?key=group_morning_overview']}>
      <Routes>
        <Route path="/rdm-daily-report-template-form" element={<DailyReportTemplateForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('進度日報模板編輯：占位符條與連結看板預覽', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    fetchTemplates.mockResolvedValue([TEMPLATE])
    previewReport.mockResolvedValue(PREVIEW)
  })

  it('可用占位符以橫排 chip 展示在正文上方，點擊即插入正文', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('可用佔位符')).toBeInTheDocument())

    const chip = screen.getByRole('button', { name: '{{overdueCount}}' })
    const textarea = document.querySelectorAll('textarea')[0] as HTMLTextAreaElement
    // 占位符条必须位于正文编辑框之前（DOM 顺序）
    const panel = document.querySelector('.tpl-placeholder-panel') as HTMLElement
    expect(panel.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(chip)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toContain('{{overdueCount}}'))
  })

  it('預覽結果可「查看看板」，彈窗內嵌後端返回的免登連結', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('可用佔位符')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /預\s*覽/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /查看看板/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /查看看板/ }))
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
    // 弹窗固定用当前部署的同源地址：base_url 指向的生产站点可能还是旧构建（无公开路由，会跳登录）
    expect(document.querySelector('iframe')?.getAttribute('src'))
      .toBe(`${window.location.origin}${window.location.pathname}#/rdm-daily-view?token=abc`)
  })
})
