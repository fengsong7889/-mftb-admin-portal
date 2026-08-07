package com.mftb.admin.dto;

import com.mftb.admin.entity.SysUser;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.util.List;

/**
 * 用户信息视图对象 (对前端返回, 不含密码)
 */
@Data
public class UserInfoVO {

    private Long id;
    private String username;
    private String name;
    private String empId;
    private String avatar;
    private String role;
    private Long departmentId;
    private String department;
    /** 部门英文名称 */
    private String departmentEn;
    private String position;
    /** 职位英文名称 */
    private String positionEn;
    /** 职级 (如 M10/T5) */
    private String jobLevel;
    /** 绑定的功能角色ID */
    private List<Long> functionRoleIds;
    /** 合并后的菜单权限 (登录时下发, 前端据此做权限判断) */
    private List<MenuPermissionDTO> permissions;

    public static UserInfoVO from(SysUser user) {
        UserInfoVO vo = new UserInfoVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setEmpId(user.getEmpId());
        vo.setAvatar(user.getAvatar());
        vo.setRole(user.getRole());
        vo.setDepartmentId(user.getDepartmentId());
        vo.setDepartment(user.getDepartment());
        vo.setDepartmentEn(user.getDepartmentEn());
        vo.setPosition(user.getPosition());
        vo.setPositionEn(user.getPositionEn());
        vo.setJobLevel(user.getJobLevel());
        vo.setFunctionRoleIds(JsonUtils.parseLongList(user.getFunctionRoles()));
        return vo;
    }
}
