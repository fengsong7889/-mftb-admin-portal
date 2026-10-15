package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkTask;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 交付项视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 * <p>taskProgress/testStatus/acceptanceStatus 为服务端推导字段（事实汇总），
 * 不落库、不接受前端回写，避免三份口径互相打架。
 */
public class RdmDeliveryItemVO {

    /** 交付项列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String itemNo;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private Long projectId;
        private String projectName;
        private String title;
        private String status;
        private String coordinatorUserName;
        /** 验收路径 A/B */
        private String acceptancePath;
        private String planStartDate;
        private String planEndDate;
        /** 范围版本号 */
        private Integer scopeVersion;
        private Integer blockedFlag;
        /** 任务进度（0-100，由任务事实推导） */
        private Integer taskProgress;
        /** 测试状态（由提测批次推导） */
        private String testStatus;
        /** 验收状态（由验收记录推导） */
        private String acceptanceStatus;
        private String updatedAt;
    }

    /** 交付项详情 */
    @Data
    public static class Detail {
        private Long id;
        private String itemNo;
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private Long projectId;
        private String projectName;
        private String title;
        private String status;
        private String coordinatorUserName;
        private String acceptancePath;
        private String planStartDate;
        private String planEndDate;
        private Integer scopeVersion;
        private Integer blockedFlag;
        private Integer taskProgress;
        private String testStatus;
        private String acceptanceStatus;
        private String updatedAt;
        private String scopeDesc;
        private String acceptanceCriteria;
        private Long prdSnapshotId;
        private Long coordinatorUserId;
        private String productAcceptorUserName;
        private String bizAcceptorUserName;
        /** 乐观锁版本（编辑提交时回传 expectedVersion） */
        private Integer version;
        private String createdAt;
        /** 关联执行任务 */
        private List<RdmWorkTask> tasks = new ArrayList<>();
        /** 关联提测批次 */
        private List<RdmTestBatch> testBatches = new ArrayList<>();
        /** 关联验收记录 */
        private List<RdmAcceptanceRecord> acceptanceRecords = new ArrayList<>();
        /** 关联问题 */
        private List<RdmIssue> issues = new ArrayList<>();
    }

    /** 范围版本记录（范围冻结/变更追溯） */
    @Data
    public static class ScopeVersion {
        private Integer version;
        private String frozenAt;
        private String frozenBy;
        private String changeReason;
    }
}
