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
  fetchCpmSourceMeetingActions: vi.fn(),
  fetchCpmTemplates: vi.fn(),
  fetchCpmCurrent: vi.fn(),
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
}

const CARRY = { ...ITEM, id: 2, title: '跨週期方案推進', status: 'doing', progress: 40, recognized: true }

beforeEach(async () => {
  Modal.destroyAll()
  await i18n.changeLanguage('zh-TW')
  message.destroy()
  vi.clearAllMocks()
  mock.fetchCpmTemplates.mockResolvedValue(TEMPLATE)
  mock.fetchCpmDay.mockResolvedValue({ date: '2026-11-18', items: [ITEM], carryCandidates: [CARRY] })
  mock.createCpmItem.mockResolvedValue(ITEM)
  mock.carryCpmItem.mockResolvedValue(undefined)
  mock.fetchCpmSourceRdm.mockResolvedValue([
    { sourceType: 'rdm_requirement', sourceRef: '501', title: '需求甲：结算改造', subtitle: 'REQ-2026-0501', statusCode: 'developing', role: 'dev', progress: 60, dueDate: '2026-11-30', terminated: false, imported: false },
    { sourceType: 'rdm_requirement', sourceRef: '502', title: '需求乙：已上线核对', subtitle: 'REQ-2026-0502', statusCode: 'released', role: 'accept', progress: 100, dueDate: null, terminated: true, imported: true },
  ])
  mock.fetchCpmSourceMeetingActions.mockResolvedValue([])
  mock.addCpmProgress.mockResolvedValue(undefined)
  mock.deleteCpmItem.mockResolvedValue(undefined)
  mock.fetchCpmCurrent.mockResolvedValue({
    id: null, userId: 1, ownerName: '張偉', ownerEmpId: 'MF00001', periodType: 'week',
    periodStart: '2026-11-16', periodEnd: '2026-11-22', status: 'draft', summary: null, aiSummary: false,
    snapshot: {
      schemaVersion: 1, periodType: 'week', periodStart: '2026-11-16', periodEnd: '2026-11-22',
      groups: [{ category: 'prd_review', categoryLabel: '需求評審', items: [
        { itemId: 1, title: '已完成的事', status: 'done', progress: 100, workDate: '2026-11-18', trail: [], sourceType: 'manual', sourceLabel: null },
      ] }],
      totals: { total: 1, done: 1, doing: 0, todo: 0, blocked: 0 },
    },
    receiverCount: 1, readCount: 0, commentCount: 0, likeCount: 0, likedByMe: false,
  })
  mock.publishCpmReport.mockResolvedValue({
    id: 9, userId: 1, ownerName: '張偉', ownerEmpId: 'MF00001', periodType: 'week',
    periodStart: '2026-11-16', periodEnd: '2026-11-22', status: 'published', summary: 'ok', aiSummary: false,
    publishedAt: '2026-11-18 20:00',
    snapshot: { schemaVersion: 1, periodType: 'week', periodStart: '2026-11-16', periodEnd: '2026-11-22', groups: [], totals: { total: 1, done: 1, doing: 0, todo: 0, blocked: 0 } },
    receiverCount: 2, readCount: 1, commentCount: 0, likeCount: 0, likedByMe: false,
  })
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
    publishedAt: '2026-11-17 20:40',
    snapshot: { schemaVersion: 1, periodType: 'week', periodStart: '2026-11-16', periodEnd: '2026-11-22', groups: [], totals: { total: 0, done: 0, doing: 0, todo: 0, blocked: 0 } },
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
    expect(await screen.findByText('已發布內容（快照凍結，不可修改）')).toBeTruthy()
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
    // meta 行是「陳靜（MF00004） · 週期…」复合文本，用包含匹配
    expect(await screen.findByText(/陳靜/)).toBeTruthy()
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
