package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 项目管理视图对象（Batch 1）。
 * <p>时间统一格式化为字符串（yyyy-MM-dd / yyyy-MM-dd HH:mm:ss），前端无需再做时区处理。
 */
public class RdmProjectVO {

    /** 项目列表项 */
    @Data
    public static class ListItem {
        private Long id;
        private String projectNo;
        private String name;
        private String objective;
        private String pmUserName;
        private String productOwnerUserName;
        private String planStartDate;
        private String planEndDate;
        private String status;
        private Integer pausedFlag;
        private Integer riskFlag;
        private Integer overdueFlag;
        /** 已交付项数（status=done） */
        private Integer deliveredCount;
        /** 交付项总数 */
        private Integer totalDeliveryCount;
        /** 范围内需求数（与统计卡/导出同源于事实源，不得前端另算） */
        private Integer requirementTotal;
        /** 研发任务总数（项目下全部交付项的任务相加） */
        private Integer taskTotal;
        /** 已完成研发任务数 */
        private Integer taskCompleted;
        /** 下一个交付项计划完成日期（未完成项中最早的 plan_end_date） */
        private String nextDeliveryDate;
        /** 阻塞中的交付项数 */
        private Integer blockedCount;
        /** 待决策事项数（延期申请待裁决 + 待审批变更） */
        private Integer pendingDecisionCount;
        /** 最后更新人姓名快照（rdm:schema:v3.14 起有值；存量行为空，界面降级显示 -） */
        private String updatedBy;
        private String updatedAt;
    }

    /** 项目详情 */
    @Data
    public static class Detail {
        private Long id;
        private String projectNo;
        private String name;
        private String objective;
        /** 项目经理用户ID（编辑回显 EmployeeSelect 需要） */
        private Long pmUserId;
        private String pmUserName;
        /** 产品负责人用户ID（编辑回显 EmployeeSelect 需要） */
        private Long productOwnerUserId;
        private String productOwnerUserName;
        /** 技术负责人 */
        private Long techLeadUserId;
        private String techLeadUserName;
        /** UI 设计负责人 */
        private Long uiDesignerUserId;
        private String uiDesignerUserName;
        /** 测试/QA 负责人 */
        private Long qaLeadUserId;
        private String qaLeadUserName;
        /** 运维/DevOps 负责人 */
        private Long opsLeadUserId;
        private String opsLeadUserName;
        private String planStartDate;
        private String planEndDate;
        /** 默認驗收路徑（A/B，詳情頁回顯與編輯回填用） */
        private String defaultAcceptancePath;
        private String status;
        private Integer pausedFlag;
        private Integer riskFlag;
        private Integer overdueFlag;
        private Integer deliveredCount;
        private Integer totalDeliveryCount;
        private String nextDeliveryDate;
        private Integer blockedCount;
        private Integer pendingDecisionCount;
        private String updatedAt;
        /** 最后更新人姓名快照（详情页「最后更新」footer 与列表列同源） */
        private String updatedBy;
        /** 在途成员 */
        private List<MemberItem> members = new ArrayList<>();
        private String scopeSummaryJson;
        /** 乐观锁版本（编辑提交时回传 expectedVersion） */
        private Integer version;
        private String createdAt;
    }

    /** 项目交付概览（看板卡片） */
    @Data
    public static class Summary {
        private Long projectId;
        private String projectName;
        private String status;
        private Integer totalItems;
        private Integer deliveredItems;
        private Integer testingItems;
        private Integer blockedItems;
        private Integer pendingItems;
        private Integer overdueItems;
        /** 下一个里程碑（未完成交付项中最早的计划完成日期） */
        private String nextMilestone;
        private String lastUpdated;
    }

    /** 项目成员 */
    @Data
    public static class MemberItem {
        private Long id;
        private Long userId;
        private String empNo;
        private String userName;
        /** pm/product/dev_lead/dev/qa/designer/pmo */
        private String roleCode;
        private String joinTime;
    }

    /** 交付清单（按需求分组） */
    @Data
    public static class DeliveryChecklist {
        private Long reqId;
        private String reqTitle;
        private String reqNo;
        private List<ChecklistItem> items = new ArrayList<>();
    }

