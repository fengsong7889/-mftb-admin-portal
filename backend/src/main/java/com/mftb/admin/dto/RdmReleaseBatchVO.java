package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 发布批次视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 * <p>CheckResult 由服务端实时计算（测试/验收/缺陷/依赖/范围五类闸门），
 * 客户端只能看结果与裁决，不能改写检查结论。
 */
public class RdmReleaseBatchVO {

    /** 发布批次列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String batchNo;
        private String versionTag;
        private String projectName;
        private String releaseOwnerUserName;
        private String planTime;
        /** planning/checking/approved/deploying/verifying/released/rolled_back/cancelled */
        private String status;
        /** 部署清单系统数 */
        private Integer systemCount;
        /** 已部署成功系统数 */
        private Integer deployedCount;
        private String createdAt;
    }

    /** 发布批次详情 */
    @Data
    public static class Detail {
        private Long id;
        private String batchNo;
        private String versionTag;
        private String projectName;
        private String releaseOwnerUserName;
        private String planTime;
        private String status;
        private Integer systemCount;
        private Integer deployedCount;
        private String createdAt;
        private String scopeSnapshotJson;
        private String approvalUserName;
        private String approvalTime;
        private String applicantUserName;
        private String rollbackReason;
        /** 部署记录（按部署顺序升序） */
        private List<DeploymentRecord> deployments = new ArrayList<>();
        /** 放行检查结果（服务端计算） */
        private List<CheckResult> checkResults = new ArrayList<>();
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 并发控制版本（乐观锁），前端提交写操作时回传为 expectedVersion；非范围版本 */
        private Integer version;
        /** 当前放行申请的并发版本快照（与 applicationVersion 对齐），非范围版本 */
        private Integer applicationVersion;
        /** 申请时冻结的范围/构建快照JSON */
        private String applicationSnapshotJson;
        /** 裁决时冻结的快照JSON */
        private String approvalSnapshotJson;
        /** 提交（申请放行）时间 */
        private String submittedAt;
        /** 放行裁决过期时间（过期必须重新过闸） */
        private String approvalExpiresAt;
        private String updatedAt;
    }

    /** 部署记录（单系统） */
    @Data
    public static class DeploymentRecord {
        private Long id;
        private String systemCode;
        private String systemName;
        private String buildId;
        private Integer deployOrder;
        /** pending/deploying/success/failed/rolled_back */
        private String deployStatus;
        private String deployTime;
        /** passed/failed */
        private String verifyStatus;
        private String verifyTime;
        /** 放量状态 */
        private String openStatus;
        private String openTime;
        private String rollbackReason;
        /** 部署尝试次数（重试留痕） */
        private Integer attemptNo;
        private String operatorUserName;
    }

    /**
     * 放行检查结果项。
     * <p>checkType 取值：test=测试通过 / acceptance=验收通过 /
     * defect=无阻断缺陷 / dependency=依赖就绪 / scope=范围一致。
     */
    @Data
    public static class CheckResult {
        private String checkType;
        private Boolean passed;
        private String message;
        /** 关联单据ID */
        private Long refId;
        /** 关联单据编号 */
        private String refNo;
    }
}
