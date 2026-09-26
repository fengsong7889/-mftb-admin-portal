package com.mftb.admin.service;

/**
 * 證明開具的 OA 审批回调出口。
 * <p>
 * 单独拆出（与请假同构）：OA 服务需要回调证明域，而证明服务又依赖 OA 提交，
 * 直接互相注入会形成构造器循环依赖。回调实现只依赖数据层，不反向依赖 OA 服务。
 */
public interface HrCertificateCallbackService {

    /** 该流程编码是否属于证明开具域 */
    boolean isCertificateProcess(String processCode);

    /** 审批全部通过：单据置为已完成并写入领取指引 */
    void onFlowApproved(String flowNo);

    /** 审批驳回：单据回到已驳回，可修改后重新提交 */
    void onFlowRejected(String flowNo);
}
