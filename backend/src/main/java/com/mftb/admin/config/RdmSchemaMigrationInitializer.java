package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * RDM（產研協同）M1 结构迁移：建 12 张 {@code rdm_} 表 + 状态机/流转/SLA 种子 + 编号规则 + 准入流程定义。
 * <p>
 * DDL 只在 classpath 脚本 {@code 204_rdm_core_tables.sql} 存一份（{@code backend/sql/} 下同名文件为参考副本），
 * 避免 Java 与 SQL 双份漂移。脚本全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，天然幂等。
 * <p>
 * 遵循迁移规范：{@code applyOnce(versionKey, task, verify)} 带后置校验，任务与校验都成功才记版本；
 * 读取或执行失败一律抛出（不吞异常），下次启动自动重试。
 * <p><b>启动顺序（必读）</b>：必须显式 {@code @Order} 且排在 {@code RdmMenuInitializer(24)}、
 * {@code RdmMetricSnapshotInitializer(26)} 之前。不加时默认是 LOWEST_PRECEDENCE（最后跑），
 * 会导致后续 runner 访问尚未创建的 rdm_ 表而报 bad SQL grammar（快照回填就因此空跑一次）。
 */
@Slf4j
@Component
@Order(23)
@RequiredArgsConstructor
public class RdmSchemaMigrationInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "rdm:schema:v1.0";
    private static final String SCHEMA_SCRIPT = "204_rdm_core_tables.sql";
    /** 附件/截图扩到 MEDIUMTEXT（存 Base64 Data URL），与 EAM 验收照片口径对齐 */
    private static final String VERSION_ATTACHMENT = "rdm:schema:v1.1";
    private static final String ATTACHMENT_SCRIPT = "205_rdm_attachment_mediumtext.sql";

    /** M2 结构：PRD / 评审 / 迭代 / 执行任务与工时 / 需求变更 5 张表 */
    private static final String VERSION_DELIVERY = "rdm:schema:v1.2";
    private static final String DELIVERY_SCRIPT = "206_rdm_delivery_tables.sql";

    /** M3 结构：验收用例明细 + 验收单返工/环境/遗留转需求列 + 需求衍生链 */
    private static final String VERSION_ACCEPTANCE = "rdm:schema:v1.3";
    private static final String ACCEPTANCE_SCRIPT = "207_rdm_acceptance_case.sql";

    /** M4 结构：积分规则（版本化）/ 积分流水（幂等唯一键）/ 效能量日快照 + 绩效建议值通道列 */
    private static final String VERSION_SCORE = "rdm:schema:v1.4";
    private static final String SCORE_SCRIPT = "208_rdm_score_tables.sql";

    /**
     * 快照表 dim_id 去重 + 改为 NOT NULL DEFAULT 0。
     * <p>v1.4 建表时 COMPANY 维度 dim_id 存 NULL，而 MySQL 唯一索引不约束 NULL，
     * uk_rdm_metric_day 因此形同虚设，回填重复跑会长重复行（趋势页同一天两个数据点）。
     */
    private static final String VERSION_SNAPSHOT_FIX = "rdm:schema:v1.5";
    private static final String SNAPSHOT_FIX_SCRIPT = "209_rdm_snapshot_dim_id.sql";

    /**
     * 阶段 2B 结构：准入策略表 + 准入审批轮次表 + 需求主表的意向 PM/当前轮次/命中策略列。
     * <p>为什么不是只加两张表：需求主表如果不存「当前轮次 + 命中策略版本」，
     * 回调就只能凭 flowNo 反查，旧单迟到回调会直接推动已经重提的新轮次。
     */
    private static final String VERSION_INTAKE = "rdm:schema:v1.6";
    private static final String INTAKE_SCRIPT = "210_rdm_intake_policy.sql";

    /**
     * 阶段 2C 结构：把 rdm_notify_log 从「发完记一笔」升级为可重试的投递队列。
     * <p>为什么不用新表：同一条记录既是任务也是最终事实，两张表必然漂移（留痕写 sent、队列还 pending
     * 或反之）。原本只存 send_status/error_msg，没有载荷就根本无法重发，所以必须补正文与收件人。
     */
    private static final String VERSION_NOTIFY_QUEUE = "rdm:schema:v1.7";

    /**
     * 阶段 3 结构：里程碑（五节点计划/基线/预测/实际）、工时明细、PRD 定稿快照。
     * <p>为什么不是往 rdm_requirement 上继续加日期列：五个节点各自要有四套时间语义，
     * 平铺到主表会变成 20 个列且无法按节点记录负责人与不适用原因。
     */
    private static final String VERSION_PLAN = "rdm:schema:v1.8";
    private static final String PLAN_SCRIPT = "212_rdm_milestone_worklog.sql";

    /**
     * 阶段 4 结构：发布放行单 + 验收阶段（上线前预验/上线后业务验）+ 需求流程版本。
     * <p>为什么要 flow_version：存量需求是在五节点/PRD 快照/工时明细之前建的，
     * 拿新口径去卡它们会把历史记录全算成「未做验收准备」，与真实质量无关。
     */
    private static final String VERSION_RELEASE = "rdm:schema:v1.9";
    private static final String RELEASE_SCRIPT = "213_rdm_release_gate.sql";

    /**
     * 阶段 5 结构：任务依赖（关键路径的边集）与按人工作日历。
     * <p>为什么日历按人不按全局：有人请假、有人周末支援上线，
     * 拿全局日历算出的关键路径与负载对具体的人一律是错的。
     */
    private static final String VERSION_SCHEDULE = "rdm:schema:v2.0";
    private static final String SCHEDULE_SCRIPT = "214_rdm_schedule_dependency.sql";

    /**
     * 阶段 6 结构：贡献分预算与 HR 绩效建议。
     * <p>为什么需要这段人工流程：积分直接写进考核单等于把绩效判定权交给算分脚本，
     * 出问题既不能解释也不能撤回。
     */
    private static final String VERSION_GOVERNANCE = "rdm:schema:v2.1";
    private static final String GOVERNANCE_SCRIPT = "215_rdm_score_budget.sql";

    /**
     * 阶段 4 补结（深度测试发现的 P0）：rdm_release 缺 applicant_emp_no 列，且没有放行单编号规则种子。
     * <p>v1.9 已记录为已应用，不能回去改它的列清单——那样已跑过的库永远不会补列；
     * 所以开 v2.2 专项修补，并在后置校验里把这两项当作硬条件钉住。
     */
    private static final String VERSION_RELEASE_FIX = "rdm:schema:v2.2";
    /**
     * 阶段 6 补丁（深度测试发现的阻断缺陷）：budget_used_ratio 原为 DECIMAL(5,2)，
     * 只能存到 999.99；预算上限设得比实际产出小一个数量级时（测试里 5 vs 214.78 → 4295.60%）
     * 写回预算标记直接 Out of range，整条聚合绩效建议失败。
     */
    private static final String VERSION_RATIO_FIX = "rdm:schema:v2.3";
    private static final String RATIO_FIX_SCRIPT = "216_rdm_suggestion_ratio_widen.sql";

    /**
     * 阶段 6 补丁：把 RDM_OUTPUT 注册进绩效指标字典 PERF_INDICATOR_TYPE。
     * <p>推送逻辑用 hr_perf_indicator.indicator_type = 'RDM_OUTPUT' 匹配考核单，
     * 但字典与前端下拉都没有这一项，HR 在界面上永远建不出这个指标，
     * 推送通道形同虚设（必然报「沒有匹配到 RDM 產出指標」）。
     */
    private static final String VERSION_INDICATOR_TYPE = "rdm:schema:v2.4";
    private static final String INDICATOR_TYPE_SCRIPT = "217_hr_indicator_type_rdm_output.sql";

    /**
     * 阶段 6 补丁（生产核查发现）：考核单建议分列宽窄于来源列。
     * <p>推送把 rdm_hr_suggestion.total_score DECIMAL(12,2) 原值写进
     * hr_perf_score_item.suggested_score（实查 DECIMAL(6,2)，上限 9999.99），
     * 贡献分一大就 Out of range——与 budget_used_ratio(v2.3) 同一类缺陷。
     */
    private static final String VERSION_SUGGESTED_FIX = "rdm:schema:v2.5";
    private static final String SUGGESTED_FIX_SCRIPT = "218_rdm_suggested_score_widen.sql";
    private static final String[][] RELEASE_FIX_COLUMNS = {
            {"rdm_release", "applicant_emp_no",
                    "ALTER TABLE rdm_release ADD COLUMN applicant_emp_no VARCHAR(32) DEFAULT NULL "
                            + "COMMENT '发起人工号快照' AFTER applicant_user_id"},
    };

    /** 阶段 4 新增列 {表, 列, DDL} */
    private static final String[][] RELEASE_COLUMNS = {
            {"rdm_acceptance", "stage",
                    "ALTER TABLE rdm_acceptance ADD COLUMN stage VARCHAR(16) NOT NULL DEFAULT 'pre_release' "
                            + "COMMENT '验收阶段: pre_release上线前预验收/post_release上线后业务验收' AFTER result"},
            {"rdm_requirement", "flow_version",
                    "ALTER TABLE rdm_requirement ADD COLUMN flow_version INT NOT NULL DEFAULT 1 "
                            + "COMMENT '流程版本: 1=历史记录(无五节点计/定稿快照/工时明细), 2=新链路' AFTER overdue_flag"},
    };

    /** 通知队列表新增列 {表, 列, DDL}（与 ADD COLUMN 一样不可重复执行，逐列先查再加） */
    private static final String[][] NOTIFY_QUEUE_COLUMNS = {
            {"rdm_notify_log", "scenario",
                    "ALTER TABLE rdm_notify_log ADD COLUMN scenario VARCHAR(32) DEFAULT NULL COMMENT '钉钉场景编码（重发时沿用原场景）' AFTER channel"},
            {"rdm_notify_log", "title",
                    "ALTER TABLE rdm_notify_log ADD COLUMN title VARCHAR(200) DEFAULT NULL COMMENT '消息标题（重发载荷）' AFTER scenario"},
            {"rdm_notify_log", "content",
                    "ALTER TABLE rdm_notify_log ADD COLUMN content TEXT COMMENT '消息正文（重发载荷）' AFTER title"},
            {"rdm_notify_log", "at_mobiles",
                    "ALTER TABLE rdm_notify_log ADD COLUMN at_mobiles VARCHAR(512) DEFAULT NULL COMMENT '@手机号列表（逗号分隔）' AFTER content"},
            {"rdm_notify_log", "receivers",
                    "ALTER TABLE rdm_notify_log ADD COLUMN receivers VARCHAR(512) DEFAULT NULL COMMENT '接收人姓名列表（逗号分隔）。一条事件一行、一条群播报消息，所以不按人拆行；旧的 receiver_name/receiver_emp_no 仅保留给历史行' AFTER at_mobiles"},
            {"rdm_notify_log", "attempts",
                    "ALTER TABLE rdm_notify_log ADD COLUMN attempts INT NOT NULL DEFAULT 0 COMMENT '已尝试次数' AFTER send_status"},
            {"rdm_notify_log", "next_retry_at",
                    "ALTER TABLE rdm_notify_log ADD COLUMN next_retry_at DATETIME DEFAULT NULL COMMENT '下次重试时间（退避）' AFTER attempts"},
            {"rdm_notify_log", "channel_name",
                    "ALTER TABLE rdm_notify_log ADD COLUMN channel_name VARCHAR(64) DEFAULT NULL COMMENT '实际受理的渠道名' AFTER next_retry_at"},
    };

    /** 需求主表新增列 {表, 列, DDL}：ADD COLUMN 不可重复执行，逐列先查再加 */
    private static final String[][] INTAKE_COLUMNS = {
            {"rdm_requirement", "intake_round_no",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_round_no INT DEFAULT NULL COMMENT '当前准入轮次序号（0/空=未发起过）' AFTER intake_flow_no"},
            {"rdm_requirement", "intake_policy_id",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_policy_id BIGINT DEFAULT NULL COMMENT '本轮命中的准入策略ID，空=内置默认策略' AFTER intake_round_no"},
            {"rdm_requirement", "intake_policy_name",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_policy_name VARCHAR(128) DEFAULT NULL COMMENT '命中策略名称快照' AFTER intake_policy_id"},
            {"rdm_requirement", "intake_policy_version",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_policy_version VARCHAR(16) DEFAULT NULL COMMENT '命中策略版本快照（规则改了不影响在途单）' AFTER intake_policy_name"},
            {"rdm_requirement", "intake_mode",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_mode VARCHAR(16) DEFAULT NULL COMMENT '本轮准入裁决: APPROVE/FORCE_APPROVE/EXEMPT' AFTER intake_policy_version"},
            {"rdm_requirement", "intake_explain",
                    "ALTER TABLE rdm_requirement ADD COLUMN intake_explain TEXT COMMENT '命中链路说明（为什么免审/为什么要审）' AFTER intake_mode"},
            {"rdm_requirement", "intent_pm_user_id",
                    "ALTER TABLE rdm_requirement ADD COLUMN intent_pm_user_id BIGINT DEFAULT NULL COMMENT '提交时指定的产品经理ID（意向，需审时审批通过后再生效）' AFTER assignee_pm_name"},
            {"rdm_requirement", "intent_pm_name",
                    "ALTER TABLE rdm_requirement ADD COLUMN intent_pm_name VARCHAR(64) DEFAULT NULL COMMENT '指定产品经理姓名快照' AFTER intent_pm_user_id"},
    };

    /** M4 新增表 */
    private static final String[] SCORE_TABLES = {
            "rdm_score_rule", "rdm_score_record", "rdm_metric_snapshot",
    };

    /**
     * 绩效建议值通道列：{表, 列, DDL}。
     * <p>MySQL 的 ADD COLUMN 不可重复执行，所以这三列不能放进脚本（脚本中途失败时
     * 前面的 CREATE TABLE 已自提交，重跑会撞 duplicate column），必须逐列先查再加。
     */
    private static final String[][] PERF_SUGGEST_COLUMNS = {
            {"hr_perf_score_item", "suggested_score",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_score DECIMAL(6,2) DEFAULT NULL COMMENT '系統建議分（RDM 產出積分換算）' AFTER weight"},
            {"hr_perf_score_item", "suggested_source",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_source VARCHAR(32) DEFAULT NULL COMMENT '建議值來源: RDM/MANUAL' AFTER suggested_score"},
            {"hr_perf_score_item", "suggested_at",
                    "ALTER TABLE hr_perf_score_item ADD COLUMN suggested_at DATETIME DEFAULT NULL COMMENT '建議值寫入時間' AFTER suggested_source"},
    };

    /** 需求全生命周期主数据与配置表 */
    private static final String[] TABLES = {
            "rdm_requirement", "rdm_requirement_target", "rdm_requirement_role",
            "rdm_status_log", "rdm_comment", "rdm_attachment", "rdm_acceptance",
            "rdm_status_def", "rdm_transition", "rdm_routing_rule", "rdm_sla_config",
            "rdm_notify_log",
    };

    /** M2 新增表 */
    private static final String[] DELIVERY_TABLES = {
            "rdm_prd", "rdm_review", "rdm_iteration", "rdm_work_task", "rdm_change_request",
    };

    /** M3 新增列（验收一次通过率与返工链路的存证入口，缺列则质量口径只能靠倒推） */
    private static final String[][] ACCEPTANCE_COLUMNS = {
            {"rdm_acceptance", "attempt"},
            {"rdm_acceptance", "test_env"},
            {"rdm_acceptance", "defect_count"},
            {"rdm_acceptance", "follow_up_req_id"},
            {"rdm_requirement", "parent_req_id"},
            {"rdm_requirement", "parent_req_no"},
    };

    /** 状态机种子下限（少于该值说明种子未落全，前端操作区会缺按钮） */
    private static final int MIN_STATUS_DEFS = 23;
    private static final int MIN_TRANSITIONS = 30;

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doMigrate, this::verify);
        versionTracker.applyOnce(VERSION_ATTACHMENT, this::doAttachmentMigrate, this::verifyAttachment);
        versionTracker.applyOnce(VERSION_DELIVERY, this::doDeliveryMigrate, this::verifyDelivery);
        versionTracker.applyOnce(VERSION_ACCEPTANCE, this::doAcceptanceMigrate, this::verifyAcceptance);
        versionTracker.applyOnce(VERSION_SCORE, this::doScoreMigrate, this::verifyScore);
        versionTracker.applyOnce(VERSION_SNAPSHOT_FIX, this::doSnapshotFixMigrate, this::verifySnapshotFix);
        versionTracker.applyOnce(VERSION_INTAKE, this::doIntakeMigrate, this::verifyIntake);
        versionTracker.applyOnce(VERSION_NOTIFY_QUEUE, this::doNotifyQueueMigrate, this::verifyNotifyQueue);
        versionTracker.applyOnce(VERSION_PLAN, this::doPlanMigrate, this::verifyPlan);
        versionTracker.applyOnce(VERSION_RELEASE, this::doReleaseMigrate, this::verifyRelease);
        versionTracker.applyOnce(VERSION_SCHEDULE, this::doScheduleMigrate, this::verifySchedule);
        versionTracker.applyOnce(VERSION_GOVERNANCE, this::doGovernanceMigrate, this::verifyGovernance);
        versionTracker.applyOnce(VERSION_RELEASE_FIX, this::doReleaseFixMigrate, this::verifyReleaseFix);
        versionTracker.applyOnce(VERSION_RATIO_FIX, this::doRatioFixMigrate, this::verifyRatioFix);
        versionTracker.applyOnce(VERSION_INDICATOR_TYPE, this::doIndicatorTypeMigrate, this::verifyIndicatorType);
        versionTracker.applyOnce(VERSION_SUGGESTED_FIX, this::doSuggestedFixMigrate, this::verifySuggestedFix);
    }

    private void doSuggestedFixMigrate() {
        int executed = executeScript(SUGGESTED_FIX_SCRIPT);
        log.info("RDM v2.5 补丁脚本已执行: {} 条语句（{}）", executed, SUGGESTED_FIX_SCRIPT);
    }

    /**
     * 不只验“已扩列”，而是验“写入列与来源列仍同精度”。
     * <p>扩到同精度后溢出在结构上不可能发生，所以不再加永远不会命中的截断兜底；
     * 一旦有人再把任一侧改窄，启动就大声失败，而不是等到推送报 Out of range。
     */
    private void verifySuggestedFix() {
        String target = columnType("hr_perf_score_item", "suggested_score");
        String source = columnType("rdm_hr_suggestion", "total_score");
        if (target == null || source == null) {
            throw new IllegalStateException("RDM v2.5 核验失败：建议分或来源分列不存在（target="
                    + target + ", source=" + source + "）");
        }
        if (!target.equalsIgnoreCase(source)) {
            throw new IllegalStateException("RDM v2.5 核验失败：hr_perf_score_item.suggested_score(" + target
                    + ") 与来源 rdm_hr_suggestion.total_score(" + source + ") 精度不一致，推送会溢出");
        }
    }

    /** 读真实列类型（以 information_schema 为准，不凭建表 SQL 推断） */
    private String columnType(String table, String column) {
        return jdbcTemplate.queryForObject(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                String.class, table, column);
    }

    private void doIndicatorTypeMigrate() {
        int executed = executeScript(INDICATOR_TYPE_SCRIPT);
        log.info("RDM v2.4 补丁脚本已执行: {} 条语句（{}）", executed, INDICATOR_TYPE_SCRIPT);
    }

    /** 推送匹配靠这个字典项，不存在就视为迁移未生效 */
    private void verifyIndicatorType() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = 'PERF_INDICATOR_TYPE' "
                        + "AND code = 'RDM_OUTPUT' AND deleted = 0", Integer.class);
        if (n == null || n == 0) {
            throw new IllegalStateException("RDM v2.4 核验失败：PERF_INDICATOR_TYPE 缺少 RDM_OUTPUT 字典项");
        }
    }

    private void doRatioFixMigrate() {
        int executed = executeScript(RATIO_FIX_SCRIPT);
        log.info("RDM v2.3 补丁脚本已执行: {} 条语句（{}）", executed, RATIO_FIX_SCRIPT);
    }

    /** 直接读列类型而不写死小数位，避免本地参数误判 */
    private void verifyRatioFix() {
        String type = jdbcTemplate.queryForObject(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_hr_suggestion' "
                        + "AND COLUMN_NAME = 'budget_used_ratio'", String.class);
        if (type == null || !type.startsWith("decimal(9")) {
            throw new IllegalStateException("RDM v2.3 核验失败：budget_used_ratio 应为 decimal(9,2)，实际 " + type);
        }
    }

    private void doReleaseFixMigrate() {
        for (String[] col : RELEASE_FIX_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            jdbcTemplate.execute(col[2]);
            log.info("已补阶段 4 缺列: {}.{}", col[0], col[1]);
        }
        // 编号规则种子：缺行时 create 放行单会报「編號生成規則未配置」，整条上线闸门不可用
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES ('rdm_release', '發布放行單號', '產研協同', 'FZ', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')");
        log.info("放行單編號規則種子已写入: 新增 {} 行", inserted);
    }

    /** 阶段 4 补结后置校验：缺列与缺种子都会让放行链路直接报错，所以两项都必须存在 */
    private void verifyReleaseFix() {
        for (String[] col : RELEASE_FIX_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("阶段 4 补结未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
        Integer rules = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = 'rdm_release' AND status = 1", Integer.class);
        if (rules == null || rules == 0) {
            throw new IllegalStateException("放行單編號規則 rdm_release 未就緒（缺失时发起放行必报「編號生成規則未配置」）");
        }
    }

    private void doGovernanceMigrate() {
        int executed = executeScript(GOVERNANCE_SCRIPT);
        log.info("RDM 阶段 6 建表脚本已执行: {} 条语句（{}）", executed, GOVERNANCE_SCRIPT);
    }

    /** 阶段 6 后置校验：两表存在 + 周期/人员与周期的归属唯一键就位 */
    private void verifyGovernance() {
        requireTables(new String[]{"rdm_score_budget", "rdm_hr_suggestion"});
        Integer budgetUk = indexCount("rdm_score_budget", "uk_rdm_score_budget");
        if (budgetUk == null || budgetUk == 0) {
            throw new IllegalStateException("rdm_score_budget 缺少 uk_rdm_score_budget，同周期同部门会出现两份预算互相遮蔽");
        }
        Integer sugUk = indexCount("rdm_hr_suggestion", "uk_rdm_hr_suggestion");
        if (sugUk == null || sugUk == 0) {
            throw new IllegalStateException("rdm_hr_suggestion 缺少 uk_rdm_hr_suggestion，重算会给同一人长多条建议");
        }
    }

    private void doScheduleMigrate() {
        int executed = executeScript(SCHEDULE_SCRIPT);
        log.info("RDM 阶段 5 建表脚本已执行: {} 条语句（{}）", executed, SCHEDULE_SCRIPT);
    }

    /** 阶段 5 后置校验：两表存在 + 依赖边去重键与日历按人按日唯一键就位 */
    private void verifySchedule() {
        requireTables(new String[]{"rdm_task_dependency", "rdm_work_calendar"});
        Integer depUk = indexCount("rdm_task_dependency", "uk_rdm_task_dep");
        if (depUk == null || depUk == 0) {
            throw new IllegalStateException("rdm_task_dependency 缺少 uk_rdm_task_dep，同一条依赖会重复写入并破坏关键路径计算");
        }
        Integer calUk = indexCount("rdm_work_calendar", "uk_rdm_work_calendar");
        if (calUk == null || calUk == 0) {
            throw new IllegalStateException("rdm_work_calendar 缺少 uk_rdm_work_calendar，同人同一天会出现两份容量");
        }
    }

    /** 索引存在性检查（MySQL 8 无 CREATE INDEX IF NOT EXISTS，先查后建/后验） */
    private Integer indexCount(String table, String indexName) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
    }

    private void doReleaseMigrate() {
        int executed = executeScript(RELEASE_SCRIPT);
        log.info("RDM 阶段 4 建表脚本已执行: {} 条语句（{}）", executed, RELEASE_SCRIPT);
        for (String[] col : RELEASE_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺 stage 会把上线前/后两次事实挤成一条，正式满意度口径会被预验收污染
            jdbcTemplate.execute(col[2]);
            log.info("已添加发布放行列: {}.{}", col[0], col[1]);
        }
        /*
         * 轮次唯一键只在存量数据干净时才建：如果历史已有重号（同一需求同 attempt 两行），
         * 直接加键会让整个应用启动失败，这里选择跳过并告警，由存量检查任务先清数。
         */
        Integer dups = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT req_id, attempt FROM rdm_acceptance WHERE deleted = 0 "
                        + "GROUP BY req_id, attempt HAVING COUNT(*) > 1) t",
                Integer.class);
        Integer indexed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_acceptance' AND INDEX_NAME = 'uk_rdm_acceptance_attempt'",
                Integer.class);
        if ((dups == null || dups == 0) && (indexed == null || indexed == 0)) {
            jdbcTemplate.execute("CREATE UNIQUE INDEX uk_rdm_acceptance_attempt ON rdm_acceptance (req_id, stage, attempt)");
            log.info("已创建验收轮次唯一键 uk_rdm_acceptance_attempt(req_id, stage, attempt)");
        } else if (dups != null && dups > 0) {
            log.warn("存量验收记录存在 {} 组轮次重号，未创建 uk_rdm_acceptance_attempt；请先执行存量检查后手动补建", dups);
        }
    }

    /** 阶段 4 后置校验：放行单表 + 两列就绪（stage 缺失会直接写错轮次，不能默让） */
    private void verifyRelease() {
        requireTables(new String[]{"rdm_release"});
        for (String[] col : RELEASE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("阶段 4 结构未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    private void doPlanMigrate() {
        int executed = executeScript(PLAN_SCRIPT);
        log.info("RDM 阶段 3 建表脚本已执行: {} 条语句（{}）", executed, PLAN_SCRIPT);
    }

    /** 阶段 3 后置校验：三张表存在且里程碑唯一键就位（缺 uk 会让一个需求长出一份节点的两行） */
    private void verifyPlan() {
        requireTables(new String[]{"rdm_milestone", "rdm_work_log", "rdm_prd_snapshot"});
        Integer uk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_milestone' AND INDEX_NAME = 'uk_rdm_milestone'",
                Integer.class);
        if (uk == null || uk == 0) {
            throw new IllegalStateException("rdm_milestone 缺少 uk_rdm_milestone(req_id, code)，同一节点会出现双份计划");
        }
        Integer workUk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_work_log' AND INDEX_NAME = 'uk_rdm_work_log_day'",
                Integer.class);
        if (workUk == null || workUk == 0) {
            throw new IllegalStateException("rdm_work_log 缺少日粒度唯一键，同人同日同任务会重复计入工时");
        }
    }

    private void doNotifyQueueMigrate() {
        for (String[] col : NOTIFY_QUEUE_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让重发作业读不到载荷，失败必须抛出并不记版本
            jdbcTemplate.execute(col[2]);
            log.info("已添加通知队列列: {}.{}", col[0], col[1]);
        }
        // MySQL 8 没有 CREATE INDEX IF NOT EXISTS，先查 STATISTICS 再建，避免重跑撞 index already exists
        Integer indexed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_notify_log' AND INDEX_NAME = 'idx_rdm_notify_due'",
                Integer.class);
        if (indexed == null || indexed == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_rdm_notify_due ON rdm_notify_log (send_status, next_retry_at)");
            log.info("已创建通知领取索引 idx_rdm_notify_due");
        }
    }

    /** 2C 后置校验：七个列与到期索引均就绪（缺索引会让重试作业全表扫） */
    private void verifyNotifyQueue() {
        for (String[] col : NOTIFY_QUEUE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("阶段 2C 结构未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
        Integer indexed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_notify_log' AND INDEX_NAME = 'idx_rdm_notify_due'",
                Integer.class);
        if (indexed == null || indexed == 0) {
            throw new IllegalStateException("通知队列表缺少 idx_rdm_notify_due 索引，重试作业会全表扫");
        }
    }

    private void doIntakeMigrate() {
        int executed = executeScript(INTAKE_SCRIPT);
        log.info("RDM 准入策略/轮次建表脚本已执行: {} 条语句（{}）", executed, INTAKE_SCRIPT);
        for (String[] col : INTAKE_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让准入裁决写入报“未知列”，失败必须抛出并不记版本，下次启动重试
            jdbcTemplate.execute(col[2]);
            log.info("已添加准入策略列: {}.{}", col[0], col[1]);
        }
    }

    /** 2B 后置校验：两张新表存在 + 需求主表八列齐备（缺任何一列都无法证明轮次不被旧回调推动） */
    private void verifyIntake() {
        requireTables(new String[]{"rdm_intake_policy", "rdm_intake_round"});
        for (String[] col : INTAKE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("阶段 2B 结构未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    private void doScoreMigrate() {
        int executed = executeScript(SCORE_SCRIPT);
        log.info("RDM M4 建表腳本已執行: {} 条语句（{}）", executed, SCORE_SCRIPT);
        // 绩效表扩展列走条件添加，保证脚本与列变更可重复执行
        for (String[] col : PERF_SUGGEST_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让推送建议值写入报“未知列”，失败必须抛出并不记版本
            jdbcTemplate.execute(col[2]);
            log.info("已添加绩效建議值列: {}.{}", col[0], col[1]);
        }
    }

    /** M4 后置校验：三张表存在、现行规则已种子、绩效建议值列齐备 */
    private void verifyScore() {
        requireTables(SCORE_TABLES);
        requireAtLeast("積分規則现行版本种子", 1,
                "SELECT COUNT(*) FROM rdm_score_rule WHERE rule_code = 'BASE' AND enabled = 1 AND deleted = 0");
        for (String[] col : PERF_SUGGEST_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("M4 結構未就緒：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    /** 列是否存在（当前库） */
    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private void doSnapshotFixMigrate() {
        int executed = executeScript(SNAPSHOT_FIX_SCRIPT);
        log.info("RDM 快照 dim_id 修正脚本已執行: {} 条语句（{}）", executed, SNAPSHOT_FIX_SCRIPT);
    }

    /**
     * 快照修正后置校验：列必须非空、无 NULL 残留、无重复快照日。
     * <p>只要列仍可为空，唯一索引就仍会被 NULL 绕过，下次回填又会长重复行，
     * 所以这三条都必须实查，不能只信脚本报成功。
     */
    private void verifySnapshotFix() {
        String nullable = jdbcTemplate.queryForObject(
                "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_metric_snapshot' "
                        + "AND COLUMN_NAME = 'dim_id'",
                String.class);
        if (!"NO".equalsIgnoreCase(nullable)) {
            throw new IllegalStateException("rdm_metric_snapshot.dim_id 仍可为空（IS_NULLABLE=" + nullable
                    + "），唯一索引会继续被 NULL 绕过");
        }
        Integer nullRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_metric_snapshot WHERE dim_id IS NULL", Integer.class);
        if (nullRows != null && nullRows > 0) {
            throw new IllegalStateException("rdm_metric_snapshot 仍残留 " + nullRows + " 行 dim_id 为 NULL");
        }
        Integer dupGroups = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT stat_date FROM rdm_metric_snapshot "
                        + "GROUP BY stat_date, dim_type, dim_id HAVING COUNT(*) > 1) t", Integer.class);
        if (dupGroups != null && dupGroups > 0) {
            throw new IllegalStateException("rdm_metric_snapshot 存在 " + dupGroups
                    + " 组重复快照日，趋势页会画出重复数据点");
        }
    }

    private void doAcceptanceMigrate() {
        int executed = executeScript(ACCEPTANCE_SCRIPT);
        log.info("RDM M3 验收用例脚本已執行: {} 条语句（{}）", executed, ACCEPTANCE_SCRIPT);
    }

    /**
     * M3 后置校验：用例表必须存在，且验收单/需求主表的关键列必须齐。
     * <p>ADD COLUMN 一旦静默失败（如权限/锁超时）会让写入报“未知列”或直接丢数据，
     * 而 applyOnce 只跑一次不补重试，所以这里逐列实查 information_schema，缺列即抛异常不记版本。
     */
    private void verifyAcceptance() {
        requireTables(new String[]{"rdm_acceptance_case"});
        for (String[] col : ACCEPTANCE_COLUMNS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, col[0], col[1]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("M3 結構未就緒：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    private void doDeliveryMigrate() {
        int executed = executeScript(DELIVERY_SCRIPT);
        log.info("RDM M2 建表腳本已執行: {} 条语句（{}）", executed, DELIVERY_SCRIPT);
    }

    private void verifyDelivery() {
        requireTables(DELIVERY_TABLES);
        requireAtLeast("M2 編號規則", 4,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('rdm_prd','rdm_review','rdm_work_task','rdm_change')");
        requireAtLeast("需求變更流程定義", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'rdm_change' AND status = 1");
        requireAtLeast("需求變更流程配置", 1,
                "SELECT COUNT(*) FROM biz_workflow_config WHERE flow_type = 'rdm_change'");
    }

    private void doMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("RDM 建表腳本已執行: {} 条语句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void doAttachmentMigrate() {
        int executed = executeScript(ATTACHMENT_SCRIPT);
        log.info("RDM 附件欄位腳本已執行: {} 条语句（{}）", executed, ATTACHMENT_SCRIPT);
    }

    /** 执行 classpath 迁移脚本（去掉 -- 注释行后按分号切分；脚本内字面量不含分号） */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表脚本 " + script + "，RDM 表无法创建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // 不吞异常：脚本读不到就等于迁移没做，交给 applyOnce 记失败并下次重试
            throw new IllegalStateException("读取建表脚本失败 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    private void verify() {
        requireTables(TABLES);
        requireAtLeast("rdm_status_def 状态种子", MIN_STATUS_DEFS,
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0");
        requireAtLeast("rdm_transition 流转种子", MIN_TRANSITIONS,
                "SELECT COUNT(*) FROM rdm_transition WHERE deleted = 0");
        requireAtLeast("RDM 编号规则", 2,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('rdm_requirement','rdm_acceptance')");
        requireAtLeast("需求准入流程定义", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'rdm_intake' AND status = 1");
    }

    /** 附件列必须能容下 Base64 Data URL（MEDIUMTEXT），否则上传会静默截断 */
    private void verifyAttachment() {
        requireMediumText("rdm_requirement_target", "screenshot_path");
        requireMediumText("rdm_attachment", "storage_path");
    }

    private void requireMediumText(String table, String column) {
        String type = jdbcTemplate.queryForObject(
                "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                String.class, table, column);
        if (!"mediumtext".equalsIgnoreCase(type)) {
            throw new IllegalStateException(table + "." + column + " 未升级到 MEDIUMTEXT，实际类型: " + type);
        }
    }

    /** 校验一组表已存在（structure 后置校验统一入口） */
    private void requireTables(String[] tables) {
        for (String table : tables) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪");
            }
        }
    }

    private void requireAtLeast(String label, int min, String sql) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class);
        if (count == null || count < min) {
            throw new IllegalStateException(label + " 未就绪: 期望至少 " + min + " 条，实际 " + count + " 条");
        }
    }
}
