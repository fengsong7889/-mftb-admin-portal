package com.mftb.admin.config;

import com.mftb.admin.constant.SystemAccessConstants;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 系統權限申請（企業門戶「我要申請」）建表与种子。
 * <p>
 * 版本键 {@code oa:system-access:v1.0}，一次落四件事，缺一件都会让链路断在不同位置：
 * <ol>
 *   <li>建 {@code biz_system_access_request}（申请业务事实 + 授权兑现结果）；</li>
 *   <li>登记编号规则 {@code system_access_request}（XTSQ + YYYYMMDD + 2 位日流水，01 起）——
 *       该行同时是平台支撐系統「編號生成規則」页的展示真值（该页以 sys_biz_seq_rule 为准，
 *       后端新增行自动追加），缺行时 {@code BizSeqService.requireRule} fail-closed，
 *       每次提交直接报「編號生成規則未配置」，不回落通用 OA 号；</li>
 *   <li>种子流程定义 {@code biz_oa_process.system_access}（流程中心/流程事项据此识别类型）；</li>
 *   <li>种子流程配置 {@code biz_workflow_config.system_access}，节点与路由规则<b>刻意留空</b>——
 *       OA 引擎读不到节点时降级为单节点「主管審批」（与 rdm_intake 同口径），
 *       管理员随后可在「流程配置」按部门/申请人编排审批链，不需要改代码。</li>
 * </ol>
 * <p>
 * 两个版本键（同一初始化器里依次 applyOnce）：
 * <ul>
 *   <li>{@code oa:system-access:v1.0}：建表 + 编号规则 + 流程定义/配置（上述四件事）；</li>
 *   <li>{@code oa:system-access:v1.1}：2026-10 申请口径从「勾选菜单」改为「陈述诉求 + 参考角色」，
 *       给申请单补 5 列（场景/期限类型/截止日/参考角色 ID 与名称快照）并把流程说明改成新口径。
 *       必须独立版本键：v1.0 已落库的环境不会重跑 {@code migrate()}。
 *       {@code requested_menus} 保留不删（历史单据的申请事实，删列即毁证据），新单留 NULL。</li>
 * </ul>
 * <p>
 * 启动顺序取 32：必须晚于 {@code DataInitializer(@Order 5)}（建 biz_oa_process /
 * biz_workflow_config / sys_biz_seq_rule 三张表，并补 {@code sys_role.self_service_requestable}）
 * 与 {@code SystemPortalSchemaInitializer(@Order 15)}（建 sys_system / sys_role_system），
 * 否则 INSERT 会打在还不存在的表上。
 * <p>
 * 遵循迁移治理：{@code applyOnce(versionKey, task, verify)}，任务与后置校验都成功才记版本；
 * 失败不吞异常（写失败审计 + 就绪探针 503，下次启动重试）。参考 SQL:
 * backend/sql/243_system_access_request.sql、backend/sql/246_system_access_demand_based.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(32)
