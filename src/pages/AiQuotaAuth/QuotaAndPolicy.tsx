import AiAuth from './AiAuth'
import AiQuota from './AiQuota'
import AiDeptQuotaList from './deptQuota/AiDeptQuotaList'

/**
 * AI 配额与策略管理 - 按部门配置模型
 * @description 复用模型授权页的部门授权模块（搜索/分页/配置弹窗完整功能）
 */
export default function AiDeptModelAuth() {
  return <AiAuth fixedTab="dept" />
}

/**
 * AI 配额与策略管理 - 按员工/角色配置模型
 * @description 复用模型授权页的员工额外授权模块（新增/编辑/移除完整功能）
 */
export function AiEmpModelAuth() {
  return <AiAuth fixedTab="employee" />
}

/**
 * AI 配额与策略管理 - 部门额度
 * @description 獨立列表頁（列表 → 獨立新增/編輯頁 → 獨立詳情頁），參考部門模型權控
 */
export function AiDeptQuota() {
  return <AiDeptQuotaList />
}

/**
 * AI 配额与策略管理 - 员工额度
 * @description 复用额度策略模块（固定员工范围：查询/新增/编辑/启停）
 */
export function AiEmpQuota() {
  return <AiQuota fixedSection="quota-emp" />
}
