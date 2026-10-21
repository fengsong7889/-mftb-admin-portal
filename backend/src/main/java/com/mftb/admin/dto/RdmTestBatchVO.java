package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 提测批次视图对象（Batch 1）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 */
public class RdmTestBatchVO {

    /** 按任务解析出的提测范围（交付项） */
    @Data
    public static class TaskScopeItem {
        private Long id;
        private String itemNo;
        private String title;
        private String status;
    }

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
        /**
         * 执行人展示签名「姓名(工号)」，与 {@link #executorUserIds} 同序。
         * <p>为什么由服务端把名字算好下发：执行人只存了 ID 列表，让前端自己按 ID 回查
         * 要么依赖员工管理菜单的查询权限（普通研发/QA 拿不到 → 详情空白），
         * 要么逐 id 发请求。账户已注销的 id 会被剔除，因此本列表可能短于 ID 列表。
         */
        private List<String> executorUserNames = new ArrayList<>();
        /** 执行记录（按执行时间升序） */
        private List<ExecutionRecord> executions = new ArrayList<>();
        private String applicantUserName;
        private String returnedReason;
        /* ===== Batch 3 新事实字段（rdm:schema:v3.2） ===== */
        /** 并发控制版本（乐观锁），前端提交写操作时回传为 expectedVersion；非范围版本 */
        private Integer version;
        /** 待接收用例草稿JSON（权威冻结集合以测试轮次为准） */
        private String caseSnapshotJson;
        /**
         * 当前轮次的<b>冻结用例集</b>（含服务端派生的稳定 caseId 与每用例有效结果）。
         * <p>必须有这个字段：录结果接口只认 caseId，而 caseId 是受理时在服务端派生的
         * （{@code C-<交付项Id>-<sha12>}，为了跨轮对齐故意不由前端自定、也不可预测）。
         * 只有草稿 caseSnapshotJson（无 caseId）时，任何客户端都拿不到合法 caseId，
         * 只能在界面上手输一个猜的值 → 提测链路在 UI 上永远录不进结果。
         * <p>未冻结（还没受理）时为空列表。
         */
        private List<CaseEntry> frozenCases = new ArrayList<>();
        /** 待接收交付项-系统-构建映射JSON */
        private String buildMappingJson;
        private String updatedAt;
    }

    /**
     * 冻结用例条目（任务20 测试流：把服务端权威 caseId 交给前端选用）。
     */
    @Data
    public static class CaseEntry {
        private Long deliveryItemId;
        private String deliveryItemTitle;
        /** 服务端派生的稳定用例 ID（录结果必须原样带上） */
        private String caseId;
        private String caseTitle;
        /** 业务范围版本（冻结时快照，非并发版本） */
        private Integer scopeVersion;
        /** 是否必测（参与通过判定） */
        private Boolean mandatory;
        /** 本用例在本轮的有效结果：pass/fail/not_passed/not_executed */
        private String effectiveResult;
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
