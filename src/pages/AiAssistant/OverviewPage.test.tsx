import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from './OverviewPage'
import { fetchAssistantOverview } from '../../api/aiOverview'

const { translate } = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string } | string) =>
    (typeof options === 'string' ? options : options?.defaultValue) ?? key,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))
vi.mock('../../components/DetailPageHeader', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('../../api/aiOverview', () => ({ fetchAssistantOverview: vi.fn() }))

describe('AI 助手概览', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAssistantOverview).mockResolvedValue({
      areas: [
        {
          key: 'ai-assistant-knowledge', title: '知識庫', description: '規範與口徑',
          value: 2, unit: '篇已啟用 / 8 分塊', route: '/ai-assistant/knowledge',
        },
        {
          key: 'ai-assistant-feedback', title: '回答質量', description: '贊/踩',
          value: 12, unit: '次反饋 / 差評率 25%', route: '/ai-assistant/feedback',
        },
      ],
      issues: [{ tone: 'warning', text: '有 1 套回答骨架草稿尚未發布', route: '/ai-assistant/profile' }],
      recentChanges: [{
        id: 1, configType: 'knowledge', configKey: 'doc:1', action: 'update',
        operator: '管理員', createdAt: '2026-10-21T09:00:00',
      }],
      canViewAudit: true,
    })
  })

  it('只渲染后端返回的有权限卡片，并展示最近变更', async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>)

    expect((await screen.findAllByText('知識庫')).length).toBeGreaterThan(0)
    expect(screen.getByText('回答質量')).toBeTruthy()
    expect(screen.queryByText('能力清單')).toBeNull()
    expect(screen.getByText(/草稿尚未發布/)).toBeTruthy()
    expect(screen.getByText('最近變更')).toBeTruthy()
    expect(screen.getByText('doc:1')).toBeTruthy()
  })

  it('没有可用模块时显示空态而不是空白页', async () => {
    vi.mocked(fetchAssistantOverview).mockResolvedValue({
      areas: [], issues: [], recentChanges: [], canViewAudit: false,
    })

    render(<MemoryRouter><OverviewPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('暫無可用的 AI 助手配置項')).toBeTruthy())
  })
})
