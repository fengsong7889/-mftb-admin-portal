package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.List;

/**
 * 会议纪要接口的出入参（与前端 src/api/meetingMinutes.ts 逐字段对齐）。
 *
 * <p>时间口径沿用会议域约定：出参由 {@code JacksonConfig} 统一序列化成
 * 'yyyy-MM-dd HH:mm:ss' 字符串（前端直接展示，不再 new Date）；
 * 正文里的 nextMeetingAt/dueDate 是纪要内容的一部分，按字符串存储与校验，不参与时区换算。
 *
 * <p>请求体里没有 recorderUserId/organizerId：记录人由服务端从 JWT 解析，
 * 相信前端传的"我是谁"等于允许任何人替别人署名记纪要。
 */
public final class MeetingMinutesDto {

    private MeetingMinutesDto() {
    }

    /* ==================== 入参 ==================== */

    /** 新建与编辑共用：新建带 bookingId，编辑按路径 id 定位并必须带回 version */
    @Data
    public static class Form {
        private Long bookingId;
        private MeetingMinutesContent content;
        /**
         * 行动项与跟进事项（v2 独立成表，正文 JSON 不再存这两类）。
         * <p>按位置即身份：同一 kind 的第 N 条在多次保存间保持同一行，状态与处理结果不会被覆盖。
         */
        private List<ItemForm> items = new ArrayList<>();
        /** 关联的纪要 id（只传 id，标题/时间由服务端回查生成快照，不信前端传的“引自哪场会”） */
        private List<Long> linkedMinutesIds = new ArrayList<>();
        /**
         * 审核为“实际已参会”的员工（签到补录）：有些人到了但没点钉钉签到，
         * 纪要人就该能把他们改为已参会，而不是让缺席名单永远错着。
         */
        private List<Long> markPresentUserIds = new ArrayList<>();
        /** 幂等键：一次提交一个，重放同一提交不会长出第二条纪要 */
        private String requestKey;
        /** 乐观锁：编辑必填，与服务端不一致即拒绝（不静默覆盖别人的修改） */
        private Integer version;
        /**
         * 乐观锁的契约别名（方案里写的是 expectVersion）。两个都收、version 优先：
         * 老页面继续传 version，按方案文档接入的调用方传 expectVersion，不因字段名把请求判成 0。
         */
        private Integer expectVersion;
    }

    /** 发布只引用已经保存的草稿版本，禁止客户端直接上传一份未经保存校验的正式文档。 */
    @Data
    public static class PublishForm {
        @NotNull(message = "缺少草稿版本")
        @Min(value = 0, message = "草稿版本不正確")
        private Integer version;
        @NotBlank(message = "缺少本次發布識別碼")
        @Size(max = 64, message = "發布識別碼最多 64 字")
        private String requestKey;
        @Size(max = 200, message = "修訂說明最多 200 字")
        private String changeNote;
    }

    /** 事项入参：kind=ACTION 行动项 / FOLLOW 跟进事项 */
    @Data
    public static class ItemForm {
        private String kind;
        private String content;
        private Long ownerUserId;
        /** yyyy-MM-dd；空=未定时限 */
        private String dueDate;
    }

    /** 负责人/记录人/行政更新处理结果 */
    @Data
    public static class ResolveForm {
        /** completed=已完成 partial=部分完成 cannot=无法完成 */
        private String result;
        /** 结果说明；cannot 必填（“为什么没办成”比“没办成”本身更重要） */
        private String note;
        /** 新版事项的并发校验，不能把办理结果覆盖到已被重新指派的事项。 */
        private Integer version;
    }

