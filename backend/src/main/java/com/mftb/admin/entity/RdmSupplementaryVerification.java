package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 补验任务实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>紧急豁免放行后必须在冻结截止时间前完成补验，补验签字引用既有验收事实
 * （{@code acceptance_record_id}），不伪造新的验收结论。
 * <p>以 {@code uk_rdm_supplementary_scope(release_batch_id, delivery_item_id, scope_version, build_id, verification_type)}
 * 保证同范围同构建同类型只有一条补验任务。
 * <p>字段区分：{@code scopeVersion} = 业务范围版本（补验对应的范围）；
 * {@code version} = 并发控制版本（乐观锁），二者语义不同、不可混用。
 */
@Data
@TableName("rdm_supplementary_verification")
public class RdmSupplementaryVerification {

    @TableId
    private Long id;

    /** 发布批次ID */
    private Long releaseBatchId;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 业务范围版本（补验对应的范围），非并发版本 */
    private Integer scopeVersion;

    /** 构建标识 */
    private String buildId;

    /** 补验类型：product/business */
    private String verificationType;

    /** 关联的紧急豁免申请ID（可空） */
    private Long exemptionId;

    /** 补验人（认证 SysUser.id） */
    private Long verifierUserId;

    /** 补验人姓名 */
    private String verifierUserName;

    /** 冻结截止时间（申请时用工作日历冻结，不动态顺延） */
    private LocalDateTime deadline;

    /** 日历版本 */
    private String calendarVersion;

    /** 状态：pending/completed/overdue/failed */
    private String status;

    /** 结果：pass/fail */
    private String result;

    /** 引用的验收事实ID */
    private Long acceptanceRecordId;

    /** 补验证据JSON */
    private String evidenceJson;

    /** 完成时间 */
    private LocalDateTime completedAt;

    /** 完成人 */
    private Long completedBy;

    /** 是否已升级（0/1） */
    private Integer escalated;

    /** 升级时间 */
    private LocalDateTime escalatedAt;

    /** 升级级别 */
    private Integer escalationLevel;

    /** 并发控制版本（乐观锁），非业务范围版本 scopeVersion */
    @Version
    private Integer version;

    /** 创建人 */
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
