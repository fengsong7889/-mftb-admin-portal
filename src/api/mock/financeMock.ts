import { addApprovalRecord, generateFlowNo, formatNow } from '../../utils/approvalStore'

/**
 * 財務審批申請的本地降級實現
 * 後端不可用時，申請提交仍寫入 localStorage（src/utils/approvalStore.ts），
 * 審批流轉與通過後的批次/明細/欠款單寫入鏈路由 approvalStore 同一套邏輯完成，
 * 與後端 FinApprovalService / FinWriteChainService 行為保持一致。
 */

/** 申請類型 → 審批記錄類型 */
type ApprovalType = 'recharge' | 'transfer' | 'deduct' | 'merge'

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
    applicant: '朱棣(002)',
    applyTime: formatNow(),
    bizApprover: '朱元璋(001)',
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
