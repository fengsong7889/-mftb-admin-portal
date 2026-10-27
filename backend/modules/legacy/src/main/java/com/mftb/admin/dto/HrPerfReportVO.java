package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 績效结果台账视图（等级分布 / 部门对比 / 趋势一次性返回，供报表页与导出共用）。
 * <p>
 * 统计口径固定为「已确认（confirmed）」的考核单：未确认的结果对本人和同事都不可见，
 * 把它们计入台账等于对外提前发布绩效，因此这里绝不混入过程态数据。
 */
@Data
public class HrPerfReportVO {

    /** 已确认人数 */
    private Integer headcount;

    /** 参与统计的计划数 */
    private Integer planCount;

    /** 平均分（保留两位） */
    private BigDecimal avgScore;

    private BigDecimal maxScore;

    private BigDecimal minScore;

    /** 本次统计是否具备强制分布口径（模板配了建议占比才有） */
    private Boolean hasSuggestedRatio;

    private List<GradeCount> gradeDistribution;

    private List<DeptCount> deptDistribution;

    private List<TrendPoint> trend;

    /** 等级分布项：实际人数/占比 vs 模板建议占比 */
    @Data
    public static class GradeCount {
        private String grade;
        private Integer count;
        /** 实际占比（百分数，两位） */
        private BigDecimal actualRatio;
        /** 模板建议占比（百分数），未配为 null */
        private Integer suggestRatio;
        /** 按建议占比算出的允许人数（上限口径）；非单计划口径时为 null */
        private Integer allowedCount;
        /** 超出上限的人数（0 表示未超）；与 allowedCount 同时为空表示无可比对口径 */
        private Integer overCount;
        /** 与计划人数的差距描述（超编/欠配），供台账直接标红 */
        private String gapNote;
    }

    /** 部门对比项 */
    @Data
    public static class DeptCount {
        private String deptName;
        private Integer count;
        private BigDecimal avgScore;
        /** 该部门最高等级（按模板等级顺序取最优） */
        private String topGrade;
    }

    /** 趋势项：一个计划一个点，附带该计划的等级构成 */
    @Data
    public static class TrendPoint {
        private Long planId;
        private String planReqNo;
        private String planName;
        private String cycleName;
        private Integer count;
        private BigDecimal avgScore;
        private List<GradeCount> grades;
    }
}
