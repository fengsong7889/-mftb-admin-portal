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
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { Modal, message } from 'antd'

/* 权限 mock：全员使用侧 + 治理动作放开（各按钮可见性由权限决定，测试要走到最完整分支） */
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: '張偉', empId: 'MF00001', role: 'user' },
    hasPermission: () => true,
    hasMenuPermission: () => true,
  }),
}))

/* api mock：拦截 @/api/cpm 全部函数（vi.mock 工厂整体替换，页面只依赖契约不依赖实现） */
vi.mock('@/api/cpm', () => ({
  fetchCpmDay: vi.fn(),
  fetchCpmItem: vi.fn(),
  createCpmItem: vi.fn(),
  updateCpmItem: vi.fn(),
  deleteCpmItem: vi.fn(),
  addCpmProgress: vi.fn(),
  carryCpmItem: vi.fn(),
  fetchCpmSourceRdm: vi.fn(),
  fetchCpmSourceRdmTasks: vi.fn(),
  fetchCpmSourceMeetingActions: vi.fn(),
  fetchCpmTemplates: vi.fn(),
  fetchCpmCurrent: vi.fn(),
  fetchCpmPreview: vi.fn(),
  saveCpmDraft: vi.fn(),
  publishCpmReport: vi.fn(),
  listMyCpmReports: vi.fn(),
  fetchCpmReportDetail: vi.fn(),
  fetchMyRecognitions: vi.fn(),
  fetchCpmRule: vi.fn(),
  saveCpmRule: vi.fn(),
  fetchCpmTeamBoard: vi.fn(),
  remindCpmMember: vi.fn(),
  addCpmComment: vi.fn(),
  listCpmComments: vi.fn(),
  deleteCpmComment: vi.fn(),
  toggleCpmReaction: vi.fn(),
  createCpmRecognition: vi.fn(),
  createCpmTemplate: vi.fn(),
  updateCpmTemplate: vi.fn(),
  setCpmTemplateStatus: vi.fn(),
  deleteCpmTemplate: vi.fn(),
  fetchCpmAiStatus: vi.fn(),
  extractCpmAi: vi.fn(),
  fetchCpmAiExtraction: vi.fn(),
  confirmCpmAi: vi.fn(),
  transcribeCpmAudio: vi.fn(),
  fetchCpmReportAiSummary: vi.fn(),
  // 阶段三：时段 / 回写 / 日报 / 版本 / 导出
  fetchCpmTimeEntries: vi.fn(),
  createCpmTimeEntry: vi.fn(),
  updateCpmTimeEntry: vi.fn(),
  deleteCpmTimeEntry: vi.fn(),
  setCpmRdmSync: vi.fn(),
  realignCpmRdmSync: vi.fn(),
  fetchCpmRdmSyncStatus: vi.fn(),
  fetchCpmDaily: vi.fn(),
  fetchCpmRevisions: vi.fn(),
  fetchCpmRevision: vi.fn(),
  republishCpmReport: vi.fn(),
  exportCpmReportDocx: vi.fn(),
}))

import * as cpmApi from '@/api/cpm'
import MyWorklog from './MyWorklog'
import MyReport from './MyReport'
import TeamReport from './TeamReport'
import ReportDetail from './ReportDetail'
import AiAssistantDrawer from './AiAssistantDrawer'

/**
 * CPM 阶段二冒烟测试：交互契约钉死（快捷录入/延续/发布确认/AI 预览确认/催办）。
 * 数据一律走 @/api/cpm 契约 mock——真实链路的口径由后端单测钉死，
 * 前端职责是「数字不自己算、发布走确认、AI 确认才落库」。
 */

const mock = cpmApi as unknown as Record<string, ReturnType<typeof vi.fn>>

/** 页面文案已改为 t() 取词（i18n 棘轮只降不升），测试必须挂上真实语言实例 */
function mount(ui: ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
}

const TEMPLATE = [{
  id: 1, templateKey: 'product', name: '產品經理', roleHint: '需求', workHoursEnabled: false,
  builtin: true, enabled: true,
  categories: [{ key: 'prd_review', label: '需求評審', hint: '如：評審了XX需求' }],
}]

const ITEM = {
  id: 1, title: '已完成的事', detail: null, category: 'prd_review', categoryLabel: '需求評審',
  status: 'done', progress: 100, workDate: '2026-11-18', workHours: null,
  sourceType: 'manual', sourceRef: null, sourceLabel: null, templateKey: 'product', version: 0, recognized: true,
  rdmSync: null,
}

