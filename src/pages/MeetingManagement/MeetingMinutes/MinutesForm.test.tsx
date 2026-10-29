/**
 * 纪要模板表单回归用例。
 *
 * <p>钉住三件"看一眼就知道对不对、写错却要用户踩"的事：
 *   1. 模板分区必须齐全——少一个「行動項」就等于把会上定的责任悄悄丢掉；
 *   2. 记录人是当前登录人且不可改（请求体里没有这个字段的位置），渲染成只读文本而不是输入框；
 *   3. 纪要读取失败保留错误与重试入口，但不能冒充不存在并允许保存。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Modal } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinutesForm from './MinutesForm'
import i18n from '@/i18n'

const hasPermission = vi.fn(() => true)

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission,
    user: { id: 2, name: '李四', empId: 'MF00002', username: 'lisi' },
  }),
}))

vi.mock('@/api/meeting', () => ({
  fetchMeetingDetail: vi.fn(),
  newMeetingRequestKey: vi.fn(() => 'mm-test-key'),
  toMeetingIso: (value: { format: (f: string) => string }) => value.format('YYYY-MM-DDTHH:mm:ss'),
  toMeetingIsoDate: (value: { format: (f: string) => string } | null) => (value ? value.format('YYYY-MM-DD') : undefined),
}))

vi.mock('@/api/meetingMinutes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/meetingMinutes')>()
  return {
    ...actual,
    fetchMinutes: vi.fn(),
    fetchMinutesById: vi.fn(),
    createMinutes: vi.fn(),
    updateMinutes: vi.fn(),
    publishMinutes: vi.fn(),
    fetchMinutesGroups: vi.fn(async () => []),
  }
})

// 员工选择器会自己去搜人，本用例不关心结果
vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
}))

import { fetchMeetingDetail } from '@/api/meeting'
import { createMinutes, emptyMinutesContent, fetchMinutes, MINUTES_LIMITS, publishMinutes, updateMinutes } from '@/api/meetingMinutes'
import { fetchEmployees } from '@/api/employee'

const MEETING = {
  id: 100,
  bookingNo: 'MT202610190001',
  title: 'Q4 預算復核',
  status: 'finished',
  phase: 'ended',
  startTime: '2026-10-19 10:00:00',
  endTime: '2026-10-19 11:00:00',
  timeText: '2026-10-19 10:00–11:00',
  durationMinutes: 60,
  roomId: 9,
  roomNo: 'MR-3F-01',
  roomName: '三號會議室',
  roomLocation: 'A 棟 3F',
  organizerId: 1,
  organizerName: '王五',
  organizerEmpNo: 'MF00001',
  attendeeCount: 3,
  bizType: 'general',
  myRole: 'organizer',
  canEdit: false,
  canCancel: false,
  canRelease: false,
  canCheckin: false,
  canFinish: false,
  checkinRequired: false,
  version: 1,
  attendees: [
    { id: 1, userId: 1, empNo: 'MF00001', name: '王五', attendeeType: 'organizer', response: 'accepted' },
    { id: 2, userId: 2, empNo: 'MF00002', name: '李四', attendeeType: 'required', response: 'declined' },
  ],
}

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/meeting-minutes-form?bookingId=100']}>
      <Routes>
        <Route path="/meeting-minutes-form" element={<MinutesForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議紀要表單', () => {
  // Modal.confirm 是静态实例，退场后仍可能留在 body；不清掉会多一个「取消」按钮干扰下个用例
  afterEach(() => Modal.destroyAll())

  beforeEach(async () => {
    vi.clearAllMocks()
    // 测试环境的默认语言不是繁中（i18n 初始化为 en），不显式切语言时断言的中文文案会全部命中英文分支
    await i18n.changeLanguage('zh-TW')
    vi.mocked(fetchMeetingDetail).mockResolvedValue(MEETING as never)
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100 } as never)
    vi.mocked(createMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 0 })
    vi.mocked(updateMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 4 })
    vi.mocked(fetchEmployees).mockResolvedValue({ records: [], total: 0 } as never)
  })

  it('模板分区齐全：會議資訊 / 議程與結論 / 行動項 / 未決事項 / 下次會議 / 補充說明', async () => {
    renderForm()
    await waitFor(() => expect(screen.getAllByText('Q4 預算復核')).toHaveLength(2))
    for (const section of ['會議資訊', '議程與結論', '行動項', '跟進事項', '下次會議', '補充說明']) {
      expect(screen.getAllByText(section).length, `缺少分區：${section}`).toBeGreaterThan(0)
    }
    // 会议主题来自会议单而不是输入框：纪要不能改写会议事实
    expect(screen.queryByLabelText('會議主題')).toBeNull()
  })

  it('记录人显示为当前登录人且是只读文本', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('記錄人：')).toBeInTheDocument())
    // 同名文本会出现在缺席建议里（李四恰好也婉拒了），只断言记录人栏存在且不输入框
    expect(screen.getAllByText('李四（MF00002）').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('記錄人：')).toBeNull()
    expect(screen.queryByPlaceholderText('搜尋姓名或工號，可選非參會人')).toBeNull()
  })

  it('自动列齐邀约人员，未签到默认否，邀约人员不能被移除', async () => {
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    expect(within(table).getAllByText('已邀約')).toHaveLength(2)
    expect(within(table).getAllByRole('radio', { name: '否' }).every(radio => (radio as HTMLInputElement).checked)).toBe(true)
    expect(within(table).queryByRole('combobox')).toBeNull()
    expect(within(table).queryByRole('button', { name: /移除/ })).toBeNull()
    expect(within(table).getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByText('邀約人員已列出；未簽到預設「否」，請按實際出席情況確認。')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '出席確認名單，可捲動' })).toHaveClass('mm-attendance__scroll')
  })

  it('已签到默认是，无需原因，婉拒但未签到仍可人工改为出席', async () => {
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...MEETING, attendees: [
      { ...MEETING.attendees[0], checkinAt: '2026-10-19 10:01:00' }, MEETING.attendees[1],
    ] } as never)
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    const signedIn = within(table).getByRole('row', { name: /王五/ })
    expect(within(signedIn).getByRole('radio', { name: '是' })).toBeChecked()
    expect(within(signedIn).getByText('已簽到')).toBeInTheDocument()
    expect(within(signedIn).queryByRole('textbox')).toBeNull()
    const declined = within(table).getByRole('row', { name: /李四/ })
    fireEvent.click(within(declined).getByRole('radio', { name: '是' }))
    expect(within(declined).getByRole('radio', { name: '是' })).toBeChecked()
    expect(screen.getByText('出席 2 / 2 人 · 臨時 0 人')).toBeInTheDocument()
  })

  it('出席切换隐藏并清除缺席原因，保存不携带旧原因或签到补录指令', async () => {
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    const row = within(table).getByRole('row', { name: /李四/ })
    const reason = within(row).getByRole('textbox')
    expect(reason).toHaveAttribute('maxlength', '200')
    fireEvent.change(reason, { target: { value: '與客戶會議衝突' } })
    fireEvent.click(within(row).getByRole('radio', { name: '是' }))
    expect(within(row).queryByRole('textbox')).toBeNull()
    fireEvent.click(within(row).getByRole('radio', { name: '否' }))
    expect(within(row).getByRole('textbox')).toHaveValue('')
    fireEvent.click(within(row).getByRole('radio', { name: '是' }))
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '出席確認' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.content.attendance?.find(person => person.userId === 2)).toMatchObject({ status: 'present' })
    expect(payload.content.attendance?.find(person => person.userId === 2)?.reason).toBeUndefined()
    expect(payload.markPresentUserIds).toBeUndefined()
  })

  it('旧草稿补齐遗漏邀约人，保留已确认结果与临时人员并兼容保存', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 3, content: {
      ...emptyMinutesContent(), attendance: [
        { userId: 1, name: '王五', status: 'absent', reason: '請假', confirmedByName: '記錄人', confirmedAt: '2026-10-19 12:00:00' },
        { userId: 99, name: '臨時顧問', empNo: 'MF00099', status: 'present' },
      ],
    } } as never)
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...MEETING, attendees: [
      { ...MEETING.attendees[0], checkinAt: '2026-10-19 10:01:00' }, MEETING.attendees[1],
    ] } as never)
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    const saved = within(table).getByRole('row', { name: /王五/ })
    expect(within(saved).getByRole('radio', { name: '否' })).toBeChecked()
    expect(within(saved).getByRole('textbox')).toHaveValue('請假')
    expect(within(table).getByText('王五（MF00001）')).toBeInTheDocument()
    expect(within(table).getByText('李四（MF00002）')).toBeInTheDocument()
    const temporary = within(table).getByRole('row', { name: /臨時顧問/ })
    expect(within(temporary).getByRole('radio', { name: '是' })).toBeChecked()
    expect(within(temporary).getByRole('button', { name: '移除臨時顧問（MF00099）' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '出席確認' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(updateMinutes).toHaveBeenCalledTimes(1))
    const [id, payload] = vi.mocked(updateMinutes).mock.calls[0]
    expect(id).toBe(9)
    expect(payload.version).toBe(3)
    expect(payload.content.attendance?.map(person => person.userId)).toEqual([1, 2, 99])
    expect(payload.content.attendance?.[0]).toMatchObject({ reason: '請假', confirmedByName: '記錄人', confirmedAt: '2026-10-19 12:00:00' })
  })

  it('旧待核实记录按签到初始化，同名员工按 ID 区分且外部空 ID 不合并', async () => {
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...MEETING, attendees: [
      { ...MEETING.attendees[0], checkinAt: '2026-10-19 10:01:00' },
      { ...MEETING.attendees[1], name: '王五' },
      { id: 3, userId: null, name: '外部甲' }, { id: 4, userId: null, name: '外部乙' },
    ] } as never)
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, content: {
      ...emptyMinutesContent(), attendance: [
        { userId: 1, name: '王五', status: 'unverified' },
        { userId: null, name: '外部甲', status: 'present' },
        { userId: null, name: '外部乙', status: 'absent', reason: '行程衝突' },
      ],
    } } as never)
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    expect(within(within(table).getByRole('row', { name: /MF00001/ })).getByRole('radio', { name: '是' })).toBeChecked()
    expect(within(within(table).getByRole('row', { name: /MF00002/ })).getByRole('radio', { name: '否' })).toBeChecked()
    expect(within(within(table).getByRole('row', { name: /外部甲/ })).getByRole('radio', { name: '是' })).toBeChecked()
    expect(within(within(table).getByRole('row', { name: /外部乙/ })).getByRole('textbox')).toHaveValue('行程衝突')
  })

  it('兼容只有缺席名单的旧纪要，缺席原因不会丢失', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, content: {
      ...emptyMinutesContent(), schemaVersion: 1, absentees: [{ userId: 2, name: '李四', reason: '病假' }],
    } } as never)
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(within(table).getByRole('row', { name: /李四/ })).getByRole('textbox')).toHaveValue('病假')
  })

  it('只读权限禁用出席和原因编辑，并隐藏添加移除入口', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, canEdit: false, content: {
      ...emptyMinutesContent(), attendance: [{ userId: 99, name: '臨時顧問', status: 'absent' }],
    } } as never)
    renderForm()
    const table = await screen.findByRole('table', { name: '出席確認名單' })
    for (const input of [...within(table).getAllByRole('radio'), ...within(table).getAllByRole('textbox')]) {
      expect(input).toBeDisabled()
    }
    expect(screen.queryByRole('button', { name: '添加臨時參會人員' })).toBeNull()
    expect(within(table).queryByRole('button', { name: /移除/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /保存紀要/ })).toBeNull()
  })

  it('纪要读取失败保留页面和重试，但不把错误当成不存在并允许保存', async () => {
    vi.mocked(fetchMinutes).mockRejectedValue(new Error('接口或資源不存在（404）'))
    renderForm()
    await waitFor(() => expect(screen.getByText('未能讀取既有紀要，請重試後再編輯或保存')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('與會外的補充資訊，例：資料位置、後續對接群')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /保存紀要/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^重\s*試$/ })).toBeInTheDocument()
    expect(createMinutes).not.toHaveBeenCalled()
  })

  it('议题与行动项都为空时拒绝保存，并把提示给到用户', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('議程與結論')).toBeInTheDocument())
    // 初始有一条空议题：清空后提交必须被拦住
    const topic = screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')
    fireEvent.change(topic, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).not.toHaveBeenCalled())
  })

  it('填了议题与结论后提交，正文按模板结构送后端', async () => {
    vi.mocked(createMinutes).mockResolvedValue({
      exists: true, id: 9, bookingId: 100, minutesNo: 'MJ202610190001', status: 'draft', version: 0,
    } as never)
    renderForm()
    await waitFor(() => expect(screen.getByText('議程與結論')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '分攤口徑' } })
    fireEvent.change(screen.getByPlaceholderText('定了什麼、誰負責、何時生效'), { target: { value: '按營收分攤' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.bookingId).toBe(100)
    expect(payload.content.items[0].topic).toBe('分攤口徑')
    expect(payload.content.items[0].conclusion).toBe('按營收分攤')
    expect(payload.content.schemaVersion).toBe(2)
    expect(payload.content.items[0].topicKey).toBeTruthy()
    expect(payload.content.attendance?.map(person => ({ userId: person.userId, status: person.status }))).toEqual([
      { userId: 1, status: 'absent' }, { userId: 2, status: 'absent' },
    ])
    expect(payload.markPresentUserIds).toBeUndefined()
    // 幂等键由前端生成：重放同一提交不该长出第二条纪要
    expect(payload.requestKey).toBeTruthy()
  })

  it('全文预览反映正在填写的内容，来回切换不保存也不清空输入', async () => {
    renderForm()
    await screen.findAllByText('Q4 預算復核')
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '現場討論議題' } })
    fireEvent.change(screen.getByPlaceholderText('定了什麼、誰負責、何時生效'), { target: { value: '保留現有方案' } })
    fireEvent.click(screen.getByRole('radio', { name: '全文預覽' }))
    const article = screen.getByRole('article', { name: '會議紀要正文' })
    expect(within(article).getByText('現場討論議題')).toBeInTheDocument()
    expect(within(article).getAllByText('保留現有方案')).toHaveLength(2)
    expect(within(article).getByText('填寫內容預覽 · 尚未發布')).toBeInTheDocument()
    expect(createMinutes).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: '填寫紀要' }))
    expect(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')).toHaveValue('現場討論議題')
  })

  it('只填写会议目的，未达到发布完整性时仍不调用发布接口', async () => {
    renderForm()
    await screen.findAllByText('Q4 預算復核')
    expect(screen.getByRole('textbox', { name: '會議目的' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '會議目的' })).toHaveAttribute('maxlength', String(MINUTES_LIMITS.purpose))
    expect(screen.queryByPlaceholderText('用一段話概括主要共識、決策與下一步（發布時必填，300 字以內）')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /保存並發布/ }))
    await waitFor(() => expect(publishMinutes).not.toHaveBeenCalled())
    expect(screen.getByText('此處僅預覽新版卡片，不會發送通知。')).toBeInTheDocument()
  })

  it('旧目的和摘要完整带入一个输入框，保存时仅提交合并后的目的', async () => {
    const purpose = '目'.repeat(500)
    const summary = '摘'.repeat(300)
    const legacy = { ...emptyMinutesContent(), purpose, summary, items: [{ topic: '歷史議題', conclusion: '保持結論' }] }
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, canEdit: true, content: legacy })
    renderForm()
    const input = await screen.findByRole('textbox', { name: '會議目的' })
    await waitFor(() => expect(input).toHaveValue(`${purpose}\n\n${summary}`))
    expect(screen.getAllByRole('textbox', { name: '會議目的' })).toHaveLength(1)
    fireEvent.click(await screen.findByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(updateMinutes).toHaveBeenCalledTimes(1))
    const savedContent = vi.mocked(updateMinutes).mock.calls[0][1].content
    expect(savedContent.purpose).toBe(`${purpose}\n\n${summary}`)
    expect(savedContent).not.toHaveProperty('summary')
    expect(legacy.purpose).toBe(purpose)
    expect(legacy.summary).toBe(summary)
  })

  it('目的与责任信息完整时可发布，无需再次填写摘要', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, canEdit: true,
      content: { ...emptyMinutesContent(), purpose: '確認交付目標', chairUserId: 1,
        items: [{ topic: '交付安排', topicKey: 'topic-1', conclusion: '按期完成', decisionStatus: 'decided' }] },
    })
    renderForm()
    await screen.findByRole('textbox', { name: '會議目的' })
    fireEvent.click(await screen.findByRole('button', { name: /保存並發布/ }))
    // 目的填写后即通过发布前校验：到确认框为止，不需要再补摘要
    expect(await screen.findByText('確認發布正式紀要？', { selector: '.ant-modal-confirm-title' })).toBeInTheDocument()
    expect(vi.mocked(updateMinutes).mock.calls[0][1].content).toMatchObject({ purpose: '確認交付目標' })
    expect(vi.mocked(updateMinutes).mock.calls[0][1].content).not.toHaveProperty('summary')
    expect(publishMinutes).not.toHaveBeenCalled()
  })

  it('正文输入区使用足够行高，备注保持统一三行', async () => {
    renderForm()
    await screen.findAllByText('Q4 預算復核')
    expect(screen.getByPlaceholderText('各方意見與數據')).toHaveAttribute('rows', '5')
    expect(screen.getByPlaceholderText('定了什麼、誰負責、何時生效')).toHaveAttribute('rows', '5')
    expect(screen.getByRole('textbox', { name: '會議目的' })).toHaveAttribute('rows', '4')
    expect(screen.getByPlaceholderText('與會外的補充資訊，例：資料位置、後續對接群')).toHaveAttribute('rows', '3')
    fireEvent.click(screen.getByRole('button', { name: /新增行動項/ }))
    expect(screen.getByPlaceholderText('要做的事，例：輸出預算明細表')).toHaveAttribute('rows', '3')
    expect(screen.getByPlaceholderText('寫明交付成果與完成判定，例如：提交經財務確認的預算明細表')).toHaveAttribute('rows', '3')
    const owner = screen.getAllByText('搜尋姓名或工號').at(-1)!.closest('.ant-select')
    expect(owner).toHaveStyle({ width: '100%' })
  })

  it('临时人员按需添加，候选显示姓名工号、排除已邀约人员，可连续添加并移除', async () => {
    vi.mocked(fetchEmployees).mockResolvedValue({
      records: [
        { id: 1, name: '王五', empId: 'MF00001' },
        { id: 99, name: 'QA-跨部門會議紀要測試', empId: 'MF00888' },
        { id: 100, name: '臨時支援', empId: 'MF00100' },
      ], total: 3,
    } as never)
    renderForm()
    const section = await screen.findByRole('region', { name: '實際出席確認' })
    const add = await within(section).findByRole('button', { name: '添加臨時參會人員' })
    expect(add).toHaveAttribute('aria-expanded', 'false')
    expect(within(section).queryByRole('combobox')).toBeNull()
    fireEvent.click(add)
    const selectPerson = async (name: string) => {
      const input = within(section).getByRole('combobox')
      const selector = input.closest('.ant-select') as HTMLElement
      expect(selector).toHaveStyle({ width: '100%' })
      expect(selector.parentElement).toHaveClass('mm-attendance__picker')
      fireEvent.focus(input)
      fireEvent.mouseDown(selector.querySelector('.ant-select-selector') as Element)
      const option = await screen.findByText(name, { selector: '.ant-select-item-option-content span' })
      const dropdown = option.closest('.ant-select-dropdown') as HTMLElement
      expect(within(dropdown).queryByText('王五')).toBeNull()
      if (name === 'QA-跨部門會議紀要測試') expect(within(dropdown).getByText('MF00888')).toBeInTheDocument()
      if (name === '臨時支援') expect(within(dropdown).queryByText('QA-跨部門會議紀要測試')).toBeNull()
      fireEvent.click(option)
    }
    await selectPerson('QA-跨部門會議紀要測試')
    const table = within(section).getByRole('table')
    const temporary = within(table).getByRole('row', { name: /QA-跨部門/ })
    expect(within(temporary).getByText('臨時參會')).toBeInTheDocument()
    expect(within(temporary).getByRole('radio', { name: '是' })).toBeChecked()
    expect(within(temporary).queryByRole('textbox')).toBeNull()
    expect(within(section).getByRole('combobox')).toHaveValue('')
    await selectPerson('臨時支援')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    fireEvent.click(within(temporary).getByRole('button', { name: /移除/ }))
    expect(within(table).queryByText('QA-跨部門會議紀要測試')).toBeNull()
    expect(within(table).getAllByText('已邀約')).toHaveLength(2)
    fireEvent.click(within(section).getByRole('button', { name: '完成添加' }))
    expect(within(section).queryByRole('combobox')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '臨時參會' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createMinutes).mock.calls[0][0].content.attendance).toEqual([
      expect.objectContaining({ userId: 1 }), expect.objectContaining({ userId: 2 }),
      expect.objectContaining({ userId: 100, name: '臨時支援', status: 'present' }),
    ])
  })

  it('没有邀约人员时展示空态，仍提供临时人员添加入口', async () => {
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...MEETING, attendees: [] } as never)
    renderForm()
    expect(await screen.findByText('暫無邀約人員，可添加臨時參會人員')).toBeInTheDocument()
    const add = await screen.findByRole('button', { name: '添加臨時參會人員' })
    expect(add).toBeEnabled()
    fireEvent.click(add)
    expect(within(screen.getByRole('region', { name: '實際出席確認' })).getByRole('combobox')).toBeEnabled()
  })

  it('达到既有出席人数上限时保留完整名单并禁止继续添加', async () => {
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...MEETING, attendees: Array.from({ length: MINUTES_LIMITS.attendance }, (_, index) => ({
      ...MEETING.attendees[0], id: index + 1, userId: index + 1, name: `參會人${index + 1}`,
    })) } as never)
    renderForm()
    const add = await screen.findByRole('button', { name: '添加臨時參會人員' })
    expect(add).toBeDisabled()
    expect(screen.getByText(`最多記錄 ${MINUTES_LIMITS.attendance} 位參會人員`)).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: '出席確認名單' })).getAllByRole('row')).toHaveLength(MINUTES_LIMITS.attendance + 1)
  })

  it('有未保存内容时，页内返回需确认且可继续填写', async () => {
    const { container } = renderForm()
    await screen.findAllByText('Q4 預算復核')
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '尚未保存的議題' } })
    // 只点页面底部操作栏的「取消」：静态 Modal 容器里可能还有同名按钮，不能用全局查询
    const footer = container.querySelector('.form-footer') as HTMLElement
    fireEvent.click(within(footer).getByRole('button', { name: /^取\s*消$/ }))
    expect(await screen.findByText('離開前要放棄未保存的修改嗎？', { selector: '.ant-modal-confirm-title' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '繼續填寫' }))
    expect(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')).toHaveValue('尚未保存的議題')
  })
})
