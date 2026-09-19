package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 资产维修记录实体
 */
@Data
@TableName("biz_eam_repair")
public class EamRepair {

    @TableId
    private Long id;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 维修日期 */
    private String repairDate;

    /** 故障描述 */
    private String faultDesc;

    /** 维修内容 */
    private String repairContent;

    /** 维修方 */
    private String repairBy;

    /** 维修费用（MOP） */
    private BigDecimal cost;

    /** 完成日期 */
    private String finishDate;

    /** 状态：repairing/done */
    private String status;

    /** 申请人/部门 */
    private String applicant;

    /** 损坏原因：human/natural/third_party/quality */
    private String causeType;

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
