import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Modal } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyReportTemplates from './Templates'
import i18n from '../../../i18n'

const fetchTemplates = vi.fn()
const fetchConfig = vi.fn()
const saveTemplate = vi.fn()

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

/** 查询条件里的选人控件：单测只验证「选中人 → 姓名过滤」链路，远程搜索组件本身有独立测试 */
vi.mock('../../../components/RemoteSearchSelect', () => ({
  default: ({ onChange }: { onChange?: (value?: string, label?: string) => void }) => (
    <button type="button" onClick={() => onChange?.('2', '李四(MF00002)')}>選李四</button>
  ),
}))

vi.mock('../../../api/rdmDailyReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/rdmDailyReport')>()
  return {
    ...actual,
    fetchDailyReportTemplates: () => fetchTemplates(),
    fetchDailyReportConfig: () => fetchConfig(),
    saveDailyReportTemplate: (form: unknown) => saveTemplate(form),
    applyDailyReportTemplate: vi.fn(),
    deleteDailyReportTemplate: vi.fn(),
  }
})

const TEMPLATES = [
  {
    id: 1, templateKey: 'group_morning_overview', name: '群報·晨報總覽', channel: 'group', reportType: 'morning',
    titleTpl: '晨報', contentTpl: '正文', preset: true, defaultTemplate: true, enabled: true, remark: '晨間總覽',
    updatedBy: '張三', updatedAt: '2026-10-19 10:00:00',
  },
  {
    id: 2, templateKey: 'group_evening_review', name: '群報·晚報復盤', channel: 'group', reportType: 'evening',
    titleTpl: '晚報', contentTpl: '正文', preset: true, defaultTemplate: true, enabled: false, remark: '收工復盤',
    updatedBy: '李四', updatedAt: '2026-10-18 18:00:00',
  },
  {
    id: 3, templateKey: 'personal_todo', name: '個人·待辦提醒', channel: 'personal', reportType: 'any',
    titleTpl: '待辦', contentTpl: '正文', preset: true, defaultTemplate: true, enabled: true, remark: '個人通知',
    updatedBy: '張三', updatedAt: '2026-10-20 09:00:00',
  },
]

const CONFIG = {
  enabled: true, morningTime: '09:00', eveningTime: '18:00', groupEnabled: true, personalEnabled: true,
  receiverScope: 'all_projects', morningTemplateKey: 'group_morning_overview',
  eveningTemplateKey: 'group_evening_review', personalTemplateKey: 'personal_todo',
  boardLinkValidDays: 30, boardShowRequirements: true, boardShowOwners: true, boardShowUnassigned: true,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DailyReportTemplates />
    </MemoryRouter>,
  )
}

describe('進度日報模板配置：查詢、操作區與狀態開關', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    Modal.destroyAll()
    await i18n.changeLanguage('zh-TW')
    fetchTemplates.mockResolvedValue(TEMPLATES)
    fetchConfig.mockResolvedValue(CONFIG)
    saveTemplate.mockResolvedValue({})
  })

  it('渲染六条查询条件、新增列与右侧新建按钮', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('群報·晨報總覽')).toBeInTheDocument())
    expect(screen.getByText('投放通道')).toBeInTheDocument()
    expect(screen.getAllByText('模板名稱').length).toBeGreaterThan(0)
    expect(screen.getByText('使用檔位')).toBeInTheDocument()
    expect(screen.getByText('狀態')).toBeInTheDocument()
    expect(screen.getAllByText('最後更新人').length).toBeGreaterThan(0)
    expect(screen.getAllByText('最後更新時間').length).toBeGreaterThan(0)
    expect(screen.getAllByText('模板編號').length).toBeGreaterThan(0)
    expect(screen.getAllByText('標記').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /新建模板/ })).toBeInTheDocument()
  })

  it('按模板名稱查詢時只保留匹配行', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('群報·晨報總覽')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('模板名稱'), { target: { value: '晚報' } })
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))

    await waitFor(() => expect(screen.queryByText('群報·晨報總覽')).toBeNull())
    expect(screen.getByText('群報·晚報復盤')).toBeInTheDocument()
    expect(screen.queryByText('個人·待辦提醒')).toBeNull()
  })

  it('按最後更新人查詢時只保留匹配行', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('群報·晨報總覽')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '選李四' }))
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))

    await waitFor(() => expect(screen.queryByText('群報·晨報總覽')).toBeNull())
    expect(screen.getByText('群報·晚報復盤')).toBeInTheDocument()
    expect(screen.queryByText('個人·待辦提醒')).toBeNull()
  })

  it('已是默認的模板，操作列顯示「默認中」而不是可點的「設為默認」', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('群報·晨報總覽')).toBeInTheDocument())

    expect(screen.getAllByText('默認中').length).toBe(3)
    expect(screen.queryByRole('button', { name: '設為默認' })).toBeNull()
  })

  it('狀態開關先二次確認，確認後才調用保存接口', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('群報·晨報總覽')).toBeInTheDocument())

    const switches = document.querySelectorAll('.ant-switch')
    expect(switches.length).toBeGreaterThan(0)
    fireEvent.click(switches[0])

    await waitFor(() => expect(screen.getAllByText('確定要停用「群報·晨報總覽」嗎？').length).toBeGreaterThan(0))
    expect(saveTemplate).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: /確\s*認/ }).at(-1)!)
    await waitFor(() => expect(saveTemplate).toHaveBeenCalledTimes(1))
    expect(saveTemplate.mock.calls[0][0]).toMatchObject({ templateKey: 'group_morning_overview', enabled: false })
  })
})
