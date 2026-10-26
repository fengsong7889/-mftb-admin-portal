import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackTab, GuardrailTab, KnowledgeTab } from './index'
import { fetchKnowledgeDocs, searchKnowledge } from '@/api/aiKnowledge'
import { fetchGuardRules } from '@/api/aiGuardrail'
import { fetchFeedbackStats } from '@/api/aiFeedback'

const { translate } = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string } | string) =>
    (typeof options === 'string' ? options : options?.defaultValue) ?? key,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))
vi.mock('@/components/DetailPageHeader', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('@/api/aiPromptConfig', () => ({
  fetchCapabilities: vi.fn().mockResolvedValue([]),
  saveCapability: vi.fn(),
  fetchProfiles: vi.fn().mockResolvedValue([]),
  saveProfileDraft: vi.fn(),
  publishProfile: vi.fn(),
  rollbackProfile: vi.fn(),
  fetchGlossary: vi.fn().mockResolvedValue([]),
  saveGlossary: vi.fn(),
  deleteGlossary: vi.fn(),
  testRunPrompt: vi.fn(),
}))

vi.mock('@/api/aiFeedback', () => ({
  fetchFeedback: vi.fn().mockResolvedValue([]),
  fetchFeedbackStats: vi.fn(),
}))

vi.mock('@/api/aiKnowledge', () => ({
  KNOWLEDGE_SYSTEMS: ['common', 'rdm', 'finance', 'eam', 'hr'],
  fetchKnowledgeDocs: vi.fn(),
  fetchKnowledgeDoc: vi.fn(),
  saveKnowledgeDoc: vi.fn(),
  setKnowledgeStatus: vi.fn(),
  rebuildKnowledge: vi.fn(),
  deleteKnowledgeDoc: vi.fn(),
  searchKnowledge: vi.fn(),
}))

vi.mock('@/api/aiGuardrail', () => ({
  fetchGuardRules: vi.fn(),
  saveGuardRule: vi.fn(),
  deleteGuardRule: vi.fn(),
}))

describe('AI 助手配置中心 · 三期面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchKnowledgeDocs).mockResolvedValue([
      { id: 1, title: '日報推送規範', systemCode: 'rdm', status: 'active', chunkCount: 3 },
    ])
    vi.mocked(searchKnowledge).mockResolvedValue([
      { docId: 1, chunkNo: 0, title: '日報推送規範', systemCode: 'rdm', snippet: '每日 09:00 推送', score: 1.2 },
    ])
    vi.mocked(fetchGuardRules).mockResolvedValue([
      { id: 1, ruleType: 'keyword', pattern: '競品A', action: 'block', scope: 'both', enabled: 1 },
    ])
    vi.mocked(fetchFeedbackStats).mockResolvedValue({
      days: 30,
      total: 12,
      up: 9,
      down: 3,
      downRate: 25,
      byTool: [{ toolKey: 'rdm_list_projects', count: 2 }],
      topReasons: [{ reason: '數據不對', count: 3 }],
      daily: [{ date: '2026-10-21', up: 1, down: 2 }],
    })
  })

  it('知識庫面板加载文档并可试搜', async () => {
    render(<KnowledgeTab />)

    expect(await screen.findByText('日報推送規範')).toBeTruthy()
    expect(fetchKnowledgeDocs).toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText(/試搜/), { target: { value: '日報 推送時間' } })
    fireEvent.click(screen.getByRole('button', { name: /試\s*搜/ }))

    await waitFor(() => expect(searchKnowledge).toHaveBeenCalledWith({
      query: '日報 推送時間',
      systemCode: undefined,
      limit: 5,
    }))
    expect(await screen.findByText('每日 09:00 推送')).toBeTruthy()
  })

  it('合規護欄面板展示规则并提示拦截口径', async () => {
    render(<GuardrailTab />)

    expect(await screen.findByText('競品A')).toBeTruthy()
    expect(screen.getByText(/輸入命中「攔截」時不調模型/)).toBeTruthy()
  })

  it('回答反饋面板展示聚合指标与低分工具', async () => {
    render(<FeedbackTab />)

    expect(await screen.findByText('近 30 天反饋')).toBeTruthy()
    expect(await screen.findByText('rdm_list_projects')).toBeTruthy()
    expect(await screen.findByText('數據不對')).toBeTruthy()
    expect(fetchFeedbackStats).toHaveBeenCalledWith(30, undefined)
  })
})
