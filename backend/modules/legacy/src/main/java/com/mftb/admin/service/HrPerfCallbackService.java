package com.mftb.admin.service;

/**
 * 績效考核的 OA 审批回调出口（整批确认）。
 * <p>
 * 与请假/证明同构：绩效服务依赖 OA 提交，OA 又要回调绩效域，直接互注入会成构造器循环依赖，
 * 故回调实现只依赖数据层。
 */
public interface HrPerfCallbackService {

    /** 该流程编码是否属于绩效考核确认 */
    boolean isPerfProcess(String processCode);

    /** 审批全部通过：按计划批量下发结果（算最终得分与等级、写确认时间） */
    void onFlowApproved(String flowNo);

    /** 审批驳回：计划退回进行中，考核单回到待校准，HR 可改判后重新提交 */
    void onFlowRejected(String flowNo);
}
