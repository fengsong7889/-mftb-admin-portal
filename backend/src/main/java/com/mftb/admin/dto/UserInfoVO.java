package com.mftb.admin.dto;

import com.mftb.admin.entity.SysUser;
import lombok.Data;

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
    private String department;
    private String position;

    public static UserInfoVO from(SysUser user) {
        UserInfoVO vo = new UserInfoVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setEmpId(user.getEmpId());
        vo.setAvatar(user.getAvatar());
        vo.setRole(user.getRole());
        vo.setDepartment(user.getDepartment());
        vo.setPosition(user.getPosition());
        return vo;
    }
}
