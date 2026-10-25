package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 人员档案扩展建表（C3 收口）：教育 / 履历 / 资质 / 奖惩。
 * <p>
 * 旧员工详情里这四类没有持久化模型（奖惩是空 state，教育/履历不存在），
 * 所以这里新建一张证据表，而不是"聚合只读"。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26)
public class HrProfileSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hcm:hr-profile-schema:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("人员档案扩展建表失败: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS hr_profile_item ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "person_id BIGINT NOT NULL COMMENT '人员ID', "
                        + "item_type VARCHAR(32) NOT NULL COMMENT 'EDUCATION/WORK/QUALIFICATION/REWARD/PUNISH', "
                        + "title VARCHAR(128) NOT NULL COMMENT '标题：学校/公司/证书/奖惩事项', "
                        + "org_name VARCHAR(128) DEFAULT NULL COMMENT '机构：学校/公司/发证机构', "
                        + "role_title VARCHAR(128) DEFAULT NULL COMMENT '专业/职位/等级', "
                        + "cert_no VARCHAR(64) DEFAULT NULL COMMENT '证书编号', "
                        + "start_date DATE DEFAULT NULL COMMENT '开始日期', "
                        + "end_date DATE DEFAULT NULL COMMENT '结束日期（空=至今/长期）', "
                        + "evidence_url VARCHAR(500) DEFAULT NULL COMMENT '证据地址', "
                        + "evidence_name VARCHAR(128) DEFAULT NULL COMMENT '证据文件名', "
                        + "verify_status TINYINT NOT NULL DEFAULT 0 COMMENT '0=待核实 1=已核实', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        + "KEY idx_hr_profile_person (person_id, item_type), "
                        + "CONSTRAINT fk_hr_profile_person FOREIGN KEY (person_id) REFERENCES person (id), "
                        + "CONSTRAINT ck_hr_profile_period CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)"
                        + ") COMMENT='人员档案扩展项'");
    }

    private void verify() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_item'",
                Integer.class);
        if (exists == null || exists == 0) {
            throw new IllegalStateException("hr_profile_item 表未就绪");
        }
    }
}
