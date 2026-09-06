import request from './request'

/**
 * MCP 服務 API
 * 廣場管「接入」（安裝/卸載），AI 操作授權管「放行」（L0-L4 治理）
 * 對應後端 McpToolController（/api/mcp/tools）
 */

/** MCP 工具 */
export interface McpTool {
  id: number
  toolKey: string
  name: string
  /** finance / promotion / merchant / ai / notify */
  category: string
  /** 工具來源: builtin=內置工具 external=外部服務（MCP Server，執行鏈路規劃中） */
  source: string
  /** 外部服務接入方式: remote-http / remote-sse / local-stdio（builtin 為 null） */
  transport: string | null
  /** 能力描述（作為 tool description 下發給模型） */
  description: string
  /** 圖標名稱（MenuIcon 註冊表） */
  icon: string | null
  version: string
  /** 風險等級 L0~L4 */
  riskLevel: string
  /** 參數 JSON Schema（字符串，作為 parameters 下發給模型） */
  paramsJson: string | null
  enabled: number
  installed: number
  installedBy: string | null
  installedAt: string | null
  sort: number
}

/* ==================== API ==================== */

/** 廣場列表（全部上架工具含安裝狀態） */
export function fetchMcpTools(): Promise<McpTool[]> {
  return request.get('/mcp/tools')
}

/** 已安裝工具 manifest（AI 助手動態拉取） */
export function fetchInstalledMcpTools(): Promise<McpTool[]> {
  return request.get('/mcp/tools/installed')
}

/** 安裝工具（冪等，AI 助手即刻具備該能力） */
export function installMcpTool(toolKey: string): Promise<boolean> {
  return request.post(`/mcp/tools/${toolKey}/install`)
}

/** 卸載工具（冪等，AI 助手即刻失去該能力） */
export function uninstallMcpTool(toolKey: string): Promise<boolean> {
  return request.delete(`/mcp/tools/${toolKey}/install`)
}
