package com.mftb.admin.service;

/**
 * 权限版本号服务（Round 3 · 跨实例即时失效）。
 * <p>
 * 单行表 {@code sys_permission_revision} 存全局 {@code revision}；任何影响员工有效权限的写入
 * （角色/部门菜单授权、角色/部门系统准入、员工 functionRoles 变更、菜单结构/归属变更）
 * 都在同一事务内 {@link #bump()}；读侧 {@code PermissionServiceImpl.hasPermission/hasSystemAccess}
 * 比对缓存内 revision 与库内 revision 一致才复用，否则重新加载。
 * <p>
 * 这样避免"仅清空单实例内存缓存"导致的其他副本继续放行过期权限的问题，
 * 也是 {@code AGENTS.md §3 迁移规范}中"权限缓存不可跨实例失效"历史踩坑的正面回应。
 */
public interface PermissionRevisionService {

    /** 读全局权限版本号；表首次不存在时由 initializer 已建好，本方法不做 fallback。 */
    long currentRevision();

    /**
     * 递增全局权限版本号（{@code UPDATE ... SET revision = revision + 1 WHERE id = 1}）。
     * <p>由 {@code PermissionService.evictAll()} 与写侧授权服务在同一事务内调用；
     * 递增失败必须抛出，让事务回滚，禁止吞异常。
     */
    void bump();
}
