import { addApprovalRecord, generateFlowNo, formatNow } from '../../utils/approvalStore'

/**
 * 財務審批申請的本地降級實現
 * 後端不可用時，申請提交仍寫入 localStorage（src/utils/approvalStore.ts），
 * 審批流轉與通過後的批次/明細/欠款單寫入鏈路由 approvalStore 同一套邏輯完成，
 * 與後端 FinApprovalService / FinWriteChainService 行為保持一致。
 */

/** 申請類型 → 審批記錄類型（推廣贈送 gift 暫為前端流程，提交直接寫入本地審批記錄） */
type ApprovalType = 'recharge' | 'transfer' | 'deduct' | 'merge' | 'gift'

/** 當前登錄人（姓名(工號)）：申請人歸屬判斷依賴此格式（撤銷按鈕僅申請人可見） */
function currentApplicant(): string {
  try {
    const info = JSON.parse(localStorage.getItem('user_info') || '{}')
    if (info.name && info.empId) return `${info.name}(${info.empId})`
    if (info.name) return info.name
  } catch { /* 解析失敗回退演示申請人 */ }
  return '朱棣(002)'
}

/** 提交申請（降級），返回流程編號 */
export function mockSubmitApproval(params: {
  approvalType: ApprovalType
  groupId: string
  groupName: string
  brand: string
  extra: Record<string, unknown>
}): string {
  const flowNo = generateFlowNo(params.approvalType)
  addApprovalRecord({
    key: `custom_${Date.now()}`,
    groupId: params.groupId,
    groupName: params.groupName,
    brand: params.brand,
    flowNo,
    approvalType: params.approvalType,
    applicant: currentApplicant(),
    applyTime: formatNow(),
    // 與後端一致：提交時不預設各節點審批人，審批時記錄實際操作人簽名
    bizApprover: '--',
    bizApproveTime: '--',
    bizApproveStatus: 'pending',
    opsApprover: '--',
    opsApproveTime: '--',
    opsApproveStatus: 'pending',
    finApprover: '--',
    finApproveTime: '--',
    finApproveStatus: 'pending',
    flowStatus: 'pending',
    rejectReason: '',
    extra: params.extra,
  })
  return flowNo
}
