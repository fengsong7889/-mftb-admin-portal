package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 人事通用字典初始化器（P1-A）：建 sys_hr_dict 表 + 幂等种子（雇主法人/人员类别/工作地点）。
 * <p>
 * 遵循迁移治理：{@code applyOnce(versionKey, task, verify)} —— 仅建表与校验都成功才记录版本；
 * 种子用 {@code INSERT IGNORE}（配合唯一键 uk_hr_dict_type_code）保证幂等与多副本并发安全。
 * 建表 DDL 幂等（CREATE TABLE IF NOT EXISTS）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrDictSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "hr:dict-schema-v1";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            // applyOnce 内部已写失败审计且不记版本；此处仅避免阻塞本地启动，下次启动会重试
            log.error("HR 字典建表/种子失败: {}", e.getMessage(), e);
        }
        // P1-A 追加：合同类型 / 工时制 纳入字典（新值键，已迁移环境下次启动会补种）
        try {
            versionTracker.applyOnce("hr:dict-type-extra-v1", this::seedExtraTypes, this::verifyExtraTypes);
        } catch (Exception e) {
            log.error("HR 字典(合同类型/工时制)种子失败: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        ensureDictTable();
        seed();
    }

    /** 建表（幂等），供基础迁移与追加类型种子共用 */
    private void ensureDictTable() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_hr_dict ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "dict_type VARCHAR(32) NOT NULL COMMENT '字典类型: EMPLOYER_COMPANY/WORK_LOCATION/EMPLOYEE_CATEGORY 等', "
                        + "code VARCHAR(64) NOT NULL COMMENT '稳定编码', "
                        + "name VARCHAR(128) NOT NULL COMMENT '名称', "
                        + "name_en VARCHAR(128) DEFAULT NULL COMMENT '英文名称', "
                        + "parent_code VARCHAR(64) DEFAULT NULL COMMENT '上级code(工作地点城市指向国家code)', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序(升序)', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        + "UNIQUE KEY uk_hr_dict_type_code (dict_type, code), "
                        + "KEY idx_hr_dict_type_status (dict_type, status)"
                        + ") COMMENT='HR人事通用字典'");
    }

    /** 幂等种子：{dictType, code, name, nameEn, parentCode, sortOrder} */
    private void seed() {
        String sql = "INSERT IGNORE INTO sys_hr_dict "
                + "(dict_type, code, name, name_en, parent_code, sort_order, status, created_by, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, 1, 'SYSTEM', 'SYSTEM')";
        Object[][] rows = {
                // 雇主法人（初始入驻现有两家硬编码公司，去除前端硬编码；真实法人由 HR 在字典维护）
                {"EMPLOYER_COMPANY", "SF-TECH", "珠海闪蜂科技有限公司", "Zhuhai Shanfeng Technology Co., Ltd.", null, 1},
                {"EMPLOYER_COMPANY", "MF-TECH", "珠海麦峰科技有限公司", "Zhuhai Maifeng Technology Co., Ltd.", null, 2},
                // 人员类别
                {"EMPLOYEE_CATEGORY", "REGULAR", "正式员工", "Regular Employee", null, 1},
                {"EMPLOYEE_CATEGORY", "INTERN", "实习生", "Intern", null, 2},
                {"EMPLOYEE_CATEGORY", "DISPATCH", "劳务派遣", "Labor Dispatch", null, 3},
                {"EMPLOYEE_CATEGORY", "OUTSOURCE", "外包", "Outsourced", null, 4},
                // 工作地点 - 国家/地区（parent_code 为空）
                {"WORK_LOCATION", "CN", "中国", "China", null, 1},
                {"WORK_LOCATION", "HK", "香港", "Hong Kong", null, 2},
                {"WORK_LOCATION", "MO", "澳门", "Macao", null, 3},
                {"WORK_LOCATION", "TW", "台湾", "Taiwan", null, 4},
                // 工作地点 - 中国主要城市（parent_code=CN，供 HR 按需增补）
                {"WORK_LOCATION", "CN-GUANGZHOU", "广州", "Guangzhou", "CN", 11},
                {"WORK_LOCATION", "CN-SHENZHEN", "深圳", "Shenzhen", "CN", 12},
                {"WORK_LOCATION", "CN-ZHUHAI", "珠海", "Zhuhai", "CN", 13},
                {"WORK_LOCATION", "CN-DONGGUAN", "东莞", "Dongguan", "CN", 14},
                {"WORK_LOCATION", "CN-FOSHAN", "佛山", "Foshan", "CN", 15},
                {"WORK_LOCATION", "CN-SHANGHAI", "上海", "Shanghai", "CN", 16},
                {"WORK_LOCATION", "CN-BEIJING", "北京", "Beijing", "CN", 17},
                {"WORK_LOCATION", "CN-HANGZHOU", "杭州", "Hangzhou", "CN", 18},
                {"WORK_LOCATION", "CN-NANJING", "南京", "Nanjing", "CN", 19},
                {"WORK_LOCATION", "CN-CHENGDU", "成都", "Chengdu", "CN", 20},
                {"WORK_LOCATION", "CN-WUHAN", "武汉", "Wuhan", "CN", 21},
                {"WORK_LOCATION", "CN-CHONGQING", "重庆", "Chongqing", "CN", 22},
                {"WORK_LOCATION", "CN-XIAMEN", "厦门", "Xiamen", "CN", 23},
        };
        for (Object[] r : rows) {
            jdbcTemplate.update(sql, r);
        }
    }

    /** 后置校验：表存在且关键类型已种子化，否则抛出不记版本 */
    private void verify() {
        Integer table = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_hr_dict'",
                Integer.class);
        if (table == null || table == 0) {
            throw new IllegalStateException("sys_hr_dict 表未就绪");
        }
        if (countByType("EMPLOYER_COMPANY") < 2) {
            throw new IllegalStateException("EMPLOYER_COMPANY 种子未就绪");
        }
        if (countByType("EMPLOYEE_CATEGORY") < 4) {
            throw new IllegalStateException("EMPLOYEE_CATEGORY 种子未就绪");
        }
    }

    private long countByType(String type) {
        Long c = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = ? AND deleted = 0", Long.class, type);
        return c == null ? 0L : c;
    }

    /** 追加种子：合同类型 / 工时制（值=名称，与既有硬编码存储一致，向后兼容） */
    private void seedExtraTypes() {
        ensureDictTable();
        String sql = "INSERT IGNORE INTO sys_hr_dict "
                + "(dict_type, code, name, name_en, parent_code, sort_order, status, created_by, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, 1, 'SYSTEM', 'SYSTEM')";
        Object[][] rows = {
                {"CONTRACT_TYPE", "LABOR", "劳动合同", "Labor Contract", null, 1},
                {"CONTRACT_TYPE", "LABOR_SERVICE", "劳务合同", "Service Contract", null, 2},
                {"CONTRACT_TYPE", "INTERN", "实习协议", "Internship Agreement", null, 3},
                {"CONTRACT_TYPE", "NON_COMPETE", "竞业协议", "Non-compete Agreement", null, 4},
                {"WORK_SYSTEM", "STANDARD", "标准工时制", "Standard Hours", null, 1},
                {"WORK_SYSTEM", "COMPREHENSIVE", "综合工时制", "Comprehensive Hours", null, 2},
                {"WORK_SYSTEM", "FLEXIBLE", "不定时工时制", "Flexible Hours", null, 3},
        };
        for (Object[] r : rows) {
            jdbcTemplate.update(sql, r);
        }
    }

    /** 后置校验：追加类型已种子化 */
    private void verifyExtraTypes() {
        if (countByType("CONTRACT_TYPE") < 4) {
            throw new IllegalStateException("CONTRACT_TYPE 种子未就绪");
        }
        if (countByType("WORK_SYSTEM") < 3) {
            throw new IllegalStateException("WORK_SYSTEM 种子未就绪");
        }
    }
}
