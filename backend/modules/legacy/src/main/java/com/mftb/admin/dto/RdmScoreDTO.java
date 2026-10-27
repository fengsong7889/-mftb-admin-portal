package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * RDM 产出积分入参（M4）。
 */
public final class RdmScoreDTO {

    private RdmScoreDTO() {
    }

    /** 规则保存表单 */
    @Data
    public static class Rule {
        /** 空=新增（自动取同码最大版本 +1） */
        private Long id;
        private String ruleCode;
        private String reqType;
        private String roleCode;
        private BigDecimal priorityBonus;
        private BigDecimal onTimeBonus;
        private BigDecimal latePenalty;
        private BigDecimal firstPassBonus;
        private BigDecimal reworkPenalty;
        private BigDecimal reopenPenalty;
        private BigDecimal acceptanceFactor;
        private BigDecimal qualityFloor;
        private BigDecimal unitScore;
        /** each / split */
        private String allocMode;
        private Integer maxScorableRoles;
        /** yyyy-MM-dd */
        private String effectiveFrom;
        private Boolean enabled;
        private String remark;
    }

    /** 试算请求 */
    @Data
    public static class Preview {
        private Long reqId;
        private String roleCode;
        private Long userId;
    }
}
