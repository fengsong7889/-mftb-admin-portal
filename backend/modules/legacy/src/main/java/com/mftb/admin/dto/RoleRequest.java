package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * 角色新增/编辑请求
 */
@Data
public class RoleRequest {

    @NotBlank(message = "角色名稱不能為空")
    private String name;

    /** 角色描述（业务说明；开放自助申请后会展示给员工，建议写清适用人群与能做什么） */
    private String description;

    /**
     * 是否开放员工自助申请：1=开放，0=不开放。
     * <p>传 null 表示本次不修改该开关（MyBatis-Plus updateById 跳过 null 列），
     * 旧客户端不传此字段时行为与改造前一致；内置 admin 角色由服务端强制置 0，不接受前端开启。
     */
    private Integer selfServiceRequestable;

    /** 菜单权限 (可选, 编辑权限接口单独提交) */
    private List<MenuPermissionDTO> permissions;

    /**
     * 数据范围（人员可见范围）: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部。
     * <p>缺省按最严的「仅本人」处理：不得因为前端没传就落库成全部。
     * 真值见 {@link com.mftb.admin.constant.OrgDataScope}；后端必须重验，前端下拉只是 UX。
     */
    @Min(value = 1, message = "數據範圍取值非法")
    @Max(value = 5, message = "數據範圍取值非法")
    private Integer dataScope;

    /** 自定部门 id 列表（仅 dataScope=4 时生效；其余档位一律清空，避免残留行放大范围） */
    private List<Long> deptIds;
}
