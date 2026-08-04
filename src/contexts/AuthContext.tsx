import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { Modal } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { Role, MenuPermission } from '../pages/Permission/types'
import { STORAGE_KEYS, CONTROLLED_MENU_KEYS, resolveFirstAccessiblePath } from '../pages/Permission/types'
import { login as loginApi, logout as logoutApi, getUserInfo, TOKEN_KEY, AUTH_UNAUTHORIZED_EVENT, SESSION_CONFLICT_EVENT, FORCE_LOGOUT_EVENT, ACCOUNT_DISABLED_EVENT, resetUnauthorizedGuard } from '../api'
import type { SessionConflictDetail, ForceLogoutDetail } from '../api'

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
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; redirectPath?: string; accountDisabled?: boolean }>
  logout: () => void
  updateAvatar: (avatar: string) => void
  hasPermission: (permission: string) => boolean // 权限检查方法（支持 'action' 或 'menuKey:action'）
  hasMenuPermission: (menuKey: string) => boolean // 菜单访问权限检查（仅受控菜单校验）
  hasDataPermission: (type: 'location' | 'merchant', key: string) => boolean // 数据权限检查方法
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * 解析 IP 地理位置（省市，中文）
 * 使用 ip-api.com 免費 API（支持 lang=zh-CN 返回中文地名，每分 45 次配額）
 */
