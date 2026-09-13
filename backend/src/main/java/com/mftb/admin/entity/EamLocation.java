package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 仓库 / 存放位置实体（树形：仓库/楼层/办公室）
 */
@Data
@TableName("biz_eam_location")
public class EamLocation {

    @TableId
    private Long id;

    /** 位置编码（唯一） */
    private String code;

    /** 位置名称 */
    private String name;

    /** 父级 ID，0 为顶级 */
    private Long parentId;

    /** 类型：warehouse / floor / room */
    private String type;

    /** 排序 */
    private Integer sort;

    /** 地址 */
    private String address;

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
