package com.mftb.admin.service;

import com.mftb.admin.dto.RdmReleaseDTO;
import com.mftb.admin.dto.RdmReleaseVO;

import java.util.List;

/**
 * 发布放行服务（阶段 4：上线前的质量闸门）。
 * <p>它管的是「质量上能不能上线」，与上线后的业务验收（是否解决了业务问题）是两件事实。
 * 检查项一律由服务端计算，客户端只能决定豁免与驳回理由。
 */
public interface RdmReleaseService {

    /** 实时计算检查项（只读预览，不落库） */
    RdmReleaseVO.Gate preview(Long reqId);

    /** 发起放行单：冻结一份检查项快照，等待放行人裁决 */
    RdmReleaseVO.Gate apply(Long reqId, RdmReleaseDTO.Apply dto);

    /** 放行 / 驳回（放行人不得为发起人本人） */
    RdmReleaseVO.Gate decide(Long id, RdmReleaseDTO.Decide dto);

    /** 需求下的放行单历史（含被撤销的旧轮） */
    List<RdmReleaseVO.Gate> list(Long reqId);

    /**
     * 上线动作的前置校验：必须持有已放行、未过期且版本匹配的放行单。
     * <p>由状态机在 {@code release} 动作上调用，失败抛业务异常。
     */
    void requireValidPass(Long reqId, String versionNo);

    /** 需求退回返工时撤销在途放行单（旧放行不能跨返工继续沿用） */
    void revokeOpenGates(Long reqId, String reason);
}
