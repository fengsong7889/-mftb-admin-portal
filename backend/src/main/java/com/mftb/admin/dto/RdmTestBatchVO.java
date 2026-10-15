package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 提测批次视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 */
public class RdmTestBatchVO {

    /** 提测批次列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String batchNo;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        /** 批次覆盖的交付项标题（范围快照摘要） */
        private List<String> deliveryItemTitles = new ArrayList<>();
        private String testEnv;
        private String testLeadUserName;
        /** pending/accepted/returned/executing/passed/failed */
        private String status;
        private Integer roundNo;
        private String planEndTime;
        /** 已通过用例数 */
        private Integer passCount;
        /** 未通过用例数（fail+blocked） */
        private Integer failCount;
        /** 用例总数 */
        private Integer totalCount;
        private String createdAt;
    }

    /** 提测批次详情 */
    @Data
    public static class Detail {
        private Long id;
        private String batchNo;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private List<String> deliveryItemTitles = new ArrayList<>();
        private String testEnv;
        private String testLeadUserName;
        private String status;
        private Integer roundNo;
        private String planEndTime;
        private Integer passCount;
        private Integer failCount;
        private Integer totalCount;
        private String createdAt;
        private String scopeSnapshotJson;
        private String buildIdsJson;
        private List<Long> executorUserIds = new ArrayList<>();
        /** 执行记录（按执行时间升序） */
        private List<ExecutionRecord> executions = new ArrayList<>();
        private String applicantUserName;
        private String returnedReason;
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 并发控制版本（乐观锁），前端提交写操作时回传为 expectedVersion；非范围版本 */
        private Integer version;
        /** 待接收用例草稿JSON（权威冻结集合以测试轮次为准） */
        private String caseSnapshotJson;
        /** 待接收交付项-系统-构建映射JSON */
        private String buildMappingJson;
        private String updatedAt;
    }

    /** 测试执行记录 */
    @Data
    public static class ExecutionRecord {
        private Long id;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        private String caseTitle;
        private String executorUserName;
        private String buildId;
        private String testEnv;
        /** pass/fail/blocked/skip */
        private String result;
        private String executedAt;
        private String remark;
        private Integer roundNo;
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 稳定用例ID */
        private String caseId;
        /** 不可变测试轮次事实ID */
        private Long testRoundId;
        /** 业务范围版本（非并发版本） */
        private Integer scopeVersion;
        /** 执行证据JSON */
        private String evidenceJson;
    }

    /** 批次执行汇总（测试工作台进度条） */
    @Data
    public static class BatchSummary {
        private Integer totalCases;
        private Integer executedCases;
        private Integer passedCases;
        private Integer failedCases;
        private Integer blockedCases;
        private Integer skippedCases;
        /** 未执行用例数 */
        private Integer notExecutedCases;
        /** 通过率（0-100，按已执行口径） */
        private Integer passRate;
    }
}
