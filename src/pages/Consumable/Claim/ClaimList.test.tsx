/**
 * 耗材领用列表查询区契约测试
 *
 * 钉住用户确认的界面口径：四个查询条件（領用單號/申請人/所屬部門/狀態）必须存在，
 * 且点击「查詢」后条件以 claimNo/applicantName/departmentId/status 下推给后端；
 * 列表列名使用「所屬部門」（历史上曾误写为「部門」）。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClaimList from './ClaimList'

// t 必须是稳定引用：真实 react-i18next 的 t 在渲染之间不变。写成每次新建的内联函数时，
// 把 t 放进 useCallback 依赖的 ClaimList#loadData 会陷入「渲染→effect→setState」死循环，
// act() 永不收敛，用例表现为 60s 超时而非断言失败。
const i18n = vi.hoisted(() => ({ t: (key: string) => key }))

const api = vi.hoisted(() => ({
  fetchClaims: vi.fn(),
  fetchMyClaims: vi.fn(),
  cancelClaim: vi.fn(),
  issueClaim: vi.fn(),
  fetchDepartments: vi.fn(),
}))

vi.mock('../../../api/consumable', () => ({
  fetchConsumableClaims: api.fetchClaims,
  fetchMyConsumableClaims: api.fetchMyClaims,
  cancelConsumableClaim: api.cancelClaim,
  issueConsumableClaim: api.issueClaim,
}))
vi.mock('../../../api/department', () => ({ fetchDepartments: api.fetchDepartments }))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))
// t 返回 key 本身：断言直接锁定文案键，语言切换测试不受译文措辞影响
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }))

const claimRow = {
  id: 1, claimNo: 'HCLY202610090001', applicantId: 9, applicantName: '馮松',
  department: '行政部', departmentId: 5, reason: '辦公室補貨',
  status: 'pending', createdAt: '2026-10-09 10:00:00', totalKinds: 1, totalQty: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchClaims.mockResolvedValue({ records: [claimRow], total: 1 })
  api.fetchMyClaims.mockResolvedValue({ records: [claimRow], total: 1 })
  api.fetchDepartments.mockResolvedValue([{ id: 5, name: '行政部', parentId: null }])
})

async function mount() {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <ClaimList onAdd={() => {}} onDetail={() => {}} />
    </ConfigProvider>)
  })
}

describe('耗材领用列表查询区', () => {
  it('渲染四个带标签的查询条件与查询/重置按钮', async () => {
    await mount()
    expect(screen.getByLabelText('consumable.claimNo')).toBeInTheDocument()
    expect(screen.getByLabelText('consumable.claimApplicant')).toBeInTheDocument()
    expect(screen.getByLabelText('consumable.claimDepartment')).toBeInTheDocument()
    expect(screen.getByLabelText('common.colStatus')).toBeInTheDocument()
    expect(screen.getByText('common.search')).toBeInTheDocument()
    expect(screen.getByText('common.reset')).toBeInTheDocument()
  })

  it('输入单号与申请人后点击查询，条件以约定参数下推后端', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('consumable.claimNo'), { target: { value: ' HCLY2026 ' } })
    fireEvent.change(screen.getByLabelText('consumable.claimApplicant'), { target: { value: '馮松' } })
    fireEvent.click(screen.getByText('common.search'))

    await waitFor(() => expect(api.fetchClaims).toHaveBeenCalled())
    const lastQuery = api.fetchClaims.mock.calls.at(-1)?.[0]
    expect(lastQuery).toMatchObject({ claimNo: 'HCLY2026', applicantName: '馮松' })
  })

  it('回车等同于点击查询，重置清空条件后回到第一页重新加载', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('consumable.claimNo'), { target: { value: 'HCLY' } })
    // antd Input 的 onPressEnter 走 keydown（e.key === 'Enter'），keyPress 事件已废用且不会触发
    fireEvent.keyDown(screen.getByLabelText('consumable.claimNo'), { key: 'Enter', code: 'Enter', keyCode: 13 })
    await waitFor(() => expect(api.fetchClaims.mock.calls.at(-1)?.[0]).toMatchObject({ claimNo: 'HCLY' }))

    const callsBeforeReset = api.fetchClaims.mock.calls.length
    fireEvent.click(screen.getByText('common.reset'))
    // 重置必须真的重新发一次请求，并把条件清空回到第一页
    // （组件固定携带 claimNo 键、空值时为 undefined，由请求层序列化时略去，所以断言值而不是键）
    await waitFor(() => expect(api.fetchClaims.mock.calls.length).toBeGreaterThan(callsBeforeReset))
    const afterReset = api.fetchClaims.mock.calls.at(-1)?.[0]
    expect(afterReset.claimNo).toBeUndefined()
    expect(afterReset.page).toBe(1)
    expect(screen.getByLabelText('consumable.claimNo')).toHaveValue('')
  })

  it('列表列名使用「所属部门」而非旧的「部门」', async () => {
    await mount()
    expect(screen.getAllByText('consumable.claimDepartment').length).toBeGreaterThan(1)
    expect(screen.queryByText('consumable.department')).not.toBeInTheDocument()
  })

  it('切换到我的领用时改用本人接口，同样携带筛选条件', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('consumable.claimNo'), { target: { value: 'HCLY' } })
    fireEvent.click(screen.getByText('common.search'))
    await waitFor(() => expect(api.fetchClaims).toHaveBeenCalled())

    fireEvent.click(screen.getByText('consumable.claimTabMine'))
    await waitFor(() => expect(api.fetchMyClaims).toHaveBeenCalled())
    expect(api.fetchMyClaims.mock.calls.at(-1)?.[0]).toMatchObject({ claimNo: 'HCLY' })
  })
})
