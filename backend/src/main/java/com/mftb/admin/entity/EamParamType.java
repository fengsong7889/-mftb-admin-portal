package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 参数类型实体（按分类维度管理，如 CPU / 内存 / 存储）
 */
@Data
@TableName("biz_eam_param_type")
public class EamParamType {

    @TableId
    private Long id;

    /** 所属分类编码 */
    private String categoryCode;

    /** 参数编码（分类内唯一） */
    private String code;

    /** 参数名称 */
    private String name;

    /** 计量单位 */
    private String unit;

    /** 值类型：select / text / number */
    private String valueType;

    /** 状态 */
    private String status;

    /** 排序 */
    private Integer sort;

    /** 描述 */
    private String description;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
