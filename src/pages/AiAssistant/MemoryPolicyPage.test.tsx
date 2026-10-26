import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MemoryPolicyPage from './MemoryPolicyPage'
import { fetchMemoryStats, fetchRuntimeSettings } from '@/api/aiRuntimeSetting'

const { translate } = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string } | string) =>
    (typeof options === 'string' ? options : options?.defaultValue) ?? key,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))
vi.mock('@/components/DetailPageHeader', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('@/api/aiRuntimeSetting', () => ({
  fetchRuntimeSettings: vi.fn(),
  fetchMemoryStats: vi.fn(),
  saveRuntimeSettings: vi.fn(),
}))

describe('記憶策略页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchRuntimeSettings).mockResolvedValue([
      { key: 'memory.max_count', value: '50', defaultValue: '50', type: 'int', remark: '單個員工最多保存多少條記憶', min: 10, max: 500, updatedBy: 'system', updatedAt: '2026-10-21T17:40:00' },
      { key: 'memory.retention_days', value: '180', defaultValue: '180', type: 'int', remark: '記憶保留天數', min: 7, max: 3650 },
      { key: 'memory.prompt_top', value: '10', defaultValue: '10', type: 'int', remark: '每次回答最多注入條數', min: 1, max: 30 },
      { key: 'memory.auto_suggest', value: '1', defaultValue: '1', type: 'bool', remark: '是否給出記憶建議', min: 0, max: 1 },
    ])
    vi.mocked(fetchMemoryStats).mockResolvedValue({
      total: 3, active: 2, disabled: 1, expired: 0, expiring7d: 1, users: 2,
    })
  })

  it('分两块模块卡展示参数与体量，并给出更新时间', async () => {
    render(<MemoryRouter><MemoryPolicyPage /></MemoryRouter>)

    expect(await screen.findByText('策略參數')).toBeTruthy()
    expect(screen.getByText('記憶體量')).toBeTruthy()
    expect(screen.getByText('單人記憶上限')).toBeTruthy()
    expect(screen.getByText('自動記憶建議')).toBeTruthy()
    // 6 个统计标签
    for (const label of ['記憶總數', '生效中', '已停用', '已過期', '7 天內到期', '覆蓋人數']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    await waitFor(() => expect(screen.getByText(/最後更新/)).toBeTruthy())
  })

  it('无改动时保存按钮禁用', async () => {
    render(<MemoryRouter><MemoryPolicyPage /></MemoryRouter>)

    const save = await screen.findByRole('button', { name: /保\s*存/ })
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })
})
