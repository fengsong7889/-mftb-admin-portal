/**
 * API 层的统一出口（桶文件），业务代码统一从 `@/api` 引入，不直接依赖子模块路径。
 *
 * 两种导出方式的区分：
 * - 具名导出：只挑调用方真正需要的符号（如 request 与各认证全局事件名），避免把
 *   request.ts 的内部实现细节当成公共契约。
 * - `export *`：aiProvider / aiModel / deptAuthGroup / iconfont 这几个模块本身已经
 *   是薄封装，导出项与接口一一对应，直接全量转发。
 *
 * 新增 API 模块时优先考虑直接 import 子模块，只有确实需要对外统一的才加到这里，
 * 否则本文件会变成循环依赖的汇聚点。
 */
export { default as request, TOKEN_KEY, AUTH_UNAUTHORIZED_EVENT, SESSION_CONFLICT_EVENT, FORCE_LOGOUT_EVENT, ACCOUNT_DISABLED_EVENT, PASSWORD_CHANGE_REQUIRED_EVENT, resetUnauthorizedGuard, isBackendUnavailable } from './request'
export type { ApiResult, SessionConflictDetail, ForceLogoutDetail } from './request'
export { login, logout, getUserInfo } from './auth'
export type { LoginParams, LoginResult, UserInfo } from './auth'
export * from './aiProvider'
export * from './aiModel'
export * from './deptAuthGroup'
export * from './iconfont'
