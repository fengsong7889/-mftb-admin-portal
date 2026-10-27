package com.mftb.admin.service;

/**
 * 请假单据的 OA 审批回调服务。
 * <p>
 * 独立成接口是为了打断 {@code HrLeaveService}（要调 OaRequestService 发起流程）
 * 与 {@code OaRequestServiceImpl}（要回调请假域）之间的构造器循环依赖；
 * 本实现只依赖数据层，不再反向依赖 OA 引擎。
 */
public interface HrLeaveCallbackService {

    /** 流程编码是否属于请假域 */
    boolean isLeaveProcess(String processCode);

    /** 审批全部通过：额度累加 used_days 并置单据 completed（幂等） */
    void onFlowApproved(String flowNo);

    /** 审批驳回：单据回 rejected，额度不动 */
    void onFlowRejected(String flowNo);
}
