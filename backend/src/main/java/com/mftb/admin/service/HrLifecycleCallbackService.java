package com.mftb.admin.service;

/**
 * HR 入转调离单据的 OA 审批回调服务。
 * <p>
 * 由 {@code OaRequestServiceImpl} 在流程完成/驳回/撤销分支按 processCode 前缀分发，
 * 负责将审批结果同步回单据状态，并在审批通过后执行办理动作
 * （入职建账号 / 转正写职务记录 / 调动更新任职 / 离职停用账号）。
 */
public interface HrLifecycleCallbackService {

    /** 流程编码是否属于 HR 生命周期单据 */
    boolean isHrLifecycleProcess(String processCode);

    /**
     * 审批全部通过：单据 pending → approved → 执行办理动作 → completed。
     * 幂等：已完成的单据直接跳过。
     */
    void onFlowApproved(String flowNo);

    /** 审批驳回：单据 pending → rejected（可修改后重新提交） */
    void onFlowRejected(String flowNo);
}
