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
        /** 下一个交付项计划完成日期（未完成项中最早的 plan_end_date） */
        private String nextDeliveryDate;
        /** 阻塞中的交付项数 */
        private Integer blockedCount;
        /** 待决策事项数（延期申请待裁决 + 待审批变更） */
        private Integer pendingDecisionCount;
        private String updatedAt;
    }

    /** 项目详情 */
    @Data
    public static class Detail {
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
        private Integer deliveredCount;
        private Integer totalDeliveryCount;
        private String nextDeliveryDate;
        private Integer blockedCount;
        private Integer pendingDecisionCount;
        private String updatedAt;
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
        /** 测试状态（由提测批次推导） */
        private String testStatus;
        /** 验收状态（由验收记录推导） */
        private String acceptanceStatus;
        private String blockedReason;
    }

    /**
     * 待办事项（项目视角）。
     * <p>type 取值：unassigned=交付项未指定协调人 / blocked=阻塞中 /
     * decision=延期申请待裁决 / confirm=变更待审批 / overdue=已逾期。
     */
    @Data
    public static class PendingItem {
        private String type;
        private Long refId;
        private String refNo;
        private String title;
        private String responsibleName;
        private String dueDate;
        /** 前端跳转地址 */
        private String actionUrl;
    }

    /** 项目总览统计卡片 */
    @Data
    public static class StatsCard {
        /** 进行中项目数（preparing/in_progress） */
        private Integer inProgressCount;
        /** 需关注项目数（风险或逾期或暂停） */
        private Integer attentionCount;
        /** 待决策事项总数 */
        private Integer pendingDecisionCount;
    }
}
