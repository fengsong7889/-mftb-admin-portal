package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产借用登记实体
 */
@Data
@TableName("biz_eam_borrow")
public class EamBorrow {

    @TableId
    private Long id;

    /** 借用编号（系统生成，唯一） */
    private String borrowNo;

    /** 资产 ID */
    private Long assetId;

    /** 借用人 ID */
    private Long holderId;

    /** 借用人姓名快照 */
    private String holderName;

    /** 借用部门 */
    private String department;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名快照 */
    private String operatorName;

    /** 状态：active/overdue/returned/cancelled */
    private String status;

    /** 借出日期 */
    private LocalDate startDate;

    /** 到期日期 */
    private LocalDate dueDate;

    /** 实际归还日期 */
    private LocalDate returnDate;

    /** 借用用途 */
    private String purpose;

    /** 续借次数 */
    private Integer renewCount;

    /** 关联归还记录 ID */
    private Long returnId;

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
