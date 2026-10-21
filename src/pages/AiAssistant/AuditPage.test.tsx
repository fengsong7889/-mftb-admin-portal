import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditPage from './AuditPage'
import { fetchConfigChanges } from '../../api/aiAudit'

const { translate } = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string } | string) =>
    (typeof options === 'string' ? options : options?.defaultValue) ?? key,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))
vi.mock('../../components/DetailPageHeader', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('../../api/aiAudit', () => ({ fetchConfigChanges: vi.fn() }))

describe('配置變更審計', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchConfigChanges).mockResolvedValue({
      records: [
        {
          id: 1, configType: 'knowledge', configKey: 'doc:1', action: 'update',
          beforeJson: '{"title":"舊標題"}', afterJson: '{"title":"新標題"}',
          operator: '管理員', createdAt: '2026-10-21T09:00:00',
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    })
  })

  it('展示审计行，并在详情中展示 before/after', async () => {
    render(<MemoryRouter><AuditPage /></MemoryRouter>)

    expect(await screen.findByText('doc:1')).toBeTruthy()
    expect(screen.getByText('知識庫')).toBeTruthy()
    expect(screen.getByText('修改')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /詳\s*情/ }))

    expect(await screen.findByText('變更詳情')).toBeTruthy()
    expect(await screen.findByText(/"title": "舊標題"/)).toBeTruthy()
    expect(await screen.findByText(/"title": "新標題"/)).toBeTruthy()
  })

  it('空列表显示空态', async () => {
    vi.mocked(fetchConfigChanges).mockResolvedValue({ records: [], total: 0, page: 1, size: 20 })

    render(<MemoryRouter><AuditPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('暫無變更記錄')).toBeTruthy())
  })
})
