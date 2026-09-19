package com.mftb.admin.config;

import com.mftb.admin.dto.StoreDataConfigDTO;
import com.mftb.admin.service.StoreDataConfigService;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

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
    private final SchemaVersionTracker versionTracker;
    private final BizSeqService bizSeqService;

    /** 建表版本: 新增建表步骤时递增 minor 版本号 (格式: v{major}.{minor}) */
    private static final String V_TABLES = "biz:tables-v1";
    /** 存量迁移版本: 编号/频道等一次性存量迁移, 新增迁移时递增 minor 版本号 */
    private static final String V_LEGACY = "biz:legacy-migrate-v1";
    /** 种子数据版本: 新增/调整种子数据时递增 minor 版本号 */
    private static final String V_SEED = "biz:seed-v3";
    /** AI 申请数据修复版本：修复 flow_no / current_node_name / current_approver */
    private static final String V_FIX_AI = "biz:fix-ai-access-v6";

    @Override
    public void run(String... args) {
        // 一次性步骤按版本执行, 重启时已执行的直接跳过 (启动提速)
        versionTracker.applyOnce(V_TABLES, () -> {
            createMerchantGroupTableIfAbsent();
            createStoreTableIfAbsent();
            createStoreBdTableIfAbsent();
            createStoreDataConfigTableIfAbsent();
            createFlashSaleTablesIfAbsent();
            createGiftRecordTableIfAbsent();
            createGiftConsumeTableIfAbsent();
            createWordLibraryTableIfAbsent();
            createWorkflowConfigTableIfAbsent();
            createOaProcessTableIfAbsent();
            createOaRequestTableIfAbsent();
            createOaApprovalTaskTableIfAbsent();
        });
        versionTracker.applyOnce(V_LEGACY, () -> {
            migrateLegacyGroupCodes();
            migrateLegacyStoreCodes();
            migrateLegacyBizChannels();
            cleanupDuplicateSeedStores();
        });
        versionTracker.applyOnce(V_SEED, () -> {
            seedMerchantGroups();
            seedStores();
            seedFlashSalePeriods();
            migrateStoreAddress();
            seedWordLibrary();
            seedWorkflowConfig();
            seedOaProcesses();
            seedOaWorkflowConfig();
            seedOaSeqRule();
        });
        // 修复 AI 申请记录的节点名称和审批人（需在种子数据写入后执行）
        versionTracker.applyOnce(V_FIX_AI, this::fixAiAccessOaData);
        // "活"逻辑: 新增门店需自动补齐金字招牌数据配置, 每次启动执行 (无缺失时仅 1 条查询)
        seedStoreDataConfigs();
        // 门店编码序号兜底同步, 每次启动执行 (成本极低)
        syncStoreCodeSequence();
    }

    /** 清理重复种子门店: 同名门店保留 id 最小的一条，删除其余重复记录 (幂等: 无重复时不执行) */
    private void cleanupDuplicateSeedStores() {
        String[] seedNames = {"澳門總店", "氹仔分店", "新馬路店", "黑沙環店", "官也街老店", "珠海旗艦店"};
        int totalDeleted = 0;
        for (String name : seedNames) {
            // 找出该名称下 id 最小的记录
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM biz_store WHERE store_name = ? AND deleted = 0 ORDER BY id",
                    Long.class, name);
            if (ids.size() <= 1) continue;
            // 保留第一条，删除其余
            List<Long> toDelete = ids.subList(1, ids.size());
            int deleted = jdbcTemplate.update(
                    "UPDATE biz_store SET deleted = 1 WHERE id IN (" +
                            String.join(",", toDelete.stream().map(String::valueOf).toList()) + ")");
            totalDeleted += deleted;
        }
        if (totalDeleted > 0) {
            log.info("已清理 {} 条重复种子门店数据", totalDeleted);
        }
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

    /**
     * 同步门店编码序号: 保证 sys_biz_seq 中 MD 前缀的 current_value
     * 严格大于 biz_store 表中已有的最大门店序号，避免新增门店时唯一键冲突。
     * <p>
     * 种子数据/迁移脚本直接写入 store_code 但不更新 sys_biz_seq，
     * 此方法在每次启动时兜底同步，幂等执行。
     */
    private void syncStoreCodeSequence() {
        if (!tableExists("sys_biz_seq") || !tableExists("biz_store")) {
            return;
        }
        int maxExisting = maxCodeSeq("biz_store", "store_code", "MD");
        if (maxExisting <= 0) {
            return;
        }
        // sys_biz_seq.current_value 需设为 max + 1，
        // 因为 BizSeqService.next() 在 seq_start=1 时: code = (current_value) - 1
        int targetValue = maxExisting + 1;
        // 先播种（行不存在时插入），再更新到目标值
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq (prefix, date_key, current_value) VALUES ('MD', '00000000', 0)");
        int updated = jdbcTemplate.update(
                "UPDATE sys_biz_seq SET current_value = ? WHERE prefix = 'MD' AND date_key = '00000000' AND current_value < ?",
                targetValue, targetValue);
        if (updated > 0) {
            log.info("已同步门店编码序号至 MD{}（max+1={})", String.format("%06d", maxExisting), targetValue);
        }
    }

    /** 存量门店ID迁移: 非 MD+6位数字 格式的编号按 id 顺序重编为 MD 序列 */
    private void migrateLegacyStoreCodes() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM biz_store WHERE store_code NOT REGEXP '^MD[0-9]{6}$' ORDER BY id",
                Long.class);
        if (ids.isEmpty()) {
            return;
        }
        int seq = maxCodeSeq("biz_store", "store_code", "MD");
        for (Long id : ids) {
            jdbcTemplate.update("UPDATE biz_store SET store_code = ? WHERE id = ?",
                    String.format("MD%06d", ++seq), id);
        }
        log.info("已将 {} 条存量门店ID迁移为 MD 自增序列", ids.size());
    }

    /** 存量门店地址迁移: 若 biz_store 缺少 address 列则自动添加，并为存量门店填充澳门真实地址 */
    private void migrateStoreAddress() {
        if (!tableExists("biz_store")) return;
        if (!columnExists("biz_store", "address")) {
            jdbcTemplate.execute("ALTER TABLE biz_store ADD COLUMN address VARCHAR(256) NULL COMMENT '门店地址' AFTER region");
            log.info("已为 biz_store 添加 address 列");
        }
        // 为存量门店填充澳门真实地址（按 store_code 精确匹配，仅填充 address 为 NULL 的记录）
        String[][] addrSeed = {
                {"MD000009", "澳門新馬路128號"},
                {"MD000010", "澳門氹仔官也街56號"},
                {"MD000011", "澳門新馬路168號"},
                {"MD000012", "澳門黑沙環馬路88號"},
                {"MD000013", "澳門氹仔官也街美食廣場2樓"},
                {"MD000014", "澳門議事亭前地18號"},
        };
        int updated = 0;
        for (String[] s : addrSeed) {
            updated += jdbcTemplate.update(
                    "UPDATE biz_store SET address = ? WHERE store_code = ? AND address IS NULL AND deleted = 0",
                    s[1], s[0]);
        }
        if (updated > 0) {
            log.info("已为 {} 条存量门店填充地址数据", updated);
        }
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
                        + "region INT NULL COMMENT '所在区域/商圈', "
                        + "address VARCHAR(256) NULL COMMENT '门店地址', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "KEY idx_store_group (group_id), "
                        + "UNIQUE KEY uk_store_code (store_code)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表'");
        log.info("已自动创建门店表 biz_store");
    }

    /** 门店金字招牌数据配置表 (对应脚本 backend/sql/61_store_data_config.sql) */
    private void createStoreDataConfigTableIfAbsent() {
        if (tableExists("biz_store_data_config")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_store_data_config ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "store_id BIGINT NOT NULL COMMENT '门店主键 (关联 biz_store.id)', "
                        + "monthly_orders INT NOT NULL DEFAULT 0 COMMENT '月订单数', "
                        + "monthly_repurchase_orders INT NOT NULL DEFAULT 0 COMMENT '月复购订单数据', "
                        + "monthly_positive_orders INT NOT NULL DEFAULT 0 COMMENT '月好评订单数据', "
                        + "monthly_visits INT NOT NULL DEFAULT 0 COMMENT '月访问量', "
                        + "store_favorites INT NOT NULL DEFAULT 0 COMMENT '门店收藏数', "
                        + "monthly_customers INT NOT NULL DEFAULT 0 COMMENT '顾客数', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_store_id (store_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店金字招牌数据配置表'");
        log.info("已自动创建门店数据配置表 biz_store_data_config");
    }

    /** 秒杀模块建表: 期数/登记/阶梯/统计/汇总 + 黑榜阈值配置 + 种子期数（幂等，对应 62_flash_sale_module.sql） */
    private void createFlashSaleTablesIfAbsent() {
        if (!tableExists("biz_flash_sale_period")) {
            jdbcTemplate.execute(
                    "CREATE TABLE biz_flash_sale_period ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "period_no INT NOT NULL COMMENT '期数', "
                            + "start_date DATE NULL COMMENT '开始日期', "
                            + "end_date DATE NULL COMMENT '结束日期', "
                            + "status TINYINT NOT NULL DEFAULT 2 COMMENT '状态: 1=进行中, 2=已结束', "
                            + "remark VARCHAR(255) NULL COMMENT '备注', "
                            + "deleted TINYINT NOT NULL DEFAULT 0, "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE KEY uk_period_no (period_no)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀期数表'");
            log.info("已自动创建秒杀期数表 biz_flash_sale_period");
        }
        if (!tableExists("biz_flash_sale_register")) {
            jdbcTemplate.execute(
                    "CREATE TABLE biz_flash_sale_register ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "period_id BIGINT NOT NULL COMMENT '期数ID', "
                            + "seq_no INT NULL COMMENT '序号', "
                            + "subsidy_type VARCHAR(20) NOT NULL COMMENT '补贴类型', "
                            + "store_codes VARCHAR(512) NULL COMMENT '门店编码', "
                            + "store_names VARCHAR(1024) NULL COMMENT '门店名称', "
                            + "bd_names VARCHAR(255) NULL COMMENT 'BD姓名', "
                            + "product_id VARCHAR(32) NOT NULL COMMENT '商品ID', "
                            + "product_name VARCHAR(255) NULL COMMENT '商品名称', "
                            + "product_type VARCHAR(20) NULL COMMENT '商品类型', "
                            + "max_purchase VARCHAR(50) NULL COMMENT '每人最多购买', "
                            + "price_type VARCHAR(10) NOT NULL DEFAULT 'single' COMMENT '价格类型', "
                            + "original_price DECIMAL(10,2) NULL COMMENT '原价', "
                            + "group_price DECIMAL(10,2) NULL COMMENT '团购价', "
                            + "flash_sale_price DECIMAL(10,2) NULL COMMENT '秒杀价', "
                            + "flash_sale_stock INT NULL COMMENT '秒杀库存(单一价格)', "
                            + "current_sales INT NOT NULL DEFAULT 0 COMMENT '本期秒杀销量', "
                            + "deleted TINYINT NOT NULL DEFAULT 0, "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE KEY uk_period_product (period_id, product_id), "
                            + "KEY idx_period (period_id)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀商品登记表'");
            log.info("已自动创建秒杀商品登记表 biz_flash_sale_register");
        }
        if (!tableExists("biz_flash_sale_price_tier")) {
            jdbcTemplate.execute(
                    "CREATE TABLE biz_flash_sale_price_tier ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "owner_type VARCHAR(10) NOT NULL COMMENT '归属: register/stats', "
                            + "owner_id BIGINT NOT NULL COMMENT '归属记录ID', "
                            + "tier_no INT NOT NULL COMMENT '阶梯序号', "
                            + "tier_price DECIMAL(10,2) NOT NULL COMMENT '阶梯价', "
                            + "tier_stock INT NOT NULL DEFAULT 0 COMMENT '阶梯库存', "
                            + "tier_subsidy DECIMAL(10,2) NULL COMMENT '阶梯补贴', "
                            + "KEY idx_owner (owner_type, owner_id)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀价阶梯表'");
            log.info("已自动创建秒杀价阶梯表 biz_flash_sale_price_tier");
        }
        if (!tableExists("biz_flash_sale_stats")) {
            jdbcTemplate.execute(
                    "CREATE TABLE biz_flash_sale_stats ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "period_id BIGINT NOT NULL COMMENT '期数ID', "
                            + "product_id VARCHAR(32) NOT NULL COMMENT '商品ID', "
                            + "product_name VARCHAR(255) NULL COMMENT '商品名称', "
                            + "store_names TEXT NULL COMMENT '商品门店', "
                            + "price_type VARCHAR(10) NOT NULL DEFAULT 'single' COMMENT '价格类型', "
                            + "flash_sale_price DECIMAL(10,2) NULL COMMENT '秒杀价(单一价格)', "
                            + "order_users INT NULL COMMENT '下单用户', "
                            + "total_price DECIMAL(12,2) NULL COMMENT '总价', "
                            + "total_orders INT NULL COMMENT '订单总数', "
                            + "total_sales INT NULL COMMENT '商品总销量', "
                            + "actual_amount DECIMAL(12,2) NULL COMMENT '实付金额', "
                            + "order_users_change DECIMAL(10,4) NULL COMMENT '下单用户环比', "
                            + "total_price_change DECIMAL(10,4) NULL COMMENT '总价环比', "
                            + "total_orders_change DECIMAL(10,4) NULL COMMENT '订单总数环比', "
                            + "total_sales_change DECIMAL(10,4) NULL COMMENT '商品总销量环比', "
                            + "actual_amount_change DECIMAL(10,4) NULL COMMENT '实付金额环比', "
                            + "subsidy_type VARCHAR(20) NULL COMMENT '是否补贴品', "
                            + "discount_rate DECIMAL(10,6) NULL COMMENT '折扣率', "
                            + "last_period_subsidy VARCHAR(20) NULL COMMENT '上期有无补贴', "
                            + "bd_name VARCHAR(50) NULL COMMENT '所属BD', "
                            + "deleted TINYINT NOT NULL DEFAULT 0, "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE KEY uk_period_product (period_id, product_id), "
                            + "KEY idx_period (period_id)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀商品统计表'");
            log.info("已自动创建秒杀商品统计表 biz_flash_sale_stats");
        }
        if (!tableExists("biz_flash_sale_summary")) {
            jdbcTemplate.execute(
                    "CREATE TABLE biz_flash_sale_summary ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "period_id BIGINT NOT NULL COMMENT '期数ID', "
                            + "stat_date DATE NULL COMMENT '统计日期（NULL=整期合计行）', "
                            + "total_payable DECIMAL(12,2) NULL COMMENT '总应付金额', "
                            + "total_actual DECIMAL(12,2) NULL COMMENT '总实付金额', "
                            + "total_orders INT NULL COMMENT '订单总数', "
                            + "total_sales INT NULL COMMENT '商品总销量', "
                            + "total_products INT NULL COMMENT '总商品数', "
                            + "sold_products INT NULL COMMENT '动销商品数', "
                            + "buyers INT NULL COMMENT '购买人数(已去重)', "
                            + "repurchase_buyers INT NULL COMMENT '复购人数', "
                            + "repurchase_rate DECIMAL(10,6) NULL COMMENT '复购率', "
                            + "avg_order_value DECIMAL(10,2) NULL COMMENT '人均客单价', "
                            + "deleted TINYINT NOT NULL DEFAULT 0, "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE KEY uk_period_date (period_id, stat_date)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀每日汇总表'");
            log.info("已自动创建秒杀每日汇总表 biz_flash_sale_summary");
        }
        // 黑榜阈值配置
        if (tableExists("sys_config")) {
            jdbcTemplate.update(
                    "INSERT INTO sys_config (config_key, config_value, description) "
                            + "SELECT 'flash_sale_blacklist_threshold', '10', '秒杀近3期销量黑榜阈值' "
                            + "WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'flash_sale_blacklist_threshold')");
        }
    }

    /** 种子期数: 第84/85期（幂等） */
    private void seedFlashSalePeriods() {
        if (!tableExists("biz_flash_sale_period")) {
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO biz_flash_sale_period (period_no, start_date, end_date, status, remark) "
                        + "SELECT 84, '2026-08-06', '2026-08-08', 2, '第84期秒杀' "
                        + "WHERE NOT EXISTS (SELECT 1 FROM biz_flash_sale_period WHERE period_no = 84)");
        jdbcTemplate.update(
                "INSERT INTO biz_flash_sale_period (period_no, start_date, end_date, status, remark) "
                        + "SELECT 85, '2026-08-13', '2026-08-15', 2, '第85期秒杀' "
                        + "WHERE NOT EXISTS (SELECT 1 FROM biz_flash_sale_period WHERE period_no = 85)");
    }

    /** 为所有存量门店预生成金字招牌数据配置 (幂等: 仅补缺失门店, 按 storeId 种子确定性随机) */
    private void seedStoreDataConfigs() {
        if (!tableExists("biz_store_data_config") || !tableExists("biz_store")) {
            return;
        }
        List<Long> storeIds = jdbcTemplate.queryForList(
                "SELECT s.id FROM biz_store s LEFT JOIN biz_store_data_config c ON c.store_id = s.id "
                        + "WHERE s.deleted = 0 AND c.id IS NULL ORDER BY s.id",
                Long.class);
        for (Long storeId : storeIds) {
            StoreDataConfigDTO dto = StoreDataConfigService.generate(storeId);
            jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_store_data_config "
                            + "(store_id, monthly_orders, monthly_repurchase_orders, monthly_positive_orders, "
                            + "monthly_visits, store_favorites, monthly_customers, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    storeId, dto.getMonthlyOrders(), dto.getMonthlyRepurchaseOrders(),
                    dto.getMonthlyPositiveOrders(), dto.getMonthlyVisits(), dto.getStoreFavorites(),
                    dto.getMonthlyCustomers(), "系統預生成");
        }
        if (!storeIds.isEmpty()) {
            log.info("已为 {} 家门店预生成金字招牌数据配置", storeIds.size());
        }
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

    /** 门店种子数据 (按 store_code 幂等; 编码必须为 MD+6位数字, 避免被 migrateLegacyStoreCodes 误迁移) */
    private void seedStores() {
        String[][] stores = {
                {"JT000001", "MD000001", "澳門總店", "mFood", "1,2", "store_s1001"},
                {"JT000002", "MD000002", "氹仔分店", "flashBee", "1", "store_s1002"},
                {"JT000003", "MD000003", "新馬路店", "mFood", "2", "store_s1003"},
                {"JT000004", "MD000004", "黑沙環店", "flashBee", "1", "store_s1004"},
                {"JT000005", "MD000005", "官也街老店", "mFood", "1,2", "store_s1005"},
                {"JT000006", "MD000006", "珠海旗艦店", "flashBee,mFood", "1,2,3", "store_s1006"},
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

    /** 推广词库表 */
    private void createWordLibraryTableIfAbsent() {
        if (!tableExists("prom_word_library")) {
            jdbcTemplate.execute(
                    "CREATE TABLE prom_word_library ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                            + "word VARCHAR(128) NOT NULL COMMENT '词条', "
                            + "channel VARCHAR(32) NOT NULL COMMENT '所属频道: takeaway/supermarket/groupBuy', "
                            + "status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=啟用 2=停用', "
                            + "match_count INT NOT NULL DEFAULT 0 COMMENT '匹配次数', "
                            + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                            + "updated_time DATETIME NULL COMMENT '最后更新时间', "
                            + "remark VARCHAR(500) NULL COMMENT '备注', "
                            + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除: 0=未删除 1=已删除', "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                            + "UNIQUE KEY uk_word_channel (word, channel), "
                            + "KEY idx_word_channel (channel), "
                            + "KEY idx_word_status (status), "
                            + "KEY idx_word_updated_by (updated_by)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广词库表'");
            log.info("已自动创建推广词库表 prom_word_library");
        }
        migrateWordLibraryUniqueIndex();
    }

    /** 为存量推广词库表补充唯一索引: 先清理重复数据(保留id最小), 再建立唯一索引 */
    private void migrateWordLibraryUniqueIndex() {
        Integer indexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prom_word_library' AND INDEX_NAME = 'uk_word_channel'",
                Integer.class);
        if (indexCount != null && indexCount > 0) {
            return;
        }
        int removed = jdbcTemplate.update(
                "DELETE w1 FROM prom_word_library w1 "
                        + "JOIN prom_word_library w2 ON w1.word = w2.word AND w1.channel = w2.channel AND w1.id > w2.id "
                        + "WHERE w1.deleted = 0 AND w2.deleted = 0");
        if (removed > 0) {
            log.info("已清理 {} 条重复推广词库数据", removed);
        }
        jdbcTemplate.execute(
                "ALTER TABLE prom_word_library ADD UNIQUE KEY uk_word_channel (word, channel)");
        log.info("已为推广词库表建立唯一索引 uk_word_channel");
    }

    /** 推广词库种子数据 (按 word+channel 幂等) */
    private void seedWordLibrary() {
        String[][] words = {
                {"牛肉面", "takeaway", "1", "核心品類詞"},
                {"奶茶", "supermarket", "1", "飲品品類"},
                {"火鍋", "takeaway", "1", ""},
                {"火爆牛肉面套餐", "takeaway", "1", "商家上傳菜品提取"},
                {"珍珠奶茶", "takeaway", "1", ""},
                {"麻辣火鍋", "takeaway", "1", "辣味火鍋"},
                {"牛肉", "supermarket", "1", "高頻食材"},
                {"珍珠", "takeaway", "1", "奶茶配料"},
                {"豆腐", "supermarket", "1", "批量導入"},
                {"麻辣", "takeaway", "1", "高頻口味"},
                {"燒烤", "takeaway", "1", ""},
                {"紅燒", "takeaway", "2", "使用頻率低，已停用"},
                {"KFC", "takeaway", "1", "品牌簡稱"},
                {"麥當勞", "takeaway", "1", ""},
                {"買一送一", "groupBuy", "1", "常見營銷詞"},
                {"限時優惠", "supermarket", "1", ""},
                {"早餐", "takeaway", "1", "時段場景詞"},
                {"夜宵", "takeaway", "1", ""},
                {"下午茶", "groupBuy", "2", "使用頻率低"},
        };
        int inserted = 0;
        for (String[] w : words) {
            inserted += jdbcTemplate.update(
                    "INSERT INTO prom_word_library (word, channel, status, match_count, updated_by, updated_time, remark) "
                            + "SELECT ?, ?, ?, FLOOR(1000 + RAND() * 20000), '系統初始化', NOW(), ? FROM DUAL "
                            + "WHERE NOT EXISTS (SELECT 1 FROM prom_word_library WHERE word = ? AND channel = ? AND deleted = 0)",
                    w[0], w[1], Integer.parseInt(w[2]), w[3], w[0], w[1]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条推广词库种子数据", inserted);
        }
    }

    /** 赠送记录/消费流水不再写入种子数据: 业务上尚未发生任何赠送, 数据均由真实赠送操作产生 */

    /** 流程配置表 */
    private void createWorkflowConfigTableIfAbsent() {
        if (tableExists("biz_workflow_config")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_workflow_config ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "flow_type VARCHAR(32) NOT NULL UNIQUE COMMENT '流程类型标识: recharge/deduct/transfer/merge/gift', "
                        + "flow_name VARCHAR(64) NOT NULL COMMENT '流程展示名称', "
                        + "approval_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '审批开关: 1=启用审批, 0=停用(直接执行)', "
                        + "description VARCHAR(200) DEFAULT NULL COMMENT '流程说明', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_workflow_flow_type (flow_type)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程配置表'");
        log.info("已自动创建流程配置表 biz_workflow_config");
    }

    /** 流程配置种子数据：5种流程默认启用审批 */
    private void seedWorkflowConfig() {
        String[][] configs = {
                {"recharge", "推廣金充值", "1", "推廣金充值操作，啟用後需經過三級審批（業務主管->運營主管->財務主管）"},
                {"deduct", "推廣金扣款", "1", "推廣金扣款操作，啟用後需經過三級審批"},
                {"transfer", "推廣金轉賬", "1", "推廣金轉賬操作，啟用後需經過三級審批"},
                {"merge", "推廣金合併", "1", "集團合併操作，啟用後需經過三級審批"},
                {"gift", "贈送廣告天數", "1", "推廣贈送廣告天數操作，啟用後需經過三級審批"},
                {"ai_access", "AI申請審批", "1", "員工AI助手使用權限與額度申請審批流程"},
        };
        int inserted = 0;
        for (String[] c : configs) {
            inserted += jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description) "
                            + "VALUES (?, ?, ?, ?)",
                    c[0], c[1], Integer.parseInt(c[2]), c[3]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条流程配置种子数据", inserted);
        }
    }

    /** OA流程定义表 */
    private void createOaProcessTableIfAbsent() {
        if (tableExists("biz_oa_process")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_oa_process ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "process_code VARCHAR(32) NOT NULL COMMENT '流程编码', "
                        + "process_name VARCHAR(64) NOT NULL COMMENT '流程名称', "
                        + "category VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT '分类: office/finance/hr/general', "
                        + "icon VARCHAR(64) DEFAULT NULL COMMENT '图标标识', "
                        + "description VARCHAR(200) DEFAULT NULL COMMENT '流程说明', "
                        + "workflow_type VARCHAR(32) DEFAULT NULL COMMENT '关联 biz_workflow_config.flow_type', "
                        + "form_schema TEXT DEFAULT NULL COMMENT '表单字段定义JSON', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_oa_process_code (process_code)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程定义表'");
        log.info("已自动创建OA流程定义表 biz_oa_process");
    }

    /** OA流程实例表 */
    private void createOaRequestTableIfAbsent() {
        if (tableExists("biz_oa_request")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_oa_request ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "flow_no VARCHAR(32) NOT NULL COMMENT '流程编号', "
                        + "process_code VARCHAR(32) NOT NULL COMMENT '关联流程定义编码', "
                        + "title VARCHAR(200) NOT NULL COMMENT '流程标题', "
                        + "form_data TEXT DEFAULT NULL COMMENT '表单数据JSON', "
                        + "applicant VARCHAR(64) NOT NULL COMMENT '申请人', "
                        + "flow_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled', "
                        + "current_node_name VARCHAR(64) DEFAULT NULL COMMENT '当前待审节点名称', "
                        + "reject_reason VARCHAR(500) DEFAULT NULL COMMENT '驳回理由', "
                        + "apply_time DATETIME DEFAULT NULL COMMENT '申请时间', "
                        + "complete_time DATETIME DEFAULT NULL COMMENT '完成时间', "
                        + "cancel_time DATETIME DEFAULT NULL COMMENT '撤销时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_oa_request_flow_no (flow_no), "
                        + "KEY idx_oa_request_applicant (applicant), "
                        + "KEY idx_oa_request_status (flow_status), "
                        + "KEY idx_oa_request_process (process_code)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程实例表'");
        log.info("已自动创建OA流程实例表 biz_oa_request");
    }

    /** OA审批任务表 */
    private void createOaApprovalTaskTableIfAbsent() {
        if (tableExists("biz_oa_approval_task")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE biz_oa_approval_task ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "request_id BIGINT NOT NULL COMMENT '关联流程实例ID', "
                        + "node_name VARCHAR(64) NOT NULL COMMENT '审批节点名称', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '节点顺序', "
                        + "approval_rule VARCHAR(16) NOT NULL DEFAULT 'any' COMMENT 'any=或签 / all=会签', "
                        + "approver VARCHAR(64) DEFAULT NULL COMMENT '审批人', "
                        + "task_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected', "
                        + "approve_time DATETIME DEFAULT NULL COMMENT '审批时间', "
                        + "comment VARCHAR(500) DEFAULT NULL COMMENT '审批意见', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "KEY idx_oa_task_request (request_id), "
                        + "KEY idx_oa_task_approver (approver), "
                        + "KEY idx_oa_task_status (task_status)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA审批任务表'");
        log.info("已自动创建OA审批任务表 biz_oa_approval_task");
    }

    /** OA流程定义种子数据 */
    private void seedOaProcesses() {
        String[][] processes = {
                {"oa_leave",     "請假申請",   "hr",      "CalendarOutlined",     "員工請假申請流程",           "oa_general", "1"},
                {"oa_reimburse", "報銷申請",   "finance", "DollarOutlined",       "費用報銷申請流程",           "oa_general", "2"},
                {"oa_purchase",  "採購申請",   "finance", "ShoppingCartOutlined",  "辦公物資採購申請流程",       "oa_general", "3"},
                {"oa_seal",      "用章申請",   "office",  "AuditOutlined",        "公章使用申請流程",           "oa_general", "4"},
                {"oa_general",   "通用審批",   "general", "FormOutlined",         "通用審批流程，適用於一般事項", "oa_general", "5"},
        };
        int inserted = 0;
        for (String[] p : processes) {
            inserted += jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
                    p[0], p[1], p[2], p[3], p[4], p[5], Integer.parseInt(p[6]));
        }
        if (inserted > 0) {
            log.info("已写入 {} 条OA流程定义种子数据", inserted);
        }
    }

    /** OA通用审批流程配置种子数据 */
    private void seedOaWorkflowConfig() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description) "
                        + "VALUES ('oa_general', 'OA通用審批', 1, 'OA中心通用審批流程，默認一級審批')");
        if (inserted > 0) {
            log.info("已写入OA通用审批流程配置");
        }
    }

    /** OA/AI流程编号规则种子数据 */
    private void seedOaSeqRule() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES ('oa_request', 'OA流程編號', '審批中心', 'OA', 'YYYYMMDD', 4, 1, 1, 'OA流程編號')");
        // AI 申请编号规则
        int aiInserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES ('ai_access', 'AI申請流程編號', '審批中心', 'AI', 'YYYYMMDD', 4, 1, 1, 'AI申請流程編號')");
        if (inserted > 0 || aiInserted > 0) {
            log.info("已写入OA/AI流程编号规则");
        }
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

    /**
     * 修复 AI 申请记录的 flow_no / current_node_name / current_approver
     * 1. 从 biz_workflow_config 读取节点配置和路由规则，更新审批节点和审批人
     * 2. 使用 BizSeqService 按 ai_access 编号规则重新生成流程编号
     */
    private void fixAiAccessOaData() {
        try {
            // 先确保 biz_workflow_config 表有 nodes_config 和 routing_rules 列
            if (!columnExists("biz_workflow_config", "nodes_config")) {
                jdbcTemplate.execute("ALTER TABLE biz_workflow_config ADD COLUMN nodes_config TEXT DEFAULT NULL COMMENT '审批节点配置JSON' AFTER description");
            }
            if (!columnExists("biz_workflow_config", "routing_rules")) {
                jdbcTemplate.execute("ALTER TABLE biz_workflow_config ADD COLUMN routing_rules TEXT DEFAULT NULL COMMENT '路由规则JSON' AFTER nodes_config");
            }

            // 读取 AI 申请的流程配置
            var configList = jdbcTemplate.queryForList(
                "SELECT nodes_config, routing_rules FROM biz_workflow_config WHERE flow_type = 'ai_access'");
            if (configList.isEmpty()) {
                log.info("biz_workflow_config 中无 ai_access 配置，跳过修复");
                return;
            }
            var config = configList.get(0);
            String nodesConfigJson = (String) config.get("nodes_config");
            String routingRulesJson = (String) config.get("routing_rules");

            String nodeName = null;
            String approverName = null;

            if (nodesConfigJson != null && routingRulesJson != null) {
                // 解析节点配置和路由规则
                List<Map<String, Object>> nodesConfig = com.mftb.admin.util.JsonUtils.parseMapList(nodesConfigJson);
                List<Map<String, Object>> routingRules = com.mftb.admin.util.JsonUtils.parseMapList(routingRulesJson);

                if (!nodesConfig.isEmpty() && !routingRules.isEmpty()) {
                    // 获取第一条路由规则的激活节点
                    Map<String, Object> firstRule = routingRules.get(0);
                    @SuppressWarnings("unchecked")
                    List<String> activatedNodeIds = (List<String>) firstRule.get("activatedNodeIds");

                    if (activatedNodeIds != null && !activatedNodeIds.isEmpty()) {
                        String firstNodeId = activatedNodeIds.get(0);
                        Map<String, Object> firstNode = nodesConfig.stream()
                            .filter(n -> firstNodeId.equals(n.get("id")))
                            .findFirst().orElse(null);

                        if (firstNode != null) {
                            nodeName = (String) firstNode.get("name");
                            // 解析审批人
                            @SuppressWarnings("unchecked")
                            Map<String, Object> approverConfig = (Map<String, Object>) firstNode.get("approverConfig");
                            if (approverConfig != null) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> defaultSetting = (Map<String, Object>) approverConfig.get("default");
                                if (defaultSetting != null) {
                                    @SuppressWarnings("unchecked")
                                    List<String> approverIds = (List<String>) defaultSetting.get("approverIds");
                                    if (approverIds != null && !approverIds.isEmpty()) {
                                        String placeholders = approverIds.stream().map(id -> "?").collect(java.util.stream.Collectors.joining(","));
                                        var users = jdbcTemplate.queryForList(
                                            "SELECT name FROM sys_user WHERE id IN (" + placeholders + ") AND deleted = 0",
                                            approverIds.toArray());
                                        approverName = users.stream()
                                            .map(u -> (String) u.get("name"))
                                            .filter(java.util.Objects::nonNull)
                                            .collect(java.util.stream.Collectors.joining(","));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (nodeName == null) {
                log.info("ai_access 流程配置缺少节点信息，请先在流程配置页面配置节点和审批人");
            }

            // 查询所有 pending 的 AI 申请记录
            var pendingRecords = jdbcTemplate.queryForList(
                "SELECT id, flow_no, apply_time FROM biz_oa_request " +
                "WHERE process_code = 'ai_access' AND flow_status = 'pending'");

            if (pendingRecords.isEmpty()) {
                log.info("无待修复的 AI 申请记录");
                return;
            }

            int flowNoFixed = 0;
            int nodeFixed = 0;

            for (var record : pendingRecords) {
                String currentFlowNo = (String) record.get("flow_no");
                Long id = ((Number) record.get("id")).longValue();

                // 用 BizSeqService 按 ai_access 规则重新生成流程编号
                Object applyTimeObj = record.get("apply_time");
                LocalDate applyDate = applyTimeObj != null
                    ? ((java.time.LocalDateTime) applyTimeObj).toLocalDate()
                    : LocalDate.now();
                String newFlowNo = bizSeqService.next("ai_access", applyDate);

                if (nodeName != null) {
                    jdbcTemplate.update(
                        "UPDATE biz_oa_request SET flow_no = ?, current_node_name = ?, current_approver = ? WHERE id = ?",
                        newFlowNo, nodeName, approverName != null ? approverName : "", id);
                    nodeFixed++;
                } else {
                    jdbcTemplate.update(
                        "UPDATE biz_oa_request SET flow_no = ? WHERE id = ?",
                        newFlowNo, id);
                }
                flowNoFixed++;
            }

            log.info("已修复 biz_oa_request 中 {} 条 AI 申请记录的流程编号, {} 条记录的节点和审批人 (node={}, approver={})",
                flowNoFixed, nodeFixed, nodeName, approverName);
        } catch (Exception e) {
            log.warn("修复 AI 申请数据失败: {}", e.getMessage());
        }
    }
}

