package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 參數類型實體（按分類維度管理，如 CPU / 內存 / 存儲）
 */
@Data
@TableName("biz_eam_param_type")
public class EamParamType {

    @TableId
    private Long id;

    /** 所屬分類編碼 */
    private String categoryCode;

    /** 參數編碼（分類內唯一） */
    private String code;

    /** 參數名稱 */
    private String name;

    /** 計量單位 */
    private String unit;

    /** 值類型：select / text / number */
    private String valueType;

    /** 狀態 */
    private String status;

    /** 排序 */
    private Integer sort;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
