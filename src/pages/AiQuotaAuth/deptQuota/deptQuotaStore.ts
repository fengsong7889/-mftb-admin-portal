/**
 * 部門額度 — 數據模型 / 展示常量 / localStorage 持久化
 *
 * 設計依據市面主流 LLM 用量配額方案（LiteLLM Budget、火山引擎 TRAE 用量管理、
 * Google BigQuery Token 配額、金山云配額管理）抽象，核心要素：
 *   1. 限額周期（budget_duration）：按日 / 按月重置；
 *   2. 限額類型：Token 數 / 費用金額 / 請求次數；
 *   3. 額度分配（allocateMode）：部門共享總額 vs 人均獨立額度（對標 TRAE 企業整體限額 / 人均限額）；
 *   4. 軟限額提醒（soft_budget）：達到閾值僅通知不阻斷，默認 80%；
 *   5. 超額動作：拒絕請求 / 進入審批（臨時提額）/ 自動降級到更便宜模型；
 *   6. 實時用量：本期已用 / 限額，列表與詳情以進度條直觀呈現（用量看板）。
 *
 * 一期純前端演示：localStorage 持久化，與員工按職位授權（empAuth/modelAuthCapability.ts）一致；
 * 二期由後端統一網關提供真實接口替換。
 */
import type { DeptOption } from '../../../api'

/* ────────────────── 枚舉類型 ────────────────── */

/** 限額周期 */
export type QuotaPeriod = 'daily' | 'monthly'
/** 限額類型 */
export type QuotaType = 'token' | 'cost' | 'request'
/** 超額動作 */
export type OverLimitAction = 'reject' | 'approve' | 'downgrade'
/** 額度分配方式：部門共享總額 / 人均獨立額度 */
export type AllocateMode = 'total' | 'per_capita'
/** 計價幣種 */
export type Currency = 'CNY' | 'USD'

/* ────────────────── 展示常量 ────────────────── */

export const QUOTA_PERIOD_LABEL: Record<QuotaPeriod, string> = {
  daily: '按日',
  monthly: '按月',
}

export const QUOTA_TYPE_LABEL: Record<QuotaType, string> = {
  token: 'Token 數',
  cost: '費用金額',
  request: '請求次數',
}

export const QUOTA_TYPE_UNIT: Record<QuotaType, string> = {
  token: 'tokens',
  cost: '',
  request: '次',
}

export const OVER_LIMIT_ACTION_LABEL: Record<OverLimitAction, string> = {
  reject: '拒絕請求',
  approve: '進入審批',
  downgrade: '自動降級',
}

/** 超額動作 Tag 顏色（遵循狀態標識規範：危險紅 / 系統紫 / 信息藍） */
export const OVER_LIMIT_TAG: Record<OverLimitAction, string> = {
  reject: 'error',
  approve: 'purple',
  downgrade: 'processing',
}

