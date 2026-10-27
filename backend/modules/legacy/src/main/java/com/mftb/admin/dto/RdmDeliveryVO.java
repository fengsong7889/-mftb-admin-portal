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
        /** 并发版本号：前端保存时原样回传，服务端据此判断是否被他人改过 */
        private Integer rowVersion;
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
        /** 任务归属的交付项ID（任务19 / 缺口2）：回显给前端，V3 下任务挂在具体交付项上 */
        private Long deliveryItemId;
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
        /**
         * 实际工时是否已填报。旧实现会在完成时自动补 1 工日，
         * 那个自造数字会把估时偏差与负载核算一起做假，现在改为显式标记缺报。
         */
        private Boolean actualHoursReported;
        private String planStartDate;
        private String planFinishDate;
        /** 任务计划上线日（默认继承需求计划上线，不得晚于需求计划上线） */
        private String planReleaseDate;
        private String actualStartTime;
        private String actualFinishTime;
        private String blockedReason;
        private String iterationCode;
        /** 是否已逾期（计划完成日已过且未完成） */
        private Boolean overdue;
        private String createdAt;
    }

    /**
     * 团队任务视图的成员项。
     * <p>只暴露姓名与工号：任务协作需要找人，不需要把部门/组织归属一并摊开；
     * {@code sharedProjectCount} 用于说明"为什么他能被看到"（共同项目数）。
     */
    @Data
    public static class TeamMember {
        private Long userId;
        private String name;
        private String empNo;
        /** 与当前人的共同项目数；全量数据范围（管理员/PMO）为 null，表示不受项目限制 */
        private Integer sharedProjectCount;
    }

    /**
     * 任务负责人资格预检结果。
     * <p>只用于界面提醒：无研发交付权限不阻断保存（先排期、后补权限），
     * 离职/停用才会在保存时被真正拦下。
     */
    @Data
    public static class OwnerCheck {
        /** 负责人是否可正常干活（在职启用且具备研发交付权限） */
        private Boolean able = true;
        /** 是否会被保存硬拦下（离职/停用/查无此人）；false 表示只提醒不阻断 */
        private Boolean hardBlocked = false;
        /** 负责人姓名（回显确认派给了谁） */
        private String ownerName;
        /** 负责人所在部门（表单「所屬部門」自动带出用，编辑态也能回填） */
        private String department;
        /** 提醒文案（null 表示无需提醒） */
        private String warning;
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
        /** 五节点计划与基线（阶段 3） */
        private List<Milestone> milestones = new ArrayList<>();
        private Integer taskTotal;
        private Integer taskDone;
        private Integer taskBlocked;
        private Integer overallProgress;
        private BigDecimal planHoursTotal;
        private BigDecimal actualHoursTotal;
        /** 按任务类型分组的工时（用于研发/设计/测试投入分析） */
        private List<NameValue> hoursByType = new ArrayList<>();
        /** 完成但未填报工时的任务数（缺报不能藏起来，否则产能对账看着很干净） */
        private Integer unreportedHoursTasks;
    }

    /** 里程碑节点（计划/基线/预测/实际） */
    @Data
    public static class Milestone {
        private Long id;
        private String code;
        private String name;
        private Long ownerUserId;
        private String ownerName;
        private String preliminaryDate;
        private String baselineDate;
        private String forecastDate;
        private String actualDate;
        private String status;
        private String naReason;
        private Integer sortOrder;
        /** 相对基线的偏差天数（正数=晚于基线；无基线时为空） */
        private Integer slipDays;
        /** 已冻结基线：不允许再改初步计划，只能改预测并留变更原因 */
        private Boolean baselineLocked;
    }

    /** 工时明细行 */
    @Data
    public static class WorkLog {
        private Long id;
        private Long taskId;
        private Long userId;
        private String userName;
        private String workDate;
        private BigDecimal hours;
        private String remark;
        private String updatedBy;
    }

    /** PRD 定稿快照 */
    @Data
    public static class PrdSnapshot {
        private Long id;
        private Long prdId;
        private String versionNo;
        private String title;
        private String conclusion;
        private String conclusionDesc;
        private String reviewerNames;
        private String snapshotTime;
    }

    /** 迭代 */
    @Data
    public static class Iteration {
        private Long id;
        private String code;
        private String name;
        /** 所属项目ID（sprint/version 必填，hotfix 可空；存量未补挂时为 null） */
        private Long projectId;
        /** 所属项目名称（列表展示用，联表 rdm_project 取） */
        private String projectName;
        private String iterationType;
        private String startDate;
        private String endDate;
        private Integer capacityHours;
        /** 迭代負責人ID：编辑表单回填用（只回显 ownerName 会导致保存时丢负 责人） */
        private Long ownerUserId;
        private String ownerName;
        /** 负责人工号（服务端按 ownerUserId 批量回填，列表统一展示姓名+工号） */
        private String ownerEmpNo;
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
