package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产交接单实体
 */
@Data
@TableName("biz_eam_handover")
public class EamHandover {

    @TableId
    private Long id;

    /** 交接编号（系统生成，唯一） */
    private String handoverNo;

    /** 交出人 ID（可能已离职为 null） */
    private Long fromUserId;

    /** 交出人姓名快照 */
    private String fromUserName;

    /** 交出人部门快照 */
    private String fromDepartment;

    /** 接收人 ID */
    private Long toUserId;

    /** 接收人姓名 */
    private String toUserName;

    /** 接收人部门 */
    private String toDepartment;

    /** 接收人类型：employee=员工 / department=部门 */
    private String receiverType;

    /** 交接日期 */
    private LocalDate handoverDate;

    /** 交接资产数量 */
    private Integer assetCount;

    /** 交接原因：resign/transfer/other */
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
