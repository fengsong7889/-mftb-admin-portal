package com.mftb.admin.dto;

import lombok.Data;

/**
 * RDM 交付项级验收记录视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 */
public class RdmAcceptanceRecordVO {

    /** 验收记录列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String recordNo;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        private Long reqId;
        private String reqTitle;
        /** product/business */
        private String acceptanceType;
        /** pre_release/post_release */
        private String stage;
        /** pass/fail/conditional */
        private String conclusion;
        /** 满意度评分 1-5（业务验收口径） */
        private Integer score;
        private String signerUserName;
        /** 验收轮次（同类型同阶段第几次验收） */
        private Integer roundNo;
        private String createdAt;
    }

    /** 验收记录详情 */
    @Data
    public static class Detail {
        private Long id;
        private String recordNo;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        private Long reqId;
        private String reqTitle;
        private String acceptanceType;
        private String stage;
        private String conclusion;
        private Integer score;
        private String signerUserName;
        private Integer roundNo;
        private String createdAt;
        /** 验收对应的范围版本 */
        private Integer scopeVersion;
        private String buildId;
        private String testEnv;
        private String opinion;
        private String conditionsJson;
        private String evidenceJson;
    }
}
