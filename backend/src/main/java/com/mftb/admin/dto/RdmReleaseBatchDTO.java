package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * RDM 发布批次写入请求体（Batch 1）。
 * <p>发布批次是「多系统一次上线」的编排单位：部署顺序、逐系统验证、
 * 失败回滚都在批次内闭环；放行裁决不得由申请人本人签。
 */
public class RdmReleaseBatchDTO {

    /** 创建发布批次 */
    @Data
    public static class Create {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 版本标签（必填） */
        private String versionTag;
        private Long projectId;
        private Long reqId;
        /** 发布负责人ID（必填） */
        private Long releaseOwnerUserId;
        /** 发布负责人姓名（必填） */
        private String releaseOwnerUserName;
        /** 计划发布时间 yyyy-MM-dd HH:mm:ss */
        private String planTime;
        /** 批次覆盖的交付项ID列表 */
        private List<Long> deliveryItemIds;
        /** 部署清单 */
        private List<DeploymentItem> deployments;
    }

    /** 部署清单项（创建时随批次提交） */
    @Data
    public static class DeploymentItem {
        /** 系统编码（必填） */
        private String systemCode;
        private String systemName;
        private String buildId;
        /** 部署顺序（小的先部署） */
        private Integer deployOrder;
    }

    /** 放行裁决 */
    @Data
    public static class Decide {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version；与申请版本 applicationVersion、范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 裁决（必填）：approved/rejected */
        private String decision;
        private String reason;
    }

    /** 部署结果上报 */
    @Data
    public static class Deploy {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 系统编码（必填） */
        private String systemCode;
        /** 部署状态（必填）：deploying/success/failed/rolled_back */
        private String deployStatus;
        private String buildId;
    }

    /** 部署后验证结果上报 */
    @Data
    public static class Verify {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 系统编码（必填） */
        private String systemCode;
        /** 验证状态（必填）：passed/failed */
        private String verifyStatus;
        private String remark;
    }

    /** 回滚 */
    @Data
    public static class Rollback {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 回滚原因（必填） */
        private String reason;
        /** 需回滚的系统编码（缺省=批次内已部署成功的全部系统） */
        private List<String> systemCodes;
    }

    /* ==================== 任务27 新增（纯增量，不改既有字段） ==================== */

    /**
     * 业务开放（任务27 新增 · 端点 {@code POST /api/rdm/release-batch/{id}/open}）。
     * <p><b>开放是独立事实，绝不由「验证通过」推导</b>：全部系统验证通过后批次仍停在 verifying，
     * 必须由发布负责人显式提交本动作，服务端才写 {@code action=open} 的追加事实并置 released。
     * <p>开放前会重新校验硬门禁，且<b>产品验收必须是真实事实</b>（真实验收通过或紧急补验已完成且通过），
     * 紧急豁免只豁免发布放行时序，<b>不豁免开放</b>。
     */
    @Data
    public static class Open {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 需开放的系统编码（缺省=批次内全部已验证通过的系统） */
        private List<String> systemCodes;
        /** 开放结果：opened/not_opened（缺省 opened）；not_opened 是止损动作，不校验硬门禁 */
        private String openStatus;
        /** 备注/不开放原因 */
        private String remark;
    }

    /**
     * 紧急豁免申请（任务27 新增 · 端点 {@code POST /api/rdm/release-batch/{id}/exemption}）。
     * <p><b>只可豁免「缺失的产品验收」</b>：业务验收永不可豁免（路径A 缺业务验收直接拒绝）。
     * 缺失项由服务端计算，客户端不得自行声明；申请即冻结补验计划与<b>真实工作日</b>期限。
     */
    @Data
    public static class Exemption {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 豁免事由（必填） */
        private String reason;
        /** 产品风险评估（必填） */
        private String risk;
        /** 回滚预案（必填）：豁免发布必须带可执行回滚方案 */
        private String rollbackPlan;
        /** 补验人覆盖（可选）：缺省取交付项的产品验收人 */
        private List<SupplementaryPlanItem> supplementaryPlan;
    }

    /** 补验计划项（紧急豁免随附，服务端据此创建补验单并冻结期限） */
    @Data
    public static class SupplementaryPlanItem {
        private Long deliveryItemId;
        /** 补验人（缺省=交付项产品验收人）；期限按<b>该补验人真实工作日历</b>计算 */
        private Long verifierUserId;
        private String verifierUserName;
    }

    /**
     * 紧急豁免裁决（任务27 新增 · 端点
     * {@code POST /api/rdm/release-batch/{id}/exemption/{exemptionId}/decision}）。
     * <p>{@code decisionType} 由路径/请求体给定，取值 {@code product_risk}（产品风险裁决）
     * 或 {@code release}（发布裁决）；两类都<b>必须齐备且均为 approved</b> 豁免才生效。
     * <p><b>四眼</b>：裁决人不得是豁免申请人本人，<b>系统管理员亦无自批豁免</b>。
     */
    @Data
    public static class ExemptionDecision {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的批次 version */
        private Integer expectedVersion;

        /** 裁决类型（必填）：product_risk/release */
        private String decisionType;
        /** 裁决结果（必填）：approved/rejected */
        private String decision;
        /** 裁决理由（必填）：豁免属例外授权，必须留痕可审计 */
        private String reason;
    }

    /**
     * 补验完成登记（任务27 新增 · 端点
     * {@code POST /api/rdm/release-batch/supplementary/{id}/complete}）。
     * <p>仅<b>指定补验人本人</b>可登记；必须引用真实存在的验收记录，且结论与 result 一致
     * （pass→completed / fail→failed）。补验失败即触发整改升级，产品验收仍未过时<b>拒绝开放</b>。
     */
    @Data
    public static class SupplementaryComplete {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的补验单 version */
        private Integer expectedVersion;

        /** 真实验收记录ID（必填） */
        private Long acceptanceRecordId;
        /** 补验结果（必填）：pass/fail，须与验收记录结论一致 */
        private String result;
        /** 补验证据JSON（可选，缺省由服务端按验收记录组装） */
        private String evidenceJson;
    }

    /** 发布批次列表查询 */
    @Data
    public static class Query {
        private Long projectId;
        private String status;
        private Long releaseOwnerUserId;
        /** 关键字（匹配批次号/版本标签） */
        private String keyword;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
