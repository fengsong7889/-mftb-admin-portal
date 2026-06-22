import { createContext, useContext, useState, useCallback } from 'react'

export interface UserInfo {
  username: string
  name: string
  empId: string
  avatar: string
  role: 'admin' | 'guest' // 用户角色
}

interface AuthContextType {
  isAuthenticated: boolean
  user: UserInfo | null
  login: (username: string, password: string) => { success: boolean; message?: string }
  logout: () => void
  updateAvatar: (avatar: string) => void
  hasPermission: (permission: string) => boolean // 权限检查方法
}

const AuthContext = createContext<AuthContextType | null>(null)

const DEFAULT_ADMIN_USER: UserInfo = {
  username: 'admin',
  name: '小蜜蜂',
  empId: 'A0001',
  avatar: 'pikachu-default', // 默认小蜜蜂头像
  role: 'admin',
}

const DEFAULT_GUEST_USER: UserInfo = {
  username: 'guest',
  name: '訪客',
  empId: 'G0001',
  avatar: 'pikachu-default', // 默认小蜜蜂头像
  role: 'guest',
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)

  const login = useCallback((username: string, password: string) => {
    // admin 账号登录
    if (username === 'admin' && password === '111222') {
      setIsAuthenticated(true)
      setUser({ ...DEFAULT_ADMIN_USER })
      return { success: true }
    }
    // guest 账号登录
    if (username === 'guest' && password === '123456') {
      setIsAuthenticated(true)
      setUser({ ...DEFAULT_GUEST_USER })
      return { success: true }
    }
    if (username !== 'admin' && username !== 'guest') {
      return { success: false, message: '賬號不存在' }
    }
    return { success: false, message: '密碼錯誤，請重新輸入' }
  }, [])

  const logout = useCallback(() => {
    setIsAuthenticated(false)
    setUser(null)
  }, [])

  const updateAvatar = useCallback((avatar: string) => {
    setUser((prev) => prev ? { ...prev, avatar } : null)
  }, [])

  /** 权限检查方法 */
  const hasPermission = useCallback((permission: string) => {
    if (!user) return false
    // admin 拥有所有权限
    if (user.role === 'admin') return true
    // guest 只有查看权限，没有编辑权限
    if (user.role === 'guest') {
      return permission !== 'edit' && permission !== 'delete' && permission !== 'create'
    }
    return false
  }, [user])

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, updateAvatar, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
