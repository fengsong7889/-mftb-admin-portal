package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 角色-自定部门数据范围关联实体。
 * <p>
 * 仅在 {@code sys_role.data_scope = 4（自定部门）} 时作为范围来源；其余档位必须无残留行，
 * 由 RoleServiceImpl 保存时整体收敛。写入语义与 {@link SysRoleMenu} 一致：先清空再批量插入，
 * 因此不设逻辑删除列，避免「删了又插回同一 (role_id, dept_id)」时唯一键与软删标记互相矛盾。
 */
@Data
@TableName("sys_role_dept")
public class SysRoleDept {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long roleId;

    private Long deptId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
