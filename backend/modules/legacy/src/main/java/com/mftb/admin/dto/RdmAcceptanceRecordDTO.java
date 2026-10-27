package com.mftb.admin.dto;

import lombok.Data;

/**
 * RDM 交付项级验收记录写入请求体（Batch 1）。
 * <p>验收分两类两阶段：product=产品验收（质量口径）、business=业务验收（价值口径，必打分）；
 * stage：pre_release=上线前预验收、post_release=上线后业务验收。
 * <p>签字人身份由服务端按交付项上的验收人字段校验，前端传谁不算数。
 */
public class RdmAcceptanceRecordDTO {

    /** 提交验收结论 */
    @Data
    public static class Submit {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 验收类型（必填）：product/business */
        private String acceptanceType;
        /** 验收阶段（必填）：pre_release/post_release */
        private String stage;
        /** 验收对应的范围版本（缺省取交付项当前范围版本） */
        private Integer scopeVersion;
        private String buildId;
        private String testEnv;
        /** 结论（必填）：pass/fail/conditional */
        private String conclusion;
        /** 满意度评分 1-5（business 类型必填，product 可选） */
        private Integer score;
        /** 验收意见 */
        private String opinion;
        /** 有条件通过的整改条件JSON */
        private String conditionsJson;
        /** 验收证据JSON（截图/记录链接） */
        private String evidenceJson;
    }

    /** 验收记录列表查询 */
    @Data
    public static class Query {
        private Long deliveryItemId;
        private Long reqId;
        private String acceptanceType;
        private String stage;
        private Long signerUserId;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
