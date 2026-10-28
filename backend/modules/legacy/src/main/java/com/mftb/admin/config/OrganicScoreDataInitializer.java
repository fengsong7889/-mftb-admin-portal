package com.mftb.admin.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 自然流量评分配置初始化器: 启动时幂等创建评分维度/规则表并写入种子数据
 * <p>
 * 执行顺序：
 * 1. 幂等添加新数据库列（ALTER TABLE ... ADD COLUMN IF NOT EXISTS）
 * 2. 仅在检测到旧格式残留数据时执行迁移脚本（51_organic_score_code_normalization.sql）；
 *    该脚本会删除旧编码规则，对已是新格式的数据重复执行会把用户修改过的启停状态/分值重置为默认值
 * 3. 执行种子脚本（23_organic_score.sql）INSERT IGNORE 插入新格式数据
 * 4. 执行清理脚本（52_cleanup_tmp_organic_rules.sql）清理临时编码
 * <p>
 * <b>新增列注意事项</b>：{@link #NEW_COLUMNS} 的补列步骤被 {@code organic:columns-v1} 版本门控，
 * 生产已记为成功后再往该表追加条目<b>不会</b>重新执行（历史事故：multiplier_tiers 等三列漏建导致
 * 规则列表查询 500）。本表关键结构已登记到
 * {@link com.mftb.admin.config.migration.LegacyCoreContracts#organicScoreRuleContract()} 每次启动自愈，
 * 后续给 {@code biz_organic_score_rule} 加列必须同步登记契约（并递增契约列清单）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrganicScoreDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "23_organic_score.sql";
    private static final String MIGRATION_SCRIPT = "51_organic_score_code_normalization.sql";
    private static final String RENAME_SCRIPT = "53_rename_sto_to_stb_plt.sql";
    private static final String CLEANUP_SCRIPT = "52_cleanup_tmp_organic_rules.sql";
    private static final String COM02_PREREQ_SCRIPT = "187_com02_prerequisites.sql";

    /** COM_10 內置計分項舊名稱：僅仍為該值的行才更名，管理員自定義過的名稱不動 */
    static final String COM10_LEGACY_NAME = "購買廣告-金字招牌";
    /** COM_10 計分項新名稱：與前端 organicTrafficConfig 展示口徑一致 */
    static final String COM10_NEW_NAME = "金字招牌(廣告)";

    /** COM_04 內置計分項舊名稱：僅仍為該值的行才更名，管理員自定義過的名稱不動 */
    static final String COM04_LEGACY_NAME = "新客立減";
    /** COM_04 計分項新名稱：與前端 organicTrafficConfig 展示口徑一致 */
    static final String COM04_NEW_NAME = "門店新客券";
    /** COM_04 舊內置說明：僅仍為該值的行才同步，管理員自定義過的說明不動 */
    static final String COM04_LEGACY_DESCRIPTION = "商家參與新客立減活動加分";
    /** COM_04 新內置說明：把說明中的舊名稱一併改掉，避免名稱與說明口徑不一致 */
    static final String COM04_NEW_DESCRIPTION = "商家參與門店新客券活動加分";

    /** COM_06 舊名稱：種子帶「-按金額」後綴，早期界面保底顯示不帶後綴的名稱，兩種都收斂 */
    static final List<String> COM06_LEGACY_NAMES = List.of("會員紅包-按金額", "會員紅包");
    /** COM_06 計分項新名稱 */
    static final String COM06_NEW_NAME = "平台會員紅包";
    /** COM_06 舊內置說明：僅仍為該值的行才同步 */
    static final String COM06_LEGACY_DESCRIPTION = "商家設置會員紅包加分";
    /** COM_06 新內置說明 */
    static final String COM06_NEW_DESCRIPTION = "商家設置平台會員紅包加分";

    /** COM_07 舊名稱：種子帶「-按金額」後綴，早期界面保底顯示不帶後綴的名稱，兩種都收斂 */
    static final List<String> COM07_LEGACY_NAMES = List.of("閃蜂官方神券-按金額", "閃蜂官方神券");
    /** COM_07 計分項新名稱 */
    static final String COM07_NEW_NAME = "平台官方神券";
    /** COM_07 舊內置說明：僅仍為該值的行才同步 */
    static final String COM07_LEGACY_DESCRIPTION = "商家設置閃蜂官方神券加分";
    /** COM_07 新內置說明 */
    static final String COM07_NEW_DESCRIPTION = "商家設置平台官方神券加分";

    /** 已下架的內置計分項：前端已用 RETIRED_ORGANIC_RULE_IDS 過濾展示，此處收斂庫內殘留行，讓看庫/對賬與界面口徑一致 */
    static final List<String> RETIRED_RULE_CODES = List.of("COM_09", "STB_04");

    /** STB_02 conditionItems 中「休息打烊」槽位索引（與前端 BUSINESS_STATE_ITEMS 順序對齊） */
    static final int STB02_CLOSED_INDEX = 3;
    /** 系統過濾檔標記：該檔不計分而是不參與召回，避免消費方誤讀為「打烊扣 N 分」 */
    static final String FILTERED_CONDITION = "filtered";
    /** STB_02 舊內置評分說明的特徵片段：僅仍含該片段才同步新文案，管理員自定義過的不覆蓋 */
    static final String STB02_LEGACY_DESC_MARKER = "四檔狀態分別配置得分";
    /** STB_02 新評分說明：與前端展示口徑一致 */
    static final String STB02_NEW_DESCRIPTION =
            "營業中滿分；休息一會與爆單暫停（2小時自動恢復）按檔降權；休息打烊由系統直接過濾，不加載到瀑布流也不計分";

    /** STB_05 新名稱：原「出餐速度」改為按準時率梯度計分 */
    static final String STB05_NEW_NAME = "出餐準時率";
    /** STB_05 新評分說明：與前端展示口徑一致 */
    static final String STB05_NEW_DESCRIPTION =
            "統計過去N天（不含當天）出餐準時率，按準時率梯度計分：按率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分";
    /** 準時率檔位的 condition 標記（與前端 ONTIME_RATE_CONDITION 一致） */
    static final String ONTIME_RATE_CONDITION = "ontime_rate";
    /** STB_05 默認準時率梯度下界（%）與分值，兩數組一一對應，與前端 DEFAULT_ONTIME_RATE_BANDS 一致 */
    static final int[] STB05_DEFAULT_RATES = { 100, 95, 90, 80, 70 };
    static final int[] STB05_DEFAULT_SCORES = { 60, 50, 40, 25, 10 };

    /** condition_items JSON 读写用；不注入容器 bean，避免迁移依赖全局 Jackson 配置 */
    private static final ObjectMapper CONDITION_JSON = new ObjectMapper();

    /** 需要幂等添加的列：列名 → DDL 定义 */
    private static final Map<String, String> NEW_COLUMNS = new LinkedHashMap<>();
    static {
        NEW_COLUMNS.put("prerequisites",       "VARCHAR(500) DEFAULT NULL COMMENT '前提條件'");
        NEW_COLUMNS.put("stat_days_total",     "INT DEFAULT NULL COMMENT '歷史基線天數'");
        NEW_COLUMNS.put("stat_days_recent",    "INT DEFAULT NULL COMMENT '近期對比天數'");
        NEW_COLUMNS.put("time_range_scores",   "JSON DEFAULT NULL COMMENT '分時段配送範圍分數 JSON'");
        NEW_COLUMNS.put("condition_items",     "JSON DEFAULT NULL COMMENT '條件計分項 JSON'");
        NEW_COLUMNS.put("calc_interval_hours", "DECIMAL(5,2) DEFAULT NULL COMMENT '定時監控間隔小時數'");
        NEW_COLUMNS.put("peak_time_ranges",    "JSON DEFAULT NULL COMMENT '高峰時段定義 JSON'");
        NEW_COLUMNS.put("deduction_per_order", "INT DEFAULT NULL COMMENT '每單固定扣分'");
        NEW_COLUMNS.put("decay_coefficient",   "DECIMAL(10,4) DEFAULT NULL COMMENT '衰減係數'");
        NEW_COLUMNS.put("blocked_merchants",   "JSON DEFAULT NULL COMMENT '屏蔽商家列表 JSON'");
        NEW_COLUMNS.put("activity_items",      "JSON DEFAULT NULL COMMENT '活動加分配置 JSON'");
    }

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        // 各步骤按版本执行, 重启时已执行的直接跳过 (启动提速)
        // Step 1: 幂等添加新列 (一次性, 版本化)
        versionTracker.applyOnce("organic:columns-v1", this::migrateColumns);

        // Step 2: 仅在存在旧格式残留时执行迁移脚本（清理旧数据 + 更新已有规则字段）
        // 51 脚本会删除 STB_02~09 / PLT_03 / PLT_04 等编码后由种子重建为默认值，
        // 若对已完成迁移的库重复执行，会覆盖管理员配置的启停状态与分值，因此必须按需执行;
        // 无残留时直接标记完成, 后续重启不再检测也不再执行 (避免误覆盖管理员配置)
        try {
            versionTracker.applyOnce("organic:migrate-51-v1", () -> {
                if (hasLegacyOrganicRules()) {
                    runSqlScript(MIGRATION_SCRIPT);
                    log.info("检测到旧格式自然流量规则数据，已执行编码规范化迁移");
                }
            });
        } catch (Exception e) {
            log.error("自然流量评分编码规范化迁移失败：{}", e.getMessage(), e);
        }

        // Step 3: 执行重命名脚本（STO_ → STB_/PLT_ 前缀规范化）
        try {
            versionTracker.applyOnce("organic:rename-53-v1", () -> runSqlScript(RENAME_SCRIPT));
        } catch (Exception e) {
            log.error("自然流量评分编码重命名失败：{}", e.getMessage(), e);
        }

        // Step 4: 执行种子脚本（INSERT IGNORE 插入新格式数据）
        try {
            versionTracker.applyOnce("organic:seed-23-v1", () -> runSqlScript(INIT_SCRIPT));
        } catch (Exception e) {
            log.error("自然流量评分配置初始化失败：{}", e.getMessage(), e);
        }

        // Step 5: 清理临时编码 (一次性, 版本化)
        try {
            versionTracker.applyOnce("organic:cleanup-52-v1", () -> runSqlScript(CLEANUP_SCRIPT));
        } catch (Exception e) {
            log.error("自然流量评分临时编码清理失败：{}", e.getMessage(), e);
        }
        
        // Step 6: COM_02 减免运费增加前置条件 + 限定固定加分 (一次性, 版本化)
        try {
            versionTracker.applyOnce("organic:com02-prereq-v1", () -> {
                runSqlScript(COM02_PREREQ_SCRIPT);
                log.info("已更新 COM_02 减免运费前置条件为「報名減免運費」");
            });
        } catch (Exception e) {
            log.error("COM_02 减免运费前置条件迁移失败：{}", e.getMessage(), e);
        }

        // Step 7: COM_10 計分項更名為「金字招牌(廣告)」 (一次性, 版本化, 帶後置校驗)
        // 前端一直用保底覆蓋展示新名稱, 但庫裡仍是 23 種子腳本的舊內置名, 看庫/對賬口徑不一致;
        // 歷史種子腳本不得修改, 故單獨登記版本鍵做一次性收斂。參考 SQL: sql/232_organic_com10_rename.sql
        try {
            versionTracker.applyOnce("organic:com10-rename-v1", this::renameCom10Rule, this::verifyCom10Renamed);
        } catch (Exception e) {
            log.error("COM_10 計分項更名失敗：{}", e.getMessage(), e);
        }

        // Step 8: 收斂已下架的內置計分項 (一次性, 版本化, 帶後置校驗)
        // 前端不再展示 COM_09/STB_04，但 23 種子仍會寫入這兩行；用邏輯刪除對齊應用自身 deleteRule 的
        // @TableLogic 語義，保留歷史且可回滾。參考 SQL: sql/234_organic_retire_rules.sql
        try {
            versionTracker.applyOnce("organic:retire-rules-v1", this::retireOrganicRules, this::verifyRetiredRulesGone);
        } catch (Exception e) {
            log.error("自然流量下架計分項收斂失敗：{}", e.getMessage(), e);
        }

        // Step 9: STB_02「休息打烊」升級為系統過濾檔 (一次性, 版本化, 帶後置校驗)
        // 打烊不是扣分而是不加載到瀑布流，把語義寫進 condition_items，消費方不再靠索引位置猜。
        // 參考 SQL: sql/235_organic_stb02_filtered.sql
        try {
            versionTracker.applyOnce("organic:stb02-filtered-v1", this::markStb02ClosedAsFiltered, this::verifyStb02Filtered);
        } catch (Exception e) {
            log.error("STB_02 休息打烊過濾檔標記失敗：{}", e.getMessage(), e);
        }

        // Step 10: COM_04 計分項更名為「門店新客券」 (一次性, 版本化, 帶後置校驗)
        // 歷史種子腳本不得修改，故單獨登記版本鍵做一次性收斂。參考 SQL: sql/304_organic_com04_rename.sql
        try {
            versionTracker.applyOnce("organic:com04-rename-v1", this::renameCom04Rule, this::verifyCom04Renamed);
        } catch (Exception e) {
            log.error("COM_04 計分項更名失敗：{}", e.getMessage(), e);
        }

        // Step 11: COM_06/COM_07 更名為「平台會員紅包」/「平台官方神券」 (一次性, 版本化, 帶後置校驗)
        // 歷史種子腳本不得修改，故單獨登記版本鍵做一次性收斂。參考 SQL: sql/305_organic_com06_com07_rename.sql
        try {
            versionTracker.applyOnce("organic:com06-com07-rename-v1", this::renameCom06Com07Rules, this::verifyCom06Com07Renamed);
        } catch (Exception e) {
            log.error("COM_06/COM_07 計分項更名失敗：{}", e.getMessage(), e);
        }

        // Step 12: STB_05 出餐速度改為「出餐準時率」梯度 (一次性, 版本化, 帶後置校驗)
        // 舊均值口徑沒有需要保留的歷史數據：直接覆寫名稱/說明/condition_items 等同刪除舊檔位。
        // 參考 SQL: sql/307_organic_stb05_ontime_rate.sql
        try {
            versionTracker.applyOnce("organic:stb05-ontime-rate-v1", this::migrateStb05OntimeRate, this::verifyStb05OntimeRate);
        } catch (Exception e) {
            log.error("STB_05 出餐準時率遷移失敗：{}", e.getMessage(), e);
        }
    }

    /**
     * 將仍為舊內置名稱的 COM_10 行更名為新名稱。
     * 以舊值本身作條件：命中 0 行說明已收斂或名稱已被管理員自定義, 兩者均屬正常, 不得無條件覆蓋。
     */
    private void renameCom10Rule() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_10' AND name = ?",
                COM10_NEW_NAME, COM10_LEGACY_NAME);
        log.info("已更新 COM_10 計分項名稱「{}」→「{}」: {} 行", COM10_LEGACY_NAME, COM10_NEW_NAME, changed);
    }

    /** 後置校驗：查舊名稱殘留行數必須為 0（而非查新名稱存在），殘留說明 UPDATE 未打中，不記版本、下次啟動重試。 */
    private void verifyCom10Renamed() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = 'COM_10' AND name = ?",
                Integer.class, COM10_LEGACY_NAME);
        if (remains != null && remains > 0) {
            throw new IllegalStateException("COM_10 計分項仍為舊名稱「" + COM10_LEGACY_NAME + "」，更名未生效");
        }
    }

    /**
     * 將仍為舊內置名稱/舊內置說明的 COM_04 收斂為「門店新客券」。
     * 以舊值本身作條件：命中 0 行說明已收斂或名稱/說明已被管理員自定義，兩者均屬正常，不得無條件覆蓋。
     */
    private void renameCom04Rule() {
        int renamed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_04' AND name = ?",
                COM04_NEW_NAME, COM04_LEGACY_NAME);
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_04' AND description = ?",
                COM04_NEW_DESCRIPTION, COM04_LEGACY_DESCRIPTION);
        log.info("已更新 COM_04 計分項：名稱 {} 行，說明 {} 行", renamed, descChanged);
    }

    /** 後置校驗：舊名稱與舊內置說明均不得殘留（管理員自定義的值不屬於舊內置值，不會命中）。 */
    private void verifyCom04Renamed() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'COM_04' AND (name = ? OR description = ?)",
                Integer.class, COM04_LEGACY_NAME, COM04_LEGACY_DESCRIPTION);
        if (remains != null && remains > 0) {
            throw new IllegalStateException("COM_04 計分項仍存在舊名稱或舊說明，更名未生效");
        }
    }

    /**
     * 將仍為舊內置名稱/舊內置說明的 COM_06/COM_07 收斂為「平台會員紅包」/「平台官方神券」。
     * 名稱同時兼容歷史種子的「-按金額」後綴與早期界面顯示的不帶後綴名稱；
     * 管理員自定義過的名稱/說明不命中舊值，不會被覆蓋。
     */
    private void renameCom06Com07Rules() {
        int com06 = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_06' AND name IN (?, ?)",
                COM06_NEW_NAME, COM06_LEGACY_NAMES.get(0), COM06_LEGACY_NAMES.get(1));
        int com06Desc = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_06' AND description = ?",
                COM06_NEW_DESCRIPTION, COM06_LEGACY_DESCRIPTION);
        int com07 = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_07' AND name IN (?, ?)",
                COM07_NEW_NAME, COM07_LEGACY_NAMES.get(0), COM07_LEGACY_NAMES.get(1));
        int com07Desc = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'COM_07' AND description = ?",
                COM07_NEW_DESCRIPTION, COM07_LEGACY_DESCRIPTION);
        log.info("已更新 COM_06/COM_07 計分項：COM_06 名稱 {} 行、說明 {} 行；COM_07 名稱 {} 行、說明 {} 行",
                com06, com06Desc, com07, com07Desc);
    }

    /** 後置校驗：COM_06/COM_07 的舊名稱與舊內置說明均不得殘留。 */
    private void verifyCom06Com07Renamed() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE "
                        + "(rule_code = 'COM_06' AND (name IN (?, ?) OR description = ?)) OR "
                        + "(rule_code = 'COM_07' AND (name IN (?, ?) OR description = ?))",
                Integer.class,
                COM06_LEGACY_NAMES.get(0), COM06_LEGACY_NAMES.get(1), COM06_LEGACY_DESCRIPTION,
                COM07_LEGACY_NAMES.get(0), COM07_LEGACY_NAMES.get(1), COM07_LEGACY_DESCRIPTION);
        if (remains != null && remains > 0) {
            throw new IllegalStateException("COM_06/COM_07 計分項仍存在舊名稱或舊說明，更名未生效");
        }
    }

    /** 逻辑删除已下架的内置计分项（保留历史、可回滚，与应用 deleteRule 的 @TableLogic 语义一致）。 */
    private void retireOrganicRules() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET deleted = 1, updated_by = 'system' WHERE deleted = 0 AND rule_code IN ("
                        + retiredPlaceholders() + ")",
                RETIRED_RULE_CODES.toArray());
        log.info("已逻辑删除下架計分項 {}: {} 行", RETIRED_RULE_CODES, changed);
    }

    /** 后置校验：下架编码不得再有未删除的残留行，残留说明 UPDATE 未打中，不记版本、下次启动重试。 */
    private void verifyRetiredRulesGone() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE deleted = 0 AND rule_code IN ("
                        + retiredPlaceholders() + ")",
                Integer.class, RETIRED_RULE_CODES.toArray());
        if (remains != null && remains > 0) {
            throw new IllegalStateException("下架計分項仍有 " + remains + " 行未收斂：" + RETIRED_RULE_CODES);
        }
    }

    private static String retiredPlaceholders() {
        return RETIRED_RULE_CODES.stream().map(code -> "?").collect(Collectors.joining(", "));
    }

    /**
     * 把 STB_02 第 4 槽（休息打烊）标记为系统过滤档：condition 改為 filtered、分值归 0；
     * 评分说明仅在仍为旧内置文案时同步，管理员自定义过的不覆盖。
     */
    private void markStb02ClosedAsFiltered() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_02' AND deleted = 0")) {
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (items == null || items.size() <= STB02_CLOSED_INDEX) {
                continue;
            }
            Map<String, Object> closed = items.get(STB02_CLOSED_INDEX);
            if (FILTERED_CONDITION.equals(closed.get("condition"))) {
                continue;
            }
            closed.put("condition", FILTERED_CONDITION);
            closed.put("score", 0);
            writeConditionItems(row.get("id"), items);
            log.info("已將 STB_02 第 {} 檔（休息打烊）標記為系統過濾檔", STB02_CLOSED_INDEX + 1);
        }
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_02' AND deleted = 0 AND description LIKE ?",
                STB02_NEW_DESCRIPTION, "%" + STB02_LEGACY_DESC_MARKER + "%");
        if (descChanged > 0) {
            log.info("已同步 STB_02 評分說明：{} 行", descChanged);
        }
    }

    /** 后置校验：第 4 槽必须是 filtered（槽位不足或为空的行无标记可加，不视为失败）。 */
    private void verifyStb02Filtered() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_02' AND deleted = 0")) {
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (items == null || items.size() <= STB02_CLOSED_INDEX) {
                continue;
            }
            if (!FILTERED_CONDITION.equals(items.get(STB02_CLOSED_INDEX).get("condition"))) {
                throw new IllegalStateException("STB_02 休息打烊檔仍未標記為系統過濾檔，遷移未生效");
            }
        }
    }

    /**
     * 把 STB_05 整行收斂為「出餐準時率」梯度：名稱、說明與 condition_items 一律覆寫。
     * 舊均值口徑（over_avg_deduction / 主輔營達標）沒有需要保留的歷史數據，覆寫即等同刪除舊檔位。
     */
    private void migrateStb05OntimeRate() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, description = ?, condition_items = ?, "
                        + "stat_days_total = COALESCE(stat_days_total, 7), updated_by = 'system' "
                        + "WHERE rule_code = 'STB_05' AND deleted = 0",
                STB05_NEW_NAME, STB05_NEW_DESCRIPTION, buildStb05ConditionItems());
        log.info("已將 STB_05 出餐計分改為準時率梯度：{} 行", changed);
    }

    /** 按默認梯度生成 condition_items JSON（rate=率下界、score=分值，順序即匹配順序）。 */
    private String buildStb05ConditionItems() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < STB05_DEFAULT_RATES.length; i++) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("condition", ONTIME_RATE_CONDITION);
            item.put("rate", STB05_DEFAULT_RATES[i]);
            item.put("score", STB05_DEFAULT_SCORES[i]);
            items.add(item);
        }
        try {
            return CONDITION_JSON.writeValueAsString(items);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("STB_05 準時率檔位序列化失敗", e);
        }
    }

    /**
     * 後置校驗：STB_05 若存在，名稱必須是新名且 condition_items 必須是準時率梯度；
     * 不存在不算失敗（未播種的環境由前端默認梯度兌底）。
     */
    private void verifyStb05OntimeRate() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT name, condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_05' AND deleted = 0")) {
            if (!STB05_NEW_NAME.equals(row.get("name"))) {
                throw new IllegalStateException("STB_05 名稱未收斂為「" + STB05_NEW_NAME + "」：" + row.get("name"));
            }
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (items == null || items.isEmpty()
                    || !ONTIME_RATE_CONDITION.equals(items.get(0).get("condition"))
                    || items.get(0).get("rate") == null) {
                throw new IllegalStateException("STB_05 檔位不是準時率梯度，遷移未生效");
            }
        }
    }

    /** 解析 condition_items；内容非法时抛出，避免把坏数据当成就绪 */
    private List<Map<String, Object>> parseConditionItems(Object raw) {
        if (raw == null) {
            return null;
        }
        String json = String.valueOf(raw);
        // MySQL JSON 列可能存字符串 "null"，不能当成有效数组
        if (json.isBlank() || "null".equals(json)) {
            return null;
        }
        try {
            return CONDITION_JSON.readValue(json, new TypeReference<List<Map<String, Object>>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("condition_items 不是合法 JSON 數組: " + json, e);
        }
    }

    private void writeConditionItems(Object id, List<Map<String, Object>> items) {
        try {
            jdbcTemplate.update(
                    "UPDATE biz_organic_score_rule SET condition_items = ?, updated_by = 'system' WHERE id = ?",
                    CONDITION_JSON.writeValueAsString(items), id);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("condition_items 序列化失敗", e);
        }
    }

    /** 在版本化 lambda 内执行脚本, 将受检异常转为运行时异常 */
    private void runSqlScript(String scriptName) {
        try {
            executeSqlScript(scriptName);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("读取初始化脚本失败: " + scriptName, e);
        }
    }

    /**
     * 检测是否存在旧格式规则数据（旧编码 STO_* / 临时编码 *TMP* / 已废弃编码）。
     * 新格式种子不含这些编码，命中任一即说明库尚未完成编码规范化迁移。
     * 检测异常时保守返回 false，避免误删管理员已配置的规则。
     */
    private boolean hasLegacyOrganicRules() {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code LIKE 'STO\\_%'"
                            + " OR rule_code LIKE '%TMP%'"
                            + " OR rule_code IN ('STB_10','STB_11','STB_12','PLT_02','PLT_05','PLT_06','COM_08','COM_11')",
                    Integer.class);
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("检测自然流量旧格式数据失败，跳过迁移脚本: {}", e.getMessage());
            return false;
        }
    }

    /** 幂等添加缺失的数据库列 */
    private void migrateColumns() {
        for (Map.Entry<String, String> entry : NEW_COLUMNS.entrySet()) {
            String col = entry.getKey();
            String def = entry.getValue();
            try {
                Integer count = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_organic_score_rule' AND COLUMN_NAME = ?",
                        Integer.class, col);
                if (count != null && count == 0) {
                    jdbcTemplate.execute("ALTER TABLE `biz_organic_score_rule` ADD COLUMN `" + col + "` " + def);
                    log.info("已添加 biz_organic_score_rule.{} 列", col);
                }
            } catch (Exception e) {
                log.warn("添加列 {} 时出错: {}", col, e.getMessage());
            }
        }
    }

    /** 执行初始化脚本（去除行注释后按分号逐条执行，CREATE TABLE IF NOT EXISTS + INSERT 幂等） */
    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳过自然流量评分初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            // 去除行注释（-- 开头）
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            // 按分号分割并逐条执行
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 {} 初始化自然流量评分配置表", scriptName);
        }
    }
}
