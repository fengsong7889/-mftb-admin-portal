/**
 * 當前審批人解析工具
 * 
 * 根據流程配置中的審批節點配置，解析出當前待審批人。
 * 選擇邏輯：
 * 1. 從 localStorage 讀取流程配置，找到對應流程的當前節點
 * 2. 根據節點的 approverConfig 解析候選審批人
 * 3. 如果人員過多（≥3人），優先獲取部門負責人展示
 * 4. 如果都是同一個部門的人，優先獲取 M 管理職級的
 * 5. 如果都是管理則隨機一個，如果都不是管理也隨機一個
 */

import type { WorkflowDefinition, WorkflowNode } from '../pages/WorkflowConfig/types'
import { WORKFLOW_STORAGE_KEY, getApproverSettingForBrand } from '../pages/WorkflowConfig/types'
import type { EmployeeItem } from '../api/employee'
import type { DepartmentItem } from '../api/department'
import type { RoleItem } from '../api/role'

/** 角色編碼 → 角色名稱映射（與 WorkflowConfig/options.ts 一致） */
const ROLE_CODE_LABELS: Record<string, string> = {
  FIN_BIZ_APPROVER: '業務主管',
  FIN_OPS_APPROVER: '運營主管',
  FIN_FIN_APPROVER: '財務主管',
}

/**
 * 從 localStorage 讀取流程配置並找到匹配的流程
 */
function findWorkflow(workflowKey: string): WorkflowDefinition | null {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (!raw) return null
    const workflows: WorkflowDefinition[] = JSON.parse(raw)
    return workflows.find(wf => wf.workflowKey === workflowKey || wf.approvalType === workflowKey) ?? null
  } catch {
    return null
  }
}

/**
 * 根據節點名稱找到對應的節點
 */
function findNodeByName(nodes: WorkflowNode[], nodeName: string): WorkflowNode | null {
  const exact = nodes.find(n => n.name === nodeName)
  if (exact) return exact
  return nodes.find(n => nodeName.includes(n.name) || n.name.includes(nodeName)) ?? null
}

/**
 * 判斷是否為 M 管理職級
 */
function isManagementLevel(jobLevel?: string): boolean {
  if (!jobLevel) return false
  return jobLevel.toUpperCase().startsWith('M')
}

/**
 * 隨機選擇一個元素
 */
function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 根據候選員工列表應用選擇邏輯
 */
function selectApproverFromCandidates(
  candidates: EmployeeItem[],
  departments: DepartmentItem[],
): string | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) {
    const c = candidates[0]
    return `${c.name}(${c.empId})`
  }

  let pool = [...candidates]

  // 規則1：如果人員過多（≥3人），優先獲取部門負責人
  if (pool.length >= 3) {
    const deptLeaderNames = new Set<string>()
    for (const dept of departments) {
      if (dept.leader) {
        const namePart = dept.leader.split('(')[0].trim()
        deptLeaderNames.add(namePart)
      }
    }
    const leaders = pool.filter(c => deptLeaderNames.has(c.name))
    if (leaders.length > 0) {
      pool = leaders
    }
  }

  // 規則2：如果都是同一個部門的人，優先獲取 M 管理職級的
  const deptIds = new Set(pool.map(c => c.departmentId).filter(Boolean))
  if (deptIds.size === 1) {
    const managers = pool.filter(c => isManagementLevel(c.jobLevel))
    if (managers.length > 0) {
      pool = managers
    }
  }

  // 規則3：隨機選擇一個
  const selected = pickRandom(pool)
  if (!selected) return null
  return `${selected.name}(${selected.empId})`
}

/**
 * 解析當前節點的候選審批人列表（不應用選擇邏輯，返回全部可審人員）
 * 
 * @param workflowKey - 流程標識（如 'ai_access'）
 * @param currentNodeName - 當前節點名稱
 * @param employees - 所有啟用員工列表
 * @param departments - 所有部門列表
 * @param roles - 所有角色列表
 * @param brand - 所屬品牌（可選）
 * @returns 候選審批人員工列表，無則返回空數組
 */
