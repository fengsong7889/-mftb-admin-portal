/**
 * 通知模板与推送开关 API（对接 /api/meeting/notify*）。
 *
 * 两个页面各自对应一个菜单 key（notification-template / notification-switch），
 * 权限由后端 @RequirePermission 校验，前端只负责展示与提交。
 */
import request from './request'

export interface NotifyTemplateVO {
  sceneKey: string
  sceneName: string
  titleTpl: string
  bodyTpl: string
  /** 可用变量说明（后端登记，仅提示） */
  variables?: string
  enabled: boolean
  updatedBy?: string
  updatedAt?: string
}

export interface NotifyTemplateSave {
  sceneName?: string
  titleTpl: string
  bodyTpl: string
  enabled: boolean
}

/** 渠道词表与后端 CHECK 约束一致 */
export type NotifyChannel = 'DINGTALK_WORK' | 'DINGTALK_GROUP'

export interface NotifySwitchVO {
  sceneKey: string
  channel: NotifyChannel
  enabled: boolean
  updatedBy?: string
  updatedAt?: string
}

export function fetchNotifyTemplates(): Promise<NotifyTemplateVO[]> {
  return request.get<unknown, NotifyTemplateVO[]>('/meeting/notify/templates')
}

export function saveNotifyTemplate(sceneKey: string, payload: NotifyTemplateSave): Promise<NotifyTemplateVO[]> {
  return request.put<unknown, NotifyTemplateVO[]>(`/meeting/notify/templates/${encodeURIComponent(sceneKey)}`, payload)
}

export function fetchNotifySwitches(): Promise<NotifySwitchVO[]> {
  return request.get<unknown, NotifySwitchVO[]>('/meeting/notify/switches')
}

export function saveNotifySwitch(payload: { sceneKey: string; channel: NotifyChannel; enabled: boolean }): Promise<NotifySwitchVO[]> {
  return request.put<unknown, NotifySwitchVO[]>('/meeting/notify/switches', payload)
}
