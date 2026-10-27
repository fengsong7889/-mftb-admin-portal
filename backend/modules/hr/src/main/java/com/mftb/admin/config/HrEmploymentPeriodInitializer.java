package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 雇佣期间分层结构迁移（方案 §7.1，P4 双轨第一阶段）。
 * <p>
 * 做两件事：
 * <ol>
 *   <li>建 {@code hr_employment_period}：给「第几次雇佣」「本次雇佣从哪天起」一个落点。
 *       <b>刻意不物化任何历史行</b>—— 雇佣期间只能由任职事实派生、经 HR 核对后登记
 *       （{@code POST /api/hr/employment/periods/sync}），启动期批量回填等于代码替 HR 认定了入职日。</li>
 *   <li>给 {@code emp_position_record} 补 7 个稳定 ID 列并按名称回填：
 *       名称快照保留，稳定 ID 让部门改名后历史仍挂得回去。</li>
 * </ol>
 * 回填只做「同名唯一命中」：猜中一次的代价是把异动永久挂到别的部门上，
 * 而留 NULL 会被差异报告看见并可追补 —— 两者后果不对称，所以宁可留空。
 * <p>
 * 执行时机：{@code @Order(32)}，晚于 {@code hr:effective-engine:v1.0}（@Order(31)），
 * 因为按名称解析动作 code 的前提是 {@code operation_code} 已经回填完。
 * <p>
 * 参考 SQL: {@code backend/sql/248_hr_employment_period.sql}（一次性文档）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(32)
