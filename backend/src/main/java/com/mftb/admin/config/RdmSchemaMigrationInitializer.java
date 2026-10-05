package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * RDM（產研協同）M1 结构迁移：建 12 张 {@code rdm_} 表 + 状态机/流转/SLA 种子 + 编号规则 + 准入流程定义。
 * <p>
 * DDL 只在 classpath 脚本 {@code 204_rdm_core_tables.sql} 存一份（{@code backend/sql/} 下同名文件为参考副本），
 * 避免 Java 与 SQL 双份漂移。脚本全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，天然幂等。
 * <p>
 * 遵循迁移规范：{@code applyOnce(versionKey, task, verify)} 带后置校验，任务与校验都成功才记版本；
 * 读取或执行失败一律抛出（不吞异常），下次启动自动重试。
 * <p><b>启动顺序（必读）</b>：必须显式 {@code @Order} 且排在 {@code RdmMenuInitializer(24)}、
 * {@code RdmMetricSnapshotInitializer(26)} 之前。不加时默认是 LOWEST_PRECEDENCE（最后跑），
 * 会导致后续 runner 访问尚未创建的 rdm_ 表而报 bad SQL grammar（快照回填就因此空跑一次）。
 */
@Slf4j
@Component
@Order(23)
@RequiredArgsConstructor
public class RdmSchemaMigrationInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "rdm:schema:v1.0";
    private static final String SCHEMA_SCRIPT = "204_rdm_core_tables.sql";
    /** 附件/截图扩到 MEDIUMTEXT（存 Base64 Data URL），与 EAM 验收照片口径对齐 */
    private static final String VERSION_ATTACHMENT = "rdm:schema:v1.1";
    private static final String ATTACHMENT_SCRIPT = "205_rdm_attachment_mediumtext.sql";

    /** M2 结构：PRD / 评审 / 迭代 / 执行任务与工时 / 需求变更 5 张表 */
    private static final String VERSION_DELIVERY = "rdm:schema:v1.2";
    private static final String DELIVERY_SCRIPT = "206_rdm_delivery_tables.sql";

    /** M3 结构：验收用例明细 + 验收单返工/环境/遗留转需求列 + 需求衍生链 */
    private static final String VERSION_ACCEPTANCE = "rdm:schema:v1.3";
    private static final String ACCEPTANCE_SCRIPT = "207_rdm_acceptance_case.sql";

    /** M4 结构：积分规则（版本化）/ 积分流水（幂等唯一键）/ 效能量日快照 + 绩效建议值通道列 */
    private static final String VERSION_SCORE = "rdm:schema:v1.4";
    private static final String SCORE_SCRIPT = "208_rdm_score_tables.sql";

    /**
     * 快照表 dim_id 去重 + 改为 NOT NULL DEFAULT 0。
     * <p>v1.4 建表时 COMPANY 维度 dim_id 存 NULL，而 MySQL 唯一索引不约束 NULL，
     * uk_rdm_metric_day 因此形同虚设，回填重复跑会长重复行（趋势页同一天两个数据点）。
     */
    private static final String VERSION_SNAPSHOT_FIX = "rdm:schema:v1.5";
    private static final String SNAPSHOT_FIX_SCRIPT = "209_rdm_snapshot_dim_id.sql";

    /** M4 新增表 */
    private static final String[] SCORE_TABLES = {
            "rdm_score_rule", "rdm_score_record", "rdm_metric_snapshot",
    };

    /**
     * 绩效建议值通道列：{表, 列, DDL}。
     * <p>MySQL 的 ADD COLUMN 不可重复执行，所以这三列不能放进脚本（脚本中途失败时
     * 前面的 CREATE TABLE 已自提交，重跑会撞 duplicate column），必须逐列先查再加。
     */
    private static final String[][] PERF_SUGGEST_COLUMNS = {
            {"hr_perf_score_item", "suggested_score",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_score DECIMAL(6,2) DEFAULT NULL COMMENT '系統建議分（RDM 產出積分換算）' AFTER weight"},
            {"hr_perf_score_item", "suggested_source",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_source VARCHAR(32) DEFAULT NULL COMMENT '建議值來源: RDM/MANUAL' AFTER suggested_score"},
            {"hr_perf_score_item", "suggested_at",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_at DATETIME DEFAULT NULL COMMENT '建議值寫入時間' AFTER suggested_source"},
    };

    /** 需求全生命周期主数据与配置表 */
    private static final String[] TABLES = {
            "rdm_requirement", "rdm_requirement_target", "rdm_requirement_role",
            "rdm_status_log", "rdm_comment", "rdm_attachment", "rdm_acceptance",
            "rdm_status_def", "rdm_transition", "rdm_routing_rule", "rdm_sla_config",
            "rdm_notify_log",
    };

    /** M2 新增表 */
    private static final String[] DELIVERY_TABLES = {
            "rdm_prd", "rdm_review", "rdm_iteration", "rdm_work_task", "rdm_change_request",
    };

    /** M3 新增列（验收一次通过率与返工链路的存证入口，缺列则质量口径只能靠倒推） */
    private static final String[][] ACCEPTANCE_COLUMNS = {
            {"rdm_acceptance", "attempt"},
            {"rdm_acceptance", "test_env"},
            {"rdm_acceptance", "defect_count"},
            {"rdm_acceptance", "follow_up_req_id"},
            {"rdm_requirement", "parent_req_id"},
            {"rdm_requirement", "parent_req_no"},
    };

    /** 状态机种子下限（少于该值说明种子未落全，前端操作区会缺按钮） */
    private static final int MIN_STATUS_DEFS = 23;
    private static final int MIN_TRANSITIONS = 30;

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doMigrate, this::verify);
        versionTracker.applyOnce(VERSION_ATTACHMENT, this::doAttachmentMigrate, this::verifyAttachment);
        versionTracker.applyOnce(VERSION_DELIVERY, this::doDeliveryMigrate, this::verifyDelivery);
        versionTracker.applyOnce(VERSION_ACCEPTANCE, this::doAcceptanceMigrate, this::verifyAcceptance);
        versionTracker.applyOnce(VERSION_SCORE, this::doScoreMigrate, this::verifyScore);
        versionTracker.applyOnce(VERSION_SNAPSHOT_FIX, this::doSnapshotFixMigrate, this::verifySnapshotFix);
    }

    private void doScoreMigrate() {
        int executed = executeScript(SCORE_SCRIPT);
        log.info("RDM M4 建表腳本已執行: {} 条语句（{}）", executed, SCORE_SCRIPT);
        // 绩效表扩展列走条件添加，保证脚本与列变更可重复执行
        for (String[] col : PERF_SUGGEST_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让推送建议值写入报“未知列”，失败必须抛出并不记版本
            jdbcTemplate.execute(col[2]);
            log.info("已添加绩效建議值列: {}.{}", col[0], col[1]);
        }
    }

    /** M4 后置校验：三张表存在、现行规则已种子、绩效建议值列齐备 */
    private void verifyScore() {
        requireTables(SCORE_TABLES);
        requireAtLeast("積分規則现行版本种子", 1,
                "SELECT COUNT(*) FROM rdm_score_rule WHERE rule_code = 'BASE' AND enabled = 1 AND deleted = 0");
        for (String[] col : PERF_SUGGEST_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("M4 結構未就緒：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    /** 列是否存在（当前库） */
    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private void doSnapshotFixMigrate() {
        int executed = executeScript(SNAPSHOT_FIX_SCRIPT);
        log.info("RDM 快照 dim_id 修正脚本已執行: {} 条语句（{}）", executed, SNAPSHOT_FIX_SCRIPT);
    }

    /**
     * 快照修正后置校验：列必须非空、无 NULL 残留、无重复快照日。
     * <p>只要列仍可为空，唯一索引就仍会被 NULL 绕过，下次回填又会长重复行，
     * 所以这三条都必须实查，不能只信脚本报成功。
     */
    private void verifySnapshotFix() {
        String nullable = jdbcTemplate.queryForObject(
                "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_metric_snapshot' "
                        + "AND COLUMN_NAME = 'dim_id'",
                String.class);
        if (!"NO".equalsIgnoreCase(nullable)) {
            throw new IllegalStateException("rdm_metric_snapshot.dim_id 仍可为空（IS_NULLABLE=" + nullable
                    + "），唯一索引会继续被 NULL 绕过");
        }
        Integer nullRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_metric_snapshot WHERE dim_id IS NULL", Integer.class);
        if (nullRows != null && nullRows > 0) {
            throw new IllegalStateException("rdm_metric_snapshot 仍残留 " + nullRows + " 行 dim_id 为 NULL");
        }
        Integer dupGroups = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT stat_date FROM rdm_metric_snapshot "
                        + "GROUP BY stat_date, dim_type, dim_id HAVING COUNT(*) > 1) t", Integer.class);
        if (dupGroups != null && dupGroups > 0) {
            throw new IllegalStateException("rdm_metric_snapshot 存在 " + dupGroups
                    + " 组重复快照日，趋势页会画出重复数据点");
        }
    }

    private void doAcceptanceMigrate() {
        int executed = executeScript(ACCEPTANCE_SCRIPT);
        log.info("RDM M3 验收用例脚本已執行: {} 条语句（{}）", executed, ACCEPTANCE_SCRIPT);
    }

    /**
     * M3 后置校验：用例表必须存在，且验收单/需求主表的关键列必须齐。
     * <p>ADD COLUMN 一旦静默失败（如权限/锁超时）会让写入报“未知列”或直接丢数据，
     * 而 applyOnce 只跑一次不补重试，所以这里逐列实查 information_schema，缺列即抛异常不记版本。
     */
    private void verifyAcceptance() {
        requireTables(new String[]{"rdm_acceptance_case"});
        for (String[] col : ACCEPTANCE_COLUMNS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, col[0], col[1]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("M3 結構未就緒：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    private void doDeliveryMigrate() {
        int executed = executeScript(DELIVERY_SCRIPT);
        log.info("RDM M2 建表腳本已執行: {} 条语句（{}）", executed, DELIVERY_SCRIPT);
    }

    private void verifyDelivery() {
        requireTables(DELIVERY_TABLES);
        requireAtLeast("M2 編號規則", 4,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('rdm_prd','rdm_review','rdm_work_task','rdm_change')");
        requireAtLeast("需求變更流程定義", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'rdm_change' AND status = 1");
        requireAtLeast("需求變更流程配置", 1,
                "SELECT COUNT(*) FROM biz_workflow_config WHERE flow_type = 'rdm_change'");
    }

    private void doMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("RDM 建表腳本已執行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void doAttachmentMigrate() {
        int executed = executeScript(ATTACHMENT_SCRIPT);
        log.info("RDM 附件欄位腳本已執行: {} 条语句（{}）", executed, ATTACHMENT_SCRIPT);
    }

    /** 执行 classpath 迁移脚本（去掉 -- 注释行后按分号切分；脚本内字面量不含分号） */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + script + "，RDM 表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // 不吞异常：脚本读不到就等于迁移没做，交给 applyOnce 记失败并下次重试
            throw new IllegalStateException("读取建表脚本失败 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    private void verify() {
        requireTables(TABLES);
        requireAtLeast("rdm_status_def 状态种子", MIN_STATUS_DEFS,
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0");
        requireAtLeast("rdm_transition 流转种子", MIN_TRANSITIONS,
                "SELECT COUNT(*) FROM rdm_transition WHERE deleted = 0");
        requireAtLeast("RDM 编号规则", 2,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('rdm_requirement','rdm_acceptance')");
        requireAtLeast("需求准入流程定义", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'rdm_intake' AND status = 1");
    }

    /** 附件列必须能容下 Base64 Data URL（MEDIUMTEXT），否则上传会静默截断 */
    private void verifyAttachment() {
        requireMediumText("rdm_requirement_target", "screenshot_path");
        requireMediumText("rdm_attachment", "storage_path");
    }

    private void requireMediumText(String table, String column) {
        String type = jdbcTemplate.queryForObject(
                "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                String.class, table, column);
        if (!"mediumtext".equalsIgnoreCase(type)) {
            throw new IllegalStateException(table + "." + column + " 未升级到 MEDIUMTEXT，实际类型: " + type);
        }
    }

    /** 校验一组表已存在（structure 后置校验统一入口） */
    private void requireTables(String[] tables) {
        for (String table : tables) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪");
            }
        }
    }

    private void requireAtLeast(String label, int min, String sql) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class);
        if (count == null || count < min) {
            throw new IllegalStateException(label + " 未就绪: 期望至少 " + min + " 条，实际 " + count + " 条");
        }
    }
}
