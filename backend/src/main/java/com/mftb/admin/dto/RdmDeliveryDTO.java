package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * RDM M2 写入请求体（PRD / 评审 / 任务 / 迭代 / 变更）。
 * <p>日期统一用字符串 yyyy-MM-dd（与前端 DatePicker 输出一致），服务层解析后落库，
 * 避免同一系统内混用两种时间格式。
 */
public class RdmDeliveryDTO {

    /** PRD 新增/编辑 */
    @Data
    public static class Prd {
        private Long id;
        /** 所属业务需求（新增必填） */
        private Long reqId;
        private Long parentPrdId;
        private String title;
        private String targetUsers;
        private String featureList;
        private String acceptanceCriteria;
        private String contentRich;
        private String prototypeUrl;
        /** 拆成子 PRD 后是否把父需求推进到「PRD设计中」 */
        private Boolean advanceRequirement;
        /**
         * 已定稿的 PRD 要改内容时必须走新版本：前端传 true 才会复制一份新草稿，
         * 避免「评审通过的内容还能原地改」让开发、验收各自认一版。
         */
        private Boolean newVersion;
        /** 版本变更原因（newVersion=true 时必填，写进版本链） */
        private String changeReason;
    }

    /** 发起评审 */
    @Data
    public static class Review {
        private Long reqId;
        private Long prdId;
        /** requirement/dev/ui/test */
        private String reviewType;
        private String reviewTime;
        private List<Long> participantIds;
        private String conclusionDesc;
    }

    /** 评审结论 */
    @Data
    public static class ReviewDecision {
        /** true=通过 false=退回 */
        private Boolean passed;
        private String conclusionDesc;
        /** 退回时必填 */
        private String remark;
    }

    /** 执行任务新增/编辑 */
    @Data
    public static class Task {
        private Long id;
        private Long reqId;
        private Long prdId;
        /** design/frontend/app/backend/qa/data */
        private String taskType;
        private String title;
        private String content;
        private Long ownerUserId;
        private BigDecimal planHours;
        private String planStartDate;
        private String planFinishDate;
        private String iterationCode;
    }

    /** 里程碑节点（五节点计划/基线） */
    @Data
    public static class Milestone {
        /** PRD_REVIEW/DESIGN_DONE/DEV_START/DEV_DONE/RELEASE */
        private String code;
        private String name;
        private Long ownerUserId;
        /** yyyy-MM-dd：初步计划 */
        private String preliminaryDate;
        /** yyyy-MM-dd：当前预测（改期只动它，基线不覆盖） */
        private String forecastDate;
        /** pending/done/not_applicable */
        private String status;
        /** 不适用原因（status=not_applicable 时必填） */
        private String naReason;
    }

    /** 工时明细（按人按工作日一条） */
    @Data
    public static class WorkLog {
        /** yyyy-MM-dd */
        private String workDate;
        private BigDecimal hours;
        private String remark;
    }

    /** 任务进度/工时上报 */
    @Data
    public static class TaskProgress {
        /** start/done/block/unblock */
        private String action;
        private Integer progress;
        private BigDecimal actualHours;
        private String remark;
    }

    /** 迭代新增/编辑 */
    @Data
    public static class Iteration {
        private Long id;
        private String code;
        private String name;
        private String iterationType;
        private String startDate;
        private String endDate;
        private Integer capacityHours;
        private Long ownerUserId;
        private String status;
        private String remark;
    }

    /** 需求变更申请 */
    @Data
    public static class Change {
        private Long reqId;
        private Long prdId;
        /** scope/schedule/criterion/priority/other */
        private String changeType;
        private String afterContent;
        private String reason;
        private String impactDesc;
        private Boolean affectsSchedule;
        private BigDecimal addedHours;
        /** 变更后的计划上线日期（影响排期时要求填写） */
        private String newPlanReleaseDate;
    }
}
