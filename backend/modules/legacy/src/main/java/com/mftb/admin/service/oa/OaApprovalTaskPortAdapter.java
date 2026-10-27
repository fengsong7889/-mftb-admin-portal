package com.mftb.admin.service.oa;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.contracts.oa.OaApprovalTaskPort;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * {@link OaApprovalTaskPort} 的 OA 侧实现。
 *
 * <p>两个动作都带「仍为 pending」这个条件：
 * <ul>
 *   <li>查询：只返回待审节点，已完成的不会进入调用方的改派范围；</li>
 *   <li>更新：用条件更新代替 {@code updateById}，避免「查出来是 pending，写回去时已被审掉/被别人改派」
 *       把别人的审批结果覆盖掉。</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class OaApprovalTaskPortAdapter implements OaApprovalTaskPort {

    /** OA 审批任务状态：待审批（与 oa_approval_task.task_status 字典一致） */
    private static final String STATUS_PENDING = "pending";

    private final OaApprovalTaskMapper approvalTaskMapper;

    @Override
    public List<PendingTask> findPendingByApprover(String approverFragment) {
        if (approverFragment == null || approverFragment.isBlank()) {
            return List.of();
        }
        return approvalTaskMapper.selectList(new LambdaQueryWrapper<OaApprovalTask>()
                        .eq(OaApprovalTask::getTaskStatus, STATUS_PENDING)
                        .like(OaApprovalTask::getApprover, approverFragment)
                        .select(OaApprovalTask::getId, OaApprovalTask::getApprover))
                .stream()
                .map(task -> new PendingTask(task.getId(), task.getApprover()))
                .toList();
    }

    @Override
    public int reassignPendingApprover(long taskId, String expectedApprover, String newApprover) {
        return approvalTaskMapper.update(null, new LambdaUpdateWrapper<OaApprovalTask>()
                .eq(OaApprovalTask::getId, taskId)
                .eq(OaApprovalTask::getTaskStatus, STATUS_PENDING)
                .eq(OaApprovalTask::getApprover, expectedApprover)
                .set(OaApprovalTask::getApprover, newApprover));
    }
}
