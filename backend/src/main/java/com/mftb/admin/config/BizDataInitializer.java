package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 业务数据初始化器: 启动时自动创建商户集团/门店/赠送管理相关表并写入种子数据
 * <p>
 * 与 {@link DataInitializer} 同模式: 幂等可重复执行, 免手动跑 SQL 脚本
 * (对应脚本 backend/sql/05_merchant_group_store.sql)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BizDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        createMerchantGroupTableIfAbsent();
        createStoreTableIfAbsent();
        createStoreBdTableIfAbsent();
        createGiftRecordTableIfAbsent();
        createGiftConsumeTableIfAbsent();
        migrateLegacyGroupCodes();
        migrateLegacyStoreCodes();
        migrateLegacyBizChannels();
        seedMerchantGroups();
        seedStores();
        seedGiftRecords();
        seedGiftConsumes();
    }

    /** 存量集团ID迁移: 非 JT+6位数字 格式的编号按 id 顺序重编为 JT 序列 */
    private void migrateLegacyGroupCodes() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM biz_merchant_group WHERE group_code NOT REGEXP '^JT[0-9]{6}$' ORDER BY id",
                Long.class);
        if (ids.isEmpty()) {
            return;
        }
        int seq = maxCodeSeq("biz_merchant_group", "group_code", "JT");
        for (Long id : ids) {
            jdbcTemplate.update("UPDATE biz_merchant_group SET group_code = ? WHERE id = ?",
                    String.format("JT%06d", ++seq), id);
        }
        log.info("已将 {} 条存量集团ID迁移为 JT 自增序列", ids.size());
    }

    /** 存量门店ID迁移: 非 MD+5位数字 格式的编号按 id 顺序重编为 MD 序列 */
    private void migrateLegacyStoreCodes() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM biz_store WHERE store_code NOT REGEXP '^MD[0-9]{5}$' ORDER BY id",
                Long.class);
        if (ids.isEmpty()) {
            return;
        }
        int seq = maxCodeSeq("biz_store", "store_code", "MD");
        for (Long id : ids) {
            jdbcTemplate.update("UPDATE biz_store SET store_code = ? WHERE id = ?",
                    String.format("MD%05d", ++seq), id);
        }
        log.info("已将 {} 条存量门店ID迁移为 MD 自增序列", ids.size());
    }

    /** 存量业务频道迁移: 中文文本值改为全局统一枚举码 (1=美食外卖 2=超市百货 3=团购到店) */
    private void migrateLegacyBizChannels() {
        int updated = 0;
        updated += jdbcTemplate.update(
                "UPDATE biz_store SET biz_channel = REPLACE(biz_channel, '美食外賣', '1') "
                        + "WHERE biz_channel LIKE '%美食外賣%'");
        updated += jdbcTemplate.update(
                "UPDATE biz_store SET biz_channel = REPLACE(biz_channel, '超市百貨', '2') "
                        + "WHERE biz_channel LIKE '%超市百貨%'");
        updated += jdbcTemplate.update(
                "UPDATE biz_store SET biz_channel = REPLACE(biz_channel, '團購到店', '3') "
                        + "WHERE biz_channel LIKE '%團購到店%'");
        if (updated > 0) {
            log.info("已将 {} 条存量门店业务频道迁移为统一枚举码", updated);
        }
    }

    /** 取指定前缀编号的当前最大序号 (前缀固定 2 位) */
    private int maxCodeSeq(String table, String column, String prefix) {
        Integer max = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(" + column + ", 3) AS UNSIGNED)), 0) FROM " + table
                        + " WHERE " + column + " REGEXP '^" + prefix + "[0-9]+$'",
                Integer.class);
        return max == null ? 0 : max;
    }

    /** 商户集团表 */
    private void createMerchantGroupTableIfAbsent() {
        if (tableExists("biz_merchant_group")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_merchant_group ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "group_code VARCHAR(32) NOT NULL COMMENT '集团ID（系统自增，如 JT000001）', "
                        + "group_name VARCHAR(128) NOT NULL COMMENT '集团名称', "
                        + "login_account VARCHAR(64) NULL COMMENT '登录主账号', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除: 0=未删除 1=已删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_group_code (group_code)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商户集团表'");
        log.info("已自动创建商户集团表 biz_merchant_group");
    }

    /** 门店表 */
    private void createStoreTableIfAbsent() {
        if (tableExists("biz_store")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_store ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "group_id BIGINT NOT NULL COMMENT '所属集团ID (关联 biz_merchant_group.id)', "
                        + "store_code VARCHAR(32) NOT NULL COMMENT '门店ID（系统自增，如 MD00001）', "
                        + "store_name VARCHAR(128) NOT NULL COMMENT '门店名称', "
                        + "brand VARCHAR(64) NULL COMMENT '所属品牌: flashBee / mFood / flashBee,mFood', "
                        + "biz_channel VARCHAR(128) NULL COMMENT '业务频道（可多选逗号分隔）', "
                        + "login_account VARCHAR(64) NULL COMMENT '登录主账号', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "KEY idx_store_group (group_id), "
                        + "UNIQUE KEY uk_store_code (store_code)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表'");
        log.info("已自动创建门店表 biz_store");
    }

    /** 门店绑定BD关系表（一家门店可绑定多个BD） */
    private void createStoreBdTableIfAbsent() {
        if (tableExists("biz_store_bd")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_store_bd ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键', "
                        + "store_id BIGINT NOT NULL COMMENT '门店主键 (关联 biz_store.id)', "
                        + "bd_emp_id VARCHAR(32) NOT NULL COMMENT 'BD员工工号 (关联 sys_user.emp_id)', "
                        + "bd_name VARCHAR(64) NULL COMMENT 'BD员工姓名快照', "
                        + "created_by VARCHAR(64) NULL COMMENT '绑定人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间', "
                        + "UNIQUE KEY uk_store_bd (store_id, bd_emp_id), "
                        + "KEY idx_bd_emp (bd_emp_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店绑定BD关系表'");
        log.info("已自动创建门店绑定BD关系表 biz_store_bd");
    }

    /** 赠送记录表 */
    private void createGiftRecordTableIfAbsent() {
        if (tableExists("biz_gift_record")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_gift_record ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "gift_id VARCHAR(32) NOT NULL COMMENT '赠送ID（业务生成，如 2401-001）', "
                        + "group_id BIGINT NOT NULL COMMENT '集团ID', "
                        + "group_name VARCHAR(128) NULL COMMENT '集团名称快照', "
                        + "store_id BIGINT NOT NULL COMMENT '门店ID', "
                        + "store_name VARCHAR(128) NULL COMMENT '门店名称快照', "
                        + "brand VARCHAR(32) NULL COMMENT '品牌', "
                        + "ad_type VARCHAR(32) NOT NULL COMMENT '广告类型: new_store/revival/exclusive/gold/ka', "
                        + "total_days INT NOT NULL COMMENT '赠送总天数', "
                        + "valid_days INT NOT NULL COMMENT '有效天数', "
                        + "used_days INT DEFAULT 0 COMMENT '已使用天数', "
                        + "remaining_days INT NOT NULL COMMENT '剩余天数', "
                        + "gift_date DATE NULL COMMENT '赠送日期', "
                        + "expire_date DATE NULL COMMENT '到期日期', "
                        + "status TINYINT DEFAULT 1 COMMENT '状态: 1=可用 2=已用完 3=已过期', "
                        + "reason VARCHAR(500) NULL COMMENT '赠送原因', "
                        + "credentials TEXT NULL COMMENT '凭证URL JSON数组', "
                        + "approval_no VARCHAR(64) NULL COMMENT '审批流程编号', "
                        + "applicant VARCHAR(64) NULL COMMENT '申请人', "
                        + "apply_time DATETIME NULL COMMENT '申请时间', "
                        + "approval_status TINYINT DEFAULT 1 COMMENT '审批状态: 1=未审批 2=已审批 3=驳回', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_gift_id (gift_id), "
                        + "KEY idx_gift_group (group_id), "
                        + "KEY idx_gift_store (store_id), "
                        + "KEY idx_gift_status (status)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赠送记录表'");
        log.info("已自动创建赠送记录表 biz_gift_record");
    }

    /** 赠送消费流水表 */
    private void createGiftConsumeTableIfAbsent() {
        if (tableExists("biz_gift_consume")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_gift_consume ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "gift_record_id BIGINT NOT NULL COMMENT '关联赠送记录ID', "
                        + "gift_id VARCHAR(32) NULL COMMENT '关联赠送ID（冗余方便查询）', "
                        + "group_id BIGINT NULL COMMENT '集团ID', "
                        + "group_name VARCHAR(128) NULL COMMENT '集团名称快照', "
                        + "store_id BIGINT NULL COMMENT '门店ID', "
                        + "store_name VARCHAR(128) NULL COMMENT '门店名称快照', "
                        + "brand VARCHAR(32) NULL COMMENT '品牌', "
                        + "ad_type VARCHAR(32) NULL COMMENT '广告类型', "
                        + "trade_type VARCHAR(32) NOT NULL COMMENT '交易类型: ad_purchase/ad_refund/manual_deduct/auto_expire', "
                        + "balance_change INT NOT NULL COMMENT '余额变动（正=增加，负=减少）', "
                        + "change_date DATE NULL COMMENT '变动日期', "
                        + "algorithm_id VARCHAR(32) NULL COMMENT '广告算法ID', "
                        + "algorithm_name VARCHAR(128) NULL COMMENT '广告算法名称', "
                        + "order_no VARCHAR(64) NULL COMMENT '关联订单号', "
                        + "remaining_days INT NULL COMMENT '变动后剩余天数', "
                        + "remark VARCHAR(500) NULL COMMENT '备注', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "KEY idx_consume_gift_record (gift_record_id), "
                        + "KEY idx_consume_gift_id (gift_id), "
                        + "KEY idx_consume_group (group_id), "
                        + "KEY idx_consume_store (store_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赠送消费流水表'");
        log.info("已自动创建赠送消费流水表 biz_gift_consume");
    }

    /** 集团种子数据 (按 group_code 幂等) */
    private void seedMerchantGroups() {
        String[][] groups = {
                {"JT000001", "美味餐廳集團", "group_g001"},
                {"JT000002", "生鮮超市集團", "group_g002"},
                {"JT000003", "時尚百貨集團", "group_g003"},
                {"JT000004", "速遞物流集團", "group_g004"},
                {"JT000005", "甜品屋集團", "group_g005"},
                {"JT000006", "火鍋城集團", "group_g006"},
        };
        int inserted = 0;
        for (String[] g : groups) {
            inserted += jdbcTemplate.update(
                    "INSERT INTO biz_merchant_group (group_code, group_name, login_account) "
                            + "SELECT ?, ?, ? FROM DUAL "
                            + "WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = ?)",
                    g[0], g[1], g[2], g[0]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条商户集团种子数据", inserted);
        }
    }

    /** 门店种子数据 (按 store_code 幂等) */
    private void seedStores() {
        String[][] stores = {
                {"JT000001", "MD00001", "澳門總店", "mFood", "1,2", "store_s1001"},
                {"JT000002", "MD00002", "氹仔分店", "flashBee", "1", "store_s1002"},
                {"JT000003", "MD00003", "新馬路店", "mFood", "2", "store_s1003"},
                {"JT000004", "MD00004", "黑沙環店", "flashBee", "1", "store_s1004"},
                {"JT000005", "MD00005", "官也街老店", "mFood", "1,2", "store_s1005"},
                {"JT000006", "MD00006", "珠海旗艦店", "flashBee,mFood", "1,2,3", "store_s1006"},
        };
        int inserted = 0;
        for (String[] s : stores) {
            inserted += jdbcTemplate.update(
                    "INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account) "
                            + "SELECT g.id, ?, ?, ?, ?, ? FROM biz_merchant_group g "
                            + "WHERE g.group_code = ? "
                            + "AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = ?)",
                    s[1], s[2], s[3], s[4], s[5], s[0], s[1]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条门店种子数据", inserted);
        }
    }

    /** 赠送记录种子数据 (按 gift_id 幂等) */
    private void seedGiftRecords() {
        // gift_id, group_code, group_name, store_code, store_name, brand, ad_type,
        // total, valid, used, remaining, gift_date, expire_date, status, reason, applicant, apply_time, approval_status
        Object[][] records = {
                {"2401-001", "JT000001", "美味餐廳集團", "MD00001", "澳門總店", "2", "new_store",
                        30, 180, 12, 18, "2024-01-15", "2024-07-15", 1, "新集團入駐扶持", "張三", "2024-01-15 10:30:00", 2},
                {"2310-001", "JT000002", "生鮮超市集團", "MD00002", "氹仔分店", "1", "revival",
                        60, 180, 60, 0, "2023-10-01", "2024-04-01", 2, "集團盤活復蘇計劃", "李四", "2023-10-01 14:20:00", 2},
                {"2401-003", "JT000003", "時尚百貨集團", "MD00003", "新馬路店", "2", "exclusive",
                        90, 365, 45, 45, "2024-01-01", "2024-12-31", 1, "大促活動支持", "王五", "2024-01-01 09:15:00", 2},
                {"2306-001", "JT000004", "速遞物流集團", "MD00004", "黑沙環店", "1", "new_store",
                        15, 90, 0, 15, "2023-06-01", "2023-12-01", 3, "合作夥伴獎勵", "趙六", "2023-06-01 11:00:00", 2},
                {"2401-004", "JT000005", "甜品屋集團", "MD00005", "官也街老店", "2", "new_store",
                        7, 30, 0, 0, null, null, 1, "新集團開業扶持", "關羽", "2024-01-20 16:30:00", 1},
                {"2401-005", "JT000006", "火鍋城集團", "MD00006", "珠海旗艦店", "1", "ka",
                        14, 60, 0, 0, null, null, 1, "集團盤活復蘇計劃", "張飛", "2024-01-18 09:45:00", 3},
        };
        int inserted = 0;
        for (Object[] r : records) {
            inserted += jdbcTemplate.update(
                    "INSERT INTO biz_gift_record (gift_id, group_id, group_name, store_id, store_name, brand, ad_type, "
                            + "total_days, valid_days, used_days, remaining_days, gift_date, expire_date, status, "
                            + "reason, applicant, apply_time, approval_status) "
                            + "SELECT ?, g.id, ?, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? "
                            + "FROM biz_merchant_group g, biz_store s "
                            + "WHERE g.group_code = ? AND s.store_code = ? "
                            + "AND NOT EXISTS (SELECT 1 FROM biz_gift_record WHERE gift_id = ?)",
                    r[0], r[2], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13],
                    r[14], r[15], r[16], r[17], r[1], r[3], r[0]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条赠送记录种子数据", inserted);
        }
    }

    /** 消费流水种子数据 (按 gift_id + trade_type + change_date 幂等) */
    private void seedGiftConsumes() {
        // gift_id, trade_type, balance_change, change_date, algorithm_id, algorithm_name, order_no, remaining_days, remark
        Object[][] consumes = {
                {"2401-001", "ad_purchase", -5, "2024-02-10", "A001", "新店廣告-外賣版", "AD202402100001", 25, ""},
                {"2401-001", "ad_refund", 3, "2024-02-15", "A001", "新店廣告-首頁版", "AD202402150002", 28, ""},
                {"2310-001", "ad_purchase", -10, "2023-11-05", "A002", "盤活復蘇-團購版", "AD202311050001", 20, ""},
                {"2401-003", "manual_deduct", -8, "2024-01-20", "A003", "獨家商家-超市版", "—", 37,
                        "商家違規進行虛假宣傳，經運營主管審核手動扣除贈送天數作為懲罰。"},
                {"2306-001", "auto_expire", -7, "2024-03-01", "A004", "金牌商家-全渠道", "—", 8,
                        "贈送天數有效期到期，系統自動收回剩餘天數。"},
                {"2401-004", "ad_refund", 4, "2024-02-28", "A005", "人氣商家-首頁版", "AD202402280001", 14, ""},
        };
        int inserted = 0;
        for (Object[] c : consumes) {
            inserted += jdbcTemplate.update(
                    "INSERT INTO biz_gift_consume (gift_record_id, gift_id, group_id, group_name, store_id, store_name, "
                            + "brand, ad_type, trade_type, balance_change, change_date, algorithm_id, algorithm_name, "
                            + "order_no, remaining_days, remark) "
                            + "SELECT gr.id, gr.gift_id, gr.group_id, gr.group_name, gr.store_id, gr.store_name, "
                            + "gr.brand, gr.ad_type, ?, ?, ?, ?, ?, ?, ?, ? "
                            + "FROM biz_gift_record gr WHERE gr.gift_id = ? "
                            + "AND NOT EXISTS (SELECT 1 FROM biz_gift_consume "
                            + "WHERE gift_id = ? AND trade_type = ? AND change_date = ?)",
                    c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[0], c[0], c[1], c[3]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条赠送消费流水种子数据", inserted);
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }
}

