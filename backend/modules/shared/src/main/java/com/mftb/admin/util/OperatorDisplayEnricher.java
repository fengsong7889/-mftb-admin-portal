/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 操作人展示签名补全器：把存量 `updated_by` 的裸姓名快照补成「姓名(工号)」。
 *
 * <p>为什么在读侧拼接而不是改写入：`updated_by` 历史上一直只写
 * {@link OperatorResolver#currentOperatorName()}（纯姓名），库里根本没有工号，
 * 前端再怎么渲染也拼不出来。改写入只对新数据生效，存量行仍得配一次迁移；
 * 本组件让列表/详情一次到位，且不碰任何数据与写入口径。
 *
 * <p>口径与审批中心 {@link OperatorResolver#operatorSignature(SysUser)} 保持一致，
 * 但那份签名按用户 ID 解析，这里的存量值只有姓名，故按姓名反查——拼接规则本身
 * 不在这里重新发明（见 {@link #signatureForNames(Set)}）。
 */
@Component
@RequiredArgsConstructor
public class OperatorDisplayEnricher {

    /**
     * 机器/哨兵操作人：不是自然人，没有工号可拼。
     *
     * <p>必须原值返回，不能只靠「库里查不到」兼容：{@code 系統} 是种子数据给预置算法/定价
     * 写的标记（如 09_ad_promotion.sql），前端有六处按 {@code updatedBy !== '系統'} 精确过滤
     * 把预置项挡在选择器外。一旦拼成 {@code 系統(MFxxxxx)} 就等于把预置数据漏进销售下单。
     */
    private static final Set<String> SENTINEL_OPERATORS = Set.of("系統", "系统", "system", "SYSTEM", "System");

    private final SysUserMapper sysUserMapper;

    /**
     * 按姓名反查工号后就地改写展示签名。
     *
     * <p>整批一次 IN 查询，禁止逐行回查：一页最多几十条，N+1 会直接拖慢列表首屏。
     *
     * <p>只改写能唯一命中的姓名，其余原样返回：
     * <ul>
     *   <li>重名——挂错工号比不显示更糟，且会把组织归属指到另一个人头上；</li>
     *   <li>库里查不到的历史操作人（含已注销账号，{@code sys_user} 逻辑删除后默认查不到）；</li>
     *   <li>{@code system}/{@code 系統} 等机器值——不是自然人，没有工号可拼，且前端拿它
     *       当「系统预置」过滤标记，拼了会漏数据。</li>
     * </ul>
     *
     * <p>隐私边界：只取 name/emp_id 两列，不得顺手带出部门/职位/职级——调用方是
     * 任何能打开该列表的人都可访问的展示位，多给一列就会被拼进界面文案。
     *
     * @param targets 待补全的对象集合（列表页 records 或详情 VO）
     * @param getter  取现有展示名（裸姓名快照）
     * @param setter  写回展示签名，入参为 (对象, 「姓名(工号)」)
     * @param <T>     VO 类型
     */
    public <T> void enrich(Iterable<T> targets, Function<T, String> getter, BiConsumer<T, String> setter) {
        if (targets == null) {
            return;
        }
        Set<String> names = new LinkedHashSet<>();
        for (T target : targets) {
            String name = getter.apply(target);
            if (StringUtils.hasText(name) && !SENTINEL_OPERATORS.contains(name)) {
                names.add(name);
            }
        }
        if (names.isEmpty()) {
            return;
        }
        Map<String, String> signatureByName = signatureForNames(names);
        for (T target : targets) {
            String signature = signatureByName.get(getter.apply(target));
            if (signature != null) {
                setter.accept(target, signature);
            }
        }
    }

    /** 单对象便捷重载（详情接口用）。 */
    public <T> void enrichOne(T target, Function<T, String> getter, BiConsumer<T, String> setter) {
        enrich(Collections.singletonList(target), getter, setter);
    }

    /**
     * 姓名 → 「姓名(工号)」映射；重名姓名不出现在结果里（调用方据此保持原值）。
     *
     * @param names 去重后的姓名集合，空集合不查库
     */
    private Map<String, String> signatureForNames(Set<String> names) {
        if (names.isEmpty()) {
            return Map.of();
        }
        List<SysUser> users = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .select(SysUser::getName, SysUser::getEmpId)
                .in(SysUser::getName, names));
        Map<String, Long> countByName = users.stream()
                .filter(u -> StringUtils.hasText(u.getName()))
                .collect(Collectors.groupingBy(SysUser::getName, Collectors.counting()));
        Map<String, String> result = new HashMap<>();
        for (SysUser user : users) {
            String name = user.getName();
            if (!StringUtils.hasText(name) || !StringUtils.hasText(user.getEmpId())) {
                continue;
            }
            // 同名多账号：整批作废，宁可不显示工号
            if (countByName.getOrDefault(name, 0L) != 1L) {
                continue;
            }
            result.put(name, name + "(" + user.getEmpId() + ")");
        }
        return result;
    }
}
