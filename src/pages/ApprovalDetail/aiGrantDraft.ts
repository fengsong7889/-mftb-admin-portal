/**
 * AI 使用申請「審批授權草稿」工具
 *
 * 從組件文件抽離的純邏輯：草稿構造 / 提交校驗 / 後端審批即授權請求體組裝，
 * 供 AiApprovalActionPanel 與 ApprovalDetail 頁面複用。
 */
import type { AiModel } from '../../api/aiModel'

/** AI 審批授權請求體（與後端 OaRequestService.approve 的 formData 結構一致） */
export interface ApproveAiRequest {
  approvedModels: number[]
  approvedModelConfigs: Array<{
    modelId: number
    visionSupport: number
    functionCalling: number
    jsonMode: number
    streaming: number
    thinkingMode: number
    effectiveType: string
    expireAt: string | null
  }>
  approvedQuotaType: string
  approvedQuotaValue?: number
  approvedQuotaPeriod: string
  approvedOverLimitAction: string
  quotaEffectiveType: string
  quotaExpireAt?: string
  approveRemark?: string
}


/** 單個模型的能力開關組合 + 生效類型 */
export interface AiGrantModelConfig {
  visionSupport: boolean
  functionCalling: boolean
  jsonMode: boolean
  streaming: boolean
  thinkingMode: boolean
  /** 模型生效類型：permanent=永久 / temporary=臨時 */
  effectiveType: 'permanent' | 'temporary'
  /** 臨時模型到期時間（temporary 時必填） */
  expireAt: string | null
}

/** 審批授權草稿（業務節點本地保存，最終節點提交後端審批即授權） */
export interface AiGrantDraft {
  selectedModels: number[]
  modelConfigs: Record<number, AiGrantModelConfig>
  quotaType: 'requests' | 'tokens'
  quotaValue: number | null
  quotaPeriod: 'daily' | 'monthly'
  overLimitAction: 'reject' | 'approve' | 'downgrade'
  effectiveType: 'permanent' | 'temporary'
  expireAt: string | null
}

/** 模型能力（0/1）→ 草稿能力開關（默認按模型自身能力全開）+ 默認永久生效 */
export function modelToConfig(m: AiModel): AiGrantModelConfig {
  return {
    visionSupport: m.visionSupport === 1,
    functionCalling: m.functionCalling === 1,
    jsonMode: m.jsonMode === 1,
    streaming: m.streaming === 1,
    thinkingMode: m.thinkingMode === 1,
    effectiveType: 'permanent',
    expireAt: null,
  }
}

/** 空草稿 */
export function emptyGrantDraft(requestedModels?: number[] | null): AiGrantDraft {
  return {
    selectedModels: requestedModels?.length ? [...requestedModels] : [],
    modelConfigs: {},
    quotaType: 'requests',
    quotaValue: null,
    quotaPeriod: 'monthly',
    overLimitAction: 'reject',
    effectiveType: 'permanent',
    expireAt: null,
  }
}

/** 提交前校驗，返回錯誤提示（null = 通過） */
export function validateGrantDraft(
  draft: AiGrantDraft,
  requestType: string,
  t: (key: string) => string,
): string | null {
  const needModels = requestType !== 'quota_only'
  const needQuota = requestType !== 'model_only'
  if (needModels && draft.selectedModels.length === 0) return t('approvalDetail.aiGrantModelRequired')
  // 校驗每個模型的臨時生效到期時間
  if (needModels) {
    for (const modelId of draft.selectedModels) {
      const cfg = draft.modelConfigs[modelId]
      if (cfg && cfg.effectiveType === 'temporary' && !cfg.expireAt) {
        return t('approvalDetail.aiGrantModelExpireRequired')
      }
    }
  }
  if (needQuota && (!draft.quotaValue || draft.quotaValue <= 0)) return t('approvalDetail.aiGrantQuotaRequired')
  if (needQuota && draft.effectiveType === 'temporary' && !draft.expireAt) {
    return t('approvalDetail.aiGrantExpireRequired')
  }
  return null
}

/** 草稿 → 後端審批即授權請求體 */
export function buildApprovePayload(draft: AiGrantDraft, approveRemark: string): ApproveAiRequest {
  return {
    approvedModels: draft.selectedModels,
    approvedModelConfigs: draft.selectedModels.map((modelId) => {
      const cfg = draft.modelConfigs[modelId]
      return {
        modelId,
        visionSupport: cfg?.visionSupport ? 1 : 0,
        functionCalling: cfg?.functionCalling ? 1 : 0,
        jsonMode: cfg?.jsonMode ? 1 : 0,
        streaming: cfg?.streaming ? 1 : 0,
        thinkingMode: cfg?.thinkingMode ? 1 : 0,
        effectiveType: cfg?.effectiveType ?? 'permanent',
        expireAt: cfg?.effectiveType === 'temporary' ? cfg.expireAt ?? null : null,
      }
    }),
    approvedQuotaType: draft.quotaType,
    approvedQuotaValue: draft.quotaValue ?? undefined,
    approvedQuotaPeriod: draft.quotaPeriod,
    approvedOverLimitAction: draft.overLimitAction,
    quotaEffectiveType: draft.effectiveType,
    quotaExpireAt: draft.effectiveType === 'temporary' ? draft.expireAt ?? undefined : undefined,
    approveRemark: approveRemark.trim() || undefined,
  }
}