const CARRY = { ...ITEM, id: 2, title: '跨週期方案推進', status: 'doing', progress: 40, recognized: true }

/**
 * 时段 store：模拟「写完立刻读得到」的服务端（同事务 read-your-write）。
 *
 * 之所以不是一个恒返回 [] 的 stub：记时保存后界面要立刻出现那条时段与「今天 1 小時 30 分」，
 * 若 fetchCpmDay 永远返回空时段，测试会退化成「只验证点过按钮」，钉不住口径串链。
 */
let timeStore: { id: number; itemId: number; workDate: string; durationMinutes: number; note: string | null }[] = []
/** 发布状态机：publish 之后 current 才返回 published（前端不再本地拼已发布视图，避免测出一套假的） */
let publishedNow = false

/** 版本行夹具：V1 由服务端在发布事务里冻结，测试只回放它的形状 */
const REVISION_V1 = { revisionNo: 1, publishedAt: '2026-11-18 20:00', publisherName: '張偉', publisherEmpNo: 'MF00001', changeNote: '首次發布', current: true, schemaVersion: 2, itemDelta: null }

const SNAPSHOT_WEEK = (title: string, minutes: number | null = null) => ({
  schemaVersion: 2, periodType: 'week', periodStart: '2026-11-16', periodEnd: '2026-11-22',
  groups: [{ category: 'prd_review', categoryLabel: '需求評審', minutes: minutes ?? 0, items: [
    { itemId: 1, title, status: 'done', progress: 100, workDate: '2026-11-18', trail: [60, 100], sourceType: 'manual', sourceLabel: null, minutes, minutesSource: minutes ? 'segment' : 'none', segments: [] },
  ] }],
  totals: { total: 1, done: 1, doing: 0, todo: 0, blocked: 0, cancelled: 0, deferred: 0 },
  time: {
    totalMinutes: minutes ?? 0, preciseMinutes: minutes ?? 0, manualFallbackMinutes: 0,
    activeDays: minutes ? 1 : 0, avgMinutesPerActiveDay: minutes ?? 0,
    peakDate: minutes ? '2026-11-18' : null, peakMinutes: minutes || null,
    byCategory: minutes ? [{ category: 'prd_review', categoryLabel: '需求評審', minutes }] : [],
    byDay: minutes ? [{ workDate: '2026-11-18', minutes }] : [],
    topItems: minutes ? [{ itemId: 1, title, minutes }] : [],
  },
})

/** 已发布周报夹具：修订重发布与公文阅读面两个用例都要用到「有 id 的 published 记录」 */
const PUBLISHED_WEEK = {
  id: 9, userId: 1, ownerName: '張偉', ownerEmpId: 'MF00001', periodType: 'week',
  periodStart: '2026-11-16', periodEnd: '2026-11-22', status: 'published', summary: '本週完成一項評審', aiSummary: false,
  publishedAt: '2026-11-18 20:00', revisionNo: 1, publishedRevisionId: 91, hasUnpublishedChanges: false,
  snapshot: SNAPSHOT_WEEK('已完成的事', 90),
  receiverCount: 2, readCount: 1, commentCount: 0, likeCount: 0, likedByMe: false,
}

const DRAFT_WEEK = {
  id: null, userId: 1, ownerName: '張偉', ownerEmpId: 'MF00001', periodType: 'week',
  periodStart: '2026-11-16', periodEnd: '2026-11-22', status: 'draft', summary: null, aiSummary: false,
  snapshot: SNAPSHOT_WEEK('已完成的事', 90),
  receiverCount: 1, readCount: 0, commentCount: 0, likeCount: 0, likedByMe: false,
}

