package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * 角色新增/编辑请求
 */
@Data
public class RoleRequest {

    @NotBlank(message = "角色名称不能为空")
    private String name;

    /** 角色描述 */
    private String description;

    /** 菜单权限 (可选, 编辑权限接口单独提交) */
    private List<MenuPermissionDTO> permissions;
}
