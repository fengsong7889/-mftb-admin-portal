package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 功能角色实体
 */
@Data
@TableName("sys_role")
public class SysRole {

    @TableId
    private Long id;

    /** 角色名称 */
    private String name;

    /** 角色编码 */
    private String code;

    /** 角色描述（业务说明：开放自助申请后会在门户申请页展示给员工，应写清适用人群与能做什么） */
    private String description;

    /**
     * 是否开放员工自助申请：1=出现在门户「系統權限申請」的参考角色目录，0=不开放（默认）。
     * <p>目录口径：只有本开关为 1、且已持目标系统准入（sys_role_system）、启用中、非内置 admin 的角色
     * 才会被列出；且它只是<b>参考建议</b>——最终授予哪个角色由审批人在流程上决定，
     * 兑现前还会再校验一次角色可用性（见 SystemAccessGrantServiceImpl）。
     * <p>列由迁移 {@code oa:system-access:v1.1} 补齐，NOT NULL DEFAULT 0：存量角色一律不开放，
     * 需管理员逐个打开并补写 description，避免自助入口默认泄露全量角色清单。
     */
    private Integer selfServiceRequestable;

    /** 菜单权限 JSON数组: [{"menuKey":"xxx","actions":["view","edit"]}] */
    private String permissions;

    /**
     * 数据范围（组织人员可见范围）: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部。
     * 真值见 {@link com.mftb.admin.constant.OrgDataScope}；自定部门的具体部门集合存 sys_role_dept。
     */
    private Integer dataScope;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

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
