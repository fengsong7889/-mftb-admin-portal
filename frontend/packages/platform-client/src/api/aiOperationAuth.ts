import request from './request'
import { formatEpochOrDash } from '@/utils/tableDisplay'
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
  rdm: '產研交付',
}

/**
 * risk_level → L1/L2/L3（风险分级本身）。
 * <p>以前把「未启用」也压成 L0，导致同一个工具在「MCP 服務」页显示 L3 需審批、
 * 在「AI 操作授權」页显示 L0 禁止調用，管理员无从判断哪个是真的。
 * 口径：分级只看 risk_level；是否放行由 status（enabled）单独表达，两件事不耦合。
 * 未登记策略时回 L0（默认拒绝，与网关 enforce 一致）。
 */
function mapLevel(riskLevel: string | undefined, enabled: number): ToolPolicyRow['level'] {
  if (!riskLevel) return 'L0'
  if (riskLevel === 'high') return 'L3'
  if (riskLevel === 'medium') return 'L2'
  if (riskLevel === 'low') return 'L1'
  void enabled
  return 'L0'
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
      // 近 30 天调用量与最近调用时间：不编数，由调用方用 aggregateCallStats() 从执行日志聚合后覆盖
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

/* ────────────────── 紧急熔断（V0 §八 V0-7） ────────────────── */

/** 熔断状态（后端 AgentKillSwitchService.Status） */
export interface KillSwitchStatus {
  engaged: boolean
  operator: string
  reason: string
  updatedAt: string
}

/** 查当前熔断状态（GET /api/agent/kill-switch，需 ai-operation-auth:view） */
export async function fetchKillSwitch(): Promise<KillSwitchStatus> {
  return (await request.get('/agent/kill-switch')) as unknown as KillSwitchStatus
}

/** 切换熔断（需 ai-operation-auth:edit）；后端会落操作人与原因，并让跨实例在 5 秒内收敛 */
export async function toggleKillSwitch(engaged: boolean, reason: string): Promise<KillSwitchStatus> {
  return (await request.post('/agent/kill-switch', { engaged, reason })) as unknown as KillSwitchStatus
}

/**
 * 用执行审计日志聚合「近 30 天调用 / 最近调用时间」。
 * <p>为什么需要：以前两个字段在 API 层写死 0/null，页面上永远是一串假 0，
 * 管理员会误读为“这些工具从未被调用过”。日志表已有数据，聚合就能拿真值。
 */
export async function aggregateCallStats(
  rows: ToolPolicyRow[],
  lookbackDays = 30,
): Promise<ToolPolicyRow[]> {
  const { records } = await fetchExecLogs({ page: 1, size: 200 })
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  const count = new Map<string, number>()
  const latest = new Map<string, number>()
  for (const log of records) {
    // createdAt 实际是后端序列化的毫秒数字；旧写法 Date.parse(number) 会得到 NaN，
    // 把全部记录都当“超出窗口”跳过，导致「近 30 天調用」永远显示 0
    const ts = typeof log.createdAt === 'number' ? log.createdAt : Date.parse(String(log.createdAt))
    if (!Number.isFinite(ts) || ts < since) continue
    count.set(log.toolKey, (count.get(log.toolKey) ?? 0) + 1)
    latest.set(log.toolKey, Math.max(latest.get(log.toolKey) ?? 0, ts))
  }
  return rows.map((row) => {
    const hit = latest.get(row.code)
    return {
      ...row,
      callCount30d: count.get(row.code) ?? row.callCount30d,
      // 用本地时间格式，不用 toLocaleString 的环境相关输出（不同浏览器/语言下列宽会抖）
      lastCalledAt: hit ? formatEpochOrDash(hit) : row.lastCalledAt,
    }
  })
}

export interface ToolScope {
  /** 角色编码（sys_role.code 或 sys_user.function_roles 中的值） */
  roles: string[]
  /** 部门 id（sys_user.department_id） */
  depts: number[]
}

/**
 * 解析 ai_tool_policy.data_scope_json 的可见范围。
 * <p>损坏/缺失一律视为“全员可见”，不能因为一条配置把工具整体关停。
 */
export function parseToolScope(raw?: string | null): ToolScope {
  if (!raw) return { roles: [], depts: [] }
  try {
    const parsed = JSON.parse(raw) as { roles?: unknown; depts?: unknown }
    const roles = Array.isArray(parsed.roles)
      ? parsed.roles.filter((v) => v !== null && v !== undefined && v !== '').map(String)
      : []
    const depts = Array.isArray(parsed.depts)
      ? parsed.depts
        .filter((v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean')
        .map(Number)
        .filter((n) => Number.isFinite(n))
      : []
    return { roles, depts }
  } catch {
    return { roles: [], depts: [] }
  }
}

/** 序列化可见范围；空数组代表全员可见，保持字段存在便于运营看懂。 */
export function serializeToolScope(scope: ToolScope): string {
  return JSON.stringify({ roles: scope.roles, depts: scope.depts })
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
  /** 服务端解析出的人可读姓名（姓名（工号）），解析不到时等于 caller */
  callerName?: string | null
  conversationId: string | null
  argsDigest: string | null
  decision: string
  rejectReason: string | null
  elapsedMs: number | null
  success: number | null
  /** 后端 Jackson 把 LocalDateTime 序列化成 Unix 毫秒数字，不是日期字符串 */
  createdAt: string | number
}

/** 查询：GET /ai/tool-policy/exec-logs */
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
