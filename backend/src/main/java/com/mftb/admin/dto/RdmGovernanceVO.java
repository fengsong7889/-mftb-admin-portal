package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmHrSuggestion;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 绩效治理视图（阶段 6）。
 */
public class RdmGovernanceVO {

    /** 预算行（含实时占用） */
    @Data
    public static class Budget {
        private Long id;
        private String periodCode;
        private Long deptId;
        private String deptName;
        private BigDecimal scoreBudget;
        private BigDecimal warningRatio;
        private String remark;
        /** 当前已产生的贡献分合计 */
        private BigDecimal used;
        /** 占用百分比（预算为 0 时返回 0，不返回 Infinity） */
        private BigDecimal usedRatio;
        /** 是否达到预警阈值 */
        private Boolean warning;
        /** 是否已超预算 */
        private Boolean over;
        private String updatedBy;
        private String updatedAt;
    }

    /** 建议行 */
    @Data
    public static class Suggestion {
        private Long id;
        private String periodCode;
        private Long userId;
        private String empNo;
        private String userName;
        private Long deptId;
        private String deptName;
        private BigDecimal totalScore;
        private Integer recordCount;
        private Integer deliveredCount;
        private BigDecimal avgAcceptanceScore;
        private Integer firstPassCount;
        private BigDecimal budgetUsedRatio;
        private Boolean overBudget;
        private Integer ruleVersion;
        private String status;
        private String reviewerName;
        private String reviewTime;
        private String reviewRemark;
        private String pushedAt;
        private String generatedAt;
        /** 是否允许确认/推送（无流水依据或状态不允许时为 false，前端据此置灰） */
        private Boolean actionable;
        /** 不可操作的原因 */
        private String blockedReason;
    }

    /** 实体转视图 */
    public static Suggestion from(RdmHrSuggestion row) {
        Suggestion vo = new Suggestion();
        vo.setId(row.getId());
        vo.setPeriodCode(row.getPeriodCode());
        vo.setUserId(row.getUserId());
        vo.setEmpNo(row.getEmpNo());
        vo.setUserName(row.getUserName());
        vo.setDeptId(row.getDeptId());
        vo.setDeptName(row.getDeptName());
        vo.setTotalScore(row.getTotalScore());
        vo.setRecordCount(row.getRecordCount());
        vo.setDeliveredCount(row.getDeliveredCount());
        vo.setAvgAcceptanceScore(row.getAvgAcceptanceScore());
        vo.setFirstPassCount(row.getFirstPassCount());
        vo.setBudgetUsedRatio(row.getBudgetUsedRatio());
        vo.setOverBudget(row.getOverBudget() != null && row.getOverBudget() == 1);
        vo.setRuleVersion(row.getRuleVersion());
        vo.setStatus(row.getStatus());
        vo.setReviewerName(row.getReviewerName());
        vo.setReviewTime(DateTimeUtils.format(row.getReviewTime()));
        vo.setReviewRemark(row.getReviewRemark());
        vo.setPushedAt(DateTimeUtils.format(row.getPushedAt()));
        vo.setGeneratedAt(DateTimeUtils.format(row.getGeneratedAt()));
        return vo;
    }
}
