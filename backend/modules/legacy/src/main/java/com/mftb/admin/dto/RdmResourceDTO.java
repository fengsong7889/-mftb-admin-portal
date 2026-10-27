package com.mftb.admin.dto;

import lombok.Data;

/**
 * 團隊負載分派请求体（阶段 B-3.2：从负载页把系统已有单据指派给某人）。
 *
 * <p>首期仅支持研发/设计任务改派（{@code dev_task}/{@code design_task}）——任务工时/排期在
 * {@code rdm_work_task} 已有，指派只换负责人，不依赖计划层；产品需求分配、测试批次受理各有
 * 更复杂的领域规则（产品经理生效、测试轮次冻结保护），留作后续切片。
 *
 * <p>并发与幂等：{@code expectedPlanVersion} 由前端从待分配项回传，服务端以其作乐观锁条件；
 * {@code clientRequestId} 供 {@code executeOnce} 原子占位去重（同请求重试不重复副作用）。
 * 服务端不信任前端传的负责人姓名等，一律按 userId 从 sys_user 取权威值。
 */
public class RdmResourceDTO {

    /** 任务指派请求体 */
    @Data
    public static class Assign {
        /** 来源类型：dev_task / design_task（本切片仅任务） */
        private String source;
        /** 单据主键（任务 id） */
        private Long itemId;
        /** 被指派人 sys_user.id */
        private Long assigneeUserId;
        /** 期望的排期乐观锁版本（前端回传；缺省则不做版本前置校验但仍自增） */
        private Integer expectedPlanVersion;
        /** 幂等请求标识（客户端生成，≤64 位 ASCII） */
        private String clientRequestId;
    }
}
