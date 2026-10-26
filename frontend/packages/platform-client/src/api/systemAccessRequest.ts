/**
 * 系統權限申請 API（企業門戶「我要申請」）
 * 對應後端 SystemAccessRequestController（/api/oa/system-access-requests）
 *
 * 后端刻意不给这组接口挂菜单权限注解：使用者正是「对所申请系统没有任何权限」的员工，
 * 挂了注解就会把门户的「我要申請」变成死链。身份与授权判定全部在服务端做，
 * 这里只传业务内容，不传任何身份字段（传了也不会被采纳）。
 *
 * 2026-10 改口径：申请侧不再提交勾选菜单（菜单级申请会把系统功能全貌暴露给零权限用户，
 * 且勾选树诱导全选），改为提交使用场景 + 使用期限 + 诉求说明，可选带一个参考角色 ID。
 * preferredRoleId 只是建议值，最终授权由审批人在流程上指定，后端兑现前还会再校验一次。
 */
import request from './request'
import type { PortalSystem } from './portal'

/** 单据状态（与 OA flow_status 同源） */
export type SystemAccessStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** 授权兑现状态：none=未兑现 granted=已绑定角色 */
export type SystemAccessGrantStatus = 'none' | 'granted'

/** 使用期限类型：长期（永不自动回收）/ 至指定日期（到期次日自动收回） */
export type SystemAccessDurationType = 'permanent' | 'until'

/**
 * 【历史】申请的菜单功能项。
 * 2026-10 前的单据存过这份数据，只用于旧单回看；新单该字段恒为空数组，不要再往请求体里塞。
 */
export interface SystemAccessMenuItem {
  menuKey: string
  /** 名称为后端回查 sys_menu 的快照 */
  name?: string | null
}

/** 相关凭证（base64 Data URL 直存，与其它流程一致） */
export interface SystemAccessAttachment {
  name: string
  /** image / pdf */
  type: string
  contentType?: string
  size?: number
  dataUrl: string
}

/** 申请单 VO */
export interface SystemAccessRequestVO {
  id: number
  flowNo: string
  systemCode: string
  systemName: string | null
  applicantName: string
  applicantEmpId: string | null
  deptName: string | null
  /** 【历史】旧单的勾选菜单；新单为空数组 */
  requestedMenus: SystemAccessMenuItem[]
  /** 使用场景 code 列表（展示名走 getScenarioLabel） */
  scenarios: string[]
  /** 使用期限类型；历史单据为 null */
  durationType: SystemAccessDurationType | null
  /** 期限截止日（yyyy-MM-dd）；permanent 或历史单据为 null */
  durationUntil: string | null
  /**
   * 到期回收状态：none=未回收 / revoked=已回收 / kept=仍被其他有效授权覆盖而不回收。
   * <p>前端靠它区分「已授权且仍在有效期内」与「已授权但已到期收回」，不能拿 grantStatus 代替。
   */
  revokeStatus: string | null
  /** 回收时间（仅 revoked/kept 有值） */
  revokedAt: string | null
  /** 回收执行者：system-expiry=定时作业，其他=真人签名 */
  revokedBy: string | null
  /** 申请人建议的参考角色 ID */
  preferredRoleId: number | null
  /** 参考角色名称快照 */
  preferredRoleName: string | null
  /** 使用诉求说明 */
  reason: string
  attachments: SystemAccessAttachment[]
  status: SystemAccessStatus
  grantTargetType: string | null
  grantTargetId: number | null
  grantTargetName: string | null
  grantStatus: SystemAccessGrantStatus
  grantedAt: string | null
  grantedBy: string | null
  rejectReason: string | null
  applyTime: string | null
  completeTime: string | null
  /** OA 侧当前待审节点 */
  currentNodeName?: string | null
  /** OA 侧当前审批人（多人逗号分隔） */
  currentApprover?: string | null
}

/** 提交请求体 */
export interface SystemAccessRequestCreatePayload {
  systemCode: string
  /** 使用场景 code（至少 1 项，白名单见 constants/systemAccess） */
  scenarios: string[]
  durationType: SystemAccessDurationType
  /** durationType=until 时必填（yyyy-MM-dd）；permanent 时不要传，后端一律置空 */
  durationUntil?: string
  /**
   * 参考角色 ID（可选，必须来自 fetchSelfServiceRoles 的目录）。
   * <p>提交带 until 时，到期次日起系统会自动收回本单绑上的角色（仅当本单真的新绑了该角色）。
   */
  preferredRoleId?: number
  reason: string
  attachments?: SystemAccessAttachment[]
}

/**
 * 申请人可见的「参考角色」目录项。
 *
 * 后端刻意只返回这三个字段（不含角色编码、菜单数与任何权限明细）：本接口的读者是对目标系统
 * 零权限的员工，自助入口不能变成一张系统结构地图。
 */
export interface SystemAccessRoleOption {
  roleId: number
  roleName: string
  /** 角色业务说明（管理员在「角色管理」填写） */
  description?: string | null
}

/** 审批人可选的授权角色候选（仅当前节点审批人/超管可读） */
export interface SystemAccessGrantOption {
  targetType: string
  targetId: number
  targetName: string
  targetCode?: string | null
  description?: string | null
  /** 该角色在本系统内已授权的菜单数（只有数量，没有明细） */
  grantedMenuCount: number
  /** 是否为申请人建议的参考角色（审批面板默认选中，可改选） */
  preferred: boolean
  /** 申请人是否已持有该角色（授权为空操作） */
  alreadyBound: boolean
}

/** 提交申请，返回 XTSQ 流程编号 */
export function submitSystemAccessRequest(payload: SystemAccessRequestCreatePayload): Promise<string> {
  return request.post('/oa/system-access-requests', payload)
}

/**
 * 可申请系统目录：当前登录人尚未获得准入的启用业务系统。
 * <p>与门户「未获得权限」页签同一口径，让申请页不依赖前端硬编码目录（新增系统不用改两处）。
 */
export function fetchRequestableSystems(): Promise<PortalSystem[]> {
  return request.get('/oa/system-access-requests/systems')
}

/**
 * 参考角色目录：管理员在「角色管理」开放自助申请、且已持该系统准入的启用角色。
 * <p>目录为空是正常态（管理员还没开放任何角色）：申请页此时只走「陈述诉求」，
 * 由审批人决定授哪个角色，不显示空卡片。
 */
export function fetchSelfServiceRoles(systemCode: string): Promise<SystemAccessRoleOption[]> {
  return request.get('/oa/system-access-requests/roles', { params: { systemCode } })
}

/** 我的申请（当前登录人）；systemCode 可选，用于门户按系统查在途单 */
export function fetchMySystemAccessRequests(systemCode?: string): Promise<SystemAccessRequestVO[]> {
  return request.get('/oa/system-access-requests/my', { params: systemCode ? { systemCode } : undefined })
}

/** 按流程编号取申请详情（含凭证与 OA 当前节点/审批人） */
export function fetchSystemAccessRequestByFlow(flowNo: string): Promise<SystemAccessRequestVO> {
  return request.get(`/oa/system-access-requests/by-flow/${encodeURIComponent(flowNo)}`)
}

/** 授权角色候选（仅当前节点审批人/超管可读） */
export function fetchSystemAccessGrantOptions(flowNo: string): Promise<SystemAccessGrantOption[]> {
  return request.get(`/oa/system-access-requests/${encodeURIComponent(flowNo)}/grant-options`)
}
