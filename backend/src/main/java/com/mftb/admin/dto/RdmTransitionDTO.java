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

    /** 研发进度百分比 */
    private Integer progress;

    /** 阻塞原因（block 动作） */
    private String blockReason;
}
