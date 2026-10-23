package com.mftb.admin.constant;

import java.util.List;

/**
 * RDM 每日日报的预置推送模板与占位符定义（单一真相源）。
 *
 * <p><b>为什么单独一个类</b>：模板文案同时被两处使用——启动迁移
 * （{@code RdmSchemaMigrationInitializer} v3.16 写 {@code rdm_daily_report_template} 种子）
 * 与运行期渲染（{@code RdmDailyReportService} 在模板行缺失/停用时兜底）。
 * 两处各写一份必然漂移，因此定义只在这里，迁移与渲染都读它。
 *
 * <p><b>渲染口径</b>：模板正文只做 {@code {{占位符}}} 字符串替换，<b>不引入模板引擎、不 eval</b>；
 * 「项目 → 迭代 → 需求」的层级循环由服务端渲染成 markdown 片段后填入 {@code {{projectBlock}}}，
 * 模板只控制框架文案与字段顺序。这样模板再复杂也不产生注入面。
 *
 * <p><b>预置模板不可删</b>（{@code is_preset=1}，只可停用），保证「一键恢复默认」永远有底；
 * 用户微调后另存为自建模板（{@code is_preset=0}），可删可改。
 */
public final class RdmDailyReportTemplates {

    private RdmDailyReportTemplates() {
    }

    /* ==================== 投放通道 ==================== */

    /** 钉钉群（群机器人 webhook，走 rdm 场景渠道） */
    public static final String CHANNEL_GROUP = "group";
    /** 个人工作通知（钉钉企业内部应用，走 rdm_daily_report 场景） */
    public static final String CHANNEL_PERSONAL = "personal";

    /* ==================== 档位 ==================== */

    /** 晨报：今日焦点（今日到期/已逾期/进行中） */
    public static final String TYPE_MORNING = "morning";
    /** 晚报：当日复盘（当日完成/上线、状态变更、明日到期预警） */
    public static final String TYPE_EVENING = "evening";
    /** 不限档位（个人模板晨晚共用一套文案） */
    public static final String TYPE_ANY = "any";
    /**
     * 手动触发快照的档位值（仅用于 {@code rdm_daily_report.report_type} 与详情页取数，
     * <b>不是模板的适用档位</b>：手动触发仍按所选晨/晚档取模板与内容口径）。
     * <p>为何要单独一个值：定时幂等靠「当日该档快照已存在则跳过」，而手动补发是合法语义
     * （漏发一档后要能重推），若与定时共用同一行就会被幂等拦住；分开存则两者各自一行、
     * 各自自洽，通知里的链接指向自己那一行。
     */
    public static final String TYPE_MANUAL = "manual";

    /* ==================== 占位符（渲染器白名单） ==================== */

    public static final String PH_REPORT_DATE = "{{reportDate}}";
    public static final String PH_REPORT_TYPE_LABEL = "{{reportTypeLabel}}";
    public static final String PH_PROJECT_COUNT = "{{projectCount}}";
    public static final String PH_TODAY_DUE_COUNT = "{{todayDueCount}}";
    public static final String PH_OVERDUE_COUNT = "{{overdueCount}}";
    public static final String PH_RISK_COUNT = "{{riskCount}}";
    public static final String PH_TODAY_DONE_COUNT = "{{todayDoneCount}}";
    public static final String PH_TODAY_RELEASED_COUNT = "{{todayReleasedCount}}";
    public static final String PH_TODAY_CHANGED_COUNT = "{{todayChangedCount}}";
    public static final String PH_TOMORROW_DUE_COUNT = "{{tomorrowDueCount}}";
    /** 项目→迭代→需求层级片段（服务端渲染，不可模板化：保证层级与链接正确） */
    public static final String PH_PROJECT_BLOCK = "{{projectBlock}}";
    /** 风险优先模板用：只含逾期/风险/临期项目的片段 */
    public static final String PH_RISK_BLOCK = "{{riskBlock}}";
    /** 风险优先模板用：进展正常的项目数（折叠为一行计数） */
    public static final String PH_NORMAL_PROJECT_COUNT = "{{normalProjectCount}}";
    public static final String PH_DETAIL_URL = "{{detailUrl}}";

    /* ---- 个人模板专用 ---- */
    /**
     * 收件人姓名占位符。<b>已停用</b>：个人日报一律不署姓名（追加收件人拿到的项目并非其本人负责，
     * 署名会让领导误以为需求全归署名人或以为消息发错人），渲染器恒替换为空串。
     * 常量与白名单保留仅为兼容历史模板与未知占位符判定，新模板不要再使用。
     */
    public static final String PH_USER_NAME = "{{userName}}";
    public static final String PH_MY_PROJECT_COUNT = "{{myProjectCount}}";
    public static final String PH_MY_TODO_COUNT = "{{myTodoCount}}";
    public static final String PH_MY_OVERDUE_COUNT = "{{myOverdueCount}}";
    public static final String PH_MY_TODAY_DUE_COUNT = "{{myTodayDueCount}}";
    public static final String PH_MY_PROJECT_BLOCK = "{{myProjectBlock}}";
    public static final String PH_MY_REQUIREMENT_COUNT = "{{myRequirementCount}}";
    public static final String PH_MY_REQUIREMENT_DONE_COUNT = "{{myRequirementDoneCount}}";
    public static final String PH_MY_DELIVERY_COUNT = "{{myDeliveryCount}}";
    public static final String PH_MY_DELIVERY_DONE_COUNT = "{{myDeliveryDoneCount}}";
    public static final String PH_MY_REMAINING_COUNT = "{{myRemainingCount}}";

