package com.mftb.admin.dto;

import lombok.Data;

/**
 * RDM 交付项写入请求体（Batch 1）。
 * <p>日期统一用字符串 yyyy-MM-dd，服务层解析后落库。
 * <p>Update 携带 expectedVersion 走乐观锁：交付项的范围与验收人会被协调人／PM 并发编辑，
 * 静默覆盖会让「按旧范围做的验收」与「新范围」对不上。
 */
public class RdmDeliveryItemDTO {

    /** 创建交付项 */
    @Data
    public static class Create {
        /** 关联需求ID（必填） */
        private Long reqId;
        /** 关联项目ID */
        private Long projectId;
        /** 交付项标题（必填） */
        private String title;
        /** 范围描述 */
        private String scopeDesc;
        /** 验收标准 */
        private String acceptanceCriteria;
        private Long coordinatorUserId;
        private String coordinatorUserName;
        private Long productAcceptorUserId;
        private String productAcceptorUserName;
        private Long bizAcceptorUserId;
        private String bizAcceptorUserName;
        /** 验收路径 A/B（缺省取项目默认，再缺省 A） */
        private String acceptancePath;
        /** yyyy-MM-dd */
        private String planStartDate;
        /** yyyy-MM-dd */
        private String planEndDate;
    }

    /** 编辑交付项（乐观锁） */
    @Data
    public static class Update {
        private String title;
        private String scopeDesc;
        private String acceptanceCriteria;
        private Long coordinatorUserId;
        private String coordinatorUserName;
        private Long productAcceptorUserId;
        private String productAcceptorUserName;
        private Long bizAcceptorUserId;
        private String bizAcceptorUserName;
        private String acceptancePath;
        /** yyyy-MM-dd */
        private String planStartDate;
        /** yyyy-MM-dd */
        private String planEndDate;
        /** preparing/developing/testing/pending_acceptance/pending_release/released_pending/done */
        private String status;
        /** 乐观锁期望版本（必填，不匹配即拒绝） */
        private Integer expectedVersion;
    }

    /** 交付项列表查询 */
    @Data
    public static class Query {
        private Long reqId;
        private Long projectId;
        private String status;
        /** 关键字（匹配标题/编号） */
        private String keyword;
        private Long coordinatorUserId;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
