package com.mftb.admin.constant;

/**
 * 内置系统账号口径（唯一真值来源）。
 * <p>
 * 系统管理员是「系统账号」而不是员工：不占工号序列、不进员工名册、不参与考勤/绩效/薪酬/AI 额度统计，
 * 其超管权限只由 {@code sys_user.role='admin'} 承载（判定见 {@code PermissionServiceImpl.SUPER_ADMIN_ROLE}
 * 与 {@code OperatorResolver.isAdmin}）。
 * <p>
 * <b>历史背景</b>：{@code sql/01_init_system.sql} 最初种子的超管登录账号就是 {@code admin}，
 * 后被 {@code DataInitializer.migrateEmpIdToMF()}（每次启动执行、把所有非 {@code MF\d+} 登录账号按 id
 * 升序重编号）改名成 {@code MF00001}，导致超管并入员工工号序列：既无法对其做权限收敛
 * （{@code role='admin'} 是硬直通），也让系统级高危操作与某个员工的业务操作共用同一审计签名。
 * 迁移 {@code core:builtin-admin-account-v1} 恢复独立系统账号，并把存量超管降级为普通员工账号。
 */
public final class BuiltinAccounts {

    /**
     * 内置系统管理员登录账号（非工号）。
     * <p>禁止被工号重编号迁移改名、禁止停用/删除/按员工档案编辑，见 {@code EmployeeServiceImpl}。
     */
    public static final String ADMIN_USERNAME = "admin";

    /** 内置系统管理员显示名（无工号，操作签名与审批签名仅显示姓名） */
    public static final String ADMIN_DISPLAY_NAME = "系統管理員";

    private BuiltinAccounts() {
    }

    /**
     * 是否系统内置账号（不属于员工名册）。
     * <p>凡是「枚举 sys_user 当员工用」的查询都必须排除系统账号：员工管理列表、员工搜索下拉、
     * AI 权额管理、绩效人员候选、入转调离人员搜索、职务记录补录等；
     * 工号重编号迁移也必须跳过，否则重启后系统账号被改名成 {@code MFxxxxx}、超管随之丢失。
     */
    public static boolean isSystemAccount(String username) {
        return ADMIN_USERNAME.equalsIgnoreCase(username);
    }
}
