import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import type { OaRequestVO } from '../../../api/oaRequest'
import HrFlowDetail from './HrFlowDetail'

/**
 * 审批详情页必须按 processCode 判定单据域后再回查 bizId。
 * 历史缺陷：请假流程（oa_leave）复用本页时把 bizId 当入转调离主键查，
 * 结果「關聯單據」卡片整块显示他人的入职单，审批人核对的是错单。
 */
const fetchOaRequestDetail = vi.fn()
const fetchLifecycleRequest = vi.fn()
const fetchLeaveDetail = vi.fn()

vi.mock('../../../api/oaRequest', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/oaRequest')>(),
  fetchOaRequestDetail: (flowNo: string) => fetchOaRequestDetail(flowNo),
}))
vi.mock('../../../api/hrLifecycle', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/hrLifecycle')>(),
  fetchLifecycleRequest: (id: number) => fetchLifecycleRequest(id),
}))
vi.mock('../../../api/hrLeave', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/hrLeave')>(),
  fetchLeaveDetail: (id: number) => fetchLeaveDetail(id),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: '管理員', role: 'admin', empId: 'MF00001' }, hasPermission: () => true }),
}))

/** 入转调离单（lifecycle 表主键 4）与请假单（leave 表主键 4）同号不同表，用于验证不串单 */
const LIFECYCLE_DOC = {
  id: 4, reqNo: 'RS202609260004', type: 'onboard', status: 'pending',
  empName: '測試入職員', empNo: 'MF00029', deptName: '團購到店事業部',
  positionName: '經理主管', effectiveDate: '2026-09-26T00:00:00', reason: '入職用例',
}
const LEAVE_DOC = {
  id: 4, reqNo: 'LQ202609260004', userId: 24, empName: '張三', empNo: 'MF00024',
  deptName: '技術部', year: 2026, leaveType: 'ANNUAL', startDate: '2026-10-12',
  endDate: '2026-10-14', days: 3, reason: 'E2E 驗證請假', status: 'pending', flowNo: 'OA202609260004',
}

function flow(processCode: string): OaRequestVO {
  return {
    id: 1, flowNo: 'OA202609260004', processCode, processName: null,
    title: '審批單標題', formData: { bizId: 4 }, applicant: '張三', flowStatus: 'pending',
    currentNodeName: '人事審批', currentApprover: '管理員', myApprovalTime: null,
    rejectReason: null, applyTime: null, completeTime: null, cancelTime: null,
    groupId: null, groupName: null, brand: null,
    bizApprover: null, bizApproveTime: null, bizApproveStatus: null,
    opsApprover: null, opsApproveTime: null, opsApproveStatus: null,
    finApprover: null, finApproveTime: null, finApproveStatus: null,
    approvalTasks: [],
  } as OaRequestVO
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/hr-flow-detail?flowNo=OA202609260004&back=/hr-leave']}>
      <Routes>
        <Route path="/hr-flow-detail" element={<HrFlowDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('zh-TW')
})

describe('HrFlowDetail 按流程编码回查关联单据', () => {
  it('请假流程只查请假单，不得用 bizId 查入转调离', async () => {
    fetchOaRequestDetail.mockResolvedValue(flow('oa_leave'))
    fetchLeaveDetail.mockResolvedValue(LEAVE_DOC)

    mount()

    await waitFor(() => expect(fetchLeaveDetail).toHaveBeenCalledWith(4))
    expect(fetchLifecycleRequest).not.toHaveBeenCalled()
    expect(screen.getByText('LQ202609260004')).toBeTruthy()
    expect(screen.getByText('張三 (MF00024)')).toBeTruthy()
    expect(screen.queryByText('RS202609260004')).toBeNull()
    expect(screen.queryByText('測試入職員')).toBeNull()
  })

  it('入转调离流程只查生命周期单据，不得误查请假单', async () => {
    fetchOaRequestDetail.mockResolvedValue(flow('hr_onboard'))
    fetchLifecycleRequest.mockResolvedValue(LIFECYCLE_DOC)

    mount()

    await waitFor(() => expect(fetchLifecycleRequest).toHaveBeenCalledWith(4))
    expect(fetchLeaveDetail).not.toHaveBeenCalled()
    expect(screen.getByText('RS202609260004')).toBeTruthy()
    expect(screen.queryByText('LQ202609260004')).toBeNull()
  })

  it('非 HR 域流程只展示流程信息，不猜 bizId 归属', async () => {
    fetchOaRequestDetail.mockResolvedValue(flow('oa_purchase'))

    mount()

    await waitFor(() => expect(fetchOaRequestDetail).toHaveBeenCalledWith('OA202609260004'))
    expect(fetchLifecycleRequest).not.toHaveBeenCalled()
    expect(fetchLeaveDetail).not.toHaveBeenCalled()
    // 标题在页头 meta 组合串内（流程編號 · 標題 · 申請人），用子串匹配
    expect(screen.getByText(/審批單標題/)).toBeTruthy()
  })
})
