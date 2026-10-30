/** 面板契约（展示层）：受控输入、保存状态、AI 不可用时禁用提取、结果/失败态渲染。 */
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  const onMentionsChange = vi.fn()
  const onReload = vi.fn()
  function Wrapper() {
    const [text, setText] = useState('')
    const [mentions, setMentions] = useState<Props['mentions']>([])
    return <MinutesAiInputPanel text={text} onTextChange={setText} mentions={mentions}
      onMentionsChange={next => { onMentionsChange(next); setMentions(next) }}
      saveState="saved" maxChars={20000} aiStatus={{ available: true, maxInputChars: 20000, enabled: true }}
      phase="idle" stale={false} onExtract={onExtract} onManual={onManual} onApply={onApply} onDiscard={vi.fn()} onReload={onReload}
      {...overrides} />
  }
  render(<Wrapper />)
  return { onApply, onExtract, onManual, onMentionsChange, onReload }
}

const people = [
  { id: 77, name: '劉衛', empId: 'MF00077' },
  { id: 78, name: '陳雨', empId: 'MF00078' },
]

function typeMention(value: string, cursor = value.length) {
  const input = screen.getByRole('textbox', { name: '原始筆記' })
  fireEvent.change(input, { target: { value, selectionStart: cursor, selectionEnd: cursor } })
  fireEvent.keyUp(input, { key: '@', keyCode: 50 })
  return input
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
    expect(screen.getByText('AI 輔助暫不可用：AI 使用額度不足')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '繼續手動填寫' })).toBeEnabled()
  })

  it('未授予 AI 权限时隐藏提取入口，仅保留手动填写', () => {
    Harness({ aiStatus: { available: false, authorized: false, reasonCode: 'no_permission', maxInputChars: 20000, enabled: true } })
    fireEvent.change(screen.getByRole('textbox', { name: '原始筆記' }), { target: { value: '仍要記錄的內容' } })
    expect(screen.queryByRole('button', { name: 'AI 輔助' })).not.toBeInTheDocument()
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

  it('功能关闭提示可读原因并支持重新检查，不放开 AI 按钮', () => {
    const onRefreshAiStatus = vi.fn()
    Harness({ aiStatus: { available: false, reasonCode: 'feature_off', enabled: false, maxInputChars: 20000 }, onRefreshAiStatus })
    expect(screen.getByText('AI 輔助暫不可用：管理員尚未開啟會議 AI 輔助')).toBeInTheDocument()
    expect(screen.queryByText(/feature_off/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }))
    expect(onRefreshAiStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'AI 輔助' })).toBeDisabled()
  })

  it('预检不冒充正在整理笔记，且禁止重复提取', () => {
    Harness({ phase: 'checking' })
    fireEvent.change(screen.getByRole('textbox', { name: '原始筆記' }), { target: { value: '一段筆記' } })
    expect(screen.getByText('正在檢查 AI 可用狀態…')).toBeInTheDocument()
    expect(screen.queryByText('AI 正在整理筆記……')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 輔助' })).toBeDisabled()
  })

  it('输入 @ 直接显示参会人，选择后只插姓名并保存真实 ID', async () => {
    const { onMentionsChange } = Harness({ people })
    const input = typeMention('@')
    expect(await screen.findByText('MF00077')).toBeInTheDocument()
    fireEvent.click(screen.getByText('劉衛', { selector: '.mm-ai__person span' }))
    expect(input).toHaveValue('@劉衛 ')
    expect(onMentionsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ userId: 77, name: '劉衛', mentionRef: expect.any(String) }),
    ])
    expect(screen.queryByRole('group', { name: '插入員工姓名' })).not.toBeInTheDocument()
  })

  it('支持工号筛选与方向键、回车选人', async () => {
    const { onMentionsChange } = Harness({ people })
    const input = typeMention('@MF00078')
    expect(await screen.findByText('MF00078', { selector: '.mm-ai__person small' })).toBeInTheDocument()
    expect(screen.queryByText('MF00077')).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 40 })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    expect(input).toHaveValue('@陳雨 ')
    expect(onMentionsChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: 78 })])
  })

  it('姓名重复时按工号和 ID 区分，不把第二个人绑定到第一个', async () => {
    const { onMentionsChange } = Harness({ people: [people[0], { id: 99, name: '劉衛', empId: 'MF00099' }] })
    typeMention('@')
    fireEvent.click(await screen.findByText('MF00099'))
    expect(onMentionsChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: 99, name: '劉衛' })])
  })

  it('在笔记中间选人保留前后文，删除姓名后清除绑定', async () => {
    const { onMentionsChange } = Harness({ people })
    const input = typeMention('請 @ 明天提交', 3)
    fireEvent.click(await screen.findByText('MF00077'))
    expect(input).toHaveValue('請 @劉衛 明天提交')
    fireEvent.change(input, { target: { value: '請明天提交' } })
    expect(onMentionsChange).toHaveBeenLastCalledWith([])
  })

  it('Esc 关闭候选但保留原文，中文输入法确认不会误选人', async () => {
    const { onMentionsChange } = Harness({ people })
    const input = typeMention('@')
    await screen.findByText('MF00077')
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true })
    expect(input).toHaveValue('@')
    expect(onMentionsChange).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 27 })
    await waitFor(() => expect(screen.queryByText('MF00077')).not.toBeInTheDocument())
    expect(input).toHaveValue('@')
  })

  it('候选为空时提供全员搜索提示，载入笔记期间禁用编辑', async () => {
    const view = render(<MinutesAiInputPanel text="" onTextChange={vi.fn()} mentions={[]} onMentionsChange={vi.fn()}
      saveState="loading" maxChars={20000} phase="idle" stale={false} onExtract={vi.fn()} onManual={vi.fn()}
      onApply={vi.fn()} onDiscard={vi.fn()} onReload={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: '原始筆記' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '插入 @員工' })).toBeDisabled()
    view.unmount()
    Harness()
    typeMention('@')
    expect(await screen.findByText('未找到參會人，可用「插入 @員工」搜尋')).toBeInTheDocument()
  })

  it('选人后超过上限时保留原文且不记录绑定', async () => {
    const { onMentionsChange } = Harness({ people, maxChars: 3 })
    const input = typeMention('@')
    fireEvent.click(await screen.findByText('MF00077'))
    expect(input).toHaveValue('@')
    expect(onMentionsChange).not.toHaveBeenCalled()
  })

  it('输入框失焦主动同步笔记', async () => {
    const { onReload } = Harness()
    const input = screen.getByRole('textbox', { name: '原始筆記' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '同步內容' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  })

  it('通用员工搜索在原光标处插入，不覆盖后文、不通知员工', async () => {
    const { fetchEmployees } = await import('@/api/employee')
    vi.mocked(fetchEmployees).mockResolvedValue({ records: [{ id: 77, name: '劉衛', empId: 'MF00077' }], total: 1 } as never)
    const { onMentionsChange } = Harness()
    const input = screen.getByRole('textbox', { name: '原始筆記' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '請 明天交付', selectionStart: 2, selectionEnd: 2 } })
    fireEvent.blur(input)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    fireEvent.click(screen.getByRole('button', { name: '插入 @員工' }))
    const group = screen.getByRole('group', { name: '插入員工姓名' })
    const combobox = within(group).getByRole('combobox')
    fireEvent.focus(combobox)
    fireEvent.mouseDown(combobox.closest('.ant-select')!.querySelector('.ant-select-selector')!)
    fireEvent.click(await screen.findByText('劉衛', { selector: '.ant-select-item-option-content span' }))
    expect(input).toHaveValue('請 @劉衛 明天交付')
    expect(onMentionsChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: 77, name: '劉衛' })])
  })
})