    /**
     * 全部已知占位符（渲染器据此判定「未知占位符」：保留原样并记日志，不静默吞掉，
     * 便于发现拼写错误——静默替换成空串会让用户以为模板生效了）。
     */
    public static final List<String> KNOWN_PLACEHOLDERS = List.of(
            PH_REPORT_DATE, PH_REPORT_TYPE_LABEL, PH_PROJECT_COUNT, PH_TODAY_DUE_COUNT,
            PH_OVERDUE_COUNT, PH_RISK_COUNT, PH_TODAY_DONE_COUNT, PH_TODAY_RELEASED_COUNT,
            PH_TODAY_CHANGED_COUNT, PH_TOMORROW_DUE_COUNT, PH_PROJECT_BLOCK, PH_RISK_BLOCK,
            PH_NORMAL_PROJECT_COUNT, PH_DETAIL_URL, PH_USER_NAME, PH_MY_PROJECT_COUNT,
            PH_MY_TODO_COUNT, PH_MY_OVERDUE_COUNT, PH_MY_TODAY_DUE_COUNT, PH_MY_PROJECT_BLOCK,
            PH_MY_REQUIREMENT_COUNT, PH_MY_REQUIREMENT_DONE_COUNT, PH_MY_DELIVERY_COUNT,
            PH_MY_DELIVERY_DONE_COUNT, PH_MY_REMAINING_COUNT);

    /* ==================== 预置模板定义 ==================== */

    /**
     * 一套预置模板。
     *
     * @param key        模板键（唯一，配置表按此引用）
     * @param name       模板名称（配置页列表展示，繁中）
     * @param channel    投放通道：{@link #CHANNEL_GROUP} / {@link #CHANNEL_PERSONAL}
     * @param reportType 适用档位：{@link #TYPE_MORNING} / {@link #TYPE_EVENING} / {@link #TYPE_ANY}
     * @param titleTpl   标题模板
     * @param contentTpl 正文模板（markdown + 占位符）
     * @param isDefault  是否该 channel+reportType 的默认模板
     * @param remark     说明（配置页展示，帮助选用）
     */
    public record Preset(String key, String name, String channel, String reportType,
                         String titleTpl, String contentTpl, boolean isDefault, String remark) {
    }

    /** 群报·晨报 A 總覽優先（默认）：先汇总指标再看项目明细，适合晨会前阅读 */
    public static final String KEY_GROUP_MORNING_OVERVIEW = "group_morning_overview";
    /** 群报·晨报 B 風險優先：只展开异常项目 */
    public static final String KEY_GROUP_MORNING_RISK = "group_morning_risk";
    /** 群报·晨报 C 精簡版：只有汇总与链接 */
    public static final String KEY_GROUP_MORNING_BRIEF = "group_morning_brief";
    /** 群报·晚报 D 當日復盤（默认） */
    public static final String KEY_GROUP_EVENING_REVIEW = "group_evening_review";
    /** 群报·晚报 E 精簡復盤 */
    public static final String KEY_GROUP_EVENING_BRIEF = "group_evening_brief";
    /** 个人·F 待辦視角（默认） */
    public static final String KEY_PERSONAL_TODO = "personal_todo";
    /** 个人·G 總覽視角 */
    public static final String KEY_PERSONAL_OVERVIEW = "personal_overview";