beforeEach(async () => {
  Modal.destroyAll()
  await i18n.changeLanguage('zh-TW')
  message.destroy()
  // Modal.confirm 带退场动画：只 destroyAll 会让上一个用例的弹窗在本用例开头仍占 aria-hidden，
  // 于是 getByRole 全线查不到（antd 打开弹层时把其余内容标为对无障碍隐藏）。硬清一次节点。
  document.querySelectorAll('.ant-modal-root, .ant-modal-wrap').forEach(node => node.remove())
  vi.clearAllMocks()
  timeStore = []
  publishedNow = false
  mock.fetchCpmTemplates.mockResolvedValue(TEMPLATE)
  // 日视图一次带回条目 + 当日时段：拆成逐条目请求会把打开日视图变成小型请求风暴
  mock.fetchCpmDay.mockImplementation(async () => ({
    date: '2026-11-18', items: [ITEM], carryCandidates: [CARRY],
    times: timeStore.length
      ? [{ itemId: 1, segments: timeStore, dayMinutes: timeStore.reduce((sum, row) => sum + row.durationMinutes, 0) }]
      : [],
  }))
  mock.createCpmItem.mockResolvedValue(ITEM)
  mock.carryCpmItem.mockResolvedValue(undefined)
  mock.fetchCpmSourceRdm.mockResolvedValue([
    { sourceType: 'rdm_requirement', sourceRef: '501', title: '需求甲：结算改造', subtitle: 'REQ-2026-0501', statusCode: 'developing', role: 'dev', progress: 60, dueDate: '2026-11-30', terminated: false, imported: false },
    { sourceType: 'rdm_requirement', sourceRef: '502', title: '需求乙：已上线核对', subtitle: 'REQ-2026-0502', statusCode: 'released', role: 'accept', progress: 100, dueDate: null, terminated: true, imported: true },
  ])
  mock.fetchCpmSourceRdmTasks.mockResolvedValue([
    { sourceType: 'rdm_task', sourceRef: '7001', title: '實現多幣種拆單計價引擎', subtitle: 'TASK-2026-0701', externalNo: 'TASK-2026-0701', parentTitle: '多幣種結算', statusCode: 'developing', role: 'dev', progress: 40, dueDate: '2026-11-25', terminated: false, imported: false, prdTask: true, planHours: 16 },
  ])
  mock.fetchCpmSourceMeetingActions.mockResolvedValue([])
  mock.addCpmProgress.mockResolvedValue(undefined)
  mock.deleteCpmItem.mockResolvedValue(undefined)
  mock.createCpmTimeEntry.mockImplementation(async (itemId: number, form: { workDate: string; durationMinutes: number; note?: string }) => {
    const row = { id: timeStore.length + 1, itemId, workDate: form.workDate, durationMinutes: form.durationMinutes, note: form.note ?? null }
    timeStore = [...timeStore, row]
    return row
  })
  mock.deleteCpmTimeEntry.mockImplementation(async (id: number) => { timeStore = timeStore.filter(row => row.id !== id) })
  mock.setCpmRdmSync.mockResolvedValue(undefined)
  mock.realignCpmRdmSync.mockResolvedValue(undefined)
  // 回写总闸默认「开」：关掉的那条用例自己覆盖返回值
  mock.fetchCpmRdmSyncStatus.mockResolvedValue({ enabled: true })
  mock.fetchCpmRevisions.mockResolvedValue([REVISION_V1])
  mock.fetchCpmRevision.mockResolvedValue(PUBLISHED_WEEK)
  mock.fetchCpmDaily.mockResolvedValue({ date: '2026-11-18', snapshot: SNAPSHOT_WEEK('已完成的事', 90), self: true, ownerName: '張偉', ownerEmpId: 'MF00001' })
  mock.fetchCpmCurrent.mockImplementation(async () => (publishedNow ? PUBLISHED_WEEK : DRAFT_WEEK))
  mock.publishCpmReport.mockImplementation(async () => { publishedNow = true; return PUBLISHED_WEEK })
  mock.republishCpmReport.mockImplementation(async () => ({ ...PUBLISHED_WEEK, revisionNo: 2 }))
  mock.listMyCpmReports.mockResolvedValue([])
  mock.fetchMyRecognitions.mockResolvedValue([])
  mock.fetchCpmRule.mockResolvedValue({
    enabled: true, periodTypes: ['week'], deadlineDay: 5, deadlineTime: '18:00', remindBeforeHours: 4,
    receiverManager: true, extraReceiverIds: [], extraReceiverNames: [], groupPush: true, personalPush: true, notifyDryRun: true,
  })
  mock.fetchCpmTeamBoard.mockResolvedValue({
    periodType: 'week', periodStart: '2026-11-16', periodEnd: '2026-11-22',
    rows: [
      { userId: 2, name: '李強', empId: 'MF00002', department: '研發部', submitStatus: 'missing' },
      { userId: 3, name: '陳靜', empId: 'MF00004', department: '運營部', submitStatus: 'published',
        reportId: 12, publishedAt: '2026-11-17T20:40', totalItems: 4, doneItems: 3, readCount: 2, receiverCount: 2, commentCount: 1, likeCount: 3, recognizedByMe: 1 },
    ],
    stats: { memberCount: 2, publishedCount: 1, submitRate: 50, doneItemsTotal: 3, itemsTotal: 4, recognitionSentCount: 1, pendingFeedbackCount: 0 },
  })
  mock.remindCpmMember.mockResolvedValue(undefined)
  mock.fetchCpmReportDetail.mockResolvedValue({
    id: 12, userId: 3, ownerName: '陳靜', ownerEmpId: 'MF00004', periodType: 'week',
    periodStart: '2026-11-16', periodEnd: '2026-11-22', status: 'published', summary: 's', aiSummary: true,
    publishedAt: '2026-11-17 20:40', revisionNo: 1,
    snapshot: { ...SNAPSHOT_WEEK('已完成的事', 0), periodStart: '2026-11-16' },
    receiverCount: 2, readCount: 1, commentCount: 1, likeCount: 2, likedByMe: false,
  })
  mock.listCpmComments.mockResolvedValue([])
  mock.addCpmComment.mockResolvedValue({})
  mock.toggleCpmReaction.mockResolvedValue({ liked: true })
  mock.createCpmRecognition.mockResolvedValue({})
  mock.fetchCpmAiStatus.mockResolvedValue({
    enabled: true, available: true, authorized: true, maxInputChars: 20000, asrAvailable: false, asrMaxSeconds: 300,
  })
  mock.extractCpmAi.mockResolvedValue({
    requestKey: 'k1', status: 'succeeded', candidates: [
      { title: '整理出的事項一', category: 'prd_review', status: 'done', progress: 100, detail: '原文一', sourceRefs: ['s1'] },
    ], summary: '共 1 條', tomorrowPlan: [],
  })
  mock.confirmCpmAi.mockResolvedValue([ITEM])
})

