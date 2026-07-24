package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 数据初始化器: 首次启动时将 SQL 中的占位密码重置为正确的 BCrypt 加密值
 * <p>
 * admin 密码: 111222
 * guest 密码: 123456
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        resetPasswordIfNeeded("admin", "111222");
        resetPasswordIfNeeded("guest", "123456");
    }

    /** 若密码非合法 BCrypt 值(如 SQL 占位符), 则重置为默认密码的加密值 */
    private void resetPasswordIfNeeded(String username, String rawPassword) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            return;
        }
        String pwd = user.getPassword();
        boolean validBcrypt = pwd != null && pwd.startsWith("$2") && pwd.length() >= 60;
        if (!validBcrypt) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            sysUserMapper.updateById(user);
            log.info("已初始化用户 [{}] 的默认密码", username);
        }
    }
}
