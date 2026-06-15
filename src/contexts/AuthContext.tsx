import { createContext, useContext, useState, useCallback } from 'react'

export interface UserInfo {
  username: string
  name: string
  empId: string
  avatar: string
}

interface AuthContextType {
  isAuthenticated: boolean
  user: UserInfo | null
  login: (username: string, password: string) => { success: boolean; message?: string }
  logout: () => void
  updateAvatar: (avatar: string) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const DEFAULT_USER: UserInfo = {
  username: 'admin',
  name: '小蜜蜂',
  empId: 'A0001',
  avatar: 'pikachu-default', // 默认小蜜蜂头像
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)

  const login = useCallback((username: string, password: string) => {
    if (username === 'admin' && password === '111222') {
      setIsAuthenticated(true)
      setUser({ ...DEFAULT_USER })
      return { success: true }
    }
    if (username !== 'admin') {
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
