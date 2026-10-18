import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import HrAuditTrail from './HrAuditTrail'
import { fetchHrAudit } from '@/api/hrAudit'
import type { HrAuditPage } from '@/api/hrAudit'

vi.mock('@/api/hrAudit', async () => {
  const actual = await vi.importActual<typeof import('@/api/hrAudit')>('@/api/hrAudit')
  return { ...actual, fetchHrAudit: vi.fn(), fetchHrAuditActions: vi.fn() }
})

const mockedFetch = vi.mocked(fetchHrAudit)

function page(over: Partial<HrAuditPage> = {}): HrAuditPage {
  return {
    total: 3,
    records: [
      {
        id: 1, userId: 7, empNo: 'MF00007', action: 'PROFILE_UPDATE', fieldName: 'idNumber',
        beforeValue: 'A123****90X', afterValue: 'B987****21Y', detail: null, reason: '證件換發',
        sourceReqNo: 'HR202610150001', effectiveDate: '2026-10-15', occurredAt: '2026-10-15T09:12:00',
        sensitive: 1, operator: 'HR專員',
      },
      {
        id: 2, userId: 7, empNo: 'MF00007', action: 'SENSITIVE_VIEW', fieldName: null,
        beforeValue: null, afterValue: null, detail: '查看明文：证件号/证件地址/详细住址',
        reason: null, sourceReqNo: null, effectiveDate: null, occurredAt: '2026-10-16T10:00:00',
        sensitive: 1, operator: 'HR專員',
      },
      {
        // 旧记录：发生时间从未写入（MP 把 fill 列显式写成 NULL 覆盖了 DDL 默认值）
        id: 3, userId: 7, empNo: 'MF00007', action: 'ACCOUNT_ENABLE', fieldName: 'status',
        beforeValue: '0', afterValue: '1', detail: null, reason: null,
        sourceReqNo: null, effectiveDate: null, occurredAt: null,
        sensitive: 0, operator: '系統管理員',
      },
    ],
    ...over,
  }
}

/**
 * 员工档案「人事操作記錄」。
 * 钉住三点：脱敏后的值原样呈现且没有「显示原文」入口、明文查看这类动作级留痕也出现在列表里、
 * 取数失败给错误而不是空列表（空列表会被读成「没人动过」）。
 */
describe('HrAuditTrail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
    mockedFetch.mockResolvedValue(page())
  })

  it('按员工取数并渲染字段级变更与动作级留痕', async () => {
    render(<HrAuditTrail userId={7} />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))
    expect(mockedFetch.mock.calls[0][0]).toMatchObject({ userId: 7, page: 1 })

    // 字段级：前值 → 后值（已是脱敏值）
    expect(await screen.findByText(/A123\*\*\*\*90X/)).toBeInTheDocument()
    // 动作级：没有前后值，但要看得见「谁查看了明文」
    expect(screen.getByText('明文查看')).toBeInTheDocument()
    expect(screen.getByText(/查看明文：证件号/)).toBeInTheDocument()
    // 来源单号让审计能回指人事单据
    expect(screen.getByText('HR202610150001')).toBeInTheDocument()
    // 界面上不存在任何还原原文的入口
    expect(screen.queryByText('顯示原文')).not.toBeInTheDocument()
    // 时间缺失必须说清是「未记录」，不能打一个 `-` 让人读成「没有时间这个属性」
    expect(await screen.findAllByText(/時間未記錄/)).toHaveLength(1)
  })

  it('取数失败显示错误而不是空数据', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'))
    render(<HrAuditTrail userId={7} />)

    expect(await screen.findByText('人事操作記錄取數失敗，請重試。')).toBeInTheDocument()
    expect(screen.queryByText('暫無人事操作記錄：本表自 2026-10 起開始累積，之前的操作不會被回溯記錄。'))
      .not.toBeInTheDocument()
  })

  it('空结果给「无记录」而不是错误', async () => {
    // 空列表与取数失败必须区分开：前者是「真的没人动过」，后者不能伪装成前者
    mockedFetch.mockResolvedValue({ records: [], total: 0 })
    render(<HrAuditTrail userId={7} />)

    expect(await screen.findByText('暫無人事操作記錄：本表自 2026-10 起開始累積，之前的操作不會被回溯記錄。'))
      .toBeInTheDocument()
    expect(screen.queryByText('人事操作記錄取數失敗，請重試。')).not.toBeInTheDocument()
  })

  it('筛选动作后回到第一页重新取数', async () => {
    // 总数 25 才会真长出第 2 页，能验证「换条件时页码归 1」而不是只验证取数
    mockedFetch.mockResolvedValue(page({ total: 25 }))
    render(<HrAuditTrail userId={7} />)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))

    // 先翻到第 2 页，再换筛选条件：停在旧页码上会看到「没有数据」的假象
    // （antd 分页页码是 <li><a> 而不是 button，拿 role=button 定位不到）
    const pageTwo = document.querySelector('.ant-pagination-item-2')
    expect(pageTwo).toBeTruthy()
    fireEvent.click(pageTwo!.querySelector('a') ?? pageTwo!)
    await waitFor(() => expect(mockedFetch.mock.calls.at(-1)?.[0].page).toBe(2))

    // 工具条的动作筛选是第一个 combobox（分页的 pageSize 切换器也是 combobox）
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.mouseDown(select)
    fireEvent.click(await screen.findByText('明文查看', { selector: '.ant-select-item-option-content' }))

    await waitFor(() => {
      const last = mockedFetch.mock.calls.at(-1)?.[0]
      expect(last?.action).toBe('SENSITIVE_VIEW')
      expect(last?.page).toBe(1)
    })
  })
})
