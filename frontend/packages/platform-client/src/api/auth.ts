import request from './request'
import { SILENT_HEADER } from './request'
import type { MenuPermission } from '@mftb/contracts/menuPermission'

/** 登录请求参数 */
export interface LoginParams {
  username: string
  password: string
  /** 滑块安全验证 Token（连续失败 3 次后必填，后端签发、一次性使用） */
  captchaToken?: string
}

/** 后端返回的用户信息 */
export interface UserInfo {
  id: number
  username: string
  name: string
  empId: string
  avatar: string
  role: string
  department?: string
  /** 部门英文名称 */
  departmentEn?: string
  position?: string
  /** 职位英文名称 */
  positionEn?: string
  /** 职级 (如 M10/T5) */
  jobLevel?: string
  functionRoleIds?: number[] // 绑定的功能角色ID
  functionRoleCodes?: string[] // 绑定的功能角色编码（如 FIN_BIZ_APPROVER）
  permissions?: MenuPermission[] // 登录时下发的合并菜单权限
  /** 当前用户可进入的业务系统编码列表（后端按 sys_system.sort_order 排序，不包含哨兵 'portal'）*/
  accessibleSystems?: string[]
  /** 是否必须先修改密码才能使用系统（初始密码/被管理员重置时为 true） */
  mustChangePassword?: boolean
}

/** 登录响应 */
export interface LoginResult {
  token: string
  userInfo: UserInfo
}

/** 登录 */
export function login(params: LoginParams) {
  return request.post<unknown, LoginResult>('/auth/login', params)
}

/** 签发滑块安全验证 Token（静默：失败由登录页自行提示） */
export function fetchCaptchaToken() {
  return request.get<unknown, { token: string; expireSeconds: number }>('/auth/captcha', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 登出 */
export function logout() {
  return request.post<unknown, void>('/auth/logout')
}

/** 修改密码参数（本人自助，目标账号由服务端会话确定） */
export interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

/**
 * 修改登录密码（本人）。
 * <p>成功后服务端已撤销当前会话，调用方必须引导重新登录；
 * 错误（如当前密码不正确）由弹窗内展示，故带静默标记避免与全局拦截器重复弹提示。
 */
export function changePassword(params: ChangePasswordParams) {
  return request.post<unknown, void>('/auth/password', params, {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 获取当前登录用户信息 */
export function getUserInfo() {
  // 带静默标记：用于启动时后台刷新用户信息，后端不可用时不弹全局错误提示
  return request.get<unknown, UserInfo>('/auth/info', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 获取当前用户快捷入口 */
export function fetchQuickFavorites() {
  return request.get<unknown, string[]>('/auth/quick-favorites', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 保存当前用户快捷入口 */
export function saveQuickFavorites(keys: string[]) {
  return request.put<unknown, void>('/auth/quick-favorites', keys)
}

/**
 * 获取当前用户企业门户「我的常用」系统编码。
 * null 表示该账号从未同步过（后端列为空，Jackson non_null 会省略 data），
 * 与「同步过且已清空」返回的空数组语义不同，调用方必须区分处理。
 */
export function fetchPortalFavorites() {
  return request.get<unknown, string[] | null>('/auth/portal-favorites', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 保存当前用户企业门户「我的常用」系统编码（整份覆盖） */
export function savePortalFavorites(codes: string[]) {
  return request.put<unknown, void>('/auth/portal-favorites', codes)
}

/** AI 助手偏好设置（与后端 ai_settings 列字段白名单一致） */
export interface AiSettings {
  engineMode?: 'auto' | 'primary' | 'off-peak'
  contextWindow?: number | null
  thinkingEnabled?: boolean
  thinkingDepth?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

/**
 * 获取当前用户 AI 助手偏好设置。
 * null 表示该账号从未同步过（后端列为空，Jackson non_null 会省略 data），
 * 与「同步过且已清空」返回的空对象语义不同，调用方必须区分处理。
 */
export function fetchAiSettings() {
  return request.get<unknown, AiSettings | null>('/auth/ai-settings', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 保存当前用户 AI 助手偏好设置（整份覆盖） */
export function saveAiSettings(settings: AiSettings) {
  return request.put<unknown, void>('/auth/ai-settings', settings)
}

/** 产研交付个人工作台布局偏好（与后端 workbench_layout 列格式一致） */
export interface WorkbenchLayoutData {
  v: 1
  order: string[]
  dismissed: string[]
}

/**
 * 获取当前用户产研交付个人工作台布局偏好。
 * null 表示该账号从未同步过，前端据此回退 localStorage 缓存。
 */
export function fetchWorkbenchLayout() {
  return request.get<unknown, WorkbenchLayoutData | null>('/auth/workbench-layout', {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 保存当前用户产研交付个人工作台布局偏好（整份覆盖） */
export function saveWorkbenchLayout(layout: WorkbenchLayoutData) {
  return request.put<unknown, void>('/auth/workbench-layout', layout)
}

/** 更新当前用户头像（持久化到后端） */
export function updateAvatarApi(avatar: string) {
  return request.put<unknown, void>('/auth/avatar', { avatar })
}

/** 上传头像图片，返回 Base64 Data URL */
export function uploadAvatarApi(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  // SILENT：由調用方（HeaderBar）統一展示後端校驗消息，避免全局攔截器與組件重複彈提示
  return request.post<unknown, { base64: string }>('/auth/avatar/upload', formData, {
    headers: { [SILENT_HEADER]: '1' },
  })
}
