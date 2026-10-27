package com.mftb.admin.config;

import com.mftb.admin.annotation.RequirePermission;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 权限注解校验器: 启动时扫描所有 @RequirePermission 注解,
 * 校验 menuKey 在 sys_menu 中存在, 不存在则告警 (防止注解配置错误漏网)
 * <p>
 * 排在 DataInitializer(@Order(5)) 之后执行, 确保系统菜单已种子化
 */
@Slf4j
@Component
@Order(30)
@RequiredArgsConstructor
public class PermissionAnnotationValidator implements CommandLineRunner {

    private final ApplicationContext applicationContext;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        try {
            Set<String> validKeys = new HashSet<>(jdbcTemplate.queryForList(
                    "SELECT menu_key FROM sys_menu WHERE deleted = 0 AND menu_key IS NOT NULL",
                    String.class));

            Set<String> annotatedKeys = new HashSet<>();
            for (Object bean : applicationContext.getBeansWithAnnotation(RestController.class).values()) {
                Class<?> targetClass = AopUtils.getTargetClass(bean);
                for (Method method : targetClass.getDeclaredMethods()) {
                    RequirePermission annotation = method.getAnnotation(RequirePermission.class);
                    if (annotation == null) {
                        continue;
                    }
                    annotatedKeys.add(annotation.menu());
                    // 备选菜单也要查：菜单退役（软删）后若注解里仍引用它，主菜单与 anyOf 都拿不到授权，
                    // 不扫这里就只能等用户报「按钮全部 403」才发现。
                    annotatedKeys.addAll(java.util.Arrays.asList(annotation.anyOf()));
                    for (String entry : annotation.anyPermissions()) {
                        if (entry == null) {
                            continue;
                        }
                        int split = entry.indexOf(':');
                        if (split <= 0 || split == entry.length() - 1) {
                            log.warn("权限注解校验: anyPermissions 条目『{}』不是 menuKey:action 格式，"
                                    + "接口将永远按不命中拒绝，请修正写法", entry);
                            continue;
                        }
                        annotatedKeys.add(entry.substring(0, split));
                    }
                }
            }

            List<String> missing = annotatedKeys.stream()
                    .filter(key -> !validKeys.contains(key))
                    .sorted()
                    .toList();
            if (missing.isEmpty()) {
                log.info("权限注解校验通过: {} 个 menuKey 均存在于 sys_menu", annotatedKeys.size());
            } else {
                log.warn("权限注解校验: 以下 menuKey 在 sys_menu 中不存在或已退役, 相关接口将对非超管全部拒绝: {}", missing);
            }
        } catch (Exception e) {
            log.error("权限注解校验失败: {}", e.getMessage(), e);
        }
    }
}
