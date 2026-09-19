import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { message, Modal } from 'antd'
import EnterpriseAppConfig from './EnterpriseAppConfig'
import NotificationConfig from './index'
import { fetchAppConfig, fetchChannels, saveAppConfig, testAppConnection, fetchNotificationApps,
  fetchNotificationScenarios, toggleNotificationApp, saveNotificationScenario } from '../../api/notificationChannel'
import type { AppNotificationConfig, NotificationScenario } from '../../api/notificationChannel'
import NotificationScenarioForm from './NotificationScenarioForm'

const permission = vi.hoisted(() => ({ edit: true }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => permission.edit }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../api/notificationChannel', () => ({
  fetchAppConfig: vi.fn(), saveAppConfig: vi.fn(), testAppConnection: vi.fn(),
  fetchChannels: vi.fn(), toggleChannel: vi.fn(), deleteChannel: vi.fn(), testChannel: vi.fn(),
  fetchNotificationApps: vi.fn(), fetchNotificationScenarios: vi.fn(), toggleNotificationApp: vi.fn(),
  deleteNotificationApp: vi.fn(), saveNotificationScenario: vi.fn(),
}))

const config: AppNotificationConfig = {
  id: 1, name: '共享通知应用', platform: 'dingtalk', enabled: true, remark: '', updatedBy: '管理员', updatedAt: '', scenarios: ['领用待签署'],
  appKey: 'ding_test', agentId: '123456', baseUrl: 'https://admin.example.com/portal',
  appSecretConfigured: true, tokenSecretConfigured: true,
}
const scenario: NotificationScenario = {
  key: 'asset_claim_sign', name: '领用待签署', triggerDescription: '领用登记', recipientRule: '领用人',
  appId: 1, appName: config.name, enabled: true, appEnabled: true, updatedBy: '', updatedAt: '',
}
function renderForm(path = '/notification-app-form?id=1') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/notification-app-form" element={<EnterpriseAppConfig />} />
    <Route path="/notification-scenario-form" element={<NotificationScenarioForm />} />
    <Route path="/notification-config" element={<div data-testid="list-return">列表</div>} />
  </Routes></MemoryRouter>)
}
async function openForm() {
  renderForm()
  await waitFor(() => expect(screen.getByLabelText('AppKey')).toHaveValue(config.appKey))
}

const originalConfirm = Modal.confirm

afterEach(async () => {
  act(() => { Modal.destroyAll(); message.destroy() })
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Modal, 'confirm').mockImplementation(options => originalConfirm({ ...options, transitionName: '', maskTransitionName: '' }))
  act(() => message.destroy())
  permission.edit = true
  vi.mocked(fetchAppConfig).mockResolvedValue({ ...config })
  vi.mocked(saveAppConfig).mockResolvedValue(undefined)
  vi.mocked(testAppConnection).mockResolvedValue(undefined)
  vi.mocked(fetchChannels).mockResolvedValue([])
  vi.mocked(fetchNotificationApps).mockResolvedValue([{ ...config }])
  vi.mocked(fetchNotificationScenarios).mockResolvedValue([{ ...scenario }])
  vi.mocked(toggleNotificationApp).mockResolvedValue(undefined)
  vi.mocked(saveNotificationScenario).mockResolvedValue(undefined)
})

