import request, { SILENT_HEADER } from './request'
import type { DataScope } from '../constants/dataScope'

/**
 * 当前登录人的组织数据范围（人员可见范围）。
 * <p>
 * 与 `/api/data-permission`（商家集团编码，业务资源维）是两件事：本接口回答「能看哪些人」。
 */
export interface OrgScopeInfo {
  /** 生效档位（与后端 OrgDataScope 同值） */
  scope: DataScope
  /** 后端给的中文档位名，仅作日志/兜底，界面文案走 i18n */
  scopeLabel: string
  /** 是否不限制（超管或角色为「全部」） */
  unlimited: boolean
  /** 可见部门数；不限制时为 null */
  deptCount: number | null
  /** 可见人数；不限制时为 null */
  userCount: number | null
}

/**
 * 查询自己的数据范围。
 * <p>
 * 静默：这条只服务于「你现在按什么口径看数」的提示，取不到绝不能挡住列表本身，
 * 也不该在页面加载时甩一个红色 toast。
 */
export function fetchMyOrgScope() {
  return request.get<unknown, OrgScopeInfo>('/org-scope/mine', {
    headers: { [SILENT_HEADER]: '1' },
  })
}
