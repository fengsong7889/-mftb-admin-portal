package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 会议预约域的出入参契约。
 *
 * <p><b>入参里没有 organizerId</b>：组织者、签到人、取消人、释放人一律服务端从 JWT 取。
 * 任何"前端传 userId 表示我是谁"的写法都可以被伪造，代订与越权读单会从这一个口子长出来。
 *
 * <p>出参时间为 {@code 'yyyy-MM-dd HH:mm:ss'} 字符串（服务层显式格式化），
 * 入参时间为 {@code LocalDateTime}（前端必须传 ISO 带 {@code T} 分隔），
 * 两种形态混用会静默变成 Invalid date，字段类型注释是前后端唯一的对齐依据。
 */
public final class MeetingBookingDto {

    private MeetingBookingDto() {
    }

    /* ==================== 查询 ==================== */

    /**
     * 列表查询条件。
     *
     * <p>{@code scope} 决定行级数据范围，服务端解释而不是前端拼条件：
     * mine=我发起的，attended=我参与的（含我发起），all=全量（需要 meeting-record 菜单，
     * 由 {@code MeetingAccessGuard} 收敛，普通用户传 all 也只会拿到自己相关的数据）。
     */
    @Data
    public static class Query {
        private Integer page = 1;
        private Integer size = 20;
        private String scope = "attended";
        /** 时间窗：只看与 [from, to] 有交集的会议 */
        private LocalDateTime from;
        private LocalDateTime to;
        private Long roomId;
        /** booked/checked_in/finished/cancelled/released */
        private String status;
        /** general/rdm_review/interview/training */
        private String bizType;
        private Long organizerId;
        private Long departmentId;
        /** 单号 / 主题 */
        private String keyword;
        /** Tab 徽标口径：pending=待开，ongoing=进行中，done=已结束 */
        private String group;
    }

    /* ==================== 写入 ==================== */

    /** 新建预约入参（免审批，提交即占用窗口） */
    @Data
    public static class CreateForm {
        @NotBlank(message = "請填寫會議主題")
        @Size(max = 200, message = "會議主題最長 200 字")
        private String title;

        @NotNull(message = "請選擇會議室")
        private Long roomId;

        @NotNull(message = "請選擇開始時間")
        private LocalDateTime startTime;

        @NotNull(message = "請選擇結束時間")
        private LocalDateTime endTime;

        /** 必参（参会人 sys_user.id） */
        private List<Long> attendeeUserIds;

        /** 选参（只提醒不占额度，日程里同样可见） */
        private List<Long> optionalUserIds;

        /** 外部参会人姓名，无系统账号 */
        @Size(max = 500, message = "外部參會人最長 500 字")
        private List<@Size(max = 64, message = "外部參會人姓名最長 64 字") String> externalAttendees;

        @Size(max = 1000, message = "會議議程最長 1000 字")
        private String description;

        @Size(max = 500, message = "線上會議鏈接最長 500 字")
        private String onlineMeetingUrl;

        /** 关联业务类型，留空按 general 处理 */
        private String bizType;

        private Long bizId;

        private String bizNo;

        private String bizUrl;

        /**
         * 行政代订：实际使用人的 sys_user.id，仅 meeting-record:edit 持有者可传。
         *
         * <p>只接受 id、不接受姓名快照：姓名由服务端回查，否则前端可以伪造
         * 「實際使用人」把台账写成任意名字。组织者永远取登录态当前人，同样不信前端。
         */
        private Long delegateForId;

        /** 幂等键：前端生成 UUID，重复提交只生效一次 */
        @Size(max = 64, message = "requestKey 最長 64 字")
        private String requestKey;
    }

    /**
     * 修改预约入参。
     *
     * <p>{@code version} 必填：改期是"释放旧窗口 + 占用新窗口"的两步动作，
     * 不带版本就无法发现"你在改、别人也在改"的并发覆盖。
     */
    @Data
    public static class UpdateForm {
        @NotBlank(message = "請填寫會議主題")
        @Size(max = 200, message = "會議主題最長 200 字")
        private String title;

        @NotNull(message = "請選擇會議室")
        private Long roomId;

        @NotNull(message = "請選擇開始時間")
        private LocalDateTime startTime;

        @NotNull(message = "請選擇結束時間")
        private LocalDateTime endTime;

        private List<Long> attendeeUserIds;

        private List<Long> optionalUserIds;

        @Size(max = 500, message = "外部參會人最長 500 字")
        private List<@Size(max = 64, message = "外部參會人姓名最長 64 字") String> externalAttendees;

        @Size(max = 1000, message = "會議議程最長 1000 字")
        private String description;

        @Size(max = 500, message = "線上會議鏈接最長 500 字")
        private String onlineMeetingUrl;

        private String bizType;

        private Long bizId;

        private String bizNo;

        private String bizUrl;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;

        /** 变更说明：写进审计并随变更通知一起发给参会人 */
        @Size(max = 300, message = "變更說明最長 300 字")
        private String changeNote;
    }

    /** 取消预约：原因必填（"取消不留原因"等于让爽约统计与纠纷回溯失去凭据） */
    @Data
    public static class CancelForm {
        @NotBlank(message = "請填寫取消原因")
        @Size(max = 300, message = "取消原因最長 300 字")
        private String reason;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    /** 行政手动释放：同样强制原因，且与自动释放在事实列上分得开 */
    @Data
    public static class ReleaseForm {
        @NotBlank(message = "請填寫釋放原因")
        @Size(max = 300, message = "釋放原因最長 300 字")
        private String reason;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    /** 参会人响应邀约 */
    @Data
    public static class ResponseForm {
        @NotNull(message = "請選擇響應結果")
        private Boolean accept;

