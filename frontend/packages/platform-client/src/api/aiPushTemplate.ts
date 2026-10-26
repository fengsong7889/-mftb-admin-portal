import request from './request'

/** 推送模板：rdm_progress_group / rdm_progress_person */
export interface AiPushTemplate {
  id?: number | null
  templateKey: string
  name: string
  targetType: 'group' | 'person'
  titleTpl: string
  contentTpl: string
  status: string
  /** 作用域：common=共用，其余为业务系统编码 */
  systemCode?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
  /** 前端标记：来自内置默认（未落库），保存前 id 为空 */
  builtin?: boolean
}

export function fetchPushTemplates(systemCode?: string) {
  return request.get<unknown, AiPushTemplate[]>('/ai/prompt-config/push-templates', {
    params: systemCode ? { systemCode } : {},
  })
}

export function fetchBuiltinTemplate(templateKey: string) {
  return request.get<unknown, { template: AiPushTemplate; placeholders: Record<string, string> }>(
    '/ai/prompt-config/push-templates/builtin',
    { params: { templateKey } },
  )
}

export function savePushTemplate(row: AiPushTemplate) {
  return request.post<unknown, AiPushTemplate>('/ai/prompt-config/push-templates', row)
}

export function deletePushTemplate(id: number) {
  return request.delete(`/ai/prompt-config/push-templates/${id}`)
}

/** 占位符渲染（仅预览用）：与后端一致的纯文本替换，未命中的保留 -- */
export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] || '--')
}
