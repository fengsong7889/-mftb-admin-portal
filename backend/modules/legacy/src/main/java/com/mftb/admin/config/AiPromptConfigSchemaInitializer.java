package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * AI 助手配置中心结构 + 默认种子：
 * <ol>
 *   <li>建 6 张表（能力清单/回答骨架/术语口径/快捷提问/推送模板/变更审计）；</li>
 *   <li>种子能力清单（11 个 RDM + 3 个财务工具）；</li>
 *   <li>种子回答骨架（global / rdm / finance，active v1）；</li>
 *   <li>种子核心术语与口径（source=system）。</li>
 * </ol>
 *
 * <p>全部 INSERT IGNORE：不覆盖管理员后续在菜单里改过的内容。
 * <p>失败不记版本，下次启动重试；后置校验表与 active 骨架存在。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25)
public class AiPromptConfigSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:prompt-config-schema-v1.0";
    private static final String SCRIPT = "272_ai_prompt_config.sql";
    private static final List<String> TABLES = List.of(
            "ai_prompt_profile", "ai_capability", "ai_glossary",
            "ai_quick_prompt", "ai_push_template", "ai_config_change_log");

    private static final String DEFAULT_SKELETON = """
            ## 結論
            先用 1-3 句回答用戶的問題，不要先拋數據。
            ## 明細
            明細由系統卡片渲染；如果工具已返回 view，正文不要重複表格，只補充卡片裡沒有的異常與建議。
            ## 風險與建議
            有風險/異常時分條列出，每條一行。
            > 口徑：說明數據範圍、統計口徑、時間範圍；若 scope.restricted=true，寫明「僅顯示與您相關的數據」。
            """;

    private static final String RDM_RULES = """
            產研交付術語：項目 → 迭代 → 需求 → 任務；交付項是需求下的交付單元。
            待我審批/待分配/待我處理/待我驗收用 rdm_my_todos；查某狀態需求用 rdm_query_requirements；查某人做了什麼用 rdm_person_workload。
            項目/需求/迭代必須帶編號；人名或項目名模糊時先列候選讓用戶選，不要猜。
            推送必須先調用 rdm_prepare_progress_push 生成預覽；生成後只說「已生成推送預覽，請在確認卡確認」，不得說已發送。
            """;

    private static final String FINANCE_RULES = """
            金額使用千分位；品牌 flashBee=閃蜂，mFood=mFood。
            查推廣金餘額用 query_account_balance，查審批用 query_approvals，查充值批次用 query_batches。
            """;

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verify);
    }

    private void doMigrate() {
        executeSqlScript();
        seedCapabilities();
        seedProfiles();
        seedGlossary();
        log.info("AI 助手配置中心就绪: 6 张表 + 能力清单/回答骨架/术语口径种子");
    }

    private void verify() {
        for (String table : TABLES) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
            if (count == null || count == 0) {
                throw new IllegalStateException("AI 配置中心表未就绪: " + table);
            }
        }
        Integer active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_prompt_profile WHERE status = 'active' AND profile_key = 'global'",
                Integer.class);
        if (active == null || active == 0) {
            throw new IllegalStateException("全局回答骨架未发布");
        }
    }

    private void seedCapabilities() {
        seedCapability("rdm_list_projects", "項目查詢", "rdm",
                "查詢產研交付的項目清單（籌備中/進行中/部分交付/全部交付/已關閉），可按項目經理、逾期、風險篩選",
                "用戶問有哪些項目、進行中的項目、某人的項目、逾期/風險項目時", 100);
        seedCapability("rdm_project_progress", "項目進度", "rdm",
                "查詢單個產研項目的進度：交付項、任務、需求、阻塞/逾期/缺陷/待辦與計劃週期",
                "用戶問某個項目現在進度如何、卡在哪、有哪些風險時", 101);
        seedCapability("rdm_list_iterations", "迭代查詢", "rdm",
                "查詢產研迭代清單：可按項目、關鍵字、狀態、類型篩選，並返回需求數與任務數",
                "用戶問有哪些迭代、某項目有哪些迭代、進行中的迭代時", 102);
        seedCapability("rdm_query_requirements", "需求查詢", "rdm",
                "查詢產研需求清單：可按關鍵字、階段、項目、迭代、產品負責人、提出人、當前處理人、逾期、阻塞篩選",
                "用戶問有哪些需求、某狀態/項目/迭代的需求、逾期/阻塞需求時", 103);
        seedCapability("rdm_requirement_detail", "需求詳情", "rdm",
                "查詢單個需求的詳情：狀態、人員、項目/迭代、計劃與實際時間、當前處理人、停留、阻塞/駁回原因、最近流轉與驗收結論",
                "用戶問某個需求卡在誰、流轉到哪、什麼時候上線時", 104);
        seedCapability("rdm_my_todos", "我的待辦", "rdm",
                "查詢與當前用戶相關的待辦：待我審批、待我處理、待我驗收、待分配（僅有分配權者）",
                "用戶問待我審批/待分配/待我處理/待我驗收時", 105);
        seedCapability("rdm_person_workload", "人員工作量", "rdm",
                "查詢某位員工在產研需求上的工作量：負責/提交/當前處理的需求清單與數量；查他人需全量查看權",
                "用戶問張三負責哪些需求、某人做了什麼時", 106);
        seedCapability("rdm_stats_overview", "交付統計", "rdm",
                "查詢產研交付全局統計：需求總量、本月提交/交付、逾期/阻塞/待分配、部門排名、產品經理排名、階段負載",
                "用戶問本月交付多少、部門/PM 排名、階段負載時", 107);
        seedCapability("rdm_risks", "風險清單", "rdm",
                "查詢產研交付風險清單：阻塞、逾期、長期無進展、無主（待分配）、審批停滯",
                "用戶問有哪些風險、哪些需求卡住時", 108);
        seedCapability("rdm_list_tasks", "任務查詢", "rdm",
                "查詢研發任務：我的任務（可按狀態）或某個需求下的任務清單",
                "用戶問我的任務、某需求的任務時", 109);
        seedCapability("rdm_prepare_progress_push", "進度推送", "rdm",
                "生成項目進度推送預覽（釘釘群或指定員工），返回待確認卡；真正發送必須由用戶確認",
                "用戶要求把某項目進度發到釘釘群或發給某位員工時", 110);
        seedCapability("query_account_balance", "賬戶餘額查詢", "finance",
                "查詢集團賬戶的推廣金餘額（虛擬餘額和實際餘額），可按集團名稱、品牌篩選",
                "用戶問推廣金餘額、某集團賬戶時", 10);
        seedCapability("query_approvals", "審批狀態查詢", "finance",
                "查詢審批中心的流程狀態，可按審批類型和狀態篩選",
                "用戶問審批進度、待審批單子時", 11);
        seedCapability("query_batches", "批次查詢", "finance",
                "查詢推廣金充值批次，可按集團、品牌、金額區間篩選",
                "用戶問充值批次、某筆充值時", 12);
    }

    private void seedCapability(String toolKey, String displayName, String domain,
                                String description, String useWhen, int sort) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO ai_capability "
                        + "(tool_key, display_name, domain, prompt_description, use_when, sort, updated_by) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'system')",
                toolKey, displayName, domain, description, useWhen, sort);
    }

    private void seedProfiles() {
        seedProfile("global", "全局默認", "global", DEFAULT_SKELETON, null, 1);
        seedProfile("rdm", "產研交付", "rdm", DEFAULT_SKELETON, RDM_RULES, 1);
        seedProfile("finance", "財務推廣金", "finance", DEFAULT_SKELETON, FINANCE_RULES, 1);
    }

    private void seedProfile(String key, String name, String domain,
                             String skeleton, String extraRules, int version) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO ai_prompt_profile "
                        + "(profile_key, name, domain, response_skeleton, extra_rules, status, active_flag, "
                        + "version, published_at, published_by, updated_by) "
                        + "VALUES (?, ?, ?, ?, ?, 'active', 1, ?, NOW(), 'system', 'system')",
                key, name, domain, skeleton, extraRules, version);
    }

    private void seedGlossary() {
        // 需求状态
        seedTerm("rdm", "待審批", "需求已提交，等待准入審批；尚未生成正式需求編號", null, 10);
        seedTerm("rdm", "需求池·待分配", "審批通過但尚未分配產品負責人", null, 11);
        seedTerm("rdm", "已分配·待受理", "已分配產品負責人，等待產品受理", null, 12);
        seedTerm("rdm", "評估中", "產品正在評估需求價值與方案", null, 13);
        seedTerm("rdm", "PRD 產出中", "產品正在產出 PRD（區別於 UI 設計）", null, 14);
        seedTerm("rdm", "評審中", "需求/方案正在評審", null, 15);
        seedTerm("rdm", "已排期", "已排入迭代，等待開發", null, 16);
        seedTerm("rdm", "開發中", "研發正在開發（含 UI 設計、聯調）", null, 17);
        seedTerm("rdm", "測試中", "測試正在執行（含測試通過待上線）", null, 18);
        seedTerm("rdm", "待業務驗收", "已上線或待上線，等待業務驗收", null, 19);
        seedTerm("rdm", "已上線", "已發布上線，等待業務確認交付", null, 20);
        seedTerm("rdm", "已確認交付", "業務已確認交付完成", null, 21);
        seedTerm("rdm", "已歸檔", "需求已關閉歸檔", null, 22);
        seedTerm("rdm", "掛起暫緩", "需求被暫時掛起", null, 23);
        seedTerm("rdm", "已駁回", "產品評估後駁回需求", null, 24);
        seedTerm("rdm", "審批駁回", "准入審批被駁回，需提出人補充後重提", null, 25);
        // 項目/迭代
        seedTerm("rdm", "交付項", "需求下可獨立交付與驗收的單元；一個需求可拆多個交付項", null, 30);
        seedTerm("rdm", "迭代", "項目的計劃週期，需求排期後掛到迭代；任務繼承需求的迭代", null, 31);
        seedTerm("rdm", "項目狀態·進行中", "項目已啟動且在推進", null, 32);
        seedTerm("rdm", "項目狀態·全部交付", "項目所有交付項已完成", null, 33);
        seedTerm("rdm", "逾期", "計劃結束/上線日期已過但尚未完成", "逾期標記 = overdue_flag = 1", 34);
        seedTerm("rdm", "阻塞", "當前工作被依賴或問題卡住，需要協調", "阻塞標記 = blocked_flag = 1", 35);
        // 指标口径
        seedTerm("rdm", "按時上線率", "按計劃上線日期完成的需求占比", "按時上線數 ÷ 已上線需求數", 40);
        seedTerm("rdm", "平均交付週期", "需求從提交到上線的平均天數", "Σ(上線日期 - 提交日期) ÷ 已上線需求數", 41);
        seedTerm("rdm", "驗收一次通過率", "首次驗收即通過的交付項占比", "一次通過交付項 ÷ 已驗收交付項", 42);
        seedTerm("rdm", "返工次數", "驗收未通過後重新開發的次數", "按需求返工記錄計數", 43);
        seedTerm("rdm", "需求變更數", "需求在交付過程中發生變更的次數", "按變更記錄計數", 44);
        seedTerm("rdm", "逾期存量", "當前仍處於逾期狀態的需求數", "overdue_flag = 1 且未關閉的需求數", 45);
        seedTerm("rdm", "提請需求數", "統計週期內新提交的需求數", "按提交時間落在週期內計數", 46);
        seedTerm("rdm", "上線數", "統計週期內上線的需求數", "按實際上線時間落在週期內計數", 47);
    }

    private void seedTerm(String domain, String term, String definition, String formula, int sort) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO ai_glossary "
                        + "(domain, term, definition, formula, prompt_visible, source, status, sort, updated_by) "
                        + "VALUES (?, ?, ?, ?, 1, 'system', 'active', ?, 'system')",
                domain, term, definition, formula, sort);
    }

    private void executeSqlScript() {
        ClassPathResource resource = new ClassPathResource(SCRIPT);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 配置中心脚本: " + SCRIPT);
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已执行 AI 配置中心脚本: {}", SCRIPT);
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 配置中心脚本失败: " + SCRIPT, e);
        }
    }
}
