package com.mftb.admin.contracts.oa;

import java.util.List;

/**
 * OA 待办任务契约：把「跨域改派审批节点」收敛成显式写端口。
 *
 * <p>背景：HR 离职流程需要把离职人名下的待办整体改派给接收人。原实现直接注入
 * {@code OaApprovalTaskMapper} 查 pending 再 {@code updateById}，域边界上是「HR 改 OA 的表」。
 * 现在由 OA 提供端口，HR 只表达意图：
 * <ol>
 *   <li>{@link #findPendingByApprover(String)} 取候选（包含匹配，仅用于缩小范围）；</li>
 *   <li>调用方按业务规则做精确判定（签名 token 必须整段相等）；</li>
 *   <li>{@link #reassignPendingApprover(long, String, String)} 带条件改派，防止并发下改错人。</li>
 * </ol>
 *
 * <p>为什么不在端口里做 token 精确匹配：签名规则（{@code 姓名(工号)} 的切分、会签列表的同长度替换）
 * 属于调用方业务语义；OA 只保证「同一行、仍 pending、审批人未被别人改过」这三个并发条件。
 */
public interface OaApprovalTaskPort {

    /** 待办节点投影：只暴露调用方判定需要的字段，不泄露 OA 实体 */
    record PendingTask(long id, String approver) {
    }

    /**
     * 取审批人签名包含 {@code approverFragment} 的 pending 节点。
     *
     * <p>包含匹配会命中工号前缀相同的其他人（如 MF0001 vs MF00011），调用方必须再做整段比对。
     *
     * @return 候选节点；没有则返回空列表
     */
    List<PendingTask> findPendingByApprover(String approverFragment);

    /**
     * 条件改派：仅当该任务仍为 pending 且审批人字符串与 {@code expectedApprover} 完全一致时才更新。
     *
     * <p>条件不满足（已被审掉、已被别人改派、行不存在）返回 0，调用方据此如实统计改派数量，
     * 不能把「没改成的」算进结果。
     *
     * @return 1 = 已更新；0 = 条件未命中
     */
    int reassignPendingApprover(long taskId, String expectedApprover, String newApprover);
}
