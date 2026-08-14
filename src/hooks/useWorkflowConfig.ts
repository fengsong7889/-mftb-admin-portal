/**
 * 審批流程配置 Hook
 *
 * 提供流程定義的 CRUD、啟用/停用、持久化能力。
 * 存儲後端：localStorage（後續可替換為後端 API）。
 */
import { useState, useCallback } from 'react'
import { DEFAULT_WORKFLOWS } from '../constants/defaultWorkflows'
import { WORKFLOW_STORAGE_KEY, createDefaultApproverConfig } from '../pages/WorkflowConfig/types'
import type { WorkflowDefinition, WorkflowNode, RoutingRule } from '../pages/WorkflowConfig/types'
import { updateApprovalEnabled } from '../api/workflowConfig'

/* ==================== 工具函數 ==================== */

/** 從 localStorage 加載流程配置（含數據遷移） */
function loadWorkflows(): WorkflowDefinition[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (raw) {
      const data: WorkflowDefinition[] = JSON.parse(raw)
      let migrated = false
      for (const wf of data) {
        // 遷移 1：舊版節點字段 → approverConfig
        for (const node of wf.nodes) {
          if (!node.approverConfig && node.approverType) {
            node.approverConfig = createDefaultApproverConfig(
              node.approverType,
              node.approverIds || [],
              node.approvalRule || 'any',
            )
            delete node.approverType
            delete node.approverIds
            delete node.approvalRule
            delete node.condition
            migrated = true
          }
          // 確保 approverConfig 結構完整
          if (node.approverConfig && !node.approverConfig.default) {
            // 舊版數據結構不完整，重建為默認配置
            node.approverConfig = createDefaultApproverConfig('role', [], 'any')
            migrated = true
          }
        }
        // 遷移 2：添加 routingRules（若缺失）
        if (!wf.routingRules || wf.routingRules.length === 0) {
          wf.routingRules = [{
            id: `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: '默認規則',
            conditions: [],
            activatedNodeIds: wf.nodes.map(n => n.id),
            priority: 999,
          }]
          migrated = true
        }
      }
      if (migrated) persistWorkflows(data)
      return data
    }
  } catch { /* ignore */ }
  return []
}

/** 持久化流程配置到 localStorage */
function persistWorkflows(workflows: WorkflowDefinition[]) {
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflows))
}

/** 初始化：若 localStorage 無數據則寫入預置默認流程 */
function initWorkflows(): WorkflowDefinition[] {
  const saved = loadWorkflows()
  if (saved.length > 0) return saved
  persistWorkflows(DEFAULT_WORKFLOWS)
  return DEFAULT_WORKFLOWS
}

/* ==================== Hook ==================== */

export function useWorkflowConfig() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(initWorkflows)

  /** 新增流程 */
  const addWorkflow = useCallback((wf: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newWf: WorkflowDefinition = {
      ...wf,
      id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      updatedBy: '系統',
    }
    setWorkflows(prev => {
      const next = [...prev, newWf]
      persistWorkflows(next)
      return next
    })
    return newWf.id
  }, [])

  /** 更新流程 */
  const updateWorkflow = useCallback((id: string, patch: Partial<WorkflowDefinition>) => {
    setWorkflows(prev => {
      const next = prev.map(wf =>
        wf.id === id ? { ...wf, ...patch, updatedAt: new Date().toISOString(), updatedBy: '系統' } : wf
      )
      persistWorkflows(next)
      return next
    })
  }, [])

  /** 刪除流程 */
  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => {
      const next = prev.filter(wf => wf.id !== id)
      persistWorkflows(next)
      return next
    })
  }, [])

  /** 切換啟用/停用（同步更新 localStorage + 後端數據庫） */
  const toggleEnabled = useCallback(async (id: string) => {
    let newEnabled = false
    let flowType = ''
    setWorkflows(prev => {
      const next = prev.map(wf => {
        if (wf.id === id) {
          newEnabled = !wf.enabled
          flowType = wf.workflowKey || wf.approvalType
          return { ...wf, enabled: newEnabled, updatedAt: new Date().toISOString(), updatedBy: '系統' }
        }
        return wf
      })
      persistWorkflows(next)
      return next
    })
    // 同步到後端數據庫，後端不可用時靜默降級（僅 localStorage 生效）
    if (flowType) {
      try {
        await updateApprovalEnabled(flowType, newEnabled)
      } catch (err) {
        console.warn('[workflowConfig] 後端同步失敗，僅本地生效:', err)
      }
    }
  }, [])

  /** 按 ID 查找流程 */
  const getWorkflow = useCallback((id: string): WorkflowDefinition | undefined => {
    return workflows.find(wf => wf.id === id)
  }, [workflows])

  /** 按 workflowKey 查找流程 */
  const getWorkflowByKey = useCallback((key: string): WorkflowDefinition | undefined => {
    return workflows.find(wf => wf.workflowKey === key)
  }, [workflows])

  /** 添加節點到流程 */
  const addNode = useCallback((workflowId: string, node: Omit<WorkflowNode, 'id'>) => {
    const newNode: WorkflowNode = {
      ...node,
      id: `nd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }
    setWorkflows(prev => {
      const next = prev.map(wf => {
        if (wf.id !== workflowId) return wf
        const nodes = [...wf.nodes, newNode].sort((a, b) => a.sortOrder - b.sortOrder)
        return { ...wf, nodes, updatedAt: new Date().toISOString(), updatedBy: '系統' }
      })
      persistWorkflows(next)
      return next
    })
    return newNode.id
  }, [])

  /** 更新節點 */
  const updateNode = useCallback((workflowId: string, nodeId: string, patch: Partial<WorkflowNode>) => {
    setWorkflows(prev => {
      const next = prev.map(wf => {
        if (wf.id !== workflowId) return wf
        const nodes = wf.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n)
        return { ...wf, nodes, updatedAt: new Date().toISOString(), updatedBy: '系統' }
      })
      persistWorkflows(next)
      return next
    })
  }, [])

  /** 刪除節點 */
  const removeNode = useCallback((workflowId: string, nodeId: string) => {
    setWorkflows(prev => {
      const next = prev.map(wf => {
        if (wf.id !== workflowId) return wf
        const nodes = wf.nodes.filter(n => n.id !== nodeId)
        return { ...wf, nodes, updatedAt: new Date().toISOString(), updatedBy: '系統' }
      })
      persistWorkflows(next)
      return next
    })
  }, [])

  /** 重置為預設流程 */
  const resetToDefaults = useCallback(() => {
    setWorkflows(DEFAULT_WORKFLOWS)
    persistWorkflows(DEFAULT_WORKFLOWS)
  }, [])

  return {
    workflows,
    addWorkflow,
    updateWorkflow,
    deleteWorkflow,
    toggleEnabled,
    getWorkflow,
    getWorkflowByKey,
    addNode,
    updateNode,
    removeNode,
    resetToDefaults,
  }
}
