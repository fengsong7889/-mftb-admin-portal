package com.mftb.admin.config;

import com.mftb.admin.entity.HrOffboardingTask;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 离职联动结构迁移（方案 §7.4 离职联动 + 交接接收人）。
 * <p>
 * 做两件事：
 * <ol>
 *   <li>建 {@code hr_offboarding_task}：离职后的跨模块动作（EAM 资产交接、OA 待办改派）需要
 *       可追踪、可重试的落库凭据。没有它就只能「离职事务里同步调 EAM」—— 接收人还没定就必然失败，
 *       而失败会把离职办理一起回滚。</li>
 *   <li>{@code hr_lifecycle_request} 补交接接收人两列：接收人是业务事实，必须由人指定。</li>
 * </ol>
 * 不回填历史离职单据：那些单据的资产与待办早已由人工处置完毕，凭空补一批 PENDING 任务
 * 只会让 HR 面对一屏无法判断真伪的待办。
 * <p>
 * 执行时机：@Order(34)，晚于雇佣期间(32)与人事审计(33)结构。
 * 参考 SQL：{@code backend/sql/251_hr_offboarding_task.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(34)
public class HrOffboardingSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:offboarding-schema:v1.0";

    private static final String TASK_TABLE = "hr_offboarding_task";
    private static final String REQUEST_TABLE = "hr_lifecycle_request";

    /** (列名, DDL 片段)，与 ContractRegistry 契约逐字同构 */
    private static final List<String[]> REQUEST_COLUMNS = List.of(
            new String[]{"handover_to_user_id",
                    "BIGINT DEFAULT NULL COMMENT '交接接收人ID(sys_user.id)'"},
            new String[]{"handover_to_name",
                    "VARCHAR(128) DEFAULT NULL COMMENT '交接接收人姓名快照'"});

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("离职联动结构迁移失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        createTaskTable();
        addRequestColumns();
        log.info("离职联动结构已就绪: {} + {}.handover_to_*", TASK_TABLE, REQUEST_TABLE);
    }

    private void createTaskTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + TASK_TABLE + " ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "request_id BIGINT NOT NULL COMMENT '关联离职单据 hr_lifecycle_request.id', "
                        + "req_no VARCHAR(32) DEFAULT NULL COMMENT '单据编号快照', "
                        + "user_id BIGINT DEFAULT NULL COMMENT '离职员工ID(sys_user.id)', "
                        + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '离职工号快照', "
                        + "task_type VARCHAR(32) NOT NULL COMMENT '任务类型: EAM_ASSET_HANDOVER / OA_TODO_TRANSFER', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/RUNNING/DONE/SKIPPED/FAILED', "
                        + "attempts INT NOT NULL DEFAULT 0 COMMENT '已尝试次数', "
                        + "last_error VARCHAR(500) DEFAULT NULL COMMENT '最近一次失败原因', "
                        + "result_summary VARCHAR(500) DEFAULT NULL COMMENT '执行结果摘要', "
                        + "target_ref VARCHAR(64) DEFAULT NULL COMMENT '跨模块产物引用(EAM 交接单号 / OA 任务id)', "
                        + "effective_date DATE DEFAULT NULL COMMENT '计划执行日(离职生效日)', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        // 同一离职单的同类联动动作只能有一行：这是「重试不重复建交接单」的库层依据
                        + "UNIQUE KEY uk_offboarding_request_type (request_id, task_type), "
                        + "KEY idx_offboarding_status_date (status, effective_date), "
                        + "KEY idx_offboarding_user (user_id), "
                        + "CONSTRAINT ck_offboarding_status CHECK (status IN "
                        + "(" + quoteIn(HrOffboardingTask.ALL_STATUSES) + ")), "
                        + "CONSTRAINT ck_offboarding_type CHECK (task_type IN "
                        + "(" + quoteIn(HrOffboardingTask.ALL_TYPES) + "))"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='离职联动任务（轻量 outbox）'");
    }

    private void addRequestColumns() {
        for (String[] column : REQUEST_COLUMNS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, REQUEST_TABLE, column[0]);
            if (exists != null && exists > 0) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + REQUEST_TABLE + " ADD COLUMN " + column[0] + " " + column[1]);
        }
    }

    private static String quoteIn(java.util.Collection<String> values) {
        List<String> quoted = new ArrayList<>();
        for (String value : values) {
            quoted.add("'" + value + "'");
        }
        return String.join(",", quoted);
    }

    private void verify() {
        if (jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, TASK_TABLE) == 0) {
            throw new IllegalStateException(TASK_TABLE + " 表未创建成功");
        }
        Integer unique = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_offboarding_request_type'",
                Integer.class, TASK_TABLE);
        if (unique == null || unique == 0) {
            throw new IllegalStateException(TASK_TABLE + " 缺唯一键 uk_offboarding_request_type"
                    + "（同一离职单长出两行同类任务会让交接被重复发起）");
        }
        String columns = REQUEST_COLUMNS.stream().map(c -> "'" + c[0] + "'").collect(Collectors.joining(","));
        Integer added = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (" + columns + ")",
                Integer.class, REQUEST_TABLE);
        if (added == null || added < REQUEST_COLUMNS.size()) {
            throw new IllegalStateException(REQUEST_TABLE + " 交接接收人列未全部就绪（实际 "
                    + added + "/" + REQUEST_COLUMNS.size() + "）");
        }
        Integer checks = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'",
                Integer.class, TASK_TABLE);
        if (checks == null || checks < 2) {
            throw new IllegalStateException(TASK_TABLE + " 缺状态/类型 CHECK 约束（实际 " + checks + " 个）");
        }
    }
}
