package com.mftb.admin.config;

import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.util.BizSeqService;
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
 * 考勤假勤系统（attendance）结构迁移：建 9 张 {@code att_*} 表 + 编号规则。
 *
 * <p>DDL 只在 classpath 资源 {@code 229_attendance_core_tables.sql} 存一份
 * （{@code backend/sql/} 下同名文件为参考副本），避免 Java 与 SQL 双份漂移
 * （沿用用车域 / RDM 域做法）。
 *
 * <p>遵循迁移规范：{@code applyOnce(versionKey, task, verify)} 带后置校验，任务与校验都成功才记版本；
 * 读取或执行失败一律抛出（绝不吞异常），下次启动自动重试。
 *
 * <p><b>启动顺序</b>：晚于 {@code AttendanceMenuInitializer(@Order 25)}（菜单先入库，
 * 编号规则的归属菜单名才有依据），且必须早于 {@code PermissionAnnotationValidator(@Order 30)}，
 * 否则校验器扫 {@code @RequirePermission} 时表还不存在。
 *
 * <p><b>为什么后置校验钉唯一键而不是只钉"表存在"</b>：考勤的事实表全部靠生成列唯一键做幂等
 * （同步重跑、重复导入、重算 UPSERT）。缺任意一个，并发下就会长出重复打卡或一人一月两条汇总，
 * 而薪酬是按汇总取数的——重复行直接等于重复发薪。
 */
@Slf4j
@Component
@Order(26)
@RequiredArgsConstructor
public class AttendanceSchemaMigrationInitializer implements CommandLineRunner {

    /** v1.0：9 张考勤域表 + 2 条编号规则 */
    private static final String VERSION_SCHEMA = "attendance:schema:v1.0";

    /**
     * v1.1：{@code att_exception} 增加处理说明列。
     * <p>为什么不把处理说明追加进 {@code detail}：detail 是判定引擎写入的量化描述
     * （VARCHAR(200) NOT NULL），追加用户备注既会与引擎重算互相覆盖，
     * 也会在长备注时撑爆列宽直接报 500。
     */
    private static final String VERSION_EXCEPTION_REMARK = "attendance:schema:v1.1";

    private static final String SCHEMA_SCRIPT = "229_attendance_core_tables.sql";

    private static final String[] TABLES = {
            "att_shift", "att_holiday", "att_group", "att_group_member", "att_schedule",
            "att_punch_log", "att_exception", "att_day_summary", "att_monthly_summary",
    };

    /**
     * 关键唯一键：缺任一都会让幂等前提失效（重复打卡、重复月度汇总、一天两组两条日报）。
     */
    private static final String[][] REQUIRED_UNIQUE_KEYS = {
            {"att_shift", "uk_shift_active_code"},
            {"att_holiday", "uk_holiday_active_date"},
            {"att_group", "uk_group_active_no"},
            {"att_group", "uk_group_active_name"},
            {"att_group_member", "uk_member_active_scope"},
            {"att_schedule", "uk_schedule_active_user_date"},
            {"att_punch_log", "uk_punch_active_idem"},
            {"att_exception", "uk_exception_active_user_date_type"},
            {"att_day_summary", "uk_day_active_date_group"},
            {"att_monthly_summary", "uk_monthly_active_month_user"},
    };

    /**
     * 实体依赖的关键列。MyBatis-Plus 按实体字段拼 SELECT 列表，实体多写一个字段或 DDL 漏一列，
     * 都会到首次查询才爆 bad SQL grammar，所以把漂移前动为启动失败。
     */
    private static final String[][] REQUIRED_COLUMNS = {
            {"att_punch_log", "work_date"},
            {"att_punch_log", "raw_ref"},
            {"att_exception", "late_minutes"},
            {"att_exception", "oa_request_id"},
            {"att_exception", "handle_remark"},
            {"att_day_summary", "calculated_at"},
            {"att_monthly_summary", "batch_no"},
            {"att_monthly_summary", "status"},
            {"att_group_member", "valid_to"},
            {"att_shift", "cross_day"},
    };

