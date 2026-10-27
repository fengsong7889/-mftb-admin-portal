package com.mftb.admin.config.migration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link RdmBatch34Schema#definition(String)} 结构契约解析测试（纯 classpath 解析，不连库）。
 *
 * <p>验证 237/238 两个已打包脚本被解析为正确的表/列/索引/约束契约，锁定几个关键不变量：
 * <ul>
 *   <li>237 建 8 张 Batch3 事实表；238 建 4 张 Batch4 迁移/灰度表；</li>
 *   <li>幂等绑定补列（user_id/resource_key/client_request_id/request_hash/status/completed_at）与
 *       CHECK 约束 {@code ck_rdm_idempotent_binding} 存在（executeOnce 占位契约的物理基础）；</li>
 *   <li>唯一性生成列 {@code active_issue_id}/{@code active_req_id} 被识别为不可自愈（healable=false）；</li>
 *   <li>通知去重唯一键 {@code uk_rdm_notify_dedupe} 与约束存在；GLOBAL 灰度种子恰一条且写开关默认关闭；</li>
 *   <li>未登记脚本被拒绝。</li>
 * </ul>
 *
 * <p>本测试仅断言解析产物，不触发 {@code migrate}/{@code verify}，因此不需要 {@code JdbcTemplate} 或数据库。
 */
class RdmBatch34SchemaTest {

    private static List<String> columnNames(RdmBatch34Schema.Definition def, String table) {
        return def.columns().stream()
                .filter(c -> c.table().equals(table))
                .map(RdmBatch34Schema.Column::name)
                .toList();
    }

    private static RdmBatch34Schema.Column column(RdmBatch34Schema.Definition def, String table, String name) {
        return def.columns().stream()
                .filter(c -> c.table().equals(table) && c.name().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("缺少列契约: " + table + "." + name));
    }

    /* ==================== 237 / rdm:schema:v3.2 ==================== */

