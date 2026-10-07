package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 业务验收单实体（需求闭环最后一道闸）
 */
@Data
@TableName("rdm_acceptance")
public class RdmAcceptance {

    @TableId
    private Long id;

    /** 验收单号 XQYS+YYYYMMDD+4位 */
    private String acceptNo;

    /** 需求ID */
    private Long reqId;

    /** 验收人ID */
    private Long acceptorUserId;

    /** 验收人工号快照 */
    private String acceptorEmpNo;

    /** 验收人姓名快照 */
    private String acceptorName;

    /** 结论: pass/conditional/fail */
    private String result;

    /**
     * 验收阶段（阶段 4）：pre_release 上线前预验收 / post_release 上线后业务验收。
     * <p>两次事实必须分开：预验收验的是“质量能不能上线”，
     * 业务验收验的是“上线后是否解决了我的问题”，合成一条会让满意度分数无法归因。
     */
    private String stage;

    /**
     * 第几次验收（1=首次，>1=返工复验）。
     * <p>冻结在当时序号而不是查历史条数反推：事后补录或修订会让「一次通过率」飘移。
     */
    private Integer attempt;

    /** 验收环境: prod/pre/uat（返工时必须能复现当时的环境） */
    private String testEnv;

    /** 交付满意度 1-5 */
    private Integer score;

    /** 验收用例总数 */
    private Integer caseTotal;

    /** 通过用例数 */
    private Integer casePass;

    /** 本次缺陷数（用例未通过条数） */
    private Integer defectCount;

    /** 问题/遗留事项 */
    private String issues;

    /** 验收意见 */
    private String opinion;

    /** 有条件通过时自动转出的后续需求ID */
    private Long followUpReqId;

    /** 后续需求编号快照 */
    private String followUpReqNo;

    /** 验收时间 */
    private LocalDateTime acceptTime;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
