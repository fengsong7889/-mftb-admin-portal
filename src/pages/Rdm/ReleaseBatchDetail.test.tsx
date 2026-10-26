/**
 * 發布批次詳情頁 —— allowedActions ∩ 菜單權限 的按鈕口徑測試
 *
 * 釘死 leader 已確認的 11 碼下發矩陣在前端的渲染行為：
 *  1. 後端未下發的動作碼 → 對應按鈕一律不渲染（哪怕狀態理論上允許）；
 *  2. 後端下發的動作碼 ∩ rdm-delivery-release:edit → 才可點，缺權限則置灰；
 *  3. rollback 是止損例外：只要下發即渲染為 danger，即使灰度關閉也在；
 *  4. 灰度未開啟（v3ReleaseEnabled=false）顯示說明 Alert。
 *
 * 這是一份「口徑防漂移」測試：後端動作碼矩陣若與前端渲染不一致，這裡會第一時間紅。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { fetchReleaseBatchDetail, fetchReleaseBatchActions } from '@/api/rdm'
import ReleaseBatchDetail from './ReleaseBatchDetail'

// 可控的菜單權限開關（mock 讀取此變量）
let canEdit = true
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => canEdit, user: { empId: 'TEST001' } }),
}))

vi.mock('@/api/rdm', () => ({
  fetchReleaseBatchDetail: vi.fn(),
  fetchReleaseBatchActions: vi.fn(),
  checkReleaseBatch: vi.fn(),
  applyReleaseBatch: vi.fn(),
  decideReleaseBatch: vi.fn(),
  submitReleaseDeployment: vi.fn(),
  submitReleaseVerification: vi.fn(),
  openReleaseBatch: vi.fn(),
  rollbackReleaseBatch: vi.fn(),
  applyReleaseExemption: vi.fn(),
  decideReleaseExemption: vi.fn(),
  completeReleaseSupplementary: vi.fn(),
}))

/** 最小可渲染詳情（其餘欄位由 ?? / ?. 兜底） */
function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    batchNo: 'RB-2026-0001',
    versionTag: 'v1.0.0',
    status: 'verifying',
    version: 4,
    v3ReleaseEnabled: true,
    releaseOwnerUserName: '張三',
    applicantUserName: '李四',
    checkResults: [],
    deployments: [],
    exemptions: [],
    supplementaries: [],
    ...overrides,
  } as never
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/rdm-release-batch-detail?id=9']}>
      <ReleaseBatchDetail />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  canEdit = true
  vi.clearAllMocks()
})

describe('ReleaseBatchDetail 按鈕口徑（allowedActions ∩ 權限）', () => {
  it('未下發的動作碼不渲染按鈕；已下發的按 label 渲染', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail({ status: 'checking' }))
    // 後端只下發 apply，未下發 decide/deploy/rollback
    vi.mocked(fetchReleaseBatchActions).mockResolvedValue([
      { code: 'apply', label: '提交發布申請', tone: 'primary' },
    ] as never)

    renderPage()

    expect(await screen.findByRole('button', { name: /提交發布申請/ })).toBeInTheDocument()
    // 未下發的碼一律不出現（哪怕 status 理論上可能允許）
    expect(screen.queryByRole('button', { name: /回滾/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /裁決/ })).not.toBeInTheDocument()
  })

  it('下發的碼缺菜單權限時置灰（disabled）', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail({ status: 'checking' }))
    vi.mocked(fetchReleaseBatchActions).mockResolvedValue([
      { code: 'apply', label: '提交發布申請', tone: 'primary' },
    ] as never)

    canEdit = false
    renderPage()
    expect(await screen.findByRole('button', { name: /提交發布申請/ })).toBeDisabled()
  })

  it('下發的碼且有菜單權限時可點（enabled）', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail({ status: 'checking' }))
    vi.mocked(fetchReleaseBatchActions).mockResolvedValue([
      { code: 'apply', label: '提交發布申請', tone: 'primary' },
    ] as never)

    canEdit = true
    renderPage()
    expect(await screen.findByRole('button', { name: /提交發布申請/ })).not.toBeDisabled()
  })

  it('rollback 止損例外：灰度關閉時仍下發並渲染為 danger 按鈕', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail({ status: 'verifying', v3ReleaseEnabled: false }))
    // 灰度關閉：推進碼不下發，但 rollback 仍下發
    vi.mocked(fetchReleaseBatchActions).mockResolvedValue([
      { code: 'view', label: '查看' },
      { code: 'rollback', label: '回滾', tone: 'danger' },
    ] as never)

    renderPage()

    const rollbackBtn = await screen.findByRole('button', { name: /回滾/ })
    expect(rollbackBtn).toBeInTheDocument()
    expect(rollbackBtn).not.toBeDisabled()
    // AntD danger 按鈕帶 ant-btn-dangerous 類
    expect(rollbackBtn.className).toContain('ant-btn-dangerous')
    // 灰度未開啟說明 Alert 出現
    expect(await screen.findByText('本項目 V3 發布灰度未開啟')).toBeInTheDocument()
  })

  it('灰度開啟時不顯示灰度說明 Alert', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail({ v3ReleaseEnabled: true }))
    vi.mocked(fetchReleaseBatchActions).mockResolvedValue([{ code: 'view', label: '查看' }] as never)

    renderPage()

    expect(await screen.findByText('發布負責人')).toBeInTheDocument()
    expect(screen.queryByText('本項目 V3 發布灰度未開啟')).not.toBeInTheDocument()
  })

  it('actions 讀接口失敗時降級為空，不阻斷詳情渲染（只影響按鈕）', async () => {
    vi.mocked(fetchReleaseBatchDetail).mockResolvedValue(makeDetail())
    // 模擬組件內 .catch(() => []) 的降級路徑
    vi.mocked(fetchReleaseBatchActions).mockRejectedValue(new Error('Network Error') as never)

    renderPage()

    // 詳情仍渲染，摘要欄位可見
    expect(await screen.findByText('RB-2026-0001')).toBeInTheDocument()
    // 沒有任何動作碼 → 推進/止損按鈕都不渲染，僅剩「執行檢查/刷新」等非動作碼按鈕
    expect(screen.queryByRole('button', { name: /回滾/ })).not.toBeInTheDocument()
  })
})