async function resolveIpLocation(ip: string): Promise<string> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`)
    if (!res.ok) return ''
    const data = await res.json()
    if (data.status !== 'success') return ''
    const parts: string[] = []
    if (data.regionName) parts.push(data.regionName)
    if (data.city && data.city !== data.regionName) parts.push(data.city)
    return parts.join(' ')
  } catch {
    return ''
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  // 从 localStorage 初始化登录状态
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('is_authenticated')
    return saved === 'true'
  })
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('user_info')
    return saved ? JSON.parse(saved) : null
  })

  /** 被顶下线弹窗状态 */
  const [conflictInfo, setConflictInfo] = useState<SessionConflictDetail | null>(null)

  /** 被强制下线弹窗状态 */
  const [forceLogoutInfo, setForceLogoutInfo] = useState<ForceLogoutDetail | null>(null)

  /** 账号被停用弹窗状态 */
  const [accountDisabled, setAccountDisabled] = useState(false)

  /** 標記是否正在處理被頂下線/強制下線彈窗，防止路由守衛提前跳轉 */
  const pendingLogoutRef = useRef(false)

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
   * 清除登錄態的公共邏輯
   */
  const clearAuthState = useCallback(() => {
    setIsAuthenticated(false)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('is_authenticated')
    localStorage.removeItem('user_info')
  }, [])

  /**
   * 監聽被頂下線事件：賬號在其他設備登錄，先彈窗提醒，
   * 等用戶點擊「我知道了」後再清除登錄態並跳轉登錄頁。
   * 注意：此處不能立即 setIsAuthenticated(false)，否則路由守衛會
   * 瞬間切換到 /login，導致 Modal 被 Login 頁面遮擋。
   */
  useEffect(() => {
    const handleSessionConflict = (e: Event) => {
      const detail = (e as CustomEvent<SessionConflictDetail>).detail
      pendingLogoutRef.current = true
      setConflictInfo(detail)
      // 先清除 localStorage 中的 token，防止後續請求繼續攜帶失效 token
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('is_authenticated')
      localStorage.removeItem('user_info')

      // 異步解析登錄 IP 的地理位置（省市），解析完成後更新彈窗
      if (detail.loginIp) {
        resolveIpLocation(detail.loginIp).then((location) => {
          if (location) {
            setConflictInfo(prev => prev ? { ...prev, loginLocation: location } : prev)
          }
        })
      }
    }
    window.addEventListener(SESSION_CONFLICT_EVENT, handleSessionConflict)
    return () => window.removeEventListener(SESSION_CONFLICT_EVENT, handleSessionConflict)
  }, [])

  /**
   * 監聽被強制下線事件：管理員操作下線，先彈窗顯示操作人信息，
   * 等用戶點擊「我知道了」後再清除登錄態並跳轉登錄頁。
   */
  useEffect(() => {
    const handleForceLogout = (e: Event) => {
      const detail = (e as CustomEvent<ForceLogoutDetail>).detail
      pendingLogoutRef.current = true
      setForceLogoutInfo(detail)
      // 先清除 localStorage 中的 token
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('is_authenticated')
      localStorage.removeItem('user_info')
    }
    window.addEventListener(FORCE_LOGOUT_EVENT, handleForceLogout)
    return () => window.removeEventListener(FORCE_LOGOUT_EVENT, handleForceLogout)
  }, [])

  /**
   * 監聽账号被停用事件：在线时被管理员停用，先彈窗提醒，
   * 等用戶點擊「我知道了」後再清除登錄態並跳轉登錄頁。
   */
  useEffect(() => {
    const handleAccountDisabled = () => {
      pendingLogoutRef.current = true
      setAccountDisabled(true)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('is_authenticated')
      localStorage.removeItem('user_info')
    }
    window.addEventListener(ACCOUNT_DISABLED_EVENT, handleAccountDisabled)
    return () => window.removeEventListener(ACCOUNT_DISABLED_EVENT, handleAccountDisabled)
  }, [])

  /**
   * 启动时后台静默刷新当前登录人信息：
   * 人事资料（部门/职位/职级等）变更后，无需重新登录即可展示最新数据。
   */
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
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
   * 定时轮询会话状态：主动检测被管理员强制下线 / 被其他设备顶下线 / 账号停用。
   * 每 10 秒调用一次 /api/auth/check，发现异常立即派发全局事件触发弹窗提醒。
   */
  useEffect(() => {
    if (!isAuthenticated) return

    // 复用 request.ts 中的 base URL 计算逻辑
    const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
    const base = raw
      ? (raw.replace(/\/+$/, '').endsWith('/api') ? raw.replace(/\/+$/, '') : `${raw.replace(/\/+$/, '')}/api`)
      : '/api'
    const checkUrl = `${base}/auth/check`

    let stopped = false

    const poll = async () => {
      if (stopped) return
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return

      try {
        const res = await fetch(checkUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || stopped) return

        const result = await res.json() as { code: number; message: string; data?: { loginIp?: string } }
        if (stopped) return

        if (result.code === 200) return // 会话正常

        // 账号被停用
        if (result.code === 1002) {
          window.dispatchEvent(new CustomEvent(ACCOUNT_DISABLED_EVENT))
          return
        }

        // code === 401: 根据消息区分原因
        if (result.code === 401) {
          const msg = result.message || ''
          if (msg.includes('管理员')) {
            // 被管理员强制下线
            window.dispatchEvent(
              new CustomEvent<ForceLogoutDetail>(FORCE_LOGOUT_EVENT, {
                detail: { operatorName: '管理员', operatorEmpId: '' },
              })
            )
          } else if (msg.includes('其他设备')) {
            // 被其他设备顶下线：从响应中提取新登录设备的 IP
            const loginIp = result.data?.loginIp || ''
            window.dispatchEvent(
              new CustomEvent<SessionConflictDetail>(SESSION_CONFLICT_EVENT, {
                detail: { loginIp, loginLocation: '' },
              })
            )
          }
          // Token 过期等其它情况不做处理，等待下次业务请求触发常规 401 流程
        }
      } catch {
        // 网络异常静默忽略，下次轮询重试
      }
    }

    const timer = setInterval(poll, 10_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [isAuthenticated])

  const login = useCallback(async (username: string, password: string) => {
    try {
      // 调用后端登录接口，所有认证必须经过后端数据库验证
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
      // 計算首個有權限的菜單路徑，供登錄後智能跳轉
      const redirectPath = resolveFirstAccessiblePath(
        mappedUser.role === 'admin',
        (key) => mappedUser.permissions?.some(p => p.menuKey === key && p.actions.length > 0) ?? false,
      )
      return { success: true, redirectPath }
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : '登錄失敗'
      // 账号被停用时返回特定标记，由登录页弹窗展示
      const isAccountDisabled = msg.includes('账号已被停用') || msg.includes('已被禁用')
      return { success: false, message: msg, accountDisabled: isAccountDisabled }
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
      {/* 被顶下线提醒弹窗 */}
      <Modal
        title={null}
        open={conflictInfo !== null}
        centered
        closable={false}
        maskClosable={false}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我知道了"
        onOk={() => {
          setConflictInfo(null)
          clearAuthState()
          navigate('/login', { replace: true })
        }}
        styles={{
          header: { display: 'none' },
          body: { padding: '28px 24px 20px' },
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
            账号已在其他设备登录
          </h3>
          <p style={{ fontSize: 14, color: '#595959', marginBottom: 16 }}>
            您的账号已在另一台设备上登录，当前设备已被强制下线。
          </p>
          {conflictInfo && (
            <div style={{
              background: '#F5F5F5',
              borderRadius: 8,
              padding: '12px 16px',
              textAlign: 'left',
              fontSize: 13,
              color: '#595959',
            }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#8C8C8C' }}>登录 IP：</span>
                <span style={{ color: '#262626', fontWeight: 500 }}>{conflictInfo.loginIp || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#8C8C8C' }}>登录地点：</span>
                <span style={{ color: '#262626', fontWeight: 500 }}>{conflictInfo.loginLocation || '-'}</span>
              </div>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#8C8C8C', marginTop: 16, marginBottom: 0 }}>
            如非本人操作，请及时修改密码
          </p>
        </div>
      </Modal>
      {/* 被强制下线提醒弹窗 */}
      <Modal
        title={null}
        open={forceLogoutInfo !== null}
        centered
        closable={false}
        maskClosable={false}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我知道了"
        onOk={() => {
          setForceLogoutInfo(null)
          clearAuthState()
          navigate('/login', { replace: true })
        }}
        styles={{
          header: { display: 'none' },
          body: { padding: '28px 24px 20px' },
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
            账号已被强制下线
          </h3>
          <p style={{ fontSize: 14, color: '#595959', marginBottom: 16 }}>
            您的账号已被以下操作人强制下线，如有疑问请联系操作人：
          </p>
          {forceLogoutInfo && (
            <div style={{
              background: '#FFF7E6',
              borderRadius: 8,
              padding: '12px 16px',
              textAlign: 'left',
              fontSize: 13,
              color: '#595959',
              border: '1px solid #FFD591',
            }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#8C8C8C' }}>操作人：</span>
                <span style={{ color: '#262626', fontWeight: 500 }}>{forceLogoutInfo.operatorName || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#8C8C8C' }}>工号：</span>
                <span style={{ color: '#262626', fontWeight: 500 }}>{forceLogoutInfo.operatorEmpId || '-'}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
      {/* 账号被停用提醒弹窗 */}
      <Modal
        title={null}
        open={accountDisabled}
        centered
        closable={false}
        maskClosable={false}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我知道了"
        onOk={() => {
          setAccountDisabled(false)
          clearAuthState()
          navigate('/login', { replace: true })
        }}
        styles={{
          header: { display: 'none' },
          body: { padding: '28px 24px 20px' },
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
            账号已被停用
          </h3>
          <p style={{ fontSize: 14, color: '#595959', marginBottom: 0 }}>
            您的账号已被管理员停用，如需恢复请联系管理员。
          </p>
        </div>
      </Modal>
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