export const ALLOCATE_MODE_LABEL: Record<AllocateMode, string> = {
  total: '部門共享總額',
  per_capita: '人均獨立額度',
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' }

export const CURRENCY_OPTIONS: Array<{ value: Currency; label: string }> = [
  { value: 'CNY', label: 'CNY（人民幣）' },
  { value: 'USD', label: 'USD（美元）' },
]

/* ────────────────── 數據結構 ────────────────── */

/** 部門額度策略 */
export interface DeptQuotaPolicy {
  id: string
  /** 策略名稱 */
  name: string
  /** 策略描述（選填） */
  description?: string
  /** 關聯部門 id 列表（用戶新建時由部門樹回填；種子數據可為空，靠 deptNames 匹配） */
  deptIds: number[]
  /** 關聯部門名稱列表（展示用，由 deptOptions 解析或種子內置） */
  deptNames: string[]
  /** 覆蓋總人數（由 deptOptions 解析或種子內置） */
  totalEmployeeCount: number
  /** 額度分配方式 */
  allocateMode: AllocateMode
  /** 限額周期 */
  period: QuotaPeriod
  /** 限額類型 */
  quotaType: QuotaType
  /** 限額值 */
  quotaValue: number
  /** 計價幣種（quotaType === 'cost' 時生效） */
  currency: Currency
  /** 軟限額提醒閾值（百分比，達到後通知員工與主管，不阻斷） */
  softThreshold: number
  /** 超額後動作 */
  overLimitAction: OverLimitAction
  /** 超額動作爲降級時的目標模型 id */
  downgradeModelId?: number | null
  /** 本期已用量（演示用量，用於列表 / 詳情進度條） */
  usedValue: number
  /** 狀態：1=啟用，0=停用 */
  status: number
  /** 創建時間 */
  createdAt: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/* ────────────────── 用量計算 ────────────────── */

/** 使用率（百分比，四捨五入到整數；限額為 0 時返回 0） */
export function usagePercent(policy: DeptQuotaPolicy): number {
  if (!policy.quotaValue) return 0
  return Math.round((policy.usedValue / policy.quotaValue) * 100)
}

/**
 * 用量進度條顏色：
 *   ≥100% 超額 → 紅；≥軟提醒閾值 → 橙；其餘 → 綠
 */
export function usageColor(policy: DeptQuotaPolicy): string {
  const pct = usagePercent(policy)
  if (pct >= 100) return '#FF4D4F'
  if (pct >= policy.softThreshold) return '#FAAD14'
  return '#52C41A'
}

/** 限額文案：費用帶幣種符號，其餘帶單位；統一附周期 */
export function quotaText(policy: DeptQuotaPolicy): string {
  const period = QUOTA_PERIOD_LABEL[policy.period]
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.quotaValue.toLocaleString()} / ${period}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.quotaValue.toLocaleString()} ${unit} / ${period}`.trim()
}

/** 已用量文案（與限額同口徑） */
export function usedText(policy: DeptQuotaPolicy): string {
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.usedValue.toLocaleString()}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.usedValue.toLocaleString()} ${unit}`.trim()
}

/* ────────────────── 部門樹構建（復用部門模型權控同構邏輯） ────────────────── */

/** 部門樹節點 */
export interface DeptTreeNode {
  value: number
  title: string
  deptCode: string
  deptName: string
  children?: DeptTreeNode[]
}

/** 由扁平部門列表構建樹（依據 parentId），標題含編碼便於區分重名部門 */
export function buildDeptTree(list: DeptOption[]): DeptTreeNode[] {
  const map = new Map<number, DeptTreeNode>()
  list.forEach((d) => {
    map.set(d.deptId, {
      value: d.deptId,
      title: `${d.deptName}（${d.deptCode ?? '-'}）`,
      deptCode: d.deptCode ?? '',
      deptName: d.deptName,
      children: [],
    })
  })
  const roots: DeptTreeNode[] = []
  list.forEach((d) => {
    const node = map.get(d.deptId)!
    const pid = d.parentId
    if (pid != null && map.has(pid)) map.get(pid)!.children!.push(node)
    else roots.push(node)
  })
  const prune = (n: DeptTreeNode) => {
    if (!n.children || n.children.length === 0) delete n.children
    else n.children.forEach(prune)
  }
  roots.forEach(prune)
  return roots
}

/**
 * 依實時部門選項解析策略的部門引用：
 *   - deptIds 非空（用戶新建）：按 id 反查名稱與人數；
 *   - deptIds 為空（種子數據）：按名稱匹配真實部門回填 id / 人數，未匹配則保留種子內置值。
 * 保證後端可用與不可用兩種場景下列表都能正常展示。
 */
export function resolveDeptRefs(policy: DeptQuotaPolicy, deptOptions: DeptOption[]): DeptQuotaPolicy {
  if (policy.deptIds.length > 0) {
    const matched = deptOptions.filter((d) => policy.deptIds.includes(d.deptId))
    return {
      ...policy,
      deptNames: matched.length ? matched.map((d) => d.deptName) : policy.deptNames,
      totalEmployeeCount: matched.length
        ? matched.reduce((s, d) => s + d.employeeCount, 0)
        : policy.totalEmployeeCount,
    }
  }
  // 種子數據：按名稱匹配真實部門
  const matched = deptOptions.filter((d) => policy.deptNames.includes(d.deptName))
  if (matched.length === 0) return policy
  return {
    ...policy,
    deptIds: matched.map((d) => d.deptId),
    totalEmployeeCount: matched.reduce((s, d) => s + d.employeeCount, 0),
  }
}

