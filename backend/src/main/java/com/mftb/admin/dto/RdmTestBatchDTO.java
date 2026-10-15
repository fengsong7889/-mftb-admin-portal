package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * RDM 提测批次写入请求体（Batch 1）。
 * <p>提测是「研发向测试交接范围」的动作：批次必须冻结范围快照，
 * 测试通过/退回都只对快照内的交付项负责，范围后改必须重新提测（新轮次）。
 */
public class RdmTestBatchDTO {

    /** 提交提测申请 */
    @Data
    public static class Submit {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 关联需求ID（必填） */
        private Long reqId;
        /** 交付项ID列表（必填） */
        private List<Long> deliveryItemIds;
        /** 构建标识列表 */
        private List<String> buildIds;
        /** 测试环境（必填） */
        private String testEnv;
        /** 测试负责人ID（必填） */
        private Long testLeadUserId;
        /** 测试负责人姓名（必填） */
        private String testLeadUserName;
        /** 执行人ID列表 */
        private List<Long> executorUserIds;
        /** 计划结束时间 yyyy-MM-dd HH:mm:ss */
        private String planEndTime;
        /** 范围快照JSON（服务端可覆盖生成） */
        private String scopeSnapshotJson;

        /* ===== Batch 3 / 任务20 增量字段（可选、向后兼容；供任务23前端提供） ===== */
        /**
         * 用例集草稿JSON：数组元素含 deliveryItemId / caseTitle，可选带 caseId / mandatory 提示。
         * <p><b>仅为草稿/提示，绝不作为门禁权威分母</b>。受理(accept)冻结时服务端会规范化：
         * 对缺失 caseId 的用例按确定性规则（deliveryItemId + 规范化 caseTitle + 序号 的稳定哈希）分配稳定 caseId，
         * mandatory 由服务端判定（缺省视为必测，前端不能把必测翻成非必测来弱化门禁），并<b>拒绝空用例集</b>；
         * 规范化后的不可变集合写入 {@code rdm_test_round.case_snapshot_json}，此后即门禁唯一权威分母。
         */
        private String caseSnapshotJson;
        /** 交付项-系统-构建映射草稿JSON（可选）；受理冻结时随用例集一并冻结进 {@code rdm_test_round.build_mapping_json} */
        private String buildMappingJson;
    }

    /** 退回提测（受理动作无请求体，退回必须给原因） */
    @Data
    public static class Return {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        /** 退回原因（必填） */
        private String reason;
    }

    /** 录入测试执行结果 */
    @Data
    public static class Execute {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传提测批次读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        private Long deliveryItemId;
        /** 用例标题（必填） */
        private String caseTitle;
        /** 结果（必填）：pass/fail/blocked/skip */
        private String result;
        private String buildId;
        private String testEnv;
        private String remark;

        /* ===== Batch 3 / 任务20 增量字段（可选、向后兼容；V3 测试流门禁映射必需） ===== */
        /**
         * 稳定用例ID（V3 测试流必填，供任务23前端提供）：必须映射到<b>当前轮次冻结用例集</b>里的 caseId。
         * <p>服务端权威 + fail-closed：映射不到冻结用例集即拒绝该执行，不用 caseTitle 模糊派生兜底、不静默接收。
         * V1/V2 旧流不受影响。
         */
        private String caseId;
        /** 执行证据JSON（截图/日志链接等）：服务端原样留存，不作为门禁权威分母 */
        private String evidenceJson;
        /**
         * 业务范围版本（可选）：<b>以冻结轮次为权威</b>，服务端从当前 {@code RdmTestRound} 回填；
         * 客户端传值若与冻结轮次不一致 → 拒绝（不信任前端）。
         */
        private Integer scopeVersion;
    }

    /** 重新提测（新一批次，轮次+1） */
    @Data
    public static class Retest {
        /** 幂等请求ID（客户端生成，重试保持不变），用于 executeOnce 原子幂等占位 */
        private String requestId;
        /** 并发控制版本（乐观锁）：回传读取到的 version；与业务范围版本 scopeVersion 不可混用 */
        private Integer expectedVersion;

        private List<String> buildIds;
        /** 重测原因（必填） */
        private String reason;
    }

    /** 提测批次列表查询 */
    @Data
    public static class Query {
        private Long reqId;
        private String status;
        private Long testLeadUserId;
        /** 关键字（匹配批次号/环境/负责人） */
        private String keyword;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
