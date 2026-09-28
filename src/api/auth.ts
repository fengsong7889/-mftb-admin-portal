import request from './request'
import { SILENT_HEADER } from './request'
import type { MenuPermission } from '../pages/Permission/types'

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
