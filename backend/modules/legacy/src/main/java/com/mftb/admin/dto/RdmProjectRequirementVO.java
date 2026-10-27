package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 项目详情「需求视角」聚合（交付清单 / 待推进 / 进度卡的新口径）。
 *
 * <p><b>为什么另起一套而不是改旧 checklist</b>：旧交付清单以 {@code rdm_delivery_item} 为唯一行源，
 * 交付项只是 V3 需求的可选拆分批次（系统在需求准入时自动建 1 条默认交付项），
 * 未准入/未拆分的需求在旧口径里完全不可见 —— 项目挂着需求却显示「暫無交付項」。
 * 本视图以「迭代 → 需求」为骨架，交付项降为需求行上的完成度补充，两者口径同一次查询产出，
 * 避免前端各拼一套。
 */
public class RdmProjectRequirementVO {

    /** 需求行 */
    @Data
    public static class RequirementRow {
        private Long id;
        private String reqNo;
        private String title;
        /** 需求状态码（前端按 RDM_STATUS_LABEL 渲染） */
        private String status;
        /** aggregate=聚合需求 / execution=执行需求 */
        private String requirementKind;
        private String iterationCode;
        private String pmName;
        private String devOwnerName;
        /** 计划开发完成日期（yyyy-MM-dd） */
        private String planDevDate;
        /** 计划上线日期（yyyy-MM-dd） */
        private String planReleaseDate;
        private Integer progress;
        private boolean blocked;
        private boolean overdue;
        /** 该需求下交付项总数；0 表示未拆分（按需求整体交付） */
        private int deliveryItemTotal;
        private int deliveryItemDone;
    }

    /** 迭代分组（项目下已挂项目的迭代） */
    @Data
    public static class IterationGroup {
        private String iterationCode;
        private String iterationName;
        /** planning / active / closed */
        private String status;
        private String startDate;
        private String endDate;
        private int requirementTotal;
        private int requirementDelivered;
        private List<RequirementRow> requirements = new ArrayList<>();
    }

    /**
     * 待推进项（需求/任务口径）。
     * <p>type 取值：
     * <ul>
     *   <li>intake_pending —— 待准入（尚未进入交付流程）</li>
     *   <li>unplanned —— 已准入但未排期（无迭代）</li>
     *   <li>overdue —— 逾期未完成</li>
     *   <li>blocked_task —— 阻塞任务</li>
     *   <li>no_owner —— 缺研发负责人</li>
     *   <li>decision —— 未决问题/延期待裁决（复用事实源待办）</li>
     * </ul>
     */
    @Data
    public static class Todo {
        private String type;
        /** 对象主键：需求待办=reqId，任务待办=taskId，问题待办=issueId */
        private Long refId;
        private Long reqId;
        private String reqNo;
        private String title;
        /** 补充说明（如阻塞原因、逾期天数） */
        private String detail;
        private String responsibleName;
        private String dueDate;
        /** 前端已注册路由 */
        private String actionUrl;
    }

    /** 双口径概览：需求/迭代 + 交付项 */
    @Data
    public static class Summary {
        private int iterationTotal;
        private int requirementTotal;
        private int requirementDelivered;
        private int requirementInProgress;
        /** 草稿/待准入/准入驳回 */
        private int requirementPending;
        private int blockedTaskCount;
        private int pendingDecisionCount;
        private int pendingAcceptanceCount;
        private int deliveryItemTotal;
        private int deliveryItemDone;
    }

    /** 项目需求视角全量返回 */
    @Data
    public static class Board {
        private List<IterationGroup> iterations = new ArrayList<>();
        /** 未挂迭代（或迭代不属于本项目）的需求 */
        private List<RequirementRow> unplanned = new ArrayList<>();
        private List<Todo> todos = new ArrayList<>();
        private Summary summary = new Summary();
    }
}
