/**
 * 預置默認審批流程定義
 *
 * 系統初始化時為現有 5 種審批類型提供與當前硬編碼邏輯一致的默認流程。
 */
import type { WorkflowDefinition } from '../pages/WorkflowConfig/types'

/** 生成唯一 ID */
const uid = () => `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const nid = () => `nd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/** 業務主管審批節點（模板） */
const bizNode = (sortOrder: number) => ({
  id: nid(),
  name: '業務主管審批',
  sortOrder,
  approverType: 'role' as const,
  approverIds: ['FIN_BIZ_APPROVER'],
  approvalRule: 'any' as const,
  condition: [],
  ccUserIds: [],
  timeoutHours: null,
})

/** 運營主管審批節點（模板） */
const opsNode = (sortOrder: number) => ({
  id: nid(),
  name: '運營主管審批',
  sortOrder,
  approverType: 'role' as const,
  approverIds: ['FIN_OPS_APPROVER'],
  approvalRule: 'any' as const,
  condition: [],
  ccUserIds: [],
  timeoutHours: null,
})

/** 財務主管審批節點（模板） */
const finNode = (sortOrder: number) => ({
  id: nid(),
  name: '財務主管審批',
  sortOrder,
  approverType: 'role' as const,
  approverIds: ['FIN_FIN_APPROVER'],
  approvalRule: 'any' as const,
  condition: [],
  ccUserIds: [],
  timeoutHours: null,
})

const now = new Date().toISOString()

/** 5 種預置默認流程 */
export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: uid(),
    workflowKey: 'recharge',
    name: '充值審批',
    approvalType: 'recharge',
    description: '推廣金充值審批流程，含業務主管、運營主管、財務主管三級審批',
    enabled: true,
    nodes: [bizNode(1), opsNode(2), finNode(3)],
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
    rejectBehavior: 'restart',
    timeoutHours: 24,
    createdAt: now,
    updatedAt: now,
    updatedBy: '系統',
  },
]
