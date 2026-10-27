package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;

import java.util.Map;

/**
 * 列表服务端排序白名单工具。
 * <p>为什么要白名单而不是直接把前端传来的字段名拼进 ORDER BY：列名无法用占位符参数化，
 * 拼接即等于开放 SQL 注入面（AGENTS.md 明令禁止拼接动态列名）。这里只接受预登记的
 * {@code 列key → 实体 getter} 映射，命中才按方法引用排序，未登记一律忽略并回落调用方的默认顺序。
 * <p>用法：{@code if (!SortSupport.apply(w, field, order, ALLOW)) { w.orderByAsc(默认列); }}
 * 或在应用用户排序后再补一个稳定的次级默认序（见各考勤 list 服务）。
 */
public final class SortSupport {

    private SortSupport() {
    }

    /**
     * @param wrapper 目标查询构造器
     * @param field   前端排序列 key；空/空白或不在白名单内视为「不排序」
     * @param order   {@code asc}/{@code descend} 之外的都按降序处理；{@code desc}/{@code descend}=降序
     * @param allow   列 key → 实体 getter 的白名单（key 与前端 {@code sorter.columnKey} 约定一致）
     * @return true 表示已按白名单列追加排序；false 表示 field 空或非法，调用方应自行落默认排序
     */
    public static <T> boolean apply(LambdaQueryWrapper<T> wrapper, String field, String order,
                                    Map<String, SFunction<T, ?>> allow) {
        if (field == null || field.isBlank()) {
            return false;
        }
        SFunction<T, ?> column = allow.get(field);
        if (column == null) {
            return false;
        }
        boolean desc = "desc".equalsIgnoreCase(order) || "descend".equalsIgnoreCase(order);
        wrapper.orderBy(true, !desc, column);
        return true;
    }
}
