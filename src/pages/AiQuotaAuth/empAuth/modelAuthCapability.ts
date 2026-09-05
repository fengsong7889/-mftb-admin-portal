import type { AiModel } from '../../../api'

/**
 * 员工模型权控 - 模型能力顆粒度授權共享模塊
 * 與部門模型權控（DeptAuthGroupEdit / DeptAuthGroupDetail）的能力配置對齊：
 * 授權細化到模型能力維度（視覺理解 / 工具調用 / JSON 模式 / 流式響應 / 思考模式）
 */

/* ────────────────── 能力常量 ────────────────── */

/** 能力字段（與 AiModel / ModelAuthState 的能力鍵一致） */
export type CapabilityKey = 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'

export const CAPABILITY_FIELDS: { key: CapabilityKey; label: string; color: string; tip: string }[] = [
  { key: 'visionSupport', label: '視覺理解', color: '#722ED1', tip: '模型可理解圖片內容' },
  { key: 'functionCalling', label: '工具調用', color: '#1890FF', tip: '模型可調用外部工具/API' },
  { key: 'jsonMode', label: 'JSON 模式', color: '#13C2C2', tip: '模型可輸出結構化 JSON' },
  { key: 'streaming', label: '流式響應', color: '#52C41A', tip: '模型支持逐字輸出' },
  { key: 'thinkingMode', label: '思考模式', color: '#E8720C', tip: '模型支持深度推理' },
]

/** 詳情頁緊湊標籤（與 DeptAuthGroupDetail 一致） */
export const CAPABILITY_SHORT_FIELDS: { key: CapabilityKey; label: string; color: string }[] = [
  { key: 'visionSupport', label: '視覺', color: '#722ED1' },
  { key: 'functionCalling', label: '工具', color: '#1890FF' },
  { key: 'jsonMode', label: 'JSON', color: '#13C2C2' },
  { key: 'streaming', label: '流式', color: '#52C41A' },
  { key: 'thinkingMode', label: '思考', color: '#E8720C' },
]

export const MODEL_TYPE_TAG: Record<string, string> = {
  chat: 'processing', completion: 'blue', embedding: 'purple', token_count: 'default',
}
export const MODEL_TYPE_LABEL: Record<string, string> = {
  chat: '對話', completion: '文本生成', embedding: '向量嵌入', token_count: 'Token 計數',
}

/** 判断模型本身是否支持某能力 */
export const modelSupports = (model: AiModel, key: CapabilityKey): boolean => (model[key] ?? 0) === 1

/* ────────────────── 授權數據結構 ────────────────── */

/** 模型授權配置項（含能力開關，與部門模型權控 ModelConfigItem 同構） */
export interface ModelAuthConfig {
  modelId: number
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
}

