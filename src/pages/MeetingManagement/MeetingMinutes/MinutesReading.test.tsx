/** 商务纪要模板回归：同源正文、历史快照、当前事项与纯展示通知卡片。 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Modal } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { minutesPurposeText, type MinutesContent, type MinutesItemView, type MinutesSendBatchVO } from '@/api/meetingMinutes'
import i18n from '@/i18n'
import MinutesContentCard, { MinutesNoticePreview } from './MinutesContentCard'
import MinutesView from './MinutesView'
import MeetingMinutesPage from '../../MeetingMinutesView'

// jsdom 不触发 CSS 动画结束事件；保留真实确认弹窗，仅关闭测试中的进出场动画。
const confirmWithMotion = Modal.confirm
vi.spyOn(Modal, 'confirm').mockImplementation(options => confirmWithMotion({
  ...options, transitionName: '', maskTransitionName: '',
}))

const api = vi.hoisted(() => ({
  fetchMinutesPage: vi.fn(), fetchMinutesById: vi.fn(), fetchMinutesSends: vi.fn(), fetchMeetingDetail: vi.fn(),
  fetchMinutesRevisions: vi.fn(async () => []), revokeMinutesLinks: vi.fn(), revokeBatchLink: vi.fn(),
}))
vi.mock('@/api/meetingMinutesPage', () => ({ fetchMinutesPage: api.fetchMinutesPage }))
vi.mock('@/api/meetingMinutes', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/meetingMinutes')>(),
  fetchMinutesById: api.fetchMinutesById,
  fetchMinutesSends: api.fetchMinutesSends,
  fetchMinutesRevisions: api.fetchMinutesRevisions,
  revokeMinutesLinks: api.revokeMinutesLinks,
  revokeBatchLink: api.revokeBatchLink,
}))
vi.mock('@/api/meeting', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/meeting')>(),
  fetchMeetingDetail: api.fetchMeetingDetail,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => false, user: { id: 2 } }) }))

const content: MinutesContent = {
  items: [{ topic: '預算分攤', discussion: '按營收或門店數量分攤', conclusion: '採用營收分攤口徑' }],
  actions: [{ content: '舊批次行動', ownerName: '記錄快照', ownerEmpNo: 'MF00007', dueDate: '2026-11-02' }],
  openIssues: [{ content: '確認下期預算池', needDecisionBy: '財務主管' }],
  absentees: [], nextMeetingNote: '復核預算明細',
}
const tracked: MinutesItemView[] = [
  { id: 101, kind: 'ACTION', seq: 1, content: '目前行動事項', ownerName: '張三', dueDate: '2026-11-03', status: 'done', result: 'completed', resolutionNote: '內部辦理說明' },
  { id: 102, kind: 'FOLLOW', seq: 1, content: '目前跟進事項', ownerName: '李四', dueDate: '2026-11-04', status: 'pending' },
]

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('zh-TW')
})
afterEach(async () => {
  await act(async () => { Modal.destroyAll() })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

describe('商務紀要正文', () => {
  it('集团标志和中英文抬头位于文档横线之前', () => {
    const { container } = render(<MinutesContentCard content={content} document={{ title: '經營例會' }} />)
    const masthead = container.querySelector('.mm-document__eyebrow')!
    expect(within(masthead as HTMLElement).getByRole('img', { name: '集團 LOGO' })).toBeInTheDocument()
    expect(masthead.querySelector('svg')).toHaveAttribute('viewBox', '0 0 32 32')
    expect(within(masthead as HTMLElement).getByText('會議紀要')).toBeInTheDocument()
    expect(within(masthead as HTMLElement).getByText('MEETING MINUTES')).toBeInTheDocument()
    expect(masthead.nextElementSibling).toHaveClass('mm-document__rule')
    expect(masthead.nextElementSibling?.nextElementSibling).toHaveClass('mm-document__title')
  })

  it('章节采用统一文件结构，取消彩色卡片分区并为结论保留有序编号', () => {
    const { container } = render(<MinutesContentCard content={content} />)
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map(heading => heading.querySelector('span')?.textContent)).toEqual(['01', '02', '03', '04', '05'])
    headings.forEach(heading => {
      expect(heading.closest('section')).toHaveAttribute('class', 'mm-document__section')
    })
    expect(container.querySelector('.mm-document__summary ol li')).toHaveTextContent('採用營收分攤口徑')
  })

  it('只保留会议目的模块，旧目的和摘要按段落合并且不改写原数据', () => {
    const purpose = '確認跨部門協作目標\n保留第二行目的'
    const legacy = { ...content, purpose, summary: '本次會議摘要' }
    const original = JSON.stringify(legacy)
    const { rerender } = render(<MinutesContentCard content={legacy} />)
    const heading = screen.getByRole('heading', { level: 3, name: '01會議目的' })
    expect(heading).toHaveClass('mm-document__section-title')
    expect(heading.nextElementSibling?.textContent).toBe(`${purpose}\n\n本次會議摘要`)
    expect(screen.queryByRole('heading', { name: /會議摘要/ })).toBeNull()
    expect(JSON.stringify(legacy)).toBe(original)
    rerender(<MinutesContentCard content={{ ...content, purpose: '同一段', summary: '同一段' }} />)
    expect(screen.getAllByText('同一段')).toHaveLength(1)
  })

  it.each([
    [{}, ''],
    [{ purpose: '  目的  ' }, '目的'],
    [{ summary: '舊摘要' }, '舊摘要'],
    [{ purpose: '目的', summary: ' 目的 ' }, '目的'],
    [{ purpose: '第一行\n第二行', summary: '舊摘要' }, '第一行\n第二行\n\n舊摘要'],
  ])('目的合并兼容空值、旧摘要和完全重复文本：%j', (source, expected) => {
    expect(minutesPurposeText(source)).toBe(expected)
  })

  it('会议信息与参会记录合并为带标签的文件登记区，不补造归档状态', () => {
    const { container } = render(<MinutesContentCard content={{ ...content, schemaVersion: 2,
      attendance: [{ userId: 7, name: '出席人員', empNo: 'MF00007', status: 'present' },
        { userId: 8, name: '請假人員', status: 'absent', reason: '出差' }],
    }} document={{ title: '經營例會', minutesNo: 'MJ-TEST-01', bookingNo: 'MT-TEST-01',
      meetingTime: '2026-10-28 10:00–11:00', room: '第一會議室',
    }} />)
    const metadata = container.querySelector('.mm-document__metadata')!
    expect(metadata.tagName).toBe('DL')
    expect(within(metadata as HTMLElement).getByText('會議時間').tagName).toBe('DT')
    expect(within(metadata as HTMLElement).getByText('2026-10-28 10:00–11:00').tagName).toBe('DD')
    expect(within(metadata as HTMLElement).getAllByText('未記錄')).toHaveLength(4)
    expect(Array.from(metadata.querySelectorAll('dt')).map(label => label.textContent)).toEqual([
      '會議時間', '主持人', '會議類型', '組織者', '記錄人', '會議地點', '參會人員', '缺席人員',
    ])
    expect(within(metadata as HTMLElement).queryByText('記錄人：')).toBeNull()
    expect(within(metadata as HTMLElement).getByText(/出席人員/).closest('dd')?.parentElement).toHaveClass('mm-document__metadata-wide')
    expect(within(metadata as HTMLElement).getByText(/請假人員/).closest('dd')?.parentElement).toHaveClass('mm-document__metadata-wide')
    expect(screen.getByText('工作稿 · 未鎖版')).toBeInTheDocument()
    expect(screen.queryByText(/永久存檔|已歸檔|已發布/)).toBeNull()
  })

  it('主名单仅显示已出席，缺席和待核实分栏着色，不改写原始人员顺序', () => {
    const attendance: NonNullable<MinutesContent['attendance']> = [
      { userId: 1, name: '缺席甲', empNo: 'MF00001', status: 'absent', reason: '出差' },
      { userId: 2, name: '出席乙', empNo: 'MF00002', status: 'present' },
      { userId: 3, name: '待核實丙', status: 'unverified' },
      { userId: 4, name: '出席丁', status: 'present' },
    ]
    const original = JSON.stringify(attendance)
    const { container } = render(<MinutesContentCard content={{ ...content, schemaVersion: 2, attendance }} document={{ title: '例會' }} />)
    const present = screen.getByText('參會人員').nextElementSibling as HTMLElement
    expect(Array.from(present.querySelectorAll('.mm-document__attendee > span:first-child')).map(node => node.textContent)).toEqual(['出席乙（MF00002）', '出席丁'])
    expect(within(present).queryByText(/缺席甲|待核實丙/)).toBeNull()
    expect(within(present).getAllByText('已出席')).toHaveLength(2)
    expect(present.querySelectorAll('.mm-document__attendance-status--present')).toHaveLength(2)
    const absent = container.querySelector('.mm-document__absentees') as HTMLElement
    expect(within(absent).getByText('缺席甲（MF00001）')).toBeInTheDocument()
    expect(within(absent).getByText('缺席')).toHaveClass('mm-document__attendance-status--absent')
    expect(within(absent).queryByText(/出差/)).toBeNull()
    expect(absent.querySelector('.mm-document__attendance-reason')).toBeNull()
    expect(container.querySelector('.mm-document__unverified')).toHaveTextContent('待核實丙')
    expect(JSON.stringify(attendance)).toBe(original)
  })

  it('历史受邀名单不能推定出席，同名不误合并，缺席只显示状态但保留原原因', () => {
    const legacy = { ...content, absentees: [{ userId: 8, name: '同名', empNo: 'MF00008', reason: '未簽到' }] }
    const { container } = render(<MinutesContentCard content={legacy} document={{ title: '歷史例會', attendees: [
      { userId: 7, name: '同名', empNo: 'MF00007' }, { userId: 8, name: '同名', empNo: 'MF00008' },
    ] }} />)
    const present = screen.getByText('參會人員').nextElementSibling as HTMLElement
    expect(within(present).queryByText(/同名|已出席/)).toBeNull()
    expect(container.querySelector('.mm-document__absentees')).toHaveTextContent('同名（MF00008）')
    expect(container.querySelector('.mm-document__absentees')).not.toHaveTextContent('未簽到')
    expect(legacy.absentees[0].reason).toBe('未簽到')
    expect(container.querySelector('.mm-document__unverified')).toHaveTextContent('同名（MF00007）')
    expect(screen.getAllByText('同名（MF00008）')).toHaveLength(1)
  })

  it('正式空出席快照不回退到当前名单或旧缺席记录', () => {
    const published = { ...content, schemaVersion: 2, attendance: [], absentees: [{ name: '舊缺席人員' }] }
    render(<MinutesContentCard content={{ ...content, attendance: [{ name: '草稿人員', status: 'present' }] }}
      document={{ title: '工作稿', attendees: [{ name: '現在受邀人' }] }}
      snapshot={{ schemaVersion: 2, content: published, meetingTitle: '正式例會', revisionNo: 1 }} />)
    expect(screen.queryByText(/草稿人員|現在受邀人|舊缺席人員/)).toBeNull()
    expect(screen.queryByText('缺席人員')).toBeNull()
    expect(screen.getByText('暫無參會人員')).toBeInTheDocument()
  })

  it('行动和跟进使用只读台账表格，表头、行号、责任人和期限对应同一行', () => {
    render(<MinutesContentCard content={{ ...content, schemaVersion: 2,
      actions: [{ ...content.actions[0], deliverable: '預算明細\n主管復核' }],
      openIssues: [{ content: '確認預算池', ownerName: '李四', dueDate: '2026-11-04' }],
    }} />)
    const actions = screen.getByRole('table', { name: '行動項' })
    expect(within(actions).getAllByRole('columnheader')).toHaveLength(5)
    const actionRow = within(actions).getByRole('rowheader', { name: 'A01' }).closest('tr')!
    expect(within(actionRow).getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      '舊批次行動', '記錄快照（MF00007）', '2026-11-02', '預算明細\n主管復核',
    ])
    const follows = screen.getByRole('table', { name: '未決與跟進事項' })
    expect(within(follows).getAllByRole('columnheader')).toHaveLength(4)
    const followRow = within(follows).getByRole('rowheader', { name: 'F01' }).closest('tr')!
    expect(within(followRow).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['確認預算池', '李四', '2026-11-04'])
    expect(screen.getByRole('region', { name: '行動項' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('region', { name: '未決與跟進事項' })).toHaveAttribute('tabindex', '0')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('紧凑正文保留四列表格，隐藏事项模式不渲染两类台账', () => {
    const { rerender } = render(<MinutesContentCard content={content} compact />)
    const table = screen.getByRole('table', { name: '行動項' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4)
    expect(within(table).getByRole('rowheader', { name: 'A01' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /會議目的/ })).toBeNull()
    rerender(<MinutesContentCard content={content} hideTracked />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('舊批次行動')).toBeNull()
    expect(screen.queryByText('確認下期預算池')).toBeNull()
  })

  it('文档按摘要、议题、行动、跟进、后续安排分层，不依赖时间线', () => {
    const { container } = render(<MinutesContentCard content={content} document={{ title: '經營例會', minutesNo: 'MJ-TEST-01' }} />)
    expect(screen.getByRole('heading', { name: '經營例會' })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 3 }).map(element => element.textContent)
    expect(headings).toEqual(['01會議目的', '02議程與結論', '03行動項', '04未決與跟進事項', '05後續安排與相關資料'])
    expect(screen.getAllByText('採用營收分攤口徑')).toHaveLength(2)
    expect(screen.getByText('歷史紀要未保存完整參會名單快照')).toBeInTheDocument()
    expect(screen.getByText('工作稿 · 未鎖版')).toBeInTheDocument()
    expect(container.querySelector('.ant-timeline')).toBeNull()
  })

  it('当前事项传入后不重复展示正文里的旧行动，也不把办理结果写入文档', () => {
    render(<MinutesContentCard content={content} trackedItems={tracked} />)
    expect(screen.getByText('目前行動事項')).toBeInTheDocument()
    expect(screen.getByText('目前跟進事項')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByText('2026-11-04')).toBeInTheDocument()
    expect(screen.queryByText('舊批次行動')).toBeNull()
    expect(screen.queryByText('內部辦理說明')).toBeNull()
  })

  it('不传当前事项时仅显示原正文，保持旧免登快照兼容', () => {
    render(<MinutesContentCard content={content} />)
    expect(screen.getByText('舊批次行動')).toBeInTheDocument()
    expect(screen.getByText('記錄快照（MF00007）')).toBeInTheDocument()
    expect(screen.queryByText('目前行動事項')).toBeNull()
    expect(screen.getByText('確認下期預算池')).toBeInTheDocument()
  })

  it('空事项数组是明确的空数据，不回退到旧正文制造重复任务', () => {
    render(<MinutesContentCard content={content} trackedItems={[]} />)
    expect(screen.getByText('無行動項')).toBeInTheDocument()
    expect(screen.getByText('本次無跟進事項')).toBeInTheDocument()
    expect(screen.queryByText('舊批次行動')).toBeNull()
  })

  it('表单跟进预览显示负责人和期限，但不更改原内容', () => {
    render(<MinutesContentCard content={content} people={[{ id: 2, name: '跟進員工' }]}
      followUpDetails={[{ content: '試填的跟進', ownerUserId: 2, dueDate: '2026-11-09' }]} />)
    expect(screen.getByText('跟進員工')).toBeInTheDocument()
    expect(screen.getByText('2026-11-09')).toBeInTheDocument()
    expect(content.openIssues[0].content).toBe('確認下期預算池')
  })

  it('正式文档不混入当前办理结果，完整显示发布时的摘要与交付物', () => {
    const published = { ...content, schemaVersion: 2, summary: '正式摘要', purpose: '確定方向',
      actions: [{ ...content.actions[0], deliverable: '驗收預算明細' }],
      attendance: [{ userId: 7, name: '發布時姓名', status: 'present' as const }] }
    render(<MinutesContentCard content={published} trackedItems={tracked} snapshot={{ schemaVersion: 2,
      meetingTitle: '正式例會', revisionNo: 1, publisherName: '發布人甲', content: published }} />)
    expect(screen.getByText(/確定方向\s+正式摘要/)).toBeInTheDocument()
    expect(screen.getByText('驗收預算明細')).toBeInTheDocument()
    expect(screen.getByText(/發布時姓名/)).toBeInTheDocument()
    expect(screen.queryByText('目前行動事項')).toBeNull()
    expect(screen.queryByText('內部辦理說明')).toBeNull()
  })

  it('用户文本按普通文字渲染，不执行 HTML', () => {
    const unsafe = '<img src=x onerror=alert(1)>'
    const { container } = render(<MinutesContentCard content={{ ...content,
      items: [{ topic: unsafe, discussion: unsafe, conclusion: unsafe }],
      actions: [{ content: unsafe, ownerName: unsafe, deliverable: unsafe }],
    }} />)
    expect(screen.getAllByText(unsafe).length).toBeGreaterThan(0)
    const table = screen.getByRole('table', { name: '行動項' })
    expect(within(table).getAllByText(unsafe)).toHaveLength(3)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('新版通知预览只有基础信息、计数与一个全文入口，不调用发送接口', () => {
    const onView = vi.fn()
    render(<MinutesNoticePreview title="經營例會" minutesNo="MJ-TEST-01" topicCount={2} actionCount={3} followCount={1} onView={onView} />)
    expect(screen.getByText('議題 2 項 · 行動 3 項 · 跟進 1 項')).toBeInTheDocument()
    expect(screen.getByText('此處僅預覽新版卡片，不會發送通知。')).toBeInTheDocument()
    expect(screen.queryByText('舊批次行動')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '查看紀要（預覽）' }))
    expect(onView).toHaveBeenCalledTimes(1)
  })
})

describe('批次作廢界面預覽', () => {
  const minutes = { exists: true, id: 9, bookingId: 100, minutesNo: 'MJ-TEST-01', content,
    canEdit: true, canManageSends: true, canSend: false, sendCount: 3, version: 5 }
  const batches: MinutesSendBatchVO[] = [
    { id: 31, minutesId: 9, batchSeq: 3, revisionNo: 2, sentAt: '2026-10-29 11:00:00', receiverCount: 1, sendStatus: 'success', viewUrl: '/meeting-minutes-view?token=fixture-batch-3' },
    { id: 22, minutesId: 9, batchSeq: 2, revisionNo: 1, sentAt: '2026-10-29 10:00:00', receiverCount: 1, sendStatus: 'skipped', viewUrl: null },
    { id: 13, minutesId: 9, batchSeq: 1, sentAt: '2026-10-28 10:00:00', receiverCount: 1, sendStatus: 'success', viewUrl: '/meeting-minutes-view?token=fixture-batch-1' },
  ]
  beforeEach(() => {
    api.fetchMinutesById.mockResolvedValue(minutes)
    api.fetchMinutesSends.mockResolvedValue(batches)
    api.fetchMeetingDetail.mockResolvedValue({ id: 100, title: '例會', attendees: [] })
    api.revokeMinutesLinks.mockResolvedValue({ ...minutes, version: 6 })
    api.revokeBatchLink.mockResolvedValue(undefined)
  })
  async function openHistory() {
    render(<MemoryRouter initialEntries={['/meeting-minutes?id=9']}><MinutesView /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('tab', { name: '版本與發送記錄' }))
  }

  it.each([
    [3, 'V2', '2026-10-29 11:00:00'],
    [1, '歷史發送快照', '2026-10-28 10:00:00'],
  ])('第 %i 次发送使用本行批次信息，确认后调用单批次作废接口', async (seq, version, sentAt) => {
    await openHistory()
    const row = (await screen.findByText(`第 ${seq} 次`)).closest('tr')!
    const button = within(row).getByRole('button', { name: '作廢鏈接' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(button).toHaveClass('ant-btn-dangerous')
    expect(row.querySelector('.action-split')).toHaveTextContent('|')
    expect(within(row).getByRole('button', { name: '複製鏈接' })).toBeEnabled()
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('確認作廢此批次查看鏈接？')
    expect(within(dialog).getByText('MJ-TEST-01')).toBeInTheDocument()
    expect(within(dialog).getByText(`第 ${seq} 次`)).toBeInTheDocument()
    expect(within(dialog).getByText(version)).toBeInTheDocument()
    expect(within(dialog).getByText(sentAt)).toBeInTheDocument()
    expect(within(dialog).getByText(/其他批次不受影響/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '確認作廢本批次' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '確認作廢本批次' }))
    const sendId = seq === 3 ? 31 : 13
    await waitFor(() => expect(api.revokeBatchLink).toHaveBeenCalledExactlyOnceWith(9, sendId))
    expect(api.revokeMinutesLinks).not.toHaveBeenCalled()
  })

  it('没有查看链接的批次禁用作废入口', async () => {
    await openHistory()
    const row = (await screen.findByText('第 2 次')).closest('tr')!
    const button = within(row).getByRole('button', { name: '作廢鏈接' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.revokeMinutesLinks).not.toHaveBeenCalled()
  })

  it('仅可查看发送历史的用户没有单批次或全局作废入口', async () => {
    api.fetchMinutesById.mockResolvedValue({ ...minutes, canEdit: false })
    await openHistory()
    await screen.findByText('第 3 次')
    expect(screen.getAllByRole('button', { name: '複製鏈接' })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /作廢/ })).toBeNull()
  })

  it('无发送管理权限不请求或展示批次操作', async () => {
    api.fetchMinutesById.mockResolvedValue({ ...minutes, canManageSends: false })
    await openHistory()
    expect(api.fetchMinutesSends).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '作廢鏈接' })).toBeNull()
  })

  it('顶部明确标注全部链接，仍须独立确认才调用原全局接口', async () => {
    await openHistory()
    fireEvent.click(screen.getByRole('button', { name: /作廢全部鏈接/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('確認作廢全部查看鏈接？')
    expect(api.revokeMinutesLinks).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '確認作廢' }))
    await waitFor(() => expect(api.revokeMinutesLinks).toHaveBeenCalledExactlyOnceWith(9, 5))
  })
})

describe('紀要頁面入口', () => {
  it('免登页使用相同模板，只读历史批次，不请求会议详情或当前纪要', async () => {
    api.fetchMinutesPage.mockResolvedValue({ valid: true, title: '歷史例會', minutesNo: 'MJ-TEST-01', content, batchSeq: 3, sentByName: '通知人' })
    render(<MemoryRouter initialEntries={['/meeting-minutes-view?token=test-fixture']}><MeetingMinutesPage /></MemoryRouter>)
    const article = await screen.findByRole('article', { name: '會議紀要正文' })
    expect(within(article).getByText('歷史發送快照 · 第 3 批')).toBeInTheDocument()
    expect(within(article).getByText('舊批次行動')).toBeInTheDocument()
    expect(api.fetchMeetingDetail).not.toHaveBeenCalled()
    expect(api.fetchMinutesById).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /編輯|發送/ })).toBeNull()
  })

  it('统一阅读入口优先正式快照，忽略旧草稿参数并移除切换按钮', async () => {
    api.fetchMinutesById.mockResolvedValue({ exists: true, id: 9, bookingId: 100, minutesNo: 'MJ-TEST-01',
      content: { ...content, schemaVersion: 2, chairName: '草稿主持人' }, canEdit: true, canReadDraft: true,
      document: { schemaVersion: 2, revisionNo: 1, content: { ...content, schemaVersion: 2, chairName: '發布時主持人' } },
    })
    api.fetchMeetingDetail.mockResolvedValue({ id: 100, title: '例會', attendees: [] })
    render(<MemoryRouter initialEntries={['/meeting-minutes?id=9&draft=1']}><MinutesView /></MemoryRouter>)
    const article = await screen.findByRole('article', { name: '會議紀要正文' })
    expect(within(article).getByText('發布時主持人')).toBeInTheDocument()
    expect(within(article).queryByText('草稿主持人')).toBeNull()
    expect(screen.queryByRole('button', { name: /查看工作草稿|查看正式版/ })).toBeNull()
    await i18n.changeLanguage('en')
    expect(await screen.findByRole('button', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /編輯/ })).toBeNull()
  })

  it('尚无正式版时用同一套六字段模板展示后端允许读取的草稿', async () => {
    api.fetchMinutesById.mockResolvedValue({ exists: true, id: 9, bookingId: 100,
      content: { ...content, schemaVersion: 2, chairName: '草稿主持人' }, canEdit: false, canReadDraft: true,
    })
    render(<MemoryRouter initialEntries={['/meeting-minutes?id=9']}><MinutesView /></MemoryRouter>)
    const article = await screen.findByRole('article', { name: '會議紀要正文' })
    expect(within(article).getByText('草稿主持人')).toBeInTheDocument()
    expect(within(article).getByText('記錄人', { selector: 'dt' })).toBeInTheDocument()
    expect(within(article).queryByText('記錄人：')).toBeNull()
    expect(screen.queryByRole('button', { name: /查看工作草稿|查看正式版/ })).toBeNull()
    expect(api.fetchMeetingDetail).not.toHaveBeenCalled()
  })

  it('无效免登链接不渲染正文', async () => {
    api.fetchMinutesPage.mockResolvedValue({ valid: false, message: '連結無效或已失效' })
    render(<MemoryRouter initialEntries={['/meeting-minutes-view?token=test-fixture']}><MeetingMinutesPage /></MemoryRouter>)
    expect(await screen.findByText('連結無效或已失效')).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('后台默认阅读正文，切换跟进、历史和卡片不会混入正文', async () => {
    api.fetchMinutesById.mockResolvedValue({ exists: true, id: 9, bookingId: 100, minutesNo: 'MJ-TEST-01', content, items: tracked, links: [], canEdit: false, canSend: false, version: 82 })
    api.fetchMeetingDetail.mockResolvedValue({ id: 100, title: '經營例會', roomName: '第一會議室', organizerName: '會議組織者', attendees: [], bizType: 'general' })
    api.fetchMinutesSends.mockResolvedValue([])
    render(<MemoryRouter initialEntries={['/meeting-minutes?id=9']}><MinutesView /></MemoryRouter>)
    const article = await screen.findByRole('article', { name: '會議紀要正文' })
    expect(article).toBeVisible()
    expect(within(article).queryByText('內部辦理說明')).toBeNull()
    expect(screen.queryByText('V82')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '事項跟進' }))
    expect(article).not.toBeVisible()
    expect(screen.getByText('內部辦理說明')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: '版本與發送記錄' }))
    expect(screen.getByText('正式版本與通知批次各自獨立；沒有版本號的舊記錄為歷史發送快照。')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: '釘釘卡片預覽' }))
    fireEvent.click(screen.getByRole('button', { name: '查看紀要（預覽）' }))
    expect(article).toBeVisible()
  })
})
