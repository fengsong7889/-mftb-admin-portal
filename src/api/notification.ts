import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/* ==================== 类型定义 ==================== */

/** 通知类型枚举（可扩展） */
export type NotificationType = 'gift_expire'

/** 通知项 */
export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  content: string
  storeId?: number
  storeCode?: string
  storeName?: string
  adType?: string
  expireDate?: string
  daysLeft?: number
  createdAt?: string
}

/** 通知列表响应 */
export interface NotificationListResult {
  items: NotificationItem[]
  unreadCount: number
}

/* ==================== API 接口 ==================== */

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 获取当前用户的通知列表 */
export async function fetchNotifications(): Promise<NotificationListResult> {
  try {
    return await request.get<unknown, NotificationListResult>('/notifications', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return { items: [], unreadCount: 0 }
    throw err
  }
}

/** 标记所有通知为已读 */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    await request.post<unknown, void>('/notifications/read-all', null, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return
    throw err
  }
}
