package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 追加式问题修复复测验收闭环证据实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>承接需求修复后，把「修复证据 + 复测轮次 + 复测执行 + 产品/业务验收」串成一条不可变闭环事实，
 * 复测引用 {@link RdmTestRound}、验收引用 {@link RdmAcceptanceRecord}，不重新伪造结论。
 * <p>追加式事实，无 version/updated_at；{@code scopeVersion} 是业务范围版本。
 */
@Data
@TableName("rdm_issue_resolution")
public class RdmIssueResolution {

    @TableId
    private Long id;

    /** 问题ID */
    private Long issueId;

    /** 承接历史ID */
    private Long followupId;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 业务范围版本，非并发版本 */
    private Integer scopeVersion;

    /** 构建标识 */
    private String buildId;

    /** 修复证据JSON */
    private String repairEvidenceJson;

    /** 复测轮次ID */
    private Long testRoundId;

    /** 复测执行记录ID列表JSON */
    private String testExecutionIdsJson;

    /** 产品验收记录ID */
    private Long productAcceptanceId;

    /** 业务验收记录ID（可空） */
    private Long businessAcceptanceId;

    /** 结论：pass/fail */
    private String conclusion;

    /** 理由 */
    private String reason;

    /** 签署人（认证 SysUser.id） */
    private Long signerUserId;

    /** 幂等请求ID */
    private String requestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
