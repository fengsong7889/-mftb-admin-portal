package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 排程请求体（阶段 5：依赖与工作日历）。
 * <p>关键路径、甘特条位置一律由服务端算，客户端不传排程结果——
 * 否则前端可以画出任何想给的工期与延期结论。
 */
public class RdmScheduleDTO {

    /** 新增依赖边 */
    @Data
    public static class Dependency {
        private Long reqId;
        private Long predTaskId;
        private Long succTaskId;
        /** 延迟工作日（可为负，表示允许前后任务重叠） */
        private Integer lagDays;
    }

    /** 日历条目（按人按日） */
    @Data
    public static class CalendarDay {
        /** yyyy-MM-dd */
        private String day;
        /** leave/overtime/custom */
        private String dayType;
        /** 当日可用工时（custom 必填；leave 视为 0） */
        private BigDecimal availableHours;
        private String reason;
    }

    /** 保存某人的日历例外（重复日期视为修订） */
    @Data
    public static class Calendar {
        private Long userId;
        private List<CalendarDay> days;
        /** 需要删除的日期（取消请假） */
        private List<String> removeDays;
    }
}
