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
        /* ===== 任务27 新增（纯增量投影，供任务23 前端消费） ===== */
        /** 是否全部系统验证通过（仅为只读投影；<b>验证通过不等于已发布</b>，还需独立开放动作） */
        private Boolean verificationPassed;
        /** 已开放系统数（开放是独立事实，不由验证通过推导） */
        private Integer openedCount;
        /** 本项目 V3 发布灰度是否已开启（GLOBAL 熔断优先 → PROJECT:<id>，两级都为 1 才开；缺行=关闭） */
        private Boolean v3ReleaseEnabled;
        /** 放行裁决留痕（追加式，apply/decide 各一行，不可修改） */
        private List<ApprovalRecord> approvals = new ArrayList<>();
        /** 紧急豁免单（只可豁免缺失的产品验收） */
        private List<ExemptionRecord> exemptions = new ArrayList<>();
        /** 产品补验单（按补验人真实工作日历冻结期限） */
        private List<SupplementaryRecord> supplementaries = new ArrayList<>();
    }

    /**
     * 放行裁决留痕（任务27 新增）。
     * <p>对应 {@code rdm_release_approval}：{@code uk(release_batch_id, application_version, action)}，
     * 同一申请版本的 apply/decide 各只能留痕一次，<b>只增不改</b>。
     */
    @Data
    public static class ApprovalRecord {
        private Long id;
        /** 申请版本（并发版本快照，非业务范围版本） */
        private Integer applicationVersion;
        /** apply/decide */
        private String action;
        /** approved/rejected（apply 行为空） */
        private String decision;
        private String reason;
        private Long operatorUserId;
        private String evidenceHash;
        private String createdAt;
    }

    /** 紧急豁免单（任务27 新增）。 */
    @Data
    public static class ExemptionRecord {
        private Long id;
        private Integer applicationVersion;
        private Long applicantUserId;
        private String reason;
        private String risk;
        private String rollbackPlan;
        /** 服务端算出的缺失产品验收项 JSON */
        private String missingAcceptanceJson;
        /** 冻结的补验计划 JSON（含按真实工作日算出的期限） */
        private String supplementaryPlanJson;
        /** 产品风险裁决是否已 approved */
        private Boolean productRiskApproved;
        /** 发布裁决是否已 approved */
        private Boolean releaseApproved;
        /** 豁免是否当前生效（两类裁决均 approved 且范围/构建与当前事实完全一致） */
        private Boolean effective;
        private String createdAt;
        private List<ExemptionDecisionRecord> decisions = new ArrayList<>();
    }

    /** 紧急豁免裁决留痕（任务27 新增）。{@code uk(exemption_id, decision_type)}，只增不改。 */
    @Data
    public static class ExemptionDecisionRecord {
        private Long id;
        /** product_risk/release */
        private String decisionType;
        /** approved/rejected */
        private String decision;
        private String reason;
        private Long signerUserId;
        private String createdAt;
    }

    /** 产品补验单（任务27 新增）。 */
    @Data
    public static class SupplementaryRecord {
        private Long id;
        private Long deliveryItemId;
        private String deliveryItemTitle;
        private Integer scopeVersion;
        private String buildId;
        /** product/business（本任务只产生 product） */
        private String verificationType;
        private Long exemptionId;
        private Long verifierUserId;
        private String verifierUserName;
        private String deadline;
        /** 期限口径来源：{@code workday:v1:<补验人 ID>}，表示按真实工作日历冻结 */
        private String calendarVersion;
        /** pending/completed/overdue/failed */
        private String status;
        /** pass/fail */
        private String result;
        private Long acceptanceRecordId;
        private Boolean escalated;
        private Integer escalationLevel;
        /** 按真实工作日历计算的已逾期工作日数（未逾期为 0） */
        private Integer overdueWorkingDays;
        private String completedAt;
        private Integer version;
    }

    /** 追加式尝试事实（任务27 新增）。只增不改，历史永久留痕。 */
    @Data
    public static class AttemptRecord {
        private Long id;
        private Long deploymentId;
        /** 同一 (deploymentId, action) 下递增，&gt; 0 */
        private Integer attemptNo;
        /** deploy/verify/open/rollback */
        private String action;
        /** deploying/success/failed/rolled_back/passed/opened/not_opened */
        private String result;
        private String buildId;
        /** 发布事实一律为生产环境 */
        private String testEnv;
        private Long approvalId;
        private String reason;
        private Long operatorUserId;
        private String occurredAt;
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
        /** 任务27 新增：本系统的追加式尝试事实（部署/验证/开放/回滚，只增不改） */
        private List<AttemptRecord> attempts = new ArrayList<>();
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
