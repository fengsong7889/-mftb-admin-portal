package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 评审记录实体（需求评审 / 研发评审 / UI 评审 / 测试评审）。
 */
@Data
@TableName("rdm_review")
public class RdmReview {

    @TableId
    private Long id;

    /** 评审编号 RV+YYYYMMDD+4位 */
    private String reviewNo;

    /** 业务需求ID */
    private Long reqId;

    /** 被评审的 PRD（需求级评审可空） */
    private Long prdId;

    /** 评审类型: requirement/dev/ui/test */
    private String reviewType;

    /** 评审时间 */
    private LocalDateTime reviewTime;

    /** 参与人姓名（逗号分隔，展示用） */
    private String participants;

    /** 参与人ID（逗号分隔，通知用） */
    private String participantIds;

    /** 结论: pending/passed/rejected */
    private String conclusion;

    /** 结论说明 */
    private String conclusionDesc;

    /** 结论是否影响排期 */
    private Integer affectsScheduleFlag;

    /** 附件ID列表 */
    private String attachmentIds;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
