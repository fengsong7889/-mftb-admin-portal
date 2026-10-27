package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 发布放行单实体（阶段 4：上线前的质量闸门）。
 * <p>检查项结果以快照形式随行保存，而不是每次实时算：放行是一个时点决定，
 * 事后规则变了不能把当时的合规变成违规。
 */
@Data
@TableName("rdm_release")
public class RdmRelease {

    /** 状态：待放行 */
    public static final String STATUS_PENDING = "pending";
    /** 状态：已放行 */
    public static final String STATUS_PASSED = "passed";
    /** 状态：驳回 */
    public static final String STATUS_REJECTED = "rejected";
    /** 状态：已撤销（需求退回返工后旧放行单作废） */
    public static final String STATUS_REVOKED = "revoked";

    @TableId
    private Long id;

    /** 放行单号 */
    private String releaseNo;

    /** 需求ID */
    private Long reqId;

    /** 第几次放行（返工后再上线时递增，历史不覆盖） */
    private Integer roundNo;

    /** 目标环境 prod/pre/uat */
    private String env;

    /** 发布版本号/迭代号 */
    private String versionNo;

    /** 计划上线时间 */
    private LocalDateTime planTime;

    /** pending/passed/rejected/revoked */
    private String status = STATUS_PENDING;

    /** 检查项结果快照（JSON） */
    private String checksJson;

    /** 未通过且未豁免的检查项数 */
    private Integer blockingCount;

    /** 放行说明 / 驳回原因 / 豁免理由 */
    private String summary;

    /** 发起人（通常产品经理） */
    private Long applicantUserId;

    /** 发起人工号快照 */
    private String applicantEmpNo;

    /** 发起人姓名快照 */
    private String applicantName;

    /** 发起时间 */
    private LocalDateTime applyTime;

    /** 放行人 */
    private Long gateUserId;

    /** 放行人工号快照 */
    private String gateEmpNo;

    /** 放行人姓名快照 */
    private String gateName;

    /** 放行动作时间 */
    private LocalDateTime decideTime;

    /** 放行有效期（过期须重新过闸） */
    private LocalDateTime expireAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