export function resolveCurrentApproverCandidates(
  workflowKey: string,
  currentNodeName: string,
  employees: EmployeeItem[],
  departments: DepartmentItem[],
  roles: RoleItem[],
  brand?: string,
): EmployeeItem[] {
  // 1. 找到流程配置
  const workflow = findWorkflow(workflowKey)
  if (!workflow || !workflow.nodes || workflow.nodes.length === 0) {
    return []
  }

  // 2. 找到當前節點（處理 i18n key）
  let actualNodeName = currentNodeName
  if (currentNodeName.startsWith('oaRequests.')) {
    if (currentNodeName.includes('BizApprover')) actualNodeName = '業務主管審批'
    else if (currentNodeName.includes('OpsApprover')) actualNodeName = '運營主管審批'
    else if (currentNodeName.includes('FinApprover')) actualNodeName = '財務主管審批'
  }
  
  const node = findNodeByName(workflow.nodes, actualNodeName)
  if (!node) return []

  // 3. 獲取該節點的審批人配置
  const setting = getApproverSettingForBrand(node, brand)
  const { approverType, approverIds } = setting

  // 4. 根據審批人類型解析候選人
  switch (approverType) {
    case 'person':
      return employees.filter(e => approverIds.includes(e.empId))
    
    case 'role': {
      // 建立 roleCode → roleId 映射
      const roleCodeToIdMap = new Map<string, number>()
      for (const role of roles) {
        const roleCode = (role as unknown as Record<string, unknown>).code as string | undefined
        if (roleCode) {
          roleCodeToIdMap.set(roleCode, role.id)
        } else {
          // 回退：用角色名稱匹配
          for (const [code, label] of Object.entries(ROLE_CODE_LABELS)) {
            if (role.name.includes(label) || label.includes(role.name)) {
              roleCodeToIdMap.set(code, role.id)
            }
          }
        }
      }
      
      const targetRoleIds = new Set<number>()
      for (const code of approverIds) {
        const roleId = roleCodeToIdMap.get(code)
        if (roleId !== undefined) targetRoleIds.add(roleId)
      }
      
      if (targetRoleIds.size === 0) return []
      return employees.filter(e =>
        e.functionRoleIds && e.functionRoleIds.some(id => targetRoleIds.has(id))
      )
    }
    
    case 'department_leader': {
      const leaderNames = new Set<string>()
      for (const deptId of approverIds) {
        const dept = departments.find(d => String(d.id) === deptId || d.code === deptId)
        if (dept?.leader) {
          const namePart = dept.leader.split('(')[0].trim()
          leaderNames.add(namePart)
        }
      }
      if (leaderNames.size === 0) return []
      return employees.filter(e => leaderNames.has(e.name))
    }
    
    default:
      // initiator_leader 需要知道發起人，列表頁無法確定
      return []
  }
}

/** 審批人解析結果：單一推薦人 + 全部候選人 */
export interface ApproverResolution {
  /** 單一推薦審批人顯示名（選擇邏輯結果），如 '朱元璋(001)' */
  selected: string | null
  /** 全部候選審批人 */
  candidates: EmployeeItem[]
}

/**
 * 解析當前審批人（推薦人 + 全部候選人）
 */
export function resolveCurrentApprovers(
  workflowKey: string,
  currentNodeName: string,
  employees: EmployeeItem[],
  departments: DepartmentItem[],
  roles: RoleItem[],
  brand?: string,
): ApproverResolution {
  const candidates = resolveCurrentApproverCandidates(
    workflowKey, currentNodeName, employees, departments, roles, brand,
  )
  return {
    selected: selectApproverFromCandidates(candidates, departments),
    candidates,
  }
}

/**
 * 解析當前審批人（僅返回推薦人顯示名）
 * 
 * @param workflowKey - 流程標識（如 'ai_access'）
 * @param currentNodeName - 當前節點名稱
 * @param employees - 所有啟用員工列表
 * @param departments - 所有部門列表
 * @param roles - 所有角色列表
 * @param brand - 所屬品牌（可選）
 * @returns 審批人顯示文本，如 '朱元璋(001)'，無則返回 null
 */
export function resolveCurrentApprover(
  workflowKey: string,
  currentNodeName: string,
  employees: EmployeeItem[],
  departments: DepartmentItem[],
  roles: RoleItem[],
  brand?: string,
): string | null {
  const { selected } = resolveCurrentApprovers(
    workflowKey, currentNodeName, employees, departments, roles, brand,
  )
  return selected
}
