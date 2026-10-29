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

    /** STB_06 旧名称：仅用于回滚说明与测试数据，迁移整行覆写（旧口径无需要保留的历史数据） */
    static final String STB06_LEGACY_NAME = "拒絕接單";
    /** STB_06 新名称：与前端 organicTrafficConfig 展示口径一致 */
    static final String STB06_NEW_NAME = "自動接單";
    /** STB_06 新评分说明：与前端展示口径一致 */
    static final String STB06_NEW_DESCRIPTION =
            "商家在店端開啟自動接單即得固定加分，未開啟不加分；不再按拒絕單量計罰";
    /** STB_06 默认固定加分：与前端 AUTO_ACCEPT_DEFAULT_SCORE 一致 */
    static final int STB06_DEFAULT_SCORE = 50;
    /** 计分方式存储编码：1=规则加分，与前端 ScoreMode.RULE_BONUS 一致（旧 STB_06 为 3=规则减分） */
    static final int MODE_RULE_BONUS = 1;
    /** 计分方式存储编码：6=条件计分，与前端 ScoreMode.CONDITIONAL 一致 */
    static final int MODE_CONDITIONAL = 6;

    /**
     * STB_03 旧内置名称与说明（= 23_organic_score.sql 种子值）：仅仍为该值的行才收敛，
     * 管理员自定义过的文案不覆盖。
     */
    static final String STB03_LEGACY_NAME = "評價得分";
    static final String STB03_LEGACY_DESCRIPTION = "統計天數內顧客評價星級計分，支持固定加扣分或動態倍率";
    /** STB_03 新名称与评分说明：分数改由业务系统实时传入，本项只配档位，因此文案不能再写「统计天数内」 */
    static final String STB03_NEW_NAME = "店鋪綜合分";
    static final String STB03_NEW_DESCRIPTION =
            "店鋪綜合分由業務系統實時傳遞，以最新傳入值比對梯度檔位固定加分：分數越高加分越多，命中一檔即停、分數不累加，低於最低檔不加分";
    /** 店铺综合分档位标记（与前端 STAR_TIER_CONDITION 一致）：star=分数下界，1 星 = 1 分且支持半星 */
    static final String STAR_TIER_CONDITION = "star_tier";
    /** STB_03 默认星级梯度下界与分值，两数组一一对应，与前端 DEFAULT_STAR_TIER_BANDS 一致 */
    static final double[] STB03_DEFAULT_STARS = { 5, 4.5, 4, 3.5, 3 };
    static final int[] STB03_DEFAULT_SCORES = { 50, 40, 30, 15, 5 };

    /**
     * STB_05 旧评分说明的两个合法内置值：种子原文与 organic:stb05-ontime-rate-v1 写回的文案。
     * 本步只改「统计窗口由谁定」的口径，因此仍只在这两个内置值上收敛，管理员自定义的不顶。
     */
    static final List<String> STB05_LEGACY_DESCRIPTIONS = List.of(
            "統計過去N天（不含當天）出餐均值，當天出餐時間超過均值即扣分",
            STB05_NEW_DESCRIPTION);
    /** STB_05 新评分说明：统计窗口改由业务系统定时任务决定，本页不再配置统计天数 */
    static final String STB05_TIMED_DESCRIPTION =
            "出餐準時率由業務系統定時任務計算後傳遞（非實時傳數），本項只配置檔位與分值：按準時率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分";

    /** STB_08 旧内置名称与说明（= 23 种子值）：仅仍为该值的行才收敛 */
    static final String STB08_LEGACY_NAME = "取消訂單";
    static final String STB08_LEGACY_DESCRIPTION = "統計天數內（含當天），每取消一單固定扣分，即時生效";
    /** STB_08 新名称与说明：由按次计罚扣分翻转为取消率梯度加分 */
    static final String STB08_NEW_NAME = "訂單取消率";
    static final String STB08_NEW_DESCRIPTION =
            "統計期內外賣單的取消率（自取單不納入，用戶取消與商家取消均計入），單量達門檻才納入，按取消率梯度加分：取消率越低加分越多，命中一檔即停、不累加，高於最高檔不加分";
    /** 取消率档位标记（与前端 CANCEL_RATE_CONDITION 一致）：rate=取消率上界（%）、score=该档固定加分 */
    static final String CANCEL_RATE_CONDITION = "cancel_rate_max";
    /** 样本量门槛标记（与前端 CANCEL_SAMPLE_CONDITION 一致）：minOrders=统计期内纳入计算的最低单量 */
    static final String CANCEL_SAMPLE_CONDITION = "cancel_min_orders";
    /** STB_08 默认统计天数与纳入单量门槛，与前端 statDays 默认 30 / DEFAULT_CANCEL_MIN_ORDERS 一致 */
    static final int STB08_DEFAULT_STAT_DAYS = 30;
    static final int STB08_DEFAULT_MIN_ORDERS = 30;
    /** STB_08 默认取消率上界（%）与分值，两数组一一对应，与前端 DEFAULT_CANCEL_RATE_BANDS 一致 */
    static final int[] STB08_DEFAULT_RATES = { 1, 3, 5 };
    static final int[] STB08_DEFAULT_SCORES = { 30, 20, 10 };

    /** STB_ACT 旧内置评分说明：种子原文与早期界面写回的「暂以算法库对接」文案，两个都收敛 */
    static final List<String> STB_ACT_LEGACY_DESCRIPTIONS = List.of(
            "店鋪報名參與系統活動即得固定加分；按活動ID配置，系統自動獲取活動名稱與狀態，每個活動獨立計分",
            "店鋪報名參與活動即得固定加分；暫以算法庫算法ID配置驗證（後續對接系統活動），系統自動獲取名稱與狀態，每個獨立計分");
    /** STB_ACT 新评分说明：补上「只有正常进行中的活动才计分」的业务口径 */
    static final String STB_ACT_NEW_DESCRIPTION =
            "活動資料由業務系統同步，僅正常進行中的活動計分；已過期、失效或未開始的活動不加分。店鋪報名進行中的活動即得固定加分，多個活動獨立計分、可累加";

    /** 流量均衡：PLT_03 合并后的内置名称（统一商家扶持与订单过热调控） */
    static final String TRAFFIC_BALANCE_NAME = "流量均衡";
    /** 流量均衡：合并后的内置评分说明，写清统计口径与非负加分边界 */
    static final String TRAFFIC_BALANCE_DESCRIPTION =
            "統一商家扶持與訂單過熱調控：按滾動過去 N 天的外賣/自取訂單量梯度非負加分，訂單量越高加分越少；已取消訂單不納入，退款是否計入可配。本頁僅配檔位，算分由業務系統消費 traffic_balance_config";
    /** 计分方式存储编码：5=梯度计分，与前端 ScoreMode.TIERED 一致 */
    static final int MODE_TIERED = 5;
    /** 流量均衡默认统计天数与更新间隔（分钟），与前端 DEFAULT_TRAFFIC_BALANCE_CONFIG 一致 */
    static final int TRAFFIC_BALANCE_DEFAULT_STAT_DAYS = 7;
    static final int TRAFFIC_BALANCE_DEFAULT_REFRESH_MINUTES = 60;
    /** 流量均衡默认梯度分值（订单量门槛留空由运营按新口径校准），与前端建议档位一致 */
    static final int[] TRAFFIC_BALANCE_DEFAULT_SCORES = { 80, 60, 50, 30 };

    /** STB_07 旧内置名称（= 23 种子值）：仅仍为该值的行才收敛，管理员自定义过的不顶 */
    static final String STB07_LEGACY_NAME = "出餐超時";
    /** STB_07 旧内置评分说明（= 23 种子值） */
    static final String STB07_LEGACY_DESCRIPTION = "統計天數內（不含當天），每超時一單固定扣分，即時生效";
    /** STB_07 新名称：计分主体由「罚超时」翻转为「按出餐时长给固定加分」 */
    static final String STB07_NEW_NAME = "出餐時長";
    /** STB_07 新评分说明：与前端 organicTrafficConfig 展示口径一致 */
    static final String STB07_NEW_DESCRIPTION = "開啟自動校正後按出餐時長計分，命中即得固定加分，不累加";
    /** STB_07 默认固定加分：与前端 MEAL_TIME_DEFAULT_SCORE 一致 */
    static final int STB07_DEFAULT_SCORE = 50;
    /**
     * STB_07「開啟自動校正」的存储值：沿用既有 prerequisites 列（与 COM_02 减免运费同先例），
     * 非空视为开启。值必须与前端 MEAL_TIME_AUTO_CORRECT_PREREQUISITE 一致，否则迁移播种的行在界面会被读成未开启。
     */
    static final String STB07_AUTO_CORRECT_PREREQUISITE = "開啟自動校正";

    /** STB_09「超時接單」下架編碼：現有 organic:retire-rules-v1 只覆蓋 COM_09/STB_04 且生產已記成功，故用獨立新鍵收斂 */
    static final String RETIRED_STB09_RULE_CODE = "STB_09";

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

        // Step 13: STB_06「拒絕接單·按次計罰扣分」改為「自動接單·固定加分」 (一次性, 版本化, 帶後置校驗)
        // 計分主體由「處罰拒單」翻轉為「獎勵開啟自動接單」，mode/score/name/description 必須一起改，
        // 否則界面保底與庫內口徑長期不一致。舊口徑的分值住在 deduction_per_order，
        // 參考 SQL: sql/310_organic_stb06_auto_accept.sql
        try {
            versionTracker.applyOnce("organic:stb06-auto-accept-v1", this::migrateStb06AutoAccept, this::verifyStb06AutoAccept);
        } catch (Exception e) {
            log.error("STB_06 自動接單計分遷移失敗：{}", e.getMessage(), e);
        }

        // Step 14: STB_03「評價得分・逐檔星級加減分」改為「店鋪綜合分・星級梯度加分」 (一次性, 版本化, 帶後置校驗)
        // 分數改由業務系統實時傳入、本項不再統計期間；舊口徑是「星級恰好等於 N 星」的一檔一價，
        // 新口徑是「綜合分 ≥ 下界」的梯度查檔，兩者無法逐檔映射（把舊的 4 星檔分當「≥4」寫回會把 4.5 星也給 4 星的分），
        // 因此不做兼容轉換：覆寫為默認梯度，但只覆寫仍是舊口徑的行，界面已配成 star_tier 的行原封不動。
        // 參考 SQL: sql/311_organic_stb03_star_tier.sql
        try {
            versionTracker.applyOnce("organic:stb03-star-tier-v1", this::migrateStb03StarTier, this::verifyStb03StarTier);
        } catch (Exception e) {
            log.error("STB_03 店鋪綜合分梯度遷移失敗：{}", e.getMessage(), e);
        }

        // Step 15: STB_05 統計窗口交給業務系統定時任務 (一次性, 版本化, 帶後置校驗)
        // 界面已移除统计天数配置：stat_days_total / stat_days_recent 置 NULL，留着会被读成「本项还能在本页调窗口」；
        // 评分说明同步为「定时任务计算、非实时传数」口径。参考 SQL: sql/312_organic_stb05_timed_source.sql
        try {
            versionTracker.applyOnce("organic:stb05-timed-source-v1", this::migrateStb05TimedSource, this::verifyStb05TimedSource);
        } catch (Exception e) {
            log.error("STB_05 準時率取數口徑遷移失敗：{}", e.getMessage(), e);
        }

        // Step 16: STB_08「取消订单·按次计罚扣分」改为「订单取消率·梯度加分」 (一次性, 版本化, 带后置校验)
        // 计分主体翻转：从「每取消一单扣 deduction_per_order 分」改为「取消率 ≤ 上界即得该档固定加分」，
        // 因此 mode（3→6）/name/description/condition_items 必须一起收敛；stat_days 保留（新口径仍按统计天数取数）。
        // 旧口径专用列 deduction_per_order 置 NULL；参考 SQL: sql/313_organic_stb08_cancel_rate.sql
        try {
            versionTracker.applyOnce("organic:stb08-cancel-rate-v1", this::migrateStb08CancelRate, this::verifyStb08CancelRate);
        } catch (Exception e) {
            log.error("STB_08 訂單取消率遷移失敗：{}", e.getMessage(), e);
        }

        // Step 17: STB_ACT 评分说明补「仅正常进行中的活动计分」口径 (一次性, 版本化, 带后置校验)
        // 界面已改为下拉选活动并直接带出名称/状态，业务口径是「已过期、失效、未开始的活动不加分」，
        // 库里不同步这句就会与界面长期不一致。参考 SQL: sql/314_organic_stb_act_scope.sql
        try {
            versionTracker.applyOnce("organic:stb-act-scope-v1", this::migrateStbActScope, this::verifyStbActScope);
        } catch (Exception e) {
            log.error("STB_ACT 活動加分口徑遷移失敗：{}", e.getMessage(), e);
        }

        // Step 18: STB_07「出餐超時·按次計罰扣分」改為「出餐時長·固定加分 + 開啟自動校正」 (一次性, 版本化, 帶後置校驗)
        // 计分主体翻转与 STB_06 同构：mode（3→1）/name/description/score 必须一起收敛，只改前端加载保底
        // 会让看库/对账口径与界面长期不一致；配置项「開啟自動校正」住在既有 prerequisites 列，
        // 不新增列（避免同时递增 LegacyCoreContracts 契约与契约测试）。旧口径专用列 stat_days / deduction_per_order 置 NULL。
        // 参考 SQL: sql/315_organic_stb07_meal_time.sql
        try {
            versionTracker.applyOnce("organic:stb07-meal-time-v1", this::migrateStb07MealTime, this::verifyStb07MealTime);
        } catch (Exception e) {
            log.error("STB_07 出餐時長計分遷移失敗：{}", e.getMessage(), e);
        }

        // Step 19: STB_09「超時接單」下架 (一次性, 版本化, 帶後置校驗)
        // 前端已从默认计分项移除并加入 RETIRED_ORGANIC_RULE_IDS，但 organic:retire-rules-v1 只覆盖 COM_09/STB_04
        // 且生产已记成功不会重跑，故单独登记新键逻辑删除 STB_09，保留历史可回滚。参考 SQL: sql/316_organic_retire_stb09.sql
        try {
            versionTracker.applyOnce("organic:retire-stb09-v1", this::retireStb09Rule, this::verifyStb09Retired);
        } catch (Exception e) {
            log.error("STB_09 超時接單下架收斂失敗：{}", e.getMessage(), e);
        }

        // Step 20: 商家扶持(PLT_03)与订单过热调控(PLT_04)合并为「流量均衡」 (一次性, 版本化, 带后置校验)
        // ES 底座难以实现减分项：把「高单量扣分」翻转为「低单量多加分、高单量少加分」的非负梯度，
        // 统计口径/订单类型/退款计入/排除商家/区域梯度统一存进 traffic_balance_config。
        // PLT_03 只在尚未合并（traffic_balance_config IS NULL）时整行收敛，避免重放覆盖运营已配置的值；
        // 旧屏蔽名单不自动沿用（含义从“只取消额外扶持”变为“取消整项均衡奖励”），region_configs 置 NULL。
        // PLT_04 逻辑删除下架（deleted=1，同 COM_09/STB_04），算分侧改由业务系统读取 traffic_balance_config。
        // 参考 SQL: sql/317_organic_traffic_balance.sql
        try {
            versionTracker.applyOnce("organic:traffic-balance-v1", this::migrateTrafficBalance, this::verifyTrafficBalance);
        } catch (Exception e) {
            log.error("流量均衡合并迁移失败：{}", e.getMessage(), e);
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

    /**
     * 把 STB_06 整行收敛为「自動接單」固定加分：名称、说明、计分方式与分值一律覆写。
     * 旧口径（每拒一单扣 deduction_per_order 分）没有需要保留的历史数据；score 仅在未配置（=0，
     * 旧界面从不写 score）时补默认 50 分，避免把管理员在界面上调过的分值顶掉。
     * 旧口径专用列 stat_days / deduction_per_order 置 NULL：留着会让看库的人误以为本项还在按次扣分。
     */
    private void migrateStb06AutoAccept() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, description = ?, mode = ?, "
                        + "score = COALESCE(NULLIF(score, 0), ?), stat_days = NULL, deduction_per_order = NULL, "
                        + "updated_by = 'system' "
                        + "WHERE rule_code = 'STB_06' AND deleted = 0",
                STB06_NEW_NAME, STB06_NEW_DESCRIPTION, MODE_RULE_BONUS, STB06_DEFAULT_SCORE);
        log.info("已將 STB_06 拒絕接單計罰改為自動接單固定加分：{} 行", changed);
    }

    /**
     * 后置校验：STB_06 若存在，必须是加分口径（名称/方式/正分值）且不得残留旧口径列；
     * 不满足则抛出让启动暴露（不记版本、下次启动重试）。不存在不算失败（未播种的环境由前端默认分值兜底）。
     */
    private void verifyStb06AutoAccept() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT name, mode, score, stat_days, deduction_per_order FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_06' AND deleted = 0")) {
            if (!STB06_NEW_NAME.equals(row.get("name"))) {
                throw new IllegalStateException("STB_06 名称未收敛为「" + STB06_NEW_NAME + "」：" + row.get("name"));
            }
            if (!(row.get("mode") instanceof Number) || ((Number) row.get("mode")).intValue() != MODE_RULE_BONUS) {
                throw new IllegalStateException("STB_06 計分方式不是規則加分（mode=" + row.get("mode") + "），遷移未生效");
            }
            if (!(row.get("score") instanceof Number) || ((Number) row.get("score")).intValue() <= 0) {
                throw new IllegalStateException("STB_06 固定加分未配置（score=" + row.get("score") + "），遷移未生效");
            }
            if (row.get("stat_days") != null || row.get("deduction_per_order") != null) {
                throw new IllegalStateException("STB_06 仍殘留舊按次計罰配置（stat_days / deduction_per_order），遷移未生效");
            }
        }
    }

    /**
     * 把 STB_03 收敛为「店鋪綜合分」星級梯度加分：名称/说明以旧内置值为条件只改一次，
     * condition_items 只覆写仍是旧口径（逐档固定/动态加减分）的行，界面已配成 star_tier 的保留。
     * 旧口径专用列 stat_days 置 NULL：本项不再统计期间，留着会被读成「仍按 N 天滚动统计」。
     */
    private void migrateStb03StarTier() {
        int renamed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_03' AND deleted = 0 AND name = ?",
                STB03_NEW_NAME, STB03_LEGACY_NAME);
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_03' AND deleted = 0 AND description = ?",
                STB03_NEW_DESCRIPTION, STB03_LEGACY_DESCRIPTION);
        int banded = 0;
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_03' AND deleted = 0")) {
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (isStarTierGradient(items)) {
                continue;
            }
            writeConditionItems(row.get("id"), buildStarTierItems());
            banded++;
        }
        int cleared = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET stat_days = NULL, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_03' AND deleted = 0 AND stat_days IS NOT NULL");
        log.info("已將 STB_03 評價得分改為店鋪綜合分梯度加分：名稱 {} 行、說明 {} 行、檔位 {} 行、清空統計天數 {} 行",
                renamed, descChanged, banded, cleared);
    }

    /** condition_items 是否已是店铺综合分梯度：每一项都得是带 star 下界的 star_tier，混有旧口径项即视为未收敛 */
    private boolean isStarTierGradient(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            return false;
        }
        return items.stream().allMatch(item -> STAR_TIER_CONDITION.equals(item.get("condition"))
                && item.get("star") instanceof Number);
    }

    /** 按默认梯度生成 STB_03 condition_items（star=分数下界、score=固定加分，顺序即匹配顺序，从高到低） */
    private List<Map<String, Object>> buildStarTierItems() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < STB03_DEFAULT_STARS.length; i++) {
            Map<String, Object> band = new LinkedHashMap<>();
            band.put("condition", STAR_TIER_CONDITION);
            band.put("star", STB03_DEFAULT_STARS[i]);
            band.put("score", STB03_DEFAULT_SCORES[i]);
            items.add(band);
        }
        return items;
    }

    /**
     * 后置校验：STB_03 不得残留旧内置名称/旧内置说明，不得残留 stat_days，
     * condition_items 若非空则必须已是 star_tier 梯度。未播种（无行）不算失败，由前端默认梯度兜底。
     */
    private void verifyStb03StarTier() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT name, description, condition_items, stat_days FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_03' AND deleted = 0")) {
            if (STB03_LEGACY_NAME.equals(row.get("name"))) {
                throw new IllegalStateException("STB_03 名称仍为旧内置「" + STB03_LEGACY_NAME + "」，迁移未生效");
            }
            if (STB03_LEGACY_DESCRIPTION.equals(row.get("description"))) {
                throw new IllegalStateException("STB_03 评分说明仍是旧内置文案，迁移未生效");
            }
            if (row.get("stat_days") != null) {
                throw new IllegalStateException("STB_03 仍残留统计天数（stat_days=" + row.get("stat_days") + "），迁移未生效");
            }
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (items != null && !items.isEmpty() && !isStarTierGradient(items)) {
                throw new IllegalStateException("STB_03 档位不是店铺综合分梯度（condition=star_tier），迁移未生效");
            }
        }
    }

    /**
     * 把 STB_05 的统计窗口交给业务系统定时任务：说明文案以两个已知内置值为条件收敛（管理员自定义的不顶），
     * stat_days_total / stat_days_recent 置 NULL，避免界面已移除该配置而库里还留着窗口值。
     */
    private void migrateStb05TimedSource() {
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_05' AND deleted = 0 AND description IN (?, ?)",
                STB05_TIMED_DESCRIPTION, STB05_LEGACY_DESCRIPTIONS.get(0), STB05_LEGACY_DESCRIPTIONS.get(1));
        int cleared = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET stat_days_total = NULL, stat_days_recent = NULL, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_05' AND deleted = 0 "
                        + "AND (stat_days_total IS NOT NULL OR stat_days_recent IS NOT NULL)");
        log.info("已將 STB_05 出餐準時率改為定時任務取數：說明 {} 行、清空統計窗口 {} 行", descChanged, cleared);
    }

    /** 后置校验：STB_05 不得残留两个旧内置说明，也不得残留统计窗口列；未播种不算失败。 */
    private void verifyStb05TimedSource() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT description, stat_days_total, stat_days_recent FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_05' AND deleted = 0")) {
            if (STB05_LEGACY_DESCRIPTIONS.contains(row.get("description"))) {
                throw new IllegalStateException("STB_05 评分说明仍是旧内置文案，定時任務口徑未寫回");
            }
            if (row.get("stat_days_total") != null || row.get("stat_days_recent") != null) {
                throw new IllegalStateException("STB_05 仍残留统计窗口列（stat_days_total / stat_days_recent），迁移未生效");
            }
        }
    }

    /**
     * 把 STB_08 由「取消订单·按次计罚扣分」收敛为「订单取消率·梯度加分」：
     * mode（3→6）/名称/说明/档位一起改写，档位只覆写仍是旧口径的行（界面已配成新梯度则保留）；
     * stat_days 保留并仅在未配置时补默认 30 天（新口径仍按统计天数取数），
     * 旧口径专用的 deduction_per_order 置 NULL，留着会被读成「本项还在按次扣分」。
     */
    private void migrateStb08CancelRate() {
        int renamed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0 AND name = ?",
                STB08_NEW_NAME, STB08_LEGACY_NAME);
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0 AND description = ?",
                STB08_NEW_DESCRIPTION, STB08_LEGACY_DESCRIPTION);
        int modeChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET mode = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0 AND mode <> ?",
                MODE_CONDITIONAL, MODE_CONDITIONAL);
        int daysFilled = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET stat_days = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0 AND (stat_days IS NULL OR stat_days <= 0)",
                STB08_DEFAULT_STAT_DAYS);
        int perOrderCleared = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET deduction_per_order = NULL, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0 AND deduction_per_order IS NOT NULL");
        int banded = 0;
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, condition_items FROM biz_organic_score_rule WHERE rule_code = 'STB_08' AND deleted = 0")) {
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (isCancelRateGradient(items)) {
                continue;
            }
            writeConditionItems(row.get("id"), buildCancelRateItems());
            banded++;
        }
        log.info("已將 STB_08 取消訂單計罰改為訂單取消率梯度加分：名稱 {} 行、說明 {} 行、方式 {} 行、檔位 {} 行、補統計天數 {} 行、清空每單扣分 {} 行",
                renamed, descChanged, modeChanged, banded, daysFilled, perOrderCleared);
    }

    /** condition_items 是否已是取消率梯度：至少一档带 rate 的 cancel_rate_max，且带一个 minOrders 门槛项，不得混有旧口径项 */
    private boolean isCancelRateGradient(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            return false;
        }
        boolean hasBand = false;
        boolean hasSample = false;
        for (Map<String, Object> item : items) {
            Object condition = item.get("condition");
            if (CANCEL_RATE_CONDITION.equals(condition)) {
                if (!(item.get("rate") instanceof Number)) {
                    return false;
                }
                hasBand = true;
            } else if (CANCEL_SAMPLE_CONDITION.equals(condition)) {
                if (!(item.get("minOrders") instanceof Number)) {
                    return false;
                }
                hasSample = true;
            } else {
                return false;
            }
        }
        return hasBand && hasSample;
    }

    /** 按默认梯度生成 STB_08 condition_items（上界升序即匹配顺序，门槛项固定放末位） */
    private List<Map<String, Object>> buildCancelRateItems() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < STB08_DEFAULT_RATES.length; i++) {
            Map<String, Object> band = new LinkedHashMap<>();
            band.put("condition", CANCEL_RATE_CONDITION);
            band.put("rate", STB08_DEFAULT_RATES[i]);
            band.put("score", STB08_DEFAULT_SCORES[i]);
            items.add(band);
        }
        Map<String, Object> sample = new LinkedHashMap<>();
        sample.put("condition", CANCEL_SAMPLE_CONDITION);
        sample.put("minOrders", STB08_DEFAULT_MIN_ORDERS);
        sample.put("score", 0);
        items.add(sample);
        return items;
    }

    /**
     * 后置校验：STB_08 必须是加分口径（方式/档位/正统计天数）且旧口径列已清空；未播种不算失败。
     * 名称与说明只要求「不残留旧内置值」：migrate 以旧内置值作条件不顶管理员自定义文案，
     * 因此此处不能要求名称必等于新名，否则管理员改过名的环境永远记不上版本。
     * stat_days 必须为正：新口径无统计窗口就无法取取消率，为 0/NULL 说明迁移没打中。
     */
    private void verifyStb08CancelRate() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT name, description, mode, stat_days, deduction_per_order, condition_items FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_08' AND deleted = 0")) {
            if (STB08_LEGACY_NAME.equals(row.get("name"))) {
                throw new IllegalStateException("STB_08 名称仍为旧内置「" + STB08_LEGACY_NAME + "」，迁移未生效");
            }
            if (STB08_LEGACY_DESCRIPTION.equals(row.get("description"))) {
                throw new IllegalStateException("STB_08 评分说明仍是旧内置文案，迁移未生效");
            }
            if (!(row.get("mode") instanceof Number) || ((Number) row.get("mode")).intValue() != MODE_CONDITIONAL) {
                throw new IllegalStateException("STB_08 计分方式不是条件计分（mode=" + row.get("mode") + "），迁移未生效");
            }
            if (!(row.get("stat_days") instanceof Number) || ((Number) row.get("stat_days")).intValue() <= 0) {
                throw new IllegalStateException("STB_08 缺少统计天数（stat_days=" + row.get("stat_days") + "），迁移未生效");
            }
            if (row.get("deduction_per_order") != null) {
                throw new IllegalStateException("STB_08 仍残留每單扣分配置（deduction_per_order），迁移未生效");
            }
            List<Map<String, Object>> items = parseConditionItems(row.get("condition_items"));
            if (items != null && !items.isEmpty() && !isCancelRateGradient(items)) {
                throw new IllegalStateException("STB_08 档位不是订单取消率梯度（cancel_rate_max + cancel_min_orders），迁移未生效");
            }
        }
    }

    /**
     * STB_ACT 评分说明补「仅正常进行中的活动计分」口径：只在这两个已知内置值上同步，
     * 管理员自定义过的说明不命中旧值、不会被顶掉。名称本就是「活動加分」，不需改。
     */
    private void migrateStbActScope() {
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_ACT' AND deleted = 0 AND description IN (?, ?)",
                STB_ACT_NEW_DESCRIPTION, STB_ACT_LEGACY_DESCRIPTIONS.get(0), STB_ACT_LEGACY_DESCRIPTIONS.get(1));
        log.info("已同步 STB_ACT 活動加分評分說明（僅進行中活動計分）：{} 行", descChanged);
    }

    /** 后置校验：两个旧内置说明都不得残留（自定义说明不属于旧内置值，不会命中）。 */
    private void verifyStbActScope() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = 'STB_ACT' AND deleted = 0 AND description IN (?, ?)",
                Integer.class, STB_ACT_LEGACY_DESCRIPTIONS.get(0), STB_ACT_LEGACY_DESCRIPTIONS.get(1));
        if (remains != null && remains > 0) {
            throw new IllegalStateException("STB_ACT 评分说明仍是旧内置文案，活动口径未写回");
        }
    }

    /**
     * 把 STB_07 整行收敛为「出餐時長」固定加分：名称/说明以旧内置值为条件只改仍写着旧口径的行（管理员自定义不顶），
     * mode 3→1、score 仅在未配置（=0，旧界面把分放在 deduction_per_order）时补默认 50 分，
     * 「開啟自動校正」播种进既有 prerequisites 列；旧口径专用列 stat_days / deduction_per_order 置 NULL，
     * 留着会被读成「本项还在按次扣分」。参考 SQL: sql/315_organic_stb07_meal_time.sql
     */
    private void migrateStb07MealTime() {
        int renamed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 AND name = ?",
                STB07_NEW_NAME, STB07_LEGACY_NAME);
        int descChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET description = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 AND description = ?",
                STB07_NEW_DESCRIPTION, STB07_LEGACY_DESCRIPTION);
        int modeChanged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET mode = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 AND mode <> ?",
                MODE_RULE_BONUS, MODE_RULE_BONUS);
        int scoreFilled = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET score = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 AND COALESCE(score, 0) <= 0",
                STB07_DEFAULT_SCORE);
        int prereqSeeded = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET prerequisites = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 AND (prerequisites IS NULL OR prerequisites = '')",
                STB07_AUTO_CORRECT_PREREQUISITE);
        int legacyCleared = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET stat_days = NULL, deduction_per_order = NULL, updated_by = 'system' "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0 "
                        + "AND (stat_days IS NOT NULL OR deduction_per_order IS NOT NULL)");
        log.info("已將 STB_07 出餐超時計罰改為出餐時長固定加分：名稱 {} 行、說明 {} 行、方式 {} 行、分值 {} 行、自動校正 {} 行、清空舊口徑列 {} 行",
                renamed, descChanged, modeChanged, scoreFilled, prereqSeeded, legacyCleared);
    }

    /**
     * 后置校验：STB_07 若存在，必须是加分口径（方式/正分值）且旧按次计罚列已清空；未播种不算失败。
     * 名称与说明只要求「不残留旧内置值」，prerequisites 不校验：
     * 它是运营可随时关闭的开关，若要求必等播种值，管理员在记版本前关掉就会永远记不上版本。
     */
    private void verifyStb07MealTime() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT name, description, mode, score, stat_days, deduction_per_order FROM biz_organic_score_rule "
                        + "WHERE rule_code = 'STB_07' AND deleted = 0")) {
            if (STB07_LEGACY_NAME.equals(row.get("name"))) {
                throw new IllegalStateException("STB_07 名称仍为旧内置「" + STB07_LEGACY_NAME + "」，迁移未生效");
            }
            if (STB07_LEGACY_DESCRIPTION.equals(row.get("description"))) {
                throw new IllegalStateException("STB_07 评分说明仍是旧内置文案，迁移未生效");
            }
            if (!(row.get("mode") instanceof Number) || ((Number) row.get("mode")).intValue() != MODE_RULE_BONUS) {
                throw new IllegalStateException("STB_07 計分方式不是規則加分（mode=" + row.get("mode") + "），迁移未生效");
            }
            if (!(row.get("score") instanceof Number) || ((Number) row.get("score")).intValue() <= 0) {
                throw new IllegalStateException("STB_07 固定加分未配置（score=" + row.get("score") + "），迁移未生效");
            }
            if (row.get("stat_days") != null || row.get("deduction_per_order") != null) {
                throw new IllegalStateException("STB_07 仍殘留舊按次計罰配置（stat_days / deduction_per_order），迁移未生效");
            }
        }
    }

    /** 逻辑删除已下架的 STB_09「超時接單」（保留历史可回滚，与应用 deleteRule 的 @TableLogic 语义一致）。 */
    private void retireStb09Rule() {
        int changed = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET deleted = 1, updated_by = 'system' "
                        + "WHERE deleted = 0 AND rule_code = ?",
                RETIRED_STB09_RULE_CODE);
        log.info("已逻辑删除下架計分項 {}：{} 行", RETIRED_STB09_RULE_CODE, changed);
    }

    /** 后置校验：下架编码不得再有未删除的残留行，残留说明 UPDATE 未打中，不记版本、下次启动重试。 */
    private void verifyStb09Retired() {
        Integer remains = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE deleted = 0 AND rule_code = ?",
                Integer.class, RETIRED_STB09_RULE_CODE);
        if (remains != null && remains > 0) {
            throw new IllegalStateException("下架計分項 " + RETIRED_STB09_RULE_CODE + " 仍有 " + remains + " 行未收斂");
        }
    }

    /**
     * 把 PLT_03 收敛为「流量均衡」并逻辑删除 PLT_04。
     * 只在 traffic_balance_config IS NULL（尚未合并）时整行覆写，避免重放覆盖运营已配好的配置；
     * region_configs / blocked_merchants 置 NULL（旧区域格式与屏蔽名单不自动沿用），
     * stat_days / calc_cycle / calc_interval_hours 与默认 JSON 保持一致的每小时刷新口径。
     */
    private void migrateTrafficBalance() {
        String config = buildTrafficBalanceConfigJson();
        int merged = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET name = ?, description = ?, mode = ?, stat_days = ?, "
                        + "calc_cycle = 'SCHEDULED', calc_interval_hours = 1, region_configs = NULL, blocked_merchants = NULL, "
                        + "traffic_balance_config = ?, updated_by = 'system' "
                        + "WHERE rule_code = 'PLT_03' AND deleted = 0 AND traffic_balance_config IS NULL",
                TRAFFIC_BALANCE_NAME, TRAFFIC_BALANCE_DESCRIPTION, MODE_TIERED, TRAFFIC_BALANCE_DEFAULT_STAT_DAYS, config);
        int retired = jdbcTemplate.update(
                "UPDATE biz_organic_score_rule SET deleted = 1, updated_by = 'system' "
                        + "WHERE rule_code = 'PLT_04' AND deleted = 0");
        log.info("已將 PLT_03 收斂為流量均衡：{} 行；邏輯刪除 PLT_04：{} 行", merged, retired);
    }

    /** 按默认配置生成 traffic_balance_config JSON（订单量门槛 null 待运营校准，分值建议 80/60/50/30）。 */
    private String buildTrafficBalanceConfigJson() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("statDays", TRAFFIC_BALANCE_DEFAULT_STAT_DAYS);
        config.put("refreshMinutes", TRAFFIC_BALANCE_DEFAULT_REFRESH_MINUTES);
        config.put("orderTypes", List.of("DELIVERY", "PICKUP"));
        config.put("includeRefunded", false);
        config.put("excludedStoreCodes", List.of());
        Map<String, Object> regions = new LinkedHashMap<>();
        regions.put("MACAU", defaultTrafficBalanceBands());
        regions.put("TAIPA", defaultTrafficBalanceBands());
        config.put("regions", regions);
        try {
            return CONDITION_JSON.writeValueAsString(config);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("流量均衡默認配置序列化失敗", e);
        }
    }

    /** 默认梯度：订单量门槛留空（maxOrders=null）由运营按新口径校准，分值递减。 */
    private List<Map<String, Object>> defaultTrafficBalanceBands() {
        List<Map<String, Object>> bands = new ArrayList<>();
        for (int score : TRAFFIC_BALANCE_DEFAULT_SCORES) {
            Map<String, Object> band = new LinkedHashMap<>();
            band.put("maxOrders", null);
            band.put("score", score);
            bands.add(band);
        }
        return bands;
    }

    /**
     * 后置校验：PLT_03 若存在必须已写入 traffic_balance_config（非空非 'null'）；PLT_04 不得有未删除残留行。
     * PLT_03 不存在不算失败（未播种环境由前端默认配置兜底）。
     */
    private void verifyTrafficBalance() {
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT traffic_balance_config FROM biz_organic_score_rule WHERE rule_code = 'PLT_03' AND deleted = 0")) {
            Object cfg = row.get("traffic_balance_config");
            if (cfg == null || "null".equals(String.valueOf(cfg)) || String.valueOf(cfg).isBlank()) {
                throw new IllegalStateException("PLT_03 未寫入 traffic_balance_config，流量均衡遷移未生效");
            }
        }
        Integer plt04 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_organic_score_rule WHERE rule_code = 'PLT_04' AND deleted = 0", Integer.class);
        if (plt04 != null && plt04 > 0) {
            throw new IllegalStateException("PLT_04 訂單過熱調控仍有未刪除殘留行，下架未生效");
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