        @Size(max = 200, message = "響應說明最長 200 字")
        private String note;
    }

    /* ==================== 视图 ==================== */

    /** 列表行 / 详情通用视图 */
    @Data
    public static class VO {
        private Long id;
        private String bookingNo;
        private String title;
        private String status;
        /** 派生态展示用：pending/ongoing/finished/cancelled/released，由时间与状态共同算出 */
        private String phase;
        private String startTime;
        private String endTime;
        private String timeText;
        private Integer durationMinutes;
        private Long roomId;
        private String roomNo;
        private String roomName;
        private String roomLocation;
        private Boolean roomBookable;
        private Long organizerId;
        private String organizerEmpNo;
        private String organizerName;
        private Long departmentId;
        private String departmentName;
        private Integer attendeeCount;
        private String description;
        private String onlineMeetingUrl;
        private String externalAttendees;
        private String bizType;
        private Long bizId;
        private String bizNo;
        private String bizUrl;
        private Long delegateForId;
        private String delegateForName;
        /** 周期会议归属（M2）：单场为 null */
        private Long seriesId;
        private Integer seriesSeq;
        /** 当前登录人与这场会的身份：organizer/required/optional/none，前端据此决定按钮 */
        private String myRole;
        /** 我是否已响应：pending/accepted/declined/invalid，非参会人为 null */
        private String myResponse;
        private Boolean canEdit;
        private Boolean canCancel;
        private Boolean canRelease;
        private Boolean canCheckin;
        /** 可提前签到的时刻与自动释放截止时刻（由服务端按规则算出，前端不自己拼规则以免两处口径不同） */
        private String checkinOpenAt;
        private String checkinDeadlineAt;
        /** 组织者/行政可提前结束（进行中才有意义） */
        private Boolean canFinish;
        /** 房间是否需要签到保留（M2 生效，本期仅回显） */
        private Boolean checkinRequired;
        private String checkinAt;
        private String actualEndAt;
        private Integer noShow;
        private String cancelReason;
        private String releaseReason;
        private String releaseAt;
        /** 未绑定钉钉因而邀约未送达的人数（详情页显式提示） */
        private Integer notifySkippedCount;
        private Integer version;
        private String createdBy;
        private String createdAt;
        private String updatedBy;
        private String updatedAt;
        private List<AttendeeVO> attendees;
        private List<NotifyVO> notifies;
    }

    /** 参会人视图 */
    @Data
    public static class AttendeeVO {
        private Long id;
        private Long userId;
        private String empNo;
        private String name;
        private String departmentName;
        private String attendeeType;
        private String response;
        private String respondAt;
        private String notifyStatus;
        private String notifyNote;
        private String checkinAt;
        private String invalidReason;
    }

    /** 通知投递留痕视图 */
    @Data
    public static class NotifyVO {
        private Long id;
        private String eventCode;
        private String scenario;
        private String receiverName;
        private String receiverEmpNo;
        private Boolean dingtalkBound;
        private String sendStatus;
        private Integer retryCount;
        private String errorMsg;
        private String updatedAt;
    }

    /** 审计轨迹视图 */
    @Data
    public static class EventVO {
        private Long id;
        private String eventCode;
        private String reason;
        private String operatorName;
        private String operatorEmpNo;
        private String occurredAt;
        private String beforeJson;
        private String afterJson;
    }

    /**
     * 创建结果：免审批即时生效，返回新建的单 id 与单号。
     *
     * <p>冲突不在此结构中返回：并发抢位失败走 BusinessException，消息里带上
     * 占位的会议单号/主题/时段/组织者（与用车冲突提示同一口径）。
     * 因为"要么成功要么报错"，把 conflicts 放在成功响应里只会让前端多一个永远不会命中的分支。
     */
    @Data
    public static class CreateResult {
        private Long bookingId;
        private String bookingNo;
        /** 邀约投递是否已进入发送流程（场景未启用时为 false，前端据此提示） */
        private Boolean inviteQueued;
        /** 已留痕但未送达的人数（未绑定钉钉等），详情页提供可核对名单 */
        private Integer notifySkippedCount;
    }

    /** 我的日程单日条目 */
    @Data
    public static class ScheduleVO {
        private Long bookingId;
        private String bookingNo;
        private String title;
        private String date;
        private String startTime;
        private String endTime;
        private String roomName;
        private String roomLocation;
        private String status;
        private String phase;
        private String myRole;
        private String myResponse;
        private Boolean canCheckin;
    }

    /** 首页与"我的会议"顶部摘要 */
    @Data
    public static class MySummary {
        private long todayCount;
        private long upcomingCount;
        private long pendingResponseCount;
        /** 下一场会（无则为 null） */
        private String nextTitle;
        private String nextStartTime;
        private String nextRoomName;
    }

    /** 列表统计卡（口径必须与列表同一组条件，见 AGENTS.md §E.8） */
    @Data
    public static class Stats {
        private long total;
        private long pending;
        private long ongoing;
        private long finished;
        private long cancelled;
        private long released;
    }

    /** 列表页响应：分页数据 + 同口径统计 */
    @Data
    public static class PageWithStats {
        private PageResult<VO> page;
        private Stats stats;
    }
}
