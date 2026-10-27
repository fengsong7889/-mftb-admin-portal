package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产持有关系状态事件实体
 * <p>
 * 记录资产异常处置（遗失/报废/送修/归还）对资产持有关系与来源领用/借用的收口，
 * 保留前后持有人、部门、来源快照，使台账、领用/借用与异常单据可互相追溯。
 * 幂等：(operator_id, request_key) 唯一，直接登记入口据此防重放。
 */
@Data
@TableName("biz_eam_asset_state_event")
public class EamAssetStateEvent {

    @TableId
    private Long id;

    /** 资产 ID */
    private Long assetId;

    /** 业务类型：loss/scrap/repair/return */
    private String bizType;

    /** 业务单据 ID */
    private Long bizId;

    /** 来源类型：claim/borrow（无有效来源时为空） */
    private String sourceType;

    /** 来源领用/借用 ID */
    private Long sourceId;

    /** 变更前资产状态 */
    private String beforeStatus;

    /** 变更后资产状态 */
    private String afterStatus;

    /** 变更前持有人 ID */
    private Long beforeHolderId;

    /** 变更前持有人姓名 */
    private String beforeHolderName;

    /** 变更前归属部门 */
    private String beforeDepartment;

    /** 变更后归属部门（有实物交接时为目标接收部门） */
    private String afterDepartment;

    /** 操作人 ID（sys_user.id） */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 业务日期 */
    private LocalDate bizDate;

    /** 幂等请求键 */
    private String requestKey;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
