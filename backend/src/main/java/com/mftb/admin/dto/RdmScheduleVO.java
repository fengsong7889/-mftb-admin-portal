package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 排程视图（阶段 5：甘特、关键路径与资源负载）。
 */
public class RdmScheduleVO {

    /** 需求排程总览（甘特数据源） */
    @Data
    public static class Plan {
        private Long reqId;
        private String reqNo;
        private String title;
        private String status;
        /** 甘特窗口（含首尾，前端按天平铺） */
        private String windowStart;
        private String windowEnd;
        /** 窗口内工作日数（跳过周末与请假日） */
        private Integer workingDays;
        /** 依赖存在环：此时不给关键路径结论，避免画出一条假的最长路径 */
        private Boolean cyclic;
        /** 关键路径任务ID（按拓扑顺序） */
        private List<Long> criticalPath = new ArrayList<>();
        /** 按人摊派后的预计完成日与基线偏差天数最大的那条（延期归因入口） */
        private String forecastFinish;
        private List<Bar> bars = new ArrayList<>();
        private List<Link> links = new ArrayList<>();
        private List<Milestone> milestones = new ArrayList<>();
    }

    /** 一根甘特条 = 一个任务 */
    @Data
    public static class Bar {
        private Long taskId;
        private String taskNo;
        private String title;
        private String taskType;
        private String status;
        private Integer progress;
        private Long ownerUserId;
        private String ownerName;
        private BigDecimal planHours;
        private BigDecimal actualHours;
        /** 人工填报的计划起止（可能为空） */
        private String planStartDate;
        private String planFinishDate;
        /** 依赖 + 工作日历推算出的最早/最晚起止（yyyy-MM-dd） */
        private String earliestStart;
        private String earliestFinish;
        private String latestStart;
        private String latestFinish;
        /** 松弛工作日数（0=关键路径） */
        private Integer slackDays;
        private Boolean critical;
        /** 工期（工作日） */
        private Integer durationDays;
        private String actualStartTime;
        private String actualFinishTime;
        private Boolean overdue;
        /** 依赖缺失负责人：没负责人时日历无法按人排除请假，排程只能按默认工作日 */
        private Boolean ownerMissing;
        /** 前驱任务ID（前端画连线） */
        private List<Long> predecessors = new ArrayList<>();
    }

    /** 依赖连线 */
    @Data
    public static class Link {
        private Long id;
        private Long predTaskId;
        private Long succTaskId;
        private String depType;
        private Integer lagDays;
    }

    /** 依赖行（管理列表用） */
    @Data
    public static class Dependency {
        private Long id;
        private Long reqId;
        private Long predTaskId;
        private String predTaskTitle;
        private Long succTaskId;
        private String succTaskTitle;
        private String depType;
        private Integer lagDays;
        private String createdBy;
    }

    /** 里程碑节点（复用阶段 3 结构，供甘特画菱形） */
    @Data
    public static class Milestone {
        private String code;
        private String name;
        private String ownerName;
        private String preliminaryDate;
        private String baselineDate;
        private String forecastDate;
        private String actualDate;
        private String status;
        private Integer slipDays;
    }

    /** 资源负载总览 */
    @Data
    public static class Workload {
        private String from;
        private String to;
        /** 是否被收敛为"只看自己"（无全量数据范围的人） */
        private Boolean selfOnly;
        private List<Person> people = new ArrayList<>();
    }

    /** 一个人的负载 */
    @Data
    public static class Person {
        private Long userId;
        private String userName;
        private String empNo;
        private BigDecimal totalCapacity;
        private BigDecimal totalPlanned;
        private BigDecimal totalActual;
        /** 利用率（计划工时 / 可用工时，百分数；无容量时为 0） */
        private Integer utilization;
        /** 超负荷的工作日数（负载 > 可用容量） */
        private Integer overloadedDays;
        /** 参与的需求数（跨需求并行是过载的真实原因） */
        private Integer reqCount;
        private List<DayLoad> days = new ArrayList<>();
    }

    /** 单日负载 */
    @Data
    public static class DayLoad {
        private String day;
        private BigDecimal capacity;
        private BigDecimal planned;
        private BigDecimal actual;
        /** 当天是否休假日（请假） */
        private Boolean leave;
        private Boolean weekend;
        private Boolean overloaded;
    }

    /** 日历行 */
    @Data
    public static class CalendarItem {
        private Long id;
        private Long userId;
        private String userName;
        private String day;
        private String dayType;
        private BigDecimal availableHours;
        private String reason;
    }
}