describe('企业内部应用配置', () => {
  it('默认保留机器人列表，应用页签显示列表而不是参数表单', async () => {
    render(<MemoryRouter><NotificationConfig /></MemoryRouter>)
    // Tabs 首次渲染 + RobotChannels 异步加载可能跨多个 act 周期
    expect(await screen.findByText('新增渠道')).toBeInTheDocument()
    expect(fetchAppConfig).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'notificationApp.appTab' }))
    expect(await screen.findByText(config.name)).toBeInTheDocument()
    expect(screen.queryByLabelText('AppKey')).not.toBeInTheDocument()
    expect(fetchAppConfig).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'notificationApp.delete' })).toBeDisabled()
  }, 30000)

  it('不回填密钥，留空保存不提交任何密钥字段', async () => {
    await openForm()
    expect(screen.getByLabelText('AppSecret')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalledExactlyOnceWith({
      name: config.name, remark: '', appKey: config.appKey, agentId: config.agentId, baseUrl: config.baseUrl,
    }, 1))
    expect(await screen.findByTestId('list-return')).toBeInTheDocument()
  })

  it('修改后禁用测试；取消需确认放弃修改并返回列表', async () => {
    await openForm()
    const test = screen.getByRole('button', { name: /notificationApp.test$/ })
    expect(test).toBeEnabled()
    fireEvent.change(screen.getByLabelText('AgentId'), { target: { value: '999' } })
    expect(test).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'notificationApp.cancel' }))
    await screen.findByRole('dialog', { name: 'notificationApp.discard' })
    fireEvent.click(screen.getByRole('button', { name: 'notificationApp.confirm' }))
    expect(await screen.findByTestId('list-return')).toBeInTheDocument()
    expect(saveAppConfig).not.toHaveBeenCalled()
  })

  it('更换 AppKey 时拒绝空密钥和非法站点地址', async () => {
    await openForm()
    fireEvent.change(screen.getByLabelText('AppKey'), { target: { value: 'ding_other' } })
    fireEvent.change(screen.getByLabelText('notificationApp.baseUrl'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    // 两个字段的异步校验独立完成，不能在第一个错误出现时同步断言第二个。
    await waitFor(() => {
      expect(screen.getByText('notificationApp.secretRequired')).toBeInTheDocument()
      expect(screen.getByText('notificationApp.baseUrlInvalid')).toBeInTheDocument()
    }, { timeout: 5000 })
    expect(saveAppConfig).not.toHaveBeenCalled()
  })

  it('只读权限隐藏写入与测试按钮', async () => {
    permission.edit = false
    await openForm()
    expect(screen.getByLabelText('AppKey')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /notificationApp.save$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /notificationApp.test$/ })).not.toBeInTheDocument()
  })

  it('加载失败禁止保存，支持重试', async () => {
    vi.mocked(fetchAppConfig).mockRejectedValueOnce(new Error('test failure'))
    renderForm()
    await screen.findByText('notificationApp.loadFailed')
    expect(screen.queryByRole('button', { name: /notificationApp.save$/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'notificationApp.retry' }))
    await waitFor(() => expect(screen.getByLabelText('AppKey')).toHaveValue(config.appKey))
  })

  it('首次配置保存新密钥后清空输入，重复点击只提交一次', async () => {
    vi.mocked(fetchAppConfig).mockResolvedValueOnce({ ...config, appSecretConfigured: false, tokenSecretConfigured: false })
    await openForm()
    let finishSave: () => void = () => {}
    vi.mocked(saveAppConfig).mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve }))
    fireEvent.change(screen.getByLabelText('AppSecret'), { target: { value: 'fake-test-secret' } })
    const save = screen.getByRole('button', { name: /notificationApp.save$/ })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalledExactlyOnceWith({
      name: config.name, remark: '', appKey: config.appKey, agentId: config.agentId, baseUrl: config.baseUrl, appSecret: 'fake-test-secret',
    }, 1))
    await act(async () => finishSave())
    expect(await screen.findByTestId('list-return')).toBeInTheDocument()
  })

  it('新增应用使用独立表单且无旧应用读取或测试操作', async () => {
    renderForm('/notification-app-form')
    fireEvent.change(await screen.findByLabelText('notificationApp.name'), { target: { value: '新应用' } })
    fireEvent.change(screen.getByLabelText('AppKey'), { target: { value: 'ding_new' } })
    fireEvent.change(screen.getByLabelText('AgentId'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('AppSecret'), { target: { value: 'new-test-secret' } })
    fireEvent.change(screen.getByLabelText('notificationApp.baseUrl'), { target: { value: 'https://example.com' } })
    expect(screen.queryByRole('button', { name: /notificationApp.test$/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalledWith({ name: '新应用', remark: '', appKey: 'ding_new', agentId: '123',
      appSecret: 'new-test-secret', baseUrl: 'https://example.com' }, undefined))
    expect(fetchAppConfig).not.toHaveBeenCalled()
  })

  it('应用启停先确认，取消不会更新配置', async () => {
    render(<MemoryRouter initialEntries={['/notification-config?tab=app']}><NotificationConfig /></MemoryRouter>)
    await screen.findByText(config.name)
    fireEvent.click(screen.getByRole('switch'))
    expect(toggleNotificationApp).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'notificationApp.cancel' }))
    expect(toggleNotificationApp).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('確定要停用該配置嗎？')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(await screen.findByRole('button', { name: 'notificationApp.confirm' }))
    await waitFor(() => expect(toggleNotificationApp).toHaveBeenCalledWith(1, false))
  })

  it('应用停用时场景列表明确显示不发送，并禁止启用未绑定规则', async () => {
    vi.mocked(fetchNotificationScenarios).mockResolvedValueOnce([{ ...scenario, appEnabled: false }])
    render(<MemoryRouter initialEntries={['/notification-config?tab=scenarios']}><NotificationConfig /></MemoryRouter>)
    expect(await screen.findByText('notificationApp.appDisabled')).toBeInTheDocument()
    expect(screen.queryByText('notificationApp.active')).not.toBeInTheDocument()
  })

  it('场景编辑先校验再确认，只保存路由规则而不复制凭据', async () => {
    renderForm('/notification-scenario-form?key=asset_claim_sign')
    await waitFor(() => expect(screen.getByDisplayValue(scenario.name)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    await screen.findByRole('dialog', { name: 'notificationApp.saveScenarioConfirm' })
    expect(saveNotificationScenario).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'notificationApp.confirm' }))
    await waitFor(() => expect(saveNotificationScenario).toHaveBeenCalledExactlyOnceWith('asset_claim_sign', { appId: 1, enabled: true }))
    expect(saveAppConfig).not.toHaveBeenCalled()
  })

  it('不允许启用未绑定应用的场景', async () => {
    vi.mocked(fetchNotificationScenarios).mockResolvedValueOnce([{ ...scenario, appId: null, appName: null, enabled: false, appEnabled: false }])
    renderForm('/notification-scenario-form?key=asset_claim_sign')
    await waitFor(() => expect(screen.getByDisplayValue(scenario.name)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    expect(await screen.findByText('notificationApp.selectEnabledApp')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'notificationApp.saveScenarioConfirm' })).not.toBeInTheDocument()
    expect(saveNotificationScenario).not.toHaveBeenCalled()
  })

  it('测试失败不会误报成功或重复弹错', async () => {
    vi.mocked(testAppConnection).mockRejectedValueOnce(new Error('test failure'))
    const success = vi.spyOn(message, 'success')
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.test$/ }))
    await waitFor(() => expect(testAppConnection).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('button', { name: /notificationApp.test$/ })).toBeEnabled())
    expect(success).not.toHaveBeenCalled()
    success.mockRestore()
  })
})
