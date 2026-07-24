import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('admin 账号登录成功', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      const res = result.current.login('admin', '111222')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.username).toBe('admin')
    expect(result.current.user?.role).toBe('admin')
  })

  it('guest 账号登录成功', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      const res = result.current.login('guest', '123456')
      expect(res.success).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.role).toBe('guest')
  })

  it('错误密码登录失败', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      const res = result.current.login('admin', 'wrong')
      expect(res.success).toBe(false)
      expect(res.message).toBe('密碼錯誤，請重新輸入')
    })

    expect(result.current.isAuthenticated).toBe(false)
  })

  it('admin 拥有所有权限', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.login('admin', '111222')
    })

    expect(result.current.hasPermission('edit')).toBe(true)
    expect(result.current.hasPermission('delete')).toBe(true)
    expect(result.current.hasPermission('create')).toBe(true)
  })

  it('guest 无编辑权限', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.login('guest', '123456')
    })

    expect(result.current.hasPermission('view')).toBe(true)
    expect(result.current.hasPermission('edit')).toBe(false)
    expect(result.current.hasPermission('delete')).toBe(false)
  })

  it('logout 清除登录状态', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.login('admin', '111222')
    })
    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })
})