    /** 交付清单行 */
    @Data
    public static class ChecklistItem {
        private Long itemId;
        private String itemNo;
        private String title;
        private String coordinatorName;
        private String status;
        private String planEndDate;
        /**
         * 测试状态。
         * <p><b>任务22 口径修复</b>：{@code passed} 只认任务20
         * {@code RdmTestBatchService#isTestPassed} 的权威判定（有效批次 + 当前冻结轮次 +
         * 必测用例全 pass + 无 critical/major 未闭环）；{@code testing} 仅表示「交付项处于测试环节」，
         * <b>绝不</b>表示已通过。旧实现由「有 doing 任务」推导出 testing，等于让被门禁的对象自己给自己发通行证。
         */
        private String testStatus;
        /**
         * 验收状态。
         * <p><b>任务22 口径修复</b>：{@code passed} 只认任务20 的产品<b>且</b>业务验收权威结论；
         * {@code pending} 表示已到达验收环节但尚未通过。旧实现把「交付项 status=done」直接当作
         * {@code passed} —— 那是由交付状态推导验收，会让未经签署的交付项显示为已验收。
         */
        private String acceptanceStatus;
        /** 任务20 权威判定：产品验收是否通过（当前 scopeVersion，失效证据已过滤） */
        private Boolean productAcceptancePassed;
        /** 任务20 权威判定：业务验收是否通过 */
        private Boolean bizAcceptancePassed;
        /** 当前范围版本（验收事实按此版本判定，旧版本证据不算通过） */
        private Integer scopeVersion;
        /** 未决问题数（与统计卡「待裁决」同口径） */
        private Integer pendingDecisionCount;
        /** 原范围延期残余数（旧 scopeVersion 下已批准延期且承接未闭环） */
        private Integer deferResidualCount;
        /** 逾期工作日数（按责任人真实工作日历，含请假/周末支援） */
        private Integer overdueWorkingDays;
        /** 前端已注册路由（由 {@code RdmConstants#deliveryItemRoute} 统一拼装） */
        private String actionUrl;
        private String blockedReason;
    }

    /**
     * 待办事项（项目视角）。
     *
     * <p><b>任务22 口径修复</b>：待办由 {@code RdmTodoBoardService} 统一计算并按
     * {@code (objectType, refId, responsibleUserId)} <b>去重</b> —— 旧实现对同一个交付项分别按
     * 「未指派 / 阻塞 / 逾期」各产出一条，一个交付项能被计 3 次，待办总数虚高。
     * 现在 {@link #type} 只承载<b>首要成因</b>，全部成因见 {@link #reasons}，
     * 并新增 {@link #bucket} 区分「待我处理 / 等待他人 / 未指派」。
     *
     * <p>type 取值：unassigned=未指定责任人 / blocked=阻塞中 / overdue=已逾期 /
     * decision=未决问题待裁决 / defer_residual=原范围延期残余 /
     * product_acceptance=待产品验收签署 / biz_acceptance=待业务验收签署 / test_not_passed=测试未通过。
     */
    @Data
    public static class PendingItem {
        private String type;
        private Long refId;
        private String refNo;
        private String title;
        private String responsibleName;
        private String dueDate;
        /** 对象类型（{@code RdmConstants.NOTIFY_OBJECT_*}）：交付项 / 问题 / 延期单 / 项目 */
        private String objectType;
        /** 分桶：mine=待我处理 / waiting_others=等待他人 / unassigned=未指派 */
        private String bucket;
        /** 责任人（决定分桶）；null = 未指派 */
        private Long responsibleUserId;
        /** 全部成因明细（去重后一条待办可命中多个成因，但只算一条） */
        private List<String> reasons = new ArrayList<>();
        /** 是否逾期 */
        private Boolean overdue;
        /** 按责任人真实工作日历计算的逾期工作日数（含请假/周末支援） */
        private Integer overdueWorkingDays;
        /**
         * 前端跳转地址。
         * <p><b>任务22 口径修复</b>：一律使用<b>前端已注册</b>路由，且按对象类型分流 ——
         * 问题走 {@code /rdm-issue?id=}，交付项走 {@code /rdm-delivery-item?id=&mode=view}。
         * 旧实现把所有待办都拼成未注册的 {@code /rdm/project/delivery/{id}}（点开即 404），
         * 且问题也套用了交付项地址。
         */
        private String actionUrl;
    }

    /** 项目总览统计卡片（任务22：全部计数与列表行/导出/对账同源于事实源） */
    @Data
    public static class StatsCard {
        /** 进行中项目数（preparing/in_progress） */
        private Integer inProgressCount;
        /** 需关注项目数（风险或逾期或暂停） */
        private Integer attentionCount;
        /** 待决策事项总数（= 各项目行相加，旧实现行级恒为 0，两者永远对不上） */
        private Integer pendingDecisionCount;
        /** 范围内项目总数 */
        private Integer totalProjects;
        /** 交付完成项目数（status=all_delivered）。<b>不含已关闭项目</b> */
        private Integer allDeliveredProjects;
        /** 已关闭项目数（关闭只是归档动作，<b>不代表交付完成</b>） */
        private Integer closedProjects;
        /** 原范围延期残余合计 */
        private Integer deferResidualCount;
        /** 去重后的待办总数（= mine + waitingOthers + unassigned） */
        private Integer todoTotal;
        /** 待我处理 */
        private Integer todoMineCount;
        /** 等待他人 */
        private Integer todoWaitingOthersCount;
        /** 未指派 */
        private Integer todoUnassignedCount;
    }
}
