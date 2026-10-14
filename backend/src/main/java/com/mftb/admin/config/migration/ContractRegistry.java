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
        // 文檔中心：索引與留痕三表為 doc 域關鍵寫入路徑，啟動自愈防遷移漏執行
        combined.addAll(docCenterContracts());
        // 文檔中心：學習路徑兩表（新人入職包/培訓清單）同為關鍵寫入路徑
        combined.addAll(docLearningContracts());
        // HR 入转调离：审批回调办理链路的关键写入表，启动自愈保证不因迁移漏执行而缺表
        combined.add(hrLifecycleRequestContract());
        // 自然流量評分規則：生產缺 multiplier_tiers/threshold_score/region_configs 導致規則列表查詢 500
        combined.add(organicScoreRuleContract());
        // 通知底座兩表：165 腳本長期未接入遷移框架，生產缺表直接把會議域啟動打成崩潰循環
        combined.addAll(notificationContracts());
        return combined;
    }

    /**
     * 通知底座兩表契約（DDL 與 165 腳本逐字一致）：sys_notification_app / sys_notification_scenario。
     * <p>
     * 事故背景（2026-10-14 生產發布失敗）：{@code backend/sql/165_notification_apps_and_scenarios.sql}
     * 只是手工參考腳本，開發庫跑過、生產 RDS 從未建過。{@code 230_meeting_core_tables.sql} 第 7 段
     * 向 {@code sys_notification_scenario} 登記會議通知場景時抛「Table doesn't exist」，
     * applyOnce 向上抛出使 Spring 上下文啟動失敗，Pod 崩潰循環導致入口網關 503。
     * <p>
     * 建表已由 {@code NotificationSchemaMigrationInitializer}（{@code notify:schema:v1.0}，@Order 14）
     * 在業務域之前執行；本契約是第二道閘：任何環境被人為刪表或列漂移時，啟動自愈並在校驗不過時
     * 把實例置為 not-ready，而不是等到用戶點開「通知配置」才 500。
     * <p>
     * 場景表的外鍵指向應用表，故必須先登記 app 再登記 scenario（校驗器按列表順序自癒）。
     */
    public static List<ContractSpec> notificationContracts() {
        return List.of(
                new ContractSpec("sys-notification-app", "sys_notification_app",
                        "CREATE TABLE IF NOT EXISTS sys_notification_app ("
                                + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                                + "name VARCHAR(100) NOT NULL COMMENT '应用名称', "
                                + "platform VARCHAR(20) NOT NULL DEFAULT 'dingtalk', "
                                + "app_key VARCHAR(100) NOT NULL, "
                                + "app_secret VARCHAR(256) NOT NULL DEFAULT '', "
                                + "agent_id VARCHAR(32) NOT NULL DEFAULT '', "
                                + "base_url VARCHAR(500) NOT NULL DEFAULT '', "
                                + "enabled TINYINT NOT NULL DEFAULT 1, "
                                + "remark VARCHAR(500) NOT NULL DEFAULT '', "
                                + "legacy_key VARCHAR(50) DEFAULT NULL COMMENT '旧配置迁移标记', "
                                + "updated_by VARCHAR(100) NOT NULL DEFAULT '', "
                                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                                + "UNIQUE KEY uk_notification_app_key (app_key), "
                                + "UNIQUE KEY uk_notification_app_legacy (legacy_key)"
                                + ") COMMENT='企业内部应用（凭据每应用保存一次）'",
                        List.of(
                                new ContractSpec.ColumnSpec("name",
                                        "ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '应用名称'"),
                                new ContractSpec.ColumnSpec("platform",
                                        "ADD COLUMN platform VARCHAR(20) NOT NULL DEFAULT 'dingtalk'"),
                                new ContractSpec.ColumnSpec("app_key",
                                        "ADD COLUMN app_key VARCHAR(100) NOT NULL DEFAULT ''"),
                                new ContractSpec.ColumnSpec("app_secret",
                                        "ADD COLUMN app_secret VARCHAR(256) NOT NULL DEFAULT ''"),
                                new ContractSpec.ColumnSpec("agent_id",
                                        "ADD COLUMN agent_id VARCHAR(32) NOT NULL DEFAULT ''"),
                                new ContractSpec.ColumnSpec("base_url",
                                        "ADD COLUMN base_url VARCHAR(500) NOT NULL DEFAULT ''"),
                                new ContractSpec.ColumnSpec("enabled",
                                        "ADD COLUMN enabled TINYINT NOT NULL DEFAULT 1"),
                                new ContractSpec.ColumnSpec("legacy_key",
                                        "ADD COLUMN legacy_key VARCHAR(50) DEFAULT NULL COMMENT '旧配置迁移标记'"))),
                new ContractSpec("sys-notification-scenario", "sys_notification_scenario",
                        "CREATE TABLE IF NOT EXISTS sys_notification_scenario ("
                                + "scenario_key VARCHAR(64) PRIMARY KEY, "
                                + "app_id BIGINT DEFAULT NULL, "
                                + "enabled TINYINT NOT NULL DEFAULT 0, "
                                + "updated_by VARCHAR(100) NOT NULL DEFAULT '', "
                                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                                + "CONSTRAINT fk_notification_scenario_app FOREIGN KEY (app_id) REFERENCES sys_notification_app(id)"
                                + ") COMMENT='业务通知场景路由，场景定义与接收人规则由业务代码声明'",
                        List.of(
                                new ContractSpec.ColumnSpec("app_id",
                                        "ADD COLUMN app_id BIGINT DEFAULT NULL"),
                                new ContractSpec.ColumnSpec("enabled",
                                        "ADD COLUMN enabled TINYINT NOT NULL DEFAULT 0"),
                                new ContractSpec.ColumnSpec("updated_by",
                                        "ADD COLUMN updated_by VARCHAR(100) NOT NULL DEFAULT ''"),
                                new ContractSpec.ColumnSpec("updated_at",
                                        "ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"))));
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

    /**
     * 文檔中心三表契約（DDL 與 233 腳本逐字一致）：doc_space / doc_node / doc_view_log。
     * <p>登記理由：文檔庫列表/詳情/留痕全部按實體字段拼 SELECT，任何環境缺表缺列
     * 都會把整個模塊打成 500；applyOnce 漏跑時由本契約每次啟動自愈。
     */
    public static List<ContractSpec> docCenterContracts() {
        return List.of(
                new ContractSpec("doc-space", "doc_space",
                        "CREATE TABLE IF NOT EXISTS doc_space ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                                + "name VARCHAR(64) NOT NULL COMMENT '空間名稱', "
                                + "icon VARCHAR(16) DEFAULT NULL COMMENT '空間圖標（emoji）', "
                                + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）', "
                                + "description VARCHAR(255) DEFAULT NULL COMMENT '空間說明', "
                                + "created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人', "
                                + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                                + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                                + "KEY idx_doc_space_sort (sort_order)"
                                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-文檔空間'",
                        List.of(
                                new ContractSpec.ColumnSpec("name", "ADD COLUMN name VARCHAR(64) NOT NULL COMMENT '空間名稱'"),
                                new ContractSpec.ColumnSpec("icon", "ADD COLUMN icon VARCHAR(16) DEFAULT NULL COMMENT '空間圖標（emoji）'"),
                                new ContractSpec.ColumnSpec("sort_order", "ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）'"))),
                new ContractSpec("doc-node", "doc_node",
                        "CREATE TABLE IF NOT EXISTS doc_node ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                                + "space_id BIGINT NOT NULL COMMENT '所屬空間ID', "
                                + "category VARCHAR(64) NOT NULL DEFAULT '未分類' COMMENT '文檔分類', "
                                + "title VARCHAR(200) NOT NULL COMMENT '文檔標題', "
                                + "doc_type TINYINT NOT NULL DEFAULT 1 COMMENT '類型: 1=在線文檔 2=表格 3=幻燈片 4=PDF 5=外部鏈接', "
                                + "status TINYINT NOT NULL DEFAULT 1 COMMENT '狀態: 1=草稿 2=評審中 3=已發布 4=已歸檔', "
                                + "tags VARCHAR(255) DEFAULT NULL COMMENT '標籤（逗號分隔）', "
                                + "owner_user_id BIGINT DEFAULT NULL COMMENT '負責人用戶ID', "
                                + "owner_name VARCHAR(64) DEFAULT NULL COMMENT '負責人姓名', "
                                + "tencent_file_id VARCHAR(64) DEFAULT NULL COMMENT '騰訊文檔fileID', "
                                + "tencent_url VARCHAR(500) NOT NULL COMMENT '騰訊文檔鏈接', "
                                + "biz_type VARCHAR(16) DEFAULT NULL COMMENT '業務掛接類型: REQ', "
                                + "biz_id BIGINT DEFAULT NULL COMMENT '業務掛接ID', "
                                + "summary VARCHAR(1000) DEFAULT NULL COMMENT '文檔摘要', "
                                + "created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人', "
                                + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                                + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                                + "KEY idx_doc_node_space (space_id, deleted), "
                                + "KEY idx_doc_node_biz (biz_type, biz_id), "
                                + "KEY idx_doc_node_file (tencent_file_id)"
                                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-文檔元數據索引'",
                        List.of(
                                new ContractSpec.ColumnSpec("tencent_file_id", "ADD COLUMN tencent_file_id VARCHAR(64) DEFAULT NULL COMMENT '騰訊文檔fileID'"),
                                new ContractSpec.ColumnSpec("tencent_url", "ADD COLUMN tencent_url VARCHAR(500) NOT NULL COMMENT '騰訊文檔鏈接'"),
                                new ContractSpec.ColumnSpec("biz_type", "ADD COLUMN biz_type VARCHAR(16) DEFAULT NULL COMMENT '業務掛接類型: REQ'"),
                                new ContractSpec.ColumnSpec("biz_id", "ADD COLUMN biz_id BIGINT DEFAULT NULL COMMENT '業務掛接ID'"),
                                new ContractSpec.ColumnSpec("summary", "ADD COLUMN summary VARCHAR(1000) DEFAULT NULL COMMENT '文檔摘要'"))),
                new ContractSpec("doc-view-log", "doc_view_log",
                        "CREATE TABLE IF NOT EXISTS doc_view_log ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                                + "node_id BIGINT NOT NULL COMMENT '文檔ID', "
                                + "user_id BIGINT DEFAULT NULL COMMENT '查閱人用戶ID', "
                                + "user_name VARCHAR(64) DEFAULT NULL COMMENT '查閱人姓名', "
                                + "department VARCHAR(128) DEFAULT NULL COMMENT '部門（快照）', "
                                + "viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '查閱時間', "
                                + "duration_sec INT DEFAULT NULL COMMENT '停留時長秒', "
                                + "KEY idx_doc_view_log_node (node_id, viewed_at), "
                                + "KEY idx_doc_view_log_user (user_id)"
                                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-查閱審計留痕'",
                        List.of(
                                new ContractSpec.ColumnSpec("node_id", "ADD COLUMN node_id BIGINT NOT NULL COMMENT '文檔ID'"),
                                new ContractSpec.ColumnSpec("duration_sec", "ADD COLUMN duration_sec INT DEFAULT NULL COMMENT '停留時長秒'"))));
    }

    /**
     * 文檔中心學習路徑兩表契約（DDL 與 234 腳本逐字一致）：doc_learning_path / doc_learning_path_item。
     * <p>登記理由：路徑列表/詳情按實體字段拼 SELECT，缺表缺列會把新人入職包入口打成 500；
     * applyOnce 漏跑時由本契約每次啟動自愈。
     */
    public static List<ContractSpec> docLearningContracts() {
        return List.of(
                new ContractSpec("doc-learning-path", "doc_learning_path",
                        "CREATE TABLE IF NOT EXISTS doc_learning_path ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                                + "name VARCHAR(64) NOT NULL COMMENT '路徑名稱', "
                                + "description VARCHAR(255) DEFAULT NULL COMMENT '路徑說明', "
                                + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用', "
                                + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）', "
                                + "created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人', "
                                + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                                + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                                + "KEY idx_doc_learning_path_sort (sort_order)"
                                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-學習路徑'",
                        List.of(
                                new ContractSpec.ColumnSpec("name", "ADD COLUMN name VARCHAR(64) NOT NULL COMMENT '路徑名稱'"),
                                new ContractSpec.ColumnSpec("status", "ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用'"),
                                new ContractSpec.ColumnSpec("sort_order", "ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）'"))),
                new ContractSpec("doc-learning-item", "doc_learning_path_item",
                        "CREATE TABLE IF NOT EXISTS doc_learning_path_item ("
                                + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID', "
                                + "path_id BIGINT NOT NULL COMMENT '所屬路徑ID', "
                                + "node_id BIGINT NOT NULL COMMENT '文檔ID', "
                                + "sort_order INT NOT NULL DEFAULT 0 COMMENT '路徑內順序', "
                                + "created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人', "
                                + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人', "
                                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間', "
                                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間', "
                                + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除', "
                                + "KEY idx_doc_learning_item_path (path_id, sort_order), "
                                + "KEY idx_doc_learning_item_node (node_id)"
                                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-學習路徑條目'",
                        List.of(
                                new ContractSpec.ColumnSpec("path_id", "ADD COLUMN path_id BIGINT NOT NULL COMMENT '所屬路徑ID'"),
                                new ContractSpec.ColumnSpec("node_id", "ADD COLUMN node_id BIGINT NOT NULL COMMENT '文檔ID'"),
                                new ContractSpec.ColumnSpec("sort_order", "ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '路徑內順序'"))));
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
