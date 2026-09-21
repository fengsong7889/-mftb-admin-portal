package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产赔付记录实体
 */
@Data
@TableName("biz_eam_compensation")
public class EamCompensation {

    @TableId
    private Long id;

    /** 赔付编号（系统生成，唯一） */
    private String compNo;

    /** 关联归还记录 ID */
    private Long returnId;

    /** 关联遗失单 ID（遗失类型赔付时关联） */
    private Long lossId;

    /** 资产 ID */
    private Long assetId;

    /** 资产名称快照 */
    private String assetName;

    /** 资产编号快照 */
    private String assetNo;

    /** 原持有人 ID */
    private Long holderId;

    /** 原持有人姓名快照 */
    private String holderName;

    /** 损失类型：damage/loss */
    private String damageType;

    /** 原因：human/natural/third_party/quality */
    private String cause;

    /** 责任对象：employee/department/company/none */
    private String party;

    /** 责任人 ID */
    private Long responsibleId;

    /** 责任人姓名 */
    private String responsibleName;

    /** 责任部门 */
    private String department;

    /** 应赔金额（分） */
    private Long amount;

    /** 净收款（分） */
    private Long netPaid;

    /** 状态：pending/confirmed/partially_paid/paid/waived/refund_pending */
    private String status;

    /** 是否需要找回复核：0=否 1=是 */
    private Integer reviewRequired;

    /** 定责依据 */
    private String basis;

    /** 异常说明 */
    private String reason;

    /** 免赔原因 */
    private String waiveReason;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名快照 */
    private String operatorName;

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
