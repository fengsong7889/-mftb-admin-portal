/**
 * 項目總覽 —— 任務30 關鍵動線測試
 *
 * 釘死：
 *  1. URL ↔ 篩選/分頁同步（keyword/status/pmUserId/pageNo/pageSize 進查詢）；
 *  2. 統計卡可下鑽（點擊出現下鑽過濾 chip）；
 *  3. 統計失敗不回零（保留上次值 / 明確錯誤態，不靜默歸零）；
 *  4. 導出調 export-bundle 且帶當前 filters；
 *  5. reconciliation 不一致時給出提示而非靜默導出。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Modal } from 'antd'
import i18n from '@/i18n'
import {
  deleteProject, fetchExportBundle, fetchProjectDetail, fetchProjectPage, fetchProjectStats, updateProject,
} from '@/api/rdm'
import { exportProjectBundle } from './projectExport'
import ProjectOverview from './ProjectOverview'

// 操作列/下鑽文案已接入 i18n，用例固定走繁體語境（無 localStorage 記錄時默認 en）
beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

/**
 * 按用例动态收回某个菜单动作：默认全部授予（大多数用例只关心列表/统计），
 * 权限收敛与删除用例只针对性地摘掉对应动作。
 */
const deniedPermissions = vi.hoisted(() => new Set<string>())
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (key: string) => !deniedPermissions.has(key),
    hasMenuPermission: () => true,
  }),
}))

vi.mock('./projectExport', () => ({ exportProjectBundle: vi.fn() }))

vi.mock('@/api/employee', () => ({ fetchEmployees: vi.fn() }))

vi.mock('@/api/rdm', () => ({
  fetchProjectPage: vi.fn(),
  fetchProjectStats: vi.fn(),
  fetchExportBundle: vi.fn(),
  fetchProjectDetail: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, projectNo: 'PJ-001', name: '演示項目', objective: '目標',
    pmUserName: '張三', productOwnerUserName: '李四',
    planStartDate: '2026-01-01', planEndDate: '2026-06-01',
    // 后端 VO 的标记是 Integer(0/1)，测试桩必须与真实后端同形，否则布尔型回归测不出来
    status: 'in_progress', pausedFlag: 0, riskFlag: 0, overdueFlag: 0,
    deliveredCount: 2, totalDeliveryCount: 5, nextDeliveryDate: null,
    blockedCount: 0, pendingDecisionCount: 0, updatedAt: '2026-05-01T10:00:00',
    ...overrides,
  } as never
}

function renderAt(entry = '/rdm-project') {
  return render(<MemoryRouter initialEntries={[entry]}><ProjectOverview /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  deniedPermissions.clear()
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [makeRow()], total: 1 })
  vi.mocked(fetchProjectStats).mockResolvedValue({ inProgressCount: 3, attentionCount: 2, pendingDecisionCount: 1 } as never)
})

// Modal.confirm 静态挂在 body 上，cleanup() 不回收；残留弹窗会让下一条用例命中多份文本
afterEach(() => {
  Modal.destroyAll()
})

describe('ProjectOverview URL ↔ 篩選/分頁同步', () => {
  it('從 URL 還原 keyword/status/pmUserId/pageNo/pageSize 並真正進入查詢參數', async () => {
    renderAt('/rdm-project?keyword=abc&status=in_progress&pmUserId=7&pmName=%E5%BC%B5%E4%B8%89&pageNo=2&pageSize=50')
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalled())
    // 第二个参数是取消信号：读取接口已支持 AbortSignal，断言只关心查询条件
    expect(fetchProjectPage).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'abc', status: 'in_progress', pmUserId: 7, pageNo: 2, pageSize: 50,
    }), expect.anything())
  })
})