describe('P1 我的工作記錄（真实契约）', () => {
  it('加载日视图：条目、延续建议、认定徽章都按服务端数据渲染', async () => {
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    expect(await screen.findByText('已完成的事')).toBeTruthy()
    expect(screen.getByText('跨週期方案推進')).toBeTruthy()
    expect(screen.getByText('已認定')).toBeTruthy()
    // 数字不前端造：日视图接口带当天日期参数
    expect(mock.fetchCpmDay).toHaveBeenCalled()
  })

  it('快捷录入回车调用 create 且不本地拼装状态', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/回車即存/)
    await user.type(input, '測試快捷錄入{enter}')
    await waitFor(() => expect(mock.createCpmItem).toHaveBeenCalledTimes(1))
    const payload = mock.createCpmItem.mock.calls[0][0]
    expect(payload.title).toBe('測試快捷錄入')
    expect(payload.sourceType).toBe('manual')
  })

  it('延续建议点击走 carry 接口（不本地复制条目）', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    const chip = await screen.findByText('跨週期方案推進')
    await user.click(chip)
    await waitFor(() => expect(mock.carryCpmItem).toHaveBeenCalledWith(2))
  })

  it('删除必须经二次确认，确认后调用 delete', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    const deleteButtons = screen.getAllByText('刪除')
    await user.click(deleteButtons[0])
    expect(await screen.findAllByText('確定刪除該條工作記錄？')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '確認刪除' }))
    await waitFor(() => expect(mock.deleteCpmItem).toHaveBeenCalledWith(1))
  })

  it('工时 chip 仅在模板开启时出现，随进度一起提交（不跳编辑页）', async () => {
    const user = userEvent.setup()
    // 研发模板 workHoursEnabled=true：同一份页面代码要能按模板开关显隐工时入口
    mock.fetchCpmTemplates.mockResolvedValue([{
      ...TEMPLATE[0], templateKey: 'dev', name: '研發工程師', workHoursEnabled: true,
      categories: [{ key: 'dev', label: '開發', hint: null }],
    }])
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    await user.click(screen.getAllByRole('button', { name: /更新進度/ })[0])
    await user.click(await screen.findByText('2h'))
    await user.click(screen.getByRole('button', { name: /保存更新/ }))
    await waitFor(() => expect(mock.addCpmProgress).toHaveBeenCalledTimes(1))
    const payload = mock.addCpmProgress.mock.calls[0][1]
    expect(payload.workHours).toBe(2)
    // 夹具条目本身就是 done：状态沿用原值，进度由「done 即 100」这条口径推出，前端不自己算
    expect(payload.status).toBe('done')
    expect(payload.progress).toBe(100)
  })

  it('关联导入：候选来自服务端，已导入行禁用按钮，導入按来源对象建条目', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    await user.click(screen.getByRole('button', { name: /關聯導入/ }))
    expect(await screen.findByText('需求甲：结算改造')).toBeTruthy()
    // 已导入的行只可能由服务端 imported 标记驱动，前端不自行去重
    expect(screen.getByRole('button', { name: /已導入/ })).toBeDisabled()
    // 结案来源带「來源已結案」提示，未结案的不带
    expect(screen.getByText('來源已結案')).toBeTruthy()
    // antd 把两字文案插空格、图标 aria-label 进可及名，且工具栏「關聯導入」也含「導入」二字，
    // 因此必须锚定成「import 图标 + 導入」这一颗行内按钮，不能靠模糊匹配取第一个
    const importButtons = screen.getAllByRole('button', { name: /^import導\s*入$/ })
    expect(importButtons).toHaveLength(1)
    expect(importButtons[0]).toBeEnabled()
    await user.click(importButtons[0])
    await waitFor(() => expect(mock.createCpmItem).toHaveBeenCalledTimes(1))
    const payload = mock.createCpmItem.mock.calls[0][0]
    expect(payload.sourceType).toBe('rdm_requirement')
    expect(payload.sourceRef).toBe('501')
    expect(payload.sourceLabel).toBe('REQ-2026-0501')
    expect(payload.title).toBe('需求甲：结算改造')
    // 建完条目要回刷日视图，否则用户看不到刚导入的行
    await waitFor(() => expect(mock.fetchCpmDay.mock.calls.length).toBeGreaterThan(1))
  })

  it('记时：写的是时段表，不伪造一次进度更新', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    await user.click(screen.getByRole('button', { name: /記時/ }))
    expect(await screen.findByText('今天還沒有投入時段')).toBeTruthy()

    const minutes = await screen.findByPlaceholderText(/耗時\(分\)/)
    await user.click(screen.getByRole('button', { name: /添加時段/ }))
    // 起止与耗时都没填：不能凭空造一段 0 分钟的投入
    await waitFor(() => expect(mock.createCpmTimeEntry).not.toHaveBeenCalled())
    expect(mock.addCpmProgress).not.toHaveBeenCalled()

    await user.clear(minutes)
    await user.type(minutes, '90')
    await user.click(screen.getByRole('button', { name: /添加時段/ }))
    await waitFor(() => expect(mock.createCpmTimeEntry).toHaveBeenCalledTimes(1))
    expect(mock.createCpmTimeEntry.mock.calls[0][0]).toBe(1)
    expect(mock.createCpmTimeEntry.mock.calls[0][1]).toMatchObject({ workDate: expect.any(String), durationMinutes: 90 })
    // 记时是独立事实：它绝不该顺手改进度，否则「补时间」会变成「伪造一次状态跃迁」
    expect(mock.addCpmProgress).not.toHaveBeenCalled()
    expect(await screen.findByText(/今天 1 小時 30 分/)).toBeTruthy()
    expect(document.querySelectorAll('.cpm-time__row').length).toBe(1)
  }, 20000)

  it('标记已取消：CHECK 放宽后照常走后端，条目进已取消组并默认折叠', async () => {
    const user = userEvent.setup()
    // 保存前后返回不同状态：模拟「服务端接受 cancelled」这一事实，而不是前端本地改色
    let cancelled = false
    mock.fetchCpmDay.mockImplementation(async () => ({
      date: '2026-11-18', items: [{ ...ITEM, status: cancelled ? 'cancelled' : 'done' }], carryCandidates: [], times: [],
    }))
    mock.addCpmProgress.mockImplementation(async () => { cancelled = true })
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    await user.click(screen.getAllByRole('button', { name: /更新進度/ })[0])
    const option = [...document.querySelectorAll('.ant-segmented-item')]
      .find(node => node.textContent?.includes('已取消'))
    expect(option).toBeTruthy()
    await user.click(option!)
    await user.click(screen.getByRole('button', { name: /保存更新/ }))
    // cancelled 已是后端合法枚举：预览时代「不写库」的分支必须删干净，否则用户以为取消成功了
    await waitFor(() => expect(mock.addCpmProgress).toHaveBeenCalledTimes(1))
    expect(mock.addCpmProgress.mock.calls[0][1].status).toBe('cancelled')
    await waitFor(() => expect(screen.getByText('已取消')).toBeTruthy())
    expect(screen.getByText('1 條')).toBeTruthy()
  }, 20000)

  it('RDM 任务档：候选是任务口径，且只有任务档给回写开关', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    await screen.findByText('已完成的事')
    await user.click(screen.getByRole('button', { name: /關聯導入/ }))
    const taskTab = [...document.querySelectorAll('.ant-segmented-item')]
      .find(node => node.textContent?.includes('產研任務'))
    await user.click(taskTab!)
    expect(await screen.findByText('實現多幣種拆單計價引擎')).toBeTruthy()
    // 需求档与任务档的分工必须写在脸上：写 requirement.progress 等于造第二套假真值
    expect(screen.getByText(/導入後進度更新會回寫/)).toBeTruthy()
    expect(document.querySelectorAll('.cpm-source__row').length).toBe(1)
    // PRD 任务的 100% 只能走提交评审，界面预先标出来，不让用户撞后端拒绝
    expect(screen.getByText('PRD 任務')).toBeTruthy()
    // 计划工时只是展示素材，不参与 CPM 工时统计
    expect(screen.getByText(/計劃 16h/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^import導\s*入$/ }))
    await waitFor(() => expect(mock.createCpmItem).toHaveBeenCalledTimes(1))
    const payload = mock.createCpmItem.mock.calls[0][0]
    // 真写 rdm_task + taskId：回写徽标读的是服务端落库结果，本地绑定刷新就没了
    expect(payload.sourceType).toBe('rdm_task')
    expect(payload.sourceRef).toBe('7001')
    expect(payload.rdmSyncEnabled).toBe(true)
  }, 20000)

  it('回写开关与重新對齊各走各的接口（关掉不等于对齐）', async () => {
    const user = userEvent.setup()
    mock.fetchCpmDay.mockResolvedValue({
      date: '2026-11-18',
      items: [{ ...ITEM, sourceType: 'rdm_task', sourceRef: '7001', rdmSync: { enabled: true, state: 'conflict', message: 'RDM 已被他人上報到 70%', taskNo: 'TASK-2026-0701', taskId: 7001, rdmProgress: 70 } }],
      carryCandidates: [], times: [],
    })
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    const badge = await screen.findByRole('button', { name: /RDM 有變更/ })
    await user.click(badge)
    // 冲突必须看得见：徽标是这条链路唯一的失败出口
    expect(await screen.findByText(/RDM 已被他人上報到 70%/)).toBeTruthy()
    // 先关开关再点对齊：「重新對齊」会把浮层关掉，之后再点开关会撞上 pointer-events:none
    await user.click(screen.getByRole('switch'))
    await waitFor(() => expect(mock.setCpmRdmSync).toHaveBeenCalledWith(1, false))
    await user.click(screen.getByRole('button', { name: /以 RDM 當前值重新對齊/ }))
    await waitFor(() => expect(mock.realignCpmRdmSync).toHaveBeenCalledWith(1))
  }, 20000)

  /**
   * 浏览器走查（2026-11-19）发现的缺陷回归：总闸 `cpm.rdm-sync-enabled` 默认 false 时，
   * 条目侧开关虽然是开的、进度也写成功了，徽标却停在「未回寫／尚無回寫記錄」——
   * 用户无法区分「还没触发」「被 RDM 规则拒绝」「运维根本没打开」，
   * 只会反复更新进度。总闸状态必须由界面说出来，而不是只在服务端的返回值里。
   */
  it('总闸关闭时徽标说「系統未開啟回寫」，不再停在未回寫', async () => {
    mock.fetchCpmRdmSyncStatus.mockResolvedValue({ enabled: false })
    mock.fetchCpmDay.mockResolvedValue({
      date: '2026-11-18',
      items: [{ ...ITEM, sourceType: 'rdm_task', sourceRef: '7001', rdmSync: { enabled: true, state: 'pending', message: null, taskId: 7001, taskNo: 'TASK-2026-0701' } }],
      carryCandidates: [], times: [],
    })
    const user = userEvent.setup()
    mount(<MemoryRouter><MyWorklog /></MemoryRouter>)
    const badge = await screen.findByRole('button', { name: /系統未開啟回寫/ })
    await user.click(badge)
    expect(await screen.findByText(/運維尚未在服務端開啟 RDM 回寫總閘/)).toBeTruthy()
  }, 20000)
})

