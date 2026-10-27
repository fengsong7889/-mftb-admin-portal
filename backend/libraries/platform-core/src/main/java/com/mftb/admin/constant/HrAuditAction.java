package com.mftb.admin.constant;

import java.util.Set;

/**
 * 人事操作审计的动作真值（{@code hr_operation_audit.action}）。
 * <p>
 * 为什么不复用授权审计表 {@code sys_permission_audit_log}：那张表按设计只记「谁改了谁的权限」，
 * 缺 §7.4 明确要求的<b>生效时间、原因、来源单号</b>三列，且 target_type 的口径是 role/department。
 * 把人事操作硬塞进去会让两张表都失去可解释性（人事审计要能回答「这个人的档案哪天被谁改到什么」）。
 * <p>
 * 敏感字段（证件号、地址、手机号等）在审计里同样必须脱敏：审计展示页的读者不一定持有
 * {@code sensitiveView}，把明文写进审计等于开了一条绕过字段权限的旁路。
 */
public final class HrAuditAction {

    private HrAuditAction() {
    }

    /** 建档 */
    public static final String EMPLOYEE_CREATE = "EMPLOYEE_CREATE";
    /** 编辑人事档案（列表/详情主表单） */
    public static final String EMPLOYEE_UPDATE = "EMPLOYEE_UPDATE";
    /** 删除档案 */
    public static final String EMPLOYEE_DELETE = "EMPLOYEE_DELETE";
    /** 基本资料/证件/通讯/账号绑定保存 */
    public static final String PROFILE_UPDATE = "PROFILE_UPDATE";
    /** 敏感明文查看（留痕：谁在什么时候看了谁的证件号） */
    public static final String SENSITIVE_VIEW = "SENSITIVE_VIEW";
    /** 账号冻结 */
    public static final String ACCOUNT_DISABLE = "ACCOUNT_DISABLE";
    /** 账号解冻 */
    public static final String ACCOUNT_ENABLE = "ACCOUNT_ENABLE";
    /** 重置密码 */
    public static final String PASSWORD_RESET = "PASSWORD_RESET";
    /** 功能角色调整（提权类动作，必须独立留痕） */
    public static final String ROLE_BIND = "ROLE_BIND";
    /** 职务异动写入（新增/编辑/删除任职记录） */
    public static final String POSITION_WRITE = "POSITION_WRITE";
    /** 雇佣期间登记 */
    public static final String PERIOD_REGISTER = "PERIOD_REGISTER";
    /** 合同写入 */
    public static final String CONTRACT_WRITE = "CONTRACT_WRITE";
    /** 薪酬档案写入（含银行/金额，属敏感） */
    public static final String SALARY_WRITE = "SALARY_WRITE";
    /** 人事单据办理完成（生效执行） */
    public static final String LIFECYCLE_EXECUTE = "LIFECYCLE_EXECUTE";
    /** 花名册全量导出 */
    public static final String ROSTER_EXPORT = "ROSTER_EXPORT";

    /** 全部合法动作，落库 CHECK 约束与本集合同源 */
    public static final Set<String> ALL_ACTIONS = Set.of(
            EMPLOYEE_CREATE, EMPLOYEE_UPDATE, EMPLOYEE_DELETE, PROFILE_UPDATE, SENSITIVE_VIEW,
            ACCOUNT_DISABLE, ACCOUNT_ENABLE, PASSWORD_RESET, ROLE_BIND, POSITION_WRITE,
            PERIOD_REGISTER, CONTRACT_WRITE, SALARY_WRITE, LIFECYCLE_EXECUTE, ROSTER_EXPORT);

    /** 动作本身即触及敏感面的动作（展示时同样要受控） */
    public static final Set<String> SENSITIVE_ACTIONS = Set.of(
            SENSITIVE_VIEW, PASSWORD_RESET, SALARY_WRITE);

    /**
     * 需要脱敏的档案字段名：审计里存这些字段的前后值时必须走同一套掩码。
     * 与 {@code EmployeeServiceImpl} 的脱敏字段保持一致。
     */
    public static final Set<String> SENSITIVE_FIELDS = Set.of(
            "idNumber", "idAddress", "addressDetail", "mobile", "email", "birthDate");

    public static boolean isSensitiveField(String field) {
        return field != null && SENSITIVE_FIELDS.contains(field);
    }

    public static boolean isSensitiveAction(String action) {
        return action != null && SENSITIVE_ACTIONS.contains(action);
    }
}