describe('ProjectOverview 統計卡下鑽', () => {
  it('點擊「在管項目」卡出現下鑽過濾 chip', async () => {
    renderAt()
    const card = await screen.findByTitle('點擊下鑽：僅看籌備/進行中項目')
    fireEvent.click(card)
    expect(await screen.findByText(/下鑽：在管項目/)).toBeInTheDocument()
  })

  it('下钻交给服务端：列表带 drill，统计卡不带 drill（否则卡片数字会被自己筛小）', async () => {
    renderAt()
    await screen.findByText('演示項目')
    // 服务端按 drill 回 4 行（与卡片 inProgressCount 同源），前端不再自己筛本页
    vi.mocked(fetchProjectPage).mockClear()
    vi.mocked(fetchProjectPage).mockResolvedValue({
      records: Array.from({ length: 4 }, (_, i) => makeRow({ id: i + 1, name: `進行中的項目${i + 1}` })),
      total: 4,
    })
    vi.mocked(fetchProjectStats).mockClear()
    fireEvent.click(await screen.findByTitle('點擊下鑽：僅看籌備/進行中項目'))
    // 过去是纯前端过滤「已加载的本页」，跳页时卡片说 4 行、表格只给本页命中的行；
    // 现在必须把口径下发后端，让 total 与卡片同源
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalledWith(expect.objectContaining({ drill: 'inProgress' }), expect.anything()))
    expect(fetchProjectStats).toHaveBeenCalledWith(expect.not.objectContaining({ drill: 'inProgress' }), expect.anything())
    // chip 与分页总数都用服务端返回的 total（不再是本页行数）
    expect(await screen.findByText(/下鑽：在管項目（4 個項目）/)).toBeInTheDocument()
    expect(screen.getByText('下鑽過濾：4 個項目')).toBeInTheDocument()
    expect(screen.getByText('進行中的項目4')).toBeInTheDocument()
  })

  it('需關注與待裁決卡各自下发自己的口径码，再点取消则不下发', async () => {
    renderAt()
    await screen.findByText('演示項目')
    vi.mocked(fetchProjectPage).mockClear()
    fireEvent.click(await screen.findByTitle('點擊下鑽：僅看風險/逾期/已暫停項目'))
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalledWith(expect.objectContaining({ drill: 'attention' }), expect.anything()))
    vi.mocked(fetchProjectPage).mockClear()
    fireEvent.click(await screen.findByTitle('點擊下鑽：僅看待裁決項目'))
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalledWith(expect.objectContaining({ drill: 'pending' }), expect.anything()))
    // 再點同口徑卡 = 取消下钻，drill 不得残留在列表请求里
    vi.mocked(fetchProjectPage).mockClear()
    fireEvent.click(await screen.findByTitle('點擊下鑽：僅看待裁決項目'))
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalledWith(expect.objectContaining({ drill: undefined }), expect.anything()))
  })
})

