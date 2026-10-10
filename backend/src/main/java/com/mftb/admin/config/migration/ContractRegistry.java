package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 结构契约登记表。新增关键业务表结构时在此登记，由 {@link SchemaContractValidator}
 * 每次启动校验并在缺失时执行“可证明安全”的自愈 DDL。
 * <p>
 * 契约保持克制：只登记事故相关/关键写入路径的表，避免对未知表误判 not-ready。
 */
@Component
public class ContractRegistry {

    /**
     * 全部结构契约。除金字招牌/人气商家外，额外登记 V0 治理底座中
     * 写入路径相关的 5 张新表，保证启动时自动建表（不依赖 applyOnce）。
     */
    public List<ContractSpec> allContracts() {
        java.util.List<ContractSpec> combined = new java.util.ArrayList<>();
        combined.add(signboardPricingMain());
        combined.add(signboardPricingLabel());
        combined.addAll(hotDiscountContracts());
        combined.addAll(aiGovernanceContracts());
        // V0 §八 V0-6：启动自愈投递日志表（与 applyOnce 不互斥，无表时直接建）
        combined.add(deliveryLogContract());
        // 权限中心重构：授权审计是关键写入路径，登记契约保证启动自愈
        combined.add(permAuditLogContract());
        // HR 入转调离：审批回调办理链路的关键写入表，启动自愈保证不因迁移漏执行而缺表
        combined.add(hrLifecycleRequestContract());
        // 自然流量評分規則：生產缺 multiplier_tiers/threshold_score/region_configs 導致規則列表查詢 500
        combined.add(organicScoreRuleContract());
        return combined;
    }

