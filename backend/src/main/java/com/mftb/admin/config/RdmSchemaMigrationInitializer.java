package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationLock;
import com.mftb.admin.config.migration.RdmBatch34Schema;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.util.BizSeqService;
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
 * RDM（產研交付）M1 结构迁移：建 12 张 {@code rdm_} 表 + 状态机/流转/SLA 种子 + 编号规则 + 准入流程定义。
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

    /**
     * 阶段 7（Batch 1）结构：项目交付与质量管理 — 10 张新表 + 需求/任务表扩展列。
     * <p>为什么要 project_id 和 delivery_item_id：需求原来只到「一条需求=一次交付」，
     * 但真实场景一个需求拆多个交付项、多个需求归一个项目，缺了这两列就无法按项目聚合看板、
     * 也无法把测试批次精确对应到交付项粒度。
     */
    private static final String VERSION_BATCH1 = "rdm:schema:v3.0";
    private static final String BATCH1_SCRIPT = "219_rdm_batch1_project_delivery.sql";

    /**
     * 阶段 8（Batch 2 / Phase 1A）结构：分层并行底座 — 证据失效表 + 幂等日志表
     * + 交付项范围版本列 + 任务依赖跨交付项列。
     * <p>为什么要范围版本与证据失效：交付项一旦开工就可能改范围，若不记版本，
     * 旧范围下做的测试/验收会被当成新范围的质量凭证，并行交付时无法区分“真通过”与“过期通过”。
     */
    private static final String VERSION_BATCH2 = "rdm:schema:v3.1";
    private static final String BATCH2_SCRIPT = "220_rdm_batch2_foundation.sql";

    /**
     * 需求提交/需求管理拆分 · 批次 1：正式需求编号延迟生成 + XQSP 审批流程编号规则。
     * <p>为什么要改列而不是只在前端藏号：{@code create()} 过去在判断草稿/待审之前就把 req_no 拉走了，
     * 于是「审批被驳回的需求也占了一个正式号」。延迟发号要求准入前的行允许 {@code req_no IS NULL}，
     * 这与建表时的 {@code NOT NULL UNIQUE} 直接冲突，必须同批改结构 + 改代码 + 改发号映射
     * （见 {@code OaRequestServiceImpl.submit()} 的 rdm_intake → rdm_intake_approval）。
     * <p>编号唯一性仍由既有 {@code uk_rdm_req_no} 保证：MySQL 唯一索引允许多条 NULL，
     * 所以「准入前无数条互不冲突 / 已生成号码全局唯一」一把键同时成立，不需要部分索引。
     * <p>两条 CHECK 是兜底而不是业务规则：代码保证「落准入状态与发号在同一条更新里」，
     * 数据库保证「就算有人绕过服务层写库，也不会留下已准入却无号的半成品，或用空串冒号码」。
     * <p>参考文档：{@code backend/sql/240_rdm_delayed_req_no_and_xqsp_rule.sql}。下面这段 DDL 是
     * 逐步带存在性判断的版本（不能整脚本重放：ADD CONSTRAINT 重跑必报错），两者口径必须一致。
     */
    private static final String VERSION_DELAYED_REQ_NO = "rdm:schema:v3.4";
    /**
     * 延迟发号 v2：需求编号生成时机从「审批通过」推迟到「产品经理认领」。
     * <p>需要放宽 CHECK 约束：pool/assigned 状态也允许 req_no IS NULL（认领前暂无编号）。
     */
    private static final String VERSION_CLAIM_REQ_NO = "rdm:schema:v3.5";
    /**
     * 迭代編碼系統發號：登記 rdm_iteration_sprint / rdm_iteration_version / rdm_iteration_hotfix
     * 三條編號規則（SP+YYYYMM+3位 / VER+YYYYMM+3位 / HF+YYYYMMDD+2位）。
     * <p>與代碼側 {@code BizSeqService.ruleKeyForIterationType} 同批原子交付：缺行時
     * requireRule fail-closed，新建迭代直接報「編號生成規則未配置」。
     * <p>参考文档：{@code backend/sql/244_rdm_iteration_code_rules.sql}。
     */
    private static final String VERSION_ITERATION_CODE = "rdm:schema:v3.6";
    /**
     * 项目主表补四组负责人列（技术/UI 设计/测试/运维，各 userId+姓名快照共 8 列）。
     * <p>前端新增项目表单已收这四组选人字段（EmployeeSelect 双写 userId+userName），
     * 缺列时服务层写入报“未知列”，代码与列必须同批交付。
     * <p>参考文档：{@code backend/sql/245_rdm_project_lead_columns.sql}。
     */
    private static final String VERSION_PROJECT_LEADS = "rdm:schema:v3.7";

    /** 项目主表负责人列 {表, 列, DDL}：ADD COLUMN 不可重复执行，逐列先查再加 */
    private static final String[][] PROJECT_LEAD_COLUMNS = {
            {"rdm_project", "tech_lead_user_id",
                    "ALTER TABLE rdm_project ADD COLUMN tech_lead_user_id BIGINT DEFAULT NULL COMMENT '技术负责人用户ID' AFTER product_owner_user_name"},
            {"rdm_project", "tech_lead_user_name",
                    "ALTER TABLE rdm_project ADD COLUMN tech_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '技术负责人姓名快照' AFTER tech_lead_user_id"},
            {"rdm_project", "ui_designer_user_id",
                    "ALTER TABLE rdm_project ADD COLUMN ui_designer_user_id BIGINT DEFAULT NULL COMMENT 'UI设计负责人用户ID' AFTER tech_lead_user_name"},
            {"rdm_project", "ui_designer_user_name",
                    "ALTER TABLE rdm_project ADD COLUMN ui_designer_user_name VARCHAR(64) DEFAULT NULL COMMENT 'UI设计负责人姓名快照' AFTER ui_designer_user_id"},
            {"rdm_project", "qa_lead_user_id",
                    "ALTER TABLE rdm_project ADD COLUMN qa_lead_user_id BIGINT DEFAULT NULL COMMENT '测试/QA负责人用户ID' AFTER ui_designer_user_name"},
            {"rdm_project", "qa_lead_user_name",
                    "ALTER TABLE rdm_project ADD COLUMN qa_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '测试/QA负责人姓名快照' AFTER qa_lead_user_id"},
            {"rdm_project", "ops_lead_user_id",
                    "ALTER TABLE rdm_project ADD COLUMN ops_lead_user_id BIGINT DEFAULT NULL COMMENT '运维/DevOps负责人用户ID' AFTER qa_lead_user_name"},
            {"rdm_project", "ops_lead_user_name",
                    "ALTER TABLE rdm_project ADD COLUMN ops_lead_user_name VARCHAR(64) DEFAULT NULL COMMENT '运维/DevOps负责人姓名快照' AFTER ops_lead_user_id"},
    };
    /**
     * 允许 req_no IS NULL 的状态集合的 SQL IN 列表（延迟发号 v2）。
     * <p>使用 {@code RdmConstants.REQ_NO_NULLABLE_STATUSES} 而非 {@code REQ_NOT_ADMITTED_STATUSES}：
     * 后者只含准入前三态，前者额外包含 pool/assigned（认领前允许暂无编号）。
     */
    private String reqNoNullableStatusList() {
        return "('" + String.join("', '", RdmConstants.REQ_NO_NULLABLE_STATUSES.stream().sorted().toList()) + "')";
    }
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

    /** 阶段 7（Batch 1）新增表 */
    private static final String[] BATCH1_TABLES = {
            "rdm_project", "rdm_project_member", "rdm_delivery_item",
            "rdm_test_batch", "rdm_test_execution", "rdm_issue", "rdm_issue_defer",
            "rdm_release_batch", "rdm_release_deployment", "rdm_acceptance_record",
    };

    /** 阶段 7（Batch 1）需求/任务表新增列 {表, 列, DDL} */
    private static final String[][] BATCH1_COLUMNS = {
            {"rdm_requirement", "project_id",
                    "ALTER TABLE rdm_requirement ADD COLUMN project_id BIGINT NULL COMMENT '所属项目ID' AFTER parent_req_no"},
            {"rdm_requirement", "structure_parent_req_id",
                    "ALTER TABLE rdm_requirement ADD COLUMN structure_parent_req_id BIGINT NULL COMMENT '结构父需求ID(主子关系)' AFTER project_id"},
            {"rdm_requirement", "requirement_kind",
                    "ALTER TABLE rdm_requirement ADD COLUMN requirement_kind VARCHAR(16) NOT NULL DEFAULT 'execution' COMMENT '需求种类:aggregate/execution' AFTER structure_parent_req_id"},
            {"rdm_work_task", "delivery_item_id",
                    "ALTER TABLE rdm_work_task ADD COLUMN delivery_item_id BIGINT NULL COMMENT '关联交付项ID' AFTER req_id"},
    };

    /** 阶段 8（Batch 2）新增表 */
    private static final String[] BATCH2_TABLES = {
            "rdm_evidence_invalidation", "rdm_idempotent_log",
    };

    /**
     * 阶段 8（Batch 2）交付项/任务依赖表新增列 {表, 列, DDL}。
     * <p>MySQL 8 无 ADD COLUMN IF NOT EXISTS，这些列不能放进脚本（脚本中途失败时
     * 前面的 CREATE TABLE 已自提交，重跑会撞 duplicate column），必须逐列先查再加。
     */
    private static final String[][] BATCH2_COLUMNS = {
            {"rdm_delivery_item", "scope_frozen_at",
                    "ALTER TABLE rdm_delivery_item ADD COLUMN scope_frozen_at DATETIME NULL COMMENT '范围冻结时间' AFTER scope_version"},
            {"rdm_delivery_item", "scope_frozen_by",
                    "ALTER TABLE rdm_delivery_item ADD COLUMN scope_frozen_by BIGINT NULL COMMENT '范围冻结人' AFTER scope_frozen_at"},
            {"rdm_delivery_item", "scope_change_log",
                    "ALTER TABLE rdm_delivery_item ADD COLUMN scope_change_log JSON NULL COMMENT '范围变更日志' AFTER scope_frozen_by"},
            {"rdm_task_dependency", "block_point",
                    "ALTER TABLE rdm_task_dependency ADD COLUMN block_point VARCHAR(16) NOT NULL DEFAULT 'start' COMMENT '阻断点:start/test/release' AFTER lag_days"},
            {"rdm_task_dependency", "cross_delivery_flag",
                    "ALTER TABLE rdm_task_dependency ADD COLUMN cross_delivery_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否跨交付项' AFTER block_point"},
            {"rdm_task_dependency", "pred_delivery_item_id",
                    "ALTER TABLE rdm_task_dependency ADD COLUMN pred_delivery_item_id BIGINT NULL COMMENT '前置交付项ID' AFTER cross_delivery_flag"},
            {"rdm_task_dependency", "succ_delivery_item_id",
                    "ALTER TABLE rdm_task_dependency ADD COLUMN succ_delivery_item_id BIGINT NULL COMMENT '后续交付项ID' AFTER pred_delivery_item_id"},
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

    /**
     * 免审批直送的【落点真值】补登：把池基落点从代码里收回 {@code rdm_transition}。
     * <p>为什么要单独一个版本键：状态机真值定义就是 rdm_status_def + rdm_transition
     * （见 204 脚本头注），而 {@code rdm:schema:v1.0} 在存量库不会重跑——只改脚本不会给
     * 已有环境补上 {@code resubmit_pool}，免审批重提就会因查不到配置而直接报错。
     * <p>口径：配置只给<b>基落点 pool</b>；「提交时已指定有效产品则直送 assigned」仍由代码
     * 按意向细化（{@code RdmRequirementServiceImpl}），OA 终审回调的
     * {@code approve_intake→pool + applyIntentPm→assigned} 是同一形状，不另造一套。
     * <p>配置缺行/停用时 {@code findTransition} 返回 null → 服务层拒绝提交，
     * <b>不得把缺配置当成「审批已完成」或「自动免审」</b>（方案 §四 明文要求）。
     */
    private static final String VERSION_EXEMPT_TRANSITION = "rdm:transition:v1.0";

    /** 免审批直送的配置动作码（与 204 种子的 action_code 逐字一致） */
    private static final String ACTION_SUBMIT_POOL = "submit_pool";
    private static final String ACTION_RESUBMIT_POOL = "resubmit_pool";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final MigrationLock migrationLock;
    private final RdmBatch34Schema batch34Schema;

    @Override
    public void run(String... args) {
        String schema = jdbcTemplate.queryForObject("SELECT DATABASE()", String.class);
        if (schema == null || schema.isBlank()) throw new IllegalStateException("RDM迁移无法确定数据库命名锁范围");
        migrationLock.runExclusive("mftb:schema:" + schema, 120, this::runMigrations);
    }

    private void runMigrations() {
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
        versionTracker.applyOnce(VERSION_BATCH1, this::doBatch1Migrate, this::verifyBatch1);
        versionTracker.applyOnce(VERSION_BATCH2, this::doBatch2Migrate, this::verifyBatch2);
        versionTracker.applyOnce(RdmBatch34Schema.VERSION_3,
                () -> batch34Schema.migrate(RdmBatch34Schema.SCRIPT_3),
                () -> batch34Schema.verify(RdmBatch34Schema.SCRIPT_3));
        versionTracker.applyOnce(RdmBatch34Schema.VERSION_4,
                () -> batch34Schema.migrate(RdmBatch34Schema.SCRIPT_4),
                () -> batch34Schema.verify(RdmBatch34Schema.SCRIPT_4));
        // 已记版本仍检查列、唯一键及约束，不能靠applyOnce跳过验证掩盖漂移。
        batch34Schema.verify(RdmBatch34Schema.SCRIPT_3);
        batch34Schema.verify(RdmBatch34Schema.SCRIPT_4);
        versionTracker.applyOnce(VERSION_DELAYED_REQ_NO, this::doDelayedReqNoMigrate, this::verifyDelayedReqNo);
        versionTracker.applyOnce(VERSION_CLAIM_REQ_NO, this::doClaimReqNoMigrate, this::verifyClaimReqNo);
        versionTracker.applyOnce(VERSION_ITERATION_CODE, this::doIterationCodeMigrate, this::verifyIterationCode);
        versionTracker.applyOnce(VERSION_PROJECT_LEADS, this::doProjectLeadsMigrate, this::verifyProjectLeads);
        versionTracker.applyOnce(VERSION_EXEMPT_TRANSITION, this::doExemptTransitionSeed, this::verifyExemptTransitionSeed);
    }

    /**
     * v（rdm:transition:v1.0）：免审批直送的两个基落点动作种子。
     * <p>{@code submit_pool} 早在 204 就有，这里仍走 INSERT IGNORE 做兵底：存量库被人
     * 为删行/改名时，不补就会让免审批提交直接失败；已存在时则不覆盖管理员自定义。
     */
    private void doExemptTransitionSeed() {
        // allowed_roles 只给 SUBMITTER：免审批直送是提出人自己的提交动作，不得给审批岗或多开权限面
        int a = jdbcTemplate.update(
                "INSERT IGNORE INTO rdm_transition (from_status, to_status, action_code, action_name, "
                        + "allowed_roles, required_fields, sort_order, status) "
                        + "VALUES ('draft', 'pool', ?, '免審批直送需求池', 'SUBMITTER', '', 2, 1)", ACTION_SUBMIT_POOL);
        int b = jdbcTemplate.update(
                "INSERT IGNORE INTO rdm_transition (from_status, to_status, action_code, action_name, "
                        + "allowed_roles, required_fields, sort_order, status) "
                        + "VALUES ('intake_rejected', 'pool', ?, '免審批重提直送需求池', 'SUBMITTER', '', 6, 1)",
                ACTION_RESUBMIT_POOL);
        log.info("RDM 免审批直送动作种子已写入: submit_pool 新增 {} 行、resubmit_pool 新增 {} 行", a, b);
    }

    /**
     * 后置校验：两条动作必须存在且启用，且落点是 pool。
     * <p>为什么把种子当硬条件：免审批分支现在以配置为落点真值，配置不在就是「无落点可用」；
     * 不校验收等于把一个只在代码里存在的路径记成「迁移成功」，到生产上直接报错。
     */
    private void verifyExemptTransitionSeed() {
        requireEnabledTransition(RdmConstants.STATUS_DRAFT, ACTION_SUBMIT_POOL);
        requireEnabledTransition(RdmConstants.STATUS_INTAKE_REJECTED, ACTION_RESUBMIT_POOL);
    }

    /** 指定 (from_status, action_code) 必须存在、启用且落点为需求池 */
    private void requireEnabledTransition(String fromStatus, String actionCode) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_transition WHERE deleted = 0 AND status = 1 "
                        + "AND from_status = ? AND action_code = ? AND to_status = ?",
                Integer.class, fromStatus, actionCode, RdmConstants.STATUS_POOL);
        if (n == null || n == 0) {
            throw new IllegalStateException("RDM 免审批直送配置未就绪：rdm_transition 缺启用行 "
                    + fromStatus + " --" + actionCode + "--> pool（缺配置不得当免审放行，服务层会直接拒提交）");
        }
    }

    /**
     * v3.4：正式需求编号延迟生成。
     * <p>每一步都先读 information_schema 再决定是否执行（MySQL 8 没有
     * {@code ADD CONSTRAINT IF NOT EXISTS}），所以中途失败后下次启动可重入；
     * 任何一步失败都直接向上抛，由 applyOnce 记失败并不记版本，绝不自吞异常假称已迁移。
     */
    private void doDelayedReqNoMigrate() {
        // 1. 放开 NOT NULL：MODIFY 可重复执行，已为 NULL 时是无操作
        jdbcTemplate.execute("ALTER TABLE rdm_requirement MODIFY COLUMN req_no VARCHAR(32) NULL DEFAULT NULL "
                + "COMMENT '需求编号 XQ+YYYYMMDD+4位；仅首次准入成功（审批全通过或免审批）时生成，准入前为 NULL'");
        // 2. 已准入必须有号（准入前三态 + pool/assigned 例外，延迟发号 v2）
        if (!checkConstraintExists("ck_rdm_req_no_admitted")) {
            jdbcTemplate.execute("ALTER TABLE rdm_requirement ADD CONSTRAINT ck_rdm_req_no_admitted "
                    + "CHECK (status IN " + reqNoNullableStatusList() + " OR req_no IS NOT NULL)");
        }
        // 3. 有号就不能是空白：禁止空串/内部 ID/XQSP 号冒充正式需求号
        if (!checkConstraintExists("ck_rdm_req_no_blank")) {
            jdbcTemplate.execute("ALTER TABLE rdm_requirement ADD CONSTRAINT ck_rdm_req_no_blank "
                    + "CHECK (req_no IS NULL OR CHAR_LENGTH(TRIM(req_no)) > 0)");
        }
        // 4. XQSP 审批流程编号规则种子：缺行时 rdm_intake 提交会直接报「編號生成規則未配置」，
        //    代码侧把流程路由到新规则与本行种子必须同批落地，否则每次提交都失败。
        //    rule_key 一律用 BizSeqService 常量拼接，不让种子与发号代码各写一份字面量飘移。
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                        + "seq_length, seq_start, status, remark) VALUES "
                        + "('" + BizSeqService.RULE_RDM_INTAKE_APPROVAL + "', '需求審批流程編號', '流程審批系統－需求審批', 'XQSP', 'YYYYMMDD', 2, 1, 1, "
                        + "'{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，不截斷、不循環複用。僅在需求正式提交且需要審批時為本輪生成；免審批需求不產生本編號。')");
        // 5. 既有 rdm_requirement 规则只刷新说明，不改前缀/位数/流水起点（历史号码与计数器一律不动）
        int refreshed = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET rule_name = '需求編號', biz_menu = '流程審批系統－需求審批', "
                        + "remark = '{prefix} + YYYYMMDD + {n}位自增序號。生成時機：首次准入成功（審批全部通過，或服務端免審批裁決命中）時生成一次，准入前的草稿/待審批/審批駁回不預佔、不消費流水；存量已生成號碼保持不變。' "
                        + "WHERE rule_key = '" + BizSeqService.RULE_RDM_REQUIREMENT + "'");
        log.info("RDM v3.4 延迟发号迁移完成：XQSP 规则新增 {} 行、需求编号规则说明刷新 {} 行", inserted, refreshed);
    }

    /**
     * v3.4 后置校验：列必须真的可空、两条 CHECK 必须强制生效、XQSP 规则必须可用。
     * <p>为什么不能只验「列存在」：本迁移改的是可空性，列存在但仍是 NOT NULL 时，
     * {@code create()} 存草稿会直接 SQLException——只有实查 IS_NULLABLE 才能证明迁移真生效。
     * <p>CHECK 必须是 ENFORCED='YES'：MySQL 5.7/8.0.16 之前会静默接受并忽略 CHECK，
     * 登记成「已迁移」但兜底不存在，比没有更危险。
     */
    private void verifyDelayedReqNo() {
        String nullable = jdbcTemplate.queryForObject(
                "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_requirement' AND COLUMN_NAME = 'req_no'",
                String.class);
        if (!"YES".equalsIgnoreCase(nullable)) {
            throw new IllegalStateException("RDM v3.4 核验失败：rdm_requirement.req_no 仍为 NOT NULL（实际 "
                    + nullable + "），准入前需求无法落库");
        }
        if (!checkConstraintExists("ck_rdm_req_no_admitted")) {
            throw new IllegalStateException("RDM v3.4 核验失败：CHECK ck_rdm_req_no_admitted 缺失或未强制");
        }
        if (!checkConstraintExists("ck_rdm_req_no_blank")) {
            throw new IllegalStateException("RDM v3.4 核验失败：CHECK ck_rdm_req_no_blank 缺失或未强制");
        }
        // 唯一键必须还在：延迟发号只放开空值，已生成号码仍要全局唯一
        Integer uk = indexCount("rdm_requirement", "uk_rdm_req_no");
        if (uk == null || uk == 0) {
            throw new IllegalStateException("RDM v3.4 核验失败：rdm_requirement 缺 uk_rdm_req_no，正式需求编号可能重号");
        }
        requireAtLeast("需求審批流程編號規則 rdm_intake_approval", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = '" + BizSeqService.RULE_RDM_INTAKE_APPROVAL + "' "
                        + "AND prefix = 'XQSP' AND status = 1");
        requireAtLeast("需求編號規則 rdm_requirement", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = '" + BizSeqService.RULE_RDM_REQUIREMENT + "' AND status = 1");
    }

    /**
     * v3.5 迁移：放宽 CHECK 约束，允许 pool/assigned 状态也接受 req_no IS NULL。
     * <p>延迟发号 v2：需求编号生成时机从「审批通过」推迟到「产品经理认领」，
     * 因此 pool 和 assigned 状态在认领前允许暂无编号。
     * <p>操作：DROP 旧约束 → 用扩展后的状态集重建。DROP IF EXISTS + ADD 可重复执行。
     */
    /**
     * v3.6：迭代編碼改系統發號，登記三條編號規則（INSERT IGNORE 兜底，不覆蓋管理員自定義）。
     */
    private void doIterationCodeMigrate() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                        + "seq_length, seq_start, status, remark) VALUES "
                        + "('" + BizSeqService.RULE_RDM_ITERATION_SPRINT + "', '迭代編碼－常規迭代', '產研交付', 'SP', 'YYYYMM', 3, 1, 1, "
                        + "'{prefix} + YYYYMM + {n}位自增序號：新建迭代時系統統一發號（如 SP202610001），前端不收手工輸入；按月重置流水'), "
                        + "('" + BizSeqService.RULE_RDM_ITERATION_VERSION + "', '迭代編碼－版本專項', '產研交付', 'VER', 'YYYYMM', 3, 1, 1, "
                        + "'{prefix} + YYYYMM + {n}位自增序號：新建迭代時系統統一發號（如 VER202610001），前端不收手工輸入；按月重置流水'), "
                        + "('" + BizSeqService.RULE_RDM_ITERATION_HOTFIX + "', '迭代編碼－緊急修復', '產研交付', 'HF', 'YYYYMMDD', 2, 1, 1, "
                        + "'{prefix} + YYYYMMDD + {n}位自增序號：hotfix 講時效按日出號（如 HF2026101801），前端不收手工輸入')");
        log.info("RDM v3.6 迭代編碼規則遷移完成：新增 {} 行規則", inserted);
    }

    /**
     * v3.6 后置校验：三条规则必须存在且启用、前缀与位数正确。
     * <p>只校「行存在」不够：规则被停用或前缀被改时，发号口径与规则页展示会对不上。
     */
    private void verifyIterationCode() {
        requireAtLeast("迭代編碼規則 rdm_iteration_sprint", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = '" + BizSeqService.RULE_RDM_ITERATION_SPRINT + "' "
                        + "AND prefix = 'SP' AND date_format = 'YYYYMM' AND seq_length = 3 AND status = 1");
        requireAtLeast("迭代編碼規則 rdm_iteration_version", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = '" + BizSeqService.RULE_RDM_ITERATION_VERSION + "' "
                        + "AND prefix = 'VER' AND date_format = 'YYYYMM' AND seq_length = 3 AND status = 1");
        requireAtLeast("迭代編碼規則 rdm_iteration_hotfix", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = '" + BizSeqService.RULE_RDM_ITERATION_HOTFIX + "' "
                        + "AND prefix = 'HF' AND date_format = 'YYYYMMDD' AND seq_length = 2 AND status = 1");
    }

    /**
     * v3.7：项目主表补四组负责人列（逐列先查再加，ADD COLUMN 重跑必撞 duplicate column）。
     */
    private void doProjectLeadsMigrate() {
        for (String[] col : PROJECT_LEAD_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让项目保存报“未知列”，失败必须抛出并不记版本，下次启动重试
            jdbcTemplate.execute(col[2]);
            log.info("已添加项目负责人列: {}.{}", col[0], col[1]);
        }
    }

    /** v3.7 后置校验：八列齐备，缺任何一列都无法证明负责人能落库 */
    private void verifyProjectLeads() {
        for (String[] col : PROJECT_LEAD_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("RDM v3.7 核验失败：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    private void doClaimReqNoMigrate() {
        // DROP 旧约束（如果存在）
        if (checkConstraintExists("ck_rdm_req_no_admitted")) {
            jdbcTemplate.execute("ALTER TABLE rdm_requirement DROP CHECK ck_rdm_req_no_admitted");
        }
        // 用扩展后的状态集重建
        jdbcTemplate.execute("ALTER TABLE rdm_requirement ADD CONSTRAINT ck_rdm_req_no_admitted "
                + "CHECK (status IN " + reqNoNullableStatusList() + " OR req_no IS NOT NULL)");
        // 刷新需求编号规则说明
        jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET remark = "
                        + "'{prefix} + YYYYMMDD + {n}位自增序號。生成時機：產品經理認領（claim）時首次生成，"
                        + "審批通過/免審提交不預佔、不消費流水；存量已生成號碼保持不變。' "
                        + "WHERE rule_key = '" + BizSeqService.RULE_RDM_REQUIREMENT + "'");
        log.info("RDM v3.5 延迟发号 v2 迁移完成：CHECK 约束已放宽（pool/assigned 允许 NULL）");
    }

    /**
     * v3.5 后置校验：约束必须存在且已强制，状态集必须包含 pool/assigned。
     */
    private void verifyClaimReqNo() {
        if (!checkConstraintExists("ck_rdm_req_no_admitted")) {
            throw new IllegalStateException("RDM v3.5 核验失败：CHECK ck_rdm_req_no_admitted 缺失或未强制");
        }
        // 验证约束内容确实包含 pool 和 assigned
        String checkClause = jdbcTemplate.queryForObject(
                "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_rdm_req_no_admitted'",
                String.class);
        if (checkClause == null || (!checkClause.contains("pool") && !checkClause.contains("assigned"))) {
            throw new IllegalStateException("RDM v3.5 核验失败：CHECK 约束未包含 pool/assigned 状态");
        }
    }

    /**
     * CHECK 约束是否已存在且处于强制状态。
     * <p>读 {@code TABLE_CONSTRAINTS}而不是 {@code CHECK_CONSTRAINTS}：MySQL 8 的
     * {@code CHECK_CONSTRAINTS} 只有 CHECK_CLAUSE，没有 ENFORCED 列（把它当筛选条件会直接
     * BadSqlGrammarException，整个迁移因而不记版本）；ENFORCED 在 TABLE_CONSTRAINTS 上，
     * 与 {@code RdmBatch34Schema.constraintExists} 保持同一查法。
     * <p>必须要求 ENFORCED='YES'：不被强制的 CHECK（旧版本/被人为置 NO）兑底等于不存在，
     * 记成「已迁移」比没记更危险。
     */
    private boolean checkConstraintExists(String constraintName) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'rdm_requirement' "
                        + "AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK' AND ENFORCED = 'YES'",
                Integer.class, constraintName);
        return n != null && n > 0;
    }

    private void doBatch1Migrate() {
        int executed = executeScript(BATCH1_SCRIPT);
        log.info("RDM v3.0 Batch1 建表脚本已执行: {} 条语句（{}）", executed, BATCH1_SCRIPT);
        for (String[] col : BATCH1_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            jdbcTemplate.execute(col[2]);
            log.info("已添加 Batch1 扩展列: {}.{}", col[0], col[1]);
        }
        // 索引：MySQL 8 无 CREATE INDEX IF NOT EXISTS，先查再建
        if (indexCount("rdm_requirement", "idx_project") == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_project ON rdm_requirement (project_id)");
        }
        if (indexCount("rdm_requirement", "idx_structure_parent") == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_structure_parent ON rdm_requirement (structure_parent_req_id)");
        }
        if (indexCount("rdm_work_task", "idx_delivery_item") == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_delivery_item ON rdm_work_task (delivery_item_id)");
        }
    }

    /** v3.0 后置校验：10 张新表存在 + 需求表 project_id 列就绪 + 任务表 delivery_item_id 列就绪 */
    private void verifyBatch1() {
        requireTables(BATCH1_TABLES);
        for (String[] col : BATCH1_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("v3.0 Batch1 结构未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
        requireAtLeast("Batch1 编号规则", 6,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN "
                        + "('rdm_project','rdm_delivery_item','rdm_test_batch','rdm_issue','rdm_release_batch','rdm_acceptance_record')");
    }

    private void doBatch2Migrate() {
        int executed = executeScript(BATCH2_SCRIPT);
        log.info("RDM v3.1 Batch2 建表脚本已执行: {} 条语句（{}）", executed, BATCH2_SCRIPT);
        for (String[] col : BATCH2_COLUMNS) {
            if (columnExists(col[0], col[1])) {
                continue;
            }
            // 不吞异常：缺列会让范围冻结/跨交付项依赖写入报“未知列”，失败必须抛出并不记版本
            jdbcTemplate.execute(col[2]);
            log.info("已添加 Batch2 扩展列: {}.{}", col[0], col[1]);
        }
        // 结构父索引：v3.0 已建，这里只做幂等兜底（MySQL 8 无 CREATE INDEX IF NOT EXISTS，先查再建）
        if (indexCount("rdm_requirement", "idx_structure_parent") == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_structure_parent ON rdm_requirement (structure_parent_req_id)");
        }
        // 跨交付项依赖按后续交付项反查阻塞关系，补索引避免全表扫
        if (indexCount("rdm_task_dependency", "idx_succ_delivery_item") == 0) {
            jdbcTemplate.execute("CREATE INDEX idx_succ_delivery_item ON rdm_task_dependency (succ_delivery_item_id)");
        }
    }

    /** v3.1 后置校验：2 张新表存在 + 交付项 scope_frozen_at 列就绪 + 任务依赖 block_point 列就绪 */
    private void verifyBatch2() {
        requireTables(BATCH2_TABLES);
        for (String[] col : BATCH2_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("v3.1 Batch2 结构未就绪：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
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
                        + "VALUES ('rdm_release', '發布放行單號', '產研交付', 'FZ', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號')");
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
