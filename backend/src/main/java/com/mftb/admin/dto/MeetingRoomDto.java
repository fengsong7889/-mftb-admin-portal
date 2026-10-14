package com.mftb.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 会议室档案域的出入参契约。
 *
 * <p>约定（与 {@link VehicleDto} 同一口径）：
 * <ul>
 *   <li>id 类字段是服务端稳定 ID，名称类字段只是展示快照，权限与归属判定一律不认名称；</li>
 *   <li>出参时间统一为 {@code 'yyyy-MM-dd HH:mm:ss'} 字符串。全局 Jackson 会把
 *       {@code LocalDateTime} 转成毫秒时间戳，VO 用 String 是由服务层显式格式化决定的，
 *       前端拿到就能直接展示，不再二次解析（混用会静默变成 Invalid date）；</li>
 *   <li>入参时间用 {@code LocalDateTime}，前端必须传 ISO 带 {@code T} 分隔的形式。</li>
 * </ul>
 *
 * <p>{@code *Configured} 后缀字段是"这条规则来自房间自身还是全局默认"的显式回传：
 * 档案页要区分「行政真的配过」和「系统兜底值」，否则页面上看到的数字无法判断能不能改。
 */
public final class MeetingRoomDto {

    private MeetingRoomDto() {
    }

    /** 列表查询条件（分页与排序由服务端白名单控制，不接收前端拼装的 order by） */
    @Data
    public static class Query {
        private Integer page = 1;
        private Integer size = 20;
        /** 编号 / 名称 / 位置描述 */
        private String keyword;
        private String campus;
        private String building;
        private String floorCode;
        private Integer minCapacity;
        /** 设备代码，多个为"且"关系 */
        private List<String> facilities;
        /** active/maintenance/disabled */
        private String status;
        /** 只看可预约的房间（预约页固定传 true） */
        private Boolean bookableOnly;
        /** 指定房间集合（忙闲矩阵按选中的房间取数，留空=全部） */
        private List<Long> roomIds;
    }

    /** 新增/编辑入参：不含 id 之外的审计字段，操作人一律服务端从 JWT 取 */
    @Data
    public static class Form {
        @NotBlank(message = "請填寫會議室編號")
        @Size(max = 32, message = "會議室編號最長 32 字")
        private String roomNo;

        @NotBlank(message = "請填寫會議室名稱")
        @Size(max = 64, message = "會議室名稱最長 64 字")
        private String roomName;

        @Size(max = 64, message = "園區最長 64 字")
        private String campus;

        @Size(max = 64, message = "樓棟最長 64 字")
        private String building;

        @Size(max = 32, message = "樓層最長 32 字")
        private String floorCode;

        @Size(max = 200, message = "位置描述最長 200 字")
        private String locationDesc;

        @NotNull(message = "請填寫容納人數")
        @Min(value = 1, message = "容納人數至少 1 人")
        private Integer capacity;

        /** 设备代码列表，服务端转成逗号包裹格式落库 */
        private List<String> facilities;

        private List<String> photoUrls;

        /** active/maintenance/disabled */
        private String status;

        private Boolean bookable;

        /** "HH:mm"，留空表示回落全局默认 */
        private String bookableStartTime;

        private String bookableEndTime;

        private Integer minDuration;

        private Integer maxDuration;

        private Boolean checkinRequired;

        private Integer releaseAfterMinutes;

        /** 忙闲视图是否脱敏主题 */
        private Boolean hideTitle;

        /** 房间管理员 sys_user.id 列表 */
        private List<Long> adminUserIds;

        @Size(max = 500, message = "備註最長 500 字")
        private String remark;

        /**
         * 编辑时的期望版本号（新增时忽略）。
         * <p>没有它，两个行政同时打开同一间房改规则就是后保存的静默覆盖前保存的；
         * 服务层比对失败必须报错，不允许"以最新提交为准"。
         */
        private Integer expectVersion;
    }

    /** 列表行 / 详情通用视图 */
    @Data
    public static class VO {
        private Long id;
        private String roomNo;
        private String roomName;
        private String campus;
        private String building;
        private String floorCode;
        private String locationDesc;
        /** 园区+楼栋+楼层的拼接展示串，通知卡片与预约页直接用 */
        private String locationText;
        private Integer capacity;
        private List<String> facilities;
        private List<String> photoUrls;
        private String status;
        private Boolean bookable;
        private String bookableStartTime;
        private String bookableEndTime;
        private Integer minDuration;
        private Integer maxDuration;
        private Boolean checkinRequired;
        private Integer releaseAfterMinutes;
        private Boolean hideTitle;
        private Integer version;
        private List<Long> adminUserIds;
        private String adminUserNames;
        private String remark;
        /** 生效值来源标记：true=房间自身配置，false=回落全局默认（行政需要知道改哪里） */
        private Boolean windowConfigured;
        private Boolean durationConfigured;
        /** 未来占用数（档案详情页判断能否停用/删除） */
        private Integer futureBookingCount;
        private String createdBy;
        private String createdAt;
        private String updatedBy;
        private String updatedAt;
    }

    /** 状态变更（列表行 Switch）：与编辑权限同一动作，但只携带状态与版本 */
    @Data
    public static class StatusChange {
        /** active/maintenance/disabled */
        @NotBlank(message = "請選擇目標狀態")
        private String status;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    /** 删除入参：必须留原因，房间档案被删后它是唯一能回答"为什么这间房没了"的东西 */
    @Data
    public static class DeleteForm {
        @NotBlank(message = "請填寫刪除原因")
        @Size(max = 300, message = "刪除原因最長 300 字")
        private String reason;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    /* ==================== 忙闲视图 ==================== */

    /** 忙闲矩阵入参：一次请求取回多间房在窗口内的占用情况 */
    @Data
    public static class AvailabilityQuery {
        @NotNull(message = "請選擇查詢起始時間")
        private LocalDateTime from;

        @NotNull(message = "請選擇查詢結束時間")
        private LocalDateTime to;

        /** 留空=全部可预约房间；预约页按需只传筛中的房间 */
        private List<Long> roomIds;

        private Integer minCapacity;

        private List<String> facilities;
    }

    /** 单个占用段 */
    @Data
    public static class Slot {
        private Long roomId;
        private String bookingNo;
        /** hide_title=1 的房间返回「已占用」而不是真实主题 */
        private String title;
        private String organizerName;
        private String startTime;
        private String endTime;
    }

    /** 一间房的忙闲结果 */
    @Data
    public static class Availability {
        private Long roomId;
        private String roomNo;
        private String roomName;
        private String locationText;
        private Integer capacity;
        private List<String> facilities;
        private Boolean bookable;
        private String status;
        /** 房间自身可预约窗（已回落全局默认后的生效值） */
        private String bookableStartTime;
        private String bookableEndTime;
        private List<Slot> slots;
    }

    /** 会议室统计卡（列表页搜索区下方，口径跟随当前筛选条件） */
    @Data
    public static class Stats {
        private long total;
        private long active;
        private long bookable;
        private long seatsTotal;
    }

    /** 列表页响应：分页数据 + 同口径统计 */
    @Data
    public static class PageWithStats {
        private PageResult<VO> page;
        private Stats stats;
    }

    /** 单日的占用视图（房间详情"未来预约"） */
    @Data
    public static class UpcomingVO {
        private Long bookingId;
        private String bookingNo;
        private String title;
        private String organizerName;
        private String startAt;
        private String endAt;
        private String status;
    }
}
