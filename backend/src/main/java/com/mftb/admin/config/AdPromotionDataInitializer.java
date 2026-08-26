package com.mftb.admin.config;

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

    @Override
    public void run(String... args) {
        // 各脚本/步骤独立容错: 单条失败仅记录日志, 不阻断后续初始化
        for (String script : INIT_SCRIPTS) {
            try {
                executeSqlScript(script);
            } catch (Exception e) {
                log.error("执行 {} 失败: {}", script, e.getMessage(), e);
            }
        }
        runSafely("biz_ad_pricing_star.sell_time_slots 补列", this::ensureSellTimeSlotsColumn);
        runSafely("biz_ad_pricing_star.slot_discounts 补列", this::ensureSlotDiscountsColumn);
        runSafely("biz_ad_order 扩展列补齐", this::ensureOrderExtraColumns);
        runSafely("库存与赠送快照列补齐", this::ensureStockAndGiftColumns);
        runSafely("biz_store.region 补列", this::ensureStoreRegionColumn);
        runSafely("biz_ad_cell_lock 唯一键升级", this::ensureCellLockGroupKey);
        runSafely("存量广告消费明细迁移", this::migrateAdConsumeDetails);
        runSafely("广告明细实收变动修复", this::repairAdDetailActualChange);
    }

    /** 单步容错执行: 异常仅记录不抛出 */
    private void runSafely(String name, Runnable task) {
        try {
            task.run();
        } catch (Exception e) {
            log.error("广告推广初始化 [{}] 失败: {}", name, e.getMessage(), e);
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
     * 存量库兼容: biz_ad_pricing_star 旧表无 sell_time_slots 列时自动补列（幂等）
     */
    private void ensureSellTimeSlotsColumn() {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                            + " AND table_name = 'biz_ad_pricing_star' AND column_name = 'sell_time_slots'",
                    Integer.class);
            if (count == null || count == 0) {
                jdbcTemplate.execute("ALTER TABLE biz_ad_pricing_star ADD COLUMN sell_time_slots JSON"
                        + " COMMENT '可售时段(JSON数组, 如[\"breakfast\",\"lunch\"], 空或含fullDay=全部时段)'");
                log.info("已为 biz_ad_pricing_star 补充 sell_time_slots 列");
            }
        } catch (Exception e) {
            log.warn("sell_time_slots 列检查/补列失败: {}", e.getMessage());
        }
    }

    /**
     * 存量库兼容: biz_ad_pricing_star 旧表无 slot_discounts 列时自动补列（幂等）
     */
    private void ensureSlotDiscountsColumn() {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                            + " AND table_name = 'biz_ad_pricing_star' AND column_name = 'slot_discounts'",
                    Integer.class);
            if (count == null || count == 0) {
                jdbcTemplate.execute("ALTER TABLE biz_ad_pricing_star ADD COLUMN slot_discounts JSON"
                        + " COMMENT '时段折扣配置(JSON数组, 分商圈, 百分比记法)'");
                log.info("已为 biz_ad_pricing_star 补充 slot_discounts 列");
            }
        } catch (Exception e) {
            log.warn("slot_discounts 列检查/补列失败: {}", e.getMessage());
        }
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
                        ? batchActualRatioForRepair(str(row.get("batch_no")), str(row.get("group_code")))
                        : refundRatioForRepair(str(row.get("flow_no")), str(row.get("group_code")));
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
                BigDecimal ratio = batchActualRatioForRepair(str(consumes.get(0).get("batch_no")), groupCode);
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

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
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
     * 1) 旧口径變動類別「廣告消費/廣告退款」按备注识别广告类型（如無敵星星）;
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

    /** 列不存在时执行 ALTER（幂等） */
    private void addColumnIfAbsent(String table, String column, String ddl) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                            + " AND table_name = '" + table + "' AND column_name = '" + column + "'",
                    Integer.class);
            if (count == null || count == 0) {
                jdbcTemplate.execute(ddl);
                log.info("已为 {} 补充 {} 列", table, column);
            }
        } catch (Exception e) {
            log.warn("{}.{} 列检查/补列失败: {}", table, column, e.getMessage());
        }
    }
}
