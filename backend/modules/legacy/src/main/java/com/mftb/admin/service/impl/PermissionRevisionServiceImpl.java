package com.mftb.admin.service.impl;

import com.mftb.admin.service.PermissionRevisionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 权限版本号服务实现。
 * <p>单行 SELECT + UPDATE，走 PK；跨实例通过数据库可见性同步。
 * <p>{@link #bump()} 使用 {@link Propagation#REQUIRED}：与调用方共享事务，
 * 授权写失败会回滚版本号；授权写成功则版本号必然递增，读侧缓存自然失效。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionRevisionServiceImpl implements PermissionRevisionService {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public long currentRevision() {
        Long revision = jdbcTemplate.queryForObject(
                "SELECT revision FROM sys_permission_revision WHERE id = 1",
                Long.class);
        return revision == null ? 0L : revision;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public void bump() {
        int affected = jdbcTemplate.update(
                "UPDATE sys_permission_revision SET revision = revision + 1 WHERE id = 1");
        if (affected == 0) {
            throw new IllegalStateException(
                    "权限版本号递增失败：sys_permission_revision 单行缺失，请检查初始化迁移是否完整");
        }
        log.debug("权限版本号已递增 affected={}", affected);
    }
}
