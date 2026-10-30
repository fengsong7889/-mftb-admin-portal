/**
 * 纪要模板表单回归用例。
 *
 * <p>钉住三件"看一眼就知道对不对、写错却要用户踩"的事：
 *   1. 模板分区必须齐全——少一个「行動項」就等于把会上定的责任悄悄丢掉；
 *   2. 记录人是当前登录人且不可改（请求体里没有这个字段的位置），渲染成只读文本而不是输入框；
 *   3. 纪要读取失败保留错误与重试入口，但不能冒充不存在并允许保存。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Modal } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinutesForm from './MinutesForm'
import MinutesContentCard from './MinutesContentCard'
import i18n from '@/i18n'

const hasPermission = vi.fn(() => true)
const realModalConfirm = Modal.confirm

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
    uploadMinutesAttachment: vi.fn(),
    deleteMinutesAttachment: vi.fn(async () => undefined),
    fetchMinutesAttachmentAccess: vi.fn(),
    // AI 辅助录入：笔记/提取接口默认返回空态，具体用例按需覆盖
    fetchMinutesNote: vi.fn(async () => ({ exists: false, rawText: '', mentions: [], noteVersion: 0, maxChars: 20000 })),
    saveMinutesNote: vi.fn(async (payload: { noteVersion: number }) => ({ exists: true, rawText: '', mentions: [], noteVersion: (payload?.noteVersion ?? 0) + 1, maxChars: 20000 })),
    fetchMinutesAiStatus: vi.fn(async () => ({ available: false, reasonCode: 'feature_off', maxInputChars: 20000, enabled: false })),
    extractMinutesAi: vi.fn(),
    fetchMinutesAiExtraction: vi.fn(),
  }
})

// 员工选择器会自己去搜人，本用例不关心结果
vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
}))

import { fetchMeetingDetail } from '@/api/meeting'
import {
  createMinutes, deleteMinutesAttachment, emptyMinutesContent, fetchMinutes, fetchMinutesAttachmentAccess,
  extractMinutesAi, fetchMinutesAiStatus, saveMinutesNote,
  MINUTES_LIMITS, publishMinutes, updateMinutes, uploadMinutesAttachment,
  type MinutesAttachmentVO,
} from '@/api/meetingMinutes'
import { fetchEmployees } from '@/api/employee'

function selectAttachments(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  fireEvent.change(input!, { target: { files } })
}

/** 服务端回传的附件元数据样行：attachmentNo 为 32 位 hex（与后端契约同形态） */
function attVo(no: string, fileName: string, previewKind: MinutesAttachmentVO['previewKind']): MinutesAttachmentVO {
  return { attachmentNo: no, fileName, mimeType: 'application/octet-stream', sizeBytes: 2048, previewKind, uploaderName: '李四', uploadedAt: '2026-10-29 10:00:00' }
}

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

