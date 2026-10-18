package com.mftb.admin.config;

import com.mftb.admin.constant.HrOperationCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 生效日引擎结构迁移：异动动作 code 列 + 待生效任务表。
 * <p>
 * 两件事属于同一个改造，必须同批落地：
 * <ol>
 *   <li>{@code emp_position_record.operation_code}：把「在职/离职」「本次雇佣起点」的判定
 *       从匹配中文名改成匹配 code（方案 §5.3）。列可空，历史行按 {@link HrOperationCode#NAME_TO_CODE}
 *       回填，识别不了的落 {@code OTHER}（派生时退回名称判定，不改判历史事实）。</li>
 *   <li>{@code hr_effective_task}：批准后到生效日前的待执行凭据（方案 §7.2/§7.4）。
 *       没有它就只能「审批时立刻改写任职投影」或「靠全表扫单据猜谁该生效」，前者让未来离职
 *       提前生效并提前停号，后者不可追踪也不可重试。</li>
 * </ol>
 * 执行时机：晚于菜单种子与业务域结构（@Order(31)），因为回填要读 {@code operation} 现有值，
 * 而启动期补录历史员工的那批记录由 {@code DataInitializer}(@Order(5)) 写入。
 * <p>
 * 参考 SQL: {@code backend/sql/247_hr_effective_engine.sql}（一次性文档）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(31)
public class HrEffectiveEngineInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:effective-engine:v1.0";

    private static final String POSITION_TABLE = "emp_position_record";
    private static final String TASK_TABLE = "hr_effective_task";
    private static final String OP_CODE_COLUMN = "operation_code";
    private static final String OP_CODE_CHECK = "ck_position_op_code";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("HR 生效日引擎结构迁移失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        addOperationCodeColumn();
        addOperationCodeCheck();
        backfillOperationCode();
        createTaskTable();
        Integer residual = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + POSITION_TABLE + " WHERE operation_code IS NULL AND deleted = 0",
                Integer.class);
        if (residual != null && residual > 0) {
            // 回填后仍有 NULL 只可能是并发新写入的（写入口都已带 code），下次启动会再跑一次
            log.warn("仍有 {} 条职务记录未回填 operation_code，派生将退回名称判定", residual);
        }
        log.info("HR 生效日引擎结构已就绪: {}.{} + {}", POSITION_TABLE, OP_CODE_COLUMN, TASK_TABLE);
    }

    private void addOperationCodeColumn() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, POSITION_TABLE, OP_CODE_COLUMN);
        if (exists != null && exists > 0) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE " + POSITION_TABLE
                + " ADD COLUMN " + OP_CODE_COLUMN + " VARCHAR(24) DEFAULT NULL"
                + " COMMENT '异动动作 code: ONBOARD/REGULAR/PROMOTION/TRANSFER/DEMISSION/DIMISSION/REHIRE/OTHER'"
                + " AFTER operation");
    }

    private void addOperationCodeCheck() {
        // MySQL 8 没有 DROP CHECK IF EXISTS：先查 TABLE_CONSTRAINTS 再决定是否新增
        Integer constrained = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
                Integer.class, POSITION_TABLE, OP_CODE_CHECK);
        if (constrained != null && constrained > 0) {
            return;
        }
        List<String> quoted = new ArrayList<>();
        for (String code : HrOperationCode.ALL_CODES) {
            quoted.add("'" + code + "'");
        }
        jdbcTemplate.execute("ALTER TABLE " + POSITION_TABLE + " ADD CONSTRAINT " + OP_CODE_CHECK
                + " CHECK (" + OP_CODE_COLUMN + " IS NULL OR " + OP_CODE_COLUMN
                + " IN (" + String.join(",", quoted) + "))");
    }

    /** 按简体中文/繁体名称回填 code；CASE 未命中落 OTHER，保证判定端不再遇到空值 */
    private void backfillOperationCode() {
        StringBuilder sql = new StringBuilder("UPDATE " + POSITION_TABLE + " SET " + OP_CODE_COLUMN + " = CASE ");
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, String> entry : HrOperationCode.NAME_TO_CODE.entrySet()) {
            sql.append("WHEN TRIM(operation) = ? THEN ? ");
            args.add(entry.getKey());
            args.add(entry.getValue());
        }
        sql.append("ELSE '" + HrOperationCode.OTHER + "' END "
                + "WHERE " + OP_CODE_COLUMN + " IS NULL AND deleted = 0");
        jdbcTemplate.update(sql.toString(), args.toArray());
    }

    private void createTaskTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + TASK_TABLE + " ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "request_id BIGINT NOT NULL COMMENT '关联 hr_lifecycle_request.id', "
                        + "req_no VARCHAR(32) DEFAULT NULL COMMENT '单据编号快照', "
                        + "request_type VARCHAR(16) DEFAULT NULL COMMENT '单据类型快照', "
                        + "user_id BIGINT DEFAULT NULL COMMENT '目标员工；入职单办理前可为空', "
                        + "effective_date DATE NOT NULL COMMENT '生效日，到这天才算到期', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/DONE/FAILED/CANCELLED', "
                        + "attempts INT NOT NULL DEFAULT 0 COMMENT '已尝试次数', "
                        + "last_error VARCHAR(500) DEFAULT NULL COMMENT '最近一次失败原因', "
                        + "executed_at DATETIME DEFAULT NULL COMMENT '实际执行完成时间', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_effective_request (request_id), "
                        + "KEY idx_effective_status_date (status, effective_date)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 待生效任务（轻量 outbox）'");
    }

    private void verify() {
        if (jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, POSITION_TABLE, OP_CODE_COLUMN) == 0) {
            throw new IllegalStateException(POSITION_TABLE + "." + OP_CODE_COLUMN + " 列未就绪");
        }
        if (jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, TASK_TABLE) == 0) {
            throw new IllegalStateException(TASK_TABLE + " 表未创建成功");
        }
        Integer unique = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_effective_request'",
                Integer.class, TASK_TABLE);
        if (unique == null || unique == 0) {
            throw new IllegalStateException(TASK_TABLE + " 缺唯一键 uk_effective_request（重复登记会让同一单被执行两遍）");
        }
        Integer checkEnforced = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
                Integer.class, POSITION_TABLE, OP_CODE_CHECK);
        if (checkEnforced == null || checkEnforced == 0) {
            throw new IllegalStateException(POSITION_TABLE + " 缺 CHECK 约束 " + OP_CODE_CHECK);
        }
    }
}

