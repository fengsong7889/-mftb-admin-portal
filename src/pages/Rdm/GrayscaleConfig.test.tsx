/**
 * V3 灰度管理 —— 任務30 雙獨立開關 / 僅管理員 / 門禁口徑測試
 *
 * 釘死：
 *  1. 默認關閉說明 + 多句規則用 HelpPopover（Popover，非 Tooltip）；
 *  2. 僅管理員（無 rdm-delivery-release:edit）時開關禁用並給提示；
 *  3. GLOBAL 開關切換 → updateGlobalFlowFlags 帶 expectedVersion（樂觀鎖），且雙開關獨立（只帶被切的一個）；
 *  4. 項目級雙獨立開關 → updateProjectFlowFlags 只帶被切的一個 + expectedVersion。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Modal, message } from 'antd'
import { fetchGrayscaleStatus, updateGlobalFlowFlags, updateProjectFlowFlags } from '../../api/rdm'
import GrayscaleConfig from './GrayscaleConfig'

let canEdit = true
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => canEdit, hasMenuPermission: () => canEdit }),
}))

vi.mock('../../api/rdm', () => ({
  fetchGrayscaleStatus: vi.fn(),
  updateGlobalFlowFlags: vi.fn(),
  updateProjectFlowFlags: vi.fn(),
}))

const status = {
  global: {
    exists: true, scopeKey: 'GLOBAL', v3WriteEnabled: 0, v3ReleaseEnabled: 0,
    globalWritePaused: 0, globalReleasePaused: 0, productVerificationDays: 3, businessVerificationDays: 5,
    version: 4, updatedBy: 9, updatedAt: '2026-05-01T10:00:00',
  },
  project: {
    exists: true, projectId: 7, scopeKey: 'PROJECT:7', v3WriteEnabled: 0, v3ReleaseEnabled: 0,
    version: 3, updatedBy: 9, updatedAt: '2026-05-01T10:00:00',
  },
  effectiveV3Write: false, effectiveV3Release: false,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  canEdit = true
  vi.mocked(fetchGrayscaleStatus).mockResolvedValue(status)
  vi.mocked(updateGlobalFlowFlags).mockResolvedValue(status)
  vi.mocked(updateProjectFlowFlags).mockResolvedValue(status)
})

/**
 * Modal.confirm / message 靜態方法渲染到 document.body，不隨組件卸載清理；
 * 不銷毀的話下一個用例會命中殘留彈窗、點到舊閉包的回調（reasonVal 為空）→ 假失敗。
 */
afterEach(() => {
  Modal.destroyAll()
  message.destroy()
  document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-message').forEach(n => n.remove())
})

function renderPage() {
  return render(<MemoryRouter><GrayscaleConfig /></MemoryRouter>)
}

/** 打開確認彈窗、填必填原因、點確認變更（在 confirm dialog 內定位，避免命中殘留彈窗） */
async function submitConfirm(reason = '灰度變更原因') {
  const dialog = await screen.findByRole('dialog')
  const input = within(dialog).getByPlaceholderText('變更原因（必填，審計留痕）')
  await act(async () => { fireEvent.change(input, { target: { value: reason } }) })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確認變更' })) })
}

describe('GrayscaleConfig 門禁口徑說明（HelpPopover，非 Tooltip）', () => {
  it('點擊說明入口用 Popover 展開「開啟灰度 ≠ 放開發布門禁」，而非 Tooltip', async () => {
    renderPage()
    const trigger = await screen.findByRole('button', { name: /為什麼開啟灰度也不等於能發布/ })
    fireEvent.click(trigger)
    await waitFor(() => expect(document.body.textContent).toContain('開啟灰度 ≠ 放開發布門禁'))
    // Popover 而非 Tooltip
    expect(document.querySelector('.ant-popover')).not.toBeNull()
    expect(document.querySelector('.ant-tooltip')).toBeNull()
  })

  it('默認關閉呈现：global 各開關值為 0 時展示「關閉」', async () => {
    renderPage()
    await screen.findByText('GLOBAL 灰度 / 熔斷', undefined, { timeout: 4000 })
    expect(screen.getAllByText('關閉').length).toBeGreaterThan(0)
  })
})

describe('GrayscaleConfig 僅管理員', () => {
  it('無 rdm-delivery-release:edit 時給提示且開關禁用', async () => {
    canEdit = false
    renderPage()
    expect(await screen.findByText('僅管理員可操作灰度開關')).toBeInTheDocument()
    const switches = await screen.findAllByRole('switch', undefined, { timeout: 4000 })
    expect(switches[0]).toBeDisabled()
  })
})

describe('GrayscaleConfig GLOBAL 開關（expectedVersion + 獨立）', () => {
  it('切換全局 V3 寫入總閘 → updateGlobalFlowFlags 帶 expectedVersion=4 且只帶 v3WriteEnabled', async () => {
    renderPage()
    const switches = await screen.findAllByRole('switch', undefined, { timeout: 4000 })
    // [0]=全局 V3 寫入總閘
    fireEvent.click(switches[0])
    await submitConfirm()
    await waitFor(() => expect(updateGlobalFlowFlags).toHaveBeenCalled())
    const payload = vi.mocked(updateGlobalFlowFlags).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(payload).toMatchObject({ v3WriteEnabled: 1, expectedVersion: 4 })
    // 雙開關獨立：未切的發布開關不出現在 payload（null=不變）
    expect('v3ReleaseEnabled' in payload).toBe(false)
  })
})

describe('GrayscaleConfig 項目級雙獨立開關', () => {
  it('指定項目後切換「項目 V3 寫入」→ updateProjectFlowFlags 只帶 v3WriteEnabled + expectedVersion=3', async () => {
    renderPage()
    await screen.findAllByRole('switch', undefined, { timeout: 4000 })
    // 指定項目 ID
    const pid = screen.getByPlaceholderText('項目 ID（可選）')
    fireEvent.change(pid, { target: { value: '7' } })
    await waitFor(() => expect(fetchGrayscaleStatus).toHaveBeenCalledWith(7))
    // [4]=項目 V3 寫入（前 4 個為 GLOBAL）
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[4])
    await submitConfirm()
    await waitFor(() => expect(updateProjectFlowFlags).toHaveBeenCalled())
    const payload = vi.mocked(updateProjectFlowFlags).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(payload).toMatchObject({ projectId: 7, v3WriteEnabled: 1, expectedVersion: 3 })
    expect('v3ReleaseEnabled' in payload).toBe(false)
  })
})
