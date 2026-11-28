/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationCatalog;
import com.mftb.admin.config.migration.MigrationEntry;
import com.mftb.admin.config.migration.MigrationStatus;
import com.mftb.admin.config.migration.SchemaPhase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 版本历史 summary 扩容迁移的事故回归：锁住 DDL、后置校验、catalog 与参考副本，
 * 防止再次出现「代码已发、生产列仍为 VARCHAR(2000)」的静默漂移。
 */
@ExtendWith(MockitoExtension.class)
class VersionHistoryDataInitializerTest {

    @Mock
    JdbcTemplate jdbcTemplate;

    @Mock
    SchemaVersionTracker versionTracker;

    @InjectMocks
    VersionHistoryDataInitializer initializer;

    private final Map<String, MigrationSteps> migrations = new HashMap<>();

    @BeforeEach
    void captureMigrationSteps() {
        doAnswer(invocation -> {
            migrations.put(invocation.getArgument(0), new MigrationSteps(
                    invocation.getArgument(1), invocation.getArgument(2)));
            return true;
        }).when(versionTracker).applyOnce(anyString(), any(Runnable.class), any(Runnable.class));
        initializer.run();
    }

    @Test
    @DisplayName("VARCHAR 执行 TEXT 扩容，并以真实列类型作为后置校验")
    void textMigrationAltersVarcharAndVerifiesActualType() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), any(), any()))
                .thenReturn("varchar", "text");
        MigrationSteps migration = migrations.get(VersionHistoryDataInitializer.VERSION_SUMMARY_TEXT);

        migration.task().run();
        verify(jdbcTemplate).execute(contains("MODIFY COLUMN summary TEXT NOT NULL"));
        migration.verify().run();
    }

    @Test
    @DisplayName("迁移后仍是 VARCHAR 时校验失败，不允许记成成功版本")
    void textMigrationRejectsVarcharAfterTask() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), any(), any())).thenReturn("varchar");
        MigrationSteps migration = migrations.get(VersionHistoryDataInitializer.VERSION_SUMMARY_TEXT);

        assertThrows(IllegalStateException.class, migration.verify()::run);
    }

    @Test
    @DisplayName("已经是 TEXT 的库跳过 DDL，不被历史 110 迁移反向缩窄")
    void textMigrationSkipsWhenAlreadyText() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), any(), any())).thenReturn("text");
        MigrationSteps migration = migrations.get(VersionHistoryDataInitializer.VERSION_SUMMARY_TEXT);

        migration.task().run();

        verify(jdbcTemplate, never()).execute(anyString());
    }

    @Test
    @DisplayName("classpath 真值与 backend/sql 参考副本逐字一致")
    void referenceCopyMatchesClasspathSource() throws IOException {
        Path source = Path.of("modules", "legacy", "src", "main", "resources",
                VersionHistoryDataInitializer.SUMMARY_TEXT_SCRIPT);
        Path copy = Path.of("sql", VersionHistoryDataInitializer.SUMMARY_TEXT_SCRIPT);

        assertEquals(Files.readString(source), Files.readString(copy));
    }

    @Test
    @DisplayName("TEXT 扩容已登记 catalog，并依赖历史 110 迁移")
    void textMigrationIsRegisteredInCatalog() throws Exception {
        MigrationEntry entry = MigrationCatalog.readAll().stream()
                .filter(e -> VersionHistoryDataInitializer.VERSION_SUMMARY_TEXT.equals(e.getVersionKey()))
                .findFirst().orElseThrow();

        assertEquals(MigrationStatus.ACTIVE, entry.getStatus());
        assertEquals(SchemaPhase.MODULE_STRUCTURE, entry.getPhase());
        assertEquals(MigrationEntry.ExecutionType.JAVA, entry.getExecutionType());
        assertEquals("versionHistoryDataInitializer", entry.getExecutor());
        assertTrue(entry.getDependencies().contains(VersionHistoryDataInitializer.VERSION_SUMMARY_LENGTH));
        assertTrue(new ClassPathResource(VersionHistoryDataInitializer.SUMMARY_TEXT_SCRIPT).exists(),
                "TEXT 扩容脚本必须随制品打包");
    }

    private record MigrationSteps(Runnable task, Runnable verify) {
    }
}
