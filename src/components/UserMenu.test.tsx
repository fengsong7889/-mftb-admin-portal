import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import UserMenu from './UserMenu'

const auth = vi.hoisted(() => ({
  state: {
    user: { username: 'MF00001', empId: 'MF00001', name: '管理員', avatar: 'pikachu-default', role: 'admin' as const },
    logout: vi.fn(),
    updateAvatar: vi.fn(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth.state }))
vi.mock('../api/iconfont', () => ({
  fetchIconFontAvatars: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  saveUserAvatarUrl: vi.fn().mockResolvedValue(undefined),
  getUserSavedAvatarUrl: vi.fn().mockResolvedValue(null),
}))

/**
 * 右上角用户菜单的改密弹窗交互测试。
 * <p>重点是 ESC 不得关闭改密窗口：填到一半误触就会丢失已输入内容，退出只能走「取消」。
 * <p>遮罩点击关闭（maskClosable={false}）在 jsdom 下无法复现——rc-dialog 依赖真实
 * mousedown 坐标与 transitionend，负向验证（去掉 prop 用例仍通过）证明它测不出回归，
 * 故不写成假绿用例，改由浏览器实测覆盖；强制改密门禁的不可关闭见 ForcePasswordChangeGate 用例。
 */
function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

const pwdForm = () => document.querySelector('.pwd-form')!

/**
 * 弹窗开关状态判定。
 * jsdom 不触发 transitionend，antd 的 zoom 动画会停在 appear/leave 阶段，
 * wrap 上永远等不到 display:none；实测唯一可靠的信号是 .ant-modal 上的 motion class：
 * 打开时含 ant-zoom-appear，关闭过程中含 ant-zoom-leave。
 */
const modalOpen = () => {
  const modal = document.querySelector('.ant-modal')
  return !!modal && !!pwdForm() && !modal.className.includes('ant-zoom-leave')
}

async function openPasswordModal() {
  fireEvent.click(document.querySelector('.header-user-info')!)
  const item = [...document.querySelectorAll('.ant-dropdown li')].find(
    (li) => li.textContent?.includes(i18n.t('header.changePassword')),
  )
  expect(item).toBeTruthy()
  fireEvent.click(item!)
  await waitFor(() => expect(pwdForm()).toBeTruthy())
  expect(modalOpen()).toBe(true)
}

beforeEach(async () => {
  auth.state.logout = vi.fn().mockResolvedValue(undefined)
  await i18n.changeLanguage('zh-TW')
})

afterEach(() => {
  cleanup()
  // antd Modal 渲染在 document.body 的门户节点上，RTL 的 cleanup 不保证清空残留 wrap，
  // 残留会让 modalOpen() 命中上一个用例的弹窗，用例之间必须物理隔离
  document.body.innerHTML = ''
})

describe('UserMenu 修改密码弹窗', () => {
  it('ESC 不关闭改密窗口', async () => {
    mount()
    await openPasswordModal()

    // 事件从 .ant-modal 冒泡到 rc-dialog 绑定 keydown 的 wrap，覆盖真实按键路径
    fireEvent.keyDown(document.querySelector('.ant-modal')!, { key: 'Escape', keyCode: 27, which: 27 })

    expect(modalOpen()).toBe(true)
  })

  it('「取消」仍可正常关闭', async () => {
    mount()
    await openPasswordModal()

    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }))

    await waitFor(() => expect(modalOpen()).toBe(false))
  })
})