    /** 规则归属的业务菜单名（与既有规则同一命名风格：系统-模块） */
    private static final String SEQ_RULE_BIZ_MENU = "考勤假勤-考勤組";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        versionTracker.applyOnce(VERSION_EXCEPTION_REMARK, this::addExceptionHandleRemark,
                this::verifyExceptionHandleRemark);
        // 编号规则的展示元数据必须每次启动同步：applyOnce 的 task 在版本已记录的库里不再执行，
        // 而脚本里的 INSERT IGNORE 对已存在的行什么都不做（用车域踩过同一个坑）。
        syncSeqRules();
        verifySeqRules();
    }

    /* ==================== 迁移任务 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("考勤假勤建表脚本已执行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
    }

    /**
     * 已落库环境补 {@code att_exception.handle_remark}。
     * <p>列已存在时直接跳过：新建库由 229 脚本一次建出，本任务只负责存量库的增量补齐，
     * 两条路径最终结构必须一致（由 {@link #verifyExceptionHandleRemark()} 与 REQUIRED_COLUMNS 共同钉住）。
     */
    private void addExceptionHandleRemark() {
        if (columnExists("att_exception", "handle_remark")) {
            log.info("att_exception.handle_remark 已存在，跳過增量補列");
            return;
        }
        jdbcTemplate.execute("ALTER TABLE att_exception ADD COLUMN handle_remark VARCHAR(200) NULL "
                + "COMMENT '处理说明（确认原因/补卡原因）' AFTER handled_at");
        log.info("att_exception 已增加 handle_remark 列（處理說明與判定明细分列）");
    }

    private void verifyExceptionHandleRemark() {
        if (!columnExists("att_exception", "handle_remark")) {
            throw new IllegalStateException("att_exception.handle_remark 未就绪，異常處理說明無處落庫");
        }
    }

    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就绪，考勤假勤域无法写入");
            }
        }
        for (String[] key : REQUIRED_UNIQUE_KEYS) {
            if (!indexExists(key[0], key[1])) {
                throw new IllegalStateException(key[0] + " 缺少 " + key[1]
                        + "，重复打卡/重复月度汇总结算会直接失真，薪酬侧按重复数据取数");
            }
        }
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1]
                        + " 列缺失，实体按字段拼 SELECT 会在首次查询时报 bad SQL grammar");
            }
        }
    }

    /**
     * 每次启动幂等 UPSERT 编号规则（前缀/日期维度/归属菜单/拼接说明）。
     * <p>考勤组编号取 YYYYMM 而不是 YYYYMMDD：考勤组是长期主数据，按天出号会在
     * 一个月内散成几十个无意义序列，规则菜单里也看不出规律。
     */
    private void syncSeqRules() {
        String[][] rules = {
                {BizSeqService.RULE_ATTENDANCE_GROUP, "考勤組編號", "AG", "YYYYMM",
                        "{prefix} + YYYYMM + {n}位自增序號"},
                {BizSeqService.RULE_ATTENDANCE_MONTHLY_BATCH, "月度考勤匯總批次號", "AT", "YYYYMM",
                        "{prefix} + YYYYMM + {n}位自增序號；凍結時生成，薪酬側按此對賬"},
        };
        for (String[] r : rules) {
            int updated = jdbcTemplate.update(
                    "UPDATE sys_biz_seq_rule SET rule_name = ?, biz_menu = ?, prefix = ?, date_format = ?, "
                            + "seq_length = 4, status = 1, remark = ?, updated_at = NOW() WHERE rule_key = ?",
                    r[1], SEQ_RULE_BIZ_MENU, r[2], r[3], r[4], r[0]);
            if (updated == 0) {
                jdbcTemplate.update(
                        "INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                                + "seq_length, seq_start, status, remark) VALUES (?, ?, ?, ?, ?, 4, 1, 1, ?)",
                        r[0], r[1], SEQ_RULE_BIZ_MENU, r[2], r[3], r[4]);
            }
        }
    }

    /** 编号规则缺失时建考勤组/冻结月报必报「編號生成規則未配置」，因此每次启动都要验 */
    private void verifySeqRules() {
        for (String rule : new String[]{BizSeqService.RULE_ATTENDANCE_GROUP, BizSeqService.RULE_ATTENDANCE_MONTHLY_BATCH}) {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND status = 1",
                    Integer.class, rule);
            if (n == null || n == 0) {
                throw new IllegalStateException("编号规则 " + rule + " 未就绪（"
                        + AttendanceConstants.SEQ_GROUP + " / " + AttendanceConstants.SEQ_MONTHLY_BATCH
                        + " 取号会直接失败）");
            }
        }
    }

    /* ==================== 工具 ==================== */

    /**
     * 执行 classpath 脚本。
     * <p>按分号切分前先用行注释正则剥掉 {@code --} 注释：脚本里的中文说明含分号时，
     * 不剥注释会切出半条语句直接报错。
     */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + script + "，考勤假勤域表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
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

    private boolean tableExists(String table) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return n != null && n > 0;
    }

    /** 列是否存在（MySQL 8 无 ADD COLUMN IF NOT EXISTS，先查后加是唯一安全写法） */
    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean indexExists(String table, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        return count != null && count > 0;
    }
}
