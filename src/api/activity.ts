import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 活動狀態: 1=啟動 2=停用 */
export enum ActivityStatus {
  ENABLED = 1,
  DISABLED = 2,
}

/** 系統活動信息 */
export interface ActivityItem {
  /** 活動ID（業務編號） */
  activityNo: string
  /** 活動名稱 */
  name: string
  /** 活動狀態: 1=啟動 2=停用 */
  status: ActivityStatus
  /** 活動開始時間 */
  startTime?: string
  /** 活動結束時間 */
  endTime?: string
}

/** 静默请求头 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 活動列表（關鍵字/狀態過濾，供配置時選擇活動） */
export async function fetchActivityList(params?: { keyword?: string; status?: number }) {
  try {
    return await request.get<unknown, ActivityItem[]>('/activity/list', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 按活動ID獲取活動名稱與狀態；不存在時返回 null */
export async function fetchActivityByNo(activityNo: string) {
  try {
    return await request.get<unknown, ActivityItem>(`/activity/${encodeURIComponent(activityNo)}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}
