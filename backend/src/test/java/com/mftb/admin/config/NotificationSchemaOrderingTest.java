package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import com.mftb.admin.config.migration.MigrationCatalog;
import com.mftb.admin.config.migration.MigrationEntry;
import com.mftb.admin.config.migration.MigrationStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.Order;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 启动顺序与登记一致性门禁——钉住 2026-10-14 生产发布事故的不变量。
 *
 * <p>事故链：{@code 230_meeting_core_tables.sql} 要往 {@code sys_notification_scenario} 写会议通知场景，
 * 而这张表只由一个从未接入迁移框架的手工脚本创建（开发库跑过、生产 RDS 没有）→ 建表脚本抛
 * {@code Table doesn't exist} → {@code applyOnce} 向上抛出 → 会议域 {@code CommandLineRunner} 失败 →
 * Spring 上下文启动失败 → Pod 崩溃循环、K8s 摘掉 Service endpoint、入口网关 503。
 *
 * <p>只补建表脚本不足以防止复发：真正致命的是「跨域表依赖只写在 SQL 里、靠执行顺序碰运气」。
 * 因此这里把三件事同时钉住：执行顺序、catalog 依赖声明、契约登记顺序。任何一项被改坏，
 * CI 的 {@code mvn test} 就会红，而不是等到生产启动才炸。
 */
class NotificationSchemaOrderingTest {

    private static int orderOf(Class<?> clazz) {
        Order annotation = clazz.getAnnotation(Order.class);
        assertNotNull(annotation, clazz.getSimpleName() + " 必须显式标注 @Order，启动顺序不能靠 Bean 名字典序");
        return annotation.value();
    }

    @Test
    @DisplayName("通知底座必须早于所有引用场景表的业务域执行")
    void notificationSchemaRunsBeforeConsumers() {
        int notify = orderOf(NotificationSchemaMigrationInitializer.class);
        assertTrue(notify < orderOf(MeetingSchemaMigrationInitializer.class),
                "通知底座建表必须早于会议域：230 脚本第 7 段要写 sys_notification_scenario，"
                        + "晚一步就是生产启动崩溃循环");
    }

    @Test
    @DisplayName("通知底座必须晚于 sys_config 底座（脚本要读写守卫键）")
    void notificationSchemaRunsAfterSysConfigBase() {
        int notify = orderOf(NotificationSchemaMigrationInitializer.class);
        assertTrue(notify > orderOf(DataInitializer.class),
                "165 脚本要读 sys_config 的旧钉钉配置并写 notification_apps_migrated 守卫键，"
                        + "早于 DataInitializer 执行会直接 Table doesn't exist");
    }

    @Test
    @DisplayName("notify:schema:v1.0 已登记，且会议建表显式依赖它")
    void catalogDeclaresTheDependency() throws Exception {
        List<MigrationEntry> entries = MigrationCatalog.readAll();

        MigrationEntry notify = entries.stream()
                .filter(e -> NotificationSchemaMigrationInitializer.VERSION_SCHEMA.equals(e.getVersionKey()))
                .findFirst().orElseThrow(() -> new AssertionError(
                        "notify:schema:v1.0 未登记进 catalog.json：没有版本键的迁移等于没有迁移"));
        assertEquals(MigrationStatus.ACTIVE, notify.getStatus());
        assertEquals("notificationSchemaMigrationInitializer", notify.getExecutor(),
                "catalog 的 executor 必须等于类的 Spring 默认 Bean 名，否则类改名后登记表指向空执行器");

        MigrationEntry meeting = entries.stream()
                .filter(e -> "meeting:schema:v1.0".equals(e.getVersionKey()))
                .findFirst().orElseThrow();
        assertTrue(meeting.getDependencies().contains(NotificationSchemaMigrationInitializer.VERSION_SCHEMA),
                "meeting:schema:v1.0 必须显式声明依赖通知底座，让依赖图能看出这条跨域边");
    }

    @Test
    @DisplayName("两张表都登记了结构契约，且应用表排在场景表之前")
    void contractsAreRegisteredInForeignKeyOrder() {
        List<String> tables = new java.util.ArrayList<>();
        for (ContractSpec spec : com.mftb.admin.config.migration.ContractRegistry.notificationContracts()) {
            tables.add(spec.table());
        }
        assertTrue(tables.indexOf("sys_notification_app") >= 0, "未登记 sys_notification_app 契约");
        assertTrue(tables.indexOf("sys_notification_scenario") >= 0, "未登记 sys_notification_scenario 契约");
        // 场景表有指向应用表的外键：顺序颠倒时自愈会因父表不存在而失败，把可修的漂移变成 not-ready
        assertTrue(tables.indexOf("sys_notification_app") < tables.indexOf("sys_notification_scenario"),
                "外键父表必须先自愈");
    }
}
