package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.OrgDataScope;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysRoleDept;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysRoleDeptMapper;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 组织数据权限（人员可见范围）解析实现。
 * <p>
 * 三条不可让步的口径：
 * <ol>
 *   <li><b>超管直通与后台调用不收敛</b>：{@code sys_user.role=admin} 或绑定了 {@code code=admin} 的角色
 *       → 不限制；无 SecurityContext（定时任务/启动期/内部回调）同样不限制。
 *       超管判定与 {@code DataScopeServiceImpl}/{@code PermissionServiceImpl} 保持同源，
 *       否则同一个人在「能看到菜单」和「能看到数据」两件事上会得到不同答案。</li>
 *   <li><b>多角色取最大</b>：任一角色是「全部」即不限制；否则各角色的部门集合取并集。
 *       取交集会让叠加授权的人反而看不到数据，与功能权限的并集语义相矛盾。</li>
 *   <li><b>本人数据永远可见</b>：解析结果恒定包含自己的 user id。人员范围管的是「别人的数据」，
 *       不是把自己也锁在外面；但「仅本人」档在部门维（日×组聚合）恒为空集，
 *       群体聚合行数拆不到个人，宁可不给也不能把整部门汇总当个人可见。</li>
 * </ol>
 * 解析结果按用户缓存 5 分钟，角色数据范围/自定部门变更时由调用方 {@link #evictAll()} 主动失效。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrgScopeServiceImpl implements OrgScopeService {

    /** 内置超管角色编码（与 sys_role 种子、DataScopeServiceImpl 对齐） */
    private static final String SUPER_ADMIN_ROLE_CODE = "admin";

    /** 缓存 TTL: 5 分钟 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private final OperatorResolver operatorResolver;
    private final SysUserMapper sysUserMapper;
    private final SysRoleMapper sysRoleMapper;
    private final SysRoleDeptMapper sysRoleDeptMapper;
    private final SysDepartmentMapper sysDepartmentMapper;

    /** userId -> 范围缓存 */
    private final ConcurrentHashMap<Long, ScopeCache> cacheMap = new ConcurrentHashMap<>();

    /**
     * 一次解析的完整结论。
     *
     * @param unlimited 是否不限制（超管或任一角色为「全部」）
     * @param userIds   可见用户 id（unlimited 时为 null）
     * @param deptIds   可见部门 id（unlimited 时为 null）
     * @param scope     生效档位（用于顶部提示；unlimited 恒为 {@link OrgDataScope#ALL}）
     */
    private record Scope(boolean unlimited, Set<Long> userIds, Set<Long> deptIds, int scope) {
    }

    private record ScopeCache(Scope scope, long expireAt) {
    }

    @Override
    public Set<Long> resolveVisibleUserIds() {
        Scope scope = currentScope();
        return scope.unlimited() ? null : scope.userIds();
    }

    @Override
    public Set<Long> resolveVisibleDeptIds() {
        Scope scope = currentScope();
        return scope.unlimited() ? null : scope.deptIds();
    }

    @Override
    public void requireVisibleUser(Long userId) {
        if (userId == null) {
            throw new BusinessException("目標人員ID缺失");
        }
        Set<Long> visible = resolveVisibleUserIds();
        if (visible == null) {
            return;
        }
        if (!visible.contains(userId)) {
            // 越权读取统一文案，不区分「不存在」与「无权限」，避免用错误信息探测人员存在性
            throw new BusinessException("無權查看該人員的資料");
        }
    }

    @Override
    public Map<String, Object> describe() {
        Scope scope = currentScope();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scope", scope.scope());
        result.put("scopeLabel", OrgDataScope.LABELS.getOrDefault(scope.scope(), OrgDataScope.LABELS.get(OrgDataScope.SELF)));
        result.put("unlimited", scope.unlimited());
        result.put("deptCount", scope.unlimited() ? null : (long) scope.deptIds().size());
        result.put("userCount", scope.unlimited() ? null : (long) scope.userIds().size());
        return result;
    }

    @Override
    public void evictAll() {
        cacheMap.clear();
        log.info("组织数据范围缓存已清空");
    }

    /* ==================== 解析 ==================== */

    private Scope currentScope() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            // 无登录上下文 = 定时任务/启动期/服务内部回调（HTTP 请求走不到这里：Jwt 过滤器 +
            // @RequirePermission 已先把住，AttendanceControllerMappingTest 钉住了每个 handler 的注解）。
            // 这里必须返回「不限制」而不是空集：AttendancePunchSyncJob 等后台作业没有 SecurityContext，
            // 按空集处理会让夜间同步一条都不写，把「越权收敛」做成「可用性事故」。
            return new Scope(true, null, null, OrgDataScope.ALL);
        }
        if (isSuperAdmin(user)) {
            return new Scope(true, null, null, OrgDataScope.ALL);
        }
        ScopeCache cache = cacheMap.compute(user.getId(), (id, existing) ->
                existing != null && existing.expireAt() > System.currentTimeMillis()
                        ? existing
                        : new ScopeCache(load(user), System.currentTimeMillis() + CACHE_TTL_MS));
        return cache.scope();
    }

    /** 超管判定：主角色 admin 或绑定了 code=admin 的启用角色（与功能权限判定同源） */
    private boolean isSuperAdmin(SysUser user) {
        if (SUPER_ADMIN_ROLE_CODE.equalsIgnoreCase(user.getRole())) {
            return true;
        }
        return resolveRoles(user).stream()
                .anyMatch(r -> SUPER_ADMIN_ROLE_CODE.equalsIgnoreCase(r.getCode()));
    }

    private Scope load(SysUser user) {
        List<SysRole> roles = resolveRoles(user);
        Set<Long> deptIds = new HashSet<>();
        boolean hasAll = false;
        // 提示用档位：只统计「真的贡献了部门」的最宽一档，SELF 与空授权不得伪装成部门范围
        int widest = OrgDataScope.SELF;
        for (SysRole role : roles) {
            int scope = OrgDataScope.orDefault(role.getDataScope());
            switch (scope) {
                case OrgDataScope.ALL -> hasAll = true;
                case OrgDataScope.DEPT -> {
                    if (user.getDepartmentId() != null) {
                        deptIds.add(user.getDepartmentId());
                        widest = Math.max(widest, scope);
                    }
                }
                case OrgDataScope.DEPT_AND_CHILD -> {
                    if (user.getDepartmentId() != null) {
                        deptIds.addAll(closure(Set.of(user.getDepartmentId())));
                        widest = Math.max(widest, scope);
                    }
                }
                case OrgDataScope.CUSTOM_DEPT -> {
                    Set<Long> custom = customDeptIds(role.getId());
                    if (!custom.isEmpty()) {
                        deptIds.addAll(closure(custom));
                        widest = Math.max(widest, scope);
                    }
                }
                default -> {
                    // SELF：不贡献部门集合，本人 id 在下方恒定加入
                }
            }
        }
        if (hasAll) {
            return new Scope(true, null, null, OrgDataScope.ALL);
        }
        // 本人数据恒定可见（人员范围管的是别人的数据，不是把自己锁在外面）
        Set<Long> userIds = new LinkedHashSet<>();
        userIds.add(user.getId());
        if (!deptIds.isEmpty()) {
            userIds.addAll(usersInDepts(deptIds));
        }
        return new Scope(false, Set.copyOf(userIds), Set.copyOf(deptIds), widest);
    }

    /**
     * 用户的有效角色行：{@code sys_user.function_roles}（JSON id）+ {@code sys_user.role}（主角色 code）。
     * <p>
     * 两路都要读：仓内 {@code sys_user_role} 表已在 98 号脚本删除，角色实际由这两列共同承载，
     * 只读其中一路会让「只设了主角色」或「只绑了功能角色」的人拿到小于实际授权的范围。
     * 合并成一次查询而不是两次：同一个人在两路里可能命中同一角色，分开读会重复计入并多一次往返。
     */
    private List<SysRole> resolveRoles(SysUser user) {
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        boolean hasMainRole = StringUtils.hasText(user.getRole());
        if (roleIds.isEmpty() && !hasMainRole) {
            return List.of();
        }
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<SysRole>().eq(SysRole::getStatus, 1);
        wrapper.and(w -> {
            boolean opened = false;
            if (!roleIds.isEmpty()) {
                w.in(SysRole::getId, roleIds);
                opened = true;
            }
            if (hasMainRole) {
                if (opened) {
                    w.or();
                }
                w.eq(SysRole::getCode, user.getRole());
            }
        });
        Map<Long, SysRole> byId = new LinkedHashMap<>();
        for (SysRole role : sysRoleMapper.selectList(wrapper)) {
            byId.putIfAbsent(role.getId(), role);
        }
        return new ArrayList<>(byId.values());
    }

    private Set<Long> customDeptIds(Long roleId) {
        return sysRoleDeptMapper.selectList(new LambdaQueryWrapper<SysRoleDept>()
                        .eq(SysRoleDept::getRoleId, roleId))
                .stream().map(SysRoleDept::getDeptId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(HashSet::new));
    }

    /** 一批根部门及其全部子孙（含自定部门勾选节点的下级） */
    private Set<Long> closure(Set<Long> roots) {
        List<SysDepartment> depts = sysDepartmentMapper.selectList(new LambdaQueryWrapper<>());
        Map<Long, List<Long>> childMap = new HashMap<>();
        for (SysDepartment d : depts) {
            if (d.getParentId() != null) {
                childMap.computeIfAbsent(d.getParentId(), k -> new ArrayList<>()).add(d.getId());
            }
        }
        Set<Long> ids = new HashSet<>();
        Deque<Long> stack = new ArrayDeque<>();
        roots.forEach(stack::push);
        while (!stack.isEmpty()) {
            Long cur = stack.pop();
            if (!ids.add(cur)) {
                continue;
            }
            for (Long child : childMap.getOrDefault(cur, List.of())) {
                stack.push(child);
            }
        }
        return ids;
    }

    private Set<Long> usersInDepts(Set<Long> deptIds) {
        return sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getDepartmentId, deptIds))
                .stream().map(SysUser::getId)
                .collect(Collectors.toCollection(HashSet::new));
    }
}