describe('P3 我的匯報（真实契约）', () => {
  it('进入即请求 current 呈现确定性初稿', async () => {
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    expect(await screen.findByText('自動聚合初稿')).toBeTruthy()
    expect(mock.fetchCpmCurrent).toHaveBeenCalledWith('week', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('发布走二次确认并调用 publish（前端不改写快照）', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    const publishBtn = await screen.findByRole('button', { name: /發布提交/ })
    await user.click(publishBtn)
    await screen.findAllByText('確認發布並提交匯報？')
    await user.click(screen.getByRole('button', { name: '確認發布' }))
    await waitFor(() => expect(mock.publishCpmReport).toHaveBeenCalledTimes(1))
    // 阶段三：已发布视图换成公文式阅读面，钉的是「发布后渲染的是冻结快照那一版」而不是某句标题文案
    // 章节标题的编号与文字分属两个 span（连续编号是版式的一部分），故按文字部分断言
    expect(await screen.findByText('工時投入匯總')).toBeTruthy()
    expect(screen.getByText('工作事項明細')).toBeTruthy()
    expect(screen.getByText(/發布：2026-11-18 20:00/)).toBeTruthy()
    expect(screen.getByText('版本 V1')).toBeTruthy()
  }, 20000)

  it('修订重发布产出 V2，且旧版本仍可切回只读查看', async () => {
    const user = userEvent.setup()
    publishedNow = true
    mock.fetchCpmRevisions.mockResolvedValue([
      // 后端给的是倒序列表，且只有一版是 current（指针落在那一版上）
      { ...REVISION_V1, revisionNo: 2, publishedAt: '2026-11-19 09:00', changeNote: '補錄週五投入時段', current: true },
      { ...REVISION_V1, current: false },
    ])
    mock.fetchCpmRevision.mockResolvedValue({ ...PUBLISHED_WEEK, snapshot: SNAPSHOT_WEEK('修訂前的事项', 90) })
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: /修訂並重新發布/ }))
    const note = await screen.findByPlaceholderText(/修訂說明/)
    await user.type(note, '補錄週五投入時段')
    await user.click(screen.getByRole('button', { name: /確認發布新版本/ }))
    // 重新聚合由服务端在 republish 里一次做完：前端「先 preview 再提交」会让冻结的那版
    // 不是用户确认的那版（两次聚合之间隔着并发补录）
    await waitFor(() => expect(mock.republishCpmReport).toHaveBeenCalledTimes(1))
    expect(mock.fetchCpmPreview).not.toHaveBeenCalled()
    expect(mock.republishCpmReport.mock.calls[0][0]).toMatchObject({ reportId: 9, changeNote: '補錄週五投入時段' })
    // 两个版本并存时抬头变成版本选择器，落款那行才给「当前是哪一版」
    expect(await screen.findByText('V2 正式版本')).toBeTruthy()
    expect(screen.getByText(/^V2 · /)).toBeTruthy()

    // 切回 V1：读的是该版冻结快照，不是把当前数据重新渲染一遍
    await user.click(screen.getByRole('combobox'))
    const option = await waitFor(() => {
      const node = [...document.querySelectorAll('.ant-select-item-option')]
        .find(item => item.textContent?.includes('V1 ·'))
      expect(node).toBeTruthy()
      return node!
    })
    await user.click(option)
    await waitFor(() => expect(mock.fetchCpmRevision).toHaveBeenCalledWith(9, 1))
    // 事项标题在明细区与「投入 Top」各出现一次，锚定 V1 快照的标题即证明渲染的是那一版
    expect((await screen.findAllByText('修訂前的事项')).length).toBeGreaterThan(0)
    expect(screen.queryByText('已完成的事')).toBeNull()
    // 历史版本只读取证链，不给再次发布入口
    expect(screen.getByText(/此版本內容不可修改/)).toBeTruthy()
  }, 30000)

  it('日报档只读：没有发布动作，也没有正式版本语义', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    await screen.findByText('自動聚合初稿')
    await user.click(screen.getByText('日報'))
    expect(await screen.findByText(/工作日報（/)).toBeTruthy()
    // 日报取数走服务端投影接口（与周报同一个 SnapshotBuilder），不是前端自己按日拼
    await waitFor(() => expect(mock.fetchCpmDaily).toHaveBeenCalled())
    // 日报不落 report 实体：给了发布按钮就等于给每人每天多一个打卡任务
    expect(screen.queryByRole('button', { name: /發布提交/ })).toBeNull()
    expect(screen.getByText(/日報 · 只讀投影/)).toBeTruthy()
    // 日报同样带工时章节（与周报同一个 SnapshotBuilder 的产物）
    expect(screen.getByText('時間分配（按分類）')).toBeTruthy()
  }, 20000)

  it('阶段二的旧发布不追认 V1：如实标「歷史發送快照」', async () => {
    publishedNow = true
    mock.fetchCpmRevisions.mockResolvedValue([])
    mock.fetchCpmCurrent.mockResolvedValue({
      ...PUBLISHED_WEEK, revisionNo: null, publishedRevisionId: null,
      snapshot: { ...PUBLISHED_WEEK.snapshot, schemaVersion: 1, time: null },
    })
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    expect(await screen.findAllByText(/歷史發送快照/)).toBeTruthy()
    // V1 快照没有工时维度：要说「这一版发布时还没这个功能」，不能说成「本期没记录投入时间」
    expect(await screen.findByText(/這一版匯報發布時還沒有投入時間統計/)).toBeTruthy()
  }, 20000)

  it('Word 导出走服务端 blob，且带的是正在阅读的那一版', async () => {
    const user = userEvent.setup()
    publishedNow = true
    // jsdom 没有 createObjectURL：不补这两颗，下载链路会在测试里抛 TypeError 而被 catch 吞成失败提示
    const createObjectURL = vi.fn(() => 'blob:cpm-docx')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    mock.exportCpmReportDocx.mockResolvedValue(new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
    mount(<MemoryRouter><MyReport /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: /導出/ }))
    await user.click(await screen.findByText('Word 文件（.docx）'))
    // 导出的必须是当前版本号：不带 revisionNo 的话，修订过一次之后用户永远只能拿到最新版
    await waitFor(() => expect(mock.exportCpmReportDocx).toHaveBeenCalledWith(9, 1))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  }, 20000)
})

