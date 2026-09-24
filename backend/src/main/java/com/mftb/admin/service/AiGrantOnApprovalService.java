package com.mftb.admin.service;

import com.mftb.admin.entity.OaRequest;

/**
 * AI 使用申请审批通过后的授权兑现（V0 §B.4）。
 * <p>幂等：{@code ai_grant_log.flow_no} 唯一，重放/审批人二次点击不再写权限/额度。
 * <p>失败：抛出，不吞异常；{@code ai_grant_log.status=FAILED} 落审计后向上传播，让事务回滚。
 */
public interface AiGrantOnApprovalService {

    /** 从 OaRequest.formData 解析被授予模型清单与可选额度，落 ai_employee_auth / ai_quota_override。 */
    void grant(OaRequest request, String approverUsername);
}
