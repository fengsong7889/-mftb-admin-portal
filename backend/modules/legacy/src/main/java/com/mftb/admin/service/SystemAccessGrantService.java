package com.mftb.admin.service;

import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.SystemAccessRequest;

import java.util.List;

/**
 * 系統權限申請：审批兑现侧回调（OA 引擎 → 本服务）。
 * <p>
 * 与 AI 使用申请的「审批即授权」同口径：<b>兑现失败向上抛，让整个审批事务回滚</b>，
 * 不采用「只记日志、单据停在 approved 待重试」的宽口径。理由：权限申请的唯一结果就是授权，
 * 出现「审批已通过但权限没下发」时，申请人看到的门户卡片仍然锁着、审批人以为已办结，
 * 两边都不会再去推动它；宁可让审批人当场看到失败原因（如角色已被系统准入移除）后重试。
 */
public interface SystemAccessGrantService {

    /** 是否系统权限申请流程（OA 回调分发用） */
    boolean isSystemAccessProcess(String processCode);

    /**
     * 节点审批时校验并合并审批人配置的授权角色。
     * <p>只取 payload 里的 {@code approvedGrant} 合并进原 form_data，申请内容原样保留，
     * 审批人无法借审批接口改写申请事实。
     *
     * @param request          OA 流程实例（提供原 form_data）
     * @param incomingFormData 审批接口传入的 formData，可为空
     * @return 合并后的 form_data JSON；本次审批未携带授权配置时返回 {@code null}（调用方不更新）
     */
    String mergeGrantConfig(OaRequest request, String incomingFormData);

    /**
     * 全部节点通过 → 把审批人指定的角色绑定到申请人，并递增全局权限 revision 使其立即生效。
     * <p>幂等：{@code grant_status='granted'} 时直接跳过。
     *
     * @param flowNo            OA 流程编号
     * @param approverSignature 审批人签名（姓名(工号)），落审计与 granted_by
     */
    void onFlowApproved(String flowNo, String approverSignature);

    /** 驳回 → 申请单同步为 rejected（不兑现任何授权） */
    void onFlowRejected(String flowNo, String reason);

    /** 撤销 → 申请单同步为 cancelled（不兑现任何授权） */
    void onFlowCancelled(String flowNo);

    /* ==================== 到期自动回收 ==================== */

    /**
     * 拉取「到期且本单确实新绑过角色、尚未回收」的申请单，供定时作业逐条处理。
     * <p>三个必要条件缺一不可：{@code grant_newly_bound=1}（只收本单带来的权限）、
     * {@code revoke_status='none'}（已回收/已豁免的不再扫）、{@code duration_type='until'}
     * 且到期日已过（长期永不回收）。按到期日升序，优先处理拖得最久的。
     *
     * @param limit 单轮上限，防止一次拉走全表
     */
    List<SystemAccessRequest> findExpiredGrants(int limit);

    /**
     * 回收单条到期授权（独立事务：认领 + 解绑 + 审计 + 刷新权限缓存同生同死）。
     * <p>可重复执行：靠 {@code revoke_status='none'} 的条件更新做认领锁，
     * 多实例并发或补跑都不会产生第二份回收；异常回滚后状态回到 none，下一轮重试。
     *
     * @param requestId 申请单 id
     * @return true = 本轮真的解绑了；false = 条件不满足/已被其他实例处理/被其他有效授权覆盖
     */
    boolean expireGrant(Long requestId);
}
