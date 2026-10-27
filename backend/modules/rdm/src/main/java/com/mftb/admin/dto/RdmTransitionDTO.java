package com.mftb.admin.dto;

import lombok.Data;

/**
 * 需求状态流转请求体。
 * <p>必填项由 {@code rdm_transition.required_fields} 决定，服务端按配置校验，
 * 前端仅负责提示，避免两端规则漂移。
 */
@Data
public class RdmTransitionDTO {

    /** 动作编码（见 rdm_transition.action_code） */
    private String actionCode;

    /** 说明/驳回理由 */
    private String remark;

    /** 计划上线日期 yyyy-MM-dd */
    private String planDate;

    /** 计划开发完成日期 yyyy-MM-dd */
    private String planDevDate;

    /** 承诺出 PRD 日期 yyyy-MM-dd */
    private String promisedDate;

    /** 挂起复审日期 yyyy-MM-dd */
    private String holdUntil;

    /** 关联上线版本号 */
    private String versionNo;

    /** 交付满意度 1-5 */
    private Integer score;

    /** 目标产品经理ID（分配/改派动作） */
    private Long pmUserId;

    /** 研发负责人ID（排期动作可指定） */
    private Long devOwnerUserId;

    /** 迭代/排期标识 */
    private String iterationCode;

    /**
     * 所属项目ID（归属体系改造）。
     * <p>dispatch（项目经理分配）/ accept（产品规划）时选填；schedule（提交排期）时必填，
     * 服务端校验项目存在且与所选迭代的项目一致（迭代有项目时以迭代为准回写）。
     */
    private Long projectId;

    /**
     * 交付流程版本（分配/认领时确定）：3=分批并行交付（默认）/ 2=传统整需求交付。
     * <p>提交需求时不暴露；只在准入后的分配/认领窗口生效，已有任务或交付项后不得切换。
     */
    private Integer flowVersion;

    /** 研发进度百分比 */
    private Integer progress;

    /** 阻塞原因（block 动作） */
    private String blockReason;
}
