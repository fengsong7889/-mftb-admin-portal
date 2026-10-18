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
    /** 角色编码（用于审批人解析匹配 sys_user.function_roles） */
    private String code;
    private String description;
    /**
     * 是否开放员工自助申请：1=开放（会出现在门户系統權限申請的参考角色目录），0=不开放。
     * <p>内置 admin 角色恒为 0（服务端强制），不得经自助入口暴露。
     */
    private Integer selfServiceRequestable;
    private Integer status;
    private List<MenuPermissionDTO> permissions;
    /**
     * 数据范围（人员可见范围）: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部。
     * 存量行为 NULL 时按最严的「仅本人」返回，不向上暴露未配置的模糊状态。
     */
    private Integer dataScope;
    /** 自定部门 id 列表（仅 dataScope=4 有值） */
    private List<Long> deptIds;
    /** 绑定的账号数 */
    private Long userCount;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;
}