    /**
     * 自然流量評分規則表結構契約。
     * <p>
     * 事故背景：{@code backend/sql/135_136_organic_com01_full.sql} / {@code 137_organic_plt03_region_configs.sql}
     * 僅是參考文檔未接入自動執行，而 {@code OrganicScoreDataInitializer} 的補列步驟被
     * {@code organic:columns-v1} 版本門控（生產早已記為成功不再重跑），導致生產庫長期缺
     * {@code multiplier_tiers} / {@code threshold_score} / {@code region_configs} 三列，
     * MyBatis-Plus 按實體全字段 SELECT 直接拋 BadSqlGrammarException（Unknown column in 'field list'）。
     * 故登記為每次啟動自癒的關鍵結構；建表 DDL 與 {@code resources/23_organic_score.sql} 保持同構並補齊三列。
     */
    public static ContractSpec organicScoreRuleContract() {
        return new ContractSpec(
                "organic-score-rule",
                "biz_organic_score_rule",
                "CREATE TABLE IF NOT EXISTS biz_organic_score_rule ("
                        + "id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主鍵', "
                        + "rule_code VARCHAR(50) NOT NULL COMMENT '規則編碼', "
                        + "dimension INT NOT NULL COMMENT '所屬維度: 1=商業 2=店鋪 4=平台', "
                        + "name VARCHAR(100) NOT NULL COMMENT '規則名稱', "
                        + "description VARCHAR(500) DEFAULT '' COMMENT '計分說明', "
                        + "mode INT NOT NULL COMMENT '計分方式', "
                        + "score INT NOT NULL DEFAULT 0 COMMENT '分值', "
                        + "prerequisites VARCHAR(500) DEFAULT NULL COMMENT '前提條件', "
                        + "stat_days INT DEFAULT NULL COMMENT '統計天數', "
                        + "stat_days_total INT DEFAULT NULL COMMENT '歷史基線天數', "
                        + "stat_days_recent INT DEFAULT NULL COMMENT '近期對比天數', "
                        + "range_scores JSON DEFAULT NULL COMMENT '配送範圍分層分數 JSON', "
                        + "time_range_scores JSON DEFAULT NULL COMMENT '分時段配送範圍分數 JSON', "
                        + "tiers JSON DEFAULT NULL COMMENT '梯度檔位 JSON', "
                        + "condition_items JSON DEFAULT NULL COMMENT '條件計分項 JSON', "
                        + "calc_cycle VARCHAR(20) DEFAULT NULL COMMENT '計算周期', "
                        + "calc_interval_hours DECIMAL(5,2) DEFAULT NULL COMMENT '定時監控間隔小時數', "
                        + "peak_time_ranges JSON DEFAULT NULL COMMENT '高峰時段定義 JSON', "
                        + "deduction_per_order INT DEFAULT NULL COMMENT '每單固定扣分', "
                        + "decay_coefficient DECIMAL(10,4) DEFAULT NULL COMMENT '衰減係數', "
                        + "blocked_merchants JSON DEFAULT NULL COMMENT '屏蔽商家列表 JSON', "
                        + "activity_items JSON DEFAULT NULL COMMENT '活動加分配置 JSON', "
                        + "multiplier_tiers TEXT DEFAULT NULL COMMENT '倍數梯度計分配置 JSON', "
                        + "threshold_score INT DEFAULT NULL COMMENT '門檻≤客單價時固定加分', "
                        + "region_configs TEXT DEFAULT NULL COMMENT '區域配置 JSON', "
                        + "status INT NOT NULL DEFAULT 1 COMMENT '服務狀態: 1=啟用 2=停用', "
                        + "builtin TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否系統內置', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序號', "
                        + "updated_by VARCHAR(50) DEFAULT NULL COMMENT '最後更新人', "
                        + "deleted INT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                        + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                        + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                        + "PRIMARY KEY (id), "
                        + "UNIQUE KEY uk_rule_code (rule_code), "
                        + "KEY idx_dimension (dimension), "
                        + "KEY idx_status (status)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分規則配置'",
                List.of(
                        new ContractSpec.ColumnSpec("multiplier_tiers",
                                "ALTER TABLE biz_organic_score_rule ADD COLUMN multiplier_tiers TEXT DEFAULT NULL COMMENT '倍數梯度計分配置 JSON（僅 COM_01）'"),
                        new ContractSpec.ColumnSpec("threshold_score",
                                "ALTER TABLE biz_organic_score_rule ADD COLUMN threshold_score INT DEFAULT NULL COMMENT '門檻≤客單價時固定加分（僅 COM_01）'"),
                        new ContractSpec.ColumnSpec("region_configs",
                                "ALTER TABLE biz_organic_score_rule ADD COLUMN region_configs TEXT DEFAULT NULL COMMENT '區域配置 JSON（PLT_03/PLT_04 共用）'")
                ));
    }

