/**
 * 员工/部门额度配置 API（ai_quota_config）
 *
 * 对应后端 AiQuotaController 的 `/api/ai/quota/*`。
 *
 * 与 `empQuota.ts`（职位/角色额度策略 ai_emp_quota_policy）不同：
 * 这里操作的是「按员工/部门定向分配」的额度记录，字段只有日/月 token 上限，
 * 允许 modelId 为空表示「该员工所有模型共享这一份额度」。
 */
import request from './request'

/** 额度配置目标类型 */
export type QuotaTargetType = 'employee' | 'department'

/** 额度列表项（后端 AiQuotaDTO.QuotaVO） */
export interface QuotaVO {
  id: number
  quotaType: QuotaTargetType
  /** 员工 id 或部门 id */
  targetId: number
  /** 员工「工号 姓名」或部门名称 */
  targetName: string | null
  /** null = 全部模型共享。注意：后端用 getLong 读列，NULL 会序列化成 0，判断时按 falsy 处理 */
  modelId: number | null
  modelName: string | null
  dailyQuota: number
  monthlyQuota: number
  usedToday: number
  usedMonth: number
  /** daily > 0 或 monthly > 0 */
  hasLimit: boolean
  autoReset: number
  resetDayOfMonth: number
  createdAt: string
  updatedAt: string
  /** 最后更新人（姓名）；存量数据为空 */
  updatedBy: string | null
}

/** 单条额度保存请求（后端 AiQuotaDTO.QuotaConfigRequest） */
export interface QuotaConfigRequest {
  quotaType: QuotaTargetType
  targetId: number
  /** 留空 = 全部模型共享；同一员工可对不同模型分别配额 */
  modelId?: number | null
  dailyQuota?: number
  monthlyQuota?: number
  autoReset?: number
  resetDayOfMonth?: number
}

/** 员工额度查询条件（后端从 GET body 读取，前端按全量拉取 + 本地过滤，故不传） */
export interface EmpQuotaQuery {
  employeeId?: number
  empId?: string
  name?: string
}

/**
 * 查询员工额度列表。
 *
 * 后端签名为 `@RequestBody(required = false)`（GET 读 body），在浏览器里传 body 不稳妥，
 * 因此这里始终全量拉取，查询条件由页面本地过滤。
 */
export function fetchEmpQuotas(): Promise<QuotaVO[]> {
  return request.get('/ai/quota/employees')
}

/** 批量保存员工额度（按 quotaType+targetId+modelId 做 upsert） */
export function saveEmpQuotas(quotas: QuotaConfigRequest[]): Promise<boolean> {
  return request.post('/ai/quota/employees', { quotas })
}

/** 删除某目标（员工/部门）的全部额度配置，含其所有模型维度 */
export function deleteQuota(type: QuotaTargetType, targetId: number): Promise<boolean> {
  return request.delete(`/ai/quota/${type}/${targetId}`)
}
