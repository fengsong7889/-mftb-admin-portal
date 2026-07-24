import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import * as api from '../api'

// Mock API 层, 避免测试依赖真实后端
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  }
})

const mockedLogin = vi.mocked(api.login)

/** 构造后端登录成功响应 */
function mockLoginSuccess(role: 'admin' | 'guest') {
  mockedLogin.mockResolvedValueOnce({
    token: 'mock-jwt-token',
    userInfo: {
      id: role === 'admin' ? 1 : 2,
      username: role,
      name: role === 'admin' ? 'Bee' : '訪客',
      empId: role === 'admin' ? 'SF0001' : 'G0001',
      avatar: 'pikachu-default',
      role,
      department: role === 'admin' ? '集团总裁办' : undefined,
      position: role === 'admin' ? '高级副总裁' : undefined,
    },
  })
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('admin 账号登录成功', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('admin', '111222')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.username).toBe('admin')
    expect(result.current.user?.role).toBe('admin')
  })

  it('guest 账号登录成功', async () => {
    mockLoginSuccess('guest')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('guest', '123456')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.role).toBe('guest')
  })

  it('错误密码登录失败', async () => {
    mockedLogin.mockRejectedValueOnce(new Error('账号或密码错误'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('admin', 'wrong')
      expect(res.success).toBe(false)
      expect(res.message).toBe('账号或密码错误')
    })

    expect(result.current.isAuthenticated).toBe(false)
  })

  it('admin 拥有所有权限', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('admin', '111222')
    })

    expect(result.current.hasPermission('edit')).toBe(true)
    expect(result.current.hasPermission('delete')).toBe(true)
    expect(result.current.hasPermission('create')).toBe(true)
  })

  it('guest 无编辑权限', async () => {
    mockLoginSuccess('guest')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('guest', '123456')
    })

    expect(result.current.hasPermission('view')).toBe(true)
    expect(result.current.hasPermission('edit')).toBe(false)
    expect(result.current.hasPermission('delete')).toBe(false)
  })

  it('logout 清除登录状态', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('admin', '111222')
    })
    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })
})