/** 职位授权规则：一条规则 = 职级序列 + 职级 + 授权模型（能力顆粒度）的批量授权策略 */
export interface PosAuthRule {
  id: string
  /** 配置ID（编号生成规则 ai_emp_pos_model_auth） */
  configCode?: string
  ruleName: string
  sequence: string[]
  jobLevels: string[]
  modelConfigs: ModelAuthConfig[]
  /** 數據不出域（1=開啟，0=關閉） */
  dataResidency: number
  description?: string
  status: number
  createdAt: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/** 角色授权配置：一个角色 = 绑定员工 + 授权模型（能力顆粒度）
 * 角色為自定義名稱，與權限系統角色無關
 */
export interface RoleAuthConfig {
  roleId: string  // 自定義角色 ID（格式：custom_role_xxx）
  /** 配置ID（编号生成规则 ai_emp_role_model_auth） */
  configCode?: string
  roleName: string  // 自定義角色名稱
  /** 角色描述（選填） */
  description?: string
  modelConfigs: ModelAuthConfig[]
  userIds: number[]  // 綁定員工 ID 列表
  /** 數據不出域（1=開啟，0=關閉） */
  dataResidency: number
  /** 啟用狀態（1=啟用，0=停用；停用後綁定員工立即失去該角色授予的模型訪問權） */
  status: number
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

/* ────────────────── localStorage 持久化（mock 階段） ────────────────── */

export const POS_RULE_STORAGE_KEY = 'pos_auth_strategies'
export const ROLE_AUTH_STORAGE_KEY = 'role_auth_configs'

/** 舊結構兼容：modelIds（純 id 列表）→ modelConfigs（能力默認關閉） */
type RawModelRef = number | string | { modelId?: number | string; id?: number | string }

const toModelId = (ref: RawModelRef): number | null => {
  const raw = typeof ref === 'object' ? (ref.modelId ?? ref.id) : ref
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 依模型本身能力上限收斂已保存的能力開關（模型不支持的能力強制為 0） */
export const clampModelConfigs = (configs: ModelAuthConfig[], models: AiModel[]): ModelAuthConfig[] =>
  configs.map((c) => {
    const m = models.find((x) => x.id === c.modelId)
    const cap = (key: CapabilityKey): number => (m && !modelSupports(m, key) ? 0 : c[key])
    return {
      modelId: c.modelId,
      visionSupport: cap('visionSupport'),
      functionCalling: cap('functionCalling'),
      jsonMode: cap('jsonMode'),
      streaming: cap('streaming'),
      thinkingMode: cap('thinkingMode'),
    }
  })

/** 讀取职位授权规则（兼容舊 modelIds 結構，自動遷移為 modelConfigs）
 *  僅用於 localStorage 歷史數據一次性遷移到後端（AiEmployeeAuthControl），新數據直接走 empAuth API */
export function loadPosRules(models: AiModel[]): PosAuthRule[] {
  type RawRule = {
    id?: string; ruleName?: string; description?: string; createdAt?: string
    sequence?: string | string[]; jobLevels?: string | string[]
    modelIds?: RawModelRef[]; modelConfigs?: ModelAuthConfig[]; status?: number
    dataResidency?: number
    updatedBy?: string; updatedAt?: string
  }
  const toArray = (v?: string | string[]): string[] => (Array.isArray(v) ? v : v ? [v] : [])
  try {
    const raw = JSON.parse(localStorage.getItem(POS_RULE_STORAGE_KEY) || '[]') as RawRule[]
    return raw.map((r, i) => {
      const configs: ModelAuthConfig[] = r.modelConfigs?.length
        ? r.modelConfigs
        : (r.modelIds ?? []).map(toModelId).filter((id): id is number => id !== null)
            .map((id) => ({ modelId: id, visionSupport: 0, functionCalling: 0, jsonMode: 0, streaming: 0, thinkingMode: 0 }))
      return {
        id: r.id ?? `rule_${i}_${Date.now()}`,
        ruleName: r.ruleName ?? `授权规则${i + 1}`,
        sequence: toArray(r.sequence),
        jobLevels: toArray(r.jobLevels),
        modelConfigs: clampModelConfigs(configs, models),
        dataResidency: r.dataResidency ?? 0,
        description: r.description ?? '',
        status: r.status ?? 1,
        createdAt: r.createdAt ?? new Date().toISOString(),
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      }
    })
  } catch {
    return []
  }
}

/** 讀取角色授权配置（自定義角色，roleId 為 string；兼容舊 number 結構並自動遷移）
 *  僅用於 localStorage 歷史數據一次性遷移到後端（AiEmployeeAuthControl），新數據直接走 empAuth API */
export function loadRoleAuthConfigs(models: AiModel[]): RoleAuthConfig[] {
  type RawConfig = {
    roleId?: number | string; roleName?: string; name?: string; description?: string
    modelIds?: RawModelRef[]; modelConfigs?: ModelAuthConfig[]
    dataResidency?: number; status?: number
    userIds?: number[]; createdAt?: string; updatedAt?: string; updatedBy?: string
  }
  try {
    const raw = JSON.parse(localStorage.getItem(ROLE_AUTH_STORAGE_KEY) || '[]') as RawConfig[]
    return raw
      .filter((c) => c.roleId != null)  // 保留所有有 roleId 的記錄
      .map((c) => {
        const configs: ModelAuthConfig[] = c.modelConfigs?.length
          ? c.modelConfigs
          : (c.modelIds ?? []).map(toModelId).filter((id): id is number => id !== null)
              .map((id) => ({ modelId: id, visionSupport: 0, functionCalling: 0, jsonMode: 0, streaming: 0, thinkingMode: 0 }))
        // 兼容舊 number roleId → 轉為 string
        const roleId = typeof c.roleId === 'number' ? `legacy_${c.roleId}` : String(c.roleId)
        return {
          roleId,
          roleName: c.roleName ?? c.name ?? '',
          description: c.description ?? '',
          modelConfigs: clampModelConfigs(configs, models),
          dataResidency: c.dataResidency ?? 0,
          status: c.status ?? 1,  // 舊數據無狀態字段，默認啟用
          userIds: c.userIds ?? [],
          createdAt: c.createdAt ?? new Date().toISOString(),
          updatedBy: c.updatedBy,
          updatedAt: c.updatedAt,
        }
      })
  } catch {
    return []
  }
}

/** 統計單個模型授權配置中已開啟的能力數 */
export const enabledCapabilityCount = (config: ModelAuthConfig): number =>
  CAPABILITY_FIELDS.filter(({ key }) => config[key] === 1).length
