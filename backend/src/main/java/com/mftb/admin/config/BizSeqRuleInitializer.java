package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 编号生成规则初始化器: 启动时自动创建 sys_biz_seq_rule 规则表并写入种子规则
 * <p>
 * 与 {@link BizDataInitializer} 同模式: 幂等可重复执行, 免手动跑 SQL 脚本
 * (对应脚本 backend/sql/33_biz_seq_rule.sql)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BizSeqRuleInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        createRuleTableIfAbsent();
        seedRules();
        ensureBizCodeColumns();
        backfillPositionCodes();
    }

    /** 编号生成规则配置表 */
    private void createRuleTableIfAbsent() {
        if (tableExists("sys_biz_seq_rule")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_biz_seq_rule ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "rule_key VARCHAR(64) NOT NULL COMMENT '规则唯一标识（与前端 key 一致）', "
                        + "rule_name VARCHAR(64) NOT NULL COMMENT '业务类型名称', "
                        + "biz_menu VARCHAR(64) NULL COMMENT '所属菜单', "
                        + "prefix VARCHAR(16) NOT NULL COMMENT '编号前缀', "
                        + "date_format VARCHAR(16) NOT NULL DEFAULT '' COMMENT '日期格式: YYYYMMDD / YYMM / 空=无日期维度', "
                        + "seq_length INT NOT NULL DEFAULT 4 COMMENT '自增序号位数', "
                        + "seq_start INT NOT NULL DEFAULT 0 COMMENT '序号起始: 0=从0000起 1=从0001起', "
                        + "remark VARCHAR(255) NULL COMMENT '备注', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_seq_rule_key (rule_key), "
                        + "UNIQUE KEY uk_seq_rule_prefix (prefix)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='编号生成规则配置表'");
        log.info("已自动创建编号生成规则配置表 sys_biz_seq_rule");
    }

    /** 种子规则: 与前端「规则配置 > 编号生成规则」界面一致 (按 rule_key 幂等) */
    private void seedRules() {
        String[][] rules = {
                /* rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark */
                {"merchant_group", "集團ID", "商戶集團管理", "JT", "", "6", "1", "{prefix} + {n}位自增序號（取表內最大序號+1）"},
                {"store", "門店ID", "商戶集團管理", "MD", "", "6", "1", "{prefix} + {n}位固定序號（無日期維度，全局自增）"},
                {"algo_star", "無敵星星算法ID", "算法庫", "SFWD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_new_store", "新店廣告算法ID", "算法庫", "SFXD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_revive", "盤活復蘇算法ID", "算法庫", "SFPH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_traffic", "流量廣告算法ID", "算法庫", "SFLL", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_popular", "人氣商家算法ID", "算法庫", "SFRQ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_exclusive", "獨家商家算法ID", "算法庫", "SFDJ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_guess", "猜你喜歡算法ID", "算法庫", "SFXH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_organic", "自然流量算法ID", "算法庫", "SFZR", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_brand", "品牌商家算法ID", "算法庫", "SFPP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_gold", "點金廣告算法ID", "算法庫", "SFJD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_signboard", "金字招牌算法ID", "算法庫", "SFJZ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_promo", "商品促銷算法ID", "算法庫", "SFSP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_waterfall", "瀑布流策略", "瀑布流配置", "PB", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_star", "無敵星星訂單", "廣告銷售", "DDWD", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_new_store", "新店廣告訂單", "廣告銷售", "DDXD", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_revive", "盤活復蘇訂單", "廣告銷售", "DDPH", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_traffic", "流量廣告訂單", "廣告銷售", "DDLL", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_popular", "人氣商家訂單", "廣告銷售", "DDRQ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_star", "無敵星星定價", "廣告銷售", "DJWD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_hot", "人氣商家定價", "廣告銷售", "DJRQ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_revive", "盤活復蘇定價", "廣告銷售", "DJPH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_signboard", "金字招牌定價", "廣告銷售", "DJZP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_new_store", "新店廣告贈送ID", "推廣贈送", "XDZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_popular", "人氣商家贈送ID", "推廣贈送", "RQZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_revive", "盤活復蘇贈送ID", "推廣贈送", "PHZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_recharge", "充值批次", "批次查詢", "CZPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_transfer", "轉賬批次", "批次查詢", "ZZPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_merge", "合併批次", "批次查詢", "HBPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"detail", "交易明細編號", "明細查詢", "MX", "YYYYMMDD", "6", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"debt", "欠款單編號", "欠款對賬", "QK", "YYYYMMDD", "5", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"recharge", "充值流程編號", "審批中心", "CZ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"deduct", "扣款流程編號", "審批中心", "KK", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"transfer", "轉賬流程編號", "審批中心", "ZZ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"merge", "合併流程編號", "審批中心", "HB", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_approval", "贈送流程編號", "審批中心", "ZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"employee_no", "工號", "員工管理", "MF", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
                {"dept_code", "部門編碼", "組織管理", "BM", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
                {"position_id", "職位ID", "職位管理", "ZW", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
        };
        int inserted = 0;
        for (String[] r : rules) {
            inserted += jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_biz_seq_rule "
                            + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    r[0], r[1], r[2], r[3], r[4], Integer.parseInt(r[5]), Integer.parseInt(r[6]), r[7]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条编号生成规则种子数据", inserted);
        }
    }

    /** 业务表补充编号字段（存量库无需手动跑 ALTER） */
    private void ensureBizCodeColumns() {
        ensureColumn("biz_ad_waterfall", "strategy_code",
                "VARCHAR(32) NULL COMMENT '策略编号（按编号生成规则 config_waterfall 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_star", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_star 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_hot", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_hot 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_revive", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_revive 生成）' AFTER id");
        ensureColumn("sys_position", "code",
                "VARCHAR(32) NULL COMMENT '职位ID（按编号生成规则 position_id 生成）' AFTER id");
    }

    /** 存量职位回填职位ID（规则 position_id，取表内最大序号+1，仅处理空值，幂等） */
    private void backfillPositionCodes() {
        if (!tableExists("sys_position") || !columnExists("sys_position", "code")) {
            return;
        }
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_position WHERE code IS NULL OR code = '' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Map<String, Object> rule = jdbcTemplate.queryForMap(
                "SELECT prefix, seq_length FROM sys_biz_seq_rule WHERE rule_key = 'position_id'");
        String prefix = (String) rule.get("prefix");
        int seqLength = ((Number) rule.get("seq_length")).intValue();
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(code, " + (prefix.length() + 1) + ") AS UNSIGNED)), 0) "
                        + "FROM sys_position WHERE code REGEXP ?",
                Integer.class, "^" + prefix + "[0-9]+$");
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            jdbcTemplate.update("UPDATE sys_position SET code = ? WHERE id = ?",
                    String.format("%s%0" + seqLength + "d", prefix, ++seq), id);
        }
        log.info("已为 {} 个存量职位回填职位ID（{} 前缀）", ids.size(), prefix);
    }

    /** 表不存在时跳过（表由各自脚本/初始化器创建），列不存在时追加 */
    private void ensureColumn(String table, String column, String definition) {
        if (!tableExists(table) || columnExists(table, column)) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        log.info("已为表 {} 补充编号字段 {}", table, column);
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
