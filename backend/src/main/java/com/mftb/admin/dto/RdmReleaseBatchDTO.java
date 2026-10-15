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
