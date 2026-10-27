package com.mftb.admin.dto;

import lombok.Data;

/**
 * RDM 问题管理写入请求体（Batch 1）。
 * <p>延期申请走「产品裁决 →（涉业务时）业务裁决 → 绑定跟进需求」三段闸门，
 * 任何一段都不能由申请人自己签，避免「自己的问题自己决定不做」。
 */
public class RdmIssueDTO {

    /** 登记问题 */
    @Data
    public static class Create {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 来源类型（必填）：test/acceptance/online/other */
        private String sourceType;
        /** 来源单据ID（如测试执行记录ID/验收记录ID） */
        private Long sourceId;
        private Long reqId;
        private Long deliveryItemId;
        /** 问题对应的范围版本（范围变更后旧问题不自动跟新版本） */
        private Integer scopeVersion;
        private String buildId;
        /** 问题标题（必填） */
        private String title;
        private String description;
        /** 影响描述 */
        private String impact;
        /** 严重程度（必填）：critical/major/minor/trivial */
        private String severity;
        private Long ownerUserId;
        private String ownerUserName;
    }

    /** 延期申请 */
    @Data
    public static class DeferApply {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的延期单 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 延期原因（必填） */
        private String reason;
        /** 不修的影响描述 */
        private String impactDesc;
        /** 临时缓解措施 */
        private String mitigation;
        /** 目标修复版本（必填，「以后再说」不是版本） */
        private String targetVersion;
        /** 修复负责人 */
        private Long ownerUserId;
        private String ownerUserName;
        /** 修复期限（必填）yyyy-MM-dd */
        private String dueAt;
    }

    /** 延期裁决（产品/业务共用结构，由调用入口区分裁决方） */
    @Data
    public static class DeferDecision {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的延期单 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 裁决（必填）：approved/rejected */
        private String decision;
        /** 裁决理由（必填） */
        private String reason;
        /** 批准后绑定的跟进需求ID */
        private Long followUpReqId;
        /** 是否需要业务侧继续裁决（任务21：服务端自行判定，不信任前端传入，此字段仅作兼容保留） */
        private Boolean bizDecisionRequired;
    }

    /**
     * 建立承接（任务21）：延期获批后绑定承接需求。
     * <p>问题与承接需求均以<b>数值ID</b>表达，不用工号/姓名当 ID；每个问题同一时刻唯一有效承接。
     */
    @Data
    public static class Bind {
        /** 幂等请求ID（客户端生成，重试保持不变） */
        private String requestId;
        /** 并发控制版本（乐观锁） */
        private Integer expectedVersion;
        /** 问题ID（数值） */
        private Long issueId;
        /** 承接需求ID（数值） */
        private Long followUpReqId;
        /** 承接责任人（可选，默认取延期/问题负责人） */
        private Long ownerUserId;
        /** 承接理由（可选，默认取延期原因） */
        private String reason;
    }

    /**
     * 按证据关闭问题（任务21）：必须绑定修复证据 + 复测轮次 + 必要验收，写入 RdmIssueResolution。
     * <p><b>不得无证据关闭</b>；<b>延期 ≠ 解决</b>；<b>承接需求完成验收 ≠ 原问题自动解决</b>。
     */
    @Data
    public static class Resolve {
        /** 幂等请求ID（客户端生成，重试保持不变） */
        private String requestId;
        /** 并发控制版本（乐观锁） */
        private Integer expectedVersion;
        /** 承接历史ID（延期问题必填；非延期直接修复可空） */
        private Long followupId;
        /** 交付项ID */
        private Long deliveryItemId;
        /** 构建标识 */
        private String buildId;
        /** 修复证据JSON（必填） */
        private String repairEvidenceJson;
        /** 复测轮次ID（必填，关联复测新轮/执行事实） */
        private Long testRoundId;
        /** 复测执行记录ID列表JSON */
        private String testExecutionIdsJson;
        /** 产品验收记录ID（必填） */
        private Long productAcceptanceId;
        /** 业务验收记录ID（涉业务时必填） */
        private Long businessAcceptanceId;
        /** 结论（默认 pass） */
        private String conclusion;
        /** 理由（必填） */
        private String reason;
    }

    /**
     * 问题动作（任务21）：取消 cancel / 合并 merge / 改派 reassign。
     * <p>三种动作均<b>保留已有承接关系与历史</b>（不因改派/合并丢失承接）。
     */
    @Data
    public static class IssueAction {
        /** 幂等请求ID（客户端生成，重试保持不变） */
        private String requestId;
        /** 并发控制版本（乐观锁） */
        private Integer expectedVersion;
        /** 合并目标问题ID（merge 必填，数值） */
        private Long targetIssueId;
        /** 改派目标负责人ID（reassign 必填，数值） */
        private Long newOwnerUserId;
        /** 改派目标负责人姓名（reassign 可选） */
        private String newOwnerUserName;
        /** 动作理由（必填） */
        private String reason;
    }

    /** 问题列表查询 */
    @Data
    public static class Query {
        private Long reqId;
        private Long deliveryItemId;
        private String status;
        private String severity;
        private Long ownerUserId;
        private String sourceType;
        /** 关键字（匹配标题/编号） */
        private String keyword;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
