package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 问题管理视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 */
public class RdmIssueVO {

    /** 问题列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String issueNo;
        private String title;
        /** test/acceptance/online/other */
        private String sourceType;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        /** critical/major/minor/trivial */
        private String severity;
        private String ownerUserName;
        /** open/processing/pending_verify/resolved/deferred */
        private String status;
        private String createdAt;
    }

    /** 问题详情 */
    @Data
    public static class Detail {
        private Long id;
        private String issueNo;
        private String title;
        private String sourceType;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        private String severity;
        private String ownerUserName;
        private String status;
        private String createdAt;
        private String description;
        private String impact;
        private Integer scopeVersion;
        private String buildId;
        private String reporterUserName;
        /** 延期申请与裁决记录 */
        private List<DeferRecord> deferRecords = new ArrayList<>();
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 并发控制版本（乐观锁），前端提交写操作时回传为 expectedVersion；非范围版本 */
        private Integer version;
        private String updatedAt;
    }

    /** 延期记录（申请 + 产品/业务裁决 + 跟进绑定） */
    @Data
    public static class DeferRecord {
        private Long id;
        private String reason;
        private String impactDesc;
        private String mitigation;
        private String targetVersion;
        private String ownerUserName;
        private String dueAt;
        /** 产品裁决：approved/rejected */
        private String productDecision;
        private String productDecideUserName;
        private String productDecideTime;
        private String productDecideReason;
        /** 业务裁决：approved/rejected */
        private String bizDecision;
        private String bizDecideUserName;
        private String bizDecideTime;
        private String bizDecideReason;
        private Long followUpReqId;
        private String followUpReqNo;
        /** pending_product/pending_biz/pending_bind/effective/rejected */
        private String status;
        private String applicantUserName;
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 并发控制版本（乐观锁）；非业务范围版本 */
        private Integer version;
        /** 延期对应的业务范围版本，非并发版本 */
        private Integer scopeVersion;
        /** 必要范围变更批准引用（延期伴随范围变更时） */
        private Long scopeChangeId;
        /** 延期生效时间 */
        private String effectiveAt;
        /** 升级时间（超期未承接时升级） */
        private String escalatedAt;
        /** 升级级别 */
        private Integer escalationLevel;
        private String createdAt;
    }
}
