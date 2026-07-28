package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 集团组织架构-部门实体
 */
@Data
@TableName("sys_department")
public class SysDepartment {

    @TableId
    private Long id;

    /** 部门编码 */
    private String code;

    /** 部门名称 */
    private String name;

    /** 上级部门ID (顶级为 null) */
    private Long parentId;

    /** 部门对接人 */
    private String leader;

    /** 部门授权的菜单权限 JSON数组: [{"menuKey":"xxx","actions":["view"]}] */
    private String permissions;

    /** 状态: 1=有效 0=无效 */
    private Integer status;

    /** 排序 */
    private Integer sort;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