    /** 预置模板清单（迁移种子与渲染兜底共用；顺序即配置页展示顺序） */
    public static final List<Preset> PRESETS = List.of(
            new Preset(KEY_GROUP_MORNING_OVERVIEW, "群報·晨報 A 總覽優先", CHANNEL_GROUP, TYPE_MORNING,
                    "產研交付日報 {{reportDate}}（晨報）",
                    """
                    ## 📊 產研交付日報 {{reportDate}}（{{reportTypeLabel}}）
                    **在途項目 {{projectCount}} 個**｜今日到期 {{todayDueCount}}｜已逾期 {{overdueCount}}｜風險 {{riskCount}}

                    {{projectBlock}}

                    [查看完整日報]({{detailUrl}})""",
                    true, "管理者視角預設：先匯總指標再看項目明細，適合每日晨會前閱讀"),

            new Preset(KEY_GROUP_MORNING_RISK, "群報·晨報 B 風險優先", CHANNEL_GROUP, TYPE_MORNING,
                    "產研交付日報 {{reportDate}}（晨報·風險優先）",
                    """
                    ## ⚠️ 產研交付日報 {{reportDate}}（{{reportTypeLabel}}）
                    **需關注：逾期 {{overdueCount}}｜風險 {{riskCount}}｜今日到期 {{todayDueCount}}**

                    {{riskBlock}}

                    其餘 {{normalProjectCount}} 個項目進展正常。
                    [查看完整日報]({{detailUrl}})""",
                    false, "只展開逾期/風險/臨期項目，正常項目折疊為一行計數，適合項目多時聚焦異常"),

            new Preset(KEY_GROUP_MORNING_BRIEF, "群報·晨報 C 精簡版", CHANNEL_GROUP, TYPE_MORNING,
                    "產研交付日報 {{reportDate}}",
                    """
                    ## 📊 產研交付日報 {{reportDate}}
                    在途 {{projectCount}}｜今日到期 {{todayDueCount}}｜逾期 {{overdueCount}}｜風險 {{riskCount}}
                    [查看完整日報]({{detailUrl}})""",
                    false, "只有匯總與連結，訊息最短，適合項目數多時避免刷屏"),

            new Preset(KEY_GROUP_EVENING_REVIEW, "群報·晚報 D 當日復盤", CHANNEL_GROUP, TYPE_EVENING,
                    "產研交付晚報 {{reportDate}}",
                    """
                    ## 🌙 產研交付晚報 {{reportDate}}
                    **今日完成 {{todayDoneCount}} 項**｜今日上線 {{todayReleasedCount}}｜狀態變更 {{todayChangedCount}}

                    {{projectBlock}}

                    **明日到期 {{tomorrowDueCount}} 項**，請提前安排。
                    [查看完整日報]({{detailUrl}})""",
                    true, "收工前復盤：當日完成/上線/狀態變更 + 明日到期預警"),

            new Preset(KEY_GROUP_EVENING_BRIEF, "群報·晚報 E 精簡復盤", CHANNEL_GROUP, TYPE_EVENING,
                    "產研交付晚報 {{reportDate}}",
                    """
                    ## 🌙 產研交付晚報 {{reportDate}}
                    今日完成 {{todayDoneCount}}｜上線 {{todayReleasedCount}}｜狀態變更 {{todayChangedCount}}
                    **明日到期 {{tomorrowDueCount}} 項**
                    [查看完整日報]({{detailUrl}})""",
                    false, "同 D 但去掉項目明細，只留當日匯總與明日預警"),

            new Preset(KEY_PERSONAL_TODO, "個人·F 待辦視角", CHANNEL_PERSONAL, TYPE_ANY,
                    "您的產研交付日報 {{reportDate}}",
                    """
                    ### 📌 您的產研交付日報（{{reportDate}} {{reportTypeLabel}}）
                    - 負責項目：**{{myProjectCount}} 個**
                    - 待處理：**{{myTodoCount}} 項**（逾期 {{myOverdueCount}}）
                    - 今日到期：**{{myTodayDueCount}} 項**

                    {{myProjectBlock}}

                    [查看我的項目日報]({{detailUrl}})""",
                    true, "推給項目經理/產品負責人：一打開就知道今天該推什麼"),

            new Preset(KEY_PERSONAL_OVERVIEW, "個人·G 總覽視角", CHANNEL_PERSONAL, TYPE_ANY,
                    "您的產研交付日報 {{reportDate}}",
                    """
                    ### 📋 您負責項目的完整進度（{{reportDate}} {{reportTypeLabel}}）
                    - 負責項目：**{{myProjectCount}} 個**
                    - 需求：**{{myRequirementCount}} 個**（已完成 {{myRequirementDoneCount}}）
                    - 交付項：**{{myDeliveryCount}} 項**（已完成 {{myDeliveryDoneCount}}，剩餘 {{myRemainingCount}}）

                    {{myProjectBlock}}

                    [查看我的項目日報]({{detailUrl}})""",
                    false, "列出負責項目的迭代/需求/交付項完整進度，資訊最全但訊息較長"));

    /** 按 key 取预置模板（渲染兜底与迁移校验用）；不存在返回 null */
    public static Preset findPreset(String key) {
        if (key == null) {
            return null;
        }
        for (Preset p : PRESETS) {
            if (p.key().equals(key)) {
                return p;
            }
        }
        return null;
    }

    /**
     * 取某通道+档位的默认预置模板 key。
     * <p>个人模板 {@code reportType=any}，晨晚共用，故按 channel 匹配即可。
     */
    public static String defaultKeyOf(String channel, String reportType) {
        for (Preset p : PRESETS) {
            if (p.isDefault() && p.channel().equals(channel)
                    && (TYPE_ANY.equals(p.reportType()) || p.reportType().equals(reportType))) {
                return p.key();
            }
        }
        return null;
    }
}