function renderForm(initialEntry = '/meeting-minutes-form?bookingId=100') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/meeting-minutes-form" element={<MinutesForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議紀要表單', () => {
  // Modal.confirm 是静态实例，退场后仍可能留在 body；不清掉会多一个「取消」按钮干扰下个用例
  afterEach(async () => {
    await act(async () => { Modal.destroyAll() })
    await waitFor(() => expect(document.querySelector('.ant-modal-confirm')).toBeNull())
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    // jsdom 不触发 CSS 动画结束事件；仅取消测试内动效，保留真实弹窗和确认回调。
    vi.spyOn(Modal, 'confirm').mockImplementation(options => realModalConfirm({ ...options, transitionName: '', maskTransitionName: '' }))
    // 测试环境的默认语言不是繁中（i18n 初始化为 en），不显式切语言时断言的中文文案会全部命中英文分支
    await i18n.changeLanguage('zh-TW')
    vi.mocked(fetchMeetingDetail).mockResolvedValue(MEETING as never)
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100 } as never)
    vi.mocked(createMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 0 })
    vi.mocked(updateMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 4 })
    vi.mocked(fetchEmployees).mockResolvedValue({ records: [], total: 0 } as never)
    vi.mocked(deleteMinutesAttachment).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('下次会议默认关闭，开启后显示字段，反复切换保留本次输入', async () => {
    renderForm()
    const toggle = await screen.findByRole('switch', { name: '下次會議' })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByLabelText('下次會議時間')).toBeNull()
    expect(screen.queryByLabelText('議程預告')).toBeNull()
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText('議程預告'), { target: { value: '帶明細表復核' } })
    expect(screen.getByLabelText('下次會議時間')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByLabelText('議程預告')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByLabelText('議程預告')).toHaveValue('帶明細表復核')
  })

  it('旧纪要有下次会议时自动开启，关闭保存不会提交隐藏字段', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({
      exists: true, id: 9, bookingId: 100, canEdit: true, version: 3,
      content: {
        ...emptyMinutesContent(), items: [{ topic: '預算復核' }],
        nextMeetingAt: '2026-11-02 10:00', nextMeetingNote: '帶明細表復核',
      },
    })
    vi.mocked(updateMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, version: 4 })
    renderForm()
    const toggle = await screen.findByRole('switch', { name: '下次會議' })
    expect(toggle).toBeChecked()
    expect(screen.getByLabelText('議程預告')).toHaveValue('帶明細表復核')
    expect(screen.getByLabelText('下次會議時間')).toHaveValue('2026-11-02 10:00')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(updateMinutes).toHaveBeenCalledTimes(1))
    const content = vi.mocked(updateMinutes).mock.calls[0][1].content
    expect(content.nextMeetingAt).toBeNull()
    expect(content.nextMeetingNote).toBe('')
    const detail = render(<MinutesContentCard content={content} />)
    expect(within(detail.container).queryByText('下次會議')).toBeNull()
  })

  it('下次会议开启时沿用原契约保存议程内容', async () => {
    vi.mocked(createMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100 })
    renderForm()
    fireEvent.click(await screen.findByRole('switch', { name: '下次會議' }))
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '預算复核' } })
    fireEvent.change(screen.getByLabelText('議程預告'), { target: { value: '討論下季度計劃' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createMinutes).mock.calls[0][0].content.nextMeetingNote).toBe('討論下季度計劃')
  })

  it('附件选择即上传：成功后进入列表，保存时随正文提交附件号', async () => {
    vi.mocked(uploadMinutesAttachment)
      .mockResolvedValueOnce(attVo('a'.repeat(32), '會議資料.pdf', 'pdf'))
      .mockResolvedValueOnce(attVo('b'.repeat(32), '白板.png', 'image'))
    renderForm()
    await screen.findByRole('button', { name: /選擇附件/ })
    selectAttachments([
      new File(['%PDF-1.4'], '會議資料.pdf', { type: 'application/pdf' }),
      new File(['image'], '白板.png', { type: 'image/png' }),
    ])
    await screen.findByRole('listitem', { name: '白板.png' })
    expect(uploadMinutesAttachment).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadMinutesAttachment).mock.calls[0][0]).toBe(100)
    expect(vi.mocked(uploadMinutesAttachment).mock.calls[0][1].name).toBe('會議資料.pdf')
    expect(typeof vi.mocked(uploadMinutesAttachment).mock.calls[0][2]).toBe('string')
    // 上传完成后保存不再被拦
    expect(screen.getByRole('button', { name: /保存紀要/ })).toBeEnabled()
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '預算復核' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createMinutes).mock.calls[0][0].content.attachments).toEqual(['a'.repeat(32), 'b'.repeat(32)])
  })

  it('上传失败可原地重试：重试前保存/发布禁用，不会静默丢附件', async () => {
    vi.mocked(uploadMinutesAttachment)
      .mockRejectedValueOnce(new Error('存儲暫時不可用'))
      .mockResolvedValueOnce(attVo('c'.repeat(32), '說明.doc', 'office'))
    renderForm()
    await screen.findByRole('button', { name: /選擇附件/ })
    selectAttachments([new File(['word'], '說明.doc', { type: 'application/msword' })])
    await screen.findByText('存儲暫時不可用')
    expect(screen.getByRole('button', { name: /保存紀要/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /保存並發布/ })).toBeDisabled()
    expect(createMinutes).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    await screen.findByRole('listitem', { name: '說明.doc' })
    expect(screen.getByRole('button', { name: /保存紀要/ })).toBeEnabled()
    // 重试复用同一幂等键：服务端不会因重试重复占用存储
    expect(uploadMinutesAttachment).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadMinutesAttachment).mock.calls[0][2])
      .toBe(vi.mocked(uploadMinutesAttachment).mock.calls[1][2])
  })

  it('客户端预检拒绝非白名单类型、MIME 不匹配、空文件与超限文件，不发起上传', async () => {
    renderForm()
    await screen.findByRole('button', { name: /選擇附件/ })
    const oversized = new File(['pdf'], '過大.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 })
    selectAttachments([
      new File(['<svg/>'], '圖片.svg', { type: 'image/svg+xml' }),
      new File(['<script/>'], '假圖.png', { type: 'text/html' }),
      new File([], '空文件.pdf', { type: 'application/pdf' }),
      new File(['bad'], '未知.constructor'),
      oversized,
    ])
    await screen.findByText(/部分文件未加入/)
    expect(screen.queryByRole('list', { name: '紀要附件' })).toBeNull()
    expect(uploadMinutesAttachment).not.toHaveBeenCalled()
  })

  it('附件超上限明确提示；移除后释放名额并通知服务端回收未绑定附件', async () => {
    // 附件号按文件名首字符生成 32 位 hex，便于断言"移除的是哪一行"
    vi.mocked(uploadMinutesAttachment).mockImplementation(async (_booking, file) =>
      attVo(file.name.charAt(0).repeat(32), file.name, 'pdf'))
    renderForm()
    await screen.findByRole('button', { name: /選擇附件/ })
    selectAttachments(Array.from({ length: 6 }, (_, index) => new File(['%PDF'], `${index}.pdf`, { type: 'application/pdf' })))
    await screen.findByText(/超出部分未加入/)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5))
    expect(screen.getByRole('button', { name: /選擇附件/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '移除 0.pdf' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4))
    expect(deleteMinutesAttachment).toHaveBeenCalledWith('0'.repeat(32))
    expect(screen.getByRole('button', { name: /選擇附件/ })).toBeEnabled()
  })

  it('编辑既有纪要回显服务端附件元数据，删除只移除引用不伪造删除成功', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({
      exists: true, id: 9, bookingId: 100, canEdit: true, version: 3,
      content: { ...emptyMinutesContent(), items: [{ topic: '預算復核' }], attachments: ['d'.repeat(32)] },
      attachments: [attVo('d'.repeat(32), '紀要附件.docx', 'office')],
    })
    renderForm()
    await screen.findByRole('listitem', { name: '紀要附件.docx' })
    fireEvent.click(screen.getByRole('button', { name: '移除 紀要附件.docx' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: '紀要附件' })).toBeNull())
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '口徑' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(updateMinutes).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateMinutes).mock.calls[0][1].content.attachments).toEqual([])
  })

  it('只读纪要不能操作下次会议开关或选择附件', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({
      exists: true, id: 9, bookingId: 100, canEdit: false,
      content: { ...emptyMinutesContent(), nextMeetingNote: '舊議程' },
    })
    renderForm()
    expect(await screen.findByRole('switch', { name: '下次會議' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /選擇附件/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /保存紀要/ })).toBeNull()
  })

  it('只读附件展示：图片站内放大，文档凭短票新窗口查看/下载，不提供移除动作', async () => {
    vi.mocked(fetchMinutesAttachmentAccess).mockResolvedValue({
      attachmentNo: 'e'.repeat(32), purpose: 'view', ticket: 'ticket-abc', expiresAt: '2026-10-29 10:05:00',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<MinutesContentCard content={emptyMinutesContent()} attachments={[
      attVo('e'.repeat(32), '白板.png', 'image'),
      attVo('f'.repeat(32), '資料.pdf', 'pdf'),
    ]} resolveAttachmentUrl={async (item, purpose) => {
      await fetchMinutesAttachmentAccess(item.attachmentNo, purpose)
      return `https://api.test/file?attachmentNo=${item.attachmentNo}&purpose=${purpose}`
    }} />)
    expect(screen.getByText('補充說明')).toBeInTheDocument()
    // 图片缩略图挂载即取 view 地址
    await waitFor(() => expect(fetchMinutesAttachmentAccess).toHaveBeenCalledWith('e'.repeat(32), 'view'))
    fireEvent.click(screen.getByRole('button', { name: '查看 資料.pdf' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      `https://api.test/file?attachmentNo=${'f'.repeat(32)}&purpose=view`, '_blank', 'noopener'))
    fireEvent.click(screen.getByRole('button', { name: '下載 白板.png' }))
    await waitFor(() => expect(fetchMinutesAttachmentAccess).toHaveBeenCalledWith('e'.repeat(32), 'download'))
    expect(screen.queryByRole('button', { name: /移除/ })).toBeNull()
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

  it('有编辑权限的新纪要默认自由笔记，切换及全文预览保留两套输入', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100, canEdit: true })
    renderForm()
    const note = await screen.findByRole('textbox', { name: '原始筆記' })
    expect(screen.getByRole('radio', { name: '自由筆記' })).toBeChecked()
    expect(screen.queryByRole('button', { name: /保存紀要/ })).toBeNull()
    fireEvent.change(note, { target: { value: '現場自由筆記不應丟失' } })
    fireEvent.click(screen.getByRole('radio', { name: '手動填寫' }))
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '人工整理的議題' } })
    fireEvent.click(screen.getByRole('radio', { name: '自由筆記' }))
    expect(screen.getByRole('textbox', { name: '原始筆記' })).toHaveValue('現場自由筆記不應丟失')
    fireEvent.click(screen.getByRole('radio', { name: '全文預覽' }))
    expect(screen.getByRole('article', { name: '會議紀要正文' })).toHaveTextContent('人工整理的議題')
    expect(screen.getByRole('article', { name: '會議紀要正文' })).not.toHaveTextContent('現場自由筆記不應丟失')
    fireEvent.click(screen.getByRole('radio', { name: '填寫紀要' }))
    expect(screen.getByRole('textbox', { name: '原始筆記' })).toHaveValue('現場自由筆記不應丟失')
    fireEvent.click(screen.getByRole('radio', { name: '手動填寫' }))
    expect(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')).toHaveValue('人工整理的議題')
    expect(createMinutes).not.toHaveBeenCalled()
  })

  it('自由笔记自动保存到服务器，但保存纪要不会把笔记文本写进正文', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100, canEdit: true })
    renderForm()
    fireEvent.change(await screen.findByRole('textbox', { name: '原始筆記' }), { target: { value: '一段不应进入正文的私人笔记' } })
    await waitFor(() => expect(saveMinutesNote).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('radio', { name: '手動填寫' }))
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '可保存議題' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.content.items[0].topic).toBe('可保存議題')
    expect(JSON.stringify(payload)).not.toContain('一段不应进入正文的私人笔记')
  })

  it('末次编辑必须被完整自动保存（回归陈旧闭包丢尾字）', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100, canEdit: true })
    renderForm()
    const note = await screen.findByRole('textbox', { name: '原始筆記' })
    fireEvent.change(note, { target: { value: '第一段' } })
    await waitFor(() => expect(saveMinutesNote).toHaveBeenCalled())
    // 再改一次，最后一次保存必须带完整最新值，不能只存旧值
    fireEvent.change(note, { target: { value: '第一段加上尾字' } })
    await waitFor(() => {
      const last = vi.mocked(saveMinutesNote).mock.calls.at(-1)![0]
      expect(last.rawText).toBe('第一段加上尾字')
    })
  })

  it('AI 提取成功后套用：议题/负责人/时限带入草稿，保存时随正文提交', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100, canEdit: true })
    vi.mocked(fetchMinutesAiStatus).mockResolvedValue({ available: true, maxInputChars: 20000, enabled: true })
    vi.mocked(extractMinutesAi).mockResolvedValue({
      requestKey: 'k1', status: 'succeeded', extractionSchemaVersion: 1,
      source: { noteVersion: 1, sourceHash: 'h' },
      proposal: {
        items: [{ ref: 't1', topic: '無敵星星項目進度討論', discussion: '當前進度 90%；前端因後端接口未提供而阻塞。', sourceRefs: ['s1'] }],
        actions: [{ ref: 'a1', topicRef: 't1', content: '後端提供無敵星星接口', ownerUserId: 7, ownerName: '劉衛', dueDate: '2026-11-06', sourceRefs: ['s1'] }],
        openIssues: [],
      },
      issues: [],
    })
    renderForm()
    fireEvent.change(await screen.findByRole('textbox', { name: '原始筆記' }), { target: { value: '關於無敵星星項目，當前進度90%。需要 @劉衛 提供接口，預計本週五交付。' } })
    await waitFor(() => expect(saveMinutesNote).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'AI 輔助' }))
    const review = await screen.findByRole('region', { name: 'AI 提取結果核對' })
    fireEvent.click(within(review).getByRole('button', { name: '套用到紀要表單' }))
    await waitFor(() => expect(screen.getAllByPlaceholderText('議題，例：Q4 預算分攤口徑').some(input => (input as HTMLInputElement).value === '無敵星星項目進度討論')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.content.items[0].topic).toBe('無敵星星項目進度討論')
    expect(payload.content.actions[0]).toMatchObject({ content: '後端提供無敵星星接口', ownerUserId: 7, dueDate: '2026-11-06' })
    // 保存同事务登记 AI 来源：携带本次套用的提取请求号与采用条目
    expect(payload.aiExtractionRequestKey).toBe('k1')
    expect(payload.appliedKeys).toEqual(expect.arrayContaining(['t1', 'a1']))
  })

  it('已有纪要默认手动，显式 AI 入口可切到自由笔记且不修改原文', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, canEdit: true,
      content: { ...emptyMinutesContent(), items: [{ topic: '保留原有議題' }] } })
    const view = renderForm()
    expect(await screen.findByRole('radio', { name: '手動填寫' })).toBeChecked()
    expect(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')).toHaveValue('保留原有議題')
    view.unmount()
    renderForm('/meeting-minutes-form?bookingId=100&input=notes')
    expect(await screen.findByRole('radio', { name: '自由筆記' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: '原始筆記' })).toHaveValue('')
    expect(updateMinutes).not.toHaveBeenCalled()
  })

  it('只读或读取失败不通过 input 参数开放 AI 原型', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: true, id: 9, bookingId: 100, canEdit: false,
      content: emptyMinutesContent() })
    const view = renderForm('/meeting-minutes-form?bookingId=100&input=notes')
    await screen.findByRole('switch', { name: '下次會議' })
    expect(screen.queryByRole('textbox', { name: '原始筆記' })).toBeNull()
    view.unmount()
    vi.mocked(fetchMinutes).mockRejectedValue(new Error('資源無法讀取'))
    renderForm('/meeting-minutes-form?bookingId=100&input=notes')
    await screen.findByText('未能讀取既有紀要，請重試後再編輯或保存')
    expect(screen.queryByRole('textbox', { name: '原始筆記' })).toBeNull()
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
