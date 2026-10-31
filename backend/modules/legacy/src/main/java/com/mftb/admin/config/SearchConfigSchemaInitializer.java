package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;

/**
 * 搜索运营系统 · 配置管理域建表初始化器（方案 §11.1）。
 * <p>
 * 启动期幂等创建 5 张配置表（引导词/词库/场景策略/商家干预/配置发布），走统一迁移框架：
 * {@code migrationLock.runExclusive} 串行化多副本 DDL，{@code applyOnce(key, task, verify)}
 * 只有「建表任务成功且后置校验通过」才记版本；失败上抛、不记录、下次启动重试（严禁吞异常）。
 * <p>
 * 参考文档：backend/sql/319_search_config.sql。真实 ES 索引、投流交付账本属 B1/B3，不在本批。
 */
@Slf4j
@Component
@Order(60)
@RequiredArgsConstructor
public class SearchConfigSchemaInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final MigrationLock migrationLock;

    /** 版本键：结构变更递增 major，增量补列/种子递增 minor。 */
    static final String VERSION_KEY = "search:config-tables-v1.0";

    /**
     * 增量版本：为五个配置域补「名称」权威字段（方案 §11.1 定版，参考 sql/320_search_config_name.sql）。
     * 干预域的 target_name 是「被干预对象名」，与表单的规则名稱语义不同，故另补 rule_name。
     */
    static final String NAME_VERSION_KEY = "search:config-name-v1.1";

    /** 需补名称列的表及其列名与 DDL；与 CREATE_STATEMENTS 中的 {@code *_no} 命名成套。 */
    static final String[][] NAME_COLUMNS = {
            {"biz_search_guidance", "config_name",
                    "ALTER TABLE biz_search_guidance ADD COLUMN config_name VARCHAR(60) DEFAULT NULL COMMENT '配置名称(人类可读标识,服务层强制必填)'"},
            {"biz_search_lexicon", "entry_name",
                    "ALTER TABLE biz_search_lexicon ADD COLUMN entry_name VARCHAR(60) DEFAULT NULL COMMENT '词条名称(人类可读标识,服务层强制必填)'"},
            {"biz_search_scenario", "scenario_name",
                    "ALTER TABLE biz_search_scenario ADD COLUMN scenario_name VARCHAR(60) DEFAULT NULL COMMENT '策略名称(人类可读标识,服务层强制必填)'"},
            {"biz_search_intervention", "rule_name",
                    "ALTER TABLE biz_search_intervention ADD COLUMN rule_name VARCHAR(60) DEFAULT NULL COMMENT '干预规则名称(人类可读标识,与target_name语义不同)'"},
            {"biz_search_release", "release_name",
                    "ALTER TABLE biz_search_release ADD COLUMN release_name VARCHAR(60) DEFAULT NULL COMMENT '版本名称(人类可读标识,服务层强制必填)'"},
    };

    /** 配置管理域全部表；后置校验逐一确认存在，缺任一即视为未就绪。 */
    static final String[] TABLES = {
            "biz_search_guidance", "biz_search_lexicon", "biz_search_scenario",
            "biz_search_intervention", "biz_search_release",
    };

    /** 启动期自动执行：纳入迁移命名锁与就绪门禁；单测可直接调 migrate() 验证建表+校验。 */
    @Override
    public void run(String... args) {
        migrate();
    }

    public void migrate() {
        String schema = jdbcTemplate.queryForObject("SELECT DATABASE()", String.class);
        migrationLock.runExclusive("mftb:schema:" + schema, 120, () -> {
            versionTracker.applyOnce(VERSION_KEY, this::createTables, this::verifyTables);
            // 建表 DDL 不含名称列，因此存量库与新建库统一经由本增量获得名称列。
            versionTracker.applyOnce(NAME_VERSION_KEY, this::addNameColumns, this::verifyNameColumns);
        });
    }

    /** 幂等补列：先查 INFORMATION_SCHEMA（MySQL 不支持 ADD COLUMN IF NOT EXISTS），缺列才 ALTER；失败上抛不吞异常。 */
    private void addNameColumns() {
        log.info("开始为搜索配置域补「名称」权威字段");
        for (String[] column : NAME_COLUMNS) {
            if (columnExists(column[0], column[1])) {
                log.info("搜索配置列已存在，跳过: {}.{}", column[0], column[1]);
                continue;
            }
            jdbcTemplate.execute(column[2]);
        }
    }

    private void verifyNameColumns() {
        for (String[] column : NAME_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                throw new IllegalStateException("搜索配置名称列未就绪: " + column[0] + "." + column[1]);
            }
        }
        log.info("搜索配置域名称列就绪: {} 列", NAME_COLUMNS.length);
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private void createTables() {
        log.info("开始创建搜索配置管理域表结构");
        for (String ddl : CREATE_STATEMENTS) {
            jdbcTemplate.execute(ddl);
        }
    }

    private void verifyTables() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException("搜索配置表未就绪: " + table);
            }
        }
        log.info("搜索配置管理域表结构就绪: {} 张", TABLES.length);
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    /** 与 backend/sql/319_search_config.sql 等价的内联建表 DDL（CREATE TABLE IF NOT EXISTS 幂等）。 */
    private static final String[] CREATE_STATEMENTS = {
        "CREATE TABLE IF NOT EXISTS biz_search_guidance ("
        + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
        + "config_no VARCHAR(32) NOT NULL COMMENT '配置编号',"
        + "word_type INT NOT NULL COMMENT '1=底纹词 2=自然热搜 3=推广搜索 4=候选热词',"
        + "display_text VARCHAR(64) NOT NULL COMMENT '展示词',"
        + "target_query VARCHAR(64) NOT NULL COMMENT '点击后提交的搜索词',"
        + "brand VARCHAR(32) COMMENT 'APP 品牌: flashBee/mFood',"
        + "surface INT NOT NULL DEFAULT 1 COMMENT '1=首页 2=频道 3=店内',"
        + "biz_channel INT COMMENT '1=美食外卖 2=超市百货 3=团购到店',"
        + "region_code VARCHAR(32) COMMENT '区域编码(空=全城)',"
        + "priority INT NOT NULL DEFAULT 1 COMMENT '展示次序',"
        + "source INT NOT NULL DEFAULT 1 COMMENT '1=人工 2=趋势 3=商业计划',"
        + "start_date DATE, end_date DATE,"
        + "approval_status INT NOT NULL DEFAULT 1 COMMENT '1=未审批 2=已审批 3=驳回',"
        + "status INT NOT NULL DEFAULT 1 COMMENT '1=启用 2=停用',"
        + "remark VARCHAR(255), created_by VARCHAR(64), updated_by VARCHAR(64),"
        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        + "deleted TINYINT DEFAULT 0,"
        + "UNIQUE KEY uk_search_guidance_no (config_no),"
        + "KEY idx_search_guidance_type (word_type, status),"
        + "KEY idx_search_guidance_scope (brand, surface, biz_channel)"
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索引导配置'",

        "CREATE TABLE IF NOT EXISTS biz_search_lexicon ("
        + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
        + "entry_no VARCHAR(32) NOT NULL,"
        + "word_type INT NOT NULL COMMENT '1=业务词 2=实体别名 3=有向同义 4=纠错 5=禁限',"
        + "source_term VARCHAR(64) NOT NULL COMMENT '原词/别名',"
        + "target_term VARCHAR(64) NOT NULL COMMENT '标准词/实体',"
        + "entity_id BIGINT, entity_type INT COMMENT '1=门店 2=集团 3=品牌',"
        + "category_id VARCHAR(32), brand VARCHAR(32), evidence VARCHAR(255),"
        + "status INT NOT NULL DEFAULT 1,"
        + "created_by VARCHAR(64), updated_by VARCHAR(64),"
        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        + "deleted TINYINT DEFAULT 0,"
        + "UNIQUE KEY uk_search_lexicon_no (entry_no),"
        + "KEY idx_search_lexicon_term (source_term, word_type)"
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索词库'",

        "CREATE TABLE IF NOT EXISTS biz_search_scenario ("
        + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
        + "scenario_no VARCHAR(32) NOT NULL,"
        + "surface INT NOT NULL COMMENT '1=首页 2=频道 3=店内',"
        + "biz_channel INT, object_type INT COMMENT '1=商家 2=商品 3=套餐',"
        + "weight_relevance INT NOT NULL DEFAULT 65,"
        + "weight_quality INT NOT NULL DEFAULT 15,"
        + "weight_distance INT NOT NULL DEFAULT 15,"
        + "weight_heat INT NOT NULL DEFAULT 5,"
        + "candidate_window INT NOT NULL DEFAULT 200,"
        + "ad_limit_per_page INT NOT NULL DEFAULT 0 COMMENT '首屏广告上限(店内=0)',"
        + "filter_rule TEXT COMMENT '过滤/排序规则(JSON)',"
        + "status INT NOT NULL DEFAULT 1,"
        + "created_by VARCHAR(64), updated_by VARCHAR(64),"
        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        + "deleted TINYINT DEFAULT 0,"
        + "UNIQUE KEY uk_search_scenario_no (scenario_no),"
        + "KEY idx_search_scenario_scope (surface, biz_channel)"
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索场景策略'",

        "CREATE TABLE IF NOT EXISTS biz_search_intervention ("
        + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
        + "rule_no VARCHAR(32) NOT NULL,"
        + "target_type INT NOT NULL COMMENT '1=集团 2=门店',"
        + "target_id VARCHAR(64) NOT NULL, target_name VARCHAR(128),"
        + "action_type INT NOT NULL COMMENT '1=泛词降权 2=精确准入 3=扶持 4=打散',"
        + "scope_terms VARCHAR(255), exact_terms VARCHAR(255),"
        + "multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '干预乘数 B(0.30~1.20)',"
        + "region_code VARCHAR(32), surface INT, biz_channel INT,"
        + "reason VARCHAR(255) NOT NULL COMMENT '干预原因(必填)',"
        + "start_date DATE NOT NULL, end_date DATE NOT NULL COMMENT '到期自动失效',"
        + "approval_status INT NOT NULL DEFAULT 1, approver VARCHAR(64),"
        + "status INT NOT NULL DEFAULT 1,"
        + "created_by VARCHAR(64), updated_by VARCHAR(64),"
        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        + "deleted TINYINT DEFAULT 0,"
        + "UNIQUE KEY uk_search_intervention_no (rule_no),"
        + "KEY idx_search_intervention_target (target_type, target_id, action_type)"
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索商家干预规则'",

        "CREATE TABLE IF NOT EXISTS biz_search_release ("
        + "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
        + "version_no VARCHAR(32) NOT NULL,"
        + "change_summary VARCHAR(500) NOT NULL,"
        + "snapshot LONGTEXT COMMENT '发布快照(JSON)',"
        + "checksum VARCHAR(64),"
        + "status INT NOT NULL DEFAULT 0 COMMENT '0草稿 1待审 2批准 3待生效 4生效 5替代 6回滚',"
        + "rollback_version VARCHAR(32), approver VARCHAR(64),"
        + "approve_time DATETIME, published_at DATETIME,"
        + "created_by VARCHAR(64), updated_by VARCHAR(64),"
        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        + "deleted TINYINT DEFAULT 0,"
        + "UNIQUE KEY uk_search_release_no (version_no),"
        + "KEY idx_search_release_status (status)"
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索配置发布版本'",
    };
}
