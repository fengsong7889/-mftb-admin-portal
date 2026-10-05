package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 需求看板视图（字段名与前端 RdmDashboardData 对齐）。
 * <p>枚举值（req_type / stage / risk_type）在此返回**编码**，中文文案由前端常量映射，
 * 避免后端字典改动导致看板文案与列表不一致。
 */
@Data
public class RdmDashboardVO {

    private Overview overview = new Overview();
    private List<NameValue> typeDist = new ArrayList<>();
    private List<DeptRank> deptRank = new ArrayList<>();
    private List<PmRank> pmRank = new ArrayList<>();
    private List<StageDuration> stageDuration = new ArrayList<>();
    private List<TrendPoint> trend = new ArrayList<>();
    private List<Risk> risks = new ArrayList<>();
    private Board board = new Board();

    /** 结果与效率指标 */
    @Data
    public static class Overview {
        private Long reqTotal;
        private Long submittedThisMonth;
        private Long deliveredThisMonth;
        /** 提交→受理平均时长（小时） */
        private Double avgResponseHours;
        /** 受理→上线平均周期（天） */
        private Double avgDeliveryDays;
        /** 按时上线率 0-1 */
        private Double onTimeRate;
        /** 驳回发生率 0-1 */
        private Double rejectRate;
        private Long overdueTotal;
        private Long blockedTotal;
        private Long unassignedTotal;
        private Long intakeStuckTotal;
    }

    /** 通用名值对 */
    @Data
    public static class NameValue {
        private String name;
        private Long value;
    }

    /** 部门产出排名 */
    @Data
    public static class DeptRank {
        private String deptName;
        private Long submitted;
        private Long delivered;
        private Double onTimeRate;
        private Double avgDays;
    }

    /** 产品经理负载与交付 */
    @Data
    public static class PmRank {
        private String pmName;
        private Long active;
        private Long delivered;
        private Long overdue;
        private Double avgDays;
    }

    /** 阶段平均停留 */
    @Data
    public static class StageDuration {
        private String stage;
        private Double avgHours;
    }

    /** 趋势点 */
    @Data
    public static class TrendPoint {
        private String date;
        private Long submitted;
        private Long delivered;
    }

    /** 风险条目 */
    @Data
    public static class Risk {
        private String riskType;
        private Long reqId;
        private String reqNo;
        private String title;
        private String submitterName;
        private String handler;
        private Long days;
    }

    /** 交付流水线 */
    @Data
    public static class Board {
        private List<BoardColumn> columns = new ArrayList<>();
    }

    /** 流水线列 */
    @Data
    public static class BoardColumn {
        private String key;
        private String title;
        private Long count;
        private Long overdue;
    }
}
