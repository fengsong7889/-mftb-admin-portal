package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 存量安全迁移执行（任务29 C 段）响应 VO。
 *
 * <p>所有类型都会被 {@code RdmIdempotentService.executeOnce} 序列化为 result_json 缓存、
 * 重复请求时反序列化回放，因此必须是 Jackson 友好的 POJO（无参构造 + getter/setter），
 * 且不携带任何数据库连接/懒加载引用。
 *
 * <p><b>时间字段一律输出字符串（yyyy-MM-dd HH:mm:ss）</b>：全局 {@code JacksonConfig}
 * 会把裸 {@code LocalDateTime} 序列化成毫秒数字，而前端按字符串裁剪展示
 * （{@code v?.slice(0, 16)}），数字上调用字符串方法会直接整页崩溃。
 * 与本模块其他 VO（如 {@code RdmDeliveryItemVO}）保持同一口径：VO 层格式化，不把时间类型泄给前端。
 */
public final class RdmStockMigrationVO {

    private RdmStockMigrationVO() {
    }

    /** 预览结果：批次头 + 逐项迁移预览（源 → 目标 V3 结构、执行前后版本与关联、影响面）。 */
    @Data
    public static class PreviewResult {
        private Long batchId;
        /** previewed（等待主责确认；确认前不可执行） */
        private String status;
        private String scopeType;
        private Long scopeProjectId;
        private Long targetProjectId;
        private String targetProjectName;
        /** true=执行时将自动创建「存量遷移」承接项目 */
        private Boolean targetProjectAutoCreate;
        private Integer chunkSize;
        private String previewHash;
        private Integer totalItems;
        /** 可迁移（previewed，确认后进入执行） */
        private Integer eligibleItems;
        /** 不可迁移（blocked，附原因；执行时跳过） */
        private Integer blockedItems;
        private List<ItemPreview> items;
        private String createdAt;
    }

    /** 单条需求的迁移预览：只读推导，不落业务事实。 */
    @Data
    public static class ItemPreview {
        private Long itemId;
        private Long reqId;
        private String reqNo;
        private String title;
        /** 来源流程版本（1/2；历史空值按 1 兜底） */
        private Integer sourceFlowVersion;
        /** 迁移前需求的业务并发版本快照（本系统按有效流程版本 1/2 记录） */
        private Integer sourceVersion;
        private Long targetProjectId;
        private String targetProjectName;
        /** previewed=可迁移；blocked=不可迁移（见 blockingReason） */
        private String status;
        private String blockingReason;
        private String previewHash;
        /** 影响面：将产生的结构性 V3 事实清单（绝不含测试/验收/发布证据） */
        private List<String> impacts;
    }

    /** 批次详情：批次头 + 全部明细 + 不可覆盖审计（供任务23 前端管理页消费）。 */
    @Data
    public static class BatchDetail {
        private Long batchId;
        private String status;
        private String requestId;
        private Long requestedBy;
        private String previewHash;
        private Integer chunkSize;
        private Long confirmedBy;
        private String confirmedAt;
        private String pausedAt;
        private String pauseReason;
        private Long rolledBackBy;
        private String rolledBackAt;
        private String resultJson;
        private String blockingReason;
        private Integer version;
        private String createdAt;
        private String updatedAt;
        private List<ItemDetail> items;
        private List<AuditEntry> audits;
    }

    /** 迁移明细详情。 */
    @Data
    public static class ItemDetail {
        private Long itemId;
        private Long reqId;
        private Long targetProjectId;
        private Integer sourceFlowVersion;
        private Integer sourceVersion;
        private String status;
        private String blockingReason;
        private String resultJson;
        private Long confirmedBy;
        private String confirmedAt;
        private Long executedBy;
        private String executedAt;
        private Long rolledBackBy;
        private String rolledBackAt;
        private Integer version;
    }

    /** 迁移审计条目（rdm_migration_audit，追加式、不可覆盖）。 */
    @Data
    public static class AuditEntry {
        private Long id;
        private Long batchId;
        private Long itemId;
        private String action;
        private String result;
        private Long operatorUserId;
        private String requestId;
        private Integer beforeVersion;
        private Integer afterVersion;
        private String beforeHash;
        private String afterHash;
        private String resultJson;
        private String reason;
        private String createdAt;
    }

    /** 单个分块执行结果。 */
    @Data
    public static class ChunkResult {
        private Long batchId;
        /** 本次分块执行后的批次状态（running=仍有待执行；completed=全部明细到达终态） */
        private String batchStatus;
        private Integer chunkSize;
        private Integer processedInChunk;
        private Integer successInChunk;
        private Integer failedInChunk;
        /** 全批次累计：已成功 */
        private Integer totalCompleted;
        private Integer totalFailed;
        private Integer totalBlocked;
        /** 仍待执行（confirmed） */
        private Integer remaining;
        private List<Long> succeededItemIds;
        private List<Long> failedItemIds;
        /** 全部明细到达终态后的批次结果汇总（未完成时为 null） */
        private String batchResultJson;
    }

    /**
     * 对账结果：源数量 = 成功 + 失败 + 阻塞/跳过；目标 V3 结构与源关联逐项可追溯。
     * <p>{@code countConsistent} 与 {@code traceable} 全真才算对账通过；任何不一致项都列明细供人工核查。
     */
    @Data
    public static class ReconcileResult {
        private Long batchId;
        private Integer totalItems;
        private Integer completed;
        private Integer failed;
        private Integer blocked;
        /** 尚未到达终态（previewed/confirmed/running） */
        private Integer pending;
        /** 源数量 == 成功 + 失败 + 阻塞 + 待执行（明细无丢失、无重复计入） */
        private Boolean countConsistent;
        /** 每个已完成明细的目标 V3 结构可追溯（需求 flow_version=3、project 关联一致、迁移产出交付项存在） */
        private Boolean traceable;
        /** 不可追溯明细：itemId → 原因 */
        private Map<String, String> inconsistencies;
        private String reconciledAt;
    }

    /**
     * 回退结果。<b>拒绝盲目回滚</b>：发现新 V3 事实时 {@code rejected=true}，批次已自动暂停，
     * 明细列出每个不可逆项与新事实清单；此时不删除任何历史/证据/关联，应走前滚兼容。
     */
    @Data
    public static class RollbackResult {
        private Long batchId;
        /** true=存在新 V3 事实，已拒绝回滚并暂停批次 */
        private Boolean rejected;
        private String rejectReason;
        /** itemId → 执行后新产生的 V3 事实（类型 → 新增ID列表） */
        private Map<String, Map<String, List<Long>>> newFactsByItem;
        /** 实际结构性回退成功的明细ID（rejected=true 时为空） */
        private List<Long> rolledBackItemIds;
        private String batchStatus;
    }
}
