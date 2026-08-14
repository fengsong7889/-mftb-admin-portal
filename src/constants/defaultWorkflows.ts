/**
 * 預置默認審批流程定義
 *
 * 系統初始化時為現有 5 種審批類型提供與當前硬編碼邏輯一致的默認流程。
 */
import type { WorkflowDefinition, RoutingRule } from '../pages/WorkflowConfig/types'
import { createDefaultApproverConfig } from '../pages/WorkflowConfig/types'

/** 生成唯一 ID */
const uid = () => `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const nid = () => `nd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const rid = () => `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/** 業務主管審批節點（模板） */
const bizNode = (sortOrder: number) => ({
  id: nid(),
  name: '業務主管審批',
  sortOrder,
  approverConfig: createDefaultApproverConfig('role', ['FIN_BIZ_APPROVER'], 'any'),
  ccUserIds: [],
  timeoutHours: null,
})

/** 運營主管審批節點（模板） */
const opsNode = (sortOrder: number) => ({
  id: nid(),
  name: '運營主管審批',
  sortOrder,
  approverConfig: createDefaultApproverConfig('role', ['FIN_OPS_APPROVER'], 'any'),
  ccUserIds: [],
  timeoutHours: null,
})

/** 財務主管審批節點（模板） */
const finNode = (sortOrder: number) => ({
  id: nid(),
  name: '財務主管審批',
  sortOrder,
  approverConfig: createDefaultApproverConfig('role', ['FIN_FIN_APPROVER'], 'any'),
  ccUserIds: [],
  timeoutHours: null,
})

/** 創建默認路由規則：全部節點激活（無條件） */
const defaultRoutingRule = (nodeIds: string[]): RoutingRule[] => [
  {
    id: rid(),
    name: '默認規則',
    conditions: [],
    activatedNodeIds: nodeIds,
    priority: 999,
  },
]

const now = new Date().toISOString()

/** 5 種預置默認流程 */
const rawDefaults: WorkflowDefinition[] = [
  {
    id: uid(),
    workflowKey: 'recharge',
    name: '充值審批',
    approvalType: 'recharge',
    description: '推廣金充值審批流程，含業務主管、運營主管、財務主管三級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2), finNode(3)],
    routingRules: defaultRoutingRule([
      // 默認激活全部 3 個節點，實際 ID 在初始化時動態生成
      // 此處用佔位，initWorkflows 時會自動填充正確的 node ID
    ]),
    rejectBehavior: 'restart',
    timeoutHours: 48,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
  {
    id: uid(),
    workflowKey: 'transfer',
    name: '轉賬審批',
    approvalType: 'transfer',
    description: '推廣金轉賬審批流程，含業務主管、運營主管、財務主管三級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2), finNode(3)],
    routingRules: [],
    rejectBehavior: 'restart',
    timeoutHours: 48,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
  {
    id: uid(),
    workflowKey: 'deduct',
    name: '扣款審批',
    approvalType: 'deduct',
    description: '推廣金扣款審批流程，含業務主管、運營主管、財務主管三級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2), finNode(3)],
    routingRules: [],
    rejectBehavior: 'restart',
    timeoutHours: 48,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
  {
    id: uid(),
    workflowKey: 'merge',
    name: '合併審批',
    approvalType: 'merge',
    description: '商戶合併審批流程，含業務主管、運營主管、財務主管三級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2), finNode(3)],
    routingRules: [],
    rejectBehavior: 'restart',
    timeoutHours: 48,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
  {
    id: uid(),
    workflowKey: 'gift',
    name: '贈送審批',
    approvalType: 'gift',
    description: '贈送審批流程，含業務主管、運營主管二級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2)],
    routingRules: [],
    rejectBehavior: 'restart',
    timeoutHours: 24,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
].map((wf) => {
  const w = wf as WorkflowDefinition
  // 自動填充路由規則：若為空則生成一條默認規則激活全部節點
  if (w.routingRules.length === 0) {
    w.routingRules = [{
      id: rid(),
      name: '默認規則',
      conditions: [],
      activatedNodeIds: w.nodes.map((n) => n.id),
      priority: 999,
    }]
  } else {
    w.routingRules = w.routingRules.map((r) => ({
      ...r,
      activatedNodeIds: r.activatedNodeIds.length > 0 ? r.activatedNodeIds : w.nodes.map((n) => n.id),
    }))
  }
  return w
})

export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = rawDefaults
