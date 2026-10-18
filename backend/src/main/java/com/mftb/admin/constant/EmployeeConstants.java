package com.mftb.admin.constant;

import java.util.List;
import java.util.Set;

/**
 * 员工（集团人事）接口的菜单与动作常量 —— 权限拆分的唯一真值。
 * <p>
 * 为什么用「同一菜单 + 细分动作」而不是再开三个新菜单：
 * <ul>
 *   <li>授权中心的可勾动作集来自 {@code sys_menu.actions}（考勤域实测：动作没登记就等于
 *       普通角色永久 403，而超管走代码直通看不出问题），动作粒度天然支持「独立授权」；</li>
 *   <li>敏感明文查看、账号操作并不是可路由页面，建成菜单会多出侧边栏幽灵入口，
 *       还得为它们编路径与图标；</li>
 *   <li>方案 §7.3 要求的是「普通花名册、证件、薪酬、账号管理、角色授予、导出各自授权」，
 *       锚点是 (角色, 菜单, 动作) 三元组，不是「一个能力必须一个菜单」。</li>
 * </ul>
 * 新增动作必须同时进 {@link #GRANTABLE_ACTIONS}（落库到 sys_menu.actions）与前端
 * {@code src/pages/Permission/types.ts} 的动作表，两处逐字对齐；
 * {@code EmployeePermissionSplitTest} 会反射断言每个 handler 的动作都在登记集内。
 */
public final class EmployeeConstants {

    private EmployeeConstants() {
    }

    // ==================== 菜单 ====================

    /** 员工管理（花名册）菜单 key */
    public static final String MENU_EMPLOYEE = "employee-management";

    // ==================== 动作 ====================

    /** 花名册查看（脱敏资料） */
    public static final String ACTION_VIEW = "view";
    /** 建档 */
    public static final String ACTION_CREATE = "create";
    /** 人事资料编辑（不含薪酬、不含账号、不含授权） */
    public static final String ACTION_EDIT = "edit";
    /** 删除档案 */
    public static final String ACTION_DELETE = "delete";
    /** 薪酬档案查看（薪资项目、银行账号等金融资料） */
    public static final String ACTION_SALARY_VIEW = "salaryView";
    /** 薪酬档案编辑 */
    public static final String ACTION_SALARY_EDIT = "salaryEdit";
    /** 敏感资料明文查看（证件号、详细地址；默认脱敏） */
    public static final String ACTION_SENSITIVE_VIEW = "sensitiveView";
    /** 账号操作（冻结/解冻、重置密码） */
    public static final String ACTION_ACCOUNT_EDIT = "accountEdit";
    /** 角色与菜单授权（改员工的功能角色） */
    public static final String ACTION_AUTHORIZE = "authorize";
    /** 全量导出（按筛选条件导出，独立授权并留痕） */
    public static final String ACTION_EXPORT = "export";
    /**
     * 人事操作审计查看（谁在什么时候改了谁的什么）。
     * <p>单独成动作而不是挂在 view 上：审计内容包含敏感字段的脱敏前后值与操作人，
     * 「能看花名册」不等于「能看谁动过花名册」（方案 §7.3「未显式授权默认拒绝」）。
     */
    public static final String ACTION_AUDIT_VIEW = "auditView";

    /**
     * 可授权动作全集：写入 {@code sys_menu.actions} 的唯一依据。
     * <p>顺序即授权中心的展示顺序（查看类在前，写操作次之，敏感与账号类最后）。
     */
    public static final List<String> GRANTABLE_ACTIONS = List.of(
            ACTION_VIEW, ACTION_CREATE, ACTION_EDIT, ACTION_DELETE, ACTION_EXPORT,
            ACTION_SALARY_VIEW, ACTION_SALARY_EDIT,
            ACTION_SENSITIVE_VIEW, ACTION_ACCOUNT_EDIT, ACTION_AUTHORIZE, ACTION_AUDIT_VIEW);

    /** 集合形态，供反射断言用 */
    public static final Set<String> GRANTABLE_ACTION_SET = Set.copyOf(GRANTABLE_ACTIONS);

    /** sys_menu.actions 的 JSON 字面量（由初始化器一次性纠正） */
    public static final String GRANTABLE_ACTIONS_JSON =
            "[\"" + String.join("\",\"", GRANTABLE_ACTIONS) + "\"]";
}
