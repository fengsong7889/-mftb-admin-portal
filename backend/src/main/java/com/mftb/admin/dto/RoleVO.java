package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 角色视图对象
 */
@Data
public class RoleVO {

    private Long id;
    private String name;
    private String description;
    private Integer status;
    private List<MenuPermissionDTO> permissions;
    /** 绑定的账号数 */
    private Long userCount;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;
}
