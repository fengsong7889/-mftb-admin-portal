package com.mftb.admin.config;

import com.mftb.admin.util.ConvertUtils;
import com.mftb.admin.config.migration.ContractRegistry;
import com.mftb.admin.config.migration.ContractSpec;
import com.mftb.admin.config.migration.MigrationLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 广告推广模块数据初始化器: 启动时自动创建 biz_ad_* 表并写入种子数据
 * <p>
 * 对应脚本 backend/sql/09_ad_promotion.sql、backend/sql/13_waterfall_strategy.sql、
 * backend/sql/15_hot_merchant_ad.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdPromotionDataInitializer implements CommandLineRunner {

    /** 启动时自动执行的初始化脚本（classpath 下，幂等可重复执行） */
    private static final List<String> INIT_SCRIPTS = List.of(
            "09_ad_promotion.sql",
            "13_waterfall_strategy.sql",
            "15_hot_merchant_ad.sql",
            "63_card_order.sql");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final MigrationLock migrationLock;

    @Override
    public void run(String... args) {
        // 各脚本/步骤独立容错 + 独立版本: 已执行的步骤重启时直接跳过 (启动提速);
        // 脚本内容变更后递增脚本名后的版本号 (如 :v1 → :v1.1) 即可重跑
        for (String script : INIT_SCRIPTS) {
            try {
                versionTracker.applyOnce("adpromo:" + script + (script.equals("15_hot_merchant_ad.sql") ? ":v1.1" : ":v1"), () -> {
                    try {
                        executeSqlScript(script);
                    } catch (java.io.IOException e) {
                        throw new IllegalStateException("读取初始化脚本失败: " + script, e);
                    }
                });
            } catch (Exception e) {
                log.error("执行 {} 失败: {}", script, e.getMessage(), e);
            }
        }
        runSafely("biz_ad_pricing_star.sell_time_slots 补列", "adpromo:sell_time_slots:v1", this::ensureSellTimeSlotsColumn);
        runSafely("biz_ad_pricing_star.slot_discounts 补列", "adpromo:slot_discounts:v1", this::ensureSlotDiscountsColumn);
        runSafely("biz_ad_order 扩展列补齐", "adpromo:order_extra_cols:v1", this::ensureOrderExtraColumns);
        runSafely("库存与赠送快照列补齐", "adpromo:stock_gift_cols:v1", this::ensureStockAndGiftColumns);
        runSafely("biz_store.region 补列", "adpromo:store_region:v1", this::ensureStoreRegionColumn);
        runSafely("biz_ad_cell_lock 唯一键升级", "adpromo:cell_lock_uk:v1", this::ensureCellLockGroupKey);
        runSafely("存量广告消费明细迁移", "adpromo:consume_migrate:v1", this::migrateAdConsumeDetails);
        runSafely("广告明细实收变动修复", "adpromo:actual_change_fix:v1", this::repairAdDetailActualChange);
        // v2: 金字招牌计价表建表/补列，附结构后置校验；v1 因补列吞异常可能误记成功，故用新版本键重跑并以校验兜底
        runVerified("金字招牌计价表自动创建与补列", "adpromo:signboard_pricing_tables:v2",
                this::ensureSignboardPricingTables, this::verifySignboardPricing);
        String schema = jdbcTemplate.queryForObject("SELECT DATABASE()", String.class);
        migrationLock.runExclusive("mftb:schema:" + schema, 120, () ->
                versionTracker.applyOnce("adpromo:hot-skin-discount-v1.0",
                        this::ensureHotDiscountColumns, this::verifyHotDiscountColumns));
    }

    private void ensureHotDiscountColumns() {
        log.info("开始迁移人气商家大小图折扣结构");
        for (ContractSpec contract : ContractRegistry.hotDiscountContracts()) {
            for (ContractSpec.ColumnSpec column : contract.requiredColumns()) {
                addColumnIfAbsent(contract.table(), column.column(), column.addColumnDdl());
            }
        }
    }

    private void verifyHotDiscountColumns() {
        for (ContractSpec contract : ContractRegistry.hotDiscountContracts()) {
            for (ContractSpec.ColumnSpec column : contract.requiredColumns()) {
                if (!columnExists(contract.table(), column.column())) {
                    throw new IllegalStateException("人气商家折扣列未就绪: " + contract.table() + "." + column.column());
                }
            }
        }
        log.info("人气商家大小图折扣结构就绪");
    }

    /** 单步容错执行: 异常仅记录不抛出, 版本化后重启跳过已完成步骤 */
    private void runSafely(String name, String versionKey, Runnable task) {
        try {
            versionTracker.applyOnce(versionKey, task);
        } catch (Exception e) {
            log.error("广告推广初始化 [{}] 失败: {}", name, e.getMessage(), e);
        }
    }

    /**
     * 带后置校验的执行：任务成功且校验通过后 {@link SchemaVersionTracker#applyOnce} 才记录版本；
     * 校验失败会向上抛出（不记录、写失败审计），本方法捕获后仅记录错误、下次启动重试。
     */
    private void runVerified(String name, String versionKey, Runnable task, Runnable verify) {
        try {
            versionTracker.applyOnce(versionKey, task, verify);
        } catch (Exception e) {
            log.error("广告推广初始化 [{}] 失败(未记录版本, 下次启动重试): {}", name, e.getMessage(), e);
        }
    }

    /** 执行单个初始化脚本（去除行注释后按分号逐条执行） */
    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            // 先去除行注释（-- 开头），避免分号分割后注释与下一条语句粘连
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            // 按分号分割并逐条执行（忽略空语句）
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 {} 初始化数据表", scriptName);
        }
    }

    /**
     * 存量库兼容: biz_ad_pricing_star 旧表无 sell_time_slots 列时自动补列（幂等，失败上抛）。
     */
    private void ensureSellTimeSlotsColumn() {
        addColumnIfAbsent("biz_ad_pricing_star", "sell_time_slots",
                "ALTER TABLE biz_ad_pricing_star ADD COLUMN sell_time_slots JSON"
                        + " COMMENT '可售时段(JSON数组, 如[\"breakfast\",\"lunch\"], 空或含fullDay=全部时段)'");
    }

    /**
     * 存量库兼容: biz_ad_pricing_star 旧表无 slot_discounts 列时自动补列（幂等，失败上抛）。
     */
    private void ensureSlotDiscountsColumn() {
        addColumnIfAbsent("biz_ad_pricing_star", "slot_discounts",
                "ALTER TABLE biz_ad_pricing_star ADD COLUMN slot_discounts JSON"
                        + " COMMENT '时段折扣配置(JSON数组, 分商圈, 百分比记法)'");
    }

    /**
     * 存量库兼容: 库存与赠送快照列补齐（幂等）
     * 1) biz_ad_pricing_star_region.daily_sales_limit: 每日销售个数=库存, 默认 1 保持存量独家占行为
     * 2) biz_ad_order.gift_days / gift_amount: 赠送天数抵扣快照
     */
    private void ensureStockAndGiftColumns() {
        addColumnIfAbsent("biz_ad_pricing_star_region", "daily_sales_limit",
                "ALTER TABLE biz_ad_pricing_star_region ADD COLUMN daily_sales_limit INT NOT NULL DEFAULT 1"
                        + " COMMENT '每天销售个数(库存)' AFTER daily_price");
        addColumnIfAbsent("biz_ad_order", "gift_days",
                "ALTER TABLE biz_ad_order ADD COLUMN gift_days INT DEFAULT 0"
                        + " COMMENT '赠送天数抵扣快照' AFTER refund_amount");
        addColumnIfAbsent("biz_ad_order", "gift_amount",
                "ALTER TABLE biz_ad_order ADD COLUMN gift_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00"
                        + " COMMENT '赠送抵扣金额快照' AFTER gift_days");
    }

    /**
     * 存量库兼容: biz_store.region 门店所在商圈列补齐（幂等）
     * 盘活复苏按商圈定价售卖, 购买时商圈跟随门店所在区域
     */
    private void ensureStoreRegionColumn() {
        addColumnIfAbsent("biz_store", "region",
                "ALTER TABLE biz_store ADD COLUMN region INT"
                        + " COMMENT '所在区域/商圈: 1=黑沙环区 … 11=黑沙滩区' AFTER login_account");
    }

    /**
     * 存量库兼容: biz_ad_cell_lock 唯一键补充 group_code（幂等）
     * 库存>1 时多商家可分别锁定同一格子, 旧键 (algo_id,biz_date,region,meal_slot) 需替换
     */
    private void ensureCellLockGroupKey() {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE()"
                            + " AND table_name = 'biz_ad_cell_lock' AND index_name = 'uk_ad_cell_lock'"
                            + " AND column_name = 'group_code'",
                    Integer.class);
            if (count != null && count > 0) {
                return;
            }
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE()"
                            + " AND table_name = 'biz_ad_cell_lock' AND index_name = 'uk_ad_cell_lock'",
                    Integer.class);
            if (exists != null && exists > 0) {
                jdbcTemplate.execute("ALTER TABLE biz_ad_cell_lock DROP INDEX uk_ad_cell_lock");
            }
            jdbcTemplate.execute("ALTER TABLE biz_ad_cell_lock ADD UNIQUE KEY uk_ad_cell_lock"
                    + " (algo_id, biz_date, region, meal_slot, group_code)");
            log.info("已重建 biz_ad_cell_lock 唯一键(含 group_code)");
        } catch (Exception e) {
            log.warn("biz_ad_cell_lock 唯一键升级失败: {}", e.getMessage());
        }
    }

    /** 广告变动类别集合（与 AdAlgoTypeNames 保持一致，含兑底名称） */
    private static final List<String> AD_CHANGE_TYPES = List.of(
            "無敵星星", "新店廣告", "盤活復蘇", "流量廣告", "人氣商家", "廣告消費");

    /**
     * 存量修复（幂等）: 旧代码写入的广告消费/退款明细缺失实收变动（actual_change 为 NULL），
     * 按「有实收就按比例变动」规则补齐: 消费按所挂充值批次实收比例补扣，退款按原消费批次比例回补，
     * 并同步调整账户实收余额。修复后 actual_change 非 NULL，重复启动不会重复修复。
     */
    private void repairAdDetailActualChange() {
        try {
            String inClause = String.join(",", AD_CHANGE_TYPES.stream().map(t -> "'" + t + "'").toList());
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, group_code, brand, batch_no, flow_no, virtual_change FROM biz_fin_detail"
                            + " WHERE trade_type = '消費' AND actual_change IS NULL"
                            + " AND change_type IN (" + inClause + ")");
            int repaired = 0;
            for (Map<String, Object> row : rows) {
                BigDecimal virtual = new BigDecimal(String.valueOf(row.get("virtual_change")));
                BigDecimal ratio = virtual.signum() < 0
                        ? batchActualRatioForRepair(ConvertUtils.toStr(row.get("batch_no")), ConvertUtils.toStr(row.get("group_code")))
                        : refundRatioForRepair(ConvertUtils.toStr(row.get("flow_no")), ConvertUtils.toStr(row.get("group_code")));
                if (ratio == null) {
                    continue;
                }
                BigDecimal actual = virtual.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
                jdbcTemplate.update("UPDATE biz_fin_detail SET actual_change = ? WHERE id = ?",
                        actual, row.get("id"));
                jdbcTemplate.update(
                        "UPDATE biz_fin_account SET actual_balance = IFNULL(actual_balance, 0) + ?"
                                + " WHERE group_code = ? AND brand = ?",
                        actual, row.get("group_code"), row.get("brand"));
                repaired++;
            }
            if (repaired > 0) {
                log.info("已修復 {} 條廣告明細的實收變動金額並同步賬戶實收余額", repaired);
            }
        } catch (Exception e) {
            log.warn("廣告明細實收變動修復失敗: {}", e.getMessage());
        }
    }

    /** 充值批次实收比例（实收充值 ÷ 虚拟充值），无实收批次返回 null */
    private BigDecimal batchActualRatioForRepair(String batchNo, String groupCode) {
        if (batchNo == null || "--".equals(batchNo)) {
            return groupActualRatioForRepair(groupCode);
        }
        List<Map<String, Object>> batches = jdbcTemplate.queryForList(
                "SELECT actual_amount, virtual_amount FROM biz_fin_batch"
                        + " WHERE batch_no = ? AND batch_type = 'recharge' LIMIT 1", batchNo);
        return ratioFromBatchRow(batches.isEmpty() ? null : batches.get(0));
    }

    /** 退款比例: 优先取原订单消费明细所挂批次的比例，找不到时用集团综合实收比例 */
    private BigDecimal refundRatioForRepair(String flowNo, String groupCode) {
        if (flowNo != null && !"--".equals(flowNo)) {
            List<Map<String, Object>> consumes = jdbcTemplate.queryForList(
                    "SELECT batch_no FROM biz_fin_detail WHERE flow_no = ? AND trade_type = '消費'"
                            + " AND virtual_change < 0 ORDER BY id LIMIT 1", flowNo);
            if (!consumes.isEmpty()) {
                BigDecimal ratio = batchActualRatioForRepair(ConvertUtils.toStr(consumes.get(0).get("batch_no")), groupCode);
                if (ratio != null) {
                    return ratio;
                }
            }
        }
        return groupActualRatioForRepair(groupCode);
    }

    /** 集团综合实收比例（Σ实收充值 ÷ Σ虚拟充值） */
    private BigDecimal groupActualRatioForRepair(String groupCode) {
        List<Map<String, Object>> sums = jdbcTemplate.queryForList(
                "SELECT IFNULL(SUM(actual_amount), 0) AS actual_total, IFNULL(SUM(virtual_amount), 0) AS virtual_total"
                        + " FROM biz_fin_batch WHERE group_code = ? AND batch_type = 'recharge'"
                        + " AND virtual_amount > 0", groupCode);
        return ratioFromBatchRow(sums.isEmpty() ? null : sums.get(0));
    }

    /** 从 actual_amount/virtual_amount 行计算比例，任一非正返回 null */
    private BigDecimal ratioFromBatchRow(Map<String, Object> row) {
        if (row == null) {
            return null;
        }
        Object actualRaw = row.containsKey("actual_amount") ? row.get("actual_amount") : row.get("actual_total");
        Object virtualRaw = row.containsKey("virtual_amount") ? row.get("virtual_amount") : row.get("virtual_total");
        if (actualRaw == null || virtualRaw == null) {
            return null;
        }
        BigDecimal actual = new BigDecimal(String.valueOf(actualRaw));
        BigDecimal virtual = new BigDecimal(String.valueOf(virtualRaw));
        if (actual.signum() <= 0 || virtual.signum() <= 0) {
            return null;
        }
        return actual.divide(virtual, 10, RoundingMode.HALF_UP);
    }

    /**
     * 存量库兼容: biz_ad_order 旧表无 algo_code / operator_* 列时自动补列（幂等）
     */
    private void ensureOrderExtraColumns() {
        addColumnIfAbsent("biz_ad_order", "algo_code",
                "ALTER TABLE biz_ad_order ADD COLUMN algo_code VARCHAR(64) COMMENT '算法ID快照' AFTER algo_name");
        addColumnIfAbsent("biz_ad_order", "operator_type",
                "ALTER TABLE biz_ad_order ADD COLUMN operator_type TINYINT COMMENT '下单人类型: 1=商家 2=业务人员' AFTER bd_emp_id");
        addColumnIfAbsent("biz_ad_order", "operator_id",
                "ALTER TABLE biz_ad_order ADD COLUMN operator_id VARCHAR(64) COMMENT '下单人ID (商家=门店ID, 业务人员=工号)' AFTER operator_type");
        addColumnIfAbsent("biz_ad_order", "operator_name",
                "ALTER TABLE biz_ad_order ADD COLUMN operator_name VARCHAR(64) COMMENT '下单人姓名' AFTER operator_id");
    }

    /**
     * 存量广告消费/退款明细迁移（幂等）:
     * 1) 旧口径变动类别「广告消费/广告退款」按备注识别广告类型（如无敌星星）;
     * 2) 未挂批次号的广告消费明细挂集团最早充值批次，使批次明细页可见消费记录
     */
    private void migrateAdConsumeDetails() {
        try {
            int renamed = jdbcTemplate.update(
                    "UPDATE biz_fin_detail SET change_type = SUBSTRING_INDEX(remark, '廣告', 1)"
                            + " WHERE change_type IN ('廣告消費', '廣告退款') AND remark LIKE '%廣告%'");
            int linked = jdbcTemplate.update(
                    "UPDATE biz_fin_detail d SET d.batch_no = ("
                            + "SELECT b.batch_no FROM biz_fin_batch b"
                            + " WHERE b.group_code = d.group_code AND b.batch_type = 'recharge'"
                            + " ORDER BY b.trade_time ASC, b.id ASC LIMIT 1)"
                            + " WHERE d.trade_type = '消費' AND d.virtual_change < 0"
                            + " AND (d.batch_no IS NULL OR d.batch_no = '')"
                            + " AND EXISTS (SELECT 1 FROM biz_fin_batch b2"
                            + " WHERE b2.group_code = d.group_code AND b2.batch_type = 'recharge')");
            if (renamed > 0 || linked > 0) {
                log.info("存量广告明细迁移完成: 變動類別重命名 {} 条, 补挂批次号 {} 条", renamed, linked);
            }
        } catch (Exception e) {
            log.warn("存量广告明细迁移失败: {}", e.getMessage());
        }
    }

    /**
     * 金字招牌计价表自动创建与补列（幂等）
     * 对应脚本: 54_golden_signboard_pricing.sql / 57_signboard_discount_mode.sql / 58_signboard_label_scenario.sql
     * 生产环境若未手动执行上述脚本，表或列缺失会导致 INSERT 报数据库异常。
     */
    private void ensureSignboardPricingTables() {
        // ── 1. 创建主表 biz_ad_pricing_signboard（含 discount_mode / global_discount_tiers 列） ──
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard ("
                + "id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                + "pricing_no      VARCHAR(32)   NOT NULL                   COMMENT '定价编号（DJZP + YYYYMMDD + 3位）', "
                + "algo_id         BIGINT        NOT NULL                   COMMENT '关联算法ID', "
                + "algo_name       VARCHAR(128)  DEFAULT NULL               COMMENT '算法名称快照', "
                + "brand           VARCHAR(32)   DEFAULT NULL               COMMENT '所属品牌', "
                + "channel         INT           DEFAULT NULL               COMMENT '业务频道', "
                + "presale_days    INT           NOT NULL DEFAULT 7         COMMENT '预售天数', "
                + "refund_enabled  INT           NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许 2=不允许', "
                + "cancel_fee_tiers TEXT         DEFAULT NULL               COMMENT '取消扣费梯度JSON', "
                + "discount_mode   VARCHAR(10)   NOT NULL DEFAULT 'local'   COMMENT '折扣模式: global/local', "
                + "global_discount_tiers TEXT    DEFAULT NULL               COMMENT '全局折扣梯度JSON', "
                + "status          INT           NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用', "
                + "remark          VARCHAR(255)  DEFAULT NULL               COMMENT '备注', "
                + "updated_by      VARCHAR(64)   DEFAULT NULL               COMMENT '最后更新人', "
                + "deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除', "
                + "created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间', "
                + "updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "UNIQUE KEY uk_pricing_signboard_no (pricing_no), "
                + "KEY idx_pricing_signboard_algo (algo_id), "
                + "KEY idx_pricing_signboard_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌计价主表'");

        // ── 2. 创建标签明细表 biz_ad_pricing_signboard_label（含 scenario 列） ──
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard_label ("
                + "id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                + "pricing_id      BIGINT        NOT NULL                   COMMENT '计价主表ID', "
                + "label_type      VARCHAR(32)   NOT NULL                   COMMENT '标签类型', "
                + "scenario        VARCHAR(32)   DEFAULT NULL               COMMENT '场景（all_macau/district/NULL）', "
                + "enabled         TINYINT       NOT NULL DEFAULT 1         COMMENT '是否启用', "
                + "price           DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '标签日单价', "
                + "discount_tiers  TEXT          DEFAULT NULL               COMMENT '梯度折扣JSON', "
                + "deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除', "
                + "created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间', "
                + "updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "KEY idx_signboard_label_pricing (pricing_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌标签计价明细表'");

        // ── 3. 存量表补列（表已存在但缺列的场景） ──
        addColumnIfAbsent("biz_ad_pricing_signboard", "discount_mode",
                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN discount_mode VARCHAR(10) NOT NULL DEFAULT 'local'"
                + " COMMENT '折扣模式: global/local' AFTER cancel_fee_tiers");
        addColumnIfAbsent("biz_ad_pricing_signboard", "global_discount_tiers",
                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN global_discount_tiers TEXT DEFAULT NULL"
                + " COMMENT '全局折扣梯度JSON' AFTER discount_mode");
        addColumnIfAbsent("biz_ad_pricing_signboard_label", "scenario",
                "ALTER TABLE biz_ad_pricing_signboard_label ADD COLUMN scenario VARCHAR(32) DEFAULT NULL"
                + " COMMENT '场景（all_macau/district/NULL）' AFTER label_type");

        log.info("金字招牌计价表结构就绪: biz_ad_pricing_signboard + biz_ad_pricing_signboard_label");
    }

    /**
     * 金字招牌计价结构后置校验：确认两张表及关键列（discount_mode/global_discount_tiers/scenario）均已就绪，
     * 任一缺失即抛异常，使 {@code applyOnce} 不记录成功版本并在下次启动重试。
     */
    private void verifySignboardPricing() {
        if (!tableExists("biz_ad_pricing_signboard")) {
            throw new IllegalStateException("金字招牌计价主表未就绪: biz_ad_pricing_signboard");
        }
        if (!columnExists("biz_ad_pricing_signboard", "discount_mode")) {
            throw new IllegalStateException("列未就绪: biz_ad_pricing_signboard.discount_mode");
        }
        if (!columnExists("biz_ad_pricing_signboard", "global_discount_tiers")) {
            throw new IllegalStateException("列未就绪: biz_ad_pricing_signboard.global_discount_tiers");
        }
        if (!tableExists("biz_ad_pricing_signboard_label")) {
            throw new IllegalStateException("金字招牌标签明细表未就绪: biz_ad_pricing_signboard_label");
        }
        if (!columnExists("biz_ad_pricing_signboard_label", "scenario")) {
            throw new IllegalStateException("列未就绪: biz_ad_pricing_signboard_label.scenario");
        }
    }

    /**
     * 列不存在时执行 ALTER（幂等）。
     * 兼容式治理：不再吞异常——补列失败必须向上抛出，使 {@link SchemaVersionTracker#applyOnce}
     * 不记录成功版本、写失败审计并在下次启动重试，杜绝“结构未就绪却被记为已迁移”。
     */
    private void addColumnIfAbsent(String table, String column, String ddl) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                        + " AND table_name = ? AND column_name = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(ddl);
            log.info("已为 {} 补充 {} 列", table, column);
        }
    }

    /** 表存在性检查（供结构后置校验使用）。 */
    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    /** 列存在性检查（供结构后置校验使用）。 */
    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                        + " AND table_name = ? AND column_name = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
