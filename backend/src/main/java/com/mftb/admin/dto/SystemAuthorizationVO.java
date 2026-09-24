package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 单个「授权目标（角色 / 部门）× 单个系统」的授权快照（Round 3 · 系统授权读写）。
 * <p>{@code systemAccess} 表示该目标是否拥有该系统的准入；
 * {@code permissions} 是【本系统范围内】的菜单授权列表（不含其他系统的菜单）。
 * <p>读侧：actions 为空视为仅 view，与 {@code PermissionServiceImpl.merge} 保持一致；
 * 写侧：actions 为空 = 该菜单未授权（本次改造收紧），前端必须显式提交 view 才授予查看。
 */
@Data
public class SystemAuthorizationVO {

    /** 目标类型：role / department */
    private String targetType;

    /** 目标 ID（sys_role.id / sys_department.id） */
    private Long targetId;

    /** 系统编码（sys_system.code） */
    private String systemCode;

    /** 是否拥有该系统准入 */
    private boolean systemAccess;

    /** 该系统内的菜单授权（menuKey + actions 列表；actions 空 = 未授权） */
    private List<MenuPermissionDTO> permissions;

    /** 当前全局权限版本号；写入时若与库内不一致返回 409，让客户端刷新后重试 */
    private long revision;
}
