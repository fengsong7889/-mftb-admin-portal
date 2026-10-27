package com.mftb.admin.constant;

import java.util.Map;
import java.util.Set;

/**
 * 组织数据权限（数据范围）档位常量。
 * <p>
 * sys_role.data_scope 的唯一真值来源，落库为 TINYINT，严禁在业务代码里散落魔法数字。
 * 参考 SQL: backend/sql/245_org_data_scope.sql；设计口径见
 * docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9。
 * <p>
 * 两条不可让步的取向：
 * ① 默认 {@link #SELF}（严格模式）——新角色未显式配置范围时只能看自己的数据，
 *    与 DataScopeService「无授权返回空集合」一致，不得改成「默认全部」；
 * ② 范围只挂在角色上，不得焊死在任何菜单的 view 动作上（那会把授权变成猜意图）。
 */
public final class OrgDataScope {

    private OrgDataScope() {
    }

    /** 仅本人 */
    public static final int SELF = 1;
    /** 本部门（不含下级） */
    public static final int DEPT = 2;
    /** 本部门及以下 */
    public static final int DEPT_AND_CHILD = 3;
    /**
     * 自定部门（部门集合来源 sys_role_dept）。
     * <p>口径：勾选的部门<b>连同其全部下级</b>一并纳入 —— HR 勾「营运中心」的直觉是
     * 「这个中心下面的人都归我管」，只展开勾选节点本身会让人误以为数据丢了。
     */
    public static final int CUSTOM_DEPT = 4;
    /** 全部 */
    public static final int ALL = 5;

    /** 全部合法档位 */
    public static final Set<Integer> ALL_SCOPES = Set.of(SELF, DEPT, DEPT_AND_CHILD, CUSTOM_DEPT, ALL);

    /** 档位 → 中文展示名（仅用于日志/提示，前端 i18n 另有真值） */
    public static final Map<Integer, String> LABELS = Map.of(
            SELF, "僅本人",
            DEPT, "本部門",
            DEPT_AND_CHILD, "本部門及以下",
            CUSTOM_DEPT, "自定部門",
            ALL, "全部");

    /** 是否合法档位；null 视为非法（调用方必须回落到 {@link #SELF}） */
    public static boolean isValid(Integer scope) {
        return scope != null && ALL_SCOPES.contains(scope);
    }

    /** 安全取值：null 或越界一律回落到最严的「仅本人」，不得因脏数据放大可见范围 */
    public static int orDefault(Integer scope) {
        return isValid(scope) ? scope : SELF;
    }
}
