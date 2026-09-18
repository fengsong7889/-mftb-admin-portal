import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { message } from 'antd'
import EnterpriseAppConfig from './EnterpriseAppConfig'
import NotificationConfig from './index'
import { fetchAppConfig, fetchChannels, saveAppConfig, testAppConnection } from '../../api/notificationChannel'

const permission = vi.hoisted(() => ({ edit: true }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => permission.edit }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../api/notificationChannel', () => ({
  fetchAppConfig: vi.fn(), saveAppConfig: vi.fn(), testAppConnection: vi.fn(),
  fetchChannels: vi.fn(), toggleChannel: vi.fn(), deleteChannel: vi.fn(), testChannel: vi.fn(),
}))

const config = {
  appKey: 'ding_test', agentId: '123456', baseUrl: 'https://admin.example.com/portal',
  appSecretConfigured: true, tokenSecretConfigured: true,
}

async function openForm() {
  render(<EnterpriseAppConfig />)
  await waitFor(() => expect(screen.getByLabelText('AppKey')).toHaveValue(config.appKey))
}

beforeEach(() => {
  vi.clearAllMocks()
  act(() => message.destroy())
  permission.edit = true
  vi.mocked(fetchAppConfig).mockResolvedValue({ ...config })
  vi.mocked(saveAppConfig).mockResolvedValue(undefined)
  vi.mocked(testAppConnection).mockResolvedValue(undefined)
  vi.mocked(fetchChannels).mockResolvedValue([])
})

describe('企业内部应用配置', () => {
  it('默认保留机器人列表，仅切换到应用页签后读取配置', async () => {
    render(<MemoryRouter><NotificationConfig /></MemoryRouter>)
    // Tabs 首次渲染 + RobotChannels 异步加载可能跨多个 act 周期
    expect(await screen.findByText('新增渠道')).toBeInTheDocument()
    expect(fetchAppConfig).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'notificationApp.appTab' }))
    await waitFor(() => expect(screen.getByLabelText('AppKey')).toHaveValue(config.appKey), { timeout: 10000 })
  }, 30000)

  it('不回填密钥，留空保存不提交任何密钥字段', async () => {
    await openForm()
    expect(screen.getByLabelText('AppSecret')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /notificationApp.save$/ }))
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalledExactlyOnceWith({
      appKey: config.appKey, agentId: config.agentId, baseUrl: config.baseUrl,
    }))
    await waitFor(() => expect(fetchAppConfig).toHaveBeenCalledTimes(2))
  })

  it('修改后禁用测试；取消恢复已保存值且不发请求', async () => {
    await openForm()
    const test = screen.getByRole('button', { name: /notificationApp.test$/ })
    expect(test).toBeEnabled()
    fireEvent.change(screen.getByLabelText('AgentId'), { target: { value: '999' } })
    expect(test).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'notificationApp.cancel' }))
    expect(screen.getByLabelText('AgentId')).toHaveValue(config.agentId)
    expect(test).toBeEnabled()
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
    render(<EnterpriseAppConfig />)
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
      appKey: config.appKey, agentId: config.agentId, baseUrl: config.baseUrl, appSecret: 'fake-test-secret',
    }))
    await act(async () => finishSave())
    await waitFor(() => expect(screen.getByLabelText('AppSecret')).toHaveValue(''))
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