    @Data
    public static class SendForm {
        /** 正式发送必须显式绑定已发布版本，同一版本可有多个发送批次。 */
        private Long revisionId;
        /** 免登链接可转发风险必须由发送人确认。 */
        private Boolean acknowledgePublicLink;
        /** 群机器人渠道 id；为空表示本批只发个人。服务端按 id 复核渠道存在且启用，不信前端结论 */
        private Long groupChannelId;
        /** 收件人 sys_user.id（可含非参会人） */
        private List<Long> receiverUserIds = new ArrayList<>();
        private String requestKey;
        private Integer version;
        /** 乐观锁别名（与 Form.expectVersion 同口径） */
        private Integer expectVersion;
        /**
         * 方案里的“同时通知全部参会人”：为 true 时服务端把本场参会人并入收件人，
         * 前端“一键带入”只是把这个集合提前展示出来，最终名单仍以服务端并集为准。
         */
        private Boolean alsoNotifyAttendees;
    }

    @Data
    public static class RevokeForm {
        private Integer version;
        /** 乐观锁别名（与 Form.expectVersion 同口径） */
        private Integer expectVersion;
    }

    /* ==================== 出参 ==================== */

    @Data
    public static class VO {
        /** false 表示这场会还没有纪要：接口按成功返回骨架，前端据此渲染"录入"态而不是报错 */
        private boolean exists;
        private Long id;
        private String minutesNo;
        private Long bookingId;
        private String bookingNo;
        private String meetingTitle;
        private String meetingTimeText;
        private String roomText;
        private String organizerName;
        private Long recorderUserId;
        private String recorderEmpNo;
        private String recorderName;
        private MeetingMinutesContent content;
        private String digest;
        /** draft/sent */
        private String status;
        private Integer sendCount;
        private String lastSendAt;
        private Integer version;
        private Long publishedRevisionId;
        private Integer publishedRevisionNo;
        private String publishedAt;
        private Boolean hasUnpublishedChanges;
        private Boolean canReadDraft;
        private Boolean canPublish;
        private Boolean canManageSends;
        private Boolean publicationEnabled;
        private Boolean cardEnabled;
        /** 默认查看正式文档，content 仅在获准读草稿时返回工作内容。 */
        private MeetingMinutesDocument document;

        /** 当前登录人能否编辑/发送（服务端算，前端不自己判身份） */
        private Boolean canEdit;
        private Boolean canSend;
        /**
         * 不能编辑的原因（canEdit=false 时才有值）：PERMISSION=没权限，MEETING_NOT_RECORDED=这场会还没开始或已取消/释放。
         * <p>必须分开：两者都只表现为"按钮没了"，但用户该做的事完全不同——一个要找管理员开权限，
         * 另一个是压根还不到记纪要的时候。合并成一句提示就是把用户支使去敲错的门。
         */
        private String editLockReason;
        /** 纪要能力开关：关闭时前端隐藏入口，不在前端写死 */
        private Boolean minutesEnabled;
        /**
         * 免登链接使用的站点地址（取自「通知配置」绑定应用的 base_url）。
         * <p>null 表示没配置，卡片里不会带「查看完整紀要」；前端据此在发送前提示。
         */
        private String linkBaseUrl;
        /**
         * 该站点地址是否“看起来可从外网访问”：localhost / 192.168.x / 10.x 等为 false。
         * <p>false 不阻止发送（开发环境仍要测），但发送面板必须明确警告“手机打不开”。
         */
        private Boolean linkBasePublic;

        /** 周期系列的纪要导航；单场会议为空 */
        private List<SeriesNodeVO> series = new ArrayList<>();
        /**
         * 建议缺席名单（仅 exists=false 的骨架返回）：方案要求“自动带出的会议資訊 + 建议缺席名单”。
         * <p>服务端只回原因码（DECLINED/NO_CHECKIN），文案由前端按当前语言翻译——
         * 后端拼中文会让英文界面出现半句中文，这类“文案在服务端固化”的坑已经踩过一次。
         */
        private List<SuggestedAbsenteeVO> suggestedAbsentees = new ArrayList<>();