public class HrEmploymentPeriodInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:employment-period:v1.0";

    private static final String PERIOD_TABLE = "hr_employment_period";
    private static final String POSITION_TABLE = "emp_position_record";

    /** 任职记录新增的稳定 ID 列（列名 → DDL 片段），与 ContractRegistry 契约逐字同构 */
    private static final List<String[]> POSITION_COLUMNS = List.of(
            new String[]{"employment_period_id", "BIGINT DEFAULT NULL COMMENT '所属雇佣期间ID(hr_employment_period.id)'"},
            new String[]{"dept_id", "BIGINT DEFAULT NULL COMMENT '服务部门ID(sys_department.id)，名称快照留在 service_dept'"},
            new String[]{"position_id", "BIGINT DEFAULT NULL COMMENT '职位ID(sys_position.id)，名称快照留在 position_name'"},
            new String[]{"employer_company_id", "BIGINT DEFAULT NULL COMMENT '雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY)'"},
            new String[]{"work_location_id", "BIGINT DEFAULT NULL COMMENT '工作地点字典ID(sys_hr_dict WORK_LOCATION)'"},
            new String[]{"manager_user_id", "BIGINT DEFAULT NULL COMMENT '直属上级员工ID(sys_user.id)'"},
            new String[]{"mentor_user_id", "BIGINT DEFAULT NULL COMMENT '导师员工ID(sys_user.id)'"});

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
            // 结构就绪后每次启动都跑一次稳定 ID 回填：它带 WHERE xxx IS NULL，天然幂等。
            // 投影必须可重建（方案 §7.1），而不只在建表那一刻补齐一次——那之后的历史补录就没人管了。
            backfillStableIds();
        } catch (Exception e) {
            log.error("雇佣期间结构迁移失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        createPeriodTable();
        addPositionColumns();
        Integer rows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + PERIOD_TABLE, Integer.class);
        log.info("雇佣期间结构已就绪: {}（当前 {} 行，历史段由 HR 核对差异清单后登记）",
                PERIOD_TABLE, rows == null ? 0 : rows);
    }

    private void createPeriodTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + PERIOD_TABLE + " ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "user_id BIGINT NOT NULL COMMENT '员工身份锚点(sys_user.id)，允许一人为多段雇佣', "
                        + "period_seq INT NOT NULL COMMENT '第几次雇佣，从1递增；重新入职开新段', "
                        + "employer_company VARCHAR(128) DEFAULT NULL COMMENT '雇主法人名称快照', "
                        + "employer_company_id BIGINT DEFAULT NULL COMMENT '雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY)', "
                        + "work_location VARCHAR(128) DEFAULT NULL COMMENT '工作地点名称快照', "
                        + "work_location_id BIGINT DEFAULT NULL COMMENT '工作地点字典ID(sys_hr_dict WORK_LOCATION)', "
                        + "employee_category VARCHAR(64) DEFAULT NULL COMMENT '人员类别(正式/实习/派遣/外包)', "
                        + "start_date DATE DEFAULT NULL COMMENT '真实入职日；来源必须看 start_date_source', "
                        + "start_date_source VARCHAR(24) NOT NULL DEFAULT 'POSITION_RECORD'"
                        + " COMMENT '入职日来源: POSITION_RECORD任职事实 / MANUAL人工确认 / UNVERIFIED未核实', "
                        + "probation_end_date DATE DEFAULT NULL COMMENT '试用期结束日', "
                        + "regular_date DATE DEFAULT NULL COMMENT '转正日期', "
                        + "end_date DATE DEFAULT NULL COMMENT '雇佣结束日(离职生效日)', "
                        + "end_reason VARCHAR(255) DEFAULT NULL COMMENT '雇佣结束原因快照', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE在职段 / ENDED已结束段', "
                        + "source_req_no VARCHAR(32) DEFAULT NULL COMMENT '产生本段的单据号', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        // 唯一键把 deleted 折进生成列（与考勤域同一范式）：软删后重新登记同一段不冲突
                        + "active_scope VARCHAR(40) GENERATED ALWAYS AS ("
                        + "CASE WHEN deleted = 0 THEN CONCAT(user_id, '-', period_seq) ELSE NULL END) STORED, "
                        + "UNIQUE KEY uk_period_active_scope (active_scope), "
                        + "KEY idx_period_user_status (user_id, status), "
                        + "CONSTRAINT ck_period_status CHECK (status IN ('ACTIVE', 'ENDED')), "
                        + "CONSTRAINT ck_period_start_source CHECK (start_date_source IN "
                        + "('POSITION_RECORD', 'MANUAL', 'UNVERIFIED')), "
                        // 在职段不允许带结束日：离职到期才改写，未来生效的离职绝不能提前把段关掉
                        + "CONSTRAINT ck_period_active_no_end CHECK (status <> 'ACTIVE' OR end_date IS NULL)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='雇佣期间(一人多段，重入职新开段)'");
    }

    private void addPositionColumns() {
        for (String[] column : POSITION_COLUMNS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, POSITION_TABLE, column[0]);
            if (exists != null && exists > 0) {
                continue;
            }
            jdbcTemplate.execute("ALTER TABLE " + POSITION_TABLE
                    + " ADD COLUMN " + column[0] + " " + column[1]);
        }
    }

    /**
     * 按名称回填稳定 ID，子查询里的 {@code HAVING COUNT(*) = 1} 是全部安全性所在：
     * 同名多条时该行整体不参与回填（留 NULL），绝不 MIN(id) 挑一个。
     * <p>上级/导师不在这里回填：姓名重名率高，且历史文本里可能写的是花名或「工号 姓名」，
     * 由写入端 {@code HrMasterDataResolver} 逐个判定即可。
     */
    private void backfillStableIds() {
        int depts = jdbcTemplate.update("UPDATE " + POSITION_TABLE + " r "
                + "JOIN (SELECT MIN(id) AS id, name FROM sys_department WHERE deleted = 0 "
                + "      GROUP BY name HAVING COUNT(*) = 1) d ON d.name = r.service_dept "
                + "SET r.dept_id = d.id WHERE r.deleted = 0 AND r.dept_id IS NULL "
                + "AND r.service_dept IS NOT NULL AND r.service_dept <> ''");
        int positions = jdbcTemplate.update("UPDATE " + POSITION_TABLE + " r "
                + "JOIN (SELECT MIN(id) AS id, name FROM sys_position WHERE deleted = 0 "
                + "      GROUP BY name HAVING COUNT(*) = 1) p ON p.name = r.position_name "
                + "SET r.position_id = p.id WHERE r.deleted = 0 AND r.position_id IS NULL "
                + "AND r.position_name IS NOT NULL AND r.position_name <> ''");
        int companies = jdbcTemplate.update("UPDATE " + POSITION_TABLE + " r "
                + "JOIN (SELECT MIN(id) AS id, name FROM sys_hr_dict WHERE deleted = 0 "
                + "      AND dict_type = 'EMPLOYER_COMPANY' GROUP BY name HAVING COUNT(*) = 1) c "
                + "ON c.name = r.company "
                + "SET r.employer_company_id = c.id WHERE r.deleted = 0 AND r.employer_company_id IS NULL "
                + "AND r.company IS NOT NULL AND r.company <> ''");
        int locations = jdbcTemplate.update("UPDATE " + POSITION_TABLE + " r "
                + "JOIN (SELECT MIN(id) AS id, name FROM sys_hr_dict WHERE deleted = 0 "
                + "      AND dict_type = 'WORK_LOCATION' GROUP BY name HAVING COUNT(*) = 1) l "
                + "ON l.name = r.work_city "
                + "SET r.work_location_id = l.id WHERE r.deleted = 0 AND r.work_location_id IS NULL "
                + "AND r.work_city IS NOT NULL AND r.work_city <> ''");
        log.info("任职记录稳定 ID 回填: 部门 {} 条、职位 {} 条、法人 {} 条、地点 {} 条（未命中留 NULL）",
                depts, positions, companies, locations);
    }

    private void verify() {
        if (jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, PERIOD_TABLE) == 0) {
            throw new IllegalStateException(PERIOD_TABLE + " 表未创建成功");
        }
        Integer unique = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_period_active_scope'",
                Integer.class, PERIOD_TABLE);
        if (unique == null || unique == 0) {
            throw new IllegalStateException(PERIOD_TABLE + " 缺唯一键 uk_period_active_scope"
                    + "（同一雇佣写两遍会让段数与任职时长口径全部失真）");
        }
        // 列名是代码常量（非外部输入）直接拼进 IN：绑参只能当一个字面量，IN (?) 永远不会命中多列
        String inList = POSITION_COLUMNS.stream().map(c -> "'" + c[0] + "'").collect(Collectors.joining(","));
        Integer columns = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (" + inList + ")",
                Integer.class, POSITION_TABLE);
        if (columns == null || columns < POSITION_COLUMNS.size()) {
            throw new IllegalStateException(POSITION_TABLE + " 稳定 ID 列未全部就绪（实际 "
                    + columns + "/" + POSITION_COLUMNS.size() + "）");
        }
    }
}
