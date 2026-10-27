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

    /* ==================== 阶段二：甘特图调期 ==================== */

    /** 甘特图查询条件（三视角 + 筛选 + 分页） */
    @Data
    public static class GanttQuery {
        /** personal / single / global */
        private String mode;
        private Long reqId;
        private Integer page;
        private Integer size;
        private String keyword;
        private Long projectId;
        private String iterationCode;
        private Long ownerUserId;
        private String taskType;
        private String status;
        private Boolean onlyOverdue;
        private Boolean onlyUnscheduled;
        private Boolean onlyMine;
    }

    /** 调期单项：只允许改计划起止，携带期望版本做乐观锁 */
    @Data
    public static class TaskPlanItem {
        private Long taskId;
        private Integer expectedPlanVersion;
        /** yyyy-MM-dd */
        private String planStartDate;
        /** yyyy-MM-dd */
        private String planFinishDate;
    }

    /** 调期批量（一次最多 100 项、任务不重复，整批原子） */
    @Data
    public static class TaskPlanBatch {
        /** 客户端幂等请求ID（重试保持不变） */
        private String clientRequestId;
        private List<TaskPlanItem> items;
    }
}
