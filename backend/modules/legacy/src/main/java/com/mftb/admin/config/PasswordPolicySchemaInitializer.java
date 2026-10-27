package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 账号安全（首次登录强制改密）结构迁移：sys_user 补 must_change_password 列。
 * <p>
 * 必须早于 {@link EmployeeDetailDataInitializer}（@Order(4)）与 {@link DataInitializer}（@Order(5)）：
 * 两者启动期都会 {@code sysUserMapper.selectOne(...)} 拉取完整实体，SysUser 已含本字段，
 * 列未就绪会报 Unknown column 并引发启动失败/重启循环。
 * <p>
 * 语义：1 = 密码由他人设定（新建员工初始密码 / 管理员重置），必须先改密才能使用系统；
 * 0 = 用户自己设定的密码。存量账号迁移时保持 0，不做一次性大面积打断。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(3)
public class PasswordPolicySchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "core:user-password-policy-v1";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        // 任务或校验失败时 applyOnce 不记版本并抛出让启动失败（fail-closed）：
        // 缺列会导致所有 sys_user 查询报错，静默继续只会把问题推到运行期。
        versionTracker.applyOnce(VERSION_KEY, this::addColumn, this::verifyColumn);
    }

    private void addColumn() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'must_change_password'",
                Integer.class);
        if (exists != null && exists > 0) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 "
                + "COMMENT '是否必须修改密码后才能使用系统：1=初始密码/被管理员重置，0=本人设定' AFTER status");
        log.info("已自動遷移欄位 sys_user.must_change_password");
    }

    /** 后置校验：列确实存在且 NOT NULL 生效，否则抛出不记版本 */
    private void verifyColumn() {
        Integer nullable = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' "
                        + "AND COLUMN_NAME = 'must_change_password' AND IS_NULLABLE = 'NO'",
                Integer.class);
        if (nullable == null || nullable == 0) {
            throw new IllegalStateException("sys_user.must_change_password 未就緒（列缺失或可空）");
        }
    }
}
