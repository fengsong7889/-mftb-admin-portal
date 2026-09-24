import request from './request'
import { fetchMcpTools, type McpTool } from './mcpService'

/** 与 aiPlatformMock 的 ToolDefinition 兼容的最小视图（V0 §B.2 后端真实数据源） */
export interface ToolPolicyRow {
  id: string
  name: string
  code: string
  menuName: string
  /** L0=未启用 / L1=低 / L2=中 / L3=高；映射自 ai_tool_policy.risk_level + enabled */
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
  description: string
  params: { name: string; type: string; required: boolean; description: string }[]
  /** 1=启用 0=停用；未登记策略视为 0（默认拒绝） */
  status: 0 | 1
  callCount30d: number
  lastCalledAt: string | null
  updatedBy?: string
  updatedAt?: string
  requireApproval: 0 | 1
  dataScopeJson?: string | null
  remark?: string | null
}

/** 后端实体（AiToolPolicy.java 镜像） */
interface BackendToolPolicy {
  id: number
  toolKey: string
  enabled: number
  riskLevel: string
  requireApproval: number
  dataScopeJson?: string | null
  remark?: string | null
  updatedBy?: string
  updatedAt?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  finance: '財務管理',
  promotion: '推廣管理',
  merchant: '商戶管理',
  ai: 'AI 能力',
  notify: '通知渠道',
}

/** risk_level → L1/L2/L3；未登记或停用统一降为 L0（默认拒绝） */
function mapLevel(riskLevel: string | undefined, enabled: number): ToolPolicyRow['level'] {
  if (enabled !== 1) return 'L0'
  if (riskLevel === 'high') return 'L3'
  if (riskLevel === 'medium') return 'L2'
  return 'L1'
}

function parseParams(paramsJson: string | null | undefined): ToolPolicyRow['params'] {
  if (!paramsJson) return []
  try {
    const schema = JSON.parse(paramsJson) as { properties?: Record<string, { type?: string; description?: string }> }
    const required = new Set<string>(
      ((JSON.parse(paramsJson) as { required?: string[] }).required) ?? [],
    )
    return Object.entries(schema.properties ?? {}).map(([name, def]) => ({
      name,
      type: def.type ?? 'string',
      required: required.has(name),
      description: def.description ?? '',
    }))
  } catch {
    return []
  }
}

/** 拉取所有 MCP 工具 + 对应策略，融合为管理页视图（未登记策略显示为 L0 停用） */
export async function fetchToolRegistry(): Promise<ToolPolicyRow[]> {
  const [tools, policies] = await Promise.all([
    fetchMcpTools().catch(() => [] as McpTool[]),
    request.get('/ai/tool-policy') as unknown as Promise<BackendToolPolicy[]>,
  ])
  const policyMap = new Map<string, BackendToolPolicy>((policies ?? []).map((p) => [p.toolKey, p]))
  return (tools ?? []).map((tool) => {
    const policy = policyMap.get(tool.toolKey)
    const enabled = policy?.enabled ?? 0
    return {
      id: tool.toolKey,
      name: tool.name,
      code: tool.toolKey,
      menuName: CATEGORY_LABEL[tool.category] ?? tool.category ?? '—',
      level: mapLevel(policy?.riskLevel, enabled),
      description: tool.description ?? '',
      params: parseParams(tool.paramsJson),
      status: (enabled === 1 ? 1 : 0) as 0 | 1,
      // 近 30 天调用次数与最近调用时间属审计聚合，本 PR 暂返回 0/null，V1 增加聚合视图
      callCount30d: 0,
      lastCalledAt: null,
      updatedBy: policy?.updatedBy,
      updatedAt: policy?.updatedAt,
      requireApproval: (policy?.requireApproval === 1 ? 1 : 0) as 0 | 1,
      dataScopeJson: policy?.dataScopeJson,
      remark: policy?.remark,
    }
  })
}

/** 启停工具（网关侧下次 enforce 立即生效） */
export async function toggleToolStatus(toolKey: string, enabled: 0 | 1): Promise<void> {
  await request.patch(`/ai/tool-policy/${encodeURIComponent(toolKey)}/toggle?enabled=${enabled}`)
}

/** 更新策略（风险等级 / 审批凭证 / 数据范围 / 备注） */
export async function updateToolPolicy(
  toolKey: string,
  body: {
    enabled?: number
    riskLevel?: string
    requireApproval?: number
    dataScopeJson?: string
    remark?: string
  },
): Promise<void> {
  await request.put(`/ai/tool-policy/${encodeURIComponent(toolKey)}`, body)
}

/** 查询工具执行审计日志 */
export interface ExecLogRow {
  id: number
  toolKey: string
  caller: string | null
  conversationId: string | null
  argsDigest: string | null
  decision: string
  rejectReason: string | null
  elapsedMs: number | null
  success: number | null
  createdAt: string
}

export async function fetchExecLogs(params: {
  page?: number
  size?: number
  toolKey?: string
  caller?: string
}): Promise<{ records: ExecLogRow[]; total: number }> {
  const result = (await request.get('/ai/tool-policy/exec-logs', { params })) as unknown as {
    records: ExecLogRow[]
    total: number
  }
  return { records: result?.records ?? [], total: result?.total ?? 0 }
}
