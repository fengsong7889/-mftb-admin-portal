package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产调拨单实体
 * <p>
 * 调拨 = 物资部将单件在用资产转移至新使用人/新归属部门（in_use → in_use），
 * 与交接（批量人A→人B）互补，是台账归属部门变更的合法通道之一。
 */
@Data
@TableName("biz_eam_transfer")
public class EamAssetTransfer {

    @TableId
    private Long id;

    /** 调拨编号（系统生成，唯一） */
    private String transferNo;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号快照 */
    private String assetNo;

    /** 资产名称快照 */
    private String assetName;

    /** 原使用人 ID（可能已离职为 null） */
    private Long fromUserId;

    /** 原使用人快照 */
    private String fromUserName;

    /** 原归属部门快照 */
    private String fromDepartment;

    /** 新使用人 ID */
    private Long toUserId;

    /** 新使用人姓名 */
    private String toUserName;

    /** 新使用人工号 */
    private String toUserEmpId;

    /** 新归属部门 */
    private String toDepartment;

    /** 调拨日期 */
    private LocalDate transferDate;

    /** 调拨原因 */
    private String reason;

    /** 状态：done/cancelled */
    private String status;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
