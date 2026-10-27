package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 绩效治理请求体（阶段 6：预算与 HR 建议）。
 */
public class RdmGovernanceDTO {

    /** 新增/编辑预算（按 周期+部门 唯一，重复提交视为修订） */
    @Data
    public static class Budget {
        private Long id;
        private String periodCode;
        /** 部门ID，空或 0 表示全员预算 */
        private Long deptId;
        private BigDecimal scoreBudget;
        /** 预警阈值百分比，空则 80 */
        private BigDecimal warningRatio;
        /** 预算依据（必填：没有依据的上限只是一个可以被随意改动的数字） */
        private String remark;
    }

    /** 复核建议 */
    @Data
    public static class Review {
        /** true=确认（可推送） false=驳回 */
        private Boolean confirmed;
        /** 复核意见（驳回或超限时必填） */
        private String remark;
    }
}
