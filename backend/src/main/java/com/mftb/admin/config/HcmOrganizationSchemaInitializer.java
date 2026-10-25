package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 組織編制系統（organization）結構與法人主體回填初始化器。
 * <p>
 * 做三件事：
 * <ol>
 *   <li>建 {@code org_legal_entity} / {@code org_unit} 兩張主數據表（{@code CREATE TABLE IF NOT EXISTS}）；</li>
 *   <li>把舊字典 {@code sys_hr_dict.EMPLOYER_COMPANY} 的法人遷入 {@code org_legal_entity}，
 *       一律標 {@code verify_status=0}（待核實）——舊字典沒有法域與登記證照，不能冒充已核實事實；</li>
 *   <li>後置校驗：表存在且回填條數與字典條數一致，否則不記版本、下次啟動重試。</li>
 * </ol>
 * 為什麼結構變更寫成 Java Initializer 而不是只放 SQL 文件：{@code backend/sql/**} 僅作參照文檔，
 * 只有登記在 {@code catalog.json} 並由啟動期執行的遷移才會真正落庫（方案 13.6）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(24)
public class HcmOrganizationSchemaInitializer implements CommandLineRunner {

    /** 建表版本鍵（MODULE_STRUCTURE） */
    static final String VERSION_KEY_SCHEMA = "hcm:org-schema:v1.0";

    /** 舊字典法人回填版本鍵（DATA_MIGRATION） */
    static final String VERSION_KEY_LEGAL_BACKFILL = "hcm:org-legal-backfill:v1.0";

    /** 職位體系建表版本鍵（MODULE_STRUCTURE，第二批） */
    static final String VERSION_KEY_JOB_SCHEMA = "hcm:org-schema:v1.1";

    /** 崗位與編制建表版本鍵（MODULE_STRUCTURE，第三批） */
    static final String VERSION_KEY_POSITION_SCHEMA = "hcm:org-schema:v1.2";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY_SCHEMA, this::migrateSchema, this::verifySchema);
        } catch (Exception e) {
            log.error("組織編制建表失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_KEY_LEGAL_BACKFILL, this::backfillLegalEntities, this::verifyBackfill);
        } catch (Exception e) {
            log.error("組織編制法人口徑回填失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_KEY_JOB_SCHEMA, this::migrateJobSchema, this::verifyJobSchema);
        } catch (Exception e) {
            log.error("職位體系建表失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_KEY_POSITION_SCHEMA, this::migratePositionSchema, this::verifyPositionSchema);
        } catch (Exception e) {
            log.error("崗位編制建表失敗: {}", e.getMessage(), e);
        }
    }

    private void migrateSchema() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS org_legal_entity ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '法人編碼（穩定業務鍵）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '法人全稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "jurisdiction VARCHAR(8) NOT NULL DEFAULT 'CN' COMMENT '法域 CN/HK/MO', "
                        + "registration_no VARCHAR(64) DEFAULT NULL COMMENT '登記證照號', "
                        + "registered_address VARCHAR(255) DEFAULT NULL COMMENT '註冊地址', "
                        + "verify_status TINYINT NOT NULL DEFAULT 0 COMMENT '核實狀態 0=待核實 1=已核實', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_org_legal_code (code), "
                        + "KEY idx_org_legal_status (status, jurisdiction)"
                        + ") COMMENT='組織編制-法人主體'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS org_unit ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '組織編碼（穩定業務鍵）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '組織名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "parent_id BIGINT DEFAULT NULL COMMENT '上級組織ID（頂級為 NULL）', "
                        + "legal_entity_id BIGINT NOT NULL COMMENT '所屬法人ID', "
                        + "unit_type VARCHAR(32) NOT NULL DEFAULT 'DEPARTMENT' COMMENT 'COMPANY/DEPARTMENT/BUSINESS_UNIT', "
                        + "leader_name VARCHAR(64) DEFAULT NULL COMMENT '負責人姓名（人員主檔就緒前）', "
                        + "path VARCHAR(255) DEFAULT NULL COMMENT '物化祖先路徑 /1/5/9', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '同級排序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_org_unit_code (code), "
                        + "KEY idx_org_unit_parent (parent_id), "
                        + "KEY idx_org_unit_legal (legal_entity_id), "
                        + "KEY idx_org_unit_path (path), "
                        + "CONSTRAINT fk_org_unit_legal FOREIGN KEY (legal_entity_id) REFERENCES org_legal_entity (id)"
                        + ") COMMENT='組織編制-管理組織'");
    }



    /** 崗位與編制：崗位掛組織與職位，核定編制數本期只做預算，佔用等 C2 的任職事實 */
    private void migratePositionSchema() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS org_position ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '崗位編碼（穩定業務鍵）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '崗位名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "unit_id BIGINT NOT NULL COMMENT '所屬組織ID', "
                        + "job_grade_id BIGINT NOT NULL COMMENT '職位職級ID', "
                        + "headcount INT NOT NULL DEFAULT 0 COMMENT '核定編制數（0=未核定）', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_org_position_code (code), "
                        + "KEY idx_org_position_unit (unit_id), "
                        + "KEY idx_org_position_grade (job_grade_id), "
                        + "CONSTRAINT fk_org_position_unit FOREIGN KEY (unit_id) REFERENCES org_unit (id), "
                        + "CONSTRAINT fk_org_position_grade FOREIGN KEY (job_grade_id) REFERENCES org_job_grade (id), "
                        + "CONSTRAINT ck_org_position_headcount CHECK (headcount >= 0)"
                        + ") COMMENT='組織編制-崗位實例'");
    }

    private void verifyPositionSchema() {
        requireTable("org_position");
    }

    /** 職位體系：職務族 + 職位職級（職位離不開族，族刪不掉有職位的行） */
    private void migrateJobSchema() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS org_job_family ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '職務族編碼（穩定業務鍵）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '職務族名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_org_job_family_code (code), "
                        + "KEY idx_org_job_family_status (status)"
                        + ") COMMENT='組織編制-職務族'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS org_job_grade ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                        + "code VARCHAR(32) NOT NULL COMMENT '職位編碼（穩定業務鍵）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '職位名稱', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名稱', "
                        + "job_family_id BIGINT NOT NULL COMMENT '所屬職務族ID', "
                        + "grade_level INT NOT NULL DEFAULT 1 COMMENT '職級序號（同族內越大越高）', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '備註', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "UNIQUE KEY uk_org_job_grade_code (code), "
                        + "KEY idx_org_job_grade_family (job_family_id, grade_level), "
                        + "CONSTRAINT fk_org_job_grade_family FOREIGN KEY (job_family_id) REFERENCES org_job_family (id)"
                        + ") COMMENT='組織編制-職位職級'");
    }

    private void verifyJobSchema() {
        requireTable("org_job_family");
        requireTable("org_job_grade");
    }

    /**
     * 舊字典法人回填：只搬「穩定編碼 + 名稱」，法域暫按內地、核實狀態待核實。
     * <p>用 {@code INSERT IGNORE} 配合 uk_org_legal_code：已存在的法人在授權中心維護過後不會被覆蓋。
     */
    private void backfillLegalEntities() {
        Integer dictCount = countEmployerDict();
        if (dictCount == null || dictCount == 0) {
            log.info("sys_hr_dict 無 EMPLOYER_COMPANY 種子，跳過法人回填");
            return;
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO org_legal_entity "
                        + "(code, name, name_en, jurisdiction, verify_status, status, sort_order, remark, updated_by) "
                        + "SELECT CONCAT('LEGACY-', d.code), d.name, d.name_en, 'CN', 0, 1, d.sort_order, "
                        + "'由人事字典 EMPLOYER_COMPANY 回填，待核實法域與登記證照', 'system-backfill' "
                        + "FROM sys_hr_dict d WHERE d.dict_type = 'EMPLOYER_COMPANY' AND d.deleted = 0");
        log.info("組織編制法人口徑已回填：字典 {} 條", dictCount);
    }

    private Integer countEmployerDict() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = 'EMPLOYER_COMPANY' AND deleted = 0",
                Integer.class);
    }

    private void verifySchema() {
        requireTable("org_legal_entity");
        requireTable("org_unit");
    }

    private void verifyBackfill() {
        Integer dictCount = countEmployerDict();
        if (dictCount == null || dictCount == 0) {
            return;
        }
        Integer legalCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM org_legal_entity WHERE deleted = 0", Integer.class);
        // 只要求「字典条数都迁到了」，不要求整体条数相等：管理员可能另行手工新建法人
        if (legalCount == null || legalCount < dictCount) {
            throw new IllegalStateException("法人回填未完成: 字典 " + dictCount + " 條，法人表 " + legalCount + " 條");
        }
    }

    private void requireTable(String tableName) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, tableName);
        if (exists == null || exists == 0) {
            throw new IllegalStateException(tableName + " 表未就緒");
        }
    }
}