        /** 行动项与跟进事项（含状态/处理结果，供页面直接渲染“谁还没办”） */
        private List<ItemVO> items = new ArrayList<>();
        /** 关联纪要（带来源快照） */
        private List<LinkVO> links = new ArrayList<>();
        /** 当前草稿正文引用的附件元数据（按引用顺序；已失效的号不展示，访问仍逐行裁决） */
        private List<AttachmentVO> attachments = new ArrayList<>();
        /** 本人是否对本次会议的某个事项负责：负责人回来更新状态不要求菜单写权限 */
        private Boolean itemOwner;

        private String createdBy;
        private String createdAt;
        private String updatedBy;
        private String updatedAt;
    }

    /** 发布版本历史不含草稿、幂等摘要或内部投递名单。 */
    @Data
    public static class RevisionVO {
        private Long id;
        private Integer revisionNo;
        private String changeNote;
        private String publisherName;
        private String publisherEmpNo;
        private String publishedAt;
        private MeetingMinutesDocument document;
    }

    /** 建议缺席人（原因码由前端翻译） */
    @Data
    public static class SuggestedAbsenteeVO {
        private Long userId;
        private String name;
        private String empNo;
        /** DECLINED=已婉拒 NO_CHECKIN=已结束但未签到 */
        private String reasonCode;
    }

    /** 事项出参 */
    @Data
    public static class ItemVO {
        private Long id;
        private String kind;
        private Integer seq;
        private String content;
        private Long ownerUserId;
        private String ownerName;
        private String ownerEmpNo;
        /** yyyy-MM-dd */
        private String dueDate;
        /** pending/done */
        private String status;
        /** completed/partial/cannot */
        private String result;
        private String resolutionNote;
        private String doneAt;
        private String doneByName;
        /** 已过时限且未处理（前端标红，不靠前端算日期） */
        private Boolean overdue;
        /** 当前登录人能否更新这条的状态（负责人本人 / 记录人 / 组织者 / 行政） */
        private Boolean canResolve;
        private Integer version;
        private String topicKey;
        private String deliverable;
    }

    /** 关联纪要出参（展示一律用快照） */
    @Data
    public static class LinkVO {
        private Long minutesId;
        private String minutesNo;
        private String bookingNo;
        private String title;
        private String timeText;
    }

    /**
     * 附件元数据：只回展示与访问需要的字段，对象键/磁盘路径/存储凭据一律不下发。
     * <p>previewKind：image=站内放大，pdf=浏览器直开，office=查看时转 PDF，none=仅下载。
     */
    @Data
    public static class AttachmentVO {
        private String attachmentNo;
        private String fileName;
        private String mimeType;
        private Long sizeBytes;
        private String previewKind;
        private String uploaderName;
        private String uploadedAt;
    }

    /** 站内附件访问票据：新标签页/钉钉外部浏览器带不了 Authorization，用短时效票据换文件。 */
    @Data
    public static class AttachmentAccess {
        private String attachmentNo;
        private String purpose;
        private String ticket;
        private String expiresAt;
    }

    /* ==================== 行政检索 ==================== */

    @Data
    public static class AdminQuery {
        private String keyword;
        /** yyyy-MM-dd */
        private String startDate;
        private String endDate;
        private String recorderKeyword;
        /** draft/sent */
        private String status;
        /** 有无待办：pending / overdue / empty */
        private String itemState;
        private Integer page;
        private Integer size;
    }

    /** 行政侧纪要列表行：一行能回答“哪场会、谁记的、发了几次、还有几件事没办” */
    @Data
    public static class AdminRow {
        private Long minutesId;
        private Long bookingId;
        private String minutesNo;
        private String bookingNo;
        private String meetingTitle;
        private String meetingTimeText;
        private String roomText;
        private String recorderName;
        private String recorderEmpNo;
        private String status;
        private Integer sendCount;
        private String lastSendAt;
        private Integer itemTotal;
        private Integer itemPending;
        private Integer itemOverdue;
        private String digest;
        private Long publishedRevisionId;
        private Integer publishedRevisionNo;
        private String publishedAt;
        private Boolean hasUnpublishedChanges;
    }

