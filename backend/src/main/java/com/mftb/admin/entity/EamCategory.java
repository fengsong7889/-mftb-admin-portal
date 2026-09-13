package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产分类实体（树形，含参数模板）
 */
@Data
@TableName("biz_eam_category")
public class EamCategory {

    @TableId
    private Long id;

    /** 分类编码（唯一，如 0101 / 010101） */
    private String code;

    /** 分类名称 */
    private String name;

    /** 父级 ID，0 为顶级 */
    private Long parentId;

    /** 状态：enabled / disabled */
    private String status;

    /** 该分类下资产需填写的参数模板 JSON */
    private String paramTemplate;

    /** 排序 */
    private Integer sort;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
