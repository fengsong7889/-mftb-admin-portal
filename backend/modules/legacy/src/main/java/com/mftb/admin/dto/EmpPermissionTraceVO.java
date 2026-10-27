package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 员工权限透视视图对象（授权中心 · 权限追溯）。
 * <p>展示某个员工的最终权限并集（角色 ∪ 部门），每条菜单动作 / 系统准入均标注来源，
 * 用于回答"他为什么看得到 / 看不到"。admin 直通用户 {@code superAdmin=true}，
 * 明细不再逐项展开（前端按超管提示展示）。
 */
@Data
public class EmpPermissionTraceVO {

    private Long userId;
    /** 登录账号 */
    private String username;
    /** 姓名 */
    private String name;
    /** 是否内置超管（sys_user.role=admin 或绑定 admin 角色），true 时拥有全部权限 */
    private Boolean superAdmin;
    /** 所在部门名称 */
    private String departmentName;
    /** 绑定的功能角色（含停用标记） */
    private List<TraceRole> roles;
    /** 可访问业务系统（按 sort 序，含来源） */
    private List<TraceSystem> systems;
    /** 菜单最终动作并集（按系统 + 菜单排序，含来源） */
    private List<TraceMenu> menus;

    /** 角色摘要 */
    @Data
    public static class TraceRole {
        private Long id;
        private String name;
        private String code;
        /** 1=启用 0=停用（停用角色的授权不参与并集） */
        private Integer status;
    }

    /** 系统准入条目 */
    @Data
    public static class TraceSystem {
        private String code;
        private String name;
        /** 来源列表，如 "角色:财务专员" / "部门:财务部" */
        private List<String> sources;
    }

    /** 菜单动作条目 */
    @Data
    public static class TraceMenu {
        private String menuKey;
        private String menuName;
        private String menuNameEn;
        /** 归属业务系统编码（可空 = 未归属） */
        private String systemCode;
        /** 菜单排序（展示用） */
        private Integer sort;
        /** 最终动作并集: view/create/edit/delete/... */
        private List<String> actions;
        /** 来源列表（贡献了任一动作的角色/部门） */
        private List<String> sources;
    }
}