describe('P4 團隊匯報（真实契约）', () => {
  it('统计卡渲染服务端 stats，未交成员提供催办/未授权时降级显示', async () => {
    mount(<MemoryRouter><TeamReport /></MemoryRouter>)
    expect(await screen.findByText('李強')).toBeTruthy()
    // 50% 提交率来自服务端 stats（AnimatedNumber 计数动画约 1.2s，轮询放宽）
    expect(await screen.findByText('50%', undefined, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText(/本期提交 1\/2/)).toBeTruthy()
  })

  it('催办确认调用 remind 接口', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter><TeamReport /></MemoryRouter>)
    const remind = await screen.findByText('催繳提醒')
    await user.click(remind)
    await screen.findAllByText('確定發送提醒？')
    await user.click(screen.getByRole('button', { name: '確認提醒' }))
    await waitFor(() => expect(mock.remindCpmMember).toHaveBeenCalledWith(2, 'week', expect.any(String)))
  }, 20000)
})

describe('汇报详情 CFR（真实契约）', () => {
  it('已发布他人汇报展示反馈条，点赞调用 reaction 接口', async () => {
    const user = userEvent.setup()
    mount(<MemoryRouter initialEntries={['/cpm-report-detail?id=12']}><ReportDetail /></MemoryRouter>)
    // 阶段三阅读面的身份行是「匯報人：姓名（工号）」；页头 meta 也含同名，必须锚定身份行而不是任意匹配
    expect(await screen.findByText(/匯報人：陳靜/)).toBeTruthy()
    const like = await screen.findByRole('button', { name: /點讚/ })
    await user.click(like)
    await waitFor(() => expect(mock.toggleCpmReaction).toHaveBeenCalledWith('report', 12))
  }, 20000)
})

