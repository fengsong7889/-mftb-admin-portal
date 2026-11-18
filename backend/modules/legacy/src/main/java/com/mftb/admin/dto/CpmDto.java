/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 持續績效系統接口契约。
 *
 * <p>与前端 cpm.ts 逐字对应；所有「人」字段由服务端从 JWT 注入，
 * 表单里没有任何 userId/recorderUserId 的位置——信任前端传身份是本域第一禁忌。
 */
public final class CpmDto {

    private CpmDto() {
    }

    /* ==================== 条目 ==================== */

    @Data
    public static class ItemForm {
        @NotBlank
        @Size(max = 200)
        private String title;
        @Size(max = 2000)
        private String detail;
        @Size(max = 32)
        private String category;
        @Size(max = 16)
        private String status;
        private Integer progress;
        /** 归属日 yyyy-MM-dd；空=服务端按业务时区今天 */
        private String workDate;
        private BigDecimal workHours;
        private String templateKey;
        /** manual/rdm_requirement/meeting_action（ai 走提取确认通道，不在这里） */
        private String sourceType;
        @Size(max = 64)
        private String sourceRef;
        @Size(max = 200)
        private String sourceLabel;
        /** 更新时必带：乐观锁版本 */
        private Integer version;
    }

    /**
     * 关联业务对象候选（RDM 需求 / 会议行动项），供我的工作記錄的导入挑选器。
     *
     * <p>只给原始码与素材，不给拼好的文案：状态/角色词表分别属于 RDM 与会议两个域，
     * 在这里翻成中文就等于把两个域的词表抄进 CPM，上游改名时 CPM 这边不会跟着变。
     */
    @Data
    public static class SourceVO {
        /** rdm_requirement / meeting_action */
        private String sourceType;
        /** 来源对象主键（字符串形状，直接落 biz_cpm_item.source_ref） */
        private String sourceRef;
        private String title;
        /** 需求编号 / 会议标题，界面副行素材 */
        private String subtitle;
        /** 来源对象状态原始码（RDM 状态机或 pending），前端用各自词表翻译 */
        private String statusCode;
        /** submitter/pm/dev/accept/participant 或 owner/participant */
        private String role;
        private Integer progress;
        private String dueDate;
        /** 来源对象是否已进入结案态（已上线/已核销），界面提示用 */
        private boolean terminated;
        /** 本人是否已导入过该对象（真正防重仍靠条目唯一键） */
        private boolean imported;
    }

    @Data
    public static class ProgressForm {
        @NotNull
        private Integer progress;
        @NotBlank
        @Size(max = 16)
        private String status;
        @Size(max = 120)
        private String note;
        /** 更新日（延续带入=今天；补记历史=明确日期）；空=今天 */
        private String updateDate;
        /**
         * 本次投入工时（可选，模板开关决定是否暴露）。
         * <p>只落 biz_cpm_item.work_hours 做分布统计，绝不进任何评价口径（工时≠绩效）。
         */
        private java.math.BigDecimal workHours;
    }

    @Data
    public static class ItemVO {
        private Long id;
        private String title;
        private String detail;
        private String category;
        private String categoryLabel;
        private String status;
        private Integer progress;
        private String workDate;
        private BigDecimal workHours;
        private String sourceType;
        private String sourceRef;
        private String sourceLabel;
        private String templateKey;
        private Integer version;
        /** 是否有被认定记录（列表徽章用） */
        private Boolean recognized;
    }

    @Data
    public static class DayVO {
        /** 日视图：当天活跃条目 */
        private List<ItemVO> items = new ArrayList<>();
        /** 延续建议：未完结且今天还没有流水的条目 */
        private List<ItemVO> carryCandidates = new ArrayList<>();
        private String date;
    }

    /* ==================== 汇报与聚合 ==================== */

    @Data
    public static class ReportQuery {
        /** week/month/quarter */
        @NotBlank
        @Size(max = 16)
        private String periodType;
        /** 期初 yyyy-MM-dd（前端按规则算好；服务端会校验其为合法周期起点） */
        @NotBlank
        private String periodStart;
    }

