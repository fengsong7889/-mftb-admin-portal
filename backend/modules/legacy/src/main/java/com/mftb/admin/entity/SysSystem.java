package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 业务系统清单实体（用于统一门户与系统准入）。
 * <p>
 * 唯一真值来源：{@code docs/system-portal/inventory.md}；{@code code} 主键、不参与业务变更。
 */
@Data
@TableName("sys_system")
public class SysSystem {

    /** 系统编码，主键 */
    @TableId(value = "code", type = com.baomidou.mybatisplus.annotation.IdType.INPUT)
    private String code;

    /** 中文名 */
    private String name;

    /** 英文名 */
    private String nameEn;

    /** 简介 */
    private String description;

    /** 前端图标 key（对应 Ant Design Icons 组件名） */
    private String icon;

    /** 门户排序 */
    @TableField("sort_order")
    private Integer sort;

    /** 1=启用 0=停用 */
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
