package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 不可变紧急产品豁免申请实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>缺验收/缺补验时的紧急放行申请：以 {@code uk_rdm_exemption_application(release_batch_id, application_version)}
 * 保证同批次同申请版本只有一份豁免申请。
 * <p>本实体只承载**申请**；产品风险确认与独立发布审批落在 {@link RdmReleaseExemptionDecision}
 * 的 {@code signer_user_id}。申请人 {@code applicant_user_id} 与签署人分离，
 * 「管理员不得代签/自批」由服务层校验 applicant ≠ signer，契约层不开后门。
 */
@Data
@TableName("rdm_release_exemption")
public class RdmReleaseExemption {

    @TableId
    private Long id;

    /** 发布批次ID */
    private Long releaseBatchId;

    /** 申请时批次并发版本（非范围版本 scopeVersion） */
    private Integer applicationVersion;

    /** 申请人（认证 SysUser.id），不得与决策签署人相同 */
    private Long applicantUserId;

    /** 豁免理由 */
    private String reason;

    /** 风险描述 */
    private String risk;

    /** 缺失的验收项JSON */
    private String missingAcceptanceJson;

    /** 范围快照JSON */
    private String scopeSnapshotJson;

    /** 构建映射JSON */
    private String buildMappingJson;

    /** 回滚预案 */
    private String rollbackPlan;

    /** 补验计划JSON：交付项 + 产品补验人 + 冻结截止时间 + 日历版本 */
    private String supplementaryPlanJson;

    /** 证据哈希 CHAR(64) */
    private String evidenceHash;

    /** 幂等请求ID */
    private String requestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
