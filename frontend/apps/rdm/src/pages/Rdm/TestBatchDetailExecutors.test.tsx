/**
 * 提测批次详情「執行人員」显示测试。
 *
 * 钉死两件事（缺陷回归位）：
 *  1. 执行人必须显示服务端解析好的「姓名(工号)」，不得把 sys_user.id 裸串上界面
 *     （历史上这里写的是 executorUserIds.join(', ')，界面渲染成一串数字，没人看得懂是谁）；
 *  2. 后端没回 executorUserNames（旧制品/字段缺失）时宁可显示 '-'，也不得回退成裸 ID。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { acceptTestBatch, fetchTestBatchDetail, fetchTestBatchSummary, retestBatch, returnTestBatch, submitTestExecution } from '@/api/rdm'
import TestBatchDetail from './TestBatchDetail'

vi.mock('@/api/rdm', () => ({
  fetchTestBatchDetail: vi.fn(),
  fetchTestBatchSummary: vi.fn(),
  acceptTestBatch: vi.fn(),
  returnTestBatch: vi.fn(),
  submitTestExecution: vi.fn(),
  retestBatch: vi.fn(),
}))

/** 执行人内部 ID 与被测字段：断言时特意让 ID 数字（7/9）不出现在工号里，避免误判 */
const detail = {
  id: 300,
  batchNo: 'TC20261019001',
  reqId: 12,
  reqTitle: '報表導出',
  reqNo: 'XQSP202610120001',
  deliveryItemTitles: ['DI-1 導出按鈕'],
  testEnv: 'uat',
  testLeadUserName: '李四',
  status: 'pending',
  roundNo: 1,
  planEndTime: null,
  passCount: 0,
  failCount: 0,
  totalCount: 0,
  createdAt: '2026-10-19 10:00:00',
  updatedAt: '2026-10-19 10:00:00',
  scopeSnapshotJson: '[]',
  buildIdsJson: '[]',
  executorUserIds: [7, 9],
  executorUserNames: ['張三(MF00021)', '翁桥(MF00019)'],
  executions: [],
  applicantUserName: '王五',
  returnedReason: null,
  version: 0,
  frozenCases: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchTestBatchSummary).mockResolvedValue({
    totalCases: 0, executedCases: 0, passedCases: 0, failedCases: 0,
    blockedCases: 0, skippedCases: 0, notExecutedCases: 0, passRate: 0,
  } as never)
  vi.mocked(acceptTestBatch).mockResolvedValue({} as never)
  vi.mocked(returnTestBatch).mockResolvedValue({} as never)
  vi.mocked(submitTestExecution).mockResolvedValue({} as never)
  vi.mocked(retestBatch).mockResolvedValue({} as never)
})

const renderPage = async () => {
  render(<MemoryRouter initialEntries={['/rdm-test-detail?id=300']}><TestBatchDetail /></MemoryRouter>)
  return screen.findByText('執行人員')
}

/** 取「執行人員」所在描述行整行的文本（antd Descriptions 一行一个 tr） */
const executorRowText = async () => {
  const label = await renderPage()
  return label.closest('tr')?.textContent ?? ''
}

describe('提测批次详情：執行人員', () => {
  it('显示姓名(工号)标签，不出现裸用户 ID', async () => {
    vi.mocked(fetchTestBatchDetail).mockResolvedValue(detail as never)

    const row = await executorRowText()

    expect(row).toContain('張三(MF00021)')
    expect(row).toContain('翁桥(MF00019)')
    expect(row).not.toMatch(/\b7\b/)
    expect(row).not.toMatch(/\b9\b/)
  })

  it('后端未回姓名时显示占位符，绝不回退成 ID 串', async () => {
    const withoutNames = { ...detail, executorUserNames: undefined }
    vi.mocked(fetchTestBatchDetail).mockResolvedValue(withoutNames as never)

    const row = await executorRowText()

    expect(row).toContain('執行人員')
    expect(row).not.toMatch(/\b7\b/)
    expect(row).not.toMatch(/\b9\b/)
    expect(row).not.toContain('7, 9')
  })
})
