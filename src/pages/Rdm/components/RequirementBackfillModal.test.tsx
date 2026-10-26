/**
 * 批量補錄受理信息彈窗。
 *
 * 釘住兩件事：
 *  1. 承諾出 PRD 日期是必填門檻：沒選日期時確認按鈕禁用（服務端同樣會拒）；
 *  2. 提交時日期按 YYYY-MM-DD 傳、備註去首尾空格，避免把空白說明寫進流水。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import RequirementBackfillModal from './RequirementBackfillModal'

// 選人組件會發遠程搜索請求；本測試只驗證補錄表單，不引入網絡依賴
vi.mock('@/components/EmployeeSelect', () => ({
  default: () => <input aria-label="employee-select" />,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('RequirementBackfillModal', () => {
  it('未選承諾日期時確認按鈕禁用，並展示勾選條數', () => {
    render(
      <RequirementBackfillModal open count={3} saving={false} onClose={() => {}} onSubmit={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: '確認補錄' })).toBeDisabled()
    expect(screen.getByText('3 條')).toBeInTheDocument()
  })

  it('選日期後提交 YYYY-MM-DD 與去空格備註', async () => {
    const onSubmit = vi.fn()
    render(
      <RequirementBackfillModal open count={2} saving={false} onClose={() => {}} onSubmit={onSubmit} />,
    )
    const dateInput = screen.getByPlaceholderText('選擇承諾日期')
    fireEvent.mouseDown(dateInput)
    fireEvent.change(dateInput, { target: { value: '2026-11-30' } })
    fireEvent.keyDown(dateInput, { key: 'Enter', code: 'Enter', keyCode: 13 })

    await waitFor(() => expect(screen.getByRole('button', { name: '確認補錄' })).toBeEnabled())

    fireEvent.change(
      screen.getByPlaceholderText('例：存量導入未走受理流程，補錄承諾日期與產品任務'),
      { target: { value: '  補錄  ' } },
    )
    fireEvent.click(screen.getByRole('button', { name: '確認補錄' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      promisedPrdDate: '2026-11-30',
      pmUserId: undefined,
      remark: '補錄',
    }))
  })
})