    /** HR 入转调离单据表结构契约（与 {@code HrLifecycleSchemaInitializer} 同构，建表即可，无列级自愈）。 */
    public static ContractSpec hrLifecycleRequestContract() {
        return new ContractSpec(
                "hr-lifecycle-request",
                "hr_lifecycle_request",
                "CREATE TABLE IF NOT EXISTS hr_lifecycle_request ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                        + "req_no VARCHAR(32) NOT NULL COMMENT '单据编号(RS+YYYYMMDD+4位序号)', "
                        + "type VARCHAR(16) NOT NULL COMMENT '单据类型: onboard/regular/transfer/dimission', "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '单据状态: draft/pending/approved/rejected/completed', "
                        + "flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联OA流程编号', "
                        + "user_id BIGINT DEFAULT NULL COMMENT '关联 sys_user.id(入职完成后回填)', "
                        + "emp_name VARCHAR(64) NOT NULL COMMENT '姓名/候选人姓名', "
                        + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '员工工号(入职完成后回填)', "
                        + "dept_id BIGINT DEFAULT NULL COMMENT '目标部门ID', "
                        + "dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照', "
                        + "position_id BIGINT DEFAULT NULL COMMENT '职位ID', "
                        + "position_name VARCHAR(128) DEFAULT NULL COMMENT '职位名称快照', "
                        + "effective_date DATE DEFAULT NULL COMMENT '生效日期', "
                        + "reason VARCHAR(512) DEFAULT NULL COMMENT '申请事由', "
                        + "offer_date DATE DEFAULT NULL COMMENT 'Offer发放日期', "
                        + "probation_months INT DEFAULT NULL COMMENT '试用期月数', "
                        + "expected_regular_date DATE DEFAULT NULL COMMENT '预计转正日期', "
                        + "id_card_no VARCHAR(64) DEFAULT NULL COMMENT '证件号码', "
                        + "mobile VARCHAR(32) DEFAULT NULL COMMENT '手机号', "
                        + "email VARCHAR(128) DEFAULT NULL COMMENT '邮箱', "
                        + "candidate_info JSON DEFAULT NULL COMMENT '入职资料JSON', "
                        + "old_dept_name VARCHAR(128) DEFAULT NULL COMMENT '调动前部门快照', "
                        + "old_position_name VARCHAR(128) DEFAULT NULL COMMENT '调动前职位快照', "
                        + "new_dept_id BIGINT DEFAULT NULL COMMENT '调入部门ID', "
                        + "new_dept_name VARCHAR(128) DEFAULT NULL COMMENT '调入部门名称快照', "
                        + "new_position_id BIGINT DEFAULT NULL COMMENT '调入职位ID', "
                        + "new_position_name VARCHAR(128) DEFAULT NULL COMMENT '调入职位名称快照', "
                        + "new_company VARCHAR(128) DEFAULT NULL COMMENT '调动后任职公司', "
                        + "new_superior VARCHAR(64) DEFAULT NULL COMMENT '调动后直属上级', "
                        + "dimission_type VARCHAR(32) DEFAULT NULL COMMENT '离职类型: voluntary/involuntary/expired', "
                        + "last_work_date DATE DEFAULT NULL COMMENT '最后工作日', "
                        + "settlement_info JSON DEFAULT NULL COMMENT '离职结算JSON', "
                        + "remark VARCHAR(512) DEFAULT NULL COMMENT '备注/办理结果说明', "
                        + "contract_id BIGINT DEFAULT NULL COMMENT '被续签的原合同ID(emp_contract.id)', "
                        + "contract_no VARCHAR(64) DEFAULT NULL COMMENT '原合同编号快照', "
                        + "new_contract_no VARCHAR(64) DEFAULT NULL COMMENT '新合同编号', "
                        + "new_contract_type VARCHAR(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)', "
                        + "new_contract_company VARCHAR(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)', "
                        + "new_contract_start_date DATE DEFAULT NULL COMMENT '新合同开始日期', "
                        + "new_contract_end_date DATE DEFAULT NULL COMMENT '新合同结束日期', "
                        + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        + "UNIQUE KEY uk_hlr_req_no (req_no), "
                        + "KEY idx_hlr_type_status (type, status), "
                        + "KEY idx_hlr_user (user_id), "
                        + "KEY idx_hlr_flow_no (flow_no), "
                        + "KEY idx_hlr_emp_no (emp_no)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR入转调离生命周期单据'",
                java.util.List.of(
                        // P0 合同续签：列契约自愈（存量库缺列时启动即补，不依赖 applyOnce）
                        new ContractSpec.ColumnSpec("contract_id",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN contract_id BIGINT DEFAULT NULL COMMENT '被续签的原合同ID(emp_contract.id)'"),
                        new ContractSpec.ColumnSpec("contract_no",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN contract_no VARCHAR(64) DEFAULT NULL COMMENT '原合同编号快照'"),
                        new ContractSpec.ColumnSpec("new_contract_no",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_no VARCHAR(64) DEFAULT NULL COMMENT '新合同编号'"),
                        new ContractSpec.ColumnSpec("new_contract_type",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_type VARCHAR(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)'"),
                        new ContractSpec.ColumnSpec("new_contract_company",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_company VARCHAR(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)'"),
                        new ContractSpec.ColumnSpec("new_contract_start_date",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_start_date DATE DEFAULT NULL COMMENT '新合同开始日期'"),
                        new ContractSpec.ColumnSpec("new_contract_end_date",
                                "ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_end_date DATE DEFAULT NULL COMMENT '新合同结束日期'")
                ));
    }

    /** 授权变更审计日志表结构契约（与 {@code PermissionAuditSchemaInitializer} 同构，建表即可，无列级自愈）。 */
    public static ContractSpec permAuditLogContract() {
        return new ContractSpec(
                "perm-audit-log",
                "sys_permission_audit_log",
                "CREATE TABLE IF NOT EXISTS sys_permission_audit_log ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "target_type VARCHAR(20) NOT NULL COMMENT '授权对象类型: role/department', "
                        + "target_id BIGINT NOT NULL COMMENT '角色ID 或 部门ID', "
                        + "target_name VARCHAR(128) DEFAULT NULL COMMENT '目标名称快照', "
                        + "system_code VARCHAR(64) DEFAULT NULL COMMENT '业务系统编码, 跨系统操作为 NULL', "
                        + "change_type VARCHAR(20) NOT NULL COMMENT '变更类型: GRANT/REVOKE/UPDATE/DELETE/COPY/BIND/STATUS', "
                        + "before_snapshot TEXT DEFAULT NULL COMMENT '变更前快照 JSON', "
                        + "after_snapshot TEXT DEFAULT NULL COMMENT '变更后快照 JSON', "
                        + "operator VARCHAR(64) DEFAULT NULL COMMENT '操作人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间', "
                        + "KEY idx_perm_audit_target (target_type, target_id, created_at), "
                        + "KEY idx_perm_audit_operator (operator, created_at), "
                        + "KEY idx_perm_audit_time (created_at)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='授权变更审计日志表'",
                java.util.List.of());
    }

    /** V0 §八 V0-6：ai_delivery_log 结构契约（无列级自愈，建表即可）。 */
    public static ContractSpec deliveryLogContract() {
        return new ContractSpec(
                "ai-delivery-log",
                "ai_delivery_log",
                "CREATE TABLE IF NOT EXISTS ai_delivery_log ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键', "
                        + "tool_key VARCHAR(64) NOT NULL, channel VARCHAR(32) NOT NULL, caller VARCHAR(64), "
                        + "conversation_pk BIGINT, conversation_id VARCHAR(64), "
                        + "recipient_summary VARCHAR(255), subject_preview VARCHAR(255), "
                        + "status VARCHAR(16) NOT NULL, external_errcode VARCHAR(32), error_message VARCHAR(512), "
                        + "attempts INT NOT NULL DEFAULT 1, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "KEY idx_delivery_tool_time (tool_key, created_at), "
                        + "KEY idx_delivery_status (status, created_at), "
                        + "KEY idx_delivery_conv (conversation_pk)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 通知外部投递日志'",
                java.util.List.of());
    }

    /** 预留：当前本契约直接包含在 allContracts 中，本方法存在只为向后兼容旧initializer 写法。 */
    public static void registerDeliveryLog() {
        // no-op：契约已在 allContracts 里，无需可变的注册列表。
    }

    /** V0 AI 治理底座契约（与 {@code AiGovernanceSchemaInitializer} 同构，确保启动自愈）。 */
    public static List<ContractSpec> aiGovernanceContracts() {
        return List.of(
                buildAiToolPolicy(),
                buildAiToolExecLog(),
                buildAiBudgetLedger(),
                buildAiGrantLog(),
                buildAiConversationEvent());
    }

    private static ContractSpec buildAiToolPolicy() {
        return new ContractSpec(
                "ai-tool-policy",
                "ai_tool_policy",
                "CREATE TABLE IF NOT EXISTS ai_tool_policy ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键', "
                        + "tool_key VARCHAR(64) NOT NULL COMMENT '工具唯一标识', "
                        + "enabled TINYINT NOT NULL DEFAULT 0 COMMENT '1=允许执行', "
                        + "risk_level VARCHAR(8) NOT NULL DEFAULT 'low' COMMENT 'low/medium/high', "
                        + "require_approval TINYINT NOT NULL DEFAULT 0 COMMENT '1=需审批凭证', "
                        + "data_scope_json TEXT DEFAULT NULL COMMENT '数据范围白名单', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '更新人', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "deleted TINYINT DEFAULT 0, "
                        + "UNIQUE KEY uk_ai_tool_policy_key (tool_key)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 工具执行授权策略'",
                List.of());
    }

    private static ContractSpec buildAiToolExecLog() {
        return new ContractSpec(
                "ai-tool-exec-log",
                "ai_tool_exec_log",
                "CREATE TABLE IF NOT EXISTS ai_tool_exec_log ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "tool_key VARCHAR(64) NOT NULL, "
                        + "caller VARCHAR(64), conversation_id VARCHAR(64), args_digest VARCHAR(255), "
                        + "decision VARCHAR(16) NOT NULL, reject_reason VARCHAR(255), "
                        + "elapsed_ms BIGINT, success TINYINT, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "KEY idx_tool_exec_key_time (tool_key, created_at), "
                        + "KEY idx_tool_exec_caller (caller)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 工具执行审计'",
                List.of());
    }

    private static ContractSpec buildAiBudgetLedger() {
        return new ContractSpec(
                "ai-budget-ledger",
                "ai_budget_ledger",
                "CREATE TABLE IF NOT EXISTS ai_budget_ledger ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "username VARCHAR(64) NOT NULL, model_key VARCHAR(64), request_id VARCHAR(64) NOT NULL, "
                        + "reservation_tokens INT NOT NULL DEFAULT 0, reserved_cost DECIMAL(14,6) NOT NULL DEFAULT 0, "
                        + "actual_tokens INT, actual_cost DECIMAL(14,6), currency VARCHAR(8), "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'RESERVED', "
                        + "verification_status VARCHAR(16) NOT NULL DEFAULT 'ESTIMATED', "
                        + "error_message VARCHAR(255), "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_budget_request (request_id), "
                        + "KEY idx_budget_user_time (username, created_at)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 预算流水'",
                List.of());
    }

    private static ContractSpec buildAiGrantLog() {
        return new ContractSpec(
                "ai-grant-log",
                "ai_grant_log",
                "CREATE TABLE IF NOT EXISTS ai_grant_log ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "flow_no VARCHAR(64) NOT NULL, request_id BIGINT, "
                        + "user_id BIGINT NOT NULL, username VARCHAR(64) NOT NULL, "
                        + "grant_type VARCHAR(32) NOT NULL, payload_json TEXT NOT NULL, "
                        + "status VARCHAR(16) NOT NULL DEFAULT 'GRANTED', "
                        + "error_message VARCHAR(255), operator VARCHAR(64), "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_grant_flow (flow_no), "
                        + "KEY idx_grant_user (user_id, created_at)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 发放幂等日志'",
                List.of());
    }

    private static ContractSpec buildAiConversationEvent() {
        return new ContractSpec(
                "ai-conversation-event",
                "ai_conversation_event",
                "CREATE TABLE IF NOT EXISTS ai_conversation_event ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "conversation_pk BIGINT NOT NULL, conversation_no VARCHAR(64), "
                        + "event_type VARCHAR(32) NOT NULL, actor VARCHAR(64), payload_json MEDIUMTEXT, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "KEY idx_conv_event_pk (conversation_pk, created_at), "
                        + "KEY idx_conv_event_type (event_type)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 会话执行事件'",
                List.of());
    }

    /** 基础表由人气商家基础迁移创建，此处统一提供新增列的幂等自愈定义。 */
    public static List<ContractSpec> hotDiscountContracts() {
        return List.of(
                new ContractSpec("hot-skin-discount-main", "biz_ad_pricing_hot", null, List.of(
                        new ContractSpec.ColumnSpec("discount_enabled", "ALTER TABLE biz_ad_pricing_hot ADD COLUMN discount_enabled TINYINT DEFAULT NULL COMMENT '折扣总开关，空值兼容旧规则'"),
                        new ContractSpec.ColumnSpec("discount_mode", "ALTER TABLE biz_ad_pricing_hot ADD COLUMN discount_mode VARCHAR(16) NOT NULL DEFAULT 'shared' COMMENT 'shared/independent'"),
                        new ContractSpec.ColumnSpec("small_discount_tiers", "ALTER TABLE biz_ad_pricing_hot ADD COLUMN small_discount_tiers JSON DEFAULT NULL COMMENT '小图折扣百分比梯度'"),
                        new ContractSpec.ColumnSpec("large_discount_tiers", "ALTER TABLE biz_ad_pricing_hot ADD COLUMN large_discount_tiers JSON DEFAULT NULL COMMENT '大图折扣百分比梯度'"))),
                new ContractSpec("hot-skin-discount-skin", "biz_ad_pricing_hot_skin", null, List.of(
                        new ContractSpec.ColumnSpec("display_mode", "ALTER TABLE biz_ad_pricing_hot_skin ADD COLUMN display_mode VARCHAR(16) DEFAULT NULL COMMENT 'small/large，旧皮肤待确认'"),
                        new ContractSpec.ColumnSpec("template_key", "ALTER TABLE biz_ad_pricing_hot_skin ADD COLUMN template_key VARCHAR(64) DEFAULT NULL COMMENT '固定皮肤模板键'")))
        );
    }

    private ContractSpec signboardPricingMain() {
        return new ContractSpec(
                "signboard-pricing-main",
                "biz_ad_pricing_signboard",
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "pricing_no VARCHAR(32) NOT NULL COMMENT '定价编号', "
                        + "algo_id BIGINT NOT NULL COMMENT '关联算法ID', "
                        + "algo_name VARCHAR(128) DEFAULT NULL COMMENT '算法名称快照', "
                        + "brand VARCHAR(32) DEFAULT NULL COMMENT '所属品牌', "
                        + "channel INT DEFAULT NULL COMMENT '业务频道', "
                        + "presale_days INT NOT NULL DEFAULT 7 COMMENT '预售天数', "
                        + "refund_enabled INT NOT NULL DEFAULT 1 COMMENT '退款开关', "
                        + "cancel_fee_tiers TEXT DEFAULT NULL COMMENT '取消扣费梯度JSON', "
                        + "discount_mode VARCHAR(10) NOT NULL DEFAULT 'local' COMMENT '折扣模式', "
                        + "global_discount_tiers TEXT DEFAULT NULL COMMENT '全局折扣梯度JSON', "
                        + "status INT NOT NULL DEFAULT 1 COMMENT '服务状态', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_pricing_signboard_no (pricing_no), "
                        + "KEY idx_pricing_signboard_algo (algo_id), "
                        + "KEY idx_pricing_signboard_status (status)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌计价主表'",
                List.of(
                        new ContractSpec.ColumnSpec("discount_mode",
                                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN discount_mode VARCHAR(10) NOT NULL DEFAULT 'local' COMMENT '折扣模式: global/local' AFTER cancel_fee_tiers"),
                        new ContractSpec.ColumnSpec("global_discount_tiers",
                                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN global_discount_tiers TEXT DEFAULT NULL COMMENT '全局折扣梯度JSON' AFTER discount_mode")
                ));
    }

    private ContractSpec signboardPricingLabel() {
        return new ContractSpec(
                "signboard-pricing-label",
                "biz_ad_pricing_signboard_label",
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard_label ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "pricing_id BIGINT NOT NULL COMMENT '计价主表ID', "
                        + "label_type VARCHAR(32) NOT NULL COMMENT '标签类型', "
                        + "scenario VARCHAR(32) DEFAULT NULL COMMENT '场景', "
                        + "enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用', "
                        + "price DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '标签日单价', "
                        + "discount_tiers TEXT DEFAULT NULL COMMENT '梯度折扣JSON', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "KEY idx_signboard_label_pricing (pricing_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌标签计价明细表'",
                List.of(
                        new ContractSpec.ColumnSpec("scenario",
                                "ALTER TABLE biz_ad_pricing_signboard_label ADD COLUMN scenario VARCHAR(32) DEFAULT NULL COMMENT '场景（all_macau/district/NULL）' AFTER label_type")
                ));
    }
}