    @Test
    @DisplayName("237 解析出 8 张 Batch3 事实表")
    void batch3CreatesEightTables() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_3);
        assertEquals(8, def.creates().size(), "237 应恰好建 8 张表");
        for (String table : List.of("rdm_test_round", "rdm_release_approval", "rdm_release_attempt",
                "rdm_release_exemption", "rdm_release_exemption_decision", "rdm_supplementary_verification",
                "rdm_issue_followup", "rdm_issue_resolution")) {
            assertTrue(def.creates().containsKey(table), "缺少建表契约: " + table);
        }
        assertTrue(def.seeds().isEmpty(), "237 不含种子数据");
    }

    @Test
    @DisplayName("237 幂等日志补列与 CHECK 绑定约束（executeOnce 占位契约的物理基础）")
    void batch3IdempotentBindingContract() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_3);

        assertEquals(
                List.of("user_id", "resource_key", "client_request_id", "request_hash", "status", "completed_at"),
                columnNames(def, "rdm_idempotent_log"),
                "rdm_idempotent_log 应新增 6 个绑定列");

        assertTrue(def.constraints().stream().anyMatch(c -> c.table().equals("rdm_idempotent_log")
                        && c.name().equals("ck_rdm_idempotent_binding")
                        && c.definition().startsWith("CHECK")),
                "缺少幂等绑定 CHECK 约束 ck_rdm_idempotent_binding");

        // status 列默认 legacy，保证旧 V1/V2 行不受新约束影响
        assertTrue(column(def, "rdm_idempotent_log", "status").definition().contains("DEFAULT 'legacy'"),
                "status 列应默认 legacy 以兼容旧路径");
    }

    @Test
    @DisplayName("237 发布批次与测试执行补列（并发 version 与业务事实字段分离）")
    void batch3ReleaseAndExecutionColumns() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_3);

        assertEquals(
                List.of("version", "application_version", "application_snapshot_json", "approval_snapshot_json",
                        "submitted_at", "evidence_hash", "approval_evidence_hash", "approval_expires_at"),
                columnNames(def, "rdm_release_batch"),
                "rdm_release_batch 应新增 8 个列");

        assertEquals(
                List.of("case_id", "test_round_id", "scope_version", "evidence_json", "request_id"),
                columnNames(def, "rdm_test_execution"),
                "rdm_test_execution 应新增 5 个列");

        // 唯一索引：测试轮次(batch_id, round_no)
        assertTrue(def.indexes().stream().anyMatch(i -> i.table().equals("rdm_test_round")
                        && i.name().equals("uk_rdm_test_round")
                        && i.unique()
                        && i.columns().equals(List.of("batch_id", "round_no"))),
                "缺少唯一索引 uk_rdm_test_round(batch_id, round_no)");
    }

    @Test
    @DisplayName("237 承接历史唯一性生成列被识别为不可自愈")
    void batch3GeneratedColumnNotHealable() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_3);
        var activeIssueId = column(def, "rdm_issue_followup", "active_issue_id");
        assertTrue(activeIssueId.definition().contains("GENERATED ALWAYS"),
                "active_issue_id 应为 STORED 生成列");
        assertFalse(activeIssueId.healable(), "生成列不可自动回填/自愈");
    }

    /* ==================== 238 / rdm:schema:v3.3 ==================== */

    @Test
    @DisplayName("238 解析出 4 张 Batch4 迁移/灰度表，且 GLOBAL 种子恰一条")
    void batch4CreatesFourTablesAndSingleGlobalSeed() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_4);
        assertEquals(4, def.creates().size(), "238 应恰好建 4 张表");
        for (String table : List.of("rdm_flow_config", "rdm_migration_batch",
                "rdm_migration_item", "rdm_migration_audit")) {
            assertTrue(def.creates().containsKey(table), "缺少建表契约: " + table);
        }
        assertEquals(1, def.seeds().size(), "238 应恰有一条 GLOBAL 灰度种子");
        assertTrue(def.seeds().get(0).startsWith("INSERT INTO rdm_flow_config (scope_key,"),
                "种子应为 rdm_flow_config GLOBAL 插入");
    }

    @Test
    @DisplayName("238 V3 写/发布开关默认关闭（灰度默认不启用）")
    void batch4FlowFlagsDefaultOff() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_4);
        assertTrue(column(def, "rdm_flow_config", "v3_write_enabled").definition().contains("DEFAULT 0"),
                "v3_write_enabled 应默认 0");
        assertTrue(column(def, "rdm_flow_config", "v3_release_enabled").definition().contains("DEFAULT 0"),
                "v3_release_enabled 应默认 0");
    }

    @Test
    @DisplayName("238 通知出站去重契约：5 补列 + 唯一键 uk_rdm_notify_dedupe + CHECK 约束")
    void batch4NotifyDedupeContract() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_4);

        assertEquals(
                List.of("object_type", "object_id", "event_version", "receiver_user_id", "dedupe_key"),
                columnNames(def, "rdm_notify_log"),
                "rdm_notify_log 应新增 5 个去重列");

        assertTrue(def.indexes().stream().anyMatch(i -> i.table().equals("rdm_notify_log")
                        && i.name().equals("uk_rdm_notify_dedupe")
                        && i.unique()
                        && i.columns().equals(List.of("dedupe_key"))),
                "缺少唯一索引 uk_rdm_notify_dedupe(dedupe_key)");

        assertTrue(def.constraints().stream().anyMatch(c -> c.table().equals("rdm_notify_log")
                        && c.name().equals("ck_rdm_notify_dedupe")
                        && c.definition().startsWith("CHECK")),
                "缺少通知去重 CHECK 约束 ck_rdm_notify_dedupe");
    }

    @Test
    @DisplayName("238 迁移项唯一性生成列 active_req_id 被识别为不可自愈")
    void batch4GeneratedColumnNotHealable() {
        var def = RdmBatch34Schema.definition(RdmBatch34Schema.SCRIPT_4);
        var activeReqId = column(def, "rdm_migration_item", "active_req_id");
        assertTrue(activeReqId.definition().contains("GENERATED ALWAYS"),
                "active_req_id 应为 STORED 生成列");
        assertFalse(activeReqId.healable(), "生成列不可自动回填/自愈");
    }

    /* ==================== 白名单守卫 ==================== */

    @Test
    @DisplayName("未登记脚本被拒绝，防止解析任意用户 SQL")
    void unregisteredScriptRejected() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> RdmBatch34Schema.definition("999_not_registered.sql"));
        assertTrue(ex.getMessage().contains("未登记"), "应明确拒绝未登记结构资源");
    }
}
