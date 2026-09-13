package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 参数值实体（参数类型的可选项，如 A18 Pro / 16GB / 512GB）
 */
@Data
@TableName("biz_eam_param_value")
public class EamParamValue {

    @TableId
    private Long id;

    /** 所属参数类型编码 */
    private String paramTypeCode;

    /** 所属分类编码（冗余，方便查询） */
    private String categoryCode;

    /** 可选值 */
    private String value;

    /** 排序 */
    private Integer sort;

    /** 状态 */
    private String status;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
