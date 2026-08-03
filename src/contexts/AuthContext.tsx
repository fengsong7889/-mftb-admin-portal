import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { Role, MenuPermission } from '../pages/Permission/types'
import { STORAGE_KEYS, CONTROLLED_MENU_KEYS } from '../pages/Permission/types'
import { login as loginApi, logout as logoutApi, getUserInfo, TOKEN_KEY, AUTH_UNAUTHORIZED_EVENT, resetUnauthorizedGuard } from '../api'

export interface UserInfo {
  username: string
  name: string
  empId: string
  avatar: string
  role: 'admin' | 'guest' // 用户角色
  department?: string // 所在部门
  position?: string // 职位
  positionEn?: string // 职位英文名称
  jobLevel?: string // 职级 (如 M10/T5)
  functionRoles?: string[] // 绑定的功能角色ID数组
  permissions?: MenuPermission[] // 后端登录时下发的合并菜单权限
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
  hasPermission: (permission: string) => boolean // 权限检查方法（支持 'action' 或 'menuKey:action'）
  hasMenuPermission: (menuKey: string) => boolean // 菜单访问权限检查（仅受控菜单校验）
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

  /**
   * 监听登录失效事件（Token 过期 / 被清除 / 无效，由请求拦截器 401 触发）：
   * 同步清除 React 登录态，路由守卫自动将用户带回登录页。
   * 仅清 localStorage 不清 React 状态会导致用户停留在系统内反复查询失败。
   */
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false)
      setUser(null)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('is_authenticated')
      localStorage.removeItem('user_info')
    }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])

  /**
   * 启动时后台静默刷新当前登录人信息：
   * 人事资料（部门/职位/职级等）变更后，无需重新登录即可展示最新数据；
   * Mock 登录（无后端）或接口失败时静默跳过，保留本地快照。
   */
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token || token === 'mock-token') return
    getUserInfo()
      .then((info) => {
        setUser((prev) => {
          const refreshed: UserInfo = {
            username: info.username,
            name: info.name,
            empId: info.empId,
            // 头像优先保留本地选择（更换头像仅存本地）
            avatar: prev?.avatar || info.avatar || 'pikachu-default',
            role: info.role === 'admin' ? 'admin' : 'guest',
            department: info.department,
            position: info.position,
            positionEn: info.positionEn,
            jobLevel: info.jobLevel,
            functionRoles: info.functionRoleIds?.map(String),
            permissions: info.permissions,
          }
          localStorage.setItem('user_info', JSON.stringify(refreshed))
          return refreshed
        })
      })
      .catch(() => {})
  }, [])

  /**
   * 前端 Mock 登录：当后端不可用时（如部署在 GitHub Pages 纯-static 环境），
   * 使用环境变量中的凭据进行本地登录，保证演示环境可用。
   */
  const mockLogin = (username: string, password: string): { success: boolean; message?: string; user?: UserInfo } => {
    const adminPwd = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined
    const trimmed = username.trim().toUpperCase()

    // 内置管理员：工号 MF00001 / 环境变量密码
    if (trimmed === 'MF00001' && adminPwd && password === adminPwd) {
      return {
        success: true,
        user: {
          username: 'MF00001',
          name: '系統管理員',
          empId: 'MF00001',
          avatar: 'pikachu-default',
          role: 'admin',
          department: '集團總裁辦',
          position: '高級副總裁',
          positionEn: 'SVP',
          jobLevel: 'M10',
        },
      }
    }
    return { success: false, message: '工號或密碼錯誤' }
  }

  const login = useCallback(async (username: string, password: string) => {
    try {
      // 优先尝试调用后端登录接口
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
        positionEn: backendUser.positionEn,
        jobLevel: backendUser.jobLevel,
        functionRoles: backendUser.functionRoleIds?.map(String),
        permissions: backendUser.permissions,
      }
      setIsAuthenticated(true)
      setUser(mappedUser)
      // 重置登录失效标记，保证本次会话内 Token 再次过期时仍可正常登出
      resetUnauthorizedGuard()
      // 保存 Token 与登录状态
      localStorage.setItem(TOKEN_KEY, result.token)
      localStorage.setItem('is_authenticated', 'true')
      localStorage.setItem('user_info', JSON.stringify(mappedUser))
      return { success: true }
    } catch (err) {
      // 后端不可用时（如部署在 GitHub Pages 无后端环境），降级到前端 Mock 登录
      const fallback = mockLogin(username, password)
      if (fallback.success) {
        setIsAuthenticated(true)
        setUser(fallback.user!)
        resetUnauthorizedGuard()
        localStorage.setItem('is_authenticated', 'true')
        localStorage.setItem('user_info', JSON.stringify(fallback.user))
        // Mock 模式不写入真实 Token，仅写入标志位避免下次再调后端
        localStorage.setItem(TOKEN_KEY, 'mock-token')
        return { success: true }
      }
      const msg = fallback.message || (err instanceof Error ? err.message : '登錄失敗')
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

  /** 归集当前用户的全部菜单权限（后端下发优先，兼容旧 localStorage 角色数据） */
  const getUserMenuPermissions = useCallback((): MenuPermission[] => {
    if (!user) return []
    if (user.permissions && user.permissions.length > 0) return user.permissions
    if (user.functionRoles && user.functionRoles.length > 0) {
      return user.functionRoles.map(roleId => getRolePermissions(roleId)).flat()
    }
    return []
  }, [user, getRolePermissions])

  /** 权限检查方法：支持 'menuKey:action'（按菜单精确校验）与 'action'（任意菜单含该操作即可，兼容旧调用） */
  const hasPermission = useCallback((permission: string) => {
    if (!user) return false
    // admin 拥有所有权限
    if (user.role === 'admin') return true

    const menuPermissions = getUserMenuPermissions()

    // 'menuKey:action' 格式：校验指定菜单的指定操作
    if (permission.includes(':')) {
      const [menuKey, action] = permission.split(':')
      return menuPermissions.some(p => p.menuKey === menuKey && p.actions.includes(action))
    }

    if (menuPermissions.length > 0) {
      return menuPermissions.some(p => p.actions.includes(permission))
    }

    // guest 只有查看权限，没有编辑权限
    if (user.role === 'guest') {
      return permission !== 'edit' && permission !== 'delete' && permission !== 'create'
    }
    return false
  }, [user, getUserMenuPermissions])

  /** 菜单访问权限：受控菜单需持有该菜单任一 action 授权；非受控菜单默认放行 */
  const hasMenuPermission = useCallback((menuKey: string) => {
    if (!user) return false
    if (user.role === 'admin') return true
    // 未接入权限校验的原型菜单：所有登录用户可访问
    if (!CONTROLLED_MENU_KEYS.includes(menuKey)) return true
    return getUserMenuPermissions().some(p => p.menuKey === menuKey && p.actions.length > 0)
  }, [user, getUserMenuPermissions])

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
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, updateAvatar, hasPermission, hasMenuPermission, hasDataPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