    /** 列表 + 统计（统计口径必须跟搜索条件，否则用户会先看到全量数字） */
    @Data
    public static class AdminPage {
        private List<AdminRow> list = new ArrayList<>();
        private Long total;
        private Long pendingItems;
        private Long overdueItems;
        private Long sentMinutes;
    }

    @Data
    public static class SeriesNodeVO {
        private Long bookingId;
        private Integer seriesSeq;
        private String title;
        private String startTime;
        private String status;
        private boolean hasMinutes;
        private Long minutesId;
        /** 当前查看的是不是这一场 */
        private boolean current;
    }

    @Data
    public static class SendVO {
        private Long id;
        private Long revisionId;
        private Integer revisionNo;
        private String messageType;
        private String buttonTitle;
        private Long minutesId;
        private Integer batchSeq;
        private String minutesNo;
        private String bookingNo;
        private String title;
        private MeetingMinutesContent contentSnapshot;
        private String markdownSnapshot;
        private Long groupChannelId;
        private String groupChannelName;
        private Integer receiverCount;
        /** pending/sending/success/partial/failed/skipped */
        private String sendStatus;
        private Integer successCount;
        private Integer failedCount;
        private Integer skippedCount;
        private String errorMsg;
        private String operatorName;
        private String operatorEmpNo;
        private String sentAt;
        /** 免登只读链接的相对路径（HashRouter，query 必须写在 #/ 之内才会被路由识别） */
        private String viewUrl;
        private String linkExpireAt;
        /** 链接是否已被记录人作废 */
        private Boolean linkRevoked;
        private List<DeliveryVO> deliveries = new ArrayList<>();
    }

    @Data
    public static class DeliveryVO {
        private Long id;
        /** GROUP / USER */
        private String targetType;
        private String receiverName;
        private String receiverEmpNo;
        private String receiverDepartment;
        private String groupName;
        /** 收件人是否绑定了钉钉（群行恒为 true） */
        private Boolean dingtalkBound;
        private String sendStatus;
        private Integer retryCount;
        private String errorMsg;
        private String updatedAt;
    }

    @Data
    public static class SendResult {
        private Long sendId;
        private Long revisionId;
        private Integer revisionNo;
        private Integer batchSeq;
        /** 进入投递队列的收件人数（不含群） */
        private int queued;
        /** 留痕但未发送的人数（未绑定钉钉、场景未启用等，原因见 deliveries） */
        private int skipped;
        /** 工作通知场景已启用并绑定了企业应用 */
        private boolean scenarioActive;
        /** 群是否进了投递队列 */
        private boolean groupQueued;
        private String groupChannelName;
        private String viewUrl;
        /** 本批链接用的站点地址与可达性（与 VO 同口径，便于发送后立刻核对） */
        private String linkBaseUrl;
        private Boolean linkBasePublic;
        private List<DeliveryVO> deliveries = new ArrayList<>();
    }

    /** 群候选：只回 id 与名称，webhook/secret/手机号一律不下发 */
    @Data
    public static class GroupOptionVO {
        private Long id;
        private String name;
    }

    /**
     * 免登只读视图。
     *
     * <p>字段限定为 姓名/工号 与本批正文：不含手机号、参会人钉钉 ID、投递明细等内部信息。
     * 免登链接可能被转发，输出面越窄，外泄半径越小。
     */
    @Data
    public static class PublicView {
        private boolean valid;
        private String message;
        private String minutesNo;
        private String title;
        private String bookingNo;
        private String meetingTimeText;
        private String roomText;
        private String organizerName;
        private String recorderName;
        private String recorderEmpNo;
        private Integer batchSeq;
        private String sentByName;
        private String sentAt;
        private String expireAt;
        private MeetingMinutesContent content;
        private Integer revisionNo;
        private MeetingMinutesDocument document;
        /** 本批快照引用的附件元数据：免登页只展示这一组，访问时再按令牌复核 */
        private List<AttachmentVO> attachments = new ArrayList<>();
    }
}