describe('P2 AI 助手（真实契约）', () => {
  it('粘贴→提取→预览；确认前不写条目，确认后走 confirm', async () => {
    const user = userEvent.setup()
    mount(
      <AiAssistantDrawer
        open
        onClose={() => undefined}
        dateStr="2026-11-18"
        templateKey="product"
        categories={[{ key: 'prd_review', label: '需求評審' }]}
        onConfirmed={() => undefined}
      />,
    )
    const textarea = await screen.findByPlaceholderText(/流水账/)
    await user.type(textarea, '上午完成XX評審，結論通過')
    await user.click(screen.getByRole('button', { name: /AI 整理/ }))
    await waitFor(() => expect(mock.extractCpmAi).toHaveBeenCalledTimes(1))
    // 预览出现「添加到今天」；未点确认前不得调用 confirm
    // 候选标题是可编辑 Input（value 不进 textContent），按 displayValue 断言
    expect(await screen.findByDisplayValue('整理出的事項一')).toBeTruthy()
    expect(mock.confirmCpmAi).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /添加到今天/ }))
    await waitFor(() => expect(mock.confirmCpmAi).toHaveBeenCalledTimes(1))
    const confirmPayload = mock.confirmCpmAi.mock.calls[0][0]
    expect(confirmPayload.selected).toHaveLength(1)
    expect(confirmPayload.workDate).toBe('2026-11-18')
  }, 20000)
})
