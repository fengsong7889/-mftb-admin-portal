/**
 * 统一门户 API（阶段 B）。
 *
 * 后端根据当前登录用户的角色 ∪ 部门 × 系统准入返回可进入的业务系统列表；
 * 前端只渲染返回内容，不做二次过滤，避免与后端撤销节奏不一致产生「幽灵入口」。
 */
import request from './request'

/** 门户卡片：系统最小信息 */
export interface PortalSystem {
  /** 系统编码（sys_system.code），与 constants/systemCode 白名单一致 */
  code: string
  /** 中文名 */
  name: string
  /** 英文名（i18n fallback） */
  nameEn?: string | null
  /** 简介 */
  description?: string | null
  /** 前端图标 key（Ant Design Icons 组件名） */
  icon?: string | null
  /** 门户排序 */
  sort?: number | null
}

/** /api/portal/context 响应 data */
export interface PortalContext {
  systems: PortalSystem[]
  /** 是否平台超管；仅用于文案提示，不作为客户端授权依据 */
  superAdmin: boolean
}

/** 拉取当前登录用户可进入的系统列表（后端已按 sort 排序） */
export function fetchPortalContext() {
  return request.get<unknown, PortalContext>('/portal/context')
}