describe('ProjectOverview 統計失敗不回零', () => {
  it('統計接口失敗時渲染「—」明確錯誤態並給警告，不靜默歸零', async () => {
    vi.mocked(fetchProjectStats).mockRejectedValue(new Error('boom') as never)
    renderAt()
    // 明確錯誤態警告
    expect(await screen.findByText(/統計載入失敗/)).toBeInTheDocument()
    // 不顯示為 0，而是「—」占位（至少一個統計卡為破折號）
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('ProjectOverview 全量導出', () => {
  const bundle = (consistent: boolean, mismatches: string[]) => ({
    scope: {}, cards: {}, projects: [], items: [], todos: [],
    reconciliation: { consistent, mismatches, projectCount: 0, projectRowCount: 0, deliveryItemCount: 0, deliveryItemRowCount: 0, pendingDecisionSum: 0, pendingDecisionDirect: 0, deferResidualSum: 0, deferResidualDirect: 0, todoTotal: 0, todoRowCount: 0, todoBucketSum: 0, todoRawReasonHits: 0, closedProjectCount: 0, allDeliveredProjectCount: 0, computedAt: null },
    computedAt: null,
  } as never)

  it('導出調用 export-bundle 並帶當前 filters，一致時直接導出', async () => {
    vi.mocked(fetchExportBundle).mockResolvedValue(bundle(true, []))
    vi.mocked(exportProjectBundle).mockResolvedValue(undefined)
    renderAt('/rdm-project?keyword=abc&status=in_progress&pmUserId=7&pmName=張三')
    fireEvent.click(await screen.findByRole('button', { name: /導出全量報告/ }))
    await waitFor(() => expect(fetchExportBundle).toHaveBeenCalled())
    expect(fetchExportBundle).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'abc', status: 'in_progress', pmUserId: 7,
    }))
    await waitFor(() => expect(exportProjectBundle).toHaveBeenCalled())
  })

  it('reconciliation 不一致時給出提示而非靜默導出', async () => {
    vi.mocked(fetchExportBundle).mockResolvedValue(bundle(false, ['項目數不一致:1!=2']))
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: /導出全量報告/ }))
    // 出現對賬不一致提示（靜態 Modal.confirm 渲染到 body，稍等）
    await waitFor(() => expect(document.body.textContent).toContain('對賬口徑不一致'), { timeout: 4000 })
    expect(document.body.textContent).toContain('項目數不一致:1!=2')
    // 提示階段尚未真正導出
    expect(exportProjectBundle).not.toHaveBeenCalled()
  })
})

describe('ProjectOverview 三層進度與剩餘工作口徑', () => {
  it('交付進度同格呈現需求／交付項／研發任務三層計數（一律取自行事實，前端不换算）', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({
      records: [makeRow({ requirementTotal: 4, deliveredCount: 2, totalDeliveryCount: 5, taskCompleted: 7, taskTotal: 30 })],
      total: 1,
    })
    renderAt()
    expect(await screen.findByText('需求 4 條 · 交付項 已交 2／承諾 5 · 任務 7／30')).toBeInTheDocument()
  })

  it('还没承诺交付项的新项目不得显示成「全部完成」', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({
      records: [makeRow({ deliveredCount: 0, totalDeliveryCount: 0 })], total: 1,
    })
    renderAt()
    await screen.findByText('演示項目')
    expect(screen.getByText('尚未承諾交付項')).toBeInTheDocument()
    expect(screen.queryByText('全部完成')).not.toBeInTheDocument()
  })

  it('最後更新人取 updatedBy；列名已改名為「最後更新時間」', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({ records: [makeRow({ updatedBy: '古月' })], total: 1 })
    renderAt()
    await screen.findByText('演示項目')
    expect(screen.getByText('古月')).toBeInTheDocument()
    // 表头在横向滚动/冻结列下会渲染出多份副本，所以按「至少出现一次」断言列名
    expect(screen.getAllByText('最後更新人').length).toBeGreaterThan(0)
    expect(screen.getAllByText('最後更新時間').length).toBeGreaterThan(0)
  })
})

describe('ProjectOverview 項目編號列', () => {
  it('列表直接展示後端下發的項目編號（PROJ+YYYYMMDD+2 位日序），不再只在導出文件裡可見', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({
      records: [makeRow({ projectNo: 'PROJ2026102001' })], total: 1,
    })
    renderAt()
    expect(await screen.findByText('PROJ2026102001')).toBeInTheDocument()
    // 表头在冻结列下会渲染多份副本，按「至少出现一次」断言列名
    expect(screen.getAllByText('項目編號').length).toBeGreaterThan(0)
  })

  it('存量項目 projectNo 為空時降級顯示 -，不留空白格', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({ records: [makeRow({ projectNo: null })], total: 1 })
    const { container } = renderAt()
    await screen.findByText('演示項目')
    const cells = Array.from(container.querySelectorAll('.ant-table-tbody tr.ant-table-row td'))
    // 列顺序：項目編號固定在首列，故第一個單元格即編號
    expect(cells[0]?.textContent).toBe('-')
  })
})

