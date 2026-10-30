/**
 * 统一门户 API（阶段 B）。
 *
 * 后端根据当前登录用户的角色 ∪ 部门 × 系统准入返回可进入的业务系统列表；
 * 前端只渲染返回内容，不做二次过滤，避免与后端撤销节奏不一致产生「幽灵入口」。
 */
import request, { SILENT_HEADER } from './request'

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

/**
 * 静默头：门户首屏已有页面级错误态与重试按钮，拦截器再弹一次 toast 属于重复提示。
 * <p>实测后端抖动时会出现「红色 toast + 空态文案」两个提示，且 toast 直出
 * `timeout of 15000ms exceeded` 这类 axios 原文（评审 P0-7）。
 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/**
 * 在途去重：门户上下文被 Home / Sidebar / SystemSwitcher / Portal 四个组件各自拉取，
 * 一次首屏会打出 3~4 个完全相同的请求。
 *
 * <p>只合并「同时在途」的请求，**不做 TTL 缓存**：本接口是授权派生数据，
 * 缓存会把后端已撤销的系统继续展示成「幽灵入口」（见文件头注释），
 * 因此后发生的挂载仍必须重新拉取。
 */
let pending: Promise<PortalContext> | null = null

/** 拉取当前登录用户可进入的系统列表（后端已按 sort 排序） */
export function fetchPortalContext(): Promise<PortalContext> {
  if (pending) return pending
  const inflight = request.get<unknown, PortalContext>('/portal/context', SILENT)
  pending = inflight
  // 内部链单独吞掉异常，避免无人 catch 的派生 Promise 报 unhandled rejection。
  void inflight.catch(() => undefined).finally(() => { if (pending === inflight) pending = null })
  return inflight
}
