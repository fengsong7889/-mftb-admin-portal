/** 场景面板与页签接入回归：真实读写走 aiScene API，权限门控与诊断渲染正确，409 会刷新。 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import BusinessAiScenePanel from './BusinessAiScenePanel'
import AiOperationAuth from './index'
import {
  diagnoseMeetingAi, fetchMeetingAiDiagnoseEmployees, fetchMeetingAiSceneConfig, saveMeetingAiSceneConfig,
  type AiSceneConfig, type AiSceneDiagnosis,
} from '@/api/aiScene'

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn((_permission: string): boolean => true) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission }) }))
vi.mock('@/api/employee', () => ({ fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })), fetchEmployee: vi.fn() }))
vi.mock('@/api/aiScene', () => ({
  fetchMeetingAiSceneConfig: vi.fn(),
  saveMeetingAiSceneConfig: vi.fn(),
  diagnoseMeetingAi: vi.fn(),
  fetchMeetingAiDiagnoseEmployees: vi.fn(),
}))
vi.mock('@/api/aiOperationAuth', () => ({
  fetchToolRegistry: vi.fn(async () => []),
  aggregateCallStats: vi.fn(async () => []),
  fetchKillSwitch: vi.fn(async () => ({ engaged: false, operator: '', reason: '', updatedAt: '' })),
  toggleKillSwitch: vi.fn(),
  toggleToolStatus: vi.fn(),
}))
vi.mock('@/hooks/useColumnConfig', () => ({
  useColumnConfig: () => ({ configComponent: null, applyConfig: (columns: unknown[]) => columns }),
}))
vi.mock('./AccountWhitelistPanel', () => ({ default: () => <div>既有帳號白名單面板</div> }))

const baseConfig: AiSceneConfig = {
  sceneKey: 'meeting_minutes', systemCode: 'meeting', enabled: false, version: 3, reason: '上一次變更',
  environmentAllowed: true, environmentReasonCode: null, updatedBy: '李四', updatedAt: '2026-10-30T10:00:00',
}

const baseDiagnosis: AiSceneDiagnosis = {
  sceneKey: 'meeting_minutes', userId: 7, name: '張三', empId: 'MF00007', checkedAt: '2026-10-30T10:05:00',
  ready: false, authorized: true, modelKey: 'gpt-x', reasonCode: 'quota_reject', message: 'AI 使用額度不足',
  checks: [
    { key: 'account', status: 'passed', message: '帳號有效' },
    { key: 'scene', status: 'passed', message: '場景已啟用' },
    { key: 'permission', status: 'passed', message: '具備權限' },
    { key: 'quota', status: 'blocked', reasonCode: 'quota_reject', message: '額度不足', action: 'ai-apply' },
    { key: 'booking-scope', status: 'not_checked', message: '執行時校驗' },
  ],
  permissionSources: [{ menuKey: 'meeting-my', actions: ['edit', 'ai_minutes'], sources: ['角色:項目經理'] }],
}

function renderPanel(onOpenAuthorization?: () => void) {
  return render(<BusinessAiScenePanel onOpenAuthorization={onOpenAuthorization} />)
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('zh-TW')
  hasPermission.mockReturnValue(true)
  vi.mocked(fetchMeetingAiSceneConfig).mockResolvedValue(baseConfig)
  vi.mocked(fetchMeetingAiDiagnoseEmployees).mockResolvedValue({ records: [{ id: 7, name: '張三', empId: 'MF00007' }], total: 1 })
  vi.mocked(diagnoseMeetingAi).mockResolvedValue(baseDiagnosis)
  vi.mocked(saveMeetingAiSceneConfig).mockResolvedValue({ ...baseConfig, enabled: true, version: 4 })
})

describe('会议 AI 场景管理面板', () => {
  it('加载真实配置并展示启用状态、版本与修改信息', async () => {
    renderPanel()
    expect(await screen.findByText('會議 AI 整理紀要')).toBeInTheDocument()
    await waitFor(() => expect(fetchMeetingAiSceneConfig).toHaveBeenCalledTimes(1))
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(within(screen.getByLabelText('服務端配置資訊')).getByText('已停用')).toBeInTheDocument()
  })

  it('无管理权限时开关禁用，不触发保存', async () => {
    hasPermission.mockImplementation((p: string) => p !== 'ai-operation-auth:meeting_ai_manage')
    renderPanel()
    const toggle = await screen.findByRole('switch', { name: '會議 AI 場景開關' })
    expect(toggle).toBeDisabled()
    expect(saveMeetingAiSceneConfig).not.toHaveBeenCalled()
  })

  it('缺少原因时不弹确认、不保存；确认后按 expectedVersion 保存', async () => {
    renderPanel()
    const toggle = await screen.findByRole('switch', { name: '會議 AI 場景開關' })
    fireEvent.click(toggle)
    expect(await screen.findByText('請填寫變更原因')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('變更原因'), { target: { value: '安排試點' } })
    fireEvent.click(toggle)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.closest('.ant-modal')).toHaveClass('custom-confirm-modal')
    fireEvent.click(within(dialog).getByRole('button', { name: '確 認' }))
    await waitFor(() => expect(saveMeetingAiSceneConfig).toHaveBeenCalledWith({ enabled: true, expectedVersion: 3, reason: '安排試點' }))
  })

  it('保存遇到版本冲突(409)时重新拉取配置，不覆盖他人', async () => {
    vi.mocked(saveMeetingAiSceneConfig).mockRejectedValueOnce(new Error('場景配置已被他人修改，請刷新後重試'))
    renderPanel()
    await screen.findByRole('switch', { name: '會議 AI 場景開關' })
    fireEvent.change(screen.getByLabelText('變更原因'), { target: { value: '再試' } })
    fireEvent.click(screen.getByRole('switch', { name: '會議 AI 場景開關' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '確 認' }))
    await waitFor(() => expect(fetchMeetingAiSceneConfig).toHaveBeenCalledTimes(2))
  })

  it('环境上限关闭时给出警示并禁用开关', async () => {
    vi.mocked(fetchMeetingAiSceneConfig).mockResolvedValue({ ...baseConfig, environmentAllowed: false, environmentReasonCode: 'feature_off' })
    renderPanel()
    expect(await screen.findByText('後端環境已停用此場景')).toBeInTheDocument()
    expect(await screen.findByRole('switch', { name: '會議 AI 場景開關' })).toBeDisabled()
  })

  it('诊断渲染检查项、状态与处理入口，并展示权限来源', async () => {
    renderPanel()
    const combobox = await screen.findByRole('combobox')
    fireEvent.mouseDown(combobox)
    fireEvent.change(combobox, { target: { value: '張三' } })
    await waitFor(() => expect(fetchMeetingAiDiagnoseEmployees).toHaveBeenCalled())
    fireEvent.click(await screen.findByText('MF00007'))
    fireEvent.click(screen.getByRole('button', { name: /開始診斷/ }))
    await waitFor(() => expect(diagnoseMeetingAi).toHaveBeenCalledWith(7))
    expect(await screen.findByText('張三（MF00007）：AI 使用額度不足')).toBeInTheDocument()
    expect(screen.getByText('額度與預算')).toBeInTheDocument()
    expect(screen.getByText('功能權限')).toBeInTheDocument()
    expect(screen.getAllByText('通過')).toHaveLength(3)
    expect(screen.getByText('阻斷')).toBeInTheDocument()
    expect(screen.getByText('執行時')).toBeInTheDocument()
    expect(screen.getByText(/meeting-my\[edit,ai_minutes\]←角色:項目經理/)).toBeInTheDocument()
    // 处理入口按白名单映射为「前往」，不返回任意 URL
    expect(screen.getByRole('button', { name: '前往' })).toBeInTheDocument()
  })

  it('无诊断权限时员工选择与诊断按钮禁用', async () => {
    hasPermission.mockImplementation((p: string) => p !== 'ai-operation-auth:meeting_ai_diagnose')
    renderPanel()
    expect(await screen.findByText('需要「診斷會議AI可用性」權限。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /開始診斷/ })).toBeDisabled()
    expect(diagnoseMeetingAi).not.toHaveBeenCalled()
  })
})

describe('AI 操作授权页签接入', () => {
  function renderPage(path: string) {
    return render(<MemoryRouter initialEntries={[path]}><AiOperationAuth /></MemoryRouter>)
  }

  it('带 tab=scenes 直达场景页签并加载配置', async () => {
    renderPage('/ai-operation-auth?tab=scenes')
    expect(screen.getByRole('tab', { name: '業務 AI 場景' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(fetchMeetingAiSceneConfig).toHaveBeenCalled())
    expect(await screen.findByText('會議 AI 整理紀要')).toBeInTheDocument()
  })

  it('默认仍落在工具授权页', async () => {
    renderPage('/ai-operation-auth')
    expect(screen.getByRole('tab', { name: i18n.t('aiOperationAuth.toolAuthTab') })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('會議 AI 整理紀要')).not.toBeInTheDocument()
  })
})
