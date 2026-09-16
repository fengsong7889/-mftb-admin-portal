package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产归还记录实体
 */
@Data
@TableName("biz_eam_return")
public class EamReturn {

    @TableId
    private Long id;

    /** 归还编号（系统生成，唯一） */
    private String returnNo;

    /** 关联领用 ID */
    private Long claimId;

    /** 资产 ID */
    private Long assetId;

    /** 归还人 ID */
    private Long employeeId;

    /** 操作人姓名 */
    private String operatorName;

    /** 归还日期 */
    private LocalDate returnDate;

    /** 归还原因 */
    private String returnReason;

    /** 归还时资产状况说明 */
    private String conditionNote;

    /** 归还凭证 ID */
    private Long returnEvidenceId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
