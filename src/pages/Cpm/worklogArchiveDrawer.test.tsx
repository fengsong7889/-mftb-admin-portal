/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import WorklogArchiveDrawer from './WorklogArchiveDrawer'

vi.mock('./worklogApi', async importOriginal => {
  const actual = await importOriginal<typeof import('./worklogApi')>()
  return {
    ...actual,
    fetchLedgerArchive: vi.fn(),
  }
})

import * as ledgerApi from './worklogApi'

function archivePage(first: boolean) {
  const tasks = Array.from({ length: first ? 100 : 50 }, (_, i) => ({
    id: String((first ? 0 : 100) + i),
    title: `歸檔${(first ? 0 : 100) + i}`,
    start: '2025-01-01',
    end: '2025-01-01',
    progress: 100,
    note: '',
    hours: 8,
    workdays: 1,
  }))
  return {
    groups: [{ id: 'g1', title: '歸檔工作項', hue: 0, tasks, virtual: false }],
    loadedTaskCount: tasks.length,
    matchingTaskCount: 150,
    truncated: first,
    hasEarlierArchive: true,
    earlierArchiveCount: 150,
    archiveCursor: first ? { date: '2025-01-01', id: 100 } : null,
    nextCursorDate: first ? '2025-01-01' : null,
    nextCursorId: first ? 100 : null,
  }
}

function mount(onClose = () => undefined) {
  return render(<I18nextProvider i18n={i18n}>
    <WorklogArchiveDrawer open query={{ keyword: '測試' }} onClose={onClose} />
  </I18nextProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-TW')
  vi.mocked(ledgerApi.fetchLedgerArchive).mockReset()
})

describe('更早归档抽屉', () => {
  it('打开时读取第一页，并按游标续读且不重复', async () => {
    const user = userEvent.setup()
    vi.mocked(ledgerApi.fetchLedgerArchive)
      .mockResolvedValueOnce(archivePage(true) as never)
      .mockResolvedValueOnce(archivePage(false) as never)
    mount()
    await screen.findByText('歸檔0')
    expect(ledgerApi.fetchLedgerArchive).toHaveBeenCalledTimes(1)
    expect(ledgerApi.fetchLedgerArchive).toHaveBeenCalledWith({ keyword: '測試' }, undefined, undefined)

    await user.click(screen.getByRole('button', { name: /載入更多更早記錄/ }))
    await waitFor(() => expect(ledgerApi.fetchLedgerArchive).toHaveBeenCalledTimes(2))
    expect(ledgerApi.fetchLedgerArchive).toHaveBeenLastCalledWith({ keyword: '測試' }, '2025-01-01', 100)
    expect(screen.getByText('已載入 150 條 · 更早歸檔共 150 條')).toBeTruthy()
    expect(screen.getByText('更早歸檔已全部載入（150 條）')).toBeTruthy()
  })

  it('归档只读，并提供返回台账入口', async () => {
    const onClose = vi.fn()
    vi.mocked(ledgerApi.fetchLedgerArchive).mockResolvedValueOnce(archivePage(false) as never)
    mount(onClose)
    await screen.findByText('歸檔100')
    expect(screen.queryByRole('button', { name: /編輯|刪除|恢復/ })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '返回台账' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
