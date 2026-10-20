import AiAuth from './AiAuth'

/**
 * AI 配额与策略管理 - 按部门配置模型
 *
 * @description 复用模型授权页的部门授权模块（搜索/分页/配置弹窗完整功能）。
 * 数据源为真实 `GET /api/ai/auth/dept-groups`，新增/编辑走独立页面。
 *
 * 同文件原有的 `AiEmpModelAuth` / `AiDeptQuota` / `AiEmpQuota` 三个导出已删除：
 * 它们分别指向已废弃的 mock 员工授权 Tab 与 `AiQuota.tsx` 假额度实现，
 * 且零路由引用（真实入口是 `/ai-emp-model-auth`、`/ai-dept-quota`、`/ai-emp-quota`）。
 */
export default function AiDeptModelAuth() {
  return <AiAuth />
}
