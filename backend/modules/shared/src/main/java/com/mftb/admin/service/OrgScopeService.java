package com.mftb.admin.service;

import java.util.Map;
import java.util.Set;

/**
 * 组织数据权限（人员可见范围）服务。
 * <p>
 * 与 {@link DataScopeService} 是<b>正交</b>的两个维度，不要混用：
 * <ul>
 *   <li>{@code DataScopeService} 回答「能看哪些<b>商家集团编码</b>」（业务资源维）；</li>
 *   <li>本服务回答「能看哪些<b>人</b>」（组织树维，挂在 {@code sys_role.data_scope} 上）。</li>
 * </ul>
 * 设计口径与五档语义见 docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9。
 * <p>
 * 三态返回是刻意的：{@code null} = 不限制（超管／全部），空集 = 看不到任何行，
 * 非空 = 精确可见集合。调用方必须区分这两种「没有数据」的情形，
 * 不得把空集当不限制处理（那会把越权读变成全量读）。
 */
public interface OrgScopeService {

    /**
     * 当前登录人可见的用户 id 集合。
     *
     * @return null = 不限制；空集 = 看不到任何人的数据；非空 = 可见用户 id
     */
    Set<Long> resolveVisibleUserIds();

    /**
     * 当前登录人可见的部门 id 集合，供「按部门聚合、行上没有 user_id」的表收敛
     * （如 {@code att_day_summary} 的日×组汇总）。
     * <p>
     * 「仅本人」档返回空集：群体聚合行数无法拆到个人，宁可不给，也不能把整个部门的
     * 汇总当成个人可见数据放出去。个人维度请走带 user_id 的明细/月报。
     *
     * @return null = 不限制；空集 = 无可见部门
     */
    Set<Long> resolveVisibleDeptIds();

    /**
     * 单条资源的归属二次校验（fail-closed）。
     * <p>
     * 只过滤列表是不够的：改一下 URL 里的 id 就绕过去了。详情、补录、假单抵扣、
     * 冻结/同步等按 id 的读写都必须走本方法。
     *
     * @param userId 目标用户 id
     * @throws com.mftb.admin.common.BusinessException 目标不在可见范围内
     */
    void requireVisibleUser(Long userId);

    /**
     * 当前生效范围的描述，供列表页顶部提示「你现在看到的是哪个范围」——
     * 没有这个提示，范围收敛会被用户误读成「数据丢了」。
     *
     * @return {scope: 档位code, all: 是否不限制, deptIds: 可见部门数, userIds: 可见人数, label: 展示名}
     */
    Map<String, Object> describe();

    /** 清空范围缓存（角色的数据范围/自定部门变更后调用） */
    void evictAll();
}
