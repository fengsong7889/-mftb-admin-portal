import { createContext, useContext, useState, useCallback } from 'react'
import type { Role, MenuPermission } from '../pages/Permission/types'
import { STORAGE_KEYS } from '../pages/Permission/types'
import { login as loginApi, logout as logoutApi, TOKEN_KEY } from '../api'

export interface UserInfo {
  username: string
  name: string
  empId: string
  avatar: string
  role: 'admin' | 'guest' // 用户角色
  department?: string // 所在部门
  position?: string // 职位
  functionRoles?: string[] // 绑定的功能角色ID数组
  dataPermissions?: {
    locations?: string[] // 有权限的地点
    merchants?: string[] // 有权限的商家
  }
}

interface AuthContextType {
  isAuthenticated: boolean
  user: UserInfo | null
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  updateAvatar: (avatar: string) => void
  hasPermission: (permission: string) => boolean // 权限检查方法
  hasDataPermission: (type: 'location' | 'merchant', key: string) => boolean // 数据权限检查方法
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 从 localStorage 初始化登录状态
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('is_authenticated')
    return saved === 'true'
  })
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('user_info')
    return saved ? JSON.parse(saved) : null
  })

  const login = useCallback(async (username: string, password: string) => {
    try {
      const result = await loginApi({ username, password })
      // 将后端返回的用户信息映射为前端 UserInfo
      const backendUser = result.userInfo
      const mappedUser: UserInfo = {
        username: backendUser.username,
        name: backendUser.name,
        empId: backendUser.empId,
        avatar: backendUser.avatar || 'pikachu-default',
        role: backendUser.role === 'admin' ? 'admin' : 'guest',
        department: backendUser.department,
        position: backendUser.position,
      }
      setIsAuthenticated(true)
      setUser(mappedUser)
      // 保存 Token 与登录状态
      localStorage.setItem(TOKEN_KEY, result.token)
      localStorage.setItem('is_authenticated', 'true')
      localStorage.setItem('user_info', JSON.stringify(mappedUser))
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登錄失敗'
      return { success: false, message: msg }
    }
  }, [])

  const logout = useCallback(() => {
    // 通知后端登出(失败不阻断本地清理)
    logoutApi().catch(() => {})
    setIsAuthenticated(false)
    setUser(null)
    // 清除本地登录信息
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('is_authenticated')
    localStorage.removeItem('user_info')
  }, [])

  const updateAvatar = useCallback((avatar: string) => {
    setUser((prev) => {
      if (!prev) return null
      const updated = { ...prev, avatar }
      // 更新 localStorage
      localStorage.setItem('user_info', JSON.stringify(updated))
      return updated
    })
  }, [])

  /** 获取角色权限 */
  const getRolePermissions = useCallback((roleId: string): MenuPermission[] => {
    const rolesStr = localStorage.getItem(STORAGE_KEYS.ROLES)
    if (!rolesStr) return []
    
    const roles: Role[] = JSON.parse(rolesStr)
    const role = roles.find(r => r.id === roleId)
    return role ? role.permissions : []
  }, [])

  /** 权限检查方法 */
  const hasPermission = useCallback((permission: string) => {
    if (!user) return false
    // admin 拥有所有权限
    if (user.role === 'admin') return true
    
    // 检查用户绑定的角色是否包含该权限
    if (user.functionRoles && user.functionRoles.length > 0) {
      const allActions = user.functionRoles
        .map(roleId => getRolePermissions(roleId))
        .flat()
        .flatMap(p => p.actions)
      return allActions.includes(permission)
    }
    
    // guest 只有查看权限，没有编辑权限
    if (user.role === 'guest') {
      return permission !== 'edit' && permission !== 'delete' && permission !== 'create'
    }
    return false
  }, [user, getRolePermissions])

  /** 数据权限检查方法 */
  const hasDataPermission = useCallback((type: 'location' | 'merchant', key: string) => {
    if (!user) return false
    // admin 拥有所有数据权限
    if (user.role === 'admin') return true
    
    if (type === 'location') {
      return user.dataPermissions?.locations?.includes(key) ?? true // 默认有所有地点权限
    }
    if (type === 'merchant') {
      return user.dataPermissions?.merchants?.includes(key) ?? true // 默认有所有商家权限
    }
    
    return false
  }, [user])

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, updateAvatar, hasPermission, hasDataPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
