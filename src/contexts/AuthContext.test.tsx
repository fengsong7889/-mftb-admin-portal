import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AxiosError } from 'axios'
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

/** 构造后端登录成功响应 (登录账号统一为工号) */
function mockLoginSuccess(role: 'admin' | 'guest') {
  mockedLogin.mockResolvedValueOnce({
    token: 'mock-jwt-token',
    userInfo: {
      id: role === 'admin' ? 1 : 2,
      username: role === 'admin' ? 'MF00001' : 'MF00002',
      name: role === 'admin' ? 'Bee' : '訪客',
      empId: role === 'admin' ? 'MF00001' : 'MF00002',
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

  it('admin 工号登录成功', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('MF00001', '111222')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.username).toBe('MF00001')
    expect(result.current.user?.role).toBe('admin')
  })

  it('guest 角色工号登录成功', async () => {
    mockLoginSuccess('guest')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('MF00002', '123456')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.role).toBe('guest')
  })

  it('错误密码登录失败（后端业务错误如实提示，不降级 Mock）', async () => {
    mockedLogin.mockRejectedValueOnce(new Error('账号或密码错误'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('MF00001', 'wrong')
      expect(res.success).toBe(false)
      // 后端返回的业务错误必须如实展示，禁止走 Mock 通道假登录成功
      expect(res.message).toBe('账号或密码错误')
    })

    expect(result.current.isAuthenticated).toBe(false)
  })

  it('后端不可用时降级 Mock 登录', async () => {
    // 无响应的网络错误视为后端不可用
    mockedLogin.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('MF00001', '111222')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(window.localStorage.getItem('mftb_token')).toBe('mock-token')
  })

  it('后端不可用且 Mock 密码错误时返回繁体中文提示', async () => {
    mockedLogin.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      const res = await result.current.login('MF00001', 'wrong')
      expect(res.success).toBe(false)
      expect(res.message).toContain('工號或密碼錯誤')
    })

    expect(result.current.isAuthenticated).toBe(false)
  })

  it('admin 拥有所有权限', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('MF00001', '111222')
    })

    expect(result.current.hasPermission('edit')).toBe(true)
    expect(result.current.hasPermission('delete')).toBe(true)
    expect(result.current.hasPermission('create')).toBe(true)
  })

  it('guest 无编辑权限', async () => {
    mockLoginSuccess('guest')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('MF00002', '123456')
    })

    expect(result.current.hasPermission('view')).toBe(true)
    expect(result.current.hasPermission('edit')).toBe(false)
    expect(result.current.hasPermission('delete')).toBe(false)
  })

  it('logout 清除登录状态', async () => {
    mockLoginSuccess('admin')
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('MF00001', '111222')
    })
    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })
})
