package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 追加式豁免决策实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>一份豁免申请需要两类**独立**签署：产品风险确认(product_risk) 与 独立发布审批(release)，
 * 以 {@code uk_rdm_exemption_decision(exemption_id, decision_type)} 保证每类只签一次。
 * <p>签署人 {@code signer_user_id} 必须不同于豁免申请人，且两类签署人彼此独立，
 * 「管理员不得代签/自批」由服务层校验，契约层用独立字段区分申请人与签署人。
 */
@Data
@TableName("rdm_release_exemption_decision")
public class RdmReleaseExemptionDecision {

    @TableId
    private Long id;

    /** 豁免申请ID */
    private Long exemptionId;

    /** 决策类型：product_risk/release */
    private String decisionType;

    /** 决策：approved/rejected */
    private String decision;

    /** 决策理由 */
    private String reason;

    /** 签署人（认证 SysUser.id），不得与豁免申请人相同 */
    private Long signerUserId;

    /** 证据哈希 CHAR(64) */
    private String evidenceHash;

    /** 幂等请求ID */
    private String requestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
