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

import java.util.ArrayList;
import java.util.List;

/**
 * 工作台账（甘特）接口契约：工作項 × 子任務 × 排期 × 进度 × 工时口径。
 *
 * <p>与前端 worklogGanttModel 的 GanttData 逐字对应——形状一致才能把本地台账
 * 直接换成服务端读取而不重写渲染层；一旦两处结构各长一份，页面就会开始"补字段"，
 * 那是双源问题的另一种形态。
 *
 * <p>身份字段（userId/groupId 之外的归属）一律不在表单里出现：归属由 JWT 注入，
 * 前端传 userId 在本域是第一禁忌。
 */
public final class CpmWorklogDto {

    private CpmWorklogDto() {
    }

    /* ==================== 读取 ==================== */

    /** 进度流水：汇报「期初/期末」快照的唯一来源，界面不重算。 */
    @Data
    public static class HistoryVO {
        /** yyyy-MM-dd */
        private String at;
        private int progress;

        public HistoryVO() {
        }

        public HistoryVO(String at, int progress) {
            this.at = at;
            this.progress = progress;
        }
    }

    @Data
    public static class TaskVO {
        private long id;
        private long groupId;
        private String title;
        /** 计划起日 yyyy-MM-dd；null=未排期（只在「全部」档可见） */
        private String start;
        /** 计划止日 yyyy-MM-dd */
        private String end;
        private int progress;
        /** 净化后的富文本备注（渲染前前端还会过一次白名单） */
        private String note;
        /** 计划属性 planned/inserted */
        private String planType;
        /** 标记为临时插入的日期；原计划为 null */
        private String insertedAt;
        /** 整段总工时（工作日 × 8h），服务端算 */
        private int hours;
        /** 落在本次查询区间内的工时；无区间时等于 hours */
        private int periodHours;
        private int workdays;
        /** 状态：由进度推导，服务端给（100 done / 1–99 doing / 0 已排期 todo / 未排期 plan） */
        private String state;
        private List<HistoryVO> history = new ArrayList<>();
        /** 关联的 RDM 回写状态（沿用条目侧既有能力，台账不另立口径） */
        private String sourceType;
        private String sourceRef;
        private Integer rdmSyncEnabled;
    }

    @Data
    public static class GroupVO {
        private long id;
        private String title;
        private int hue;
        private int sortOrder;
        private Long rdmRequirementId;
        private List<TaskVO> tasks = new ArrayList<>();
    }

    /** 一次台账读取：分组 + 任务 + 区间生效的日历 + 服务端算好的统计 */
    @Data
    public static class LedgerVO {
        private String rangeStart;
        private String rangeEnd;
        private List<GroupVO> groups = new ArrayList<>();
        private List<String> holidays = new ArrayList<>();
        private List<String> makeups = new ArrayList<>();
        private List<String> compOffs = new ArrayList<>();
        private List<String> leaves = new ArrayList<>();
        private TotalsVO totals = new TotalsVO();
    }

    @Data
    public static class TotalsVO {
        private int total;
        private int done;
        private int doing;
        private int pending;
        private int inserted;
        private int backlog;
        private int risks;
        private int hours;
        private int avgProgress;
        /** 期初平均进度：与期末成对出现，汇报的「本期推进 = 期末 - 期初」只能由服务端算一次 */
        private int avgStart;
        private int avgEnd;
    }

    /* ==================== 写入 ==================== */

    @Data
    public static class GroupForm {
        @NotBlank
        @Size(max = 200)
        private String title;
        private Integer hue;
        private Long rdmRequirementId;
    }

    @Data
    public static class TaskForm {
        private Long groupId;
        @NotBlank
        @Size(max = 200)
        private String title;
        /** yyyy-MM-dd；null=未排期 */
        private String start;
        private String end;
        private Integer progress;
        /** 富文本备注（服务端净化后入库） */
        @Size(max = 8000)
        private String note;
        /** planned/inserted；缺省 planned */
        private String planType;
        /** 标记日期；planType=inserted 且留空时服务端取今天 */
        private String insertedAt;
        /** 岗位词表分类，缺省 general */
        @Size(max = 32)
        private String category;
    }

    /** 日历登记：type 传 null 表示恢复该天默认口径（周末休/工作日班） */
    @Data
    public static class CalendarForm {
        @NotBlank
        private String date;
        private String type;
        @Size(max = 200)
        private String note;
    }

    /** 一次性导入浏览器本地台账（迁移通道，导入成功后本地键即作废备份） */
    @Data
    public static class ImportForm {
        @NotNull
        @Size(max = 100)
        private List<ImportGroup> groups = new ArrayList<>();
        private List<String> holidays = new ArrayList<>();
        private List<String> makeups = new ArrayList<>();
        private List<String> compOffs = new ArrayList<>();
        private List<String> leaves = new ArrayList<>();
    }

    @Data
    public static class ImportGroup {
        @NotBlank
        @Size(max = 200)
        private String title;
        private Integer hue;
        @Size(max = 200)
        private List<ImportTask> tasks = new ArrayList<>();
    }

    @Data
    public static class ImportTask {
        @NotBlank
        @Size(max = 200)
        private String title;
        private String start;
        private String end;
        private Integer progress;
        @Size(max = 8000)
        private String note;
        private String planType;
        private String insertedAt;
        private List<HistoryVO> history = new ArrayList<>();
    }

    @Data
    public static class ImportResultVO {
        private int groups;
        private int tasks;
        private int skippedGroups;
        private int skippedTasks;
        private int calendarDays;
    }

    /* ==================== 汇报聚合（服务端算，页面只渲染） ==================== */

    @Data
    public static class ReportRowVO {
        private long taskId;
        private Long groupId;
        private String title;
        /** 所属工作項标题；未分组条目为 null，前端渲染成「未分組記錄」 */
        private String groupTitle;
        /** 计划起日（下期计划行排序与展示用） */
        private String start;
        /** 计划止日 */
        private String end;
        private int pStart;
        private int pEnd;
        private int delta;
        private int hours;
        /** 期内完成时点；非期内完成为 null */
        private String doneAt;
        private int overdueDays;
        private String planType;
        private String insertedAt;
        private String note;
        private String state;
    }

    @Data
    public static class ReportGroupVO {
        private long groupId;
        private String title;
        private int hue;
        private int hours;
        private int avgStart;
        private int avgEnd;
        private int doneCount;
        private List<ReportRowVO> rows = new ArrayList<>();
    }

    @Data
    public static class ReportDayVO {
        private String key;
        private int hours;
        private boolean rest;

        public ReportDayVO() {
        }

        public ReportDayVO(String key, int hours, boolean rest) {
            this.key = key;
            this.hours = hours;
            this.rest = rest;
        }
    }

    @Data
    public static class ReportVO {
        private String periodType;
        private String start;
        private String end;
        private String periodLabel;
        private TotalsVO totals = new TotalsVO();
        private List<ReportGroupVO> groups = new ArrayList<>();
        private List<ReportRowVO> risks = new ArrayList<>();
        private List<ReportRowVO> notes = new ArrayList<>();
        private List<ReportRowVO> plan = new ArrayList<>();
        private List<ReportRowVO> insertedRows = new ArrayList<>();
        private List<ReportDayVO> daily = new ArrayList<>();
        private ReportDayVO peak;
    }
}
