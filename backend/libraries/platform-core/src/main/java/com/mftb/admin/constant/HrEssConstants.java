package com.mftb.admin.constant;

/**
 * 員工自助（ESS）域常量：菜单 key 与授权动作真值。
 * <p>
 * ESS 是「员工本人视角」的只读+自提单入口，与 {@link HrLeaveConstants}／HR 入转调离
 * 的管理员视角分开授权：员工角色只授 ess-* 菜单，不需要任何 hr-* 人事菜单。
 * 数据范围由服务端强制为登录人本人，不依赖前端隐藏。
 */
public final class HrEssConstants {

    private HrEssConstants() {
    }

    /** 一级菜单域：員工自助 */
    public static final String MENU_DOMAIN = "ess-center";

    /** 我的假期（额度 + 我的请假单 + 发起请假） */
    public static final String MENU_LEAVE = "ess-leave";

    /** 我的申請單據（入转调离与请假的本人视图） */
    public static final String MENU_REQUESTS = "ess-requests";

    /** 我的檔案（个人信息只读） */
    public static final String MENU_PROFILE = "ess-profile";
}
