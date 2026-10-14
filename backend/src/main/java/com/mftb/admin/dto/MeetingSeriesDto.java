package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 周期会议系列的出入参契约。
 *
 * <p>时间口径与预约域一致：出参时间一律 {@code 'yyyy-MM-dd HH:mm:ss'} 字符串
 * （全局 Jackson 会把 LocalDateTime 转成毫秒时间戳，VO 用 String 才能直接展示），
 * 入参用 {@code LocalDateTime}/{@code LocalDate}。
 */
public final class MeetingSeriesDto {

    private MeetingSeriesDto() {
    }

    /** 新建周期系列：模板字段 + 频次规则，服务端一次性物化全部实例 */
    @Data
    public static class CreateForm {
        @NotBlank(message = "請填寫會議主題")
        @Size(max = 200, message = "會議主題最長 200 字")
        private String title;

        @NotNull(message = "請選擇會議室")
        private Long roomId;

        @NotNull(message = "請選擇首次日期")
        private LocalDate startDate;

        /** "HH:mm"，与 time-end 一起决定每场的时段 */
        @NotBlank(message = "請選擇開始時間")
        private String timeStart;

        @NotBlank(message = "請選擇結束時間")
        private String timeEnd;

        /** daily/weekly */
        @NotBlank(message = "請選擇重複頻率")
        private String freq;

        @NotNull(message = "請填寫間隔數")
        @Min(value = 1, message = "間隔數至少 1")
        @Max(value = 30, message = "間隔數最多 30")
        private Integer intervalN;

        /** weekly 生效：周一~周日取值 1..7，如 [1,3,5] */
        private List<Integer> byWeekday;

        /** 结束日期与次数上限二选一即可，两者都给则先到者生效 */
        private LocalDate endDate;

        @Min(value = 1, message = "場次上限至少 1")
        @Max(value = 100, message = "場次上限最多 100")
        private Integer occurrenceLimit;

        private List<Long> attendeeUserIds;

        private List<Long> optionalUserIds;

        @Size(max = 500, message = "外部參會人最長 500 字")
        private List<String> externalAttendees;

        @Size(max = 1000, message = "會議議程最長 1000 字")
        private String description;

        @Size(max = 500, message = "線上會議鏈接最長 500 字")
        private String onlineMeetingUrl;

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

        /** 幂等键：一次提交生成一个，重放不会物化出第二批实例 */
        @Size(max = 64, message = "requestKey 最長 64 字")
        private String requestKey;
    }

    /** 取消系列：三档语义 + 必填原因 */
    @Data
    public static class CancelForm {
        /** this=仅此次（需带 bookingId）/ future=此次及以后 / all=全部 */
        @NotBlank(message = "請選擇取消範圍")
        private String scope;

        /** scope=this 时指定那一场实例 */
        private Long bookingId;

        @NotBlank(message = "請填寫取消原因")
        @Size(max = 300, message = "取消原因最長 300 字")
        private String reason;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    /** 修改系列模板：只影响未来实例，历史实例一律不动 */
    @Data
    public static class UpdateForm extends CreateForm {
        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;

        @Size(max = 300, message = "變更說明最長 300 字")
        private String changeNote;
    }

    /** 系列视图（含物化结果与实例列表） */
    @Data
    public static class VO {
        private Long id;
        private String seriesNo;
        private String freq;
        private Integer intervalN;
        private List<Integer> byWeekday;
        /** 前端可读的重复描述，如「每週 一、三、五」：自己拼必然与后端口径不一致 */
        private String freqText;
        private String timeStart;
        private String timeEnd;
        private String startDate;
        private String endDate;
        private Integer occurrenceLimit;
        private Integer generatedCount;
        private Integer skippedCount;
        private Long roomId;
        private String roomNo;
        private String roomName;
        private String roomLocation;
        private String title;
        private String description;
        private String onlineMeetingUrl;
        private String bizType;
        private Long bizId;
        private String bizNo;
        private String bizUrl;
        private Long organizerId;
        private String organizerName;
        private String organizerEmpNo;
        private String departmentName;
        private String status;
        private String cancelledScope;
        private String cancelReason;
        /** 下一次未开始的实例（列表页"下次开会"列） */
        private String nextStartTime;
        private String nextRoomName;
        private Integer version;
        private String createdBy;
        private String createdAt;
        private String updatedBy;
        private String updatedAt;
        private List<MeetingBookingDto.VO> instances;
        private List<PreviewVO> preview;
    }

    /** 实例预览（创建前按模板算一遍日期，不做冲突判定） */
    @Data
    public static class PreviewVO {
        private Integer seq;
        private String date;
        private String weekdayText;
        private String startTime;
        private String endTime;
    }

    /** 创建结果：冲突跳过的场次必须逐条列明，否则"每周例会某月少两场"无从解释 */
    @Data
    public static class CreateResult {
        private Long seriesId;
        private String seriesNo;
        private Integer generatedCount;
        private Integer skippedCount;
        private Boolean inviteQueued;
        private Integer notifySkippedCount;
        private List<SkippedVO> skipped;
    }

    /** 被跳过的场次与原因 */
    @Data
    public static class SkippedVO {
        private Integer seq;
        private String startTime;
        private String endTime;
        private String reason;
        /** 与哪场会冲突（可空：非冲突跳过时没有对象） */
        private String conflictBookingNo;
        private String conflictTitle;
        private String conflictOrganizer;
    }
}
