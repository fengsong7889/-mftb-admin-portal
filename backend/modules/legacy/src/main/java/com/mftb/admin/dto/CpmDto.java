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
        /** manual/rdm_requirement/rdm_task/meeting_action（ai 走提取确认通道，不在这里） */
        private String sourceType;
        @Size(max = 64)
        private String sourceRef;
        @Size(max = 200)
        private String sourceLabel;
        /**
         * 是否允许把本条目的进度回写到 RDM 任务。
         *
         * <p>只有 {@code sourceType=rdm_task} 时服务端才读取它：需求级关联没有可写的进度真值，
         * 接受这个标记就会让人以为回写生效了。默认取服务端配置（总闸开时导入即默认允许），
         * 界面给一个看得见的开关，关掉就完全不影响 CPM 记录。
         */
        private Boolean rdmSyncEnabled;
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
        /**
         * 是否 PRD 类任务：它的 100% 在 RDM 侧只能通过「提交評審」达成，
         * 界面必须预先标出来，否则用户会在 CPM 里填一个永远回写不进去的进度。
         */
        private boolean prdTask;
        /** 任务号（任务档素材；需求档为 null） */
        private String externalNo;
        /** 所属需求标题（任务档副行素材，词表仍归 RDM 域） */
        private String parentTitle;
        /** 计划工时（小时）：只作展示素材，不参与 CPM 工时统计 */
        private BigDecimal planHours;
    }

    /**
     * 導入會議候选（给持續績效台账用）。
     *
     * <p>不往 {@link SourceVO} 里加字段复用：那个形状只有一个 {@code dueDate}（单日时限），
     * 而会议的本质是一段区间。共用一个形状就会在一个列表里出现两种日期语义，
     * 用户看不出哪个是「截止日」哪个是「会议起止」，导入后才知道带成了两个日期。
     *
     * <p>状态/角色同样只给原始码：会议状态机属于会议域，在这里翻成中文就是一份副本词表。
     */
    @Data
    public static class MeetingSourceVO {
        /** biz_meeting_booking.id，导入后直接落 biz_cpm_item.source_ref */
        private long bookingId;
        /** 会议编号（界面副行素材） */
        private String bookingNo;
        private String title;
        /** 预定开始 ISO 日期时间；导入后作为子任務的计划起日 */
        private String startTime;
        /** 预定结束 ISO 日期时间；导入后作为子任務的计划止日 */
        private String endTime;
        /** booked / checked_in / finished；cancelled 与 released 不候选 */
        private String statusCode;
        /** organizer / participant */
        private String role;
        private String roomName;
        /** 本人是否已导入过该会议（真防重仍靠条目唯一键） */
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
        /* ---------- 阶段三：时间维度与 RDM 回写（均为只读派生值，界面不自行计算） ---------- */
        /** 首次开工时点（时段回算） */
        private String firstStartAt;
        /** 最近收工时点（时段回算） */
        private String lastEndAt;
        /** segment=时段回算 / manual=手工快填；两者精度不同，界面要能说清数字从哪来 */
        private String workHoursSource;
        /** 当日投入分钟（跟随日视图查询日期） */
        private Integer dayMinutes;
        /** 期间累计投入分钟 */
        private Integer totalMinutes;
        /** RDM 回写状态；非任务级关联为 null（不给「可回写」的错觉） */
        private RdmSyncVO rdmSync;
    }

    /**
     * RDM 回写状态回显。
     *
     * <p>它存在的唯一理由是<b>让失败看得见</b>：回写被 RDM 规则拒绝或与他人的上报冲突时，
     * CPM 的保存仍然成功（过程层不该被交付层拒），但界面必须如实说明「RDM 那侧没改成」以及原因，
     * 否则用户会以为两边已经一致——那比不一致更糟。
     */
    @Data
    public static class RdmSyncVO {
        private Boolean enabled;
        /** pending/success/conflict/rejected/error */
        private String state;
        private String message;
        private String syncedAt;
        private String taskNo;
        private Long taskId;
        /** RDM 侧当前进度：conflict 时界面给出「以 X% 重新对齐」的出路 */
        private Integer rdmProgress;
    }

    @Data
    public static class DayVO {
        /** 日视图：当天活跃条目 */
        private List<ItemVO> items = new ArrayList<>();
        /** 延续建议：未完结且今天还没有流水的条目 */
        private List<ItemVO> carryCandidates = new ArrayList<>();
        private String date;
        /**
         * 当天各条目的投入时段明细。
         *
         * <p>随日视图一次返回而不是让界面逐条目再查：条目数没有上限，
         * N 次请求会把「打开日视图」变成一次小型请求风暴（首页那种坑已经记在案）。
         */
        private List<ItemTimeVO> times = new ArrayList<>();
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

    /**
     * 聚合快照（发布时冻结进 content_json；阶段三起 schemaVersion=2）。
     *
     * <p>读旧快照必须继续可用：V1 的历史版本行里存的是不含工时维度的 JSON，
     * 反序列化后 {@code time} 为 null，界面据此显示「本期未記錄投入時間」而不是全 0——
     * 「没记录」和「记录了但为零」是两件事，混起来就是把缺失误报成结论。
     */
    @Data
    public static class Snapshot {
        private Integer schemaVersion = 2;
        private String periodType;
        private String periodStart;
        private String periodEnd;
        private List<Group> groups = new ArrayList<>();
        private Totals totals = new Totals();
        /** 阶段三工时维度汇总（确定性聚合，AI 不参与任何计数） */
        private TimeTotals time;

        @Data
        public static class Group {
            private String category;
            private String categoryLabel;
            private List<Entry> items = new ArrayList<>();
            /** 本分类期间投入分钟 */
            private Integer minutes;
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
            /** 期间投入分钟 = 精确时段 + 手工工时回退；null 表示两者都没有 */
            private Integer minutes;
            /** 分钟来源：segment=精确时段 manual=手工工时 none=无；精度不同必须可见 */
            private String minutesSource;
            /** 条目当期实际发生的时段区间（历史版本读取时来自冻结快照，不受后续补录影响） */
            private List<Segment> segments = new ArrayList<>();
        }

        /** 冻结在快照里的一段投入（展示用，比时段表本体少归属字段） */
        @Data
        public static class Segment {
            private String workDate;
            private String startTime;
            private String endTime;
            private Boolean crossesMidnight;
            private Integer durationMinutes;
            private String note;
        }

        @Data
        public static class Totals {
            private int total;
            private int done;
            private int doing;
            private int todo;
            private int blocked;
            /** 阶段三新增两桶：老快照反序列化后为 0，等同「未使用过该状态」，不造假数据 */
            private int cancelled;
            private int deferred;
        }

        /**
         * 工时汇总。
         *
         * <p>两条口径必须由服务端钉死（前端不得二次计算）：
         * ① 日均分母 = <b>有投入的天数</b>，不是周期自然天数——否则周末与请假日会把日均拉成假数字；
         * ② 精确时段与手工工时<b>分列</b>后再相加，两者精度不同，混成一个总数就是假精确。
         */
        @Data
        public static class TimeTotals {
            private int totalMinutes;
            /** 来自时段表（精确） */
            private int preciseMinutes;
            /** 来自条目 work_hours 回退（估算） */
            private int manualFallbackMinutes;
            private int activeDays;
            private int avgMinutesPerActiveDay;
            private String peakDate;
            private Integer peakMinutes;
            private List<TimeByCategory> byCategory = new ArrayList<>();
            private List<TimeByDay> byDay = new ArrayList<>();
            private List<TimeByItem> topItems = new ArrayList<>();
        }
    }

    /**
     * 工时汇总投影：分类占比一行。
     *
     * <p>label 与 code 一起给前端：分类词表属于岗位模板，前端手上只有 code 时只能显示英文键，
     * 而让它再去猜 label 就会与快照分组标题分叉成两种叫法。
     */
    @Data
    public static class TimeByCategory {
        private String category;
        private String categoryLabel;
        private Long minutes;
    }

    /** 工时汇总投影：单日投入（只给有投入的日期，补 0 占位是展示层的事） */
    @Data
    public static class TimeByDay {
        private String workDate;
        private Long minutes;
    }

    /** 工时汇总投影：事项投入成本（快照按分钟降序取 Top N 后填入 TimeTotals.topItems） */
    @Data
    public static class TimeByItem {
        private Long itemId;
        private String title;
        private Long minutes;
    }

    /* ==================== 阶段三：投入时段 ==================== */

    @Data
    public static class TimeEntryForm {
        /** 归属日 yyyy-MM-dd；空 = 服务端按业务时区今天 */
        private String workDate;
        /** 'HH:mm'；与 endTime 必须同时有或同时无（与 ck_cpm_time_range 同一约束） */
        private String startTime;
        private String endTime;
        /** 结束时刻属次日；不声明却给出倒序区间一律拒绝，不猜 */
        private Boolean crossesMidnight;
        /** 显式覆盖耗时（分钟）；为空则由服务端按起止算出后固化 */
        private Integer durationMinutes;
        @Size(max = 200)
        private String note;
        /** 更新时必带：乐观锁版本 */
        private Integer version;
    }

    @Data
    public static class TimeEntryVO {
        private Long id;
        private Long itemId;
        private String workDate;
        private String startTime;
        private String endTime;
        private Boolean crossesMidnight;
        private Integer durationMinutes;
        private String note;
        private Integer version;
    }

    /** 日视图回给界面的「条目 → 当日时段」映射（避免前端逐条目再发一次请求） */
    @Data
    public static class ItemTimeVO {
        private Long itemId;
        private List<TimeEntryVO> segments = new ArrayList<>();
        private Integer dayMinutes;
        private Integer totalMinutes;
    }

    /* ==================== 阶段三：版本与日报 ==================== */

    @Data
    public static class RevisionVO {
        private Integer revisionNo;
        private String publishedAt;
        private String publisherName;
        private String publisherEmpNo;
        private String changeNote;
        private Boolean current;
        private Integer schemaVersion;
        /** 修订说明之外的内容差异条数：让「这一版比上一版多了什么」在列表就能看见 */
        private Integer itemDelta;
    }

    /**
     * 修訂重發布表單。
     *
     * <p>刻意<b>不</b>要求客户端提供 requestKey：修订的幂等单元是「内容 + 修订说明」本身——
     * 同一份内容重复提交就不该长出 V3，客户端传一个每次都不一样的 key 反而会把这件事变成
     * 前端的责任。服务端按 (reportId, 内容摘要, 说明) 派生 key，超时重发命中唯一键即回原版本。
     */
    @Data
    public static class RepublishForm {
        @NotNull
        private Long reportId;
        @NotBlank
        @Size(max = 200)
        private String changeNote;
        @Size(max = 2000)
        private String summary;
        /** 摘要是否 AI 起草（披露标记；数字永远来自聚合） */
        private Boolean aiSummary;
    }

    /**
     * 日报投影。
     *
     * <p>日报<b>不是</b> {@code biz_cpm_report} 的一行（period_type 的 CHECK 里没有 'day'）：
     * 它就是条目在某一天的投影，读的是同一批事实。给它发布动作等于给每个人每天多加一个打卡任务，
     * 与本模块「低录入成本 + 反内卷」的立身之本直接冲突。
     *
     * <p>刻意只给一份 {@code snapshot}，不再并列一个 items 列表：同一天的事实出现两种表达时，
     * 界面两处显示的条数就可能不一致，而那种差异从来不会被当成缺陷去查。
     */
    @Data
    public static class DailyVO {
        private String date;
        /** 与周期快照同构（periodType='day'，start=end=当日），含工时维度 */
        private Snapshot snapshot;
        /** 被查看的人是否为本人：上级看下属日报时界面要标出「這是 XX 的日报」 */
        private Boolean self;
        private String ownerName;
        private String ownerEmpId;
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
        /** 阶段三：当前生效版本号；NULL = 阶段二遗留的旧发布（无版本行，界面标「歷史發送快照」） */
        private Integer revisionNo;
        private Long publishedRevisionId;
        /** 草稿与最近一次发布内容不一致：界面据此提示「存在未發布變更」，而不是让用户自己猜 */
        private Boolean hasUnpublishedChanges;
        private List<RevisionVO> revisions = new ArrayList<>();
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
