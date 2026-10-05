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
        /** design/frontend/backend/qa/data */
        private String taskType;
        private String title;
        private String content;
        private Long ownerUserId;
        private BigDecimal planHours;
        private String planStartDate;
        private String planFinishDate;
        private String iterationCode;
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
