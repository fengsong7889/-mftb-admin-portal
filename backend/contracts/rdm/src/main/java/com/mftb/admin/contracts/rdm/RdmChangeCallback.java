package com.mftb.admin.contracts.rdm;

/**
 * 需求变更审批回调契约：OA 审批终审通过/驳回后，由 RDM 域兑现
 * 「计变更次数并按需回填排期 / 变更单退回」。
 *
 * <p>与 {@link RdmIntakeCallback} 同源：把 legacy（OA 审批）对 RDM 实现类的直接依赖
 * 收敛为单向契约，避免 legacy 与域模块互相依赖。
 *
 * <p>两个回调刻意分成两个接口而不是一个带 {@code supports} 的通用接口：
 * OA 侧目前按「准入 / 变更」各注入一个 bean 并各自判定，拆开可以保持调用顺序、
 * 事务语义与既有测试断言完全不变。
 */
public interface RdmChangeCallback {

    /** 该流程编码是否属于「需求变更」审批 */
    boolean isChangeProcess(String processCode);

    /** 终审通过：计变更次数，必要时回填排期 */
    void onFlowApproved(String flowNo);

    /** 终审驳回或撤销：变更单退回 */
    void onFlowRejected(String flowNo, String reason);
}
