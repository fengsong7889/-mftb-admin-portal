import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyMemoryDrawer, RememberMemoryModal } from './MyMemory'
import {
  createMemory,
  deleteMemory,
  fetchMemories,
  updateMemory,
  type AiUserMemory,
} from '@/api/aiMemory'

const { translate } = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string } | string) =>
    (typeof options === 'string' ? options : options?.defaultValue) ?? key,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock('@/api/aiMemory', () => ({
  fetchMemories: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}))

const rows: AiUserMemory[] = [
  { id: 1, userId: 9, memoryType: 'preference', content: '以後回答用表格', status: 'active' },
  { id: 2, userId: 9, memoryType: 'fact', content: '我負責會員專案', status: 'disabled' },
]

describe('我的記憶', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMemories).mockResolvedValue(rows)
    vi.mocked(createMemory).mockResolvedValue(rows[0])
    vi.mocked(updateMemory).mockResolvedValue(rows[0])
    vi.mocked(deleteMemory).mockResolvedValue()
  })

  it('打开抽屉时加载并展示记忆，可新增一条偏好', async () => {
    render(<MyMemoryDrawer open onClose={() => {}} />)

    expect(await screen.findByText('以後回答用表格')).toBeTruthy()
    expect(screen.getByText('我負責會員專案')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(/例如：以後回答盡量用表格/), {
      target: { value: '回答先給結論' },
    })
    fireEvent.click(screen.getByRole('button', { name: /記\s*住/ }))

    await waitFor(() => expect(createMemory).toHaveBeenCalledWith('回答先給結論'))
    await waitFor(() => expect(fetchMemories).toHaveBeenCalledTimes(2))
  })

  it('停用中的记忆可以重新启用，并回写状态', async () => {
    render(<MyMemoryDrawer open onClose={() => {}} />)

    await screen.findByText('我負責會員專案')
    fireEvent.click(screen.getByRole('button', { name: /啟\s*用/ }))

    await waitFor(() => expect(updateMemory).toHaveBeenCalledWith(2, { status: 'active' }))
  })

  it('编辑记忆走更新接口，而不是新增一条', async () => {
    render(<MyMemoryDrawer open onClose={() => {}} />)

    await screen.findByText('以後回答用表格')
    fireEvent.click(screen.getAllByRole('button', { name: /編\s*輯/ })[0])

    const title = await screen.findByText('編輯記憶')
    const dialog = title.closest('.ant-modal') as HTMLElement
    const textarea = within(dialog).getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '以後回答用表格並列出依據' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(updateMemory).toHaveBeenCalledWith(1, { content: '以後回答用表格並列出依據' }),
    )
    expect(createMemory).not.toHaveBeenCalled()
  })

  it('“記住這條”弹窗预填当前回答，确认后落库', async () => {
    const onClose = vi.fn()
    render(
      <RememberMemoryModal open initialContent="專案代號 SP202610001" onClose={onClose} />,
    )

    const dialog = await screen.findByRole('dialog')
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('專案代號 SP202610001')

    fireEvent.change(textarea, { target: { value: '我的專案是 SP202610001' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /記\s*住/ }))

    await waitFor(() => expect(createMemory).toHaveBeenCalledWith('我的專案是 SP202610001'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
