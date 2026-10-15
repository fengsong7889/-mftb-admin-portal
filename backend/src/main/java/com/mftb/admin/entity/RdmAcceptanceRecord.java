package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 验收记录实体（交付项级）
 */
@Data
@TableName("rdm_acceptance_record")
public class RdmAcceptanceRecord {

    @TableId
    private Long id;

    /** 验收记录编号 */
    private String recordNo;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 需求ID */
    private Long reqId;

    /** 验收类型:product/business */
    private String acceptanceType;

    /** 时点:pre_release/post_release */
    private String stage;

    /** 范围版本 */
    private Integer scopeVersion;

    /** 构建标识 */
    private String buildId;

    /** 测试环境 */
    private String testEnv;

    /** 结论:pass/fail/conditional */
    private String conclusion;

    /** 业务评分1-5 */
    private Integer score;

    /** 验收意见 */
    private String opinion;

    /** 签署人ID */
    private Long signerUserId;

    /** 签署人姓名 */
    private String signerUserName;

    /** 轮次 */
    private Integer roundNo;

    /** 附条件通过的条件JSON */
    private String conditionsJson;

    /** 验收证据JSON */
    private String evidenceJson;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
