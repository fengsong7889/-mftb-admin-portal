package com.mftb.admin.config.migration;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 迁移登记表一致性门禁：catalog.json 必须可加载且无一致性问题（唯一键、依赖存在且无环、
 * SQL 资源已随包分发、被取代项引用有效）。CI 的 mvn test 会执行本用例，清单不合规即构建失败。
 */
class MigrationCatalogTest {

    @Test
    void catalogIsWellFormedAndSelfConsistent() throws Exception {
        List<MigrationEntry> entries = MigrationCatalog.readAll();
        assertFalse(entries.isEmpty(), "迁移登记表不应为空");
        List<String> problems = MigrationCatalog.validate(entries);
        assertTrue(problems.isEmpty(), "迁移登记表存在不一致: " + problems);
    }

    @Test
    void signboardV1IsSupersededByV2() throws Exception {
        List<MigrationEntry> entries = MigrationCatalog.readAll();
        MigrationEntry v1 = entries.stream()
                .filter(e -> "adpromo:signboard_pricing_tables:v1".equals(e.getVersionKey()))
                .findFirst().orElseThrow();
        assertEquals(MigrationStatus.SUPERSEDED, v1.getStatus());
        assertEquals("adpromo:signboard_pricing_tables:v2", v1.getSupersededBy());
        assertTrue(entries.stream()
                .anyMatch(e -> "adpromo:signboard_pricing_tables:v2".equals(e.getVersionKey())
                        && e.getStatus() == MigrationStatus.ACTIVE));
    }

    @Test
    void detectsDuplicateVersionKeysAndMissingDependency() {
        MigrationEntry a = entry("x:a", MigrationStatus.ACTIVE);
        MigrationEntry dup = entry("x:a", MigrationStatus.ACTIVE);
        MigrationEntry b = entry("x:b", MigrationStatus.ACTIVE);
        b.setPhase(SchemaPhase.DATA_MIGRATION);
        b.setDependencies(List.of("x:missing"));
        List<String> problems = MigrationCatalog.validate(List.of(a, dup, b));
        assertTrue(problems.stream().anyMatch(p -> p.contains("重复")));
        assertTrue(problems.stream().anyMatch(p -> p.contains("依赖未登记的键")));
    }

    private MigrationEntry entry(String key, MigrationStatus status) {
        MigrationEntry e = new MigrationEntry();
        e.setVersionKey(key);
        e.setModule("test");
        e.setPhase(SchemaPhase.BASE_STRUCTURE);
        e.setExecutionType(MigrationEntry.ExecutionType.JAVA);
        e.setExecutor("someInitializer");
        e.setStatus(status);
        return e;
    }
}
