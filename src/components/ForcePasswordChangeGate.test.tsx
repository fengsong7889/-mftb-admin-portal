import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { PASSWORD_CHANGE_REQUIRED_EVENT } from '../api'
import ForcePasswordChangeGate from './ForcePasswordChangeGate'

const auth = vi.hoisted(() => ({
  state: { isAuthenticated: true, user: {} as Record<string, unknown>, logout: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => auth.state,
}))

/**
 * 首次登录强制改密门禁测试。
 * <p>核心不是「能不能弹出来」，而是「弹出来就关不掉」：
 * 只要存在跳过路径，初始密码就能被继续用于访问业务数据，后端 fail-closed 拦截也失去意义。
 */
function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ForcePasswordChangeGate />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(async () => {
  auth.state.logout = vi.fn().mockResolvedValue(undefined)
  await i18n.changeLanguage('zh-TW')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ForcePasswordChangeGate', () => {
  it('初始密码账号：弹出强制改密窗口，且没有关闭按钮', async () => {
    auth.state.user = { username: 'MF00031', empId: 'MF00031', name: '測試', mustChangePassword: true }
    mount()

    expect(await screen.findByText(i18n.t('header.forceChangeTitle'))).toBeInTheDocument()
    // antd Modal 渲染在 body 门户上，需从 document 查
    expect(document.querySelector('.ant-modal-close')).toBeNull()
    // 唯一退路是退出登录；提交按钮在满足策略前保持禁用
    expect(screen.getByText(i18n.t('header.forceChangeLogout'))).toBeInTheDocument()
    expect((screen.getByRole('button', { name: i18n.t('header.pwdSubmit') }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ESC 与点击遮罩都不能关闭（不可跳过）', async () => {
    auth.state.user = { username: 'MF00031', empId: 'MF00031', name: '測試', mustChangePassword: true }
    mount()
    await screen.findByText(i18n.t('header.forceChangeTitle'))

    fireEvent.keyDown(document.querySelector('.ant-modal-wrap')!, { key: 'Escape', keyCode: 27, which: 27 })
    const mask = document.querySelector('.ant-modal-mask')!
    fireEvent.mouseDown(mask)
    fireEvent.mouseUp(mask)
    fireEvent.click(mask)

    expect(screen.getByText(i18n.t('header.forceChangeTitle'))).toBeInTheDocument()
  })

  it('已完成改密的账号不被拦截', async () => {
    auth.state.user = { username: 'MF00001', empId: 'MF00001', name: '管理員', mustChangePassword: false }
    mount()
    await waitFor(() => expect(document.body).toBeInTheDocument())
    expect(screen.queryByText(i18n.t('header.forceChangeTitle'))).not.toBeInTheDocument()
  })

  it('未登录不渲染门禁', () => {
    auth.state.isAuthenticated = false
    auth.state.user = { mustChangePassword: true }
    mount()
    expect(screen.queryByText(i18n.t('header.forceChangeTitle'))).not.toBeInTheDocument()
    auth.state.isAuthenticated = true
  })

  it('登录态未带标记时，后端 reason 事件仍能拉起门禁（覆盖刷新恢复与后端补标记）', async () => {
    auth.state.user = { username: 'MF00031', empId: 'MF00031', name: '測試' }
    mount()
    expect(screen.queryByText(i18n.t('header.forceChangeTitle'))).not.toBeInTheDocument()

    act(() => { window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT)) })

    expect(await screen.findByText(i18n.t('header.forceChangeTitle'))).toBeInTheDocument()
  })
})
