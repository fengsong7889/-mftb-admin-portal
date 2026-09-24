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
        return combined;
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
