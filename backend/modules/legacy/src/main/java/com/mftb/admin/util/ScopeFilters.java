package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;

import java.util.Collection;

/**
 * 数据范围条件折叠工具：把 {@code OrgScopeService} 解析出的可见集合安全地并进查询条件。
 * <p>
 * 存在一处而不是每个服务各写一遍的原因：三态语义很容易写错 —— {@code null} 是「不限制」，
 * 空集是「一条都不能给」。把空集当不限制会让「仅本人且无部门」的角色读到全量；反过来把
 * null 当空集会让后台任务一条数据都查不到。两种错法都静默，所以收敛成一个函数。
 */
public final class ScopeFilters {

    /** 恒假哨兵值：人员/部门 id 均为正数自增，-1 不可能命中任何真实行 */
    private static final long IMPOSSIBLE_ID = -1L;

    private ScopeFilters() {
    }

    /**
     * 按可见用户集合收敛查询。
     *
     * @param wrapper  目标查询条件
     * @param column   实体上的 user_id 列
     * @param visible  可见用户 id；{@code null} 表示不限制，空集表示一条都不给
     * @param <T>      实体类型
     */
    public static <T> void applyUsers(LambdaQueryWrapper<T> wrapper, SFunction<T, ?> column,
                                      Collection<Long> visible) {
        apply(wrapper, column, visible);
    }

    /** 按可见部门集合收敛查询（供日×组这类行上没有 user_id 的聚合表使用） */
    public static <T> void applyDepts(LambdaQueryWrapper<T> wrapper, SFunction<T, ?> column,
                                      Collection<Long> visible) {
        apply(wrapper, column, visible);
    }

    private static <T> void apply(LambdaQueryWrapper<T> wrapper, SFunction<T, ?> column,
                                  Collection<Long> visible) {
        if (visible == null) {
            return;
        }
        if (visible.isEmpty()) {
            // 恒假条件而不是「不加条件」：空集代表无授权，绝不能退化成全量
            wrapper.eq(column, IMPOSSIBLE_ID);
            return;
        }
        wrapper.in(column, visible);
    }

    /** 单个目标是否落在可见集合内（{@code null} 集合代表不限制，直接放行） */
    public static boolean allows(Collection<Long> visible, Long id) {
        return visible == null || (id != null && visible.contains(id));
    }
}