    /** 聚合快照（发布时冻结进 content_json；schemaVersion=1） */
    @Data
    public static class Snapshot {
        private Integer schemaVersion = 1;
        private String periodType;
        private String periodStart;
        private String periodEnd;
        private List<Group> groups = new ArrayList<>();
        private Totals totals = new Totals();

        @Data
        public static class Group {
            private String category;
            private String categoryLabel;
            private List<Entry> items = new ArrayList<>();
        }

        @Data
        public static class Entry {
            private Long itemId;
            private String title;
            private String status;
            private Integer progress;
            private String workDate;
            /** 期间内的进度轨迹（流水收敛，数字永不经模型） */
            private List<Integer> trail = new ArrayList<>();
            private String sourceType;
            private String sourceLabel;
        }

        @Data
        public static class Totals {
            private int total;
            private int done;
            private int doing;
            private int todo;
            private int blocked;
        }
    }

    @Data
    public static class ReportVO {
        private Long id;
        private Long userId;
        private String ownerName;
        private String ownerEmpId;
        private String periodType;
        private String periodStart;
        private String periodEnd;
        private String status;
        private String summary;
        private Boolean aiSummary;
        private String publishedAt;
        private Snapshot snapshot;
        /** 送达/已读（receiverCount 由规则解析；readCount 回执表） */
        private Integer receiverCount;
        private Integer readCount;
        private Integer commentCount;
        private Integer likeCount;
        private Boolean likedByMe;
        private Integer version;
    }

    @Data
    public static class DraftForm {
        @NotBlank
        @Size(max = 16)
        private String periodType;
        @NotBlank
        private String periodStart;
        @Size(max = 2000)
        private String summary;
        /** 摘要是否 AI 起草（披露标记；数字永远来自聚合） */
        private Boolean aiSummary;
    }

    /* ==================== 团队视图 ==================== */

    @Data
    public static class TeamRow {
        private Long userId;
        private String name;
        private String empId;
        private String department;
        /** published/draft/missing（missing=本期未提交，缺行如实标，不显示假 0） */
        private String submitStatus;
        private Long reportId;
        private String publishedAt;
        private Integer totalItems;
        private Integer doneItems;
        private Integer readCount;
        private Integer receiverCount;
        private Integer commentCount;
        private Integer likeCount;
        /** 我发出的认定（该成员本期） */
        private Integer recognizedByMe;
    }

    @Data
    public static class TeamVO {
        private String periodType;
        private String periodStart;
        private String periodEnd;
        private List<TeamRow> rows = new ArrayList<>();
        private Stats stats = new Stats();

        @Data
        public static class Stats {
            private int memberCount;
            private int publishedCount;
            /** 提交率（%，整数） */
            private int submitRate;
            private int doneItemsTotal;
            private int itemsTotal;
            private int recognitionSentCount;
            private int pendingFeedbackCount;
        }
    }

    /* ==================== CFR ==================== */

    @Data
    public static class CommentForm {
        @NotBlank
        @Size(max = 8)
        private String targetType;
        @NotNull
        private Long targetId;
        @NotBlank
        @Size(max = 500)
        private String content;
        private Long parentId;
    }

    @Data
    public static class CommentVO {
        private Long id;
        private String targetType;
        private Long targetId;
        private Long userId;
        private String authorName;
        private String content;
        private String createdAt;
        private Long parentId;
        private Boolean mine;
    }

    @Data
    public static class RecognitionForm {
        @NotBlank
        @Size(max = 8)
        private String targetType;
        @NotNull
        private Long targetId;
        @NotBlank
        @Size(max = 16)
        private String kind;
        @NotBlank
        @Size(max = 500)
        private String comment;
    }

    @Data
    public static class RecognitionVO {
        private Long id;
        private String targetType;
        private Long targetId;
        private String targetTitle;
        private Long fromUserId;
        private String fromName;
        private Long toUserId;
        private String toName;
        private String kind;
        private String comment;
        private String periodTag;
        private String createdAt;
    }

    /* ==================== 模板与规则 ==================== */

    @Data
    public static class CategoryDef {
        private String key;
        private String label;
        private String hint;
    }

