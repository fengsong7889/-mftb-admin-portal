package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationLock;
import com.mftb.admin.config.migration.RdmBatch34Schema;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.constant.RdmDailyReportTemplates;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

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

    /**
     * 甘特图调期（阶段二）：rdm_work_task 补 plan_version 乐观锁列 + 新增 rdm_task_plan_log 审计表。
     * <p>拖拽调期与任务表单改期共用 plan_version 防并发互盖；审计只追加，供追溯谁改了哪条排期。
     * <p>参考文档：{@code backend/sql/246_rdm_task_plan_version_audit.sql}。
     */
    private static final String VERSION_TASK_PLAN = "rdm:schema:v3.8";

    /**
     * 团队负载（阶段 B-2）：新增 rdm_resource_member 资源名册表。
     * <p>把「谁纳入团队负载」显式化，纳入 B-1 无法覆盖的「已进名册但当前无在途单据」的人；
     * 只 ADD 新表、不改任何现有表，与 v3.8 的 rdm_task_plan_log（任务排期审计）无语义交集。
     * <p>参考文档：{@code backend/sql/253_rdm_resource_member.sql}。
     */
    private static final String VERSION_RESOURCE_MEMBER = "rdm:schema:v3.9";

    /**
     * 团队负载（阶段 B-2.5）：新增 rdm_resource_plan 个人工作计划表 + rdm_resource_plan_log 计划调整审计表。
     * <p>为产品需求/测试批次等「只有件数无个人工时」的来源提供跨来源工时/剩余工时载体，减少 data_incomplete；
     * 只 ADD 两张新表、不改任何现有表，work_task_id UNIQUE 避免与 rdm_work_task 双真值，与 v3.8 排期审计无交集。
     * <p>参考文档：{@code backend/sql/256_rdm_resource_plan.sql}。
     */
    private static final String VERSION_RESOURCE_PLAN = "rdm:schema:v3.10";

    /**
     * v3.11：任务类型字典表 rdm_task_type_config（业务可配置）+ 六条内置种子。
     * <p>任务类型下拉选项/图例色/聚合桶/写校验四件事同源：新增类型（如 android/ios）
     * 只配本表即可，category 三值 design/qa/dev 决定负载统计与工时归集口径。
     * <p>权威脚本：classpath {@code 257_rdm_task_type_config.sql}（参考副本 backend/sql 同名），
     * CREATE TABLE IF NOT EXISTS + INSERT IGNORE 可安全重放。
     */
    private static final String VERSION_TASK_TYPE_DICT = "rdm:schema:v3.11";
    private static final String TASK_TYPE_DICT_SCRIPT = "257_rdm_task_type_config.sql";

    /**
     * v3.12：任务类型字典内置扩充（14 类）+ 按岗位族重排既有六类排序。
     * <p>APP 单档不够用：按市面工程师岗位与本项目客户端矩阵（iOS/安卓/鸿蒙、
     * APP/小程序/H5/Mpay）补齐移动端细分与 DevOps/SRE/安全/算法/自动化测试/UX 等内置范本。
     * <p>移动端/平台/全栈一律 dev 桶，自动化与性能测试归 qa 桶，交互与视觉归 design 桶，
     * 所以负载与工时统计无需改代码就能拿对口径。除移动端细分与运维/算法外默认停用，
     * 避免下拉过长；按需时在「任務類型」页一键启用。
     * <p>权威脚本：classpath {@code 258_rdm_task_type_builtin_seeds.sql}（参考副本 backend/sql 同名）。
     */
    private static final String VERSION_TASK_TYPE_SEEDS = "rdm:schema:v3.12";
    private static final String TASK_TYPE_SEEDS_SCRIPT = "258_rdm_task_type_builtin_seeds.sql";
    /** 本次内置扩充的类型数（后置校验钉住，少一个都不记版本） */
    private static final int MIN_TASK_TYPE_BUILTIN_SEEDS = 14;

    /**
     * v3.13：验收用例补证据附件列。
     * <p>业务验收过去只能打字、无法附截图：证据沿用 205 的 Base64 Data URL 存 MEDIUMTEXT 口径，
     * 服务端不落盘。正文不随验收历史下发（返工数轮 × 十余条用例 × 数张图会把列表请求撑爆），
     * 改由按需单张取图端点下发，所以结构上只需一列。
     */
    private static final String VERSION_ACCEPTANCE_EVIDENCE = "rdm:schema:v3.13";
    /** {表, 列, DDL}：ADD COLUMN 不可重跑（必撞 duplicate column），先查再加 */
    private static final String[] ACCEPTANCE_EVIDENCE_COLUMN = {
            "rdm_acceptance_case", "evidence_json",
            "ALTER TABLE rdm_acceptance_case ADD COLUMN evidence_json MEDIUMTEXT DEFAULT NULL COMMENT '驗收證據附件JSON: [{name,type,size,dataUrl}]，列表僅回元信息，正文按需單張取'",
    };

    /**
     * v3.14：项目主表补「最后更新人」列。
     * <p>项目总览列表要显示是谁最后改的：过去只有 updated_at，看得到何时改、看不到谁改，
     * 追责与交接都断在这一步。全项目已有 updated_by 惯例（sys_user / eam_model /
     * rdm_task_type_config 等），本列同构、可空且不回填存量（历史行谁改的已是未知事实，
     * 编一个更新人比留空更糟）。
     * <p>注意：项目的 MetaObjectHandler 只按名字填 createdAt / updatedAt，updated_by 不会
     * 被自动填充，必须由 RdmProjectService 在 createProject / updateProject 显式赋值。
     */
    private static final String VERSION_PROJECT_UPDATED_BY = "rdm:schema:v3.14";
    /** {表, 列, DDL}：ADD COLUMN 不可重放（必撞 duplicate column），先查再加 */
    private static final String[] PROJECT_UPDATED_BY_COLUMN = {
            "rdm_project", "updated_by",
            "ALTER TABLE rdm_project ADD COLUMN updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人姓名快照' AFTER updated_at",
    };

    /**
     * v3.15：迭代表补「所属项目」列（归属体系改造切片一）。
     * <p>对齐 Jira Sprint/Version 归属项目的业界做法：改造前迭代是全局的，
     * 需求按项目统计无法回答「这个项目上了哪些迭代」。口径：sprint / version 必须挂项目，
     * hotfix（紧急修复）允许不挂（跨项目线上事故的平台级热修，管理员已裁决）。
     * <p>可空且不回填存量：存量迭代无法自动判定归属（编码里没有项目信息），
     * 由管理员在迭代排期列表逐个补挂，未挂行前端显示「未掛項目」警示 Tag。
     */
    private static final String VERSION_ITERATION_PROJECT = "rdm:schema:v3.15";
    /** {表, 列, DDL}：ADD COLUMN 不可重放（必撞 duplicate column），先查再加 */
    private static final String[] ITERATION_PROJECT_COLUMN = {
            "rdm_iteration", "project_id",
            "ALTER TABLE rdm_iteration ADD COLUMN project_id BIGINT DEFAULT NULL COMMENT '所属项目ID（sprint/version必填，hotfix可空）' AFTER name",
    };
    /** 项目维度检索索引：按项目统计迭代/需求时的扫描路径 */
    private static final String ITERATION_PROJECT_INDEX = "idx_rdm_iteration_project";

    /**
     * v3.16：每日钉钉日报三表（快照 / 推送配置 / 推送模板）+ 项目编号规则改 PROJ。
     * <p>产研交付需要每日定时把「项目 → 迭代 → 需求」进度同步到钉钉群，并定向推送给
     * 项目经理/产品负责人。三表各管一件事：快照（通知与详情页同源）、配置（时间/开关/接收范围/
     * 选用模板，页面可配改后即时生效）、模板（预置 7 套，定义单一真相源在
     * {@link com.mftb.admin.constant.RdmDailyReportTemplates}，迁移与渲染共用）。
     * <p>快照表唯一键 {@code (report_date, report_type)} 即「每天每档一行」，既是多实例并发 tick /
     * 重启补跑的幂等兜底，也是详情页按日期取数的唯一口径；<b>手动触发不新增行</b>，语义是
     * 「补发当日该档」，触发方式与人记在 last_trigger_* 与 push_count，避免同一天出现多份互相矛盾的口径。
     * <p>同批改项目编号规则（{@code sys_biz_seq_rule.rdm_project}）：PJ+YYYYMMDD+4 位 →
     * PROJ+YYYYMMDD+2 位日流水。发号代码零改动（{@code BizSeqService} 规则驱动，按 prefix+日期段
     * 行锁自增、每日从 seq_start 重置）；<b>存量 PJ 号不改写</b>——历史号已被钉钉通知、审批快照、
     * 已发链接引用，改写会造成追溯断链，唯一键下新旧前缀可共存。
     */
    private static final String VERSION_DAILY_REPORT = "rdm:schema:v3.16";
    /** v3.16 新建三表（CREATE TABLE IF NOT EXISTS 可安全重放） */
    private static final String[] DAILY_REPORT_TABLES = {
            "rdm_daily_report", "rdm_daily_report_config", "rdm_daily_report_template",
    };

    /**
     * v3.18：日报快照表的触发列改名（last_trigger_type/last_trigger_by → trigger_type/trigger_by）。
     * <p><b>为何需要这一版</b>：v3.16 首版建表用了 {@code last_trigger_*} 命名，而方案冻结的列名是
     * {@code trigger_type} / {@code trigger_by}。已跑过旧 v3.16 的库（共享开发库）列名与新定义不一致，
     * 不收敛就会出现「开发库与生产库 schema 分叉」——新库走 v3.16 建出新名、旧库停在旧名，
     * 同一份代码在两边读写不同列，这类分叉排查成本极高。
     * <p><b>用 CHANGE COLUMN 而不是 DROP+ADD</b>：迁移规范禁止生产环境 DROP COLUMN，
     * 且 CHANGE 保留列上已有数据（非破坏性）。本表是 v3.16 刚建的新表，改名不影响任何存量业务事实。
     * <p><b>条件执行</b>：仅当旧列存在时才 CHANGE，因此新库（直接建成新名）与已收敛的库重跑都安全。
     */
    private static final String VERSION_DAILY_REPORT_TRIGGER_COLUMNS = "rdm:schema:v3.18";
    /** {表, 旧列, 新列, 完整 CHANGE DDL}：CHANGE COLUMN 不可重放（旧列不存在即报错），先查再改 */
    private static final String[][] DAILY_REPORT_TRIGGER_RENAMES = {
            {"rdm_daily_report", "last_trigger_type", "trigger_type",
                    "ALTER TABLE rdm_daily_report CHANGE COLUMN last_trigger_type trigger_type VARCHAR(16) "
                            + "DEFAULT NULL COMMENT '最近一次触发方式: schedule/manual'"},
            {"rdm_daily_report", "last_trigger_by", "trigger_by",
                    "ALTER TABLE rdm_daily_report CHANGE COLUMN last_trigger_by trigger_by VARCHAR(64) "
                            + "DEFAULT NULL COMMENT '最近一次手动触发人姓名快照（定时为 NULL）'"},
    };

    /**
     * v3.19：日报改为「多规则 + 按项目/迭代范围」模型。
     *
     * <p><b>为何要改模型</b>：原设计是全局单条配置（每天两档、覆盖全部在途项目），但实际使用是
     * 「A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、W 項目經理盯整個 W 項目」——
     * 目标、时间、模板都按项目/迭代不同，单条配置无法表达。因此：
     * <ol>
     *   <li>新增 {@code rdm_daily_report_rule}：一条规则 = （项目 + 可选迭代 + 推送时间 + 内容档位 + 模板），
     *       可建多条；全局开关（总开关/群报/个人）仍留在原来的单行 config 表作总闸。</li>
     *   <li>快照表补 {@code scope_key} 并换唯一键：原来 {@code (report_date, report_type)} 全局唯一，
     *       多条规则同一天同一档会互相覆盖；改为 {@code (report_date, report_type, scope_key)}，
     *       规则推送用 {@code rule:{id}}、手动触发用 {@code manual:{projectId}:{iterationCode}}，
     *       于是「同一天多份不同范围的口径」各自一行、互不覆盖，幂等仍由唯一键兑底。</li>
     * </ol>
     *
     * <p><b>为何要 DROP 旧唯一索引</b>：旧键会挡住第二条规则的同一日期同一档写入（直接报
     * Duplicate entry），这是必须移除的硬阻碍，不是可选优化。该表建表至今无生产数据（功能尚未上线），
     * 换键不丢任何业务事实；DROP INDEX 只改元数据，不删行、不删列。
     */
    private static final String VERSION_DAILY_REPORT_RULES = "rdm:schema:v3.19";
    /** v3.19 新建规则表 */
    private static final String DAILY_REPORT_RULE_TABLE = "rdm_daily_report_rule";
    /** v3.19 快照表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] DAILY_REPORT_SCOPE_COLUMNS = {
            {"rdm_daily_report", "scope_key",
                    "ALTER TABLE rdm_daily_report ADD COLUMN scope_key VARCHAR(64) NOT NULL DEFAULT '' "
                            + "COMMENT '范围键：规则=rule:{id}，手动=manual:{projectId}:{iterationCode}；唯一键用它区分同日多份' "
                            + "AFTER trigger_by"},
            {"rdm_daily_report", "rule_id",
                    "ALTER TABLE rdm_daily_report ADD COLUMN rule_id BIGINT DEFAULT NULL "
                            + "COMMENT '推送规则ID（手动触发为 NULL）' AFTER scope_key"},
            {"rdm_daily_report", "project_id",
                    "ALTER TABLE rdm_daily_report ADD COLUMN project_id BIGINT DEFAULT NULL "
                            + "COMMENT '快照目标项目ID' AFTER rule_id"},
            {"rdm_daily_report", "iteration_code",
                    "ALTER TABLE rdm_daily_report ADD COLUMN iteration_code VARCHAR(32) DEFAULT NULL "
                            + "COMMENT '快照目标迭代编码（NULL=项目全部迭代）' AFTER project_id"},
    };
    /** 旧的全局唯一索引（会挡住同日多规则），需条件性移除 */
    private static final String DAILY_REPORT_OLD_UNIQUE = "uk_rdm_daily_report";
    /** 新的范围化唯一索引：同一天 + 同一档 + 同一范围只一行 */
    private static final String DAILY_REPORT_NEW_UNIQUE = "uk_rdm_daily_report_scope";

    /**
     * v3.20：日报规则表的 project_id 放宽为可空。
     * <p><b>为何需要这一版</b>：v3.19 把规则定义为「项目 + 可选迭代」，但迭代排期已允许
     * 紧急修复（hotfix）迭代不挂项目（v3.15）。用户在「進度日報 > 推送配置」选到这类迭代时，
     * 规则应能以迭代为唯一范围保存；project_id 仍 NOT NULL 会导致保存直接报错或被迫编个项目。
     * <p><b>只 MODIFY，不 DROP</b>：把 NOT NULL 改为 DEFAULT NULL，列上数据与索引
     * {@code idx_rdm_daily_report_rule_project} 全部保留；MODIFY 本身可重放，
     * 仍用 applyOnce + 后置 IS_NULLABLE 校验，缺一则不记版本、下次启动重试。
     */
    private static final String VERSION_DAILY_REPORT_RULE_PROJECT_NULLABLE = "rdm:schema:v3.20";
    private static final String DAILY_REPORT_RULE_PROJECT_MODIFY_DDL =
            "ALTER TABLE rdm_daily_report_rule MODIFY COLUMN project_id BIGINT DEFAULT NULL "
                    + "COMMENT '目标项目ID（来自项目总览）；NULL=规则只以未挂项目的迭代（紧急修复）为范围'";

    /**
     * v3.21：存量项目编号按「创建日补号」收敛为 {@code PROJ + YYYYMMDD + 2 位日序}。
     * <p><b>为何需要这一版</b>：v3.16 只把发号规则从 {@code PJ+YYYYMMDD+4 位} 改成
     * {@code PROJ+YYYYMMDD+2 位}（纯配置改动，发号代码零改动），但它只影响<b>之后新建</b>的项目；
     * 规则切换前已经建好的项目仍挂着旧前缀编号，于是同一个列表里新旧两套前缀并存。
     * <p><b>为什么可以改</b>：全库只有 {@code rdm_project.project_no} 存编号本身，其余业务表
     * （需求/迭代/交付项/成员/日报/发布批次）一律用 {@code project_id} 外键关联，改号不会断链；
     * 影响面仅限已人工复制的历史文本（如已发出的消息）。
     * <p><b>幂等</b>：只挑不符合 {@link #PROJECT_NO_COMPLIANT_REGEX} 的行，合规行不动，
     * 重放时候选集合为空即 no-op；补出来的号按创建日的「已用最大序号 + 1」递增，同时把
     * {@code sys_biz_seq} 当日水位推到同一位置，否则新建项目会从 01 重发、撞 project_no 唯一键。
     */
    private static final String VERSION_PROJECT_NO_REPAIR = "rdm:schema:v3.21";
    /** 合规编号：PROJ + 8 位日期 + ≥ 2 位序号（超 99 自然扩位，不截断） */
    private static final String PROJECT_NO_COMPLIANT_REGEX = "^PROJ[0-9]{8}[0-9]{2,}$";
    /** 项目编号规则 key（与 sys_biz_seq_rule.rule_key / BizSeqService 一致） */
    private static final String PROJECT_SEQ_RULE_KEY = "rdm_project";
    /** 规则前缀：与 v3.16 的目标形态一致，不是它说明 v3.16 未完成，不允许补号后仍为旧形态 */
    private static final String PROJECT_SEQ_PREFIX = "PROJ";

    /**
     * v3.22：日报看板开放链接与展示参数。
     *
     * <p><b>为何需要这一版</b>：推送链接从「站内页 + 登录」改为「免登看板」，需要两样东西：
     * 链接有效期（x 天内可看）与展示参数（需求明细/负责人/未挂项目迭代）。
     * 两者都是全局口径，放在日报配置单行上最自然，避免另建一张只有一行的配置表。
     *
     * <p><b>只加列，不改不删</b>：旧代码不认识新列也能正常运行；默认值取「30 天 + 全部展示」，
     * 与当前页面行为一致，升级瞬间不需要人工补数据。
     */
    private static final String VERSION_DAILY_REPORT_BOARD = "rdm:schema:v3.22";
    /** v3.22 配置表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] DAILY_REPORT_BOARD_COLUMNS = {
            {"rdm_daily_report_config", "board_link_valid_days",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN board_link_valid_days INT NOT NULL DEFAULT 30 "
                            + "COMMENT '看板开放链接有效期（天）' AFTER personal_template_key"},
            {"rdm_daily_report_config", "board_show_requirements",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_requirements TINYINT NOT NULL DEFAULT 1 "
                            + "COMMENT '看板是否展示需求明细 0/1' AFTER board_link_valid_days"},
            {"rdm_daily_report_config", "board_show_owners",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_owners TINYINT NOT NULL DEFAULT 1 "
                            + "COMMENT '看板是否展示负责人姓名 0/1' AFTER board_show_requirements"},
            {"rdm_daily_report_config", "board_show_unassigned",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_unassigned TINYINT NOT NULL DEFAULT 1 "
                            + "COMMENT '看板是否展示未挂项目的迭代 0/1' AFTER board_show_owners"},
    };

    /**
     * v3.23：钉钉消息改为固定框架 + 全局字段开关，预置模板转为自定义模板。
     *
     * <p><b>为何要改</b>：旧群报把「项目→迭代→全部需求行」一次性铺到群里，项目一多就是几十行，
     * 重点被淹没；而预置模板本身是可自由编辑的 Markdown，任何人都能把框架改乱，
     * 导致同一个日报在不同群里结构各异。本次把层级框架固定到代码里，可配的只有字段开关。
     *
     * <p><b>两步变更</b>：
     * <ol>
     *   <li>配置表加 {@code message_mode}（默认 fixed，升级后新推送即走精简框架）与
     *       {@code message_field_options}（JSON 字段开关）；</li>
     *   <li>旧 7 套预置模板的 {@code is_preset} 置 0，转为可自由编辑的自定义模板保留——
     *       不删行也不改文案，想回退到自定义模板模式只需把模式改回 template 并选中原模板。</li>
     * </ol>
     *
     * <p><b>为何不用 DROP</b>：只加列 + UPDATE，旧代码忽略新列，回滚只需把模式改回 template。
     */
    private static final String VERSION_DAILY_REPORT_MESSAGE_FRAMEWORK = "rdm:schema:v3.23";
    /** v3.23 配置表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] DAILY_REPORT_MESSAGE_COLUMNS = {
            {"rdm_daily_report_config", "message_mode",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN message_mode VARCHAR(16) NOT NULL DEFAULT 'fixed' "
                            + "COMMENT '钉钉消息模式: fixed=固定框架 / template=自定义模板' AFTER board_show_unassigned"},
            {"rdm_daily_report_config", "message_field_options",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN message_field_options VARCHAR(1000) DEFAULT NULL "
                            + "COMMENT '固定框架的字段开关（JSON，全局一套）' AFTER message_mode"},
    };
    /** 预置模板转自定义的 UPDATE（可重放：已经是 0 的行不受影响） */
    private static final String DAILY_REPORT_PRESET_TO_CUSTOM_SQL =
            "UPDATE rdm_daily_report_template SET is_preset = 0, updated_by = 'system', updated_at = NOW() "
                    + "WHERE is_preset = 1 AND deleted = 0";

    /**
     * v3.24：存量项目负责人回填到项目成员表。
     *
     * <p><b>为何需要这一版</b>：创建项目时旧代码只把 PM 写进 {@code rdm_project_member}，
     * 产品/技术/UI/测试/运维五类负责人只存主表；编辑项目更是从未同步成员表。
     * 结果是详情页「項目成員」为空（负责人明明已选）、负责人本人也进不了项目
     * （数据范围按成员表收敛）。本版把存量项目按负责人补齐，新写入由服务层同步。
     *
     * <p><b>只补不删</b>：不删任何成员行、不改其他角色；已离任（leave_time 非空）的同一行
     * 优先复活而不再插入 —— 唯一键 uk_project_user_role 不区分 leave_time，直接 insert 会撞键。
     * 重放时两者都是 no-op，可安全重跑。
     */
    private static final String VERSION_PROJECT_MEMBER_BACKFILL = "rdm:schema:v3.24";
    /**
     * v3.25：推送规则支持多项目范围（project_ids JSON），空数组 + project_id 为空 + 无迭代 = 全部在途项目。
     * <p>为什么单独加列而不拆关联表：规则只是「一条推送范围配置」，不需要按项目反查规则；
     * JSON 数组与 message_field_options 同模式，旧代码忽略即回退到 project_id 单项目口径。
     * <p>ADD COLUMN 不可重放，逐列先查再加 + 后置校验。
     */
    private static final String VERSION_DAILY_REPORT_RULE_PROJECT_IDS = "rdm:schema:v3.25";
    private static final String DAILY_REPORT_RULE_PROJECT_IDS_DDL =
            "ALTER TABLE rdm_daily_report_rule ADD COLUMN project_ids VARCHAR(1000) DEFAULT NULL "
                    + "COMMENT '多项目范围 JSON array；空=单项目/全部项目/仅迭代' AFTER project_id";

    /**
     * v3.26：个人日报收件人可配（角色白名单 + 追加/排除名单）。
     *
     * <p><b>为何要加</b>：v3.16 起个人通知的收件人被硬编码为「项目经理 + 产品负责人」，
     * 而实际使用需要「技术/测试/UI/运维负责人也收」「PMO 或部门负责人额外收」「某人不收」
     * 这些场景，没有配置入口只能改代码。本版把收件人从代码搬到配置表。
     *
     * <p><b>只加列，默认即现状</b>：{@code receiver_roles_json} 默认
     * {@code ["pm","product_owner"]}，与改造前的发送对象完全一致，升级当天行为不变；
     * 追加/排除名单默认 NULL（等价于空），不影响任何人。
     *
     * <p><b>与 receiver_scope 的关系</b>：v3.16 预留的 {@code receiver_scope}（接收范围）从未被
     * 发送链路消费，本版起停止读写、保留列不删（迁移规范禁止 DROP COLUMN）；收件范围由规则的
     * project_ids / iteration_code 表达，收件人由本版三列表达，不再有第三个“范围”概念。
     *
     * <p>ADD COLUMN 不可重放，逐列先查再加 + 后置校验。
     */
    private static final String VERSION_DAILY_REPORT_RECEIVERS = "rdm:schema:v3.26";
    /** v3.26 配置表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] DAILY_REPORT_RECEIVER_COLUMNS = {
            {"rdm_daily_report_config", "receiver_roles_json",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN receiver_roles_json VARCHAR(255) "
                            + "NOT NULL DEFAULT '[\"pm\",\"product_owner\"]' "
                            + "COMMENT '收件角色白名单(JSON数组)：pm/product_owner/tech_lead/qa_lead/ui_designer/ops_lead/project_member' "
                            + "AFTER personal_enabled"},
            {"rdm_daily_report_config", "extra_receiver_user_ids_json",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN extra_receiver_user_ids_json VARCHAR(2000) "
                            + "DEFAULT NULL COMMENT '追加收件人 sys_user.id(JSON数组)，收到规则范围全部项目汇总' "
                            + "AFTER receiver_roles_json"},
            {"rdm_daily_report_config", "exclude_receiver_user_ids_json",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN exclude_receiver_user_ids_json VARCHAR(2000) "
                            + "DEFAULT NULL COMMENT '排除收件人 sys_user.id(JSON数组)，优先级最高' "
                            + "AFTER extra_receiver_user_ids_json"},
    };
    /** {负责人列, 姓名列, 角色码}：六类负责人各自对应成员表一行（列名为白名单常量，非外部输入） */
    private static final String[][] PROJECT_OWNER_MEMBER_SLOTS = {
            {"pm_user_id", "pm_user_name", "pm"},
            {"product_owner_user_id", "product_owner_user_name", "product"},
            {"tech_lead_user_id", "tech_lead_user_name", "dev_lead"},
            {"ui_designer_user_id", "ui_designer_user_name", "designer"},
            {"qa_lead_user_id", "qa_lead_user_name", "qa"},
            {"ops_lead_user_id", "ops_lead_user_name", "ops"},
    };

    /**
     * v3.27：产品经理 PRD 任务 + 节点改名。
     *
     * <p><b>为何需要这一版</b>：接受需求时必须承诺出 PRD 日期，但承诺只存在
     * {@code rdm_requirement.promised_prd_date}；子任务页签与甘特图只读 {@code rdm_work_task}，
     * 于是「产品经理什么时候出 PRD」在任务视图里完全不可见，管理者无法据此催办。
     *
     * <p><b>本版做三件事</b>：① 注册内置任务类型 {@code prd}（PRD 產出）；
     * ② 状态「PRD設計中」改名「PRD 產出中」，避免与 UI 设计混淆；
     * ③ 为存量在途且已承诺 PRD 日期的需求补建 PRD 任务（编号 RTPRD+需求ID，一次性补建专用）。
     *
     * <p><b>幂等</b>：INSERT IGNORE + 条件 UPDATE + NOT EXISTS，可安全重放；无 DROP / 无删列。
     */
    private static final String VERSION_PRD_TASK = "rdm:schema:v3.27";
    private static final String PRD_TASK_SCRIPT = "280_rdm_prd_task.sql";

    /**
     * PRD 节点结果口径统一：編寫 → 產出。
     *
     * <p><b>为何单独一版</b>：v3.27 已在部分开发库执行过（当时叫「PRD 編寫」），
     * 修改已执行迁移的脚本不会重跑；用新版本键把存量状态标签、任务类型名、
     * 任务标题与 AI 术语统一到「PRD 產出」，避免新旧口径并存。
     *
     * <p><b>幂等</b>：只匹配旧默认值，管理员自定义的名称不被覆盖；可安全重放。
     */
    private static final String VERSION_PRD_OUTPUT_NAMING = "rdm:prd-output-naming:v1.0";

    /**
     * v3.28：钉钉日报消息卡片化。
     *
     * <p><b>为何要动投递队列表</b>：卡片消息（群机器人 actionCard / 工作通知 action_card）不是
     * 正文的子集——它需要<b>独立的消息类型</b>与<b>按钮文案 + 跳转地址</b>。旧表只有 title/content，
     * dispatcher 拿到一行正文无从判断该发 markdown 还是卡片；按钮信息若拼进正文，重试时还原不出、
     * 还会把按钮文字混进正文渲染。
     *
     * <p><b>为何默认 'markdown'</b>：存量待发行与其它业务事件（需求提醒、会议纪要等）走的都是
     * markdown 通道，默认值让它们的行为一字不变；只有日报在写任务时显式声明 action_card。
     *
     * <p><b>幂等</b>：ADD COLUMN 不可重放，逐列先查再加 + 后置校验；无 DROP。
     */
    private static final String VERSION_NOTIFY_CARD = "rdm:schema:v3.28";
    private static final String NOTIFY_CARD_SCRIPT = "281_rdm_daily_report_card.sql";
    /** v3.28 投递队列表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] NOTIFY_CARD_COLUMNS = {
            {"rdm_notify_log", "msg_type",
                    "ALTER TABLE rdm_notify_log ADD COLUMN msg_type VARCHAR(16) NOT NULL DEFAULT 'markdown' "
                            + "COMMENT '投递消息类型: markdown/action_card（卡片带一个跳转按钮）' AFTER content"},
            {"rdm_notify_log", "btn_title",
                    "ALTER TABLE rdm_notify_log ADD COLUMN btn_title VARCHAR(32) DEFAULT NULL "
                            + "COMMENT '卡片按钮文案（msg_type=action_card 时必填）' AFTER msg_type"},
            {"rdm_notify_log", "btn_url",
                    "ALTER TABLE rdm_notify_log ADD COLUMN btn_url VARCHAR(512) DEFAULT NULL "
                            + "COMMENT '卡片按钮跳转地址（msg_type=action_card 时必填）' AFTER btn_title"},
    };

    /**
     * v3.30：无异常日降噪策略。
     *
     * <p><b>为何要这一版</b>：日报每天都发，但大多数日子「无逾期、无到期」，正文只是把「全部正常」
     * 写成长摘要；久了读者会形成「日报不用看」的习惯，真正出事那天反而被忽略。
     * 降噪把「无异常日」压成一句结论（brief）或干脆不发（skip），异常日不变。
     *
     * <p><b>为何放在配置表而不是规则表</b>：降噪是全局阅读习惯问题（全公司统一口径），
     * 不是某个项目组的局部偏好；规则已经负责「发什么范围」，再叠加降噪策略会让
     * 「为什么这条规则没发」变得难以解释。
     *
     * <p>默认 {@code brief}：不会让人以为系统坏了（仍有一条），又比完整摘要安静。
     * 只 ADD COLUMN，旧代码忽略新列；回滚只需把值改回 {@code full}。
     */
    private static final String VERSION_QUIET_POLICY = "rdm:schema:v3.30";
    private static final String QUIET_POLICY_SCRIPT = "283_rdm_daily_report_quiet.sql";
    private static final String[][] QUIET_POLICY_COLUMNS = {
            {"rdm_daily_report_config", "quiet_policy",
                    "ALTER TABLE rdm_daily_report_config ADD COLUMN quiet_policy VARCHAR(16) NOT NULL DEFAULT 'brief' "
                            + "COMMENT '无异常日降噪策略: full=照常发摘要 / brief=只发一句结论 / skip=不发（仍落快照）' "
                            + "AFTER message_field_options"},
    };

    /**
     * v3.31：甘特图进度直改 + PRD 排期承诺同步的审计结构。
     *
     * <p><b>为何要这一版</b>：甘特图从「只改计划日期」扩到「直接改进度」后，
     * 进度是绩效与验收的原始事实，必须能追溯「谁在什么时候把哪条任务从多少改到多少」；
     * 同时 PRD 任务改完成日会同步需求的「承诺出 PRD 日期」，也要能看出这次改期
     * 顺带改了对外承诺。
     *
     * <p><b>幂等</b>：只 ADD COLUMN + CREATE TABLE IF NOT EXISTS；列先查 INFORMATION_SCHEMA。
     * 无 DROP / 无删列，旧代码忽略新列与新表。
     */
    private static final String VERSION_TASK_PROGRESS_AUDIT = "rdm:schema:v3.31";
    private static final String TASK_PROGRESS_AUDIT_SCRIPT = "284_rdm_task_progress_audit.sql";

    /**
     * v3.32：驳回后允许本单受理产品经理重新打开。
     *
     * <p><b>为何要这一版</b>：{@code rejected → intake_pending} 的 reopen 动作原先只允许
     * SUBMITTER / PMO / DISPATCHER。产品经理驳回后无法撤销自己的决定；把需求改派给新 PM 后，
     * 新 PM 虽然拿到了 PM 角色行，却仍看不到「重新打開」，只能查看不能推进。
     *
     * <p><b>权限边界</b>：allowed_roles 增加 PM 后，仍由 {@code RdmAccessGuard.activeRoles}
     * 按「本单 PM 角色行」收敛——只对本需求的受理 PM 生效，不是把所有驳回单开放给全体产品经理。
     *
     * <p><b>幂等</b>：只 UPDATE 未包含 PM 的那一行；用逗号包裹精确匹配，
     * 不能写 {@code LIKE '%PM%'}（PMO 含 PM 子串，会被误判为已包含）。
     */
    private static final String VERSION_REOPEN_PM = "rdm:schema:v3.32";

    /**
     * 存量導入需求回退能力：評審通過 → 評估中（{@code back_to_evaluate}）。
     *
     * <p><b>為何需要</b>：存量導入直接落已准入狀態，缺少「接受需求」的承諾日期與產品任務；
     * 批量補錄能補齊 108 條的歷史事實，但個別需求若確實要重走受理/PRD 流程，
     * 狀態機裡卻沒有回退邊（{@code review_passed} 只有 schedule 一條出邊）。
     *
     * <p><b>為何做成配置而不是代碼分支</b>：前端詳情頁按 {@code allowedActions} 渲染按鈕，
     * 新增一行 {from_status, action_code} 即可出現「退回評估」，不需要前端發版；
     * 寫側仍由 {@code transitionInternal} 校驗角色與必填，回退路徑不可被繞過。
     *
     * <p><b>冪等</b>：INSERT IGNORE + 唯一鍵 (from_status, action_code)，可安全重放；
     * 不覆蓋運營自定義的按鈕名/角色/排序。
     */
    private static final String VERSION_BACK_TO_EVALUATE = "rdm:transition:v1.1";
    private static final String ACTION_BACK_TO_EVALUATE = "back_to_evaluate";

    /**
     * 排期必填字段與代碼閘門對齊：{@code schedule.required_fields} 補上 project / iteration。
     *
     * <p><b>為何需要</b>：歸屬體系改造把「項目+迭代」做成了排期硬閘門
     * （{@code applyProjectAndIteration(required=true)}），但 204 種子裡
     * {@code schedule} 的 {@code required_fields} 仍是 {@code planDate}。
     * 詳情頁動作彈窗按服務端下發的 requiredFields 渲染字段，於是生產上
     * <b>排期彈窗裡根本沒有項目/迭代選擇器</b>，而後端閘門又要求兩者，
     * 用戶只能看到「提交排期必須選擇所屬項目與迭代」卻無處可選。
     *
     * <p><b>口徑</b>：只改仍為舊值 {@code planDate} 的行，不覆蓋管理員自定義；
     * 後置校驗只檢查「舊值殘留為 0」，不強制必須等於某個集合（允許運營調整）。
     */
    private static final String VERSION_SCHEDULE_REQUIRED_FIELDS = "rdm:transition:v1.2";
    private static final String SCHEDULE_REQUIRED_FIELDS = "planDate,project,iteration";

    /**
     * v3.33：个人日报正文去掉收件人姓名。
     *
     * <p><b>为何要这一版</b>：个人通知的收件人除「项目经理/产品负责人」外，还有推送规则里
     * 追加的部门负责人、PMO 等；追加收件人拿的是规则范围下的全量项目，并非其本人负责的项目。
     * 正文以「姓名，今日無異常」开头时，领导打开会误以为这些需求全归署名人，或怀疑系统把
     * 别人的日报发错了对象。<b>姓名只用于「发给谁」的路由，不应进入消息内容。</b>
     *
     * <p><b>为何要改库里的模板</b>：v3.16 播种的个人模板以 {@code {{userName}}，} 开头，
     * v3.23 起这些行已转为用户可编辑的自定义模板，<b>不会再随代码常量刷新</b>；只改常量
     * 只能影响全新库。渲染器虽已把该占位符恒替换为空串，但会留下「### 📌 ，您的產研交付日報」
     * 这样的孤立逗号，故这里连同占位符与紧随的逗号/冒号一起清掉。
     *
     * <p><b>幂等</b>：只 UPDATE 仍含该占位符的行，重放时候选集合为空即 no-op；无 DROP / 无删列。
     */
    private static final String VERSION_DAILY_REPORT_NO_NAME = "rdm:schema:v3.33";
    /** 清姓名占位符（连同其后的中英文逗号/冒号与空格），顺序：长串优先，最后才是裸占位符 */
    private static final String[][] DAILY_REPORT_NO_NAME_PATTERNS = {
            {"{{userName}}，", ""},
            {"{{userName}}：", ""},
            {"{{userName}}, ", ""},
            {"{{userName}},", ""},
            {"{{userName}}", ""},
    };

    /**
     * v3.29：存量需求导入（云效迁移）结构。
     *
     * <p><b>为何需要 external_no</b>：云效编号只用于回查原始需求，不能当正式需求号
     * （正式号 XQ 由 BizSeqService 发号、全局唯一且被前端按编号规则格式化）。外部编号单独成列，
     * 既能反查云效，又能作为导入幂等键：同一编号重复导入直接跳过，不会批量建出重复需求。
     *
     * <p><b>为何唯一键是 (external_source, external_no)</b>：将来若再接其他来源，
     * 不同来源的编号空间可能重叠；只用 external_no 建唯一键会误伤。
     *
     * <p><b>为何项目经理建在需求级</b>：需求可以只绑迭代不绑项目，此时项目级 PM 取不到人；
     * 需求级快照让「没绑项目的需求也有明确负责人」，绑项目时由导入逻辑继承项目 PM 兜底。
     *
     * <p><b>幂等</b>：ADD COLUMN / CREATE INDEX 都不可重放，逐列先查 INFORMATION_SCHEMA、
     * 索引先查 STATISTICS；无 DROP。
     */
    private static final String VERSION_REQUIREMENT_IMPORT = "rdm:schema:v3.29";
    private static final String REQUIREMENT_IMPORT_SCRIPT = "282_rdm_requirement_import.sql";
    private static final String REQUIREMENT_IMPORT_UNIQUE = "uk_rdm_req_external";
    /** v3.29 需求表补列 {表, 列, DDL}：ADD COLUMN 不可重放，先查再加 */
    private static final String[][] REQUIREMENT_IMPORT_COLUMNS = {
            {"rdm_requirement", "external_no",
                    "ALTER TABLE rdm_requirement ADD COLUMN external_no VARCHAR(64) DEFAULT NULL "
                            + "COMMENT '外部来源编号（云效工作项编号），仅记录用于回查' AFTER version_no"},
            {"rdm_requirement", "external_source",
                    "ALTER TABLE rdm_requirement ADD COLUMN external_source VARCHAR(32) DEFAULT NULL "
                            + "COMMENT '外部来源: YUNXIAO' AFTER external_no"},
            {"rdm_requirement", "project_manager_user_id",
                    "ALTER TABLE rdm_requirement ADD COLUMN project_manager_user_id BIGINT DEFAULT NULL "
                            + "COMMENT '项目经理ID（需求级，未绑项目时使用）' AFTER assignee_pm_name"},
            {"rdm_requirement", "project_manager_user_name",
                    "ALTER TABLE rdm_requirement ADD COLUMN project_manager_user_name VARCHAR(64) DEFAULT NULL "
                            + "COMMENT '项目经理姓名快照' AFTER project_manager_user_id"},
    };

    /**
     * v3.17：rdm_status_def.stage 由旧 6 段细化为 9 段，与前端 RDM_STATUS_STAGE 同源。
     * <p>详情页状态条与需求看板列已改 9 段，但本表仍是旧值，导致看板「各階段平均停留」
     * 按旧口径聚合、需求配置页显示旧阶段名 —— 同一需求两处说法分裂，本迁移收口。
     */
    private static final String VERSION_STATUS_STAGE_NINE = "rdm:schema:v3.17";
    /**
     * {状态码, 旧 stage, 新 stage}：与 src/constants/rdm.ts 的 RDM_STATUS_STAGE 一字对齐。
     * <p>UPDATE 按 code 定位并带旧值条件：既天然幂等（重跑不产生二次变更），
     * 也不覆盖管理员在「需求配置」页自定义过的阶段。
     */
    private static final String[][] STATUS_STAGE_UPDATES = {
            {"accepted", "product", "design"},
            {"prd_designing", "product", "design"},
            {"reviewing", "product", "review"},
            {"review_passed", "product", "review"},
            {"scheduled", "delivery", "dev"},
            {"designing", "delivery", "dev"},
            {"developing", "delivery", "dev"},
            {"integration", "delivery", "dev"},
            {"testing", "delivery", "test"},
            {"test_passed", "delivery", "test"},
            {"uat_pending", "acceptance", "uat"},
            {"uat_rejected", "acceptance", "uat"},
            {"released", "acceptance", "release"},
            {"verified", "acceptance", "release"},
            {"closed", "acceptance", "release"},
    };
    /** 9 段值域：后置校验用它判残留，与前端 RDM_STAGE 一字对齐 */
    private static final String[] STATUS_STAGE_VALUES = {
            "submit", "intake", "dispatch", "design", "review", "dev", "test", "uat", "release",
    };

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
        versionTracker.applyOnce(VERSION_TASK_PLAN, this::doTaskPlanMigrate, this::verifyTaskPlan);
        versionTracker.applyOnce(VERSION_RESOURCE_MEMBER, this::doResourceMemberMigrate, this::verifyResourceMember);
        versionTracker.applyOnce(VERSION_RESOURCE_PLAN, this::doResourcePlanMigrate, this::verifyResourcePlan);
        versionTracker.applyOnce(VERSION_EXEMPT_TRANSITION, this::doExemptTransitionSeed, this::verifyExemptTransitionSeed);
        versionTracker.applyOnce(VERSION_TASK_TYPE_DICT, this::doTaskTypeDictMigrate, this::verifyTaskTypeDict);
        versionTracker.applyOnce(VERSION_TASK_TYPE_SEEDS, this::doTaskTypeSeedsMigrate, this::verifyTaskTypeSeeds);
        versionTracker.applyOnce(VERSION_ACCEPTANCE_EVIDENCE, this::doAcceptanceEvidenceMigrate, this::verifyAcceptanceEvidence);
        versionTracker.applyOnce(VERSION_PROJECT_UPDATED_BY, this::doProjectUpdatedByMigrate, this::verifyProjectUpdatedBy);
        versionTracker.applyOnce(VERSION_ITERATION_PROJECT, this::doIterationProjectMigrate, this::verifyIterationProject);
        versionTracker.applyOnce(VERSION_DAILY_REPORT, this::doDailyReportMigrate, this::verifyDailyReport);
        versionTracker.applyOnce(VERSION_STATUS_STAGE_NINE, this::doStatusStageMigrate, this::verifyStatusStage);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_TRIGGER_COLUMNS,
                this::doDailyReportTriggerColumnsMigrate, this::verifyDailyReportTriggerColumns);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_RULES,
                this::doDailyReportRulesMigrate, this::verifyDailyReportRules);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_RULE_PROJECT_NULLABLE,
                this::doDailyReportRuleProjectNullableMigrate, this::verifyDailyReportRuleProjectNullable);
        // 必须排在 v3.16（规则改 PROJ）之后：补号依赖规则行已是 PROJ，否则无从对齐新形态
        versionTracker.applyOnce(VERSION_PROJECT_NO_REPAIR, this::doProjectNoRepair, this::verifyProjectNoRepair);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_BOARD,
                this::doDailyReportBoardMigrate, this::verifyDailyReportBoardMigrate);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_MESSAGE_FRAMEWORK,
                this::doDailyReportMessageFrameworkMigrate, this::verifyDailyReportMessageFramework);
        versionTracker.applyOnce(VERSION_PROJECT_MEMBER_BACKFILL,
                this::doProjectMemberBackfill, this::verifyProjectMemberBackfill);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_RULE_PROJECT_IDS,
                this::doDailyReportRuleProjectIdsMigrate, this::verifyDailyReportRuleProjectIds);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_RECEIVERS,
                this::doDailyReportReceiversMigrate, this::verifyDailyReportReceiversMigrate);
        versionTracker.applyOnce(VERSION_PRD_TASK, this::doPrdTaskMigrate, this::verifyPrdTaskMigrate);
        versionTracker.applyOnce(VERSION_NOTIFY_CARD, this::doNotifyCardMigrate, this::verifyNotifyCardMigrate);
        versionTracker.applyOnce(VERSION_REQUIREMENT_IMPORT,
                this::doRequirementImportMigrate, this::verifyRequirementImportMigrate);
        versionTracker.applyOnce(VERSION_QUIET_POLICY, this::doQuietPolicyMigrate, this::verifyQuietPolicyMigrate);
        versionTracker.applyOnce(VERSION_PRD_OUTPUT_NAMING,
                this::doPrdOutputNamingMigrate, this::verifyPrdOutputNamingMigrate);
        versionTracker.applyOnce(VERSION_TASK_PROGRESS_AUDIT,
                this::doTaskProgressAuditMigrate, this::verifyTaskProgressAuditMigrate);
        versionTracker.applyOnce(VERSION_REOPEN_PM, this::doReopenPmMigrate, this::verifyReopenPmMigrate);
        versionTracker.applyOnce(VERSION_DAILY_REPORT_NO_NAME,
                this::doDailyReportNoNameMigrate, this::verifyDailyReportNoNameMigrate);
        versionTracker.applyOnce(VERSION_BACK_TO_EVALUATE,
                this::doBackToEvaluateSeed, this::verifyBackToEvaluateSeed);
        versionTracker.applyOnce(VERSION_SCHEDULE_REQUIRED_FIELDS,
                this::doScheduleRequiredFieldsSeed, this::verifyScheduleRequiredFieldsSeed);
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

    /**
     * v3.8：补 plan_version 乐观锁列 + 建排期审计表。
     * <p>不吞异常：缺列会让调期更新报「未知列」，失败必须抛出并不记版本，下次启动重试。
     */
    private void doTaskPlanMigrate() {
        if (!columnExists("rdm_work_task", "plan_version")) {
            jdbcTemplate.execute("ALTER TABLE rdm_work_task ADD COLUMN plan_version INT NOT NULL DEFAULT 1 "
                    + "COMMENT '排期版本(乐观锁):计划起止/负责人变更自增' AFTER iteration_code");
            log.info("已添加 rdm_work_task.plan_version 列");
        }
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS rdm_task_plan_log ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                + "task_id BIGINT NOT NULL COMMENT '任务ID rdm_work_task.id', "
                + "task_no VARCHAR(32) DEFAULT NULL COMMENT '任务编号快照', "
                + "req_id BIGINT NOT NULL COMMENT '需求ID(冗余便于追溯)', "
                + "user_id BIGINT NOT NULL COMMENT '操作人 sys_user.id', "
                + "user_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照', "
                + "old_start_date DATE DEFAULT NULL COMMENT '原计划开始', "
                + "old_finish_date DATE DEFAULT NULL COMMENT '原计划完成', "
                + "new_start_date DATE DEFAULT NULL COMMENT '新计划开始', "
                + "new_finish_date DATE DEFAULT NULL COMMENT '新计划完成', "
                + "old_version INT DEFAULT NULL COMMENT '变更前版本', "
                + "new_version INT DEFAULT NULL COMMENT '变更后版本', "
                + "client_request_id VARCHAR(64) DEFAULT NULL COMMENT '幂等请求标识', "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间', "
                + "KEY idx_tpl_task (task_id), KEY idx_tpl_req (req_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM任务排期变更审计(只追加)'");
        log.info("RDM v3.8 调期迁移完成：plan_version 列与 rdm_task_plan_log 审计表就绪");
    }

    /** v3.8 后置校验：列与审计表齐备，缺任一项不记版本 */
    private void verifyTaskPlan() {
        if (!columnExists("rdm_work_task", "plan_version")) {
            throw new IllegalStateException("RDM v3.8 核验失败：rdm_work_task.plan_version 列缺失");
        }
        requireTables(new String[]{"rdm_task_plan_log"});
    }

    /**
     * v3.9：建资源名册表 rdm_resource_member（团队负载纳入人员）。
     * <p>只 ADD 新表、不改任何现有表，CREATE TABLE IF NOT EXISTS 可安全重放；
     * 不吞异常：建表失败必须抛出且不记版本，下次启动重试。
     */
    private void doResourceMemberMigrate() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS rdm_resource_member ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                + "user_id BIGINT NOT NULL COMMENT '员工 sys_user.id', "
                + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照', "
                + "user_name VARCHAR(64) DEFAULT NULL COMMENT '姓名快照', "
                + "dept VARCHAR(128) DEFAULT NULL COMMENT '部门快照', "
                + "role_codes VARCHAR(255) DEFAULT NULL COMMENT '岗位角色JSON数组:pm/product/dev/designer/qa/ops/pmo', "
                + "weekly_capacity_hours DECIMAL(5,2) DEFAULT NULL COMMENT '每周默认容量(人时);空则按工作日8h推算', "
                + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=纳入名册 0=移出', "
                + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '更新人', "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除(兜底;正常用status移出)', "
                + "UNIQUE KEY uk_rrm_user (user_id), KEY idx_rrm_status (status, deleted)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM资源名册(团队负载纳入人员)'");
        log.info("RDM v3.9 资源名册迁移完成：rdm_resource_member 表就绪");
    }

    /** v3.9 后置校验：名册表存在，缺则不记版本 */
    private void verifyResourceMember() {
        requireTables(new String[]{"rdm_resource_member"});
    }

    /**
     * v3.10：建个人工作计划表 rdm_resource_plan + 计划调整审计表 rdm_resource_plan_log（团队负载 B-2.5）。
     * <p>只 ADD 两张新表，不改任何现有表，CREATE TABLE IF NOT EXISTS 可安全重放；不吞异常：
     * 建表失败必须抛出且不记版本，下次启动重试。
     */
    private void doResourcePlanMigrate() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS rdm_resource_plan ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                + "user_id BIGINT NOT NULL COMMENT '承担人 sys_user.id', "
                + "source_type VARCHAR(16) NOT NULL COMMENT '来源:work_task/requirement/test_batch/project/coordination', "
                + "source_id BIGINT NOT NULL COMMENT '来源单据主键', "
                + "work_task_id BIGINT DEFAULT NULL COMMENT '来源为任务时的 rdm_work_task.id;UNIQUE 防重复计时', "
                + "role_code VARCHAR(16) DEFAULT NULL COMMENT '岗位/阶段', "
                + "plan_hours DECIMAL(7,2) DEFAULT NULL COMMENT '计划工时', "
                + "remaining_hours DECIMAL(7,2) DEFAULT NULL COMMENT '负责人确认的剩余工时', "
                + "plan_start_date DATE DEFAULT NULL COMMENT '计划开始', "
                + "plan_end_date DATE DEFAULT NULL COMMENT '计划完成', "
                + "status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/done/cancelled', "
                + "confirmed_by VARCHAR(64) DEFAULT NULL COMMENT '剩余工时确认人快照', "
                + "confirmed_at DATETIME DEFAULT NULL COMMENT '确认时间', "
                + "version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本', "
                + "created_by VARCHAR(64) DEFAULT NULL, updated_by VARCHAR(64) DEFAULT NULL, "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_rrp_work_task (work_task_id), "
                + "KEY idx_rrp_user_status (user_id, status, deleted), "
                + "KEY idx_rrp_source (source_type, source_id), "
                + "CONSTRAINT ck_rrp_plan_hours CHECK (plan_hours IS NULL OR plan_hours >= 0), "
                + "CONSTRAINT ck_rrp_remaining CHECK (remaining_hours IS NULL OR remaining_hours >= 0)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM个人工作计划'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS rdm_resource_plan_log ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                + "plan_id BIGINT DEFAULT NULL COMMENT '关联 rdm_resource_plan.id', "
                + "user_id BIGINT NOT NULL COMMENT '被计划承担人', "
                + "source_type VARCHAR(16) NOT NULL, source_id BIGINT NOT NULL, "
                + "action VARCHAR(32) NOT NULL COMMENT 'create/update/reassign/dispatch/cancel', "
                + "operator_id BIGINT NOT NULL, operator_name VARCHAR(64) DEFAULT NULL, "
                + "old_value VARCHAR(512) DEFAULT NULL, new_value VARCHAR(512) DEFAULT NULL, "
                + "reason VARCHAR(255) DEFAULT NULL, client_request_id VARCHAR(64) DEFAULT NULL, "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "KEY idx_rrpl_plan (plan_id), KEY idx_rrpl_source (source_type, source_id), "
                + "KEY idx_rrpl_created (created_at)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM个人计划调整/改派审计(只追加)'");
        log.info("RDM v3.10 计划层迁移完成：rdm_resource_plan / rdm_resource_plan_log 表就绪");
    }

    /** v3.10 后置校验：两张计划表存在，缺则不记版本 */
    private void verifyResourcePlan() {
        requireTables(new String[]{"rdm_resource_plan", "rdm_resource_plan_log"});
    }

    /**
     * v3.11：执行任务类型字典脚本（建表 + 六条内置种子）。
     * <p>脚本只含 CREATE TABLE IF NOT EXISTS 与 INSERT IGNORE，天然幂等；
     * 读取或执行失败一律抛出（不吞异常），applyOnce 不记版本、下次启动重试。
     */
    private void doTaskTypeDictMigrate() {
        int executed = executeScript(TASK_TYPE_DICT_SCRIPT);
        log.info("RDM v3.11 任务类型字典脚本已执行: {} 条语句（{}）", executed, TASK_TYPE_DICT_SCRIPT);
    }

    /** v3.11 后置校验：六条内置种子必须齐备，否则不记版本（下拉/聚合/校验兜底靠它们） */
    private void verifyTaskTypeDict() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_task_type_config WHERE deleted = 0 "
                        + "AND code IN ('design','frontend','app','backend','qa','data')", Integer.class);
        if (n == null || n < 6) {
            throw new IllegalStateException("RDM v3.11 核验失败：rdm_task_type_config 内置种子不足 6 条");
        }
    }

    /**
     * v3.12：执行任务类型内置扩充脚本（14 条 INSERT IGNORE + 六条 sort_order 重排）。
     * <p>脚本只含 INSERT IGNORE 与条件 UPDATE，可安全重放；失败一律抛出（不吞异常），
     * applyOnce 不记版本、下次启动重试。
     */
    private void doTaskTypeSeedsMigrate() {
        int executed = executeScript(TASK_TYPE_SEEDS_SCRIPT);
        log.info("RDM v3.12 任务类型内置扩充脚本已执行: {} 条语句（{}）", executed, TASK_TYPE_SEEDS_SCRIPT);
    }

    /** v3.12 后置校验：14 个内置类型逐个存在，且移动端细分确实已启用 */
    private void verifyTaskTypeSeeds() {
        requireAtLeast("RDM v3.12 任务类型内置扩充",
                MIN_TASK_TYPE_BUILTIN_SEEDS,
                "SELECT COUNT(*) FROM rdm_task_type_config WHERE deleted = 0 AND code IN ("
                        + "'android','ios','harmony','mini_program','h5','fullstack','ai_algo','devops',"
                        + "'sre','security','automation_qa','performance_qa','ux','visual')");
        requireAtLeast("RDM v3.12 移动端细分启用",
                5,
                "SELECT COUNT(*) FROM rdm_task_type_config WHERE deleted = 0 AND enabled = 1 AND code IN ("
                        + "'android','ios','harmony','mini_program','h5')");
    }

    /**
     * v3.13：验收用例证据附件列。
     * <p>不吞异常：缺列会让证据保存报「未知列」，失败必须抛出并不记版本，下次启动重试。
     */
    private void doAcceptanceEvidenceMigrate() {
        String table = ACCEPTANCE_EVIDENCE_COLUMN[0];
        String column = ACCEPTANCE_EVIDENCE_COLUMN[1];
        if (columnExists(table, column)) {
            return;
        }
        jdbcTemplate.execute(ACCEPTANCE_EVIDENCE_COLUMN[2]);
        log.info("已添加验收用例证据列: {}.{}", table, column);
    }

    /** v3.13 后置校验：证据列就绪，否则附件无处可存 */
    private void verifyAcceptanceEvidence() {
        if (!columnExists(ACCEPTANCE_EVIDENCE_COLUMN[0], ACCEPTANCE_EVIDENCE_COLUMN[1])) {
            throw new IllegalStateException("RDM v3.13 核验失败："
                    + ACCEPTANCE_EVIDENCE_COLUMN[0] + "." + ACCEPTANCE_EVIDENCE_COLUMN[1] + " 列缺失");
        }
    }

    /**
     * v3.14：项目主表「最后更新人」列。
     * <p>不吞异常：缺列会让 MyBatis-Plus 的显式列清单 SELECT 直接报错（项目列表整块挂掉），
     * 失败必须抛出并不记版本，下次启动重试。
     */
    private void doProjectUpdatedByMigrate() {
        String table = PROJECT_UPDATED_BY_COLUMN[0];
        String column = PROJECT_UPDATED_BY_COLUMN[1];
        if (columnExists(table, column)) {
            return;
        }
        jdbcTemplate.execute(PROJECT_UPDATED_BY_COLUMN[2]);
        log.info("已添加项目最后更新人列: {}.{}", table, column);
    }

    /** v3.14 后置校验：更新人列就绪，否则「谁改的」这个事实无法落库 */
    private void verifyProjectUpdatedBy() {
        if (!columnExists(PROJECT_UPDATED_BY_COLUMN[0], PROJECT_UPDATED_BY_COLUMN[1])) {
            throw new IllegalStateException("RDM v3.14 核验失败："
                    + PROJECT_UPDATED_BY_COLUMN[0] + "." + PROJECT_UPDATED_BY_COLUMN[1] + " 列缺失");
        }
    }

    /**
     * v3.15：迭代表「所属项目」列 + 项目维度索引。
     * <p>不吞异常：缺列会让 MyBatis-Plus 显式列清单 SELECT 直接报错（迭代列表整块挂掉），
     * 失败必须抛出并不记版本，下次启动重试。索引与列同批交付（项目维度统计的扫描路径）。
     */
    private void doIterationProjectMigrate() {
        String table = ITERATION_PROJECT_COLUMN[0];
        String column = ITERATION_PROJECT_COLUMN[1];
        if (!columnExists(table, column)) {
            jdbcTemplate.execute(ITERATION_PROJECT_COLUMN[2]);
            log.info("已添加迭代所属项目列: {}.{}", table, column);
        }
        if (!indexExists(table, ITERATION_PROJECT_INDEX)) {
            jdbcTemplate.execute("CREATE INDEX " + ITERATION_PROJECT_INDEX + " ON " + table + " (" + column + ")");
            log.info("已添加迭代项目维度索引: {}.{}", table, ITERATION_PROJECT_INDEX);
        }
    }

    /** v3.15 后置校验：列与索引就绪，否则按项目统计迭代/需求的链路断裂 */
    private void verifyIterationProject() {
        if (!columnExists(ITERATION_PROJECT_COLUMN[0], ITERATION_PROJECT_COLUMN[1])) {
            throw new IllegalStateException("RDM v3.15 核验失败："
                    + ITERATION_PROJECT_COLUMN[0] + "." + ITERATION_PROJECT_COLUMN[1] + " 列缺失");
        }
        if (!indexExists(ITERATION_PROJECT_COLUMN[0], ITERATION_PROJECT_INDEX)) {
            throw new IllegalStateException("RDM v3.15 核验失败："
                    + ITERATION_PROJECT_COLUMN[0] + " 索引 " + ITERATION_PROJECT_INDEX + " 缺失");
        }
    }

    /**
     * v3.16：日报三表 + 预置模板/配置种子 + 项目编号规则改 PROJ。
     * <p><b>不吞异常</b>：三表任一缺失都会让日报作业与配置页整块报错，失败必须抛出并不记版本，
     * 下次启动重试。CREATE TABLE IF NOT EXISTS 与 INSERT IGNORE 均可安全重放，因此本方法整体
     * 可重复执行；<b>种子用 INSERT IGNORE 而非 UPSERT</b>：同 key 已存在时不覆盖，否则管理员
     * 在配置页微调过的模板与改过的推送时间会在每次重启被默认值抹除。
     */
    private void doDailyReportMigrate() {
        createDailyReportTables();
        int templates = seedDailyReportTemplates();
        int configs = seedDailyReportConfig();
        int scenarios = seedDailyReportScenario();
        int rules = migrateProjectNoRuleToProj();
        log.info("RDM v3.16 日报迁移完成: 新增模板 {} 行、新增配置 {} 行、新增通知场景 {} 行、项目编号规则更新 {} 行",
                templates, configs, scenarios, rules);
    }

    /**
     * 登记日报工作通知场景行（{@code rdm_daily_report}）。
     * <p>沿用 {@code MeetingSchemaMigrationInitializer.syncNotificationScenarios} 的口径：
     * {@code app_id=NULL} 且 {@code enabled=0} 插入——<b>路由必须由人显式绑定</b>，不回填默认应用，
     * 也不因为发版重跑就把管理员已开启的场景关掉（INSERT IGNORE 已存在则不动）。
     * 未绑定时 {@code NotificationAppService.resolve} 返回 null，日报作业跳过个人通知，群报不受影响。
     */
    private int seedDailyReportScenario() {
        return jdbcTemplate.update(
                "INSERT IGNORE INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by) "
                        + "VALUES (?, NULL, 0, 'system')",
                com.mftb.admin.service.NotificationAppService.RDM_DAILY_REPORT);
    }

    /** 建日报三表（IF NOT EXISTS 可重放；失败上抛，由 applyOnce 不记版本） */
    private void createDailyReportTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS rdm_daily_report (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                    report_date DATE NOT NULL COMMENT '日报日期（快照口径日）',
                    report_type VARCHAR(16) NOT NULL COMMENT '档位: morning=晨报 / evening=晚报',
                    project_count INT NOT NULL DEFAULT 0 COMMENT '快照覆盖的在途项目数',
                    content_json MEDIUMTEXT COMMENT '快照JSON：项目→迭代→需求层级 + 项目级指标 + 汇总计数',
                    group_title VARCHAR(200) DEFAULT NULL COMMENT '群报标题快照（渲染后）',
                    group_content MEDIUMTEXT COMMENT '群报正文快照（渲染后 markdown，与实发内容一致）',
                    personal_count INT NOT NULL DEFAULT 0 COMMENT '个人工作通知接收人数（已绑定钉钉 userId 者）',
                    push_count INT NOT NULL DEFAULT 0 COMMENT '累计推送次数（含手动补发）',
                    trigger_type VARCHAR(16) DEFAULT NULL COMMENT '最近一次触发方式: schedule/manual',
                    trigger_by VARCHAR(64) DEFAULT NULL COMMENT '最近一次手动触发人姓名快照（定时为 NULL）',
                    last_push_at DATETIME DEFAULT NULL COMMENT '最近一次推送时间',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
                    UNIQUE KEY uk_rdm_daily_report (report_date, report_type),
                    KEY idx_rdm_daily_report_date (report_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM每日日报快照（每天每档一行，通知与详情页同源）'""");
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS rdm_daily_report_config (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                    config_slot VARCHAR(16) NOT NULL DEFAULT 'default' COMMENT '配置槽位（恒为 default，唯一键保证单行）',
                    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '日报总开关 0/1',
                    morning_time VARCHAR(5) NOT NULL DEFAULT '09:00' COMMENT '晨报推送时间 HH:mm',
                    evening_time VARCHAR(5) NOT NULL DEFAULT '18:00' COMMENT '晚报推送时间 HH:mm',
                    group_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '群报开关 0/1',
                    personal_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '个人工作通知开关 0/1',
                    receiver_scope VARCHAR(16) NOT NULL DEFAULT 'all_projects' COMMENT '接收范围: all_projects=全部在途项目 / risk_only=仅风险逾期项目',
                    morning_template_key VARCHAR(64) DEFAULT NULL COMMENT '晨报选用模板键（空=用该档默认模板）',
                    evening_template_key VARCHAR(64) DEFAULT NULL COMMENT '晚报选用模板键（空=用该档默认模板）',
                    personal_template_key VARCHAR(64) DEFAULT NULL COMMENT '个人通知选用模板键（空=用默认模板）',
                    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人姓名快照',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
                    UNIQUE KEY uk_rdm_daily_report_config (config_slot)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送配置（单行：时间/开关/接收范围/选用模板）'""");
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS rdm_daily_report_template (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                    template_key VARCHAR(64) NOT NULL COMMENT '模板键（唯一，配置表按此引用）',
                    name VARCHAR(100) NOT NULL COMMENT '模板名称',
                    channel VARCHAR(16) NOT NULL COMMENT '投放通道: group=钉钉群 / personal=工作通知',
                    report_type VARCHAR(16) NOT NULL DEFAULT 'morning' COMMENT '适用档位: morning/evening/any',
                    title_tpl VARCHAR(200) NOT NULL COMMENT '标题模板（含占位符）',
                    content_tpl TEXT NOT NULL COMMENT '正文模板（markdown + 占位符，只做字符串替换不 eval）',
                    is_preset TINYINT NOT NULL DEFAULT 0 COMMENT '是否预置模板 0/1（预置不可删）',
                    is_default TINYINT NOT NULL DEFAULT 0 COMMENT '是否该 channel+report_type 的默认模板 0/1',
                    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用 0/1',
                    remark VARCHAR(500) DEFAULT NULL COMMENT '说明',
                    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
                    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
                    UNIQUE KEY uk_rdm_daily_report_template (template_key),
                    KEY idx_rdm_daily_report_template_use (channel, report_type, enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送模板（预置7套，用户可微调另存）'""");
    }

    /**
     * 写入预置模板种子（定义读 {@link RdmDailyReportTemplates#PRESETS}，不在这里重写文案）。
     * <p>INSERT IGNORE：同 key 已存在则跳过，<b>不覆盖管理员在配置页微调过的文案</b>。
     *
     * @return 本次新增行数
     */
    private int seedDailyReportTemplates() {
        String sql = "INSERT IGNORE INTO rdm_daily_report_template "
                + "(template_key, name, channel, report_type, title_tpl, content_tpl, "
                + " is_preset, is_default, enabled, remark, created_by, updated_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 'system', 'system')";
        int inserted = 0;
        for (RdmDailyReportTemplates.Preset p : RdmDailyReportTemplates.PRESETS) {
            inserted += jdbcTemplate.update(sql, p.key(), p.name(), p.channel(), p.reportType(),
                    p.titleTpl(), p.contentTpl(), p.isDefault() ? 1 : 0, p.remark());
        }
        return inserted;
    }

    /**
     * 写入默认推送配置（单行，config_slot='default'）。
     * <p>INSERT IGNORE：已存在则跳过，<b>不把管理员改过的推送时间/开关/选用模板重置回默认</b>。
     */
    private int seedDailyReportConfig() {
        return jdbcTemplate.update(
                "INSERT IGNORE INTO rdm_daily_report_config "
                        + "(config_slot, enabled, morning_time, evening_time, group_enabled, personal_enabled, "
                        + " receiver_scope, morning_template_key, evening_template_key, personal_template_key, updated_by) "
                        + "VALUES ('default', 1, '09:00', '18:00', 1, 1, 'all_projects', ?, ?, ?, 'system')",
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_GROUP,
                        RdmDailyReportTemplates.TYPE_MORNING),
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_GROUP,
                        RdmDailyReportTemplates.TYPE_EVENING),
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_PERSONAL,
                        RdmDailyReportTemplates.TYPE_ANY));
    }

    /**
     * 项目编号规则改 PROJ + YYYYMMDD + 2 位日流水（如 PROJ2026101901）。
     * <p>幂等 UPDATE，重复执行结果一致。发号代码零改动：{@code RdmProjectService} 仍调
     * {@code bizSeqService.next("rdm_project")}，{@code BizSeqService} 按 (prefix, 日期段) 行锁自增、
     * 每日从 seq_start 重置，改 prefix 后当日流水自然从 01 起。
     * <p><b>存量编号不动</b>：本方法只改规则行，不触碰 {@code rdm_project.project_no} 历史值。
     * <p>规则行即「平台支撐系統 &gt; 規則配置 &gt; 編號生成規則」菜单的数据源，改完即在该页可见可追溯。
     *
     * @return 受影响行数（0 表示规则行不存在，由后置校验拦下）
     */
    private int migrateProjectNoRuleToProj() {
        return jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET prefix = 'PROJ', seq_length = 2, seq_start = 1, "
                        + "rule_name = '項目編號', biz_menu = '產研交付', status = 1, remark = ?, updated_at = NOW() "
                        + "WHERE rule_key = 'rdm_project'",
                "{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，"
                        + "不截斷、不循環複用（如 PROJ2026101901）。生成時機：新建項目時由系統發號，"
                        + "前端不收手工輸入。存量 PJ 開頭的歷史項目編號為既成事實，保持不變、不改寫。");
    }

    /**
     * v3.16 后置校验：三表就绪 + 预置模板齐备 + 配置单行存在 + 编号规则已改 PROJ。
     * <p>为什么把种子当硬条件：模板与配置缺失时日报作业会渲染出空文案或直接报错，
     * 不校验等于把「只在代码里存在的路径」记成迁移成功，到生产上才暴露。
     */
    private void verifyDailyReport() {
        requireTables(DAILY_REPORT_TABLES);
        requireAtLeast("RDM v3.16 预置日报模板", RdmDailyReportTemplates.PRESETS.size(),
                "SELECT COUNT(*) FROM rdm_daily_report_template WHERE is_preset = 1 AND deleted = 0");
        requireAtLeast("RDM v3.16 日报推送配置", 1,
                "SELECT COUNT(*) FROM rdm_daily_report_config WHERE config_slot = 'default' AND deleted = 0");
        requireAtLeast("RDM v3.16 日报工作通知场景", 1,
                "SELECT COUNT(*) FROM sys_notification_scenario WHERE scenario_key = 'rdm_daily_report'");
        String prefix = jdbcTemplate.queryForObject(
                "SELECT prefix FROM sys_biz_seq_rule WHERE rule_key = 'rdm_project'", String.class);
        if (!"PROJ".equals(prefix)) {
            throw new IllegalStateException("RDM v3.16 核验失败：项目编号规则 prefix 未改为 PROJ，实际: " + prefix);
        }
    }

    /**
     * v3.18：将已跑过旧 v3.16 的库上的 {@code last_trigger_*} 列改名为 {@code trigger_*}。
     * <p><b>不吞异常</b>：改名失败会让服务层读写不存在的列（Unknown column），整块日报链路挂掉，
     * 因此必须抛出并不记版本，下次启动重试。旧列不存在时跳过（新库直接建的就是新名），
     * 因此本方法可安全重放。
     */
    private void doDailyReportTriggerColumnsMigrate() {
        for (String[] rename : DAILY_REPORT_TRIGGER_RENAMES) {
            String table = rename[0];
            String oldColumn = rename[1];
            String newColumn = rename[2];
            if (columnExists(table, newColumn)) {
                continue;
            }
            if (!columnExists(table, oldColumn)) {
                // 新旧列都不存在：说明表本身不完整，交由后置校验报错，不在这里吞掉
                continue;
            }
            jdbcTemplate.execute(rename[3]);
            log.info("RDM v3.18 日报快照表列改名: {}.{} -> {}", table, oldColumn, newColumn);
        }
    }

    /** v3.18 后置校验：新列名必须就绪且旧列名已消失（否则两边分叉未收敛） */
    private void verifyDailyReportTriggerColumns() {
        for (String[] rename : DAILY_REPORT_TRIGGER_RENAMES) {
            String table = rename[0];
            if (!columnExists(table, rename[2])) {
                throw new IllegalStateException("RDM v3.18 核验失败：" + table + "." + rename[2] + " 列缺失");
            }
            if (columnExists(table, rename[1])) {
                throw new IllegalStateException("RDM v3.18 核验失败：" + table + "." + rename[1]
                        + " 旧列仍存在，开发库与生产库 schema 会分叉");
            }
        }
    }

    /**
     * v3.19：建规则表 + 快照表补范围列 + 换唯一键。
     * <p><b>不吞异常</b>：规则表缺失或唯一键没换成，会让第二条规则推送直接报 Duplicate entry，
     * 多规则模型整个不可用；失败必须抛出并不记版本，下次启动重试。
     */
    private void doDailyReportRulesMigrate() {
        // 1) 规则表（CREATE TABLE IF NOT EXISTS 可重放）
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS rdm_daily_report_rule (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                    name VARCHAR(100) NOT NULL COMMENT '规则名称（如「A產品-B1迭代日報」）',
                    project_id BIGINT NOT NULL COMMENT '目标项目ID（来自项目总览）',
                    iteration_code VARCHAR(32) DEFAULT NULL COMMENT '目标迭代编码；NULL=该项目全部迭代',
                    push_time VARCHAR(5) NOT NULL COMMENT '推送时间 HH:mm',
                    content_type VARCHAR(16) NOT NULL DEFAULT 'morning' COMMENT '内容档位: morning=今日焦点 / evening=当日复盘',
                    group_template_key VARCHAR(64) DEFAULT NULL COMMENT '群报模板键（空=按档位默认模板）',
                    personal_template_key VARCHAR(64) DEFAULT NULL COMMENT '个人通知模板键（空=按档位默认模板）',
                    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用 0/1',
                    remark VARCHAR(500) DEFAULT NULL COMMENT '说明',
                    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
                    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
                    KEY idx_rdm_daily_report_rule_project (project_id, deleted),
                    KEY idx_rdm_daily_report_rule_time (enabled, push_time, deleted)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                  COMMENT='RDM进度日报推送规则（一条规则=项目+可选迭代+时间+档位+模板，可建多条）'""");

        // 2) 快照表补范围列（逐列先查再加，ADD COLUMN 不可重放）
        for (String[] col : DAILY_REPORT_SCOPE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                jdbcTemplate.execute(col[2]);
                log.info("RDM v3.19 快照表补列: {}.{}", col[0], col[1]);
            }
        }

        // 3) 存量行回填 scope_key：空值的旧行按 id 各自成键，否则新唯一键会把它们判成重复
        int backfilled = jdbcTemplate.update(
                "UPDATE rdm_daily_report SET scope_key = CONCAT('legacy:', id) WHERE scope_key = '' OR scope_key IS NULL");
        if (backfilled > 0) {
            log.info("RDM v3.19 存量快照回填 scope_key: {} 行", backfilled);
        }

        // 4) 换唯一键：旧键（report_date, report_type）会挡住同日第二条规则，必须移除
        if (indexExists("rdm_daily_report", DAILY_REPORT_OLD_UNIQUE)) {
            jdbcTemplate.execute("ALTER TABLE rdm_daily_report DROP INDEX " + DAILY_REPORT_OLD_UNIQUE);
            log.info("RDM v3.19 已移除旧全局唯一索引 {}", DAILY_REPORT_OLD_UNIQUE);
        }
        if (!indexExists("rdm_daily_report", DAILY_REPORT_NEW_UNIQUE)) {
            jdbcTemplate.execute("ALTER TABLE rdm_daily_report ADD UNIQUE KEY " + DAILY_REPORT_NEW_UNIQUE
                    + " (report_date, report_type, scope_key)");
            log.info("RDM v3.19 已建立范围化唯一索引 {}（report_date, report_type, scope_key）", DAILY_REPORT_NEW_UNIQUE);
        }
    }

    /**
     * v3.20：规则表 project_id 放宽为可空。
     * <p>MODIFY COLUMN 本身可重放（已是可空时再执行也不改变结果），但仍由 applyOnce 门控；
     * 失败必须抛出并不记版本，否则选到未挂项目迭代时保存会一直报 1048（Column cannot be null）。
     */
    private void doDailyReportRuleProjectNullableMigrate() {
        if (!columnExists(DAILY_REPORT_RULE_TABLE, "project_id")) {
            throw new IllegalStateException("RDM v3.20 核验失败：" + DAILY_REPORT_RULE_TABLE + ".project_id 列缺失");
        }
        jdbcTemplate.execute(DAILY_REPORT_RULE_PROJECT_MODIFY_DDL);
        log.info("RDM v3.20 已放宽 {}.project_id 为可空（支持未挂项目的迭代规则）", DAILY_REPORT_RULE_TABLE);
    }
    
    /** v3.20 后置校验：列必须可空，否则未挂项目迭代的规则仍存不进去 */
    private void verifyDailyReportRuleProjectNullable() {
        requireTables(new String[]{DAILY_REPORT_RULE_TABLE});
        if (!columnNullable(DAILY_REPORT_RULE_TABLE, "project_id")) {
            throw new IllegalStateException("RDM v3.20 核验失败：" + DAILY_REPORT_RULE_TABLE
                    + ".project_id 仍为 NOT NULL，未挂项目的迭代规则无法保存");
        }
    }

    /**
     * v3.22：日报配置表补「看板链接有效期 + 展示参数」四列。
     * <p>逐列先查再加，ADD COLUMN 不可重放；任何一列补失败都上抛、不记版本，下次启动重试。
     */
    private void doDailyReportBoardMigrate() {
        for (String[] col : DAILY_REPORT_BOARD_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                jdbcTemplate.execute(col[2]);
                log.info("RDM v3.22 日报配置补列: {}.{}", col[0], col[1]);
            }
        }
    }

    /** v3.22 后置校验：四列必须全部就绪，否则看板链接签发/展示参数会静默失效 */
    private void verifyDailyReportBoardMigrate() {
        requireTables(new String[]{"rdm_daily_report_config"});
        for (String[] col : DAILY_REPORT_BOARD_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("RDM v3.22 核验失败：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    /**
     * v3.23：消息模式与字段开关补列，并把旧预置模板转为自定义模板。
     * <p>不吞异常：列缺失会让推送读写报错，预置标记没转成则模板页仍显示“预置不可改”。
     */
    private void doDailyReportMessageFrameworkMigrate() {
        for (String[] col : DAILY_REPORT_MESSAGE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                jdbcTemplate.execute(col[2]);
                log.info("RDM v3.23 日报配置补列: {}.{}", col[0], col[1]);
            }
        }
        int converted = jdbcTemplate.update(DAILY_REPORT_PRESET_TO_CUSTOM_SQL);
        log.info("RDM v3.23 预置模板转自定义: {} 行", converted);
    }

    /** v3.23 后置校验：两列就绪且不再有预置行（否则模板页仍会挡住编辑） */
    private void verifyDailyReportMessageFramework() {
        requireTables(new String[]{"rdm_daily_report_config", "rdm_daily_report_template"});
        for (String[] col : DAILY_REPORT_MESSAGE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("RDM v3.23 核验失败：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
        Integer presets = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_daily_report_template WHERE is_preset = 1 AND deleted = 0", Integer.class);
        if (presets != null && presets > 0) {
            throw new IllegalStateException("RDM v3.23 核验失败：仍有 " + presets + " 行预置模板未转为自定义模板");
        }
    }

    /**
     * v3.24：存量项目按六类负责人回填成员表。
     * <p>不吞异常：表缺失、SQL 失败一律抛出，不记版本、下次启动重试；
     * 静默跑完会让详情页成员继续为空且无人察觉。
     */
    private void doProjectMemberBackfill() {
        int revived = 0;
        int inserted = 0;
        for (String[] slot : PROJECT_OWNER_MEMBER_SLOTS) {
            String userCol = slot[0];
            String nameCol = slot[1];
            String role = slot[2];
            // 先复活：离任过的负责人行仍占着 uk_project_user_role，直接插入会撞唯一键
            revived += jdbcTemplate.update(
                    "UPDATE rdm_project_member m JOIN rdm_project p ON p.id = m.project_id "
                            + "SET m.leave_time = NULL, m.join_time = NOW(), "
                            + "m.user_name = COALESCE(p." + nameCol + ", m.user_name) "
                            + "WHERE m.role_code = ? AND m.leave_time IS NOT NULL "
                            + "AND m.user_id = p." + userCol,
                    role);
            inserted += jdbcTemplate.update(
                    "INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time) "
                            + "SELECT p.id, p." + userCol + ", p." + nameCol + ", ?, NOW() FROM rdm_project p "
                            + "WHERE p." + userCol + " IS NOT NULL "
                            + "AND NOT EXISTS (SELECT 1 FROM rdm_project_member m "
                            + "WHERE m.project_id = p.id AND m.user_id = p." + userCol + " AND m.role_code = ?)",
                    role, role);
        }
        log.info("RDM v3.24 项目负责人回填成员表: 复活 {} 行、新增 {} 行", revived, inserted);
    }

    /** v3.24 后置校验：每个有负责人的项目，六类负责人均存在对应的活跃成员行 */
    private void verifyProjectMemberBackfill() {
        requireTables(new String[]{"rdm_project", "rdm_project_member"});
        for (String[] slot : PROJECT_OWNER_MEMBER_SLOTS) {
            Integer missing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM rdm_project p WHERE p." + slot[0] + " IS NOT NULL "
                            + "AND NOT EXISTS (SELECT 1 FROM rdm_project_member m WHERE m.project_id = p.id "
                            + "AND m.user_id = p." + slot[0] + " AND m.role_code = ? AND m.leave_time IS NULL)",
                    Integer.class, slot[2]);
            if (missing != null && missing > 0) {
                throw new IllegalStateException("RDM v3.24 核验失败：" + slot[2] + " 负责人仍有 "
                        + missing + " 个项目缺成员行");
            }
        }
    }

    /** v3.25：推送规则多项目范围列（逐列先查再加） */
    private void doDailyReportRuleProjectIdsMigrate() {
        if (!columnExists("rdm_daily_report_rule", "project_ids")) {
            jdbcTemplate.execute(DAILY_REPORT_RULE_PROJECT_IDS_DDL);
            log.info("已添加 rdm_daily_report_rule.project_ids 列");
        }
    }

    /** v3.25 后置校验：多项目规则写入与读取都依赖该列 */
    private void verifyDailyReportRuleProjectIds() {
        if (!columnExists("rdm_daily_report_rule", "project_ids")) {
            throw new IllegalStateException("RDM v3.25 核验失败：rdm_daily_report_rule.project_ids 列缺失");
        }
    }

    /** v3.26：个人日报收件人三列（逐列先查再加） */
    private void doDailyReportReceiversMigrate() {
        for (String[] column : DAILY_REPORT_RECEIVER_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                jdbcTemplate.execute(column[2]);
                log.info("已添加 {}.{} 列", column[0], column[1]);
            }
        }
    }

    /** v3.26 后置校验：收件人解析要读这三列，缺一列个人通知就会退化成空收件人 */
    private void verifyDailyReportReceiversMigrate() {
        for (String[] column : DAILY_REPORT_RECEIVER_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                throw new IllegalStateException("RDM v3.26 核验失败：" + column[0] + "." + column[1] + " 列缺失");
            }
        }
    }

    /** v3.27：注册 prd 任务类型、改节点名、补建存量 PRD 任务（脚本内部幂等） */
    private void doPrdTaskMigrate() {
        int executed = executeScript(PRD_TASK_SCRIPT);
        log.info("RDM v3.27 PRD 任务迁移已执行: {} 条语句（{}）", executed, PRD_TASK_SCRIPT);
        renameAiGlossaryTerm();
    }

    /**
     * 同步 AI 术语表中的旧节点名。
     * <p>AI 术语初始化器可能晚于本迁移运行，且 INSERT IGNORE 不会改旧行；
     * 这里先探测表存在再定向改名，目标名已存在时跳过（避免撞唯一键）。
     */
    private void renameAiGlossaryTerm() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_glossary'",
                Integer.class);
        if (exists == null || exists == 0) {
            return;
        }
        int updated = jdbcTemplate.update(
                "UPDATE ai_glossary SET term = 'PRD 產出中' WHERE domain = 'rdm' "
                        + "AND term IN ('PRD設計中', 'PRD 編寫中') "
                        + "AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM ai_glossary "
                        + "WHERE domain = 'rdm' AND term = 'PRD 產出中') existing)");
        if (updated > 0) {
            log.info("RDM v3.27 AI 術語已同步改名: {} 條", updated);
            return;
        }
        // AI 初始化器可能已先插入新术语（两个术语并存）：把旧术语停用，避免 AI 检索到两套口径
        int deactivated = jdbcTemplate.update(
                "UPDATE ai_glossary SET status = 'inactive' WHERE domain = 'rdm' "
                        + "AND term IN ('PRD設計中', 'PRD 編寫中') AND status = 'active' "
                        + "AND EXISTS (SELECT 1 FROM (SELECT id FROM ai_glossary "
                        + "WHERE domain = 'rdm' AND term = 'PRD 產出中') existing)");
        if (deactivated > 0) {
            log.info("RDM v3.27 AI 舊術語已停用: {} 條", deactivated);
        }
    }

    /**
     * v3.27 后置校验：类型行必须存在且启用；状态标签已改；在途已承诺需求不得再有缺失的 PRD 任务。
     * <p>不校验等于把「脚本没执行成功」记成迁移成功，上线后任务视图仍然看不到产品进度。
     */
    private void verifyPrdTaskMigrate() {
        Integer typeReady = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_task_type_config WHERE code = 'prd' AND enabled = 1 AND deleted = 0",
                Integer.class);
        if (typeReady == null || typeReady == 0) {
            throw new IllegalStateException("RDM v3.27 核验失败：任务类型 prd 未注册或未启用");
        }
        Integer missing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_requirement r WHERE r.deleted = 0 "
                        + "AND r.promised_prd_date IS NOT NULL AND r.assignee_pm_user_id IS NOT NULL "
                        + "AND r.status NOT IN ('released', 'verified', 'closed') "
                        + "AND NOT EXISTS (SELECT 1 FROM rdm_work_task t WHERE t.req_id = r.id "
                        + "AND t.task_type = 'prd' AND t.deleted = 0)",
                Integer.class);
        if (missing != null && missing > 0) {
            throw new IllegalStateException("RDM v3.27 核验失败：仍有 " + missing + " 条在途需求缺少 PRD 任务");
        }
    }

    /**
     * PRD 结果口径归一：把 v3.27 可能已写入的「PRD 編寫」统一到「PRD 產出」。
     * <p>只匹配旧默认值，管理员自定义名称不被覆盖；任务标题/说明也只改旧文案。
     */
    private void doPrdOutputNamingMigrate() {
        int status = jdbcTemplate.update(
                "UPDATE rdm_status_def SET label = 'PRD 產出中' WHERE code = 'prd_designing' "
                        + "AND label IN ('PRD設計中', 'PRD 設計中', 'PRD 編寫中')");
        int type = jdbcTemplate.update(
                "UPDATE rdm_task_type_config SET label = 'PRD 產出' WHERE code = 'prd' AND label = 'PRD 編寫'");
        int task = jdbcTemplate.update(
                "UPDATE rdm_work_task SET title = '產出 PRD 並提交評審', "
                        + "content = REPLACE(content, '編寫 PRD', '產出 PRD') "
                        + "WHERE task_type = 'prd' AND deleted = 0 "
                        + "AND (title = '編寫 PRD 並提交評審' OR content LIKE '%編寫 PRD%')");
        log.info("RDM PRD 结果口径归一: 状态 {} 条、任务类型 {} 条、任务 {} 条", status, type, task);
        renameAiGlossaryTerm();
    }

    /** 后置校验：旧默认文案不得残留（自定义名称不在此列） */
    private void verifyPrdOutputNamingMigrate() {
        Integer oldStatus = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_status_def WHERE code = 'prd_designing' "
                        + "AND label IN ('PRD設計中', 'PRD 設計中', 'PRD 編寫中')", Integer.class);
        if (oldStatus != null && oldStatus > 0) {
            throw new IllegalStateException("RDM PRD 结果口径未归一：状态标签仍为旧值");
        }
        Integer oldTask = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_work_task WHERE task_type = 'prd' AND deleted = 0 "
                        + "AND title = '編寫 PRD 並提交評審'", Integer.class);
        if (oldTask != null && oldTask > 0) {
            throw new IllegalStateException("RDM PRD 结果口径未归一：仍有 " + oldTask + " 条任务使用旧标题");
        }
    }

    /**
     * v3.31：排期审计补「变更说明」列 + 新建进度变更审计表。
     * <p>不吞异常：缺列/缺表必须抛出且不记版本，下次启动重试。
     */
    private void doTaskProgressAuditMigrate() {
        if (!columnExists("rdm_task_plan_log", "remark")) {
            jdbcTemplate.execute("ALTER TABLE rdm_task_plan_log ADD COLUMN remark VARCHAR(255) DEFAULT NULL "
                    + "COMMENT '变更说明(如:同步需求承诺出PRD日期)' AFTER client_request_id");
            log.info("已添加 rdm_task_plan_log.remark 列");
        }
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS rdm_task_progress_log ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                + "task_id BIGINT NOT NULL COMMENT '任务ID rdm_work_task.id', "
                + "task_no VARCHAR(32) DEFAULT NULL COMMENT '任务编号快照', "
                + "req_id BIGINT NOT NULL COMMENT '需求ID(冗余便于追溯)', "
                + "user_id BIGINT NOT NULL COMMENT '操作人 sys_user.id', "
                + "user_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照', "
                + "old_progress INT DEFAULT NULL COMMENT '变更前进度', "
                + "new_progress INT DEFAULT NULL COMMENT '变更后进度', "
                + "old_status VARCHAR(32) DEFAULT NULL COMMENT '变更前状态', "
                + "new_status VARCHAR(32) DEFAULT NULL COMMENT '变更后状态', "
                + "remark VARCHAR(1000) DEFAULT NULL COMMENT '说明/完成交付说明', "
                + "client_request_id VARCHAR(64) DEFAULT NULL COMMENT '客户端请求标识', "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间', "
                + "KEY idx_tplg_task (task_id), KEY idx_tplg_req (req_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM任务进度变更审计(只追加)'");
        log.info("RDM v3.31 进度审计迁移完成（{}）：rdm_task_progress_log 与排期说明列就绪",
                TASK_PROGRESS_AUDIT_SCRIPT);
    }

    /** v3.31 后置校验：排期说明列 + 进度审计表齐备，缺任一项不记版本 */
    private void verifyTaskProgressAuditMigrate() {
        if (!columnExists("rdm_task_plan_log", "remark")) {
            throw new IllegalStateException("RDM v3.31 核验失败：rdm_task_plan_log.remark 列缺失");
        }
        requireTables(new String[]{"rdm_task_progress_log"});
    }

    /**
     * v3.32：给 rejected → intake_pending 的 reopen 动作补 PM 角色（286 脚本仅作参照文档，不进镜像）。
     * <p>幂等：只更新角色列表里没有独立 PM 项的那一行；逗号包裹后精确匹配，
     * 避免 PMO 的 PM 子串被误判为「已包含 PM」。
     * <p>管理员把该动作停用/删除时不强行复活：verify 会跳过，不阻塞启动。
     */
    private void doReopenPmMigrate() {
        int updated = jdbcTemplate.update(
                "UPDATE rdm_transition SET allowed_roles = 'SUBMITTER,PMO,DISPATCHER,PM' "
                        + "WHERE from_status = 'rejected' AND to_status = 'intake_pending' "
                        + "AND action_code = 'reopen' AND status = 1 "
                        + "AND CONCAT(',', allowed_roles, ',') NOT LIKE '%,PM,%'");
        log.info("RDM v3.32 驳回重开动作已补充 PM 角色: {} 行", updated);
    }

    /**
     * v3.32 后置校验：动作仍启用时必须包含 PM。
     * <p>不把「动作必须存在」当硬条件：运营可能在状态配置页停用/删除该动作，
     * 那是业务决定，不应阻塞启动；但动作存在却没加上 PM，说明迁移没落库，必须抛错重试。
     */
    private void verifyReopenPmMigrate() {
        Integer active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_transition WHERE from_status = 'rejected' "
                        + "AND to_status = 'intake_pending' AND action_code = 'reopen' AND status = 1",
                Integer.class);
        if (active == null || active == 0) {
            log.warn("RDM v3.32 校驗跳過：rejected→intake_pending 的 reopen 動作已被停用或刪除");
            return;
        }
        Integer withPm = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_transition WHERE from_status = 'rejected' "
                        + "AND to_status = 'intake_pending' AND action_code = 'reopen' AND status = 1 "
                        + "AND CONCAT(',', allowed_roles, ',') LIKE '%,PM,%'",
                Integer.class);
        if (withPm == null || withPm == 0) {
            throw new IllegalStateException("RDM v3.32 核驗失敗：reopen 動作的 allowed_roles 未包含 PM");
        }
    }

    /**
     * 存量導入需求回退：review_passed → evaluating 的「退回評估」動作種子。
     * <p>只給 PM：退回是產品側對自己受理結論的撤銷；管理員由 {@code canPerform} 直通，
     * 不把管理員寫進 allowed_roles（那會讓「管理員」變成一個可授權角色，擴權面失控）。
     */
    private void doBackToEvaluateSeed() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO rdm_transition (from_status, to_status, action_code, action_name, "
                        + "allowed_roles, required_fields, sort_order, status) "
                        + "VALUES ('review_passed', 'evaluating', ?, '退回評估', 'PM', 'remark', 33, 1)",
                ACTION_BACK_TO_EVALUATE);
        log.info("RDM 存量需求回退動作種子已寫入: back_to_evaluate 新增 {} 行", inserted);
    }

    /**
     * 後置校驗：動作存在時必須可用且落點是 evaluating。
     * <p>與 v3.32 同口徑：運營主動停用/刪除是業務決定，不阻塞啟動；
     * 但行還在卻指向別處，說明遷移寫壞了，必須拋錯。
     */
    private void verifyBackToEvaluateSeed() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT to_status, status, required_fields FROM rdm_transition "
                        + "WHERE from_status = 'review_passed' AND action_code = ? AND deleted = 0",
                ACTION_BACK_TO_EVALUATE);
        if (rows.isEmpty()) {
            log.warn("RDM 校驗跳過：review_passed→evaluating 的 back_to_evaluate 動作已被刪除");
            return;
        }
        Map<String, Object> row = rows.get(0);
        if (!"evaluating".equals(String.valueOf(row.get("to_status")))
                || !"1".equals(String.valueOf(row.get("status")))
                || row.get("required_fields") == null
                || !String.valueOf(row.get("required_fields")).contains("remark")) {
            throw new IllegalStateException("RDM 核驗失敗：back_to_evaluate 動作配置不是 evaluating/啟用/必填說明");
        }
    }

    /**
     * 排期必填字段補齊：只更新仍為 204 舊值 {@code planDate} 的那一行。
     * <p>不覆蓋管理員自定義（例如運營另外加了 versionNo），避免每次發版都把配置改回去。
     */
    private void doScheduleRequiredFieldsSeed() {
        int updated = jdbcTemplate.update(
                "UPDATE rdm_transition SET required_fields = ? "
                        + "WHERE from_status = 'review_passed' AND to_status = 'scheduled' "
                        + "AND action_code = 'schedule' AND required_fields = 'planDate' AND deleted = 0",
                SCHEDULE_REQUIRED_FIELDS);
        log.info("RDM 排期必填字段已與代碼閘門對齊: {} 行（planDate → {}）", updated, SCHEDULE_REQUIRED_FIELDS);
    }

    /**
     * 後置校驗：只要排期動作仍啟用，就不能再殘留舊值 {@code planDate}。
     * <p>不校驗「必須等於三元組」：管理員可以自行增減必填字段，那是業務決定；
     * 但舊值殘留說明本遷移沒落庫，前端彈窗仍不會渲染項目/迭代，必須拋錯重試。
     */
    private void verifyScheduleRequiredFieldsSeed() {
        Integer active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_transition WHERE from_status = 'review_passed' "
                        + "AND to_status = 'scheduled' AND action_code = 'schedule' AND status = 1 AND deleted = 0",
                Integer.class);
        if (active == null || active == 0) {
            log.warn("RDM 校驗跳過：排期動作 schedule 已被停用或刪除");
            return;
        }
        Integer legacy = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_transition WHERE from_status = 'review_passed' "
                        + "AND to_status = 'scheduled' AND action_code = 'schedule' "
                        + "AND required_fields = 'planDate' AND deleted = 0",
                Integer.class);
        if (legacy != null && legacy > 0) {
            throw new IllegalStateException("RDM 核驗失敗：schedule.required_fields 仍為舊值 planDate，未補 project/iteration");
        }
    }

    /**
     * v3.33：清掉存量日报模板里的姓名占位符。
     * <p>只更新仍含占位符的行：重放时候选集合为空即 no-op，用户对模板的其它编辑一字不动。
     */
    private void doDailyReportNoNameMigrate() {
        int updated = 0;
        for (String[] pattern : DAILY_REPORT_NO_NAME_PATTERNS) {
            String like = "%" + pattern[0] + "%";
            updated += jdbcTemplate.update(
                    "UPDATE rdm_daily_report_template SET content_tpl = REPLACE(content_tpl, ?, ?), "
                            + "updated_by = 'system', updated_at = NOW() "
                            + "WHERE deleted = 0 AND content_tpl LIKE ?",
                    pattern[0], pattern[1], like);
            updated += jdbcTemplate.update(
                    "UPDATE rdm_daily_report_template SET title_tpl = REPLACE(title_tpl, ?, ?), "
                            + "updated_by = 'system', updated_at = NOW() "
                            + "WHERE deleted = 0 AND title_tpl LIKE ?",
                    pattern[0], pattern[1], like);
        }
        log.info("RDM v3.33 日报模板去姓名完成：清理 {} 处", updated);
    }

    /** v3.33 后置校验：任何未删除模板残留该占位符都会渲染出人名之外的空洞，视为迁移未完成 */
    private void verifyDailyReportNoNameMigrate() {
        Integer left = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_daily_report_template WHERE deleted = 0 "
                        + "AND (content_tpl LIKE '%{{userName}}%' OR title_tpl LIKE '%{{userName}}%')",
                Integer.class);
        if (left != null && left > 0) {
            throw new IllegalStateException("RDM v3.33 核驗失敗：仍有 " + left + " 個日報模板殘留 {{userName}}");
        }
    }

    /** v3.28：投递队列补消息类型与卡片按钮列（281 脚本仅作参照文档，不进镜像） */
    private void doNotifyCardMigrate() {
        for (String[] column : NOTIFY_CARD_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                jdbcTemplate.execute(column[2]);
                log.info("已添加 {}.{} 列", column[0], column[1]);
            }
        }
        log.info("RDM v3.28 日报卡片化迁移已执行（{}）", NOTIFY_CARD_SCRIPT);
    }

    /**
     * v3.28 后置校验：三列缺一都不能记成功。
     * <p>为何是硬条件：dispatcher 按 {@code msg_type} 选发送方法、按 {@code btn_title/btn_url}
     * 组装按钮；缺列时要么整条通知发送失败，要么退化成无按钮卡片（读者点不进去）。
     */
    private void verifyNotifyCardMigrate() {
        for (String[] column : NOTIFY_CARD_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                throw new IllegalStateException("RDM v3.28 核验失败：" + column[0] + "." + column[1] + " 列缺失");
            }
        }
    }

    /** v3.30：配置表补无异常日降噪策略列（283 脚本仅作参照文档，不进镜像） */
    private void doQuietPolicyMigrate() {
        for (String[] column : QUIET_POLICY_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                jdbcTemplate.execute(column[2]);
                log.info("已添加 {}.{} 列", column[0], column[1]);
            }
        }
        log.info("RDM v3.30 无异常降噪策略迁移已执行（{}）", QUIET_POLICY_SCRIPT);
    }

    /** v3.30 后置校验：缺列会让配置读取报错，且降噪策略会静默退回默认值而无法察觉 */
    private void verifyQuietPolicyMigrate() {
        for (String[] column : QUIET_POLICY_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                throw new IllegalStateException("RDM v3.30 核验失败：" + column[0] + "." + column[1] + " 列缺失");
            }
        }
    }

    /**
     * v3.29：存量需求导入结构（外部编号 + 需求级项目经理）与导入幂等唯一索引。
     * <p>索引必须真的存在：导入服务靠它挡住并发重复写入，只靠应用层先查后插
     * 在两次点击/多副本场景下仍会建出重复需求。
     */
    private void doRequirementImportMigrate() {
        for (String[] column : REQUIREMENT_IMPORT_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                jdbcTemplate.execute(column[2]);
                log.info("已添加 {}.{} 列", column[0], column[1]);
            }
        }
        if (!indexExists("rdm_requirement", REQUIREMENT_IMPORT_UNIQUE)) {
            jdbcTemplate.execute("CREATE UNIQUE INDEX " + REQUIREMENT_IMPORT_UNIQUE
                    + " ON rdm_requirement (external_source, external_no)");
            log.info("已创建 rdm_requirement 外部编号唯一索引 {}", REQUIREMENT_IMPORT_UNIQUE);
        }
        log.info("RDM v3.29 存量需求导入结构迁移已执行（{}）", REQUIREMENT_IMPORT_SCRIPT);
    }

    /**
     * v3.29 后置校验：四列与唯一索引缺一都不能记成功。
     * <p>为何是硬条件：缺列时导入直接 bad SQL grammar；缺索引时重复导入会建出重复需求，
     * 且这两种情况只会在真正点「确认导入」时才暴露，必须启动期就拦住。
     */
    private void verifyRequirementImportMigrate() {
        for (String[] column : REQUIREMENT_IMPORT_COLUMNS) {
            if (!columnExists(column[0], column[1])) {
                throw new IllegalStateException("RDM v3.29 核验失败：" + column[0] + "." + column[1] + " 列缺失");
            }
        }
        if (!indexExists("rdm_requirement", REQUIREMENT_IMPORT_UNIQUE)) {
            throw new IllegalStateException("RDM v3.29 核验失败：唯一索引 " + REQUIREMENT_IMPORT_UNIQUE + " 缺失");
        }
    }

    /**
     * v3.21：存量项目编号按创建日补号。
     * <p>不吞异常：规则行缺失 / 前缀不是 PROJ / UPDATE 撞 project_no 唯一键都直接抛出，
     * 不记版本、下次启动重试；静默跑完会让新旧前缀继续并存且无人察觉。
     */
    private void doProjectNoRepair() {
        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                "SELECT prefix, seq_length FROM sys_biz_seq_rule WHERE rule_key = ? AND status = 1",
                PROJECT_SEQ_RULE_KEY);
        if (rules.isEmpty()) {
            throw new IllegalStateException("RDM v3.21 核验失败：sys_biz_seq_rule 缺 "
                    + PROJECT_SEQ_RULE_KEY + " 规则行，无从补号");
        }
        String prefix = String.valueOf(rules.get(0).get("prefix"));
        int seqLength = ((Number) rules.get(0).get("seq_length")).intValue();
        if (!PROJECT_SEQ_PREFIX.equals(prefix)) {
            throw new IllegalStateException("RDM v3.21 核验失败：项目编号规则前缀为 " + prefix
                    + "，需先完成 v3.16 的 PROJ 规则改造");
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, project_no, created_at FROM rdm_project "
                        + "WHERE project_no IS NULL OR project_no NOT REGEXP ?", PROJECT_NO_COMPLIANT_REGEX);
        if (rows.isEmpty()) {
            log.info("RDM v3.21 存量项目编号均已是 PROJ 形态，无需补号");
            return;
        }

        int repaired = 0;
        for (Map<String, Object> row : rows) {
            long id = ((Number) row.get("id")).longValue();
            String oldNo = row.get("project_no") == null ? null : String.valueOf(row.get("project_no"));
            String datePart = resolveProjectNoDatePart(row.get("created_at"));

            // 序号取「该日已用最大序号」与「sys_biz_seq 当日水位」的较大值 +1：
            // 只看向量表时，水位被清理或曾手工补号过就会重发同号、撞唯一键
            Integer usedMax = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(MAX(CAST(SUBSTRING(project_no, "
                            + (prefix.length() + datePart.length() + 1) + ") AS UNSIGNED)), 0) "
                            + "FROM rdm_project WHERE project_no LIKE ?",
                    Integer.class, prefix + datePart + "%");
            List<Integer> current = jdbcTemplate.queryForList(
                    "SELECT current_value FROM sys_biz_seq WHERE prefix = ? AND date_key = ?",
                    Integer.class, prefix, datePart);
            int seq = Math.max(usedMax == null ? 0 : usedMax, current.isEmpty() ? 0 : current.get(0)) + 1;
            String newNo = buildProjectNo(prefix, datePart, seq, seqLength);

            jdbcTemplate.update("UPDATE rdm_project SET project_no = ? WHERE id = ?", newNo, id);
            // 补号必须同步推进当日水位（取 GREATEST 不回退），否则下一次新建从 01 重发会撞号
            jdbcTemplate.update(
                    "INSERT INTO sys_biz_seq (prefix, date_key, current_value, created_at, updated_at) "
                            + "VALUES (?, ?, ?, NOW(), NOW()) "
                            + "ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value)), "
                            + "updated_at = NOW()",
                    prefix, datePart, seq);
            log.info("RDM v3.21 项目编号补号: id={} {} -> {}", id, oldNo, newNo);
            repaired++;
        }
        log.info("RDM v3.21 存量项目编号补号完成: {} 行", repaired);
    }

    /** v3.21 后置校验：不允许再有非 PROJ 形态的编号残留（否则补号并未真正收敛） */
    private void verifyProjectNoRepair() {
        requireTables(new String[]{"rdm_project"});
        Integer bad = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_project WHERE project_no IS NULL OR project_no NOT REGEXP ?",
                Integer.class, PROJECT_NO_COMPLIANT_REGEX);
        if (bad != null && bad > 0) {
            throw new IllegalStateException("RDM v3.21 核验失败：仍有 " + bad
                    + " 个项目编号不符合 PROJ+YYYYMMDD+序号");
        }
    }

    /** 编号日期段取项目创建日：补出来的号要能解释「项目是哪天立的」，不能用部署当天冒充 */
    private String resolveProjectNoDatePart(Object createdAt) {
        LocalDate date;
        if (createdAt instanceof java.sql.Timestamp ts) {
            date = ts.toLocalDateTime().toLocalDate();
        } else if (createdAt instanceof LocalDateTime ldt) {
            date = ldt.toLocalDate();
        } else if (createdAt instanceof LocalDate ld) {
            date = ld;
        } else {
            date = LocalDate.now();
        }
        return date.format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    /** 补零：seq_length=2 时 1→01；超过 99 自然扩位为 100，不截断也不循环 */
    static String buildProjectNo(String prefix, String datePart, int seq, int seqLength) {
        return prefix + datePart + String.format("%0" + seqLength + "d", seq);
    }
    
    /** v3.19 后置校验：规则表就绪 + 四个范围列就绪 + 新唯一键就绪 + 旧唯一键已 移除 */
    private void verifyDailyReportRules() {
        requireTables(new String[]{DAILY_REPORT_RULE_TABLE});
        for (String[] col : DAILY_REPORT_SCOPE_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException("RDM v3.19 核验失败：" + col[0] + "." + col[1] + " 列缺失");
            }
        }
        if (!indexExists("rdm_daily_report", DAILY_REPORT_NEW_UNIQUE)) {
            throw new IllegalStateException("RDM v3.19 核验失败：唯一索引 " + DAILY_REPORT_NEW_UNIQUE + " 缺失"
                    + "（缺它会让同日多规则推送互相覆盖）");
        }
        if (indexExists("rdm_daily_report", DAILY_REPORT_OLD_UNIQUE)) {
            throw new IllegalStateException("RDM v3.19 核验失败：旧全局唯一索引 " + DAILY_REPORT_OLD_UNIQUE
                    + " 仍存在，第二条规则同日推送会报 Duplicate entry");
        }
    }

    /**
     * v3.17：状态阶段 6 段 → 9 段。
     * <p>不吞异常：某行没落到位就必须抛出并不记版本，否则看板与状态条会继续各说一套且无人察觉。
     */
    private void doStatusStageMigrate() {
        int changed = 0;
        for (String[] row : STATUS_STAGE_UPDATES) {
            int n = jdbcTemplate.update(
                    "UPDATE rdm_status_def SET stage = ? WHERE code = ? AND stage = ? AND deleted = 0",
                    row[2], row[0], row[1]);
            if (n > 0) {
                changed += n;
                log.info("已调整状态所属阶段: {} {} → {}", row[0], row[1], row[2]);
            }
        }
        log.info("RDM v3.17 状态阶段细化完成: 本次更新 {} 行（重跑为 0 行属正常，按 code+旧值定位天然幂等）", changed);
    }

    /**
     * v3.17 后置校验：无值域外残留 + 开发/测试/上线三段确实分开。
     * <p>只校“改过”不够：分开研发与测试正是本次目的，若某段落空说明映射写错，
     * 状态条会出现永远亮不上的节点。
     */
    private void verifyStatusStage() {
        String placeholders = String.join(",", java.util.Collections.nCopies(STATUS_STAGE_VALUES.length, "?"));
        Integer legacy = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0 AND stage NOT IN (" + placeholders + ")",
                Integer.class, (Object[]) STATUS_STAGE_VALUES);
        if (legacy != null && legacy > 0) {
            throw new IllegalStateException("RDM v3.17 核验失败：rdm_status_def 存在 " + legacy
                    + " 行阶段值不在 9 段值域内（可能为管理员自定义或迁移未跑完）");
        }
        requireAtLeast("RDM v3.17 開發段（dev）", 4,
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0 AND stage = 'dev'");
        requireAtLeast("RDM v3.17 測試段（test）", 2,
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0 AND stage = 'test'");
        requireAtLeast("RDM v3.17 上線段（release）", 3,
                "SELECT COUNT(*) FROM rdm_status_def WHERE deleted = 0 AND stage = 'release'");
    }

    /** 索引是否存在（information_schema.STATISTICS）：CREATE INDEX 不可重放，先查再加 */
    private boolean indexExists(String table, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        return count != null && count > 0;
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

    /** 列是否可空（IS_NULLABLE='YES'）：MODIFY 后置校验用，防止只改注释不改约束的假成功 */
    private boolean columnNullable(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? "
                        + "AND IS_NULLABLE = 'YES'",
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
