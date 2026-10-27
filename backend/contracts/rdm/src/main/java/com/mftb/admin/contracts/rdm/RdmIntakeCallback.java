package com.mftb.admin.contracts.rdm;

/**
 * 需求准入审批回调契约：OA 审批终审通过/驳回后，由 RDM 域兑现「进需求池 / 退回提出人」。
 *
 * <p>为什么要有这个接口：OA 审批服务（legacy）原先直接 new/注入 RDM 的实现类
 * {@code RdmIntakeCallbackService}，导致 legacy 反向依赖 RDM 域模块，与域模块形成编译环。
 * 契约放在 contracts/rdm，实现留在 modules/rdm，装配由 Spring 完成：
 * legacy -&gt; contracts/rdm &lt;- modules/rdm。
 *
 * <p>方法签名刻意保持与实现完全一致（含 {@code isXxxProcess} 判定），
 * 目的是让调用方只替换类型、不改调用顺序与事务边界 —— OA 侧对每条流程的
 * 事务传播、异常吞抛与提交后通知时序都必须维持原样。
 */
public interface RdmIntakeCallback {

    /** 该流程编码是否属于「需求准入」审批 */
    boolean isIntakeProcess(String processCode);

    /** 终审通过：需求进池/指派（在 OA 审批事务内执行，失败即回滚审批） */
    void onFlowApproved(String flowNo);

    /** 终审驳回或撤销：需求退回提出人 */
    void onFlowRejected(String flowNo, String reason);
}
