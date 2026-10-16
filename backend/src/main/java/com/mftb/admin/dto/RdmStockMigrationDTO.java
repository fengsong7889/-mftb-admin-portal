package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 存量安全迁移执行（任务29 C 段）请求 DTO。
 *
 * <p>迁移以「预览 → 主责确认 → 小批执行 → 可暂停/可续 → 对账 →（仅在无新 V3 事实时）保守回退」推进，
 * <b>绝不自动全量执行</b>：未经确认的批次任何执行入口一律拒绝。
 *
 * <p>所有写操作均接入 {@code RdmIdempotentService.executeOnce} 原子幂等：
 * {@code requestId} 由客户端生成、重试时保持不变；未携带时服务端按操作与请求内容派生判别子。
 * {@code expectedVersion} 为迁移批次的并发控制版本（乐观锁预检，真实并发由 @Version 与唯一索引兜底，任务24 验证）。
 */
public final class RdmStockMigrationDTO {

    private RdmStockMigrationDTO() {
    }

    /**
     * 迁移预览请求：按范围（项目 或 需求ID列表）生成逐项迁移预览批次。
     * <p>预览<b>只读业务事实、不落任何业务变更</b>，只创建迁移计划行（rdm_migration_batch/item，状态 previewed）。
     * <p>{@code projectId} 与 {@code reqIds} 二选一：给定 projectId 时迁移该项目下全部 V1/V2 存量需求
     * （目标项目即该项目）；否则按 reqIds 逐条迁移，{@code targetProjectId} 可指定既有目标项目，
     * 为空时执行阶段自动创建「存量遷移」承接项目。
     */
    @Data
    public static class Preview {
        /** 客户端幂等请求ID（重试保持不变） */
        private String requestId;
        /** 范围①：项目ID（迁移该项目下全部 V1/V2 需求） */
        private Long projectId;
        /** 范围②：需求ID列表（与 projectId 二选一） */
        private List<Long> reqIds;
        /** 目标项目ID（仅 reqIds 范围有效；空=执行时自动创建承接项目） */
        private Long targetProjectId;
        /** 分块大小（1..100，空取默认 20） */
        private Integer chunkSize;
        /** 迁移原因（审计留痕） */
        private String reason;
    }

    /**
     * 主责确认请求：批次由 previewed → confirmed，逐项迁移明细同步确认。
     * <p>确认人身份取认证主体；授权口径：管理员，或范围主责（项目范围=项目 PM/产品负责人；
     * 需求范围=每条需求的交付写权限人）。确认前任何执行入口一律拒绝。
     */
    @Data
    public static class Confirm {
        private String requestId;
        /** 批次并发版本乐观锁预检（可空=不预检，由确认时重读为准） */
        private Integer expectedVersion;
        /** 确认意见/原因（审计留痕） */
        private String reason;
    }

    /**
     * 小批执行请求：每次调用同步执行一个分块（至多 chunk_size 条 confirmed 明细）。
     * <p>失败项标 FAILED 隔离、不污染同批成功项；全部明细到达终态后批次自动置 completed 并写结果汇总。
     * <p>{@code requestId} 未携带时服务端按「首个待执行明细ID」派生判别子：同一分块崩溃重试安全回放，
     * 下一分块自然派生新键。
     */
    @Data
    public static class Execute {
        private String requestId;
        private Integer expectedVersion;
    }

    /** 暂停请求：running/confirmed → paused；已执行项保留、未执行项待续，可经 resume 恢复。 */
    @Data
    public static class Pause {
        private String requestId;
        private Integer expectedVersion;
        /** 暂停原因（必填，审计留痕） */
        private String reason;
    }

    /** 恢复请求：paused → confirmed/running（取决于是否已有执行进度），须重新过主责授权。 */
    @Data
    public static class Resume {
        private String requestId;
        private Integer expectedVersion;
        private String reason;
    }

    /**
     * 回退请求：<b>拒绝盲目回滚</b> —— 任一已完成明细在执行后产生了新 V3 事实
     * （测试/验收/发布/问题/延期等，含给迁移产出交付项新挂的事实）即整体拒绝并自动暂停批次，
     * 提示走前滚兼容；仅在无新事实且可安全逆向时执行结构性回退（不删除任何历史/证据/关联）。
     */
    @Data
    public static class Rollback {
        private String requestId;
        private Integer expectedVersion;
        /** 回退原因（必填，审计留痕） */
        private String reason;
    }

    /** 对账请求：源数量 = 成功 + 失败 + 阻塞/跳过；目标 V3 结构与源关联逐项可追溯；写 reconcile 审计。 */
    @Data
    public static class Reconcile {
        private String requestId;
    }
}
