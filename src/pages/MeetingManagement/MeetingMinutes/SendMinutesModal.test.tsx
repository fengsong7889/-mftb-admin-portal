/**
 * 纪要发送面板回归用例。
 *
 * <p>钉住两条最容易在"顺手改一下提示文案"时被弄丢的口径：
 *   1. 没选群也没选收件人时必须拦住——放过去就会留一个空批次，发送历史里出现"发给了 0 人"的幽灵记录；
 *   2. 群候选只接受"已启用的钉钉群"，并且提示里必须说清"只发选中的群、不回退默认群"——
 *      发错群是内部纪要外泄，这句话是用户唯一能看到的安全承诺。
 * 同时验证预览区渲染的是当前正文：确认前看不到自己要发什么，二次确认就只是走过场。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SendMinutesModal from './SendMinutesModal'
import i18n from '../../../i18n'
import type { MinutesContent } from '../../../api/meetingMinutes'

const sendMinutes = vi.fn()
const fetchMinutesGroups = vi.fn()

vi.mock('../../../api/meetingMinutes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/meetingMinutes')>()
  return { ...actual, sendMinutes: (...args: unknown[]) => sendMinutes(...args), fetchMinutesGroups: (...args: unknown[]) => fetchMinutesGroups(...args) }
})

vi.mock('../../../api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
}))

import type { MinutesSendResult } from '../../../api/meetingMinutes'

const CONTENT: MinutesContent = {
  items: [{ topic: '分攤口徑', discussion: '財務主張按營收', conclusion: '按營收分攤' }],
  actions: [{ content: '輸出明細表', ownerUserId: 7, ownerName: '張三', ownerEmpNo: 'MF00007', dueDate: '2026-10-31' }],
  openIssues: [{ content: '預算池是否共用', needDecisionBy: '財務負責人' }],
  absentees: [{ name: '李四', empNo: 'MF00002', reason: '請假' }],
  nextMeetingAt: '2026-11-02 10:00',
  nextMeetingNote: '帶明細表復核',
  remark: '資料在文件中心',
}

const MEETING = {
  id: 100, bookingNo: 'MT202610190001', title: 'Q4 預算復核', attendees: [
    { id: 1, userId: 7, name: '張三', empNo: 'MF00007', attendeeType: 'required', response: 'accepted' },
    { id: 2, userId: null, name: '外部訪客', attendeeType: 'external', response: 'pending' },
  ],
} as never

function RESULT(overrides: Partial<MinutesSendResult> = {}): MinutesSendResult {
  return {
    sendId: 77, batchSeq: 1, queued: 1, skipped: 0, scenarioActive: true, groupQueued: true,
    deliveries: [], ...overrides,
  } as MinutesSendResult
}

function open(onSent = vi.fn(), linkBase: { linkBaseUrl?: string | null; linkBasePublic?: boolean } = {}) {
  render(
    <SendMinutesModal
      minutesId={9}
      meeting={MEETING}
      content={CONTENT}
      version={0}
      {...linkBase}
      onClose={vi.fn()}
      onSent={onSent}
    />,
  )
  return onSent
}

describe('紀要發送面板', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    fetchMinutesGroups.mockResolvedValue([{ id: 88, name: '行政通知群' }, { id: 99, name: '財務大群' }])
  })

  it('群候选只列名称，不含 webhook 或密钥字段', async () => {
    open()
    await waitFor(() => expect(fetchMinutesGroups).toHaveBeenCalled())
    expect(screen.getByText('發送到釘釘群')).toBeInTheDocument()
    // 弹窗里没有手机号/webhook 的容身处：候选只有 id 与名称
    expect(document.body.textContent).not.toMatch(/access_token|webhook/i)
  })

  it('未选群也未选人时拦住发送，并给出原因', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /確認發送/ }))
    await waitFor(() => expect(sendMinutes).not.toHaveBeenCalled())
    expect(screen.getByText('請選擇釘釘群或至少一位收件人')).toBeInTheDocument()
  })

  it('带摘要与批次去重提示：确认前必须看得见"发给谁"和"为什么重发不会丢"', async () => {
    open()
    expect(screen.getByText('Q4 預算復核')).toBeInTheDocument()
    expect(screen.getByText('未選擇')).toBeInTheDocument()
    expect(screen.getByText('0 人')).toBeInTheDocument()
    expect(screen.getByText(/釘釘對同一員工當天相同內容只投一條/)).toBeInTheDocument()
    expect(screen.getByText('只發選中的群，不會回退到默認群')).toBeInTheDocument()
  })

  it('预览区渲染当前正文分区，而不是只给一句"将发送纪要"', async () => {
    open()
    // 议题在卡片里带序号前缀、负责人带「負責人：」前缀，文本被拆开，用模糊匹配
    expect(screen.getByText(/分攤口徑/)).toBeInTheDocument()
    expect(screen.getByText(/輸出明細表/)).toBeInTheDocument()
    expect(screen.getByText(/張三（MF00007）/)).toBeInTheDocument()
    expect(screen.getByText(/預算池是否共用/)).toBeInTheDocument()
  })

  it('一键带入参会人只带系统内的人，外部参会人不会被算进收件人数', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /一鍵帶入參會人/ }))
    expect(screen.getByText('1 人')).toBeInTheDocument()
    expect(screen.getByText('已選 1 人')).toBeInTheDocument()
  })

  it('确认后带上幂等键提交，并把结果原样交给外层', async () => {
    sendMinutes.mockResolvedValue(RESULT())
    const onSent = open()
    fireEvent.click(screen.getByRole('button', { name: /一鍵帶入參會人/ }))
    fireEvent.click(screen.getByRole('button', { name: /確認發送/ }))
    await waitFor(() => expect(sendMinutes).toHaveBeenCalledTimes(1))
    const [id, payload] = sendMinutes.mock.calls[0]
    expect(id).toBe(9)
    expect(payload.receiverUserIds).toEqual([7])
    expect(payload.requestKey).toBeTruthy()
    expect(payload.version).toBe(0)
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1))
  })

  it('站点是内网地址时，发送前明确警告手机打不开（本次事故的直接原因）', () => {
    open(vi.fn(), { linkBaseUrl: 'http://192.168.31.88:3000', linkBasePublic: false })
    expect(screen.getByText(/192\.168\.31\.88:3000/)).toBeInTheDocument()
    expect(screen.getByText(/手機或釘釘將無法打開/)).toBeInTheDocument()
    expect(screen.getByText(/請到「通知配置 → 企業應用」把站點地址改為公網 HTTPS/)).toBeInTheDocument()
  })

  it('公网站点不出现链接警告', () => {
    open(vi.fn(), {
      linkBaseUrl: 'https://fengsong7889.github.io/-mftb-admin-portal',
      linkBasePublic: true,
    })
    expect(screen.queryByText(/手機或釘釘將無法打開/)).not.toBeInTheDocument()
  })

  it('未配置站点地址时提示卡片不会带查看链接', () => {
    open(vi.fn(), { linkBaseUrl: null })
    expect(screen.getByText(/不會帶「查看完整紀要」連結/)).toBeInTheDocument()
  })

  it('只发群、一个人都没发时不谎报"已提交 N 份个人通知"', async () => {
    sendMinutes.mockResolvedValue(RESULT({ queued: 0, skipped: 2, scenarioActive: false }))
    open()
    // antd Select 的 placeholder 不是表单控件名，只能点开下拉再选项
    fireEvent.mouseDown(document.querySelector('.ant-select-selector') as Element)
    fireEvent.click(await screen.findByText('行政通知群'))
    fireEvent.click(screen.getByRole('button', { name: /確認發送/ }))
    await waitFor(() => expect(sendMinutes).toHaveBeenCalledTimes(1))
    expect(sendMinutes.mock.calls[0][1].groupChannelId).toBe(88)
    expect(await screen.findByText(/已提交到釘釘群/)).toBeInTheDocument()
  })
})