describe('ProjectOverview 行操作栏（不再收进「更多」）', () => {
  it('編輯/暫停直接渲染在操作列，无需先点下拉', async () => {
    renderAt()
    await screen.findByText('演示項目')
    expect(screen.queryByRole('button', { name: /更多/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '詳情' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暫停項目' })).toBeInTheDocument()
  })

  it('已暂停的行给出「恢復推進」而不是「暫停項目」', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({ records: [makeRow({ pausedFlag: 1 })], total: 1 })
    renderAt()
    await screen.findByText('演示項目')
    expect(screen.getByRole('button', { name: '恢復推進' })).toBeInTheDocument()
    // 已暂停标记只以 Tag 呈现，状态列不再把 0/1 数字渲染成文本。
    // 限定在本行内查：统计卡数字动画从 0 起跳，全局 queryByText('0') 会误命中卡片而非表格
    const row = (await screen.findByText('演示項目')).closest('tr') as HTMLElement
    expect(within(row).queryByText('0')).not.toBeInTheDocument()
  })
})

describe('ProjectOverview 暫停真調後端', () => {
  it('暫停走 updateProject（先取 version 做乐观锁），非僅消息提示', async () => {
    vi.mocked(fetchProjectDetail).mockResolvedValue({ id: 1, version: 9 } as never)
    vi.mocked(updateProject).mockResolvedValue(undefined)
    renderAt()
    await screen.findByText('演示項目')
    // 行操作直接點暫停，再二次確認
    fireEvent.click(screen.getByRole('button', { name: '暫停項目' }))
    fireEvent.click(await screen.findByRole('button', { name: /確認暫停/ }))
    await waitFor(() => expect(fetchProjectDetail).toHaveBeenCalledWith(1))
    // 钉死后端契约：pausedFlag 上送 Integer 0/1，给布尔会被 Jackson 拒成 400「請求參數格式錯誤」
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(1, { pausedFlag: 1, expectedVersion: 9 }))
  })

  it('恢復推進上送 pausedFlag: 0', async () => {
    vi.mocked(fetchProjectPage).mockResolvedValue({ records: [makeRow({ pausedFlag: 1 })], total: 1 })
    vi.mocked(fetchProjectDetail).mockResolvedValue({ id: 1, version: 4 } as never)
    vi.mocked(updateProject).mockResolvedValue(undefined)
    renderAt()
    await screen.findByText('演示項目')
    fireEvent.click(screen.getByRole('button', { name: '恢復推進' }))
    fireEvent.click(await screen.findByRole('button', { name: /確認恢復/ }))
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(1, { pausedFlag: 0, expectedVersion: 4 }))
  })
})

describe('ProjectOverview 權限收斂與刪除', () => {
  it('只有查看權時操作列僅保留詳情，不渲染新增/編輯/暫停/刪除', async () => {
    deniedPermissions.add('rdm-dashboard-project:edit')
    deniedPermissions.add('rdm-dashboard-project:create')
    deniedPermissions.add('rdm-dashboard-project:delete')
    renderAt()
    await screen.findByText('演示項目')
    // 查看者必须能进只读详情；其余入口一律不渲染，避免点一次必然 403
    expect(screen.getByRole('button', { name: '詳情' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '暫停項目' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新增項目/ })).not.toBeInTheDocument()
  })

  it('刪除走二次確認並真調 deleteProject，成功後刷新列表', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined)
    renderAt()
    await screen.findByText('演示項目')
    vi.mocked(fetchProjectPage).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    // antd confirm 同时渲染 .ant-modal-title 与 .ant-modal-confirm-title 两份标题
    expect((await screen.findAllByText('確認刪除項目')).length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('僅未掛任何需求的項目可刪除')
    fireEvent.click(await screen.findByRole('button', { name: /確認刪除/ }))
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith(1))
    // 删除成功后必须重新取数与统计，不能只弹一句成功
    await waitFor(() => expect(fetchProjectPage).toHaveBeenCalled())
  })
})
