package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 參數值實體（參數類型的可選項，如 A18 Pro / 16GB / 512GB）
 */
@Data
@TableName("biz_eam_param_value")
public class EamParamValue {

    @TableId
    private Long id;

    /** 所屬參數類型編碼 */
    private String paramTypeCode;

    /** 所屬分類編碼（冗餘，方便查詢） */
    private String categoryCode;

    /** 可選值 */
    private String value;

    /** 排序 */
    private Integer sort;

    /** 狀態 */
    private String status;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
