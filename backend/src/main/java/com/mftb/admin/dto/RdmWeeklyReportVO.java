package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 交付周报（M3）——区间/迭代维度的结果、效率、风险与下周计划。
 * <p>与全局看板同源于 {@code rdm_requirement} + {@code rdm_status_log}，
 * 前端导出 Excel 时直接复用本结构，保证「导出的就是页面上看到的」。
 */
@Data
public class RdmWeeklyReportVO {

    /** 统计区间 */
    private Range range = new Range();

    /** 摘要指标 */
    private Summary summary = new Summary();

    /** 部门产出 */
    private List<DeptRow> byDept = new ArrayList<>();

    /** 产品经理负载 */
    private List<PmRow> byPm = new ArrayList<>();

    /** 本期上线清单 */
    private List<ReleasedRow> released = new ArrayList<>();

    /** 风险清单（逾期/阻塞） */
    private List<RiskRow> risks = new ArrayList<>();

    /** 下周预计上线 */
    private List<NextRow> nextWeek = new ArrayList<>();

    /** 区间 */
    @Data
    public static class Range {
        private String startDate;
        private String endDate;
        /** 展示用文案，如 09-28 ~ 10-04 */
        private String label;
    }

    /** 摘要 */
    @Data
    public static class Summary {
        /** 区间内新提交 */
        private Integer submitted;
        /** 区间内被产品受理 */
        private Integer accepted;
        /** 已排期（在途） */
        private Integer scheduled;
        /** 区间内上线 */
        private Integer released;
        /** 当前逾期 */
        private Integer overdue;
        /** 当前阻塞 */
        private Integer blocked;
        /** 区间内变更次数 */
        private Integer changes;
        /** 区间内验收返工次数 */
        private Integer rework;
        /** 区间内验收通过数（pass + conditional） */
        private Integer acceptancePass;
        /** 验收一次通过率（0~1） */
        private Double firstPassRate;
        /** 平均交付天数（受理→上线） */
        private Double avgDeliveryDays;
        /** 按时上线率（0~1） */
        private Double onTimeRate;
    }

    /** 部门行 */
    @Data
    public static class DeptRow {
        private String deptName;
        private Integer submitted;
        private Integer delivered;
        private Integer overdue;
        private Double avgDays;
    }

    /** 产品经理行 */
    @Data
    public static class PmRow {
        private String pmName;
        private Integer active;
        private Integer delivered;
        private Integer overdue;
    }

    /** 上线行 */
    @Data
    public static class ReleasedRow {
        private Long reqId;
        private String reqNo;
        private String title;
        private String versionNo;
        private String pmName;
        private String actualReleaseDate;
        private Integer acceptanceScore;
    }

    /** 风险行 */
    @Data
    public static class RiskRow {
        private Long reqId;
        private String reqNo;
        private String title;
        private String status;
        private String handler;
        /** 当前状态停留天数 */
        private Integer days;
        /** 风险类型: OVERDUE/BLOCKED/STAGNANT/UNASSIGNED */
        private String riskType;
    }

    /** 下周计划行 */
    @Data
    public static class NextRow {
        private Long reqId;
        private String reqNo;
        private String title;
        private String planReleaseDate;
        private String status;
    }
}
