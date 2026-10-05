package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * RDM M2 视图对象（PRD / 评审 / 任务 / 迭代 / 变更）。
 * <p>时间统一格式化为字符串，前端无需再做时区处理。
 */
public class RdmDeliveryVO {

    /** PRD */
    @Data
    public static class Prd {
        private Long id;
        private String prdNo;
        private Long reqId;
        private String reqNo;
        private String reqTitle;
        private Long parentPrdId;
        private String title;
        private String targetUsers;
        private String featureList;
        private String acceptanceCriteria;
        private String contentRich;
        private String prototypeUrl;
        private String status;
        private String versionNo;
        private String authorName;
        private String reviewTime;
        private String reviewConclusion;
        private String createdAt;
        private String updatedAt;
    }

    /** 评审记录 */
    @Data
    public static class Review {
        private Long id;
        private String reviewNo;
        private Long reqId;
        private Long prdId;
        private String prdTitle;
        private String reviewType;
        private String reviewTime;
        private String participants;
        private List<Long> participantIdList = new ArrayList<>();
        private String conclusion;
        private String conclusionDesc;
        private Boolean affectsSchedule;
        private String createdBy;
        private String createdAt;
    }

    /** 执行任务 */
    @Data
    public static class Task {
        private Long id;
        private String taskNo;
        private Long reqId;
        private String reqNo;
        private String reqTitle;
        private String reqStatus;
        private Long prdId;
        private String taskType;
        private String title;
        private String content;
        private Long ownerUserId;
        private String ownerName;
        private String ownerEmpNo;
        private String roleCode;
        private String status;
        private Integer progress;
        private BigDecimal planHours;
        private BigDecimal actualHours;
        private String planStartDate;
        private String planFinishDate;
        private String actualStartTime;
        private String actualFinishTime;
        private String blockedReason;
        private String iterationCode;
        /** 是否已逾期（计划完成日已过且未完成） */
        private Boolean overdue;
        private String createdAt;
    }

    /** 需求下的交付概览（PRD + 任务汇总） */
    @Data
    public static class DeliverySummary {
        private Long reqId;
        private String status;
        private List<Prd> prds = new ArrayList<>();
        private List<Task> tasks = new ArrayList<>();
        private List<Review> reviews = new ArrayList<>();
        private List<Change> changes = new ArrayList<>();
        private Integer taskTotal;
        private Integer taskDone;
        private Integer taskBlocked;
        private Integer overallProgress;
        private BigDecimal planHoursTotal;
        private BigDecimal actualHoursTotal;
        /** 按任务类型分组的工时（用于研发/设计/测试投入分析） */
        private List<NameValue> hoursByType = new ArrayList<>();
    }

    /** 迭代 */
    @Data
    public static class Iteration {
        private Long id;
        private String code;
        private String name;
        private String iterationType;
        private String startDate;
        private String endDate;
        private Integer capacityHours;
        /** 迭代負責人ID：编辑表单回填用（只回显 ownerName 会导致保存时丢负责人） */
        private Long ownerUserId;
        private String ownerName;
        private String status;
        private String remark;
        /** 已排入本迭代的需求数与工时（产能对比） */
        private Integer reqCount;
        private Integer taskCount;
        private BigDecimal taskHours;
    }

    /** 需求变更 */
    @Data
    public static class Change {
        private Long id;
        private String changeNo;
        private Long reqId;
        private String reqNo;
        private String reqTitle;
        private Long prdId;
        private String changeType;
        private String afterContent;
        private String reason;
        private String impactDesc;
        private Boolean affectsSchedule;
        private BigDecimal addedHours;
        private String flowNo;
        private String approvalStatus;
        private String applicantName;
        private String applyTime;
        private String decideTime;
        private String decideRemark;
    }

    /** 名值对（工时分布用） */
    @Data
    public static class NameValue {
        private String name;
        private Double value;

        public NameValue() {
        }

        public NameValue(String name, Double value) {
            this.name = name;
            this.value = value;
        }
    }
}