public class SystemAccessSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "oa:system-access:v1.0";
    private static final String VERSION_KEY_V11 = "oa:system-access:v1.1";
    private static final String VERSION_KEY_V12 = "oa:system-access:v1.2";

    /** v1.2 补的到期回收 4 列（逐个校，缺任何一列都不记版本） */
    private static final List<String> V12_COLUMNS = List.of(
            "grant_newly_bound", "revoke_status", "revoked_at", "revoked_by");
    /** 回收扫描索引：定时任务每轮都按「未回收 + 到期日已过」拉取，没索引就是全表扫 */
    private static final String V12_INDEX = "idx_sar_revoke";

    /**
     * 流程说明（流程中心/发起页展示）。
     * <p>2026-10 改口径后重写：原文案写着「勾选需要的菜单功能」，与新界面不符会把人指错方向。
     * v1.0 的种子与 v1.1 的 UPDATE 共用本常量，避免新旧库文案漂移。
     */
    private static final String PROCESS_DESCRIPTION =
            "申請未授權業務系統的使用權限：陳述使用場景與期限（不再勾選菜單功能，"
                    + "避免向零權限員工暴露系統結構），可選指定一個參考角色；"
                    + "審批人據此指定授權角色，通過後自動綁定並立即生效";

    /** v1.1 补的 5 列（后置校验逐个查，缺任何一列都不记版本） */
    private static final List<String> V11_COLUMNS = List.of(
            "scenarios", "duration_type", "duration_until", "preferred_role_id", "preferred_role_name");

    /**
     * 建表 DDL 的<b>唯一副本</b>：{@code ContractRegistry} 直接引用本常量做启动自愈，
     * 不再抄一份，避免「迁移建的表」与「契约自愈建的表」结构漂移。
     * <p>已包含 v1.1 补的 5 列：新库走本 DDL 一次到位，存量库走 v1.1 的 ALTER，两边结构必须一致。
     * <p>凭证用 MEDIUMTEXT：base64 Data URL 单件上限 2MB，TEXT(64KB) 会静默截断。
     */
    public static final String CREATE_TABLE_SQL =
            "CREATE TABLE IF NOT EXISTS biz_system_access_request ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                    + "flow_no VARCHAR(64) NOT NULL COMMENT 'OA流程编号(XTSQ+YYYYMMDD+2位日流水)', "
                    + "system_code VARCHAR(32) NOT NULL COMMENT '申请的业务系统编码 sys_system.code', "
                    + "system_name VARCHAR(64) DEFAULT NULL COMMENT '系统名称快照', "
                    + "user_id BIGINT NOT NULL COMMENT '申请人 sys_user.id', "
                    + "applicant_name VARCHAR(64) NOT NULL COMMENT '申请人姓名快照', "
                    + "applicant_emp_id VARCHAR(32) DEFAULT NULL COMMENT '申请人工号快照', "
                    + "dept_name VARCHAR(128) DEFAULT NULL COMMENT '申请人部门名称快照', "
                    + "scenarios VARCHAR(255) DEFAULT NULL COMMENT '使用场景code,逗号分隔', "
                    + "duration_type VARCHAR(16) DEFAULT NULL COMMENT '使用期限类型: permanent/until', "
                    + "duration_until DATE DEFAULT NULL COMMENT '期限截止日(到期次日起自动回收,permanent为NULL)', "
                    + "preferred_role_id BIGINT DEFAULT NULL COMMENT '申请人建议的参考角色 sys_role.id', "
                    + "preferred_role_name VARCHAR(64) DEFAULT NULL COMMENT '参考角色名称快照', "
                    + "requested_menus MEDIUMTEXT COMMENT '【历史列】勾选菜单JSON,2026-10后新单不再写入', "
                    + "reason VARCHAR(1000) NOT NULL COMMENT '使用诉求说明', "
                    + "attachments MEDIUMTEXT COMMENT '相关凭证JSON [{name,type,size,contentType,dataUrl}]', "
                    + "status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/approved/rejected/cancelled', "
                    + "grant_target_type VARCHAR(16) DEFAULT NULL COMMENT '授权对象类型: role', "
                    + "grant_target_id BIGINT DEFAULT NULL COMMENT '授权角色 sys_role.id', "
                    + "grant_target_name VARCHAR(64) DEFAULT NULL COMMENT '授权角色名称快照', "
                    + "grant_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '授权兑现状态: none/granted', "
                    + "grant_newly_bound TINYINT NOT NULL DEFAULT 0 COMMENT '本次兌現是否真的新绑角色:1=本单绑上(仅此有到期回收资格),0=此前已持有/存量', "
                    + "revoke_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '到期回收状态: none/revoked/kept', "
                    + "revoked_at DATETIME DEFAULT NULL COMMENT '回收时间', "
                    + "revoked_by VARCHAR(64) DEFAULT NULL COMMENT '回收执行者(system-expiry)', "
                    + "granted_at DATETIME DEFAULT NULL COMMENT '授权兑现时间', "
                    + "granted_by VARCHAR(64) DEFAULT NULL COMMENT '兑现时的审批人签名', "
                    + "reject_reason VARCHAR(500) DEFAULT NULL COMMENT '驳回理由', "
                    + "apply_time DATETIME DEFAULT NULL COMMENT '申请时间', "
                    + "complete_time DATETIME DEFAULT NULL COMMENT '审结时间', "
                    + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                    + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                    + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                    + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                    + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                    + "UNIQUE KEY uk_sar_flow_no (flow_no), "
                    + "KEY idx_sar_user (user_id, status), "
                    + "KEY idx_sar_system (system_code, status), "
                    + "KEY idx_sar_revoke (revoke_status, duration_until)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系統權限申請單（門戶我要申請→OA審批→綁定授權角色）'";

    /**
     * 编号规则说明（会原样显示在「編號生成規則」页的备注列，便于后续追溯）。
     * <p>写法与 XQSP（rdm_intake_approval）保持一致：说清前缀、日期段、位数、起始值与扩位行为。
     */
    private static final String SEQ_RULE_REMARK =
            "{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，不截斷、不循環複用。"
                    + "生成時機：員工在企業門戶對未授權系統點「我要申請」並正式提交時生成；"
                    + "審批人未配置授權角色時不發號（提交即失敗），撤銷/駁回的單號不回收。";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        versionTracker.applyOnce(VERSION_KEY_V11, this::migrateV11, this::verifyV11);
        versionTracker.applyOnce(VERSION_KEY_V12, this::migrateV12, this::verifyV12);
    }

    private void migrate() {
        jdbcTemplate.execute(CREATE_TABLE_SQL);

        // 编号规则：rule_key 一律用 BizSeqService 常量拼接，不让种子与发号代码各写一份字面量飘移
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, "
                        + "seq_length, seq_start, status, remark) VALUES (?, ?, ?, ?, 'YYYYMMDD', 2, 1, 1, ?)",
                BizSeqService.RULE_SYSTEM_ACCESS_REQUEST,
                "系統權限申請流程編號",
                "流程審批系統－系統權限申請",
                SystemAccessConstants.SEQ_PREFIX,
                SEQ_RULE_REMARK);

        // 流程定义：category=general（平台级自助流程，不属财务/人事）
        jdbcTemplate.update(
                "INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, "
                        + "workflow_type, sort_order, status) VALUES (?, ?, 'general', 'SafetyCertificateOutlined', ?, ?, 40, 1)",
                SystemAccessConstants.PROCESS_CODE,
                SystemAccessConstants.PROCESS_NAME,
                PROCESS_DESCRIPTION,
                SystemAccessConstants.PROCESS_CODE);

        // 流程配置：节点/路由留空 → 引擎降级单节点「主管審批」，管理页可随时配细
        jdbcTemplate.update(
                "INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description) "
                        + "VALUES (?, ?, 1, ?)",
                SystemAccessConstants.PROCESS_CODE,
                SystemAccessConstants.PROCESS_NAME + "審批",
                "系統權限申請審批：控制誰來審、審批人在流程上指定要綁定的授權角色");

        log.info("系統權限申請建表與種子完成: table=biz_system_access_request, rule={}, process={}",
                BizSeqService.RULE_SYSTEM_ACCESS_REQUEST, SystemAccessConstants.PROCESS_CODE);
    }

    /**
     * 后置校验：四件事必须真的落库。
     * <p>为什么不能只校「表存在」：编号规则行被停用（status=0）时表还在，但每次提交都会
     * fail-closed 报「編號生成規則未配置」——只有实查 prefix/status 才能证明链路可用。
     */
    private void verify() {
        requireAtLeast("biz_system_access_request 表", 1,
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request'");
        requireAtLeast("系統權限申請編號規則 XTSQ", 1,
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND prefix = ? AND status = 1",
                BizSeqService.RULE_SYSTEM_ACCESS_REQUEST, SystemAccessConstants.SEQ_PREFIX);
        requireAtLeast("系統權限申請流程定義", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = ? AND status = 1",
                SystemAccessConstants.PROCESS_CODE);
        requireAtLeast("系統權限申請流程配置", 1,
                "SELECT COUNT(*) FROM biz_workflow_config WHERE flow_type = ?",
                SystemAccessConstants.PROCESS_CODE);
    }

    /** 校验参数必须与占位符严格对齐：标签单独传，不混进 varargs 当 SQL 参数 */
    private void requireAtLeast(String label, int min, String sql, Object... args) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, args);
        if (count == null || count < min) {
            throw new IllegalStateException(label + " 未就绪（当前 " + count + "，要求 >= " + min + "）");
        }
    }

    /* ==================== v1.1：申请口径改为陈述诉求 + 参考角色 ==================== */

    /**
     * 补 5 列 + 把流程说明改成新口径。
     * <p>全部可空：历史单据没有这些事实，给默认值反而是伪造（例如给旧单填个 permanent，
     * 审批人会把「未采集」误读为「申请人说要长期」）。
     * <p>{@code requested_menus} 刻意不删也不改：它是历史单据的申请事实，删列等于毁证据；
     * 新单不再写入，审批页对旧单仍按只读展示。
     */
    private void migrateV11() {
        addColumnIfAbsent("scenarios",
                "ALTER TABLE biz_system_access_request ADD COLUMN scenarios VARCHAR(255) DEFAULT NULL "
                        + "COMMENT '使用场景code,逗号分隔' AFTER dept_name");
        addColumnIfAbsent("duration_type",
                "ALTER TABLE biz_system_access_request ADD COLUMN duration_type VARCHAR(16) DEFAULT NULL "
                        + "COMMENT '使用期限类型: permanent/until' AFTER scenarios");
        addColumnIfAbsent("duration_until",
                "ALTER TABLE biz_system_access_request ADD COLUMN duration_until DATE DEFAULT NULL "
                        + "COMMENT '期限截止日(不做到期自动回收,仅作审批依据)' AFTER duration_type");
        addColumnIfAbsent("preferred_role_id",
                "ALTER TABLE biz_system_access_request ADD COLUMN preferred_role_id BIGINT DEFAULT NULL "
                        + "COMMENT '申请人建议的参考角色 sys_role.id' AFTER duration_until");
        addColumnIfAbsent("preferred_role_name",
                "ALTER TABLE biz_system_access_request ADD COLUMN preferred_role_name VARCHAR(64) DEFAULT NULL "
                        + "COMMENT '参考角色名称快照' AFTER preferred_role_id");

        // 流程说明同步改口径：流程中心/发起页直接展示它，留着「勾选菜单」的旧文案会误导审批人
        jdbcTemplate.update("UPDATE biz_oa_process SET description = ? WHERE process_code = ?",
                PROCESS_DESCRIPTION, SystemAccessConstants.PROCESS_CODE);
        log.info("系統權限申請申请口径已改为陈述诉求: columns={}, process={}",
                V11_COLUMNS, SystemAccessConstants.PROCESS_CODE);
    }

    /**
     * 后置校验：5 列都在，且流程说明已是新口径。
     * <p>为何连文案一起校：它是审批人理解「该看什么」的入口，只校列存在会让
     * 「结构就绪但说明误导」这种半就绪状态静默过关。
     */
    private void verifyV11() {
        for (String column : V11_COLUMNS) {
            requireAtLeast("biz_system_access_request." + column + " 列", 1,
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                            + "AND COLUMN_NAME = ?",
                    column);
        }
        requireAtLeast("system_access 流程说明（诉求口径）", 1,
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = ? AND status = 1 AND description = ?",
                SystemAccessConstants.PROCESS_CODE, PROCESS_DESCRIPTION);
    }

    /* ==================== v1.2：到期自动回收 ==================== */

    /**
     * 补 4 列 + 回收扫描索引。
     * <p>两个默认值都是 fail-safe，不是随手填的：
     * <ul>
     *   <li>{@code grant_newly_bound DEFAULT 0}：存量已兌现的单据一律拿不到回收资格，
     *       不会因为「上线了一个定时任务」就静默收回别人已有的权限；要回收存量
     *       需管理员自己核完清单回填，不提供自动回填；</li>
     *   <li>{@code revoke_status DEFAULT 'none'}：新单默认「未回收」，由作业逐轮推进。</li>
     * </ul>
     */
    private void migrateV12() {
        addColumnIfAbsent("grant_newly_bound",
                "ALTER TABLE biz_system_access_request ADD COLUMN grant_newly_bound TINYINT NOT NULL DEFAULT 0 "
                        + "COMMENT '本次兌現是否真的新绑角色:1=本单绑上(仅此有到期回收资格),0=此前已持有/存量' "
                        + "AFTER grant_status");
        addColumnIfAbsent("revoke_status",
                "ALTER TABLE biz_system_access_request ADD COLUMN revoke_status VARCHAR(16) NOT NULL DEFAULT 'none' "
                        + "COMMENT '到期回收状态: none/revoked/kept' AFTER grant_newly_bound");
        addColumnIfAbsent("revoked_at",
                "ALTER TABLE biz_system_access_request ADD COLUMN revoked_at DATETIME DEFAULT NULL "
                        + "COMMENT '回收时间' AFTER revoke_status");
        addColumnIfAbsent("revoked_by",
                "ALTER TABLE biz_system_access_request ADD COLUMN revoked_by VARCHAR(64) DEFAULT NULL "
                        + "COMMENT '回收执行者(system-expiry)' AFTER revoked_at");
        addIndexIfAbsent(V12_INDEX,
                "ALTER TABLE biz_system_access_request ADD INDEX " + V12_INDEX
                        + " (revoke_status, duration_until)");
        // 把旧列注释里「不做到期自动回收」这句已经变成假话的描述改过来：
        // 库表注释是 DBA 排查时的第一手信息，留着旧说法会误导下一个接手的人。
        // （v1.1 的 ALTER 脚本文字不改：迁移一旦执行就是历史，靠本条 MODIFY 把存量库补正；
        //   新库走 CREATE_TABLE_SQL，两边最终拿到同一句注释。）
        jdbcTemplate.execute("ALTER TABLE biz_system_access_request MODIFY COLUMN duration_until DATE DEFAULT NULL "
                + "COMMENT '期限截止日(到期次日起自动回收,permanent为NULL)'");
        log.info("系統權限申請到期回收字段已就绪: columns={}", V12_COLUMNS);
    }

    /**
     * 后置校验：4 列 + 索引都在，且两个带默认值的列真的是那个默认值。
     * <p>为何连默认值一起校：{@code grant_newly_bound} 默认若是 1，等于一次结构迁移就把存量单据
     * 全部变成「可被自动回收」，那是权限动作不是结构动作，必须 fail-closed。
     */
    private void verifyV12() {
        requireAtLeast("回收资格列 grant_newly_bound（必须 NOT NULL DEFAULT 0）", 1,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                        + "AND COLUMN_NAME = 'grant_newly_bound' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '0'");
        requireAtLeast("回收状态列 revoke_status（必须 NOT NULL DEFAULT 'none'）", 1,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                        + "AND COLUMN_NAME = 'revoke_status' AND IS_NULLABLE = 'NO' "
                        + "AND COLUMN_DEFAULT = 'none'");
        for (String column : List.of("revoked_at", "revoked_by")) {
            requireAtLeast("biz_system_access_request." + column + " 列", 1,
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                            + "AND COLUMN_NAME = ?",
                    column);
        }
        requireAtLeast("回收扫描索引 " + V12_INDEX, 1,
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                        + "AND INDEX_NAME = ?",
                V12_INDEX);
    }

    /** 幂等建索引：MySQL 不支持 ADD INDEX IF NOT EXISTS，靠 information_schema.STATISTICS 判存在 */
    private void addIndexIfAbsent(String index, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                        + "AND INDEX_NAME = ?",
                Integer.class, index);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自动创建索引 biz_system_access_request.{}", index);
        }
    }

    /** 幂等补列：MySQL 不支持 ADD COLUMN IF NOT EXISTS，先查 information_schema 再决定要不要执行 */
    private void addColumnIfAbsent(String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_system_access_request' "
                        + "AND COLUMN_NAME = ?",
                Integer.class, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自动迁移字段 biz_system_access_request.{}", column);
        }
    }
}