    @Data
    public static class TemplateVO {
        private Long id;
        private String templateKey;
        private String name;
        private String roleHint;
        private List<CategoryDef> categories = new ArrayList<>();
        private Boolean workHoursEnabled;
        private Boolean builtin;
        private Boolean enabled;
        private String remark;
        private String updatedBy;
        private String updatedAt;
    }

    @Data
    public static class TemplateForm {
        @NotBlank
        @Size(max = 32)
        private String templateKey;
        @NotBlank
        @Size(max = 32)
        private String name;
        @Size(max = 64)
        private String roleHint;
        @NotNull
        private List<CategoryDef> categories;
        private Boolean workHoursEnabled;
        private String remark;
    }

    @Data
    public static class RuleVO {
        private Boolean enabled;
        private List<String> periodTypes = new ArrayList<>();
        private Integer deadlineDay;
        private String deadlineTime;
        private Integer remindBeforeHours;
        private Boolean receiverManager;
        private List<Long> extraReceiverIds = new ArrayList<>();
        private List<String> extraReceiverNames = new ArrayList<>();
        private Boolean groupPush;
        private Boolean personalPush;
        /** 环境级 dry-run：true 时一切投递只登记 skipped */
        private Boolean notifyDryRun;
        private String remark;
        private String updatedBy;
        private String updatedAt;
    }

    @Data
    public static class RuleForm {
        @NotNull
        private Boolean enabled;
        @NotNull
        private List<String> periodTypes;
        @NotNull
        private Integer deadlineDay;
        @NotBlank
        @Size(max = 5)
        private String deadlineTime;
        @NotNull
        private Integer remindBeforeHours;
        @NotNull
        private Boolean receiverManager;
        private List<Long> extraReceiverIds;
        @NotNull
        private Boolean groupPush;
        @NotNull
        private Boolean personalPush;
        @Size(max = 200)
        private String remark;
    }

    /* ==================== AI ==================== */

    @Data
    public static class AiStatusVO {
        private boolean enabled;
        private boolean available;
        private boolean authorized;
        private String reasonCode;
        private String message;
        private List<com.mftb.admin.dto.AiSceneDto.Check> checks;
        private Integer maxInputChars;
        /** ASR 是否可用（未配置凭据时录音入口置灰，粘贴不受影响） */
        private boolean asrAvailable;
        private Integer asrMaxSeconds;
    }

    @Data
    public static class AiExtractionForm {
        @NotBlank
        @Size(max = 64)
        private String requestKey;
        @NotBlank
        @Size(max = 20000)
        private String rawText;
        /** 归类所用模板；空=服务端按用户偏好回落 general */
        private String templateKey;
    }

    @Data
    public static class AiCandidate {
        private String title;
        private String category;
        private String status;
        private Integer progress;
        private String detail;
        /** 原文句编号（s1/s2…），预览可回溯 */
        private List<String> sourceRefs = new ArrayList<>();
    }

    @Data
    public static class AiExtractionVO {
        private String requestKey;
        /** processing/succeeded/failed/expired */
        private String status;
        private String errorCode;
        private String promptVersion;
        private Integer extractionSchemaVersion;
        private List<AiCandidate> candidates = new ArrayList<>();
        private String summary;
        private List<String> tomorrowPlan = new ArrayList<>();
    }

    @Data
    public static class AiConfirmForm {
        @NotBlank
        @Size(max = 64)
        private String requestKey;
        /** 勾选保留的候选（顺序即写入顺序） */
        @NotNull
        private List<AiCandidate> selected = new ArrayList<>();
        /** 落条目归属日；空=今天 */
        private String workDate;
    }

    /** 汇报 AI 摘要：只润色概述，数字来自服务端重算的快照 */
    @Data
    public static class AiSummaryForm {
        @NotBlank
        @Size(max = 64)
        private String requestKey;
        @NotBlank
        @Size(max = 16)
        private String periodType;
        @NotBlank
        private String periodStart;
    }

    @Data
    public static class TranscriptionVO {
        @NotBlank
        private String text;
    }

    /* ==================== 工作台摘要 ==================== */

    @Data
    public static class HomeSummaryVO {
        private Integer todayCount;
        private Boolean weekPublished;
        private String weekPeriodStart;
        /** 本周收到的反馈数（评论+认定） */
        private Integer weekFeedbackCount;
    }
}