/* ────────────────── localStorage 持久化 ────────────────── */

export const DEPT_QUOTA_STORAGE_KEY = 'dept_quota_policies'

/** 種子數據（首次進入時寫入，覆蓋典型部門場景，含演示用量） */
const SEED_DEPT_QUOTAS: DeptQuotaPolicy[] = [
  {
    id: 'dq-seed-dev',
    name: '研發部月度 Token 總額',
    description: '研發場景高頻調用，按月共享大額度池，超額進入審批臨時提額',
    deptIds: [],
    deptNames: ['研發部'],
    totalEmployeeCount: 46,
    allocateMode: 'total',
    period: 'monthly',
    quotaType: 'token',
    quotaValue: 200000000,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'approve',
    downgradeModelId: null,
    usedValue: 128000000,
    status: 1,
    createdAt: '2026-08-10 09:30:00',
    updatedBy: 'chenwei',
    updatedAt: '2026-09-01 14:20:00',
  },
  {
    id: 'dq-seed-cs',
    name: '客服部日請求次數',
    description: '客服高併發但單次消耗低，按日限制請求次數，超額直接拒絕',
    deptIds: [],
    deptNames: ['客服部'],
    totalEmployeeCount: 128,
    allocateMode: 'total',
    period: 'daily',
    quotaType: 'request',
    quotaValue: 5000,
    currency: 'CNY',
    softThreshold: 90,
    overLimitAction: 'reject',
    downgradeModelId: null,
    usedValue: 4600,
    status: 1,
    createdAt: '2026-08-12 11:00:00',
    updatedBy: 'liuyang',
    updatedAt: '2026-08-28 16:45:00',
  },
  {
    id: 'dq-seed-ops',
    name: '運營市場月度費用預算',
    description: '運營 + 市場共用月度費用預算，人均獨立額度，防止個別員工超支',
    deptIds: [],
    deptNames: ['運營部', '市場部'],
    totalEmployeeCount: 84,
    allocateMode: 'per_capita',
    period: 'monthly',
    quotaType: 'cost',
    quotaValue: 600,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'approve',
    downgradeModelId: null,
    usedValue: 282,
    status: 1,
    createdAt: '2026-08-15 10:00:00',
    updatedBy: 'admin',
    updatedAt: '2026-09-02 09:10:00',
  },
  {
    id: 'dq-seed-fin',
    name: '財務部數據不出域限額',
    description: '財務敏感數據僅用私有化模型，超額自動降級到更輕量私有化模型',
    deptIds: [],
    deptNames: ['財務部'],
    totalEmployeeCount: 22,
    allocateMode: 'total',
    period: 'monthly',
    quotaType: 'cost',
    quotaValue: 20000,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'downgrade',
    downgradeModelId: null,
    usedValue: 20400,
    status: 1,
    createdAt: '2026-08-20 08:00:00',
    updatedBy: 'zhaomin',
    updatedAt: '2026-08-30 11:30:00',
  },
]

/** 讀取部門額度策略（首次進入時以種子數據初始化） */
export function loadDeptQuotas(): DeptQuotaPolicy[] {
  try {
    const raw = localStorage.getItem(DEPT_QUOTA_STORAGE_KEY)
    if (raw == null) {
      localStorage.setItem(DEPT_QUOTA_STORAGE_KEY, JSON.stringify(SEED_DEPT_QUOTAS))
      return SEED_DEPT_QUOTAS.map((p) => ({ ...p }))
    }
    const parsed = JSON.parse(raw) as DeptQuotaPolicy[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return SEED_DEPT_QUOTAS.map((p) => ({ ...p }))
  }
}

/** 寫入部門額度策略 */
export function saveDeptQuotas(policies: DeptQuotaPolicy[]): void {
  localStorage.setItem(DEPT_QUOTA_STORAGE_KEY, JSON.stringify(policies))
}

/** 依 id 讀取單條策略（供詳情 / 編輯頁回填；返回前按 deptOptions 解析部門引用） */
export function getDeptQuotaById(id: string, deptOptions: DeptOption[]): DeptQuotaPolicy | null {
  const found = loadDeptQuotas().find((p) => p.id === id)
  return found ? resolveDeptRefs(found, deptOptions) : null
}
