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

    /**
     * 把审批人提交的授权配置合并进申请单 form_data。
     *
     * <p>只合并白名单内的授权键（approvedModels / approvedModelConfigs / approvedQuota* 等），
     * 申请事实（requestType / applyReason / requestedModels / usageDescription …）原样保留：
     * 审批接口不能成为改写申请内容的入口。
     *
     * @return 合并后的 JSON；审批人未提交任何可识别的授权键时返回 null（调用方不动 form_data）
     */
    String mergeGrantFormData(OaRequest request, String approverFormData);
}
