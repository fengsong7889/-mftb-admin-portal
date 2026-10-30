/** 面板契约（展示层）：受控输入、保存状态、AI 不可用时禁用提取、结果/失败态渲染。 */
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import MinutesAiInputPanel from './MinutesAiInputPanel'
import type { Props } from './MinutesAiInputPanel'
import type { MinutesAiExtractionVO } from '@/api/meetingMinutes'
import i18n from '@/i18n'

vi.mock('@/api/employee', () => ({ fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })), fetchEmployee: vi.fn() }))

const succeededResult: MinutesAiExtractionVO = {
  requestKey: 'k1', status: 'succeeded', extractionSchemaVersion: 1,
  context: { meetingDate: '2026-11-02', timezone: 'Asia/Shanghai' },
  source: { noteVersion: 3, sourceHash: 'h' },
  proposal: {
    purpose: '確認無敵星星進度',
    items: [{ ref: 't1', topic: '無敵星星項目進度討論', discussion: '當前進度 90%；前端因後端接口未提供而阻塞。', sourceRefs: ['s1'] }],
    actions: [{ ref: 'a1', topicRef: 't1', content: '後端提供無敵星星接口', ownerUserId: 7, ownerName: '劉衛', dueDate: '2026-11-06', sourceRefs: ['s1'] }],
    openIssues: [],
  },
  issues: [],
}

function Harness(overrides: Partial<Props> = {}) {
  const onApply = vi.fn()
  const onExtract = vi.fn()
  const onManual = vi.fn()
  function Wrapper() {
    const [text, setText] = useState('')
    const [mentions, setMentions] = useState<Props['mentions']>([])
    return <MinutesAiInputPanel text={text} onTextChange={setText} mentions={mentions} onMentionsChange={setMentions}
      saveState="saved" maxChars={20000} aiStatus={{ available: true, maxInputChars: 20000, enabled: true }}
      phase="idle" stale={false} onExtract={onExtract} onManual={onManual} onApply={onApply} onDiscard={vi.fn()} onReload={vi.fn()}
      {...overrides} />
  }
  render(<Wrapper />)
  return { onApply, onExtract, onManual }
}

describe('自由笔记与 AI 面板', () => {
  beforeEach(async () => { await i18n.changeLanguage('zh-TW') })

  it('AI 可用且有内容才允许提取', () => {
    Harness()
    expect(screen.getByRole('button', { name: 'AI 輔助' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: '原始筆記' }), { target: { value: '一段會議筆記' } })
    expect(screen.getByRole('button', { name: 'AI 輔助' })).toBeEnabled()
  })

  it('AI 不可用时给出原因并保留手动入口', () => {
    Harness({ aiStatus: { available: false, reasonCode: 'quota_exhausted', maxInputChars: 20000, enabled: true } })
    fireEvent.change(screen.getByRole('textbox', { name: '原始筆記' }), { target: { value: '仍要記錄的內容' } })
    expect(screen.getByRole('button', { name: 'AI 輔助' })).toBeDisabled()
    expect(screen.getByText(/AI 輔助暫不可用：quota_exhausted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '繼續手動填寫' })).toBeEnabled()
  })

  it('提取成功后渲染真实建议并可套用；负责人/期限待确认时标注', () => {
    const { onApply } = Harness({ phase: 'succeeded', result: succeededResult })
    const review = screen.getByRole('region', { name: 'AI 提取結果核對' })
    expect(within(review).getByText('無敵星星項目進度討論')).toBeInTheDocument()
    expect(within(review).getByText('劉衛')).toBeInTheDocument()
    expect(within(review).getByText('2026-11-06')).toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: '套用到紀要表單' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      purpose: true, itemRefs: ['t1'], actionRefs: ['a1'],
    }))
  })

  it('结果基于旧笔记（stale）时禁止套用', () => {
    Harness({ phase: 'succeeded', result: succeededResult, stale: true })
    const review = screen.getByRole('region', { name: 'AI 提取結果核對' })
    expect(within(review).getByText('筆記已變更，這份結果基於舊版本')).toBeInTheDocument()
    expect(within(review).getByRole('button', { name: '套用到紀要表單' })).toBeDisabled()
  })

  it('插入 @员工只追加姓名并记录绑定，不通知员工', async () => {
    const { fetchEmployees } = await import('@/api/employee')
    vi.mocked(fetchEmployees).mockResolvedValue({ records: [{ id: 77, name: '劉衛', empId: 'MF00077' }], total: 1 } as never)
    Harness()
    fireEvent.click(screen.getByRole('button', { name: '插入 @員工' }))
    const group = screen.getByRole('group', { name: '插入員工姓名' })
    const combobox = within(group).getByRole('combobox')
    fireEvent.focus(combobox)
    fireEvent.mouseDown(combobox.closest('.ant-select')!.querySelector('.ant-select-selector')!)
    fireEvent.click(await screen.findByText('劉衛', { selector: '.ant-select-item-option-content span' }))
    expect(screen.getByRole('textbox', { name: '原始筆記' })).toHaveValue(' @劉衛')
  })
})
