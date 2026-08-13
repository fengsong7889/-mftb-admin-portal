/**
 * 審批流程配置 — 類型定義
 *
 * 支持可配置的審批節點、條件分支路由、靈活審批人分配。
 */

/** 條件分支運算符 */
export type ConditionOperator = 'gt' | 'lt' | 'eq' | 'neq' | 'gte' | 'lte' | 'in'

/** 條件分支 */
export interface NodeCondition {
  /** 條件字段：amount / brand / businessChannel */
  field: string
  /** 比較運算符 */
  operator: ConditionOperator
  /** 條件值 */
  value: number | string | string[]
}

/** 審批人分配類型 */
export type ApproverType = 'person' | 'role' | 'department_leader' | 'initiator_leader'

/** 審批規則 */
export type ApprovalRule = 'any' | 'all'

/** 駁回策略 */
export type RejectBehavior = 'restart' | 'previous'

/** 審批節點 */
export interface WorkflowNode {
  id: string
  /** 節點名稱，如 '業務主管審批' */
  name: string
  /** 順序（從 1 開始） */
  sortOrder: number
  /** 審批人分配類型 */
  approverType: ApproverType
  /** 具體人員 ID 或角色編碼 */
  approverIds: string[]
  /** 審批規則：單人通過 / 會簽 */
  approvalRule: ApprovalRule
  /** 條件配置，空數組 = 始終激活 */
  condition: NodeCondition[]
  /** 抄送人員 ID 列表 */
  ccUserIds: string[]
  /** 節點級超時（小時），null = 不超時 */
  timeoutHours: number | null
}

/** 審批流程定義 */
export interface WorkflowDefinition {
  id: string
  /** 唯一標識，如 'recharge', 'gift' */
  workflowKey: string
  /** 顯示名稱，如 '充值審批' */
  name: string
  /** 關聯業務類型 */
  approvalType: string
  /** 描述 */
  description: string
  /** 是否啟用 */
  enabled: boolean
  /** 審批節點列表 */
  nodes: WorkflowNode[]
  /** 駁回策略 */
  rejectBehavior: RejectBehavior
  /** 全局超時提醒（小時） */
  timeoutHours: number | null
  /** 創建時間 */
  createdAt: string
  /** 更新時間 */
  updatedAt: string
  /** 最後更新人 */
  updatedBy?: string
}

/* ==================== 常量 ==================== */

/** 審批人類型標籤 */
export const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  person: '指定人員',
  role: '指定角色',
  department_leader: '部門主管',
  initiator_leader: '發起人主管',
}

/** 審批規則標籤 */
export const APPROVAL_RULE_LABELS: Record<ApprovalRule, string> = {
  any: '單人通過（任一人審批即可）',
  all: '會簽（全部審批人通過）',
}

/** 駁回策略標籤 */
export const REJECT_BEHAVIOR_LABELS: Record<RejectBehavior, string> = {
  restart: '駁回到發起人（流程終止）',
  previous: '駁回到上一節點',
}

/** 條件運算符標籤 */
export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  gt: '＞',
  lt: '＜',
  eq: '＝',
  neq: '≠',
  gte: '≥',
  lte: '≤',
  in: '包含',
}

/** 金額字段可用的運算符 */
export const AMOUNT_OPERATOR_OPTIONS: { label: string; value: ConditionOperator }[] = [
  { label: '＞', value: 'gt' },
  { label: '＜', value: 'lt' },
  { label: '＝', value: 'eq' },
  { label: '≥', value: 'gte' },
  { label: '≤', value: 'lte' },
]

/** 所屬品牌選項 */
export const CONDITION_BRAND_OPTIONS = [
  { label: '閃蜂', value: '1' },
  { label: 'mFood', value: '2' },
]

/** 業務頻道選項 */
export const CONDITION_CHANNEL_OPTIONS = [
  { label: '美食外賣', value: '1' },
  { label: '超市百貨', value: '2' },
  { label: '團購到店', value: '3' },
]

/** 可作為條件的字段列表（通用） */
export const CONDITION_FIELD_OPTIONS = [
  { label: '審批金額', value: 'amount' },
  { label: '所屬品牌', value: 'brand' },
  { label: '業務頻道', value: 'businessChannel' },
]

/** 贈送流程的條件字段 */
export const GIFT_CONDITION_FIELD_OPTIONS = [
  { label: '廣告類型', value: 'adType' },
  { label: '贈送天數', value: 'giftDays' },
  { label: '所屬品牌', value: 'brand' },
  { label: '業務頻道', value: 'businessChannel' },
]

/** 廣告類型選項（推廣贈送菜單可贈送的廣告類型） */
export const CONDITION_AD_TYPE_OPTIONS = [
  { label: '新店廣告', value: 'newStore' },
  { label: '盤活復蘇', value: 'revive' },
  { label: '人氣商家', value: 'popular' },
]

/** 金額/天數字段按流程類型的顯示名稱 */
const AMOUNT_LABEL_MAP: Record<string, string> = {
  recharge: '虛擬賬戶充值金額',
  deduct: '扣款金額',
  transfer: '轉賬金額',
  merge: '合併金額',
}

/** 根據流程類型返回動態的條件字段選項 */
export function getConditionFieldOptions(workflowType?: string) {
  if (workflowType === 'gift') return GIFT_CONDITION_FIELD_OPTIONS
  const amountLabel = (workflowType && AMOUNT_LABEL_MAP[workflowType]) || '審批金額'
  return CONDITION_FIELD_OPTIONS.map(o => o.value === 'amount' ? { ...o, label: amountLabel } : o)
}

/** 根據流程類型返回金額字段的顯示名稱 */
export function getAmountFieldLabel(workflowType?: string): string {
  if (workflowType === 'gift') return '贈送天數'
  return (workflowType && AMOUNT_LABEL_MAP[workflowType]) || '審批金額'
}

/** 關聯業務類型選項 */
export const APPROVAL_TYPE_OPTIONS = [
  { label: '充值', value: 'recharge' },
  { label: '轉賬', value: 'transfer' },
  { label: '扣款', value: 'deduct' },
  { label: '合併', value: 'merge' },
  { label: '贈送', value: 'gift' },
]

/** localStorage 存儲 key */
export const WORKFLOW_STORAGE_KEY = 'mftb_workflow_config'
