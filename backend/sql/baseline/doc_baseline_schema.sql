-- 自动生成，请勿手改；重新生成：python3 scripts/doc-baseline/refresh_baseline.py
-- 生成日期：2026-10-25；对象数：351
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `ai_action_proposal`;
CREATE TABLE `ai_action_proposal` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `proposal_no` varchar(48) NOT NULL,
  `app_key` varchar(64) DEFAULT NULL,
  `tool_key` varchar(64) NOT NULL,
  `tool_version` int NOT NULL DEFAULT '1',
  `params_json` mediumtext NOT NULL,
  `params_hash` char(64) NOT NULL,
  `target_resource` varchar(255) DEFAULT NULL,
  `target_version` varchar(64) DEFAULT NULL,
  `impact_summary` varchar(512) DEFAULT NULL,
  `requester` varchar(64) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `approval_ref` varchar(128) DEFAULT NULL,
  `approved_by` varchar(64) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `idempotency_key` varchar(96) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_proposal_no` (`proposal_no`),
  UNIQUE KEY `uk_proposal_idem` (`idempotency_key`),
  KEY `idx_proposal_requester` (`requester`,`status`),
  KEY `idx_proposal_status` (`status`,`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='动作提案';

DROP TABLE IF EXISTS `ai_action_receipt`;
CREATE TABLE `ai_action_receipt` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `proposal_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL,
  `external_ref` varchar(128) DEFAULT NULL,
  `payload_digest` char(64) DEFAULT NULL,
  `detail` varchar(512) DEFAULT NULL,
  `reconciled` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_receipt_proposal` (`proposal_id`),
  KEY `idx_receipt_status` (`status`,`reconciled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='动作执行回执';

DROP TABLE IF EXISTS `ai_action_request`;
CREATE TABLE `ai_action_request` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action_type` varchar(32) NOT NULL COMMENT '動作類型: rdm_progress_group / rdm_progress_person / user_memory_save',
  `conversation_pk` bigint DEFAULT NULL COMMENT '關聯會話主鍵',
  `operator` varchar(64) NOT NULL COMMENT '發起人賬號（工號）',
  `payload_json` json NOT NULL COMMENT '凍結的發送參數（projectId/targetType/recipientUserId/title/content）',
  `preview_text` text NOT NULL COMMENT '確認卡預覽文本',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/processing/sent/failed/cancelled/expired',
  `expires_at` datetime NOT NULL COMMENT '確認有效期',
  `executed_at` datetime DEFAULT NULL COMMENT '確認/失敗/取消時間',
  `result_message` varchar(1000) DEFAULT NULL COMMENT '結果或失敗原因',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_action_operator_status` (`operator`,`status`,`created_at`),
  KEY `idx_ai_action_conversation` (`conversation_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手待確認動作（推送等寫操作）';

DROP TABLE IF EXISTS `ai_application`;
CREATE TABLE `ai_application` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app_key` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `system_code` varchar(32) NOT NULL DEFAULT 'common',
  `owner_user_id` bigint DEFAULT NULL,
  `owner_name` varchar(64) DEFAULT NULL,
  `purpose` varchar(512) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  `published_version` int NOT NULL DEFAULT '0',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_key` (`app_key`),
  KEY `idx_app_system` (`system_code`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Agent 应用注册表';

DROP TABLE IF EXISTS `ai_application_version`;
CREATE TABLE `ai_application_version` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app_id` bigint NOT NULL,
  `version_no` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `model_key` varchar(128) DEFAULT NULL,
  `prompt_profile_key` varchar(64) DEFAULT NULL,
  `tool_whitelist_json` text,
  `knowledge_systems_json` varchar(255) DEFAULT NULL,
  `budget_scope_type` varchar(16) DEFAULT 'USER',
  `budget_scope_key` varchar(64) DEFAULT NULL,
  `change_note` varchar(512) DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `published_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_version` (`app_id`,`version_no`),
  KEY `idx_app_version_status` (`app_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Agent 应用版本';

DROP TABLE IF EXISTS `ai_budget_ledger`;
CREATE TABLE `ai_budget_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username` varchar(64) NOT NULL COMMENT '预占账号',
  `model_key` varchar(64) DEFAULT NULL COMMENT '目标模型标识（NULL=未路由）',
  `request_id` varchar(64) NOT NULL COMMENT '一次请求唯一 ID（幂等键）',
  `reservation_tokens` int NOT NULL DEFAULT '0' COMMENT '预估 tokens 数（prompt+completion 上限）',
  `reserved_cost` decimal(14,6) NOT NULL DEFAULT '0.000000' COMMENT '预估费用（按币种）',
  `actual_tokens` int DEFAULT NULL COMMENT '结算 tokens 数',
  `actual_cost` decimal(14,6) DEFAULT NULL COMMENT '结算费用',
  `currency` varchar(8) DEFAULT NULL COMMENT '币种 CNY/USD',
  `status` varchar(16) NOT NULL DEFAULT 'RESERVED' COMMENT 'RESERVED/SETTLED/RELEASED',
  `verification_status` varchar(16) NOT NULL DEFAULT 'ESTIMATED' COMMENT 'VERIFIED/ESTIMATED/UNKNOWN',
  `error_message` varchar(255) DEFAULT NULL COMMENT '失败原因',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_budget_request` (`request_id`),
  KEY `idx_budget_user_time` (`username`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 预算流水（V0 网关侧预占/结算/释放）';

DROP TABLE IF EXISTS `ai_budget_pool`;
CREATE TABLE `ai_budget_pool` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `scope_type` varchar(16) NOT NULL,
  `scope_key` varchar(64) NOT NULL,
  `period` varchar(16) NOT NULL,
  `currency` varchar(8) NOT NULL DEFAULT 'CNY',
  `limit_amount` decimal(18,6) NOT NULL DEFAULT '0.000000',
  `reserved_amount` decimal(18,6) NOT NULL DEFAULT '0.000000',
  `used_amount` decimal(18,6) NOT NULL DEFAULT '0.000000',
  `status` tinyint NOT NULL DEFAULT '1',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pool_scope` (`scope_type`,`scope_key`,`period`,`currency`),
  KEY `idx_pool_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 预算池';

DROP TABLE IF EXISTS `ai_capability`;
CREATE TABLE `ai_capability` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tool_key` varchar(64) NOT NULL,
  `display_name` varchar(128) NOT NULL,
  `domain` varchar(32) NOT NULL DEFAULT 'common',
  `prompt_description` text NOT NULL COMMENT '下发给模型的 function description',
  `use_when` varchar(512) DEFAULT NULL,
  `avoid_when` varchar(512) DEFAULT NULL,
  `examples_json` text,
  `sort` int NOT NULL DEFAULT '0',
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_capability_tool` (`tool_key`),
  KEY `idx_capability_domain` (`domain`,`sort`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 能力清单（prompt 元数据，启停仍在 ai_tool_policy）';

DROP TABLE IF EXISTS `ai_config_change_log`;
CREATE TABLE `ai_config_change_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_type` varchar(32) NOT NULL COMMENT 'capability/prompt/glossary/quick_prompt/push_template',
  `config_key` varchar(128) NOT NULL,
  `action` varchar(16) NOT NULL COMMENT 'create/update/publish/rollback/delete',
  `before_json` text,
  `after_json` text,
  `operator` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_config_log_type` (`config_type`,`created_at`),
  KEY `idx_config_log_operator` (`operator`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 配置变更审计';

DROP TABLE IF EXISTS `ai_conversation`;
CREATE TABLE `ai_conversation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` varchar(32) DEFAULT NULL COMMENT '对话编号（DH+YYYYMMDD+7位自增序号）',
  `username` varchar(64) NOT NULL COMMENT '用戶帳號',
  `title` varchar(200) NOT NULL DEFAULT '新對話' COMMENT '會話標題',
  `messages` mediumtext NOT NULL COMMENT '消息列表 JSON',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `model_key` varchar(64) DEFAULT NULL COMMENT '本次會話使用的模型標識',
  `total_tokens` int DEFAULT '0' COMMENT '本次會話累計消耗 tokens',
  `request_count` int DEFAULT '0' COMMENT '本次會話累計請求次數',
  `deleted_at` datetime DEFAULT NULL COMMENT '刪除時間戳',
  `summary` text COMMENT '滚动历史摘要',
  `summary_message_count` int NOT NULL DEFAULT '0' COMMENT '已摘要的消息条数',
  `summary_updated_at` datetime DEFAULT NULL COMMENT '摘要更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_username_updated` (`username`,`updated_at` DESC)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手會話';

DROP TABLE IF EXISTS `ai_conversation_event`;
CREATE TABLE `ai_conversation_event` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `conversation_pk` bigint NOT NULL COMMENT 'ai_conversation.id',
  `conversation_no` varchar(64) DEFAULT NULL COMMENT '会话编号（DHxxxx）',
  `event_type` varchar(32) NOT NULL COMMENT 'USER_TURN/ASSISTANT_TURN/TOOL_CALL/TOOL_RESULT/POLICY_DECISION/QUOTA_CHARGE/GATEWAY_ERROR',
  `actor` varchar(64) DEFAULT NULL COMMENT '触发账号（本人或系统）',
  `payload_json` mediumtext COMMENT '事件载荷（脱敏后）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '事件时间',
  PRIMARY KEY (`id`),
  KEY `idx_conv_event_pk` (`conversation_pk`,`created_at`),
  KEY `idx_conv_event_type` (`event_type`)
) ENGINE=InnoDB AUTO_INCREMENT=108 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 会话执行事件（服务端追加，客户端不可覆写）';

DROP TABLE IF EXISTS `ai_data_class_policy`;
CREATE TABLE `ai_data_class_policy` (
  `system_code` varchar(32) NOT NULL,
  `data_class` varchar(16) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`system_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务系统数据分级';

DROP TABLE IF EXISTS `ai_delivery_log`;
CREATE TABLE `ai_delivery_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tool_key` varchar(64) NOT NULL COMMENT '工具标识（dingtalk_sender / email_sender / 未来 wecom_sender 等）',
  `channel` varchar(32) NOT NULL COMMENT '渠道：dingtalk/email/wecom',
  `caller` varchar(64) DEFAULT NULL COMMENT '发起账号（AI 助手调用者）',
  `conversation_pk` bigint DEFAULT NULL COMMENT '关联 ai_conversation.id（无会话上下文时为空）',
  `conversation_id` varchar(64) DEFAULT NULL COMMENT '关联会话编号 DHxxxx',
  `recipient_summary` varchar(255) DEFAULT NULL COMMENT '收件目标脱敏摘要（邮件到 xxx@yyy；钉钉群 channel.name）',
  `subject_preview` varchar(255) DEFAULT NULL COMMENT '标题/内容前 100 字（供审计快速识别）',
  `status` varchar(16) NOT NULL COMMENT 'SENT=渠道已受理 / FAILED=渠道或网络失败 / UNKNOWN=异步提交未确认',
  `external_errcode` varchar(32) DEFAULT NULL COMMENT '渠道返回码（钉钉 errcode / SMTP 响应码等）',
  `error_message` varchar(512) DEFAULT NULL COMMENT '错误摘要（不含堆栈）',
  `attempts` int NOT NULL DEFAULT '1' COMMENT '本次投递尝试次数（预留重试计数）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_delivery_tool_time` (`tool_key`,`created_at`),
  KEY `idx_delivery_status` (`status`,`created_at`),
  KEY `idx_delivery_conv` (`conversation_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 通知外部投递结果日志（V0 §八 V0-6）';

DROP TABLE IF EXISTS `ai_department_auth`;
CREATE TABLE `ai_department_auth` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `department_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `has_permission` tinyint DEFAULT '1',
  `limit_type` varchar(20) DEFAULT 'none',
  `daily_limit` int DEFAULT '0',
  `monthly_limit` int DEFAULT '0',
  `custom_limit` int DEFAULT '0',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` tinyint DEFAULT '1',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dept_model` (`department_id`,`model_id`),
  KEY `idx_department_id` (`department_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门模型权限表';

DROP TABLE IF EXISTS `ai_dept_auth_group`;
CREATE TABLE `ai_dept_auth_group` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_code` varchar(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_dept_model_auth 生成）',
  `name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL COMMENT '策略描述',
  `data_residency` tinyint DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `total_employee_count` int DEFAULT '0',
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门模型授权策略主表';

DROP TABLE IF EXISTS `ai_dept_auth_group_dept`;
CREATE TABLE `ai_dept_auth_group_dept` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `group_id` bigint NOT NULL,
  `department_id` bigint NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_dept` (`group_id`,`department_id`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_department_id` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='策略-部门关联表';

DROP TABLE IF EXISTS `ai_dept_auth_group_model`;
CREATE TABLE `ai_dept_auth_group_model` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `group_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `vision_support` tinyint DEFAULT '1',
  `function_calling` tinyint DEFAULT '1',
  `json_mode` tinyint DEFAULT '1',
  `streaming` tinyint DEFAULT '1',
  `thinking_mode` tinyint DEFAULT '1',
  `priority` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_model` (`group_id`,`model_id`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='策略-模型授权与能力配置表';

DROP TABLE IF EXISTS `ai_dept_quota_policy`;
CREATE TABLE `ai_dept_quota_policy` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_dept_quota 生成）',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '策略名稱',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '策略描述',
  `dept_ids` json DEFAULT NULL COMMENT '關聯部門ID數組',
  `dept_names` json DEFAULT NULL COMMENT '關聯部門名稱數組（冗餘展示）',
  `total_employee_count` int DEFAULT '0' COMMENT '覆蓋人數',
  `allocate_mode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'total' COMMENT '額度分配: total/per_capita',
  `period` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額周期: daily/monthly',
  `quota_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額類型: token/cost/request',
  `quota_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '限額值',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '計價幣種',
  `soft_threshold` int NOT NULL DEFAULT '80' COMMENT '軟限額提醒閾值(%)',
  `over_limit_action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reject' COMMENT '超額動作: reject/approve/downgrade',
  `downgrade_model_id` bigint DEFAULT NULL COMMENT '降級目標模型ID',
  `downgrade_exempt_quota` decimal(20,2) DEFAULT NULL COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，跟隨部門分配模式：total=共享豁免池/per_capita=每人獨立豁免池）',
  `used_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '本期已用量',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '狀態: 1=啟用 0=停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  KEY `idx_period` (`period`),
  KEY `idx_status` (`status`),
  KEY `idx_quota_type` (`quota_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部門額度策略';

DROP TABLE IF EXISTS `ai_emp_pos_auth_strategy`;
CREATE TABLE `ai_emp_pos_auth_strategy` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `config_code` varchar(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_model_auth 生成）',
  `strategy_name` varchar(128) NOT NULL COMMENT '策略名称',
  `sequences` text NOT NULL COMMENT '职级序列 JSON 数组',
  `job_levels` text NOT NULL COMMENT '职级 JSON 数组',
  `model_configs` text NOT NULL COMMENT '授权模型能力配置 JSON 数组',
  `data_residency` tinyint DEFAULT '0' COMMENT '数据不出域：1=启用 0=未启用',
  `description` varchar(512) DEFAULT NULL COMMENT '策略描述',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=启用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除：0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工模型权控-职位授权策略表';

DROP TABLE IF EXISTS `ai_emp_quota_adjust_log`;
CREATE TABLE `ai_emp_quota_adjust_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `employee_id` bigint NOT NULL COMMENT '被調整員工ID (sys_user.id)',
  `source` varchar(32) NOT NULL COMMENT '來源維度: department/position/role/approval',
  `source_desc` varchar(200) DEFAULT NULL COMMENT '來源描述',
  `quota_type` varchar(16) NOT NULL COMMENT 'token/request/cost',
  `quota_period` varchar(16) NOT NULL COMMENT 'daily/monthly',
  `old_value` decimal(15,2) NOT NULL DEFAULT '0.00',
  `new_value` decimal(15,2) NOT NULL,
  `reason` varchar(300) DEFAULT NULL COMMENT '調整原因',
  `operator` varchar(64) NOT NULL COMMENT '操作人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_emp` (`employee_id`),
  KEY `idx_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='員工額度調整日誌';

DROP TABLE IF EXISTS `ai_emp_quota_policy`;
CREATE TABLE `ai_emp_quota_policy` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_quota 生成）',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '策略名稱',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '策略描述',
  `sequences` json DEFAULT NULL COMMENT '職級序列數組 e.g. ["M","R"]',
  `job_levels` json DEFAULT NULL COMMENT '職級數組 e.g. ["R3","R4"]',
  `total_employee_count` int DEFAULT '0' COMMENT '覆蓋人數',
  `period` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額周期: daily/monthly',
  `quota_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額類型: token/cost/request',
  `quota_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '限額值',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '計價幣種',
  `soft_threshold` int NOT NULL DEFAULT '80' COMMENT '軟限額提醒閾值(%)',
  `over_limit_action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reject' COMMENT '超額動作: reject/approve/downgrade',
  `downgrade_model_id` bigint DEFAULT NULL COMMENT '降級目標模型ID',
  `downgrade_exempt_quota` decimal(20,2) DEFAULT NULL COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，與主額度分配方式一致）',
  `used_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '本期已用量',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '狀態: 1=啟用 0=停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  KEY `idx_period` (`period`),
  KEY `idx_status` (`status`),
  KEY `idx_quota_type` (`quota_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='員工職位額度策略';

DROP TABLE IF EXISTS `ai_emp_role_auth`;
CREATE TABLE `ai_emp_role_auth` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `config_code` varchar(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_model_auth 生成）',
  `role_code` varchar(64) NOT NULL COMMENT '角色编码（前端展示 ID，唯一）',
  `role_name` varchar(128) NOT NULL COMMENT '角色名称',
  `description` varchar(512) DEFAULT NULL COMMENT '角色描述',
  `user_ids` text NOT NULL COMMENT '绑定员工 ID JSON 数组',
  `model_configs` text NOT NULL COMMENT '授权模型能力配置 JSON 数组',
  `data_residency` tinyint DEFAULT '0' COMMENT '数据不出域：1=启用 0=未启用',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=启用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除：0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`role_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工模型权控-自定义角色授权表';

DROP TABLE IF EXISTS `ai_employee_auth`;
CREATE TABLE `ai_employee_auth` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `employee_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `has_permission` tinyint DEFAULT '1',
  `limit_type` varchar(20) DEFAULT 'none',
  `daily_limit` int DEFAULT '0',
  `monthly_limit` int DEFAULT '0',
  `custom_limit` int DEFAULT '0',
  `current_daily_usage` bigint DEFAULT '0',
  `current_monthly_usage` bigint DEFAULT '0',
  `reset_date` date DEFAULT NULL,
  `status` tinyint DEFAULT '1',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `capability_json` text COMMENT '员工级能力开关（vision/function_calling/json_mode 等，JSON）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_model` (`employee_id`,`model_id`),
  KEY `idx_employee_id` (`employee_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工模型权限表';

DROP TABLE IF EXISTS `ai_endpoint_approval`;
CREATE TABLE `ai_endpoint_approval` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `model_key` varchar(128) NOT NULL,
  `max_data_class` varchar(16) NOT NULL,
  `residency` varchar(16) NOT NULL DEFAULT 'external',
  `status` tinyint NOT NULL DEFAULT '1',
  `approved_by` varchar(64) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_endpoint_model` (`model_key`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='模型端点数据准入批准';

DROP TABLE IF EXISTS `ai_eval_case`;
CREATE TABLE `ai_eval_case` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dataset_key` varchar(64) NOT NULL,
  `case_no` varchar(32) NOT NULL,
  `system_code` varchar(32) NOT NULL DEFAULT 'common',
  `actor` varchar(64) DEFAULT NULL,
  `input_text` text NOT NULL,
  `expect_json` text,
  `must_pass` tinyint NOT NULL DEFAULT '1',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eval_case` (`dataset_key`,`case_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评测用例';

DROP TABLE IF EXISTS `ai_eval_run`;
CREATE TABLE `ai_eval_run` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dataset_key` varchar(64) NOT NULL,
  `app_key` varchar(64) DEFAULT NULL,
  `app_version` int DEFAULT NULL,
  `total` int NOT NULL DEFAULT '0',
  `passed` int NOT NULL DEFAULT '0',
  `failed` int NOT NULL DEFAULT '0',
  `detail_json` mediumtext,
  `started_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eval_run_dataset` (`dataset_key`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评测执行记录';

DROP TABLE IF EXISTS `ai_feedback`;
CREATE TABLE `ai_feedback` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_pk` bigint DEFAULT NULL,
  `message_id` varchar(64) NOT NULL,
  `user_id` bigint NOT NULL,
  `rating` tinyint NOT NULL COMMENT '1=赞 -1=踩',
  `reason` varchar(64) DEFAULT NULL COMMENT '答非所问/数据不对/太啰嗦/权限提示不清',
  `answer_preview` varchar(500) DEFAULT NULL,
  `tool_keys` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_feedback_user_message` (`user_id`,`message_id`),
  KEY `idx_ai_feedback_rating` (`rating`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 回答反馈';

DROP TABLE IF EXISTS `ai_glossary`;
CREATE TABLE `ai_glossary` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `domain` varchar(32) NOT NULL DEFAULT 'common',
  `term` varchar(128) NOT NULL,
  `aliases` varchar(512) DEFAULT NULL,
  `definition` text NOT NULL,
  `formula` varchar(512) DEFAULT NULL,
  `example` varchar(512) DEFAULT NULL,
  `prompt_visible` tinyint NOT NULL DEFAULT '1',
  `source` varchar(16) NOT NULL DEFAULT 'manual' COMMENT 'system/manual',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `sort` int NOT NULL DEFAULT '0',
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_glossary_domain_term` (`domain`,`term`),
  KEY `idx_glossary_prompt` (`prompt_visible`,`status`,`domain`,`sort`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 术语/口径字典';

DROP TABLE IF EXISTS `ai_grant_log`;
CREATE TABLE `ai_grant_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `flow_no` varchar(64) NOT NULL COMMENT 'OA 流程编号（幂等键）',
  `request_id` bigint DEFAULT NULL COMMENT 'OaRequest 主键',
  `user_id` bigint NOT NULL COMMENT '被授予员工 ID',
  `username` varchar(64) NOT NULL COMMENT '被授予员工账号',
  `grant_type` varchar(32) NOT NULL COMMENT 'model_auth / quota',
  `payload_json` text NOT NULL COMMENT '发放内容 JSON（模型 ID 列表 / 额度维度）',
  `status` varchar(16) NOT NULL DEFAULT 'GRANTED' COMMENT 'GRANTED/FAILED/REVOKED',
  `error_message` varchar(255) DEFAULT NULL COMMENT '失败原因',
  `operator` varchar(64) DEFAULT NULL COMMENT '操作人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grant_flow` (`flow_no`),
  KEY `idx_grant_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 使用申请审批发放幂等日志（防重放）';

DROP TABLE IF EXISTS `ai_guard_rule`;
CREATE TABLE `ai_guard_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rule_type` varchar(16) NOT NULL DEFAULT 'keyword' COMMENT 'keyword/regex',
  `pattern` varchar(500) NOT NULL COMMENT '关键词或正则',
  `action` varchar(16) NOT NULL DEFAULT 'warn' COMMENT 'block/warn/replace',
  `scope` varchar(16) NOT NULL DEFAULT 'both' COMMENT 'input/output/both',
  `replacement` varchar(200) DEFAULT NULL COMMENT 'replace 动作的替换文本',
  `enabled` tinyint NOT NULL DEFAULT '1',
  `remark` varchar(200) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `system_code` varchar(32) NOT NULL DEFAULT 'common',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_guard_rule` (`rule_type`,`pattern`,`scope`),
  KEY `idx_ai_guard_rule_enabled` (`enabled`,`scope`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 输入/输出合规护栏';

DROP TABLE IF EXISTS `ai_knowledge_acl`;
CREATE TABLE `ai_knowledge_acl` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `doc_id` bigint NOT NULL,
  `subject_type` varchar(16) NOT NULL,
  `subject_id` varchar(64) NOT NULL,
  `permission` varchar(16) NOT NULL DEFAULT 'read',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_acl_subject` (`doc_id`,`subject_type`,`subject_id`,`permission`),
  KEY `idx_acl_subject_lookup` (`subject_type`,`subject_id`,`permission`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='知识文档收窄 ACL';

DROP TABLE IF EXISTS `ai_knowledge_chunk`;
CREATE TABLE `ai_knowledge_chunk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `doc_id` bigint NOT NULL,
  `chunk_no` int NOT NULL DEFAULT '0',
  `content` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_knowledge_chunk` (`doc_id`,`chunk_no`),
  KEY `idx_ai_knowledge_chunk_doc` (`doc_id`),
  FULLTEXT KEY `ft_ai_knowledge_chunk` (`content`) /*!50100 WITH PARSER `ngram` */
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 知识库分块（检索单元）';

DROP TABLE IF EXISTS `ai_knowledge_doc`;
CREATE TABLE `ai_knowledge_doc` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL COMMENT '文档标题',
  `system_code` varchar(32) NOT NULL DEFAULT 'common' COMMENT '归属系统 common/rdm/finance/eam/hr',
  `source_type` varchar(32) NOT NULL DEFAULT 'manual' COMMENT 'manual/url/file',
  `content` mediumtext NOT NULL COMMENT '原文',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `chunk_count` int NOT NULL DEFAULT '0' COMMENT '分块数',
  `updated_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_knowledge_doc_status` (`system_code`,`status`,`updated_at`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 知识库文档';

DROP TABLE IF EXISTS `ai_model`;
CREATE TABLE `ai_model` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `provider_id` bigint DEFAULT NULL COMMENT '供应商 ID',
  `model_key` varchar(50) NOT NULL COMMENT '模型标识',
  `name` varchar(100) NOT NULL COMMENT '模型名称',
  `version` varchar(64) DEFAULT NULL COMMENT '模型版本号',
  `description` varchar(500) DEFAULT NULL COMMENT '模型描述',
  `api_compat` varchar(20) DEFAULT 'openai' COMMENT 'API 兼容格式',
  `modalities` varchar(100) DEFAULT 'text' COMMENT '支持模态',
  `vision_support` tinyint DEFAULT '0' COMMENT '视觉理解',
  `function_calling` tinyint DEFAULT '0' COMMENT '工具调用',
  `json_mode` tinyint DEFAULT '0' COMMENT 'JSON 模式',
  `streaming` tinyint DEFAULT '1' COMMENT '流式响应',
  `thinking_mode` tinyint DEFAULT '0' COMMENT '思考模式',
  `type` varchar(50) DEFAULT 'chat' COMMENT '模型类型',
  `deploy_type` varchar(20) NOT NULL DEFAULT 'cloud' COMMENT '部署类型',
  `context_window` int DEFAULT '0' COMMENT '上下文窗口',
  `max_output_tokens` int DEFAULT '0' COMMENT '最大输出 tokens',
  `input_price` decimal(10,6) DEFAULT '0.000000' COMMENT '输入价格',
  `output_price` decimal(10,6) DEFAULT '0.000000' COMMENT '输出价格',
  `cached_input_price` decimal(10,4) DEFAULT NULL COMMENT '缓存命中输入价',
  `currency` varchar(10) DEFAULT 'CNY' COMMENT '计费币种',
  `concurrency_limit` int DEFAULT NULL COMMENT '并发限制',
  `status` tinyint DEFAULT '1' COMMENT '状态',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `updated_by` varchar(50) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_key_version` (`provider_id`,`model_key`,`version`),
  KEY `idx_provider_id` (`provider_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 模型表';

DROP TABLE IF EXISTS `ai_position_model_mapping`;
CREATE TABLE `ai_position_model_mapping` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `position_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `permission_level` varchar(20) DEFAULT 'full',
  `daily_limit` int DEFAULT '0',
  `monthly_limit` int DEFAULT '0',
  `priority` int DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_position_model` (`position_id`,`model_id`),
  KEY `idx_position_id` (`position_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='职位模型权限映射表';

DROP TABLE IF EXISTS `ai_prompt_profile`;
CREATE TABLE `ai_prompt_profile` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `profile_key` varchar(64) NOT NULL COMMENT 'global / rdm / finance / eam / hr',
  `name` varchar(128) NOT NULL,
  `domain` varchar(32) NOT NULL DEFAULT 'global' COMMENT 'global 或系统编码',
  `response_skeleton` text NOT NULL COMMENT '回答骨架（Markdown 指令）',
  `extra_rules` text COMMENT '领域补充规则',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/active/archived',
  `active_flag` tinyint DEFAULT NULL COMMENT 'active 行=1，其余 NULL',
  `version` int NOT NULL DEFAULT '1',
  `published_at` datetime DEFAULT NULL,
  `published_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_profile_version` (`profile_key`,`version`),
  UNIQUE KEY `uk_profile_active` (`profile_key`,`active_flag`),
  KEY `idx_profile_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手回答骨架/领域规则（版本化）';

DROP TABLE IF EXISTS `ai_provider`;
CREATE TABLE `ai_provider` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `provider_key` varchar(50) NOT NULL COMMENT '供应商标识',
  `name` varchar(100) NOT NULL COMMENT '供应商名称',
  `description` varchar(500) DEFAULT NULL COMMENT '供应商描述',
  `api_base_url` varchar(500) DEFAULT NULL COMMENT 'API 基础 URL',
  `api_key` varchar(500) DEFAULT NULL COMMENT 'API Key(加密存储)',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=启用 0=停用',
  `is_default` tinyint DEFAULT '0' COMMENT '是否默认供应商',
  `config_json` text COMMENT '配置信息 JSON',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `provider_key` (`provider_key`),
  KEY `idx_provider_key` (`provider_key`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 供应商表';

DROP TABLE IF EXISTS `ai_push_template`;
CREATE TABLE `ai_push_template` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `template_key` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `target_type` varchar(16) NOT NULL COMMENT 'group/person',
  `title_tpl` varchar(255) NOT NULL,
  `content_tpl` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `system_code` varchar(32) NOT NULL DEFAULT 'common',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_push_template_key` (`template_key`),
  KEY `idx_push_template_target` (`target_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 推送模板（项目进度群/个人两版）';

DROP TABLE IF EXISTS `ai_quick_prompt`;
CREATE TABLE `ai_quick_prompt` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `domain` varchar(32) NOT NULL DEFAULT 'common',
  `system_code` varchar(32) DEFAULT NULL,
  `role_code` varchar(64) DEFAULT NULL,
  `question` varchar(512) NOT NULL,
  `sort` int NOT NULL DEFAULT '0',
  `enabled` tinyint NOT NULL DEFAULT '1',
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quick_prompt_scope` (`system_code`,`domain`,`enabled`,`sort`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手快捷提问';

DROP TABLE IF EXISTS `ai_quota_config`;
CREATE TABLE `ai_quota_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `quota_type` varchar(20) NOT NULL,
  `target_id` bigint NOT NULL,
  `model_id` bigint DEFAULT NULL,
  `daily_quota` int DEFAULT '0',
  `monthly_quota` int DEFAULT '0',
  `used_today` bigint DEFAULT '0',
  `used_month` bigint DEFAULT '0',
  `quota_period_start` date DEFAULT NULL,
  `quota_period_end` date DEFAULT NULL,
  `auto_reset` tinyint DEFAULT '1',
  `reset_day_of_month` tinyint DEFAULT '1',
  `status` tinyint DEFAULT '1',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人(姓名)',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quota_target_model` (`quota_type`,`target_id`,`model_id`),
  KEY `idx_quota_type_id` (`quota_type`,`target_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门/员工额度配置表';

DROP TABLE IF EXISTS `ai_quota_override`;
CREATE TABLE `ai_quota_override` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `user_id` bigint NOT NULL COMMENT '員工ID (sys_user.id)',
  `username` varchar(64) NOT NULL COMMENT '員工賬號（冗餘，用量聚合鍵）',
  `source_request_id` bigint DEFAULT NULL COMMENT '來源申請ID (ai_access_request.id)',
  `model_id` bigint DEFAULT NULL COMMENT '限定模型ID（NULL=全部模型）',
  `quota_type` varchar(32) NOT NULL DEFAULT 'token' COMMENT '限額類型: token/request',
  `quota_value` decimal(18,2) NOT NULL COMMENT '限額值',
  `quota_period` varchar(16) NOT NULL DEFAULT 'daily' COMMENT '限額週期: daily/monthly',
  `effective_type` varchar(16) NOT NULL DEFAULT 'permanent' COMMENT '生效類型: permanent=永久 temporary=臨時',
  `effective_at` datetime DEFAULT NULL COMMENT '生效時間',
  `expire_at` datetime DEFAULT NULL COMMENT '臨時額度到期時間（NULL=永久）',
  `over_limit_action` varchar(16) DEFAULT NULL COMMENT '超閾動作: reject/approve/downgrade',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '狀態: 1=啟用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除: 0=正常 1=已刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_request` (`user_id`,`source_request_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expire` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='員工獨立額度授予表（審批下發）';

DROP TABLE IF EXISTS `ai_release_snapshot`;
CREATE TABLE `ai_release_snapshot` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app_key` varchar(64) NOT NULL,
  `app_version` int NOT NULL,
  `snapshot_json` mediumtext NOT NULL,
  `released_by` varchar(64) DEFAULT NULL,
  `released_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rolled_back_at` datetime DEFAULT NULL,
  `note` varchar(512) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_release` (`app_key`,`app_version`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='不可变发布快照';

DROP TABLE IF EXISTS `ai_role_model_mapping`;
CREATE TABLE `ai_role_model_mapping` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `permission_level` varchar(20) DEFAULT 'full',
  `daily_limit` int DEFAULT '0',
  `monthly_limit` int DEFAULT '0',
  `priority` int DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_model` (`role_id`,`model_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色模型权限映射表';

DROP TABLE IF EXISTS `ai_role_quota_policy`;
CREATE TABLE `ai_role_quota_policy` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_quota 生成）',
  `role_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名稱',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '角色描述',
  `user_ids` json DEFAULT NULL COMMENT '綁定員工ID數組',
  `user_names` json DEFAULT NULL COMMENT '綁定員工姓名數組（冗餘展示）',
  `total_employee_count` int DEFAULT '0' COMMENT '綁定人數',
  `period` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額周期: daily/monthly',
  `quota_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限額類型: token/cost/request',
  `quota_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '限額值',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '計價幣種',
  `soft_threshold` int NOT NULL DEFAULT '80' COMMENT '軟限額提醒閾值(%)',
  `over_limit_action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reject' COMMENT '超額動作: reject/approve/downgrade',
  `downgrade_model_id` bigint DEFAULT NULL COMMENT '降級目標模型ID',
  `downgrade_exempt_quota` decimal(20,2) DEFAULT NULL COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，與主額度分配方式一致）',
  `used_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '本期已用量',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '狀態: 1=啟用 0=停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  KEY `idx_role_name` (`role_name`),
  KEY `idx_status` (`status`),
  KEY `idx_quota_type` (`quota_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='員工角色額度策略';

DROP TABLE IF EXISTS `ai_run`;
CREATE TABLE `ai_run` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `run_no` varchar(48) NOT NULL,
  `app_key` varchar(64) DEFAULT NULL,
  `app_version` int DEFAULT NULL,
  `requester` varchar(64) NOT NULL,
  `system_code` varchar(32) NOT NULL DEFAULT 'common',
  `conversation_pk` bigint DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'queued',
  `idempotency_key` varchar(96) NOT NULL,
  `input_json` mediumtext,
  `result_json` mediumtext,
  `error_kind` varchar(64) DEFAULT NULL,
  `cancel_requested` tinyint NOT NULL DEFAULT '0',
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lease_owner` varchar(96) DEFAULT NULL,
  `lease_expires_at` datetime DEFAULT NULL,
  `attempt` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_run_no` (`run_no`),
  UNIQUE KEY `uk_run_idem` (`idempotency_key`),
  KEY `idx_run_status` (`status`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='持久化运行';

DROP TABLE IF EXISTS `ai_run_step`;
CREATE TABLE `ai_run_step` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `run_id` bigint NOT NULL,
  `step_no` int NOT NULL,
  `step_type` varchar(32) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'running',
  `tool_key` varchar(64) DEFAULT NULL,
  `proposal_id` bigint DEFAULT NULL,
  `detail` varchar(512) DEFAULT NULL,
  `elapsed_ms` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_run_step` (`run_id`,`step_no`),
  KEY `idx_step_status` (`run_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='运行步骤检查点';

DROP TABLE IF EXISTS `ai_runtime_setting`;
CREATE TABLE `ai_runtime_setting` (
  `setting_key` varchar(64) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `value_type` varchar(16) NOT NULL DEFAULT 'int' COMMENT 'int/bool/string',
  `remark` varchar(255) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手运行参数（运营可调，安全阈值不在其中）';

DROP TABLE IF EXISTS `ai_tool_exec_log`;
CREATE TABLE `ai_tool_exec_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tool_key` varchar(64) NOT NULL COMMENT '工具标识',
  `caller` varchar(64) DEFAULT NULL COMMENT '调用账号（JWT）',
  `conversation_id` varchar(64) DEFAULT NULL COMMENT '关联会话编号',
  `args_digest` varchar(255) DEFAULT NULL COMMENT '参数摘要（SHA-256 前 16 位，不落敏感原文）',
  `decision` varchar(16) NOT NULL COMMENT 'allow/reject/approval_required',
  `reject_reason` varchar(255) DEFAULT NULL COMMENT '被拒原因',
  `elapsed_ms` bigint DEFAULT NULL COMMENT '执行耗时',
  `success` tinyint DEFAULT NULL COMMENT '1=成功 0=失败（仅 decision=allow 时有值）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_tool_exec_key_time` (`tool_key`,`created_at`),
  KEY `idx_tool_exec_caller` (`caller`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 工具执行审计日志（V0 治理底座：记录 caller/decision/耗时）';

DROP TABLE IF EXISTS `ai_tool_policy`;
CREATE TABLE `ai_tool_policy` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tool_key` varchar(64) NOT NULL COMMENT '工具唯一标识（mcp_tool.tool_key 对应）',
  `enabled` tinyint NOT NULL DEFAULT '0' COMMENT '1=允许执行 0=禁止执行（默认拒绝）',
  `risk_level` varchar(8) NOT NULL DEFAULT 'low' COMMENT 'low/medium/high',
  `require_approval` tinyint NOT NULL DEFAULT '0' COMMENT '1=调用需审批凭证 0=仅需工具级授权',
  `data_scope_json` text COMMENT '数据范围白名单 JSON（{"groupCodes":[],"brand":[],"fields":[]}）',
  `remark` varchar(255) DEFAULT NULL COMMENT '策略备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_tool_policy_key` (`tool_key`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 工具执行授权策略（V0 治理底座：工具级放行/风险/审批/数据范围）';

DROP TABLE IF EXISTS `ai_tool_registry`;
CREATE TABLE `ai_tool_registry` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tool_key` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `category` varchar(50) DEFAULT 'general',
  `version` varchar(20) DEFAULT '1.0.0',
  `author` varchar(100) DEFAULT NULL,
  `icon` varchar(100) DEFAULT NULL,
  `api_endpoint` varchar(500) DEFAULT NULL,
  `config_schema` text,
  `is_enabled` tinyint DEFAULT '1',
  `sort_order` int DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `deleted` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tool_key` (`tool_key`),
  KEY `idx_category` (`category`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 工具注册表';

DROP TABLE IF EXISTS `ai_usage_log`;
CREATE TABLE `ai_usage_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `target_type` varchar(20) NOT NULL,
  `target_id` bigint NOT NULL,
  `model_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `request_tokens` int DEFAULT '0',
  `response_tokens` int DEFAULT '0',
  `total_tokens` int DEFAULT '0',
  `cost_amount` decimal(10,6) DEFAULT '0.000000',
  `prompt_text` text,
  `error_message` varchar(500) DEFAULT NULL,
  `duration_ms` int DEFAULT '0',
  `request_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_target_type_id` (`target_type`,`target_id`),
  KEY `idx_model_id` (`model_id`),
  KEY `idx_request_time` (`request_time`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 用量日志表';

DROP TABLE IF EXISTS `ai_user_memory`;
CREATE TABLE `ai_user_memory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '所属员工 sys_user.id',
  `memory_type` varchar(16) NOT NULL DEFAULT 'preference' COMMENT 'preference/fact/instruction',
  `content` varchar(500) NOT NULL COMMENT '用户可读的记忆内容',
  `content_hash` char(64) NOT NULL COMMENT 'SHA-256(content)，用于同用户去重',
  `source` varchar(16) NOT NULL DEFAULT 'explicit' COMMENT 'explicit/auto',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_memory` (`user_id`,`content_hash`),
  KEY `idx_user_memory_active` (`user_id`,`status`,`updated_at`),
  FULLTEXT KEY `ft_ai_user_memory_content` (`content`) /*!50100 WITH PARSER `ngram` */
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手长期记忆（按用户隔离）';

DROP TABLE IF EXISTS `att_day_summary`;
CREATE TABLE `att_day_summary` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `work_date` date NOT NULL COMMENT '考勤日期',
  `group_id` bigint NOT NULL COMMENT '考勤组 att_group.id',
  `group_name` varchar(80) NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门快照（按组内主部门落列，供分部门统计）',
  `dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `should_count` int NOT NULL DEFAULT '0' COMMENT '應出勤人数（排班 ∪ 成员，扣除休息与未排班）',
  `actual_count` int NOT NULL DEFAULT '0' COMMENT '實出勤人数',
  `late_count` int NOT NULL DEFAULT '0' COMMENT '遲到人次',
  `early_count` int NOT NULL DEFAULT '0' COMMENT '早退人次',
  `missing_count` int NOT NULL DEFAULT '0' COMMENT '缺卡人次',
  `absent_count` int NOT NULL DEFAULT '0' COMMENT '曠工人次',
  `leave_count` int NOT NULL DEFAULT '0' COMMENT '請假人次（读 hr_leave_request 审批通过结论）',
  `overtime_hours` decimal(7,1) NOT NULL DEFAULT '0.0' COMMENT '加班工时合计（小时）',
  `attend_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '出勤率% = 实出勤 / 应出勤',
  `calculated_at` datetime DEFAULT NULL COMMENT '本次汇总生成时间（重算的审计凭据）',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_date_group` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(date_format(`work_date`,_utf8mb4'%Y%m%d'),_utf8mb4'|',`group_id`) else NULL end)) STORED COMMENT '软删感知唯一作用域：一天一组一条结论（重算走 UPSERT，不允许长出第二行）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_day_active_date_group` (`active_date_group`),
  KEY `idx_day_date` (`work_date`,`deleted`),
  KEY `idx_day_dept` (`dept_id`,`work_date`,`deleted`),
  KEY `fk_day_group` (`group_id`),
  CONSTRAINT `fk_day_group` FOREIGN KEY (`group_id`) REFERENCES `att_group` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤日报（日期×考勤组结论）';

DROP TABLE IF EXISTS `att_exception`;
CREATE TABLE `att_exception` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` bigint NOT NULL COMMENT '当事人 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门快照',
  `dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `group_id` bigint DEFAULT NULL COMMENT '考勤组快照',
  `group_name` varchar(80) NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
  `work_date` date NOT NULL COMMENT '考勤日期',
  `exception_type` tinyint NOT NULL COMMENT '类型：1=遲到 2=早退 3=缺卡 4=曠工 5=未排班',
  `detail` varchar(200) NOT NULL DEFAULT '' COMMENT '量化描述，如「遲到 23 分鐘」',
  `late_minutes` int NOT NULL DEFAULT '0' COMMENT '迟到/早退分钟数，供薪酬扣减口径引用',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1=待處理 2=已補卡 3=已請假抵扣 4=已加班抵扣 5=已確認',
  `flow_no` varchar(64) NOT NULL DEFAULT '' COMMENT '关联 OA 流程编号（biz_oa_request.flow_no）',
  `oa_request_id` bigint DEFAULT NULL COMMENT '关联 OA 单据 ID，审批回调按此定位',
  `handler` varchar(64) NOT NULL DEFAULT '' COMMENT '处理人姓名',
  `handled_at` datetime DEFAULT NULL COMMENT '处理时间',
  `handle_remark` varchar(200) DEFAULT NULL COMMENT '处理说明（确认原因/补卡原因）',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_user_date_type` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`user_id`,_utf8mb4'|',date_format(`work_date`,_utf8mb4'%Y%m%d'),_utf8mb4'|',`exception_type`) else NULL end)) STORED COMMENT '软删感知唯一作用域：同人同日同类型只留一条（重算时更新而不是追加）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exception_active_user_date_type` (`active_user_date_type`),
  KEY `idx_exception_status` (`status`,`work_date`,`deleted`),
  KEY `idx_exception_user_date` (`user_id`,`work_date`,`deleted`),
  KEY `idx_exception_group_date` (`group_id`,`work_date`,`deleted`),
  KEY `idx_exception_oa` (`oa_request_id`)
) ENGINE=InnoDB AUTO_INCREMENT=229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤异常与处理状态';

DROP TABLE IF EXISTS `att_group`;
CREATE TABLE `att_group` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `group_no` varchar(32) NOT NULL COMMENT '考勤组编号（AG+YYYYMM+4位，系统生成，稳定身份）',
  `group_name` varchar(80) NOT NULL COMMENT '考勤组名称',
  `group_type` tinyint NOT NULL DEFAULT '1' COMMENT '考勤制度：1=固定班制 2=排班制 3=自由工時',
  `scope_type` tinyint NOT NULL DEFAULT '1' COMMENT '成员范围口径：1=按部門 2=按門店 3=按名單（仅决定管理页录入方式，判定以成员表为准）',
  `scope_text` varchar(255) NOT NULL DEFAULT '' COMMENT '成员范围描述快照（列表展示用，不参与判定）',
  `work_place` varchar(120) NOT NULL DEFAULT '' COMMENT '考勤地；多门店场景必须显式定义，不能靠部门树推导',
  `shift_id` bigint DEFAULT NULL COMMENT '默认班次（固定班制必填；自由工时可为空）',
  `late_grace_min` int NOT NULL DEFAULT '5' COMMENT '迟到宽限（分钟）',
  `early_grace_min` int NOT NULL DEFAULT '0' COMMENT '早退宽限（分钟）',
  `punch_sources` varchar(32) NOT NULL DEFAULT '1' COMMENT '已开通打卡来源，逗号分隔：1=釘釘同步 2=手工導入',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后该组成员当日不产生考勤结论',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_no` varchar(32) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `group_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：考勤组编号',
  `active_name` varchar(80) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `group_name` else NULL end)) STORED COMMENT '软删感知唯一作用域：考勤组名称（同名两组会让授权与报表口径无法区分）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_active_no` (`active_no`),
  UNIQUE KEY `uk_group_active_name` (`active_name`),
  KEY `idx_group_status` (`status`,`deleted`),
  KEY `fk_group_shift` (`shift_id`),
  CONSTRAINT `fk_group_shift` FOREIGN KEY (`shift_id`) REFERENCES `att_shift` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤组（考勤结论的最小计算单位）';

DROP TABLE IF EXISTS `att_group_member`;
CREATE TABLE `att_group_member` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `group_id` bigint NOT NULL COMMENT '所属考勤组 att_group.id',
  `user_id` bigint NOT NULL COMMENT '成员 sys_user.id（跨模块引用，只建索引不建 FK）',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门快照 sys_department.id',
  `dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照：改名不改历史',
  `valid_from` date NOT NULL COMMENT '生效起（含）',
  `valid_to` date DEFAULT NULL COMMENT '生效止（含）；NULL 表示当前仍生效',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_scope` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`group_id`,_utf8mb4'|',`user_id`,_utf8mb4'|',date_format(`valid_from`,_utf8mb4'%Y%m%d')) else NULL end)) STORED COMMENT '软删感知唯一作用域：同一组同人同起始日只能有一条',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_active_scope` (`active_scope`),
  KEY `idx_member_user_date` (`user_id`,`valid_from`,`valid_to`,`deleted`),
  KEY `idx_member_group_date` (`group_id`,`valid_from`,`valid_to`,`deleted`),
  CONSTRAINT `fk_member_group` FOREIGN KEY (`group_id`) REFERENCES `att_group` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤组成员（含生效区间）';

DROP TABLE IF EXISTS `att_holiday`;
CREATE TABLE `att_holiday` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `holiday_date` date NOT NULL COMMENT '日期',
  `holiday_name` varchar(80) NOT NULL COMMENT '名称，如「國慶節」',
  `holiday_type` tinyint NOT NULL COMMENT '类型：1=法定節假日 2=調休上班 3=公司假期',
  `year_no` int NOT NULL COMMENT '所属年度（冗余列，按年批量查询与年度导入去重）',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后该日回归正常工时判定',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_date` date GENERATED ALWAYS AS ((case when (`deleted` = 0) then `holiday_date` else NULL end)) STORED COMMENT '软删感知唯一作用域：一天只能有一条日历结论',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_holiday_active_date` (`active_date`),
  KEY `idx_holiday_year` (`year_no`,`holiday_type`,`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤节假日日历';

DROP TABLE IF EXISTS `att_monthly_summary`;
CREATE TABLE `att_monthly_summary` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `stat_month` char(7) NOT NULL COMMENT '所属月份 YYYY-MM',
  `batch_no` varchar(32) NOT NULL DEFAULT '' COMMENT '批次号（AT+YYYYMM+4位），冻结时生成，供薪酬侧对账引用',
  `user_id` bigint NOT NULL COMMENT '员工 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门快照',
  `dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `group_id` bigint DEFAULT NULL COMMENT '考勤组快照',
  `group_name` varchar(80) NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
  `should_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '應出勤天数',
  `actual_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '實出勤天数',
  `late_times` int NOT NULL DEFAULT '0' COMMENT '遲到次数',
  `late_minutes` int NOT NULL DEFAULT '0' COMMENT '遲到分钟合计',
  `early_times` int NOT NULL DEFAULT '0' COMMENT '早退次数',
  `missing_times` int NOT NULL DEFAULT '0' COMMENT '缺卡次数',
  `absent_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '曠工天数',
  `annual_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '年假天数',
  `sick_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '病假天数',
  `personal_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '事假天数',
  `workday_ot_hours` decimal(7,1) NOT NULL DEFAULT '0.0' COMMENT '工作日加班工时',
  `restday_ot_hours` decimal(7,1) NOT NULL DEFAULT '0.0' COMMENT '休息日加班工时',
  `holiday_ot_hours` decimal(7,1) NOT NULL DEFAULT '0.0' COMMENT '法定節假日加班工时',
  `attend_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '出勤率%',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态：draft=待確認 frozen=已凍結 synced=已同步薪酬',
  `frozen_by` varchar(64) NOT NULL DEFAULT '' COMMENT '冻结人',
  `frozen_at` datetime DEFAULT NULL COMMENT '冻结时间',
  `synced_at` datetime DEFAULT NULL COMMENT '同步薪酬时间',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_month_user` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`stat_month`,_utf8mb4'|',`user_id`) else NULL end)) STORED COMMENT '软删感知唯一作用域：一人一月一条（重复生成会让薪酬重复取数）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_monthly_active_month_user` (`active_month_user`),
  KEY `idx_monthly_status` (`stat_month`,`status`,`deleted`),
  KEY `idx_monthly_dept` (`dept_id`,`stat_month`,`deleted`),
  KEY `idx_monthly_batch` (`batch_no`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='月度考勤汇总（薪酬取数出口）';

DROP TABLE IF EXISTS `att_punch_log`;
CREATE TABLE `att_punch_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` bigint NOT NULL COMMENT '打卡人 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `group_id` bigint DEFAULT NULL COMMENT '当时归属考勤组（可空：无组人员只存事实不出结论）',
  `work_date` date NOT NULL COMMENT '考勤日期（写入时按班次跨天规则定死，不由 punch_at 日期推导）',
  `punch_at` datetime NOT NULL COMMENT '打卡时刻',
  `punch_type` tinyint NOT NULL COMMENT '卡别：1=上班卡 2=下班卡',
  `source` tinyint NOT NULL DEFAULT '1' COMMENT '来源：1=釘釘同步 2=手工導入',
  `location` varchar(200) NOT NULL DEFAULT '' COMMENT '打卡地点文本',
  `raw_ref` varchar(80) NOT NULL DEFAULT '' COMMENT '外部原始记录 ID（钉钉 record id），用于同步去重与追溯',
  `result` tinyint NOT NULL DEFAULT '1' COMMENT '判定：1=正常 2=遲到 3=早退 4=外勤 5=無效卡',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人（同步任务写 system）',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_idem` varchar(64) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`user_id`,_utf8mb4'|',date_format(`punch_at`,_utf8mb4'%Y%m%d%H%i%s'),_utf8mb4'|',`source`) else NULL end)) STORED COMMENT '软删感知唯一作用域：同人同时刻同来源只算一次打卡（同步重跑与重复导入的幂等键）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_punch_active_idem` (`active_idem`),
  KEY `idx_punch_user_date` (`user_id`,`work_date`,`deleted`),
  KEY `idx_punch_date_group` (`work_date`,`group_id`,`deleted`),
  KEY `idx_punch_raw_ref` (`raw_ref`),
  KEY `idx_punch_group_date` (`group_id`,`work_date`,`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤打卡流水（只读账本）';

DROP TABLE IF EXISTS `att_schedule`;
CREATE TABLE `att_schedule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `group_id` bigint NOT NULL COMMENT '考勤组 att_group.id',
  `user_id` bigint NOT NULL COMMENT '被排班人 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `work_date` date NOT NULL COMMENT '考勤日期',
  `shift_id` bigint DEFAULT NULL COMMENT '班次 att_shift.id；NULL 表示当日休息',
  `source` tinyint NOT NULL DEFAULT '1' COMMENT '来源：1=手工排班 2=批量複製 3=導入',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_user_date` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`user_id`,_utf8mb4'|',date_format(`work_date`,_utf8mb4'%Y%m%d')) else NULL end)) STORED COMMENT '软删感知唯一作用域：一人一天只能有一条排班结论（多解会让汇总取错班次）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schedule_active_user_date` (`active_user_date`),
  KEY `idx_schedule_group_date` (`group_id`,`work_date`,`deleted`),
  KEY `idx_schedule_date` (`work_date`,`deleted`),
  KEY `fk_schedule_shift` (`shift_id`),
  CONSTRAINT `fk_schedule_group` FOREIGN KEY (`group_id`) REFERENCES `att_group` (`id`),
  CONSTRAINT `fk_schedule_shift` FOREIGN KEY (`shift_id`) REFERENCES `att_shift` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤排班（员工×日期×班次）';

DROP TABLE IF EXISTS `att_shift`;
CREATE TABLE `att_shift` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shift_code` varchar(20) NOT NULL COMMENT '班次编码（SH+2~3位，人工录入，唯一）',
  `shift_name` varchar(80) NOT NULL COMMENT '班次名称，如「門店早班 08:00-17:00」',
  `on_time` time DEFAULT NULL COMMENT '上班时间；弹性班次可为空',
  `off_time` time DEFAULT NULL COMMENT '下班时间；弹性班次可为空',
  `cross_day` tinyint NOT NULL DEFAULT '0' COMMENT '下班是否跨天：1=跨天（夜班），决定 work_date 归属',
  `work_hours` decimal(4,1) NOT NULL DEFAULT '8.0' COMMENT '标准工时（小时），加班与缺勤折算的基准',
  `rest_start` time DEFAULT NULL COMMENT '休息开始时刻，用于从在勤时长里扣除非工时',
  `rest_end` time DEFAULT NULL COMMENT '休息结束时刻',
  `flex_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否弹性班次：1=弹性（不绑定上下班时刻）',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后不可被新排班引用',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_code` varchar(20) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `shift_code` else NULL end)) STORED COMMENT '软删感知唯一作用域：班次编码',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shift_active_code` (`active_code`),
  KEY `idx_shift_status` (`status`,`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤班次（时间基准）';

DROP TABLE IF EXISTS `biz_activity`;
CREATE TABLE `biz_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `activity_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活動ID（業務編號）',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活動名稱',
  `status` int NOT NULL DEFAULT '1' COMMENT '活動狀態: 1=啟動 2=停用',
  `start_time` datetime DEFAULT NULL COMMENT '活動開始時間',
  `end_time` datetime DEFAULT NULL COMMENT '活動結束時間',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '備註',
  `deleted` int NOT NULL DEFAULT '0' COMMENT '邏輯刪除: 0=正常 1=已刪除',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_no` (`activity_no`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系統活動管理';

DROP TABLE IF EXISTS `biz_ad_algorithm`;
CREATE TABLE `biz_ad_algorithm` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `algo_code` varchar(32) NOT NULL COMMENT '算法编码(系统生成, 如 ALG_STAR_001)',
  `algo_name` varchar(128) NOT NULL COMMENT '算法名称',
  `algo_type` tinyint NOT NULL COMMENT '算法类型: 1=无敌星星 2=新店广告 3=盘活复苏 4=独家商家 ...',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee=闪蜂 / mFood',
  `channel` tinyint DEFAULT NULL COMMENT '业务频道: 1=大首页 2=外卖频道 3=超市百货 4=团购到店',
  `placement_interface` tinyint DEFAULT NULL COMMENT '投放界面: 1=大首页-Feed 2=外卖频道-Feed 3=超市频道-Feed 4=团购频道-Feed',
  `slot_count` int DEFAULT NULL COMMENT '坑位数(展示位数量, 不作为售卖维度)',
  `params` json DEFAULT NULL COMMENT '各算法差异化参数(JSON)',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_algorithm_code` (`algo_code`),
  KEY `idx_ad_algorithm_type` (`algo_type`),
  KEY `idx_ad_algorithm_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广算法登记表';

DROP TABLE IF EXISTS `biz_ad_cell_lock`;
CREATE TABLE `biz_ad_cell_lock` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID (biz_ad_algorithm.id)',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `region` tinyint NOT NULL COMMENT '商圈',
  `meal_slot` varchar(16) NOT NULL COMMENT '餐段时段: breakfast/lunch/afternoon/dinner/supper',
  `group_code` varchar(64) NOT NULL COMMENT '锁定商家集团编码',
  `store_code` varchar(64) DEFAULT NULL COMMENT '锁定门店编码',
  `expire_at` datetime NOT NULL COMMENT '锁释放时间(加购时间+60秒)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_cell_lock` (`algo_id`,`biz_date`,`region`,`meal_slot`,`group_code`),
  KEY `idx_ad_cell_lock_expire` (`expire_at`)
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星格子加购锁(60秒)';

DROP TABLE IF EXISTS `biz_ad_cell_quota`;
CREATE TABLE `biz_ad_cell_quota` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `module` varchar(20) NOT NULL COMMENT '广告模块: star(无敌星星)/revive(盘活复苏)',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `region` int NOT NULL DEFAULT '0' COMMENT '商圈',
  `meal_slot` varchar(20) NOT NULL DEFAULT '' COMMENT '餐段时段, 无餐段维度的模块存空串',
  `taken` int NOT NULL DEFAULT '0' COMMENT '已占用个数(活跃明细数)',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module_cell` (`module`,`biz_date`,`region`,`meal_slot`)
) ENGINE=InnoDB AUTO_INCREMENT=710 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='广告格子占用计数器(防并发超卖)';

DROP TABLE IF EXISTS `biz_ad_day_lock_revive`;
CREATE TABLE `biz_ad_day_lock_revive` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID (biz_ad_algorithm.id)',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `region` tinyint NOT NULL COMMENT '商圈',
  `group_code` varchar(64) NOT NULL COMMENT '锁定商家集团编码',
  `store_code` varchar(64) DEFAULT NULL COMMENT '锁定门店编码',
  `expire_at` datetime NOT NULL COMMENT '锁释放时间(加购时间+60秒)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_day_lock_revive` (`algo_id`,`biz_date`,`region`,`group_code`),
  KEY `idx_ad_day_lock_revive_expire` (`expire_at`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏加购锁(60秒)';

DROP TABLE IF EXISTS `biz_ad_order`;
CREATE TABLE `biz_ad_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号: 按编号生成规则 ad_order_* 生成（DDxx + 年月日 + 4位自增序号，如 DDXD202608120000）',
  `algo_type` tinyint NOT NULL COMMENT '算法类型快照',
  `algo_id` bigint NOT NULL COMMENT '算法ID (关联 biz_ad_algorithm.id)',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `algo_code` varchar(64) DEFAULT NULL COMMENT '算法编码快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee / mFood',
  `channel` tinyint DEFAULT NULL COMMENT '业务频道快照',
  `group_code` varchar(32) NOT NULL COMMENT '购买集团ID (关联 biz_merchant_group.group_code)',
  `group_name` varchar(128) DEFAULT NULL COMMENT '集团名称快照',
  `store_code` varchar(32) DEFAULT NULL COMMENT '购买门店ID',
  `store_name` varchar(128) DEFAULT NULL COMMENT '门店名称快照',
  `bd_emp_id` varchar(64) DEFAULT NULL COMMENT '归属BD',
  `operator_type` tinyint DEFAULT NULL COMMENT '下单人类型: 1=商家 2=业务人员',
  `operator_id` varchar(64) DEFAULT NULL COMMENT '下单人ID (商家=门店ID, 业务人员=工号)',
  `operator_name` varchar(64) DEFAULT NULL COMMENT '下单人姓名',
  `item_count` int NOT NULL DEFAULT '0' COMMENT '明细格子数',
  `original_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '原价合计',
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '折扣优惠金额',
  `actual_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付金额(推广金扣款)',
  `refund_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额(按取消扣费梯度)',
  `gift_days` int DEFAULT '0' COMMENT '赠送天数抵扣快照',
  `gift_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '赠送抵扣金额快照',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '订单状态: 1=待推广 2=推广中 3=已推广 4=已退款 5=已取消',
  `order_time` datetime DEFAULT NULL COMMENT '下单时间',
  `pay_time` datetime DEFAULT NULL COMMENT '支付时间',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '关联财务明细编号',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `refund_enabled` int DEFAULT NULL COMMENT '退款开关快照: 1=允许退款 2=不允许',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_order_no` (`order_no`),
  KEY `idx_ad_order_group` (`group_code`),
  KEY `idx_ad_order_store` (`store_code`),
  KEY `idx_ad_order_algo` (`algo_id`),
  KEY `idx_ad_order_status` (`status`),
  KEY `idx_ad_order_time` (`order_time`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广广告订单主表';

DROP TABLE IF EXISTS `biz_ad_order_item_hot`;
CREATE TABLE `biz_ad_order_item_hot` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `skin_name` varchar(64) NOT NULL COMMENT '皮肤名称快照',
  `original_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '格子原价(皮肤日单价)',
  `sale_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付分摊价(折扣后)',
  `refund_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额(取消扣费梯度)',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_hot_order` (`order_id`),
  KEY `idx_ad_item_hot_cell` (`biz_date`,`skin_name`),
  KEY `idx_ad_item_hot_status` (`delivery_status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家订单明细表(皮肤x日期)';

DROP TABLE IF EXISTS `biz_ad_order_item_new_store`;
CREATE TABLE `biz_ad_order_item_new_store` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_ns_order` (`order_id`),
  KEY `idx_ad_item_ns_cell` (`biz_date`),
  KEY `idx_ad_item_ns_status` (`delivery_status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='新店广告订单明细表';

DROP TABLE IF EXISTS `biz_ad_order_item_revive`;
CREATE TABLE `biz_ad_order_item_revive` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `region` tinyint NOT NULL COMMENT '商圈',
  `original_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '格子原价(商圈日单价)',
  `sale_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付分摊价(折扣后)',
  `refund_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额(取消扣费梯度)',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_revive_order` (`order_id`),
  KEY `idx_ad_item_revive_cell` (`biz_date`,`region`),
  KEY `idx_ad_item_revive_status` (`delivery_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏订单明细表(按天库存)';

DROP TABLE IF EXISTS `biz_ad_order_item_star`;
CREATE TABLE `biz_ad_order_item_star` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `region` tinyint NOT NULL COMMENT '商圈',
  `meal_slot` varchar(16) NOT NULL COMMENT '餐段时段: breakfast/lunch/afternoon/dinner/supper',
  `original_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '格子原价(商圈日单价/5)',
  `sale_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付分摊价(折扣后)',
  `refund_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额(取消扣费梯度)',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_order` (`order_id`),
  KEY `idx_ad_item_cell` (`biz_date`,`region`,`meal_slot`),
  KEY `idx_ad_item_status` (`delivery_status`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星订单明细表(独家占)';

DROP TABLE IF EXISTS `biz_ad_order_item_traffic`;
CREATE TABLE `biz_ad_order_item_traffic` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `mode` varchar(16) NOT NULL DEFAULT 'tier' COMMENT '购买方式: tier=预设档位 custom=自定义数量',
  `package_name` varchar(64) DEFAULT NULL COMMENT '流量包名称(档位购买=档位名, 自定义=自定义曝光次数)',
  `impressions` int NOT NULL COMMENT '购买曝光次数',
  `unit_price` decimal(10,4) NOT NULL DEFAULT '0.0000' COMMENT '实际单价(MOP/次, 实付金额÷购买曝光)',
  `delivery_slot` varchar(16) NOT NULL DEFAULT 'business' COMMENT '投流时段: business=主营时段投流 allday=全天投流',
  `original_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '订单原价(档位原价/阶梯计价)',
  `sale_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付金额(扣除赠送天数抵扣后)',
  `refund_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额',
  `refund_fee_percent` int NOT NULL DEFAULT '0' COMMENT '退款手续费比例快照(%)',
  `consumed_impressions` int NOT NULL DEFAULT '0' COMMENT '已消耗曝光次数(APP端回写)',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=投放中 2=已消耗完毕 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_traffic_order` (`order_id`),
  KEY `idx_ad_item_traffic_status` (`delivery_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投流广告订单明细表(流量包)';

DROP TABLE IF EXISTS `biz_ad_pricing_hot`;
CREATE TABLE `biz_ad_pricing_hot` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_no` varchar(32) DEFAULT NULL COMMENT '定价编号（按编号生成规则 config_pricing_hot 生成）',
  `algo_id` bigint DEFAULT NULL COMMENT '关联算法ID（已解耦，可为空）',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `channel` tinyint DEFAULT NULL COMMENT '业务频道',
  `presale_days` int NOT NULL DEFAULT '30' COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
  `refund_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '退款开关: 1=允许退款 2=不允许',
  `discount_tiers` json DEFAULT NULL COMMENT '多格梯度折扣(JSON, 按购买格子数匹配)',
  `cancel_fee_tiers` json DEFAULT NULL COMMENT '取消扣费梯度(JSON)',
  `block_merchant` tinyint NOT NULL DEFAULT '2' COMMENT '屏蔽商家开关: 1=启用 2=关闭',
  `block_list` json DEFAULT NULL COMMENT '屏蔽商家列表(JSON)',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `gift_cash_value` int DEFAULT NULL COMMENT '赠送天数每日现金价值（MOP），NULL或0表示未配置',
  `discount_enabled` tinyint DEFAULT NULL COMMENT '折扣总开关，空值兼容旧规则',
  `discount_mode` varchar(16) NOT NULL DEFAULT 'shared' COMMENT 'shared/independent',
  `small_discount_tiers` json DEFAULT NULL COMMENT '小图折扣百分比梯度',
  `large_discount_tiers` json DEFAULT NULL COMMENT '大图折扣百分比梯度',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_hot_algo` (`algo_id`),
  KEY `idx_ad_pricing_hot_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家计价主表';

DROP TABLE IF EXISTS `biz_ad_pricing_hot_skin`;
CREATE TABLE `biz_ad_pricing_hot_skin` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_hot.id)',
  `skin_name` varchar(64) NOT NULL COMMENT '皮肤名称',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '皮肤日单价(MOP)',
  `border_type` varchar(16) DEFAULT 'color' COMMENT '边框方式: none=无边框 color=选择配色 image=上传边框图',
  `border_color` varchar(32) DEFAULT NULL COMMENT '边框颜色(HEX, border_type=color时生效)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `tier` varchar(32) DEFAULT NULL COMMENT '皮肤段位: classic=经典 premium=精选\n flagship=旗舰 ultimate=至尊',
  `dish_layout` varchar(32) DEFAULT NULL COMMENT '菜品展示布局: grid=大图拼列 carousel=阶梯轮播',
  `display_mode` varchar(16) DEFAULT NULL COMMENT 'small/large，旧皮肤待确认',
  `template_key` varchar(64) DEFAULT NULL COMMENT '固定皮肤模板键',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_hot_skin_pricing` (`pricing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家皮肤计价明细表';

DROP TABLE IF EXISTS `biz_ad_pricing_revive`;
CREATE TABLE `biz_ad_pricing_revive` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_no` varchar(32) DEFAULT NULL COMMENT '定价编号（按编号生成规则 config_pricing_revive 生成）',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID (biz_ad_algorithm.id)',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `channel` tinyint DEFAULT NULL COMMENT '业务频道',
  `presale_days` int NOT NULL DEFAULT '180' COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
  `refund_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '退款开关: 1=允许退款 2=不允许',
  `discount_tiers` json DEFAULT NULL COMMENT '多天梯度折扣(JSON)',
  `cancel_fee_tiers` json DEFAULT NULL COMMENT '取消扣费梯度(JSON)',
  `block_merchant` tinyint NOT NULL DEFAULT '2' COMMENT '屏蔽商家开关: 1=启用 2=关闭',
  `block_list` json DEFAULT NULL COMMENT '屏蔽商家列表(JSON)',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_revive_algo` (`algo_id`),
  KEY `idx_ad_pricing_revive_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏计价主表';

DROP TABLE IF EXISTS `biz_ad_pricing_revive_region`;
CREATE TABLE `biz_ad_pricing_revive_region` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_revive.id)',
  `region` tinyint NOT NULL COMMENT '商圈: 1=黑沙环区 ... 11=黑沙滩区',
  `daily_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '该商圈日单价(MOP)',
  `daily_sales_limit` int NOT NULL DEFAULT '1' COMMENT '每天销售个数(库存)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_revive_region_pricing` (`pricing_id`),
  KEY `idx_ad_pricing_revive_region_region` (`region`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏商圈计价明细表';

DROP TABLE IF EXISTS `biz_ad_pricing_signboard`;
CREATE TABLE `biz_ad_pricing_signboard` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_no` varchar(32) NOT NULL COMMENT '定价编号（DJZP + YYYYMMDD + 3位）',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID（biz_ad_algorithm.id）',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `brand` varchar(32) DEFAULT NULL COMMENT '所属品牌',
  `channel` int DEFAULT NULL COMMENT '业务频道',
  `presale_days` int NOT NULL DEFAULT '7' COMMENT '预售天数（默认7天）',
  `refund_enabled` int NOT NULL DEFAULT '1' COMMENT '退款开关: 1=允许退款 2=不允许',
  `cancel_fee_tiers` text COMMENT '取消扣费梯度JSON',
  `discount_mode` varchar(10) NOT NULL DEFAULT 'local' COMMENT '折扣模式: global=全局折扣 local=局部折扣',
  `global_discount_tiers` text COMMENT '全局折扣梯度JSON [{"minDays":3,"discount":95}]（discount_mode=global時生效）',
  `status` int NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pricing_signboard_no` (`pricing_no`),
  KEY `idx_pricing_signboard_algo` (`algo_id`),
  KEY `idx_pricing_signboard_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='金字招牌计价主表';

DROP TABLE IF EXISTS `biz_ad_pricing_signboard_label`;
CREATE TABLE `biz_ad_pricing_signboard_label` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID（biz_ad_pricing_signboard.id）',
  `label_type` varchar(32) NOT NULL COMMENT '标签类型（hot/popular/sales/rating/repurchase/favorites/customers）',
  `scenario` varchar(32) DEFAULT NULL COMMENT '场景（all_macau=全澳對比, district=商圈對比, NULL=統計類無場景）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否启用: 1=启用 0=禁用',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '标签日单价（MOP/天）',
  `discount_tiers` text COMMENT '梯度折扣JSON [{"minDays":3,"discount":95}]',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_signboard_label_pricing` (`pricing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='金字招牌标签计价明细表';

DROP TABLE IF EXISTS `biz_ad_pricing_star`;
CREATE TABLE `biz_ad_pricing_star` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_no` varchar(32) DEFAULT NULL COMMENT '定价编号（按编号生成规则 config_pricing_star 生成）',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID (biz_ad_algorithm.id)',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `channel` tinyint DEFAULT NULL COMMENT '业务频道',
  `presale_days` int NOT NULL DEFAULT '12' COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
  `refund_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '退款开关: 1=允许退款 2=不允许',
  `discount_tiers` json DEFAULT NULL COMMENT '多时段梯度折扣(JSON)',
  `cancel_fee_tiers` json DEFAULT NULL COMMENT '取消扣费梯度(JSON)',
  `block_merchant` tinyint NOT NULL DEFAULT '2' COMMENT '屏蔽商家开关: 1=启用 2=关闭',
  `block_list` json DEFAULT NULL COMMENT '屏蔽商家列表(JSON)',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `sell_time_slots` json DEFAULT NULL COMMENT '可售时段(JSON数组, 如["breakfast","lunch"], 空或含fullDay=全部时段)',
  `slot_discounts` json DEFAULT NULL COMMENT '时段折扣配置(JSON数组, 分商圈, 百分比记法)',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_star_algo` (`algo_id`),
  KEY `idx_ad_pricing_star_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星计价主表';

DROP TABLE IF EXISTS `biz_ad_pricing_star_region`;
CREATE TABLE `biz_ad_pricing_star_region` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_star.id)',
  `region` tinyint NOT NULL COMMENT '商圈: 1=黑沙环区 ... 11=黑沙滩区',
  `daily_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '该商圈日单价(MOP)',
  `daily_sales_limit` int NOT NULL DEFAULT '1' COMMENT '每天销售个数(库存)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_region_pricing` (`pricing_id`),
  KEY `idx_ad_pricing_region_region` (`region`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星商圈计价明细表';

DROP TABLE IF EXISTS `biz_ad_pricing_traffic`;
CREATE TABLE `biz_ad_pricing_traffic` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_no` varchar(64) NOT NULL COMMENT '定价编号(按编号生成规则 config_pricing_traffic 生成, 如 DJTL20260812000)',
  `algo_id` bigint NOT NULL COMMENT '关联算法ID (biz_ad_algorithm.id, algo_type=15)',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee / mFood',
  `biz_channel` tinyint NOT NULL COMMENT '业务频道: 1=美食外卖 2=超市百货 3=团购到店',
  `custom_min_qty` int NOT NULL DEFAULT '100' COMMENT '自定义购买最低起购量(曝光次数)',
  `custom_step` int NOT NULL DEFAULT '100' COMMENT '自定义购买步长(曝光次数)',
  `refund_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '退款开关: 1=允许退款 2=不允许',
  `refund_fee_percent` int NOT NULL DEFAULT '0' COMMENT '退款手续费比例(%): 手续费 = 退款金额 × 比例, 0=免费退',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用(停用后该频道流量包停止售卖)',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_traffic_algo` (`algo_id`),
  KEY `idx_ad_pricing_traffic_channel` (`biz_channel`),
  KEY `idx_ad_pricing_traffic_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投流广告计价主表(按业务频道)';

DROP TABLE IF EXISTS `biz_ad_pricing_traffic_ladder`;
CREATE TABLE `biz_ad_pricing_traffic_ladder` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_traffic.id)',
  `min_qty` int NOT NULL COMMENT '区间下限(含, 曝光次数)',
  `max_qty` int NOT NULL DEFAULT '0' COMMENT '区间上限(含), 0=无上限',
  `unit_price` decimal(10,4) NOT NULL DEFAULT '0.0000' COMMENT '单次曝光单价(MOP)',
  `sort` int NOT NULL DEFAULT '1' COMMENT '排序(从1开始)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_traffic_ladder_pricing` (`pricing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投流广告阶梯单价明细表';

DROP TABLE IF EXISTS `biz_ad_pricing_traffic_tier`;
CREATE TABLE `biz_ad_pricing_traffic_tier` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_traffic.id)',
  `tier_name` varchar(64) NOT NULL COMMENT '档位名称(如 体验包/成长包/爆款包)',
  `impressions` int NOT NULL COMMENT '曝光次数',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '套餐价格(MOP)',
  `validity_days` int DEFAULT NULL COMMENT '有效期(天, 已停用: 流量包消耗完毕即退出)',
  `on_sale` tinyint NOT NULL DEFAULT '1' COMMENT '是否上架: 1=上架 2=下架',
  `sort` int NOT NULL DEFAULT '1' COMMENT '排序(从1开始)',
  `discount_enabled` tinyint NOT NULL DEFAULT '0' COMMENT '折扣开关: 1=开启 0=关闭',
  `discount` decimal(3,1) DEFAULT NULL COMMENT '折扣(折, 如 8.5 = 85折)',
  `discount_time_mode` varchar(16) DEFAULT 'unlimited' COMMENT '折扣时间模式: unlimited=不限时间 limited=限定时间',
  `discount_start_date` date DEFAULT NULL COMMENT '折扣活动开始日期(限定时间模式)',
  `discount_end_date` date DEFAULT NULL COMMENT '折扣活动结束日期(限定时间模式)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_traffic_tier_pricing` (`pricing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投流广告预设档位明细表(流量包套餐)';

DROP TABLE IF EXISTS `biz_ad_waterfall`;
CREATE TABLE `biz_ad_waterfall` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID(配置ID, APP引用)',
  `strategy_code` varchar(32) DEFAULT NULL COMMENT '策略编号（按编号生成规则 config_waterfall 生成）',
  `strategy_name` varchar(128) NOT NULL COMMENT '瀑布流名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee=闪蜂 / mFood',
  `natural_algo_id` varchar(64) DEFAULT NULL COMMENT '自然流量兜底算法编码（关联 biz_ad_algorithm.algo_code）',
  `natural_algo_name` varchar(128) DEFAULT NULL COMMENT '自然流量算法名称快照',
  `filter_dislike` tinyint NOT NULL DEFAULT '2' COMMENT '过滤用户不喜欢: 1=开启 2=关闭',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '服务状态: 1=启用 2=停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_waterfall_brand` (`brand`),
  KEY `idx_ad_waterfall_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='瀑布流策略主表';

DROP TABLE IF EXISTS `biz_ad_waterfall_slot`;
CREATE TABLE `biz_ad_waterfall_slot` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `waterfall_id` bigint NOT NULL COMMENT '瀑布流策略ID (biz_ad_waterfall.id)',
  `slot_position` int NOT NULL COMMENT '坑位序号(从1开始)',
  `algo_id` varchar(64) NOT NULL COMMENT '算法编码（关联 biz_ad_algorithm.algo_code）',
  `algo_name` varchar(128) DEFAULT NULL COMMENT '算法名称快照',
  `algo_type` tinyint DEFAULT NULL COMMENT '算法类型快照: 1=无敌星星 2=新店广告 3=盘活复苏 ...',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '坑位状态: 1=启用 2=停用',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_wf_slot_waterfall` (`waterfall_id`),
  KEY `idx_ad_wf_slot_algo` (`algo_id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='瀑布流坑位明细表';

DROP TABLE IF EXISTS `biz_eam_asset`;
CREATE TABLE `biz_eam_asset` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_no` varchar(64) NOT NULL COMMENT '資產編號（系統生成，唯一）',
  `asset_name` varchar(200) NOT NULL DEFAULT '' COMMENT '資產名稱',
  `asset_type` varchar(100) DEFAULT '' COMMENT '資產分類名稱',
  `category_id` bigint DEFAULT NULL COMMENT '分類 ID',
  `category_code` varchar(64) DEFAULT '' COMMENT '分類編碼',
  `brand` varchar(100) DEFAULT '' COMMENT '品牌',
  `brand_id` bigint DEFAULT NULL COMMENT '品牌 ID',
  `model_id` bigint DEFAULT NULL COMMENT '型號 ID',
  `params` json DEFAULT NULL COMMENT '參數信息 JSON',
  `unit` varchar(32) DEFAULT '' COMMENT '單位',
  `purchase_value` decimal(14,2) DEFAULT '0.00' COMMENT '購買價值',
  `purchase_date` varchar(32) DEFAULT NULL COMMENT '購買日期',
  `purchase_type` varchar(16) DEFAULT 'purchase' COMMENT 'purchase/lease',
  `source` varchar(16) NOT NULL DEFAULT 'self' COMMENT 'self/lease',
  `company` varchar(200) DEFAULT '' COMMENT '所屬公司',
  `location` varchar(200) DEFAULT '' COMMENT '存放地點名稱',
  `location_id` bigint DEFAULT NULL COMMENT '存放位置 ID',
  `department` varchar(100) DEFAULT '' COMMENT '歸屬部門',
  `admin_department` varchar(100) DEFAULT NULL COMMENT '管理部门',
  `user_name` varchar(64) DEFAULT '' COMMENT '使用人',
  `status` varchar(16) NOT NULL DEFAULT 'idle' COMMENT 'idle/in_use/in_repair/scrapped',
  `hold_type` varchar(16) DEFAULT 'owned' COMMENT 'owned/borrowed',
  `order_id` bigint DEFAULT NULL COMMENT '關聯採購訂單 ID',
  `batch_id` bigint DEFAULT NULL COMMENT '關聯入庫批次 ID',
  `company_brand` tinyint DEFAULT NULL COMMENT '公司品牌：1=闪蜂(TB), 2=mFood(MF)',
  `current_holder_id` bigint DEFAULT NULL COMMENT '当前持有人 ID',
  `active_claim_id` bigint DEFAULT NULL COMMENT '当前活跃领用 ID',
  `remark` varchar(500) DEFAULT '' COMMENT '備註',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最後更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `lease_company` varchar(200) DEFAULT NULL COMMENT '租借公司',
  `images` longtext COMMENT '资产照片',
  `usage_date` varchar(32) DEFAULT NULL COMMENT '使用日期',
  `scrap_time` varchar(32) DEFAULT NULL COMMENT '报废日期',
  `rental_cost` decimal(14,2) DEFAULT NULL COMMENT '租赁费用',
  `rental_period` json DEFAULT NULL COMMENT '租赁起止日期',
  `hold_version` bigint NOT NULL DEFAULT '0',
  `accessories` text COMMENT '配件清单 JSON 数组 [{name,qty}]',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_no` (`asset_no`),
  KEY `idx_status` (`status`),
  KEY `idx_category` (`category_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_auto_deleted_createdat_id` (`deleted`,`created_at`,`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='資產台賬';

DROP TABLE IF EXISTS `biz_eam_asset_state_event`;
CREATE TABLE `biz_eam_asset_state_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `biz_type` varchar(20) NOT NULL COMMENT '业务类型：loss/scrap/repair/return',
  `biz_id` bigint DEFAULT NULL COMMENT '业务单据 ID',
  `source_type` varchar(20) DEFAULT NULL COMMENT '来源类型：claim/borrow',
  `source_id` bigint DEFAULT NULL COMMENT '来源领用/借用 ID',
  `before_status` varchar(32) DEFAULT NULL COMMENT '变更前资产状态',
  `after_status` varchar(32) DEFAULT NULL COMMENT '变更后资产状态',
  `before_holder_id` bigint DEFAULT NULL COMMENT '变更前持有人 ID',
  `before_holder_name` varchar(128) DEFAULT NULL COMMENT '变更前持有人姓名',
  `before_department` varchar(128) DEFAULT NULL COMMENT '变更前归属部门',
  `after_department` varchar(128) DEFAULT NULL COMMENT '变更后归属部门',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(128) DEFAULT NULL COMMENT '操作人姓名',
  `biz_date` date DEFAULT NULL COMMENT '业务日期',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等请求键',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_state_event_request` (`operator_id`,`request_key`),
  KEY `idx_state_event_asset` (`asset_id`,`id`),
  KEY `idx_state_event_biz` (`biz_type`,`biz_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `biz_eam_asset_tag`;
CREATE TABLE `biz_eam_asset_tag` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '标签名称',
  `description` varchar(500) DEFAULT '' COMMENT '标签描述',
  `bg_color` varchar(16) NOT NULL DEFAULT '#1890FF' COMMENT '标签背景色',
  `text_color` varchar(16) NOT NULL DEFAULT '#FFFFFF' COMMENT '标签文字颜色',
  `display_fields` varchar(500) NOT NULL DEFAULT '' COMMENT '展示字段配置（逗号分隔的资产字段 key 列表）',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序（升序）',
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_tag_status` (`status`),
  KEY `idx_tag_sort` (`sort`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产标签模板';

DROP TABLE IF EXISTS `biz_eam_asset_tag_binding`;
CREATE TABLE `biz_eam_asset_tag_binding` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_id` bigint NOT NULL COMMENT '关联资产ID',
  `tag_id` bigint NOT NULL COMMENT '关联标签模板ID',
  `is_primary` tinyint NOT NULL DEFAULT '0' COMMENT '是否主标签：1=是，0=否',
  `created_by` varchar(64) DEFAULT '' COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_tag` (`asset_id`,`tag_id`),
  KEY `idx_binding_asset` (`asset_id`),
  KEY `idx_binding_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产-标签绑定关系';

DROP TABLE IF EXISTS `biz_eam_borrow`;
CREATE TABLE `biz_eam_borrow` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `borrow_no` varchar(32) NOT NULL COMMENT '借用编号（JY+YYYYMMDD+4位）',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `holder_id` bigint NOT NULL COMMENT '借用人 ID',
  `holder_name` varchar(64) NOT NULL COMMENT '借用人姓名快照',
  `department` varchar(100) NOT NULL COMMENT '借用部门',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名快照',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT 'active/overdue/returned/cancelled',
  `start_date` date NOT NULL COMMENT '借出日期',
  `due_date` date NOT NULL COMMENT '到期日期',
  `return_date` date DEFAULT NULL COMMENT '实际归还日期',
  `purpose` varchar(500) DEFAULT NULL COMMENT '借用用途',
  `renew_count` int NOT NULL DEFAULT '0' COMMENT '续借次数',
  `return_id` bigint DEFAULT NULL COMMENT '关联归还记录 ID',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `closed_at` datetime DEFAULT NULL COMMENT '异常处置终止时间',
  `close_type` varchar(20) DEFAULT NULL COMMENT '终止来源：loss/scrap/repair',
  `close_biz_id` bigint DEFAULT NULL COMMENT '终止来源单据 ID',
  `close_reason` varchar(500) DEFAULT NULL COMMENT '终止说明',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_borrow_no` (`borrow_no`),
  KEY `idx_asset` (`asset_id`),
  KEY `idx_holder` (`holder_id`),
  KEY `idx_status` (`status`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_borrow_close_type` (`close_type`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产借用登记表';

DROP TABLE IF EXISTS `biz_eam_brand`;
CREATE TABLE `biz_eam_brand` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category_code` varchar(64) NOT NULL COMMENT '所属分类编码',
  `brand_zh` varchar(100) NOT NULL COMMENT '品牌中文',
  `brand_en` varchar(100) DEFAULT '' COMMENT '品牌英文',
  `brand_logo` varchar(500) DEFAULT '' COMMENT '品牌LOGO URL',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `code` varchar(32) DEFAULT NULL COMMENT '品牌编码（AB 前缀）',
  `biz_type` varchar(20) NOT NULL DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `remark` varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_category_code` (`category_code`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='品牌库';

DROP TABLE IF EXISTS `biz_eam_category`;
CREATE TABLE `biz_eam_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '分类编码',
  `name` varchar(100) NOT NULL COMMENT '分类名称',
  `parent_id` bigint NOT NULL DEFAULT '0' COMMENT '父级ID,0为顶级',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `param_template` json DEFAULT NULL COMMENT '参数模板JSON',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `biz_type` varchar(20) NOT NULL DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产分类';

DROP TABLE IF EXISTS `biz_eam_category_accessory`;
CREATE TABLE `biz_eam_category_accessory` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `category_code` varchar(32) COLLATE utf8mb4_general_ci NOT NULL COMMENT '所属分类编码（同分类下所有产品共用）',
  `name` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '配件名称',
  `default_qty` int NOT NULL DEFAULT '1' COMMENT '默认数量',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序（越小越靠前）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1=启用, 0=停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常, 1=已删除',
  PRIMARY KEY (`id`),
  KEY `idx_eca_category_code` (`category_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='EAM分类配件配置表';

DROP TABLE IF EXISTS `biz_eam_claim`;
CREATE TABLE `biz_eam_claim` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `claim_no` varchar(32) NOT NULL COMMENT '领用编号',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `employee_id` bigint NOT NULL COMMENT '领用人 ID',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名快照',
  `status` varchar(20) NOT NULL DEFAULT 'pending_signature' COMMENT '状态',
  `signature_status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '签署状态',
  `claim_date` date NOT NULL COMMENT '领用日期',
  `claim_reason` varchar(500) DEFAULT NULL COMMENT '领用用途',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `proxy_mode` tinyint NOT NULL DEFAULT '0' COMMENT '0=本人 1=代办',
  `proxy_reason` varchar(500) DEFAULT NULL COMMENT '代办原因',
  `signed_at` datetime DEFAULT NULL COMMENT '签署时间',
  `signature_evidence_id` bigint DEFAULT NULL COMMENT '签名凭证 ID',
  `return_date` date DEFAULT NULL COMMENT '归还日期',
  `return_reason` varchar(500) DEFAULT NULL COMMENT '归还原因',
  `return_id` bigint DEFAULT NULL COMMENT '关联归还记录 ID',
  `cancelled_reason` varchar(500) DEFAULT NULL COMMENT '取消原因',
  `content_hash` varchar(64) DEFAULT NULL COMMENT '内容 SHA-256',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `source_transfer_id` bigint DEFAULT NULL,
  `previous_claim_id` bigint DEFAULT NULL,
  `accessories` text COMMENT '领用配件快照 JSON（领用时从资产复制，支持删减）',
  `closed_at` datetime DEFAULT NULL COMMENT '异常处置终止时间',
  `close_type` varchar(20) DEFAULT NULL COMMENT '终止来源：loss/scrap/repair',
  `close_biz_id` bigint DEFAULT NULL COMMENT '终止来源单据 ID',
  `close_reason` varchar(500) DEFAULT NULL COMMENT '终止说明',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_claim_no` (`claim_no`),
  KEY `idx_asset` (`asset_id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_status` (`status`),
  KEY `idx_signature` (`signature_status`),
  KEY `idx_claim_transfer` (`source_transfer_id`),
  KEY `idx_claim_close_type` (`close_type`),
  KEY `idx_claim_emp_summary` (`employee_id`,`deleted`,`status`,`signature_status`,`claim_date`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产领用登记表';

DROP TABLE IF EXISTS `biz_eam_claim_event`;
CREATE TABLE `biz_eam_claim_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `claim_id` bigint NOT NULL COMMENT '关联领用 ID',
  `event_type` varchar(30) NOT NULL COMMENT '事件类型',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人',
  `remark` varchar(500) DEFAULT NULL COMMENT '事件备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_claim` (`claim_id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='领用操作事件流水表';

DROP TABLE IF EXISTS `biz_eam_claim_evidence`;
CREATE TABLE `biz_eam_claim_evidence` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `claim_id` bigint NOT NULL COMMENT '关联领用 ID',
  `evidence_type` varchar(20) NOT NULL DEFAULT 'signature' COMMENT '凭证类型',
  `file_name` varchar(255) DEFAULT NULL COMMENT '原始文件名',
  `storage_path` mediumtext NOT NULL COMMENT '存储路径或 Data URL (base64)',
  `content_type` varchar(64) DEFAULT NULL COMMENT 'MIME 类型',
  `file_size` int DEFAULT NULL COMMENT '文件大小',
  `content_hash` varchar(64) DEFAULT NULL COMMENT '文件 SHA-256',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `biz_type` varchar(20) NOT NULL DEFAULT 'claim' COMMENT '业务类型：claim/return/borrow/compensation',
  `biz_id` bigint DEFAULT NULL COMMENT '业务 ID',
  PRIMARY KEY (`id`),
  KEY `idx_claim` (`claim_id`),
  KEY `idx_biz` (`biz_type`,`biz_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='领用/归还凭证附件表';

DROP TABLE IF EXISTS `biz_eam_compensation`;
CREATE TABLE `biz_eam_compensation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `comp_no` varchar(32) NOT NULL COMMENT '赔付编号（PF+YYYYMMDD+4位）',
  `return_id` bigint NOT NULL COMMENT '关联归还记录 ID',
  `loss_id` bigint DEFAULT NULL COMMENT '关联遗失单 ID',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `asset_name` varchar(200) NOT NULL COMMENT '资产名称快照',
  `asset_no` varchar(64) NOT NULL COMMENT '资产编号快照',
  `holder_id` bigint NOT NULL COMMENT '原持有人 ID',
  `holder_name` varchar(64) NOT NULL COMMENT '原持有人姓名快照',
  `damage_type` varchar(20) NOT NULL COMMENT '损失类型：damage/loss',
  `cause` varchar(20) DEFAULT NULL COMMENT '原因：human/natural/third_party/quality',
  `party` varchar(20) DEFAULT NULL COMMENT '责任对象：employee/department/company/none',
  `responsible_id` bigint DEFAULT NULL COMMENT '责任人 ID',
  `responsible_name` varchar(64) DEFAULT NULL COMMENT '责任人姓名',
  `department` varchar(100) DEFAULT NULL COMMENT '责任部门',
  `amount` bigint NOT NULL DEFAULT '0' COMMENT '应赔金额（分）',
  `net_paid` bigint NOT NULL DEFAULT '0' COMMENT '净收款（分）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/partially_paid/paid/waived/refund_pending',
  `review_required` tinyint NOT NULL DEFAULT '0' COMMENT '是否需要找回复核：0=否 1=是',
  `basis` varchar(500) DEFAULT NULL COMMENT '定责依据',
  `reason` varchar(500) DEFAULT NULL COMMENT '异常说明',
  `waive_reason` varchar(500) DEFAULT NULL COMMENT '免赔原因',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名快照',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comp_no` (`comp_no`),
  KEY `idx_return` (`return_id`),
  KEY `idx_asset` (`asset_id`),
  KEY `idx_holder` (`holder_id`),
  KEY `idx_status` (`status`),
  KEY `idx_review_required` (`review_required`),
  KEY `idx_loss_id` (`loss_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产赔付记录表';

DROP TABLE IF EXISTS `biz_eam_compensation_payment`;
CREATE TABLE `biz_eam_compensation_payment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `compensation_id` bigint NOT NULL COMMENT '关联赔付记录 ID',
  `type` varchar(10) NOT NULL COMMENT '类型：payment/refund',
  `amount` bigint NOT NULL COMMENT '金额（分）',
  `payment_date` date NOT NULL COMMENT '业务日期',
  `reason` varchar(500) DEFAULT NULL COMMENT '说明',
  `evidence_id` bigint DEFAULT NULL COMMENT '凭证 ID',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compensation` (`compensation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赔付收款/退款流水表';

DROP TABLE IF EXISTS `biz_eam_compensation_review`;
CREATE TABLE `biz_eam_compensation_review` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `compensation_id` bigint NOT NULL COMMENT '关联赔付记录 ID',
  `review_date` date NOT NULL COMMENT '复核日期',
  `before_amount` bigint NOT NULL COMMENT '原应赔金额（分）',
  `after_amount` bigint NOT NULL COMMENT '复核后应赔金额（分）',
  `reason` varchar(500) NOT NULL COMMENT '调整理由',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compensation` (`compensation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赔付找回复核记录表';

DROP TABLE IF EXISTS `biz_eam_consumable_adjust`;
CREATE TABLE `biz_eam_consumable_adjust` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `adjust_no` varchar(40) NOT NULL COMMENT '调整单号',
  `item_id` bigint NOT NULL,
  `location_id` bigint NOT NULL DEFAULT '0',
  `location_name` varchar(200) DEFAULT '',
  `direction` varchar(10) NOT NULL COMMENT 'in=盘盈/out=盘亏',
  `qty` int NOT NULL,
  `unit_cost` decimal(16,6) DEFAULT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `operator` varchar(64) DEFAULT '',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_adjust_no` (`adjust_no`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材库存调整单';

DROP TABLE IF EXISTS `biz_eam_consumable_claim`;
CREATE TABLE `biz_eam_consumable_claim` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `claim_no` varchar(32) NOT NULL COMMENT '领用单号（HCLY+YYYYMMDD+4位）',
  `applicant_id` bigint NOT NULL COMMENT '申请人 ID',
  `applicant_name` varchar(64) NOT NULL COMMENT '申请人姓名快照',
  `applicant_emp_id` varchar(32) DEFAULT '' COMMENT '申请人工号',
  `department` varchar(100) DEFAULT '' COMMENT '申请部门',
  `reason` varchar(500) NOT NULL DEFAULT '' COMMENT '领用事由',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/issued/cancelled',
  `approver_id` bigint DEFAULT NULL COMMENT '审批人 ID',
  `approver_name` varchar(64) DEFAULT '' COMMENT '审批人姓名',
  `approved_at` datetime DEFAULT NULL COMMENT '审批时间',
  `approve_remark` varchar(500) DEFAULT '' COMMENT '审批意见',
  `issue_operator_id` bigint DEFAULT NULL COMMENT '出库操作人 ID',
  `issue_operator` varchar(64) DEFAULT '' COMMENT '出库操作人姓名',
  `issued_at` datetime DEFAULT NULL COMMENT '出库时间',
  `cancel_reason` varchar(500) DEFAULT '' COMMENT '取消原因',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID快照',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID快照',
  `purchase_company` varchar(100) DEFAULT '' COMMENT '购买公司名称快照',
  `department_id` bigint DEFAULT NULL COMMENT '承担部门ID',
  `cost_amount` decimal(18,2) NOT NULL DEFAULT '0.00' COMMENT '出库成本合计',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_claim_no` (`claim_no`),
  KEY `idx_applicant` (`applicant_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材领用单';

DROP TABLE IF EXISTS `biz_eam_consumable_claim_item`;
CREATE TABLE `biz_eam_consumable_claim_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `claim_id` bigint NOT NULL COMMENT '领用单 ID',
  `item_id` bigint NOT NULL COMMENT '耗材 ID',
  `item_code` varchar(32) DEFAULT '' COMMENT '耗材编码快照',
  `item_name` varchar(128) NOT NULL COMMENT '耗材名称快照',
  `spec` varchar(200) DEFAULT '' COMMENT '规格型号快照',
  `unit` varchar(32) DEFAULT '' COMMENT '单位快照',
  `qty` int NOT NULL COMMENT '领用数量',
  `location_id` bigint NOT NULL DEFAULT '0' COMMENT '出库仓库 ID',
  `location_name` varchar(200) DEFAULT '' COMMENT '出库仓库名称快照',
  `unit_cost` decimal(14,2) DEFAULT NULL COMMENT '出库成本单价快照',
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID快照',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID快照',
  `actual_unit_cost` decimal(16,6) DEFAULT NULL COMMENT '实际出库加权均价',
  `amount` decimal(18,2) DEFAULT NULL COMMENT '出库成本金额',
  `returned_qty` int NOT NULL DEFAULT '0' COMMENT '已退料数量',
  PRIMARY KEY (`id`),
  KEY `idx_claim` (`claim_id`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材领用单明细';

DROP TABLE IF EXISTS `biz_eam_consumable_inbound`;
CREATE TABLE `biz_eam_consumable_inbound` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `inbound_no` varchar(40) NOT NULL COMMENT '入库单号',
  `inbound_type` varchar(20) NOT NULL DEFAULT 'in_manual' COMMENT 'in_purchase/in_manual/in_init',
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID',
  `purchase_company` varchar(100) DEFAULT '' COMMENT '购买公司名称快照',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商ID',
  `supplier_name` varchar(128) DEFAULT '' COMMENT '供应商名称快照',
  `po_id` bigint DEFAULT NULL COMMENT '采购订单ID',
  `po_no` varchar(40) DEFAULT '' COMMENT '采购订单号快照',
  `source_type` varchar(20) DEFAULT '' COMMENT '来源类型',
  `source_id` bigint DEFAULT NULL COMMENT '来源单据ID',
  `biz_date` date DEFAULT NULL COMMENT '入库日期',
  `remark` varchar(500) DEFAULT '',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inbound_no` (`inbound_no`),
  KEY `idx_po` (`po_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材入库单';

DROP TABLE IF EXISTS `biz_eam_consumable_inbound_item`;
CREATE TABLE `biz_eam_consumable_inbound_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `inbound_id` bigint NOT NULL COMMENT '入库单ID',
  `item_id` bigint NOT NULL COMMENT '耗材ID',
  `item_code` varchar(32) DEFAULT '',
  `item_name` varchar(128) DEFAULT '',
  `spec` varchar(200) DEFAULT '',
  `unit` varchar(32) DEFAULT '',
  `location_id` bigint NOT NULL DEFAULT '0',
  `location_name` varchar(200) DEFAULT '',
  `qty` int NOT NULL COMMENT '入库数量',
  `unit_price` decimal(16,6) DEFAULT NULL COMMENT '实际入库单价',
  `amount` decimal(18,2) DEFAULT NULL COMMENT '入库成本金额',
  `source_line_id` bigint DEFAULT NULL COMMENT '来源验收明细ID（幂等）',
  PRIMARY KEY (`id`),
  KEY `idx_inbound` (`inbound_id`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材入库单明细';

DROP TABLE IF EXISTS `biz_eam_consumable_item`;
CREATE TABLE `biz_eam_consumable_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `item_code` varchar(32) NOT NULL COMMENT '耗材编码（HC+6位全局自增）',
  `name` varchar(128) NOT NULL COMMENT '耗材名称',
  `category_id` bigint DEFAULT NULL COMMENT '分类 ID',
  `category_code` varchar(64) DEFAULT '' COMMENT '分类编码快照',
  `category_name` varchar(100) DEFAULT '' COMMENT '分类名称快照',
  `brand` varchar(100) DEFAULT '' COMMENT '品牌',
  `spec` varchar(200) DEFAULT '' COMMENT '规格型号',
  `unit` varchar(32) NOT NULL DEFAULT '個' COMMENT '计量单位',
  `ref_price` decimal(14,2) DEFAULT '0.00' COMMENT '参考单价',
  `image` text COMMENT '图片（Data URL）',
  `safety_stock` int NOT NULL DEFAULT '0' COMMENT '安全库存下限（0=不预警）',
  `max_stock` int NOT NULL DEFAULT '0' COMMENT '库存上限（0=不限）',
  `per_claim_limit` int NOT NULL DEFAULT '0' COMMENT '单人单次限领量（0=不限）',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_by` varchar(64) DEFAULT '' COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `consumable_category_id` bigint DEFAULT NULL COMMENT '耗材分类 ID',
  `brand_id` bigint DEFAULT NULL COMMENT '耗材品牌 ID',
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID（sys_company_brand）',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID（sys_purchase_company）',
  `purchase_company` varchar(100) DEFAULT '' COMMENT '购买公司名称快照',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_code` (`item_code`),
  KEY `idx_status` (`status`),
  KEY `idx_category` (`category_id`),
  KEY `idx_consumable_category` (`consumable_category_id`),
  KEY `idx_brand` (`brand_id`),
  KEY `idx_company_brand` (`company_brand`),
  KEY `idx_purchase_company` (`purchase_company_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材主数据';

DROP TABLE IF EXISTS `biz_eam_consumable_return`;
CREATE TABLE `biz_eam_consumable_return` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `return_no` varchar(40) NOT NULL COMMENT '退料单号',
  `claim_id` bigint DEFAULT NULL,
  `claim_item_id` bigint DEFAULT NULL,
  `item_id` bigint NOT NULL,
  `location_id` bigint NOT NULL DEFAULT '0',
  `location_name` varchar(200) DEFAULT '',
  `qty` int NOT NULL,
  `unit_cost` decimal(16,6) DEFAULT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `applicant_id` bigint DEFAULT NULL,
  `applicant_name` varchar(64) DEFAULT '',
  `department_id` bigint DEFAULT NULL,
  `department` varchar(100) DEFAULT '',
  `reason` varchar(500) DEFAULT '',
  `operator` varchar(64) DEFAULT '',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_no` (`return_no`),
  KEY `idx_claim_item` (`claim_item_id`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材退料单';

DROP TABLE IF EXISTS `biz_eam_consumable_stock`;
CREATE TABLE `biz_eam_consumable_stock` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `item_id` bigint NOT NULL COMMENT '耗材 ID',
  `location_id` bigint NOT NULL DEFAULT '0' COMMENT '仓库 ID',
  `location_name` varchar(200) DEFAULT '' COMMENT '仓库名称快照',
  `qty` int NOT NULL DEFAULT '0' COMMENT '当前库存数量',
  `locked_qty` int NOT NULL DEFAULT '0' COMMENT '审批中占用数量',
  `version` bigint NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID快照',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID快照',
  `purchase_company` varchar(100) DEFAULT '' COMMENT '购买公司名称快照',
  `avg_cost` decimal(16,6) NOT NULL DEFAULT '0.000000' COMMENT '移动加权平均单位成本',
  `total_cost` decimal(18,2) NOT NULL DEFAULT '0.00' COMMENT '库存成本金额',
  `updated_by` varchar(64) DEFAULT '' COMMENT '库存最后操作人',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_location` (`item_id`,`location_id`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材库存表';

DROP TABLE IF EXISTS `biz_eam_consumable_transfer`;
CREATE TABLE `biz_eam_consumable_transfer` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transfer_no` varchar(40) NOT NULL COMMENT '调拨单号',
  `item_id` bigint NOT NULL,
  `from_location_id` bigint NOT NULL DEFAULT '0',
  `from_location_name` varchar(200) DEFAULT '',
  `to_location_id` bigint NOT NULL DEFAULT '0',
  `to_location_name` varchar(200) DEFAULT '',
  `qty` int NOT NULL,
  `unit_cost` decimal(16,6) DEFAULT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `operator` varchar(64) DEFAULT '',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transfer_no` (`transfer_no`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材库存调拨单';

DROP TABLE IF EXISTS `biz_eam_consumable_txn`;
CREATE TABLE `biz_eam_consumable_txn` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `txn_no` varchar(40) NOT NULL COMMENT '流水号',
  `item_id` bigint NOT NULL COMMENT '耗材 ID',
  `item_code` varchar(32) DEFAULT '' COMMENT '耗材编码快照',
  `item_name` varchar(128) DEFAULT '' COMMENT '耗材名称快照',
  `location_id` bigint NOT NULL DEFAULT '0' COMMENT '仓库 ID',
  `location_name` varchar(200) DEFAULT '' COMMENT '仓库名称快照',
  `txn_type` varchar(20) NOT NULL COMMENT 'in_purchase/in_manual/in_adjust/out_claim/out_adjust',
  `qty` int NOT NULL COMMENT '变动数量（入正/出负）',
  `before_qty` int NOT NULL DEFAULT '0' COMMENT '变动前库存',
  `after_qty` int NOT NULL DEFAULT '0' COMMENT '变动后库存',
  `unit_cost` decimal(14,2) DEFAULT NULL COMMENT '入库单价',
  `ref_type` varchar(20) DEFAULT '' COMMENT '关联单据类型',
  `ref_id` bigint DEFAULT NULL COMMENT '关联单据 ID',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator` varchar(64) DEFAULT '' COMMENT '操作人姓名',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `amount` decimal(18,2) DEFAULT NULL COMMENT '变动成本金额（入库正/出库负）',
  `company_brand` bigint DEFAULT NULL COMMENT '所属品牌ID快照',
  `purchase_company_id` bigint DEFAULT NULL COMMENT '购买公司ID快照',
  `department_id` bigint DEFAULT NULL COMMENT '承担部门ID',
  `department` varchar(100) DEFAULT '' COMMENT '承担部门名称快照',
  `applicant_id` bigint DEFAULT NULL COMMENT '领用人ID（sys_user.id）',
  `applicant_emp_id` varchar(32) DEFAULT '' COMMENT '领用人工号',
  `applicant_name` varchar(64) DEFAULT '' COMMENT '领用人姓名',
  `biz_date` date DEFAULT NULL COMMENT '业务记账日期',
  `idempotency_key` varchar(80) DEFAULT NULL COMMENT '幂等键（来源单据行）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_txn_idem` (`idempotency_key`),
  KEY `idx_item` (`item_id`),
  KEY `idx_type` (`txn_type`),
  KEY `idx_created` (`created_at`),
  KEY `idx_ref` (`ref_type`,`ref_id`),
  KEY `idx_txn_company` (`purchase_company_id`),
  KEY `idx_txn_dept` (`department_id`),
  KEY `idx_txn_applicant` (`applicant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='耗材出入库流水';

DROP TABLE IF EXISTS `biz_eam_handover`;
CREATE TABLE `biz_eam_handover` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `handover_no` varchar(64) NOT NULL COMMENT '交接单号（JJ+YYYYMMDD+4位）',
  `from_user_id` bigint DEFAULT NULL COMMENT '交出人 ID',
  `from_user_name` varchar(128) NOT NULL COMMENT '交出人姓名快照',
  `from_department` varchar(128) NOT NULL COMMENT '交出人部门快照',
  `to_user_id` bigint DEFAULT NULL COMMENT '接收人 ID',
  `to_user_name` varchar(128) NOT NULL COMMENT '接收人姓名',
  `to_department` varchar(128) NOT NULL COMMENT '接收人部门',
  `receiver_type` varchar(20) NOT NULL DEFAULT 'employee' COMMENT '接收人类型：employee=员工 / department=部门',
  `handover_date` date NOT NULL COMMENT '交接日期',
  `asset_count` int NOT NULL DEFAULT '0' COMMENT '交接资产数量',
  `reason` varchar(32) NOT NULL COMMENT '交接原因：resign/transfer/other',
  `status` varchar(32) NOT NULL DEFAULT 'done' COMMENT '状态：done/cancelled',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(128) NOT NULL COMMENT '操作人姓名',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(128) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_handover_no` (`handover_no`),
  KEY `idx_from_user` (`from_user_name`),
  KEY `idx_to_user` (`to_user_name`),
  KEY `idx_handover_date` (`handover_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产交接单';

DROP TABLE IF EXISTS `biz_eam_handover_item`;
CREATE TABLE `biz_eam_handover_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `handover_id` bigint NOT NULL COMMENT '关联交接单 ID',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `asset_no` varchar(64) NOT NULL COMMENT '资产编号快照',
  `asset_name` varchar(256) NOT NULL COMMENT '资产名称快照',
  `asset_type` varchar(128) DEFAULT NULL COMMENT '资产分类快照',
  `old_department` varchar(128) DEFAULT NULL COMMENT '交接前部门',
  `new_department` varchar(128) DEFAULT NULL COMMENT '交接后部门',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_handover_id` (`handover_id`),
  KEY `idx_asset_id` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产交接单明细';

DROP TABLE IF EXISTS `biz_eam_inbound_batch`;
CREATE TABLE `biz_eam_inbound_batch` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_no` varchar(32) NOT NULL COMMENT '批次編號',
  `po_id` bigint NOT NULL COMMENT '關聯採購訂單 ID',
  `po_no` varchar(32) NOT NULL COMMENT '採購訂單號（冗餘）',
  `inbound_date` varchar(32) NOT NULL COMMENT '驗收日期',
  `operator` varchar(64) NOT NULL DEFAULT '' COMMENT '操作人',
  `department_id` bigint DEFAULT NULL COMMENT '管理部門ID',
  `department_name` varchar(128) DEFAULT NULL COMMENT '管理部門名稱',
  `total_qty` int NOT NULL DEFAULT '0' COMMENT '入庫總數',
  `accepted_qty` int NOT NULL DEFAULT '0' COMMENT '已驗收數量',
  `pending_qty` int NOT NULL DEFAULT '0' COMMENT '未驗收數量',
  `return_qty` int DEFAULT '0' COMMENT '退貨數量',
  `exchange_qty` int DEFAULT '0' COMMENT '換貨數量',
  `concession_qty` int DEFAULT '0' COMMENT '讓步接收數量',
  `purchase_reason` varchar(500) DEFAULT '' COMMENT '採購事由（冗餘）',
  `remark` varchar(500) DEFAULT '' COMMENT '備註',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最後更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `brand` tinyint DEFAULT NULL COMMENT '所属品牌',
  `generated_asset_count` int DEFAULT '0' COMMENT '实际生成资产数',
  `contract_version` int DEFAULT NULL COMMENT '契约版本',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等请求键',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  UNIQUE KEY `uk_batch_request_key` (`po_id`,`request_key`),
  KEY `idx_po_id` (`po_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='驗收入庫批次';

DROP TABLE IF EXISTS `biz_eam_inbound_batch_item`;
CREATE TABLE `biz_eam_inbound_batch_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_id` bigint NOT NULL COMMENT '所屬批次 ID',
  `model_id` bigint NOT NULL COMMENT '資產型號 ID',
  `model_name` varchar(200) DEFAULT '' COMMENT '資產名稱',
  `qty` int NOT NULL DEFAULT '1' COMMENT '驗收數量',
  `location_id` bigint DEFAULT NULL COMMENT '存放位置 ID',
  `asset_nos` json DEFAULT NULL COMMENT '生成的資產編號列表 JSON',
  `disposition` varchar(20) DEFAULT NULL COMMENT '驗收處置方式：pass=通過 / return=退貨 / exchange=換貨 / concession=讓步接收',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驗收不通過原因',
  `photos` json DEFAULT NULL COMMENT '驗收照片JSON數組 [{name,dataUrl}]，通過=到貨照片，不通過=損壞/不符照片',
  `sort_order` int DEFAULT '0',
  `accessories` json DEFAULT NULL COMMENT '配件清单',
  `order_item_id` bigint DEFAULT NULL COMMENT '采购明细ID',
  `group_id` varchar(64) DEFAULT NULL COMMENT '供应商分组快照',
  `inbound_date` varchar(32) DEFAULT NULL COMMENT '分组验收日期',
  `location_name` varchar(200) DEFAULT NULL COMMENT '存放位置快照',
  `exchange_tracking_no` varchar(64) DEFAULT NULL COMMENT '换货二次发货物流单号',
  `exchange_expected_date` varchar(32) DEFAULT NULL COMMENT '换货预计到货日',
  `exchange_status` varchar(16) DEFAULT NULL COMMENT '换货状态:pending/shipped/received/closed',
  `followup_batch_id` bigint DEFAULT NULL COMMENT '二次验收生成的批次ID',
  `client_line_id` varchar(64) DEFAULT NULL COMMENT '前端稳定ID',
  `source_exchange_item_id` bigint DEFAULT NULL COMMENT '来源换货明细ID',
  PRIMARY KEY (`id`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_batch_item_client_line` (`client_line_id`),
  KEY `idx_batch_item_source_exchange` (`source_exchange_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='驗收入庫批次明細';

DROP TABLE IF EXISTS `biz_eam_inventory_event`;
CREATE TABLE `biz_eam_inventory_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_id` bigint NOT NULL COMMENT '盘点任务 ID',
  `item_id` bigint DEFAULT NULL COMMENT '盘点明细 ID(任务级动作为空)',
  `action` varchar(32) NOT NULL COMMENT '动作 create/check/batch/reset/complete/partial/cancel',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键',
  `request_hash` varchar(64) DEFAULT NULL COMMENT '请求摘要',
  `before_json` text COMMENT '变更前值 JSON',
  `after_json` text COMMENT '变更后值 JSON',
  `reason` varchar(500) DEFAULT NULL COMMENT '原因/说明',
  `operator_id` bigint DEFAULT NULL COMMENT '登录操作人 ID',
  `operator_name` varchar(128) DEFAULT NULL COMMENT '操作人姓名',
  `operator_emp_no` varchar(32) DEFAULT NULL COMMENT '操作人工号',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_request` (`task_id`,`request_key`),
  KEY `idx_event_task` (`task_id`,`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产盘点操作日志表';

DROP TABLE IF EXISTS `biz_eam_inventory_item`;
CREATE TABLE `biz_eam_inventory_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_id` bigint NOT NULL COMMENT '关联盘点任务 ID',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `asset_no` varchar(64) NOT NULL DEFAULT '' COMMENT '资产编号（快照）',
  `asset_name` varchar(256) NOT NULL DEFAULT '' COMMENT '资产名称（快照）',
  `asset_type` varchar(128) DEFAULT NULL COMMENT '资产分类（快照）',
  `location` varchar(200) DEFAULT NULL COMMENT '存放位置（快照）',
  `status` varchar(32) NOT NULL DEFAULT 'pending' COMMENT '盘点状态：pending/normal/lost/damaged',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_by` varchar(128) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(128) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `contract_version` int NOT NULL DEFAULT '1' COMMENT '契约版本(1=历史,2=新版)',
  `book_snapshot_json` text COMMENT '发起时账面快照 JSON',
  `ledger_fingerprint` varchar(64) DEFAULT NULL COMMENT '发起时台账关键字段指纹',
  `actual_location_id` bigint DEFAULT NULL COMMENT '实际位置 ID',
  `actual_location_name` varchar(256) DEFAULT NULL COMMENT '实际位置名称快照',
  `actual_location_other` varchar(256) DEFAULT NULL COMMENT '其他位置自由文本',
  `location_check_result` varchar(16) DEFAULT NULL COMMENT '位置核对 CONSISTENT/DIFF/PENDING/NA',
  `actual_holder_type` varchar(16) DEFAULT NULL COMMENT '实际持有人类型 EMPLOYEE/NONE/EXTERNAL/PENDING',
  `actual_holder_id` bigint DEFAULT NULL COMMENT '实际持有人 sys_user.id',
  `actual_holder_emp_no` varchar(32) DEFAULT NULL COMMENT '实际持有人工号',
  `actual_holder_name` varchar(128) DEFAULT NULL COMMENT '实际持有人姓名',
  `actual_holder_external` varchar(128) DEFAULT NULL COMMENT '外部保管名称',
  `holder_check_result` varchar(16) DEFAULT NULL COMMENT '持有人核对 CONSISTENT/DIFF/PENDING/NA',
  `check_method` varchar(16) DEFAULT NULL COMMENT '核对方式 ONSITE/HOLDER/DOC',
  `checked_at` datetime DEFAULT NULL COMMENT '核对时间',
  `checked_by` varchar(128) DEFAULT NULL COMMENT '核对操作人',
  `checked_by_id` bigint DEFAULT NULL COMMENT '核对操作人 ID',
  `checked_by_emp_no` varchar(32) DEFAULT NULL COMMENT '核对操作人工号',
  `item_revision` int NOT NULL DEFAULT '0' COMMENT '明细修订号(并发控制)',
  `current_snapshot_json` text COMMENT '核对时台账快照 JSON',
  `closed_snapshot_json` text COMMENT '结束时台账比对快照 JSON',
  `recheck_required` tinyint NOT NULL DEFAULT '0' COMMENT '期间业务变更待复核',
  `anomaly_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否异常资产(去重统计)',
  `holder_name` varchar(128) DEFAULT NULL COMMENT '发起时使用人姓名快照',
  `holder_emp_no` varchar(32) DEFAULT NULL COMMENT '发起时使用人工号快照',
  `holder_dept` varchar(128) DEFAULT NULL COMMENT '发起时资产归属部门快照',
  `unique_scope_asset` bigint GENERATED ALWAYS AS ((case when (`contract_version` >= 2) then `asset_id` else NULL end)) STORED COMMENT '新版行资产唯一作用域',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_task_asset_new` (`task_id`,`unique_scope_asset`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_status` (`status`),
  KEY `idx_item_anomaly` (`task_id`,`anomaly_flag`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产盘点明细表';

DROP TABLE IF EXISTS `biz_eam_inventory_task`;
CREATE TABLE `biz_eam_inventory_task` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_no` varchar(64) NOT NULL COMMENT '盘点任务编号（PD+YYYYMMDD+4位）',
  `task_name` varchar(200) NOT NULL COMMENT '盘点任务名称',
  `inventory_date` varchar(20) NOT NULL COMMENT '盘点日期',
  `operator` varchar(128) NOT NULL COMMENT '盘点人',
  `expected_count` int NOT NULL DEFAULT '0' COMMENT '应盘数量',
  `actual_count` int NOT NULL DEFAULT '0' COMMENT '实盘数量',
  `diff_count` int NOT NULL DEFAULT '0' COMMENT '差异数（实盘-应盘）',
  `status` varchar(32) NOT NULL DEFAULT 'in_progress' COMMENT '状态：in_progress/completed/cancelled',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_by` varchar(128) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(128) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `contract_version` int NOT NULL DEFAULT '1' COMMENT '契约版本(1=历史,2=新版)',
  `scope_mode` varchar(16) DEFAULT NULL COMMENT '范围模式 CONDITION/ALL',
  `scope_json` text COMMENT '范围原始条件快照 JSON',
  `scope_resolved_json` text COMMENT '展开后范围 ID/名称快照 JSON',
  `scope_hash` varchar(64) DEFAULT NULL COMMENT '范围指纹',
  `snapshot_at` datetime DEFAULT NULL COMMENT '应盘清单冻结时间',
  `owner_id` bigint DEFAULT NULL COMMENT '盘点负责人 sys_user.id',
  `owner_emp_no` varchar(32) DEFAULT NULL COMMENT '盘点负责人工号',
  `owner_name` varchar(128) DEFAULT NULL COMMENT '盘点负责人姓名',
  `created_by_id` bigint DEFAULT NULL COMMENT '创建人 sys_user.id',
  `created_by_emp_no` varchar(32) DEFAULT NULL COMMENT '创建人工号',
  `task_revision` int NOT NULL DEFAULT '0' COMMENT '任务修订号(并发控制)',
  `checked_count` int NOT NULL DEFAULT '0' COMMENT '已核对数',
  `confirmed_count` int NOT NULL DEFAULT '0' COMMENT '实物确认数(完好+损坏)',
  `anomaly_count` int NOT NULL DEFAULT '0' COMMENT '异常资产去重数',
  `not_checked_count` int NOT NULL DEFAULT '0' COMMENT '未完成核对数',
  `missing_count` int NOT NULL DEFAULT '0' COMMENT '未找到数',
  `damaged_count` int NOT NULL DEFAULT '0' COMMENT '实物损坏数',
  `location_diff_count` int NOT NULL DEFAULT '0' COMMENT '位置差异数',
  `holder_diff_count` int NOT NULL DEFAULT '0' COMMENT '持有人差异数',
  `recheck_count` int NOT NULL DEFAULT '0' COMMENT '期间业务变更待复核数',
  `close_type` varchar(16) DEFAULT NULL COMMENT '结束方式 COMPLETE/PARTIAL/CANCEL',
  `close_reason` varchar(500) DEFAULT NULL COMMENT '结束原因',
  `closed_at` datetime DEFAULT NULL COMMENT '结束时间',
  `closed_by` varchar(128) DEFAULT NULL COMMENT '结束操作人',
  `closed_by_id` bigint DEFAULT NULL COMMENT '结束操作人 ID',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `cancelled_by` varchar(128) DEFAULT NULL COMMENT '取消操作人',
  `cancel_reason` varchar(500) DEFAULT NULL COMMENT '取消原因',
  `create_request_key` varchar(64) DEFAULT NULL COMMENT '创建幂等键',
  `create_request_hash` varchar(64) DEFAULT NULL COMMENT '创建请求摘要',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_no` (`task_no`),
  UNIQUE KEY `uk_task_create_request` (`created_by_id`,`create_request_key`),
  KEY `idx_status` (`status`),
  KEY `idx_inventory_date` (`inventory_date`),
  KEY `idx_task_owner` (`owner_id`),
  KEY `idx_task_created_by` (`created_by`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产盘点任务表';

DROP TABLE IF EXISTS `biz_eam_location`;
CREATE TABLE `biz_eam_location` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '位置编码',
  `name` varchar(100) NOT NULL COMMENT '位置名称',
  `parent_id` bigint NOT NULL DEFAULT '0' COMMENT '父级ID,0为顶级',
  `type` varchar(16) NOT NULL DEFAULT 'warehouse' COMMENT 'warehouse/floor/room',
  `province` varchar(64) DEFAULT '' COMMENT '省份（如：广东省）',
  `city` varchar(64) DEFAULT '' COMMENT '城市（如：珠海市）',
  `district` varchar(64) DEFAULT '' COMMENT '区县（如：香洲区）',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `address` varchar(500) DEFAULT '' COMMENT '地址',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='仓库/存放位置';

DROP TABLE IF EXISTS `biz_eam_loss`;
CREATE TABLE `biz_eam_loss` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `loss_no` varchar(32) NOT NULL COMMENT '遗失编号（YS+YYYYMMDD+4位）',
  `source_type` varchar(16) NOT NULL COMMENT '来源类型：claim/borrow/return/direct',
  `source_id` bigint NOT NULL DEFAULT '0' COMMENT '来源 ID',
  `return_id` bigint DEFAULT NULL COMMENT '关联归还记录 ID',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `asset_no` varchar(64) NOT NULL COMMENT '资产编号（快照）',
  `asset_name` varchar(200) NOT NULL COMMENT '资产名称（快照）',
  `asset_type` varchar(100) DEFAULT NULL COMMENT '资产分类（快照）',
  `brand` varchar(100) DEFAULT NULL COMMENT '品牌（快照）',
  `asset_status_at_loss` varchar(20) DEFAULT NULL COMMENT '遗失时资产状态快照（idle/in_use）',
  `original_holder_id` bigint DEFAULT NULL COMMENT '原持有人 ID（快照）',
  `original_holder_name` varchar(64) DEFAULT NULL COMMENT '原持有人姓名（快照）',
  `original_department` varchar(128) DEFAULT NULL COMMENT '原归属部门（快照）',
  `last_known_location` varchar(200) DEFAULT NULL COMMENT '最后已知位置',
  `loss_date` date NOT NULL COMMENT '遗失日期',
  `loss_reason` varchar(500) NOT NULL COMMENT '报失原因',
  `reporter_id` bigint DEFAULT NULL COMMENT '报失登记人 ID',
  `reporter_name` varchar(64) DEFAULT NULL COMMENT '报失登记人姓名',
  `status` varchar(20) NOT NULL DEFAULT 'searching' COMMENT '状态：searching/found_pending/recovered/written_off',
  `recovered_date` date DEFAULT NULL COMMENT '找回日期',
  `recovered_location` varchar(200) DEFAULT NULL COMMENT '找回地点',
  `recovered_by_id` bigint DEFAULT NULL COMMENT '找回登记人 ID',
  `recovered_by_name` varchar(64) DEFAULT NULL COMMENT '找回登记人姓名',
  `recovered_note` varchar(500) DEFAULT NULL COMMENT '找回说明',
  `inspection_result` varchar(20) DEFAULT NULL COMMENT '验收结果：normal/damaged/scrapped',
  `inspection_date` date DEFAULT NULL COMMENT '验收日期',
  `inspection_note` varchar(500) DEFAULT NULL COMMENT '验收说明',
  `write_off_date` date DEFAULT NULL COMMENT '核销日期',
  `write_off_reason` varchar(500) DEFAULT NULL COMMENT '核销原因',
  `write_off_evidence_id` bigint DEFAULT NULL COMMENT '核销凭证 ID',
  `compensation_id` bigint DEFAULT NULL COMMENT '关联赔付记录 ID',
  `repair_id` bigint DEFAULT NULL COMMENT '关联维修记录 ID',
  `scrap_id` bigint DEFAULT NULL COMMENT '关联报废记录 ID',
  `version` bigint NOT NULL DEFAULT '0' COMMENT '乐观锁版本号',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等请求键',
  `from_migration` tinyint NOT NULL DEFAULT '0' COMMENT '是否历史回填',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_loss_no` (`loss_no`),
  UNIQUE KEY `uk_asset_open` (`asset_id`,`status`) COMMENT '同一资产至多一条未结束遗失单（written_off/recovered 为终态）',
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_status` (`status`),
  KEY `idx_source` (`source_type`,`source_id`),
  KEY `idx_return_id` (`return_id`),
  KEY `idx_compensation_id` (`compensation_id`),
  KEY `idx_loss_date` (`loss_date`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产遗失单';

DROP TABLE IF EXISTS `biz_eam_loss_event`;
CREATE TABLE `biz_eam_loss_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `loss_id` bigint NOT NULL COMMENT '关联遗失单 ID',
  `event_type` varchar(32) NOT NULL COMMENT '事件类型',
  `event_desc` varchar(500) NOT NULL COMMENT '事件描述',
  `before_value` text COMMENT '变更前值（JSON）',
  `after_value` text COMMENT '变更后值（JSON）',
  `change_reason` varchar(500) DEFAULT NULL COMMENT '变更原因',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID',
  `operator_name` varchar(64) DEFAULT NULL COMMENT '操作人姓名',
  `evidence_id` bigint DEFAULT NULL COMMENT '关联凭证 ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_loss_id` (`loss_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产遗失事件日志';

DROP TABLE IF EXISTS `biz_eam_model`;
CREATE TABLE `biz_eam_model` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category_code` varchar(64) NOT NULL COMMENT '所属分类编码',
  `brand_id` bigint NOT NULL DEFAULT '0' COMMENT '所属品牌ID',
  `brand_zh` varchar(100) DEFAULT '' COMMENT '品牌中文(冗余)',
  `brand_en` varchar(100) DEFAULT '' COMMENT '品牌英文(冗余)',
  `brand_logo` varchar(500) DEFAULT '' COMMENT '品牌LOGO(冗余)',
  `code` varchar(32) DEFAULT NULL COMMENT '产品编码（品牌编码-3位序号）',
  `model_no` varchar(100) DEFAULT '' COMMENT '产品型号编码',
  `name` varchar(200) NOT NULL COMMENT '产品名称',
  `unit` varchar(32) NOT NULL DEFAULT '台' COMMENT '计量单位',
  `ref_price` decimal(14,2) DEFAULT '0.00' COMMENT '参考单价',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_category_code` (`category_code`),
  KEY `idx_brand_id` (`brand_id`),
  KEY `idx_name` (`name`),
  KEY `idx_model_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品型号库';

DROP TABLE IF EXISTS `biz_eam_param_type`;
CREATE TABLE `biz_eam_param_type` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `category_code` varchar(64) NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(100) NOT NULL,
  `unit` varchar(32) DEFAULT '',
  `value_type` varchar(16) NOT NULL DEFAULT 'select',
  `status` varchar(16) NOT NULL DEFAULT 'enabled',
  `sort` int NOT NULL DEFAULT '0',
  `updated_by` varchar(64) DEFAULT '',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `description` varchar(500) DEFAULT NULL COMMENT '参数描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_category_code` (`category_code`,`code`),
  KEY `idx_category_code` (`category_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='參數類型';

DROP TABLE IF EXISTS `biz_eam_param_value`;
CREATE TABLE `biz_eam_param_value` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `param_type_code` varchar(64) NOT NULL,
  `category_code` varchar(64) NOT NULL,
  `value` varchar(200) NOT NULL,
  `sort` int NOT NULL DEFAULT '0',
  `status` varchar(16) NOT NULL DEFAULT 'enabled',
  `updated_by` varchar(64) DEFAULT '',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_param_type_code` (`param_type_code`),
  KEY `idx_category_code` (`category_code`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='參數值';

DROP TABLE IF EXISTS `biz_eam_purchase_order`;
CREATE TABLE `biz_eam_purchase_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `po_no` varchar(32) NOT NULL COMMENT '訂單編號（PO+序號）',
  `req_id` bigint DEFAULT '0' COMMENT '關聯採購申請 ID（0=直接下單）',
  `supplier` varchar(200) NOT NULL DEFAULT '' COMMENT '供應商（兼容舊數據）',
  `amount` decimal(14,2) DEFAULT '0.00' COMMENT '訂單金額（預估）',
  `confirmed_amount` decimal(14,2) DEFAULT NULL COMMENT '實際成交金額',
  `delivery_date` varchar(32) DEFAULT '' COMMENT '預計交貨日期',
  `purchaser` varchar(64) DEFAULT '' COMMENT '採購經辦人',
  `department` varchar(100) DEFAULT '' COMMENT '服務部門（持久化）',
  `brand` tinyint DEFAULT NULL COMMENT '所属品牌：1=闪蜂, 2=mFood',
  `remark` varchar(500) DEFAULT '' COMMENT '採購事由/備註',
  `tracking_no` varchar(64) DEFAULT '' COMMENT '快遞單號（兼容舊數據）',
  `contact` varchar(64) DEFAULT '' COMMENT '供應商聯絡人（兼容舊數據）',
  `order_date` varchar(32) DEFAULT '' COMMENT '下單日期（兼容舊數據）',
  `exec_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/purchasing/completed',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '驗收狀態：pending/partial/received',
  `accepted_qty` int DEFAULT '0' COMMENT '已驗收總數',
  `return_qty` int DEFAULT '0' COMMENT '退貨總數',
  `exchange_qty` int DEFAULT '0' COMMENT '換貨總數',
  `concession_qty` int DEFAULT '0' COMMENT '讓步接收總數',
  `supplier_groups` json DEFAULT NULL COMMENT '供應商分組 JSON',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最後更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `contact_phone` varchar(64) DEFAULT NULL COMMENT '供應商聯絡人電話',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_po_no` (`po_no`),
  KEY `idx_req_id` (`req_id`),
  KEY `idx_exec_status` (`exec_status`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='採購訂單';

DROP TABLE IF EXISTS `biz_eam_purchase_order_item`;
CREATE TABLE `biz_eam_purchase_order_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `order_id` bigint NOT NULL COMMENT '所屬訂單 ID',
  `group_id` varchar(64) DEFAULT '' COMMENT '所屬供應商分組 ID',
  `model_id` bigint DEFAULT NULL COMMENT '資產型號 ID',
  `model_name` varchar(200) DEFAULT '' COMMENT '資產名稱',
  `category_id` bigint DEFAULT NULL COMMENT '分類 ID',
  `category_name` varchar(100) DEFAULT '' COMMENT '分類名稱',
  `category_code` varchar(64) DEFAULT '' COMMENT '分類編碼',
  `brand_id` bigint DEFAULT NULL COMMENT '品牌 ID',
  `brand_name` varchar(100) DEFAULT '' COMMENT '品牌名稱',
  `params` json DEFAULT NULL COMMENT '參數信息 JSON',
  `purchase_type` varchar(16) DEFAULT 'purchase' COMMENT 'purchase/lease',
  `qty` int NOT NULL DEFAULT '1' COMMENT '數量',
  `price` decimal(14,2) DEFAULT '0.00' COMMENT '參考單價',
  `confirmed_price` decimal(14,2) DEFAULT NULL COMMENT '成交單價',
  `received_qty` int NOT NULL DEFAULT '0' COMMENT '已驗收數量',
  `sort_order` int DEFAULT '0',
  `returned_qty` int NOT NULL DEFAULT '0' COMMENT '累计退货数量(终态)',
  `exchanged_qty` int NOT NULL DEFAULT '0' COMMENT '累计换货在途数量',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_group_id` (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='採購訂單明細';

DROP TABLE IF EXISTS `biz_eam_purchase_request`;
CREATE TABLE `biz_eam_purchase_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `req_no` varchar(32) NOT NULL COMMENT '申請編號（CG+序號）',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '關聯 OA 流程編號',
  `title` varchar(200) NOT NULL COMMENT '申請標題',
  `department` varchar(100) NOT NULL DEFAULT '' COMMENT '申請部門',
  `department_id` bigint DEFAULT NULL COMMENT '申請部門 ID',
  `applicant` varchar(64) NOT NULL COMMENT '申請人',
  `applicant_emp_id` varchar(32) DEFAULT '' COMMENT '申請人工號',
  `reason` varchar(500) NOT NULL DEFAULT '' COMMENT '採購事由',
  `budget` decimal(14,2) DEFAULT '0.00' COMMENT '預算金額',
  `brand` tinyint DEFAULT NULL COMMENT '所属品牌：1=闪蜂, 2=mFood',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
  `order_id` bigint DEFAULT NULL COMMENT '審批通過後生成的採購訂單 ID',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_req_no` (`req_no`),
  KEY `idx_flow_no` (`flow_no`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='採購申請';

DROP TABLE IF EXISTS `biz_eam_repair`;
CREATE TABLE `biz_eam_repair` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `asset_no` varchar(64) NOT NULL DEFAULT '' COMMENT '资产编号（快照）',
  `asset_name` varchar(128) NOT NULL DEFAULT '' COMMENT '资产名称（快照）',
  `repair_date` varchar(20) NOT NULL DEFAULT '' COMMENT '维修日期',
  `fault_desc` varchar(500) NOT NULL DEFAULT '' COMMENT '故障描述',
  `repair_content` varchar(500) NOT NULL DEFAULT '' COMMENT '维修内容',
  `repair_by` varchar(100) NOT NULL DEFAULT '' COMMENT '维修方',
  `cost` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '维修费用（MOP）',
  `finish_date` varchar(20) DEFAULT NULL COMMENT '完成日期',
  `status` varchar(16) NOT NULL DEFAULT 'repairing' COMMENT '状态：repairing/done',
  `applicant` varchar(64) NOT NULL DEFAULT '' COMMENT '申请人/部门',
  `cause_type` varchar(20) DEFAULT NULL COMMENT '损坏原因',
  `return_id` bigint DEFAULT NULL COMMENT '关联归还记录 ID',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `original_holder_id` bigint DEFAULT NULL COMMENT '送修前资产当前使用人 ID 快照',
  `original_holder_name` varchar(128) DEFAULT NULL COMMENT '送修前资产当前使用人姓名快照',
  `source_claim_id` bigint DEFAULT NULL COMMENT '送修前活跃领用 ID 快照',
  `source_borrow_id` bigint DEFAULT NULL COMMENT '送修前活跃借用 ID 快照',
  `hold_type` varchar(20) DEFAULT NULL COMMENT '送修时持有方式快照：owned/borrowed',
  `request_key` varchar(64) DEFAULT NULL COMMENT '直接登记幂等请求键',
  PRIMARY KEY (`id`),
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_status` (`status`),
  KEY `idx_repair_date` (`repair_date`),
  KEY `idx_return_id` (`return_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产维修记录表';

DROP TABLE IF EXISTS `biz_eam_return`;
CREATE TABLE `biz_eam_return` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `return_no` varchar(32) NOT NULL COMMENT '归还编号',
  `claim_id` bigint DEFAULT NULL COMMENT '关联领用 ID',
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `employee_id` bigint NOT NULL COMMENT '归还人 ID',
  `operator_name` varchar(64) NOT NULL COMMENT '操作人姓名',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 ID（归还接收人）',
  `return_date` date NOT NULL COMMENT '归还日期',
  `return_reason` varchar(500) DEFAULT NULL COMMENT '归还原因',
  `condition_note` varchar(500) DEFAULT NULL COMMENT '资产状况说明',
  `return_evidence_id` bigint DEFAULT NULL COMMENT '归还凭证 ID',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `return_status` varchar(20) NOT NULL DEFAULT 'completed' COMMENT '归还状态：completed/exception_pending/exception_closed',
  `asset_condition` varchar(20) NOT NULL DEFAULT 'normal' COMMENT '归还时资产状况：normal/damaged/lost',
  `exception_reason` varchar(500) DEFAULT NULL COMMENT '异常原因说明',
  `disposition` varchar(20) DEFAULT NULL COMMENT '实物处置结果：idle/scrapped/written_off',
  `disposition_date` date DEFAULT NULL COMMENT '处置日期',
  `disposition_evidence_id` bigint DEFAULT NULL COMMENT '处置凭证 ID',
  `recovered` tinyint NOT NULL DEFAULT '0' COMMENT '是否已找回：0=否 1=是',
  `recovered_date` date DEFAULT NULL COMMENT '找回日期',
  `recovered_note` varchar(500) DEFAULT NULL COMMENT '找回说明',
  `actual_returnee_id` bigint DEFAULT NULL COMMENT '实际归还人 ID（代还场景）',
  `actual_returnee_name` varchar(64) DEFAULT NULL COMMENT '实际归还人姓名',
  `source_type` varchar(10) NOT NULL DEFAULT 'claim' COMMENT '来源类型：claim/borrow',
  `source_id` bigint NOT NULL DEFAULT '0' COMMENT '来源 ID（claim_id 或 borrow_id）',
  `compensation_id` bigint DEFAULT NULL COMMENT '关联赔付记录 ID',
  `repair_id` bigint DEFAULT NULL COMMENT '关联维修记录 ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_no` (`return_no`),
  KEY `idx_claim` (`claim_id`),
  KEY `idx_asset` (`asset_id`),
  KEY `idx_return_status` (`return_status`),
  KEY `idx_source` (`source_type`,`source_id`),
  KEY `idx_compensation` (`compensation_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产归还记录表';

DROP TABLE IF EXISTS `biz_eam_scrap`;
CREATE TABLE `biz_eam_scrap` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_id` bigint NOT NULL COMMENT '资产 ID',
  `scrap_no` varchar(64) DEFAULT NULL COMMENT '报废编号',
  `asset_no` varchar(64) NOT NULL COMMENT '资产编号（快照）',
  `asset_name` varchar(200) NOT NULL COMMENT '资产名称（快照）',
  `asset_type` varchar(100) DEFAULT NULL COMMENT '资产分类（快照）',
  `brand` varchar(100) DEFAULT NULL COMMENT '品牌（快照）',
  `company_brand` int DEFAULT NULL COMMENT '所属品牌/公司品牌ID（快照）',
  `scrap_date` date NOT NULL COMMENT '报废日期',
  `apply_by` varchar(64) NOT NULL COMMENT '申请人',
  `emp_id` varchar(32) DEFAULT NULL COMMENT '申请人工号',
  `reason` varchar(500) NOT NULL COMMENT '报废原因',
  `residual_value` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '残值（MOP）',
  `dispose_type` varchar(20) DEFAULT NULL COMMENT '处置方式：sale/donate/recycle/destroy',
  `appraisal` varchar(500) DEFAULT NULL COMMENT '鉴定意见',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `return_id` bigint DEFAULT NULL COMMENT '关联归还记录 ID',
  `loss_id` bigint DEFAULT NULL COMMENT '关联遗失单 ID（遗失核销时有值）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled',
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `original_holder_id` bigint DEFAULT NULL COMMENT '报废前资产当前使用人 ID 快照',
  `original_holder_name` varchar(128) DEFAULT NULL COMMENT '报废前资产当前使用人姓名快照',
  `source_claim_id` bigint DEFAULT NULL COMMENT '报废前活跃领用 ID 快照',
  `source_borrow_id` bigint DEFAULT NULL COMMENT '报废前活跃借用 ID 快照',
  `request_key` varchar(64) DEFAULT NULL COMMENT '直接登记幂等请求键',
  PRIMARY KEY (`id`),
  KEY `idx_asset` (`asset_id`),
  KEY `idx_return` (`return_id`),
  KEY `idx_status` (`status`),
  KEY `idx_scrap_date` (`scrap_date`),
  KEY `idx_loss_id` (`loss_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产报废记录表';

DROP TABLE IF EXISTS `biz_eam_supplier`;
CREATE TABLE `biz_eam_supplier` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '供应商编码（系统自动生成，格式 CGSJ + 6位自增数字，如 CGSJ000001）',
  `name` varchar(200) NOT NULL COMMENT '供应商名称',
  `contact_person` varchar(100) DEFAULT '' COMMENT '联系人',
  `contact_phone` varchar(64) DEFAULT '' COMMENT '联系电话',
  `bank_name` varchar(200) DEFAULT '' COMMENT '开户银行',
  `bank_account` varchar(64) DEFAULT '' COMMENT '银行账号',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_code` (`code`),
  KEY `idx_supplier_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商管理';

DROP TABLE IF EXISTS `biz_eam_supplier_contact`;
CREATE TABLE `biz_eam_supplier_contact` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `supplier_id` bigint NOT NULL COMMENT '关联供应商ID',
  `contact_name` varchar(100) NOT NULL COMMENT '联系人姓名',
  `contact_phone` varchar(64) DEFAULT NULL COMMENT '联系电话',
  `status` varchar(16) DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_contact_supplier` (`supplier_id`),
  KEY `idx_contact_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商联系人';

DROP TABLE IF EXISTS `biz_eam_transfer`;
CREATE TABLE `biz_eam_transfer` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transfer_no` varchar(64) NOT NULL COMMENT '调拨单号（DB+YYYYMMDD+4位）',
  `asset_id` bigint NOT NULL COMMENT '资产ID',
  `asset_no` varchar(64) NOT NULL COMMENT '资产编号快照',
  `asset_name` varchar(200) DEFAULT '' COMMENT '资产名称快照',
  `from_user_id` bigint DEFAULT NULL COMMENT '原使用人ID',
  `from_user_name` varchar(128) DEFAULT '' COMMENT '原使用人快照',
  `from_department` varchar(128) DEFAULT '' COMMENT '原归属部门快照',
  `to_user_id` bigint DEFAULT NULL COMMENT '新使用人ID',
  `to_user_name` varchar(128) NOT NULL COMMENT '新使用人姓名',
  `to_user_emp_id` varchar(32) DEFAULT '' COMMENT '新使用人工号',
  `to_department` varchar(128) NOT NULL COMMENT '新归属部门',
  `transfer_date` date NOT NULL COMMENT '调拨日期',
  `reason` varchar(500) NOT NULL COMMENT '调拨原因',
  `status` varchar(32) NOT NULL DEFAULT 'done' COMMENT '状态：done/cancelled',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人ID',
  `operator_name` varchar(128) NOT NULL COMMENT '操作人姓名',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(128) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `from_user_emp_id` varchar(50) DEFAULT NULL COMMENT '原使用人工号',
  `brand_id` bigint DEFAULT NULL,
  `brand` varchar(128) DEFAULT NULL,
  `brand_backfilled` tinyint NOT NULL DEFAULT '0',
  `from_department_id` bigint DEFAULT NULL,
  `to_department_id` bigint DEFAULT NULL,
  `from_claim_id` bigint DEFAULT NULL,
  `to_claim_id` bigint DEFAULT NULL,
  `from_usage_date` varchar(32) DEFAULT NULL,
  `applied_version` bigint DEFAULT NULL,
  `request_key` varchar(64) DEFAULT NULL,
  `request_hash` varchar(64) DEFAULT NULL,
  `cancel_reason` varchar(500) DEFAULT NULL,
  `cancelled_by` varchar(128) DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transfer_no` (`transfer_no`),
  UNIQUE KEY `uk_transfer_request` (`operator_id`,`request_key`),
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_asset_no` (`asset_no`),
  KEY `idx_transfer_date` (`transfer_date`),
  KEY `idx_status` (`status`),
  KEY `idx_transfer_asset` (`asset_id`,`id`),
  KEY `idx_transfer_brand` (`brand_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产调拨单';

DROP TABLE IF EXISTS `biz_fin_account`;
CREATE TABLE `biz_fin_account` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID (关联 biz_merchant_group.group_code)',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称快照',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee=闪蜂 / mFood',
  `virtual_balance` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '虚拟账户余额',
  `actual_balance` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '实收账户余额',
  `status` varchar(16) NOT NULL DEFAULT 'normal' COMMENT '账户状态: normal=正常 frozen=已冻结 mergeFrozen=合并冻结 cancelled=已注销',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_account_group_brand` (`group_code`,`brand`),
  KEY `idx_fin_account_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金账户表';

DROP TABLE IF EXISTS `biz_fin_approval`;
CREATE TABLE `biz_fin_approval` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `flow_no` varchar(32) NOT NULL COMMENT '流程编号: CZ=充值 KK=扣款 ZZ=转账 HB=合并 + 年月日 + 4位自增',
  `approval_type` varchar(16) NOT NULL COMMENT '审批类型: recharge/transfer/deduct/merge',
  `group_code` varchar(32) NOT NULL COMMENT '申请集团ID',
  `group_name` varchar(128) NOT NULL COMMENT '申请集团名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `applicant` varchar(64) DEFAULT NULL COMMENT '申请人: 姓名(工号)',
  `apply_time` datetime DEFAULT NULL COMMENT '申请时间',
  `biz_approver` varchar(64) DEFAULT NULL COMMENT '业务主管审批人',
  `biz_approve_time` datetime DEFAULT NULL COMMENT '业务主管审批时间',
  `biz_approve_status` varchar(16) DEFAULT 'pending' COMMENT '业务主管审批状态: pending/approved/rejected',
  `ops_approver` varchar(64) DEFAULT NULL COMMENT '运营主管审批人',
  `ops_approve_time` datetime DEFAULT NULL COMMENT '运营主管审批时间',
  `ops_approve_status` varchar(16) DEFAULT 'pending' COMMENT '运营主管审批状态: pending/approved/rejected',
  `fin_approver` varchar(64) DEFAULT NULL COMMENT '财务主管审批人',
  `fin_approve_time` datetime DEFAULT NULL COMMENT '财务主管审批时间',
  `fin_approve_status` varchar(16) DEFAULT 'pending' COMMENT '财务主管审批状态: pending/approved/rejected',
  `flow_status` varchar(16) DEFAULT 'pending' COMMENT '流程状态: pending=审批中 approved=已通过 rejected=已驳回 cancelled=已撤销',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回理由',
  `extra` json DEFAULT NULL COMMENT '申请表单扩展数据(结算方式/扣款门店/对方集团/偿还门店等)',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `approval_nodes` text COMMENT '实际审批节点实例JSON',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_approval_flow` (`flow_no`),
  KEY `idx_fin_approval_group` (`group_code`),
  KEY `idx_fin_approval_status` (`flow_status`),
  KEY `idx_fin_approval_type` (`approval_type`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='财务审批流程表';

DROP TABLE IF EXISTS `biz_fin_batch`;
CREATE TABLE `biz_fin_batch` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `batch_no` varchar(32) NOT NULL COMMENT '批次号: PC + 年月日 + 4位自增',
  `batch_type` varchar(16) NOT NULL COMMENT '批次类型: recharge/transfer/merge',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '关联流程编号',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `trade_time` datetime DEFAULT NULL COMMENT '交易时间(审批通过时间)',
  `is_actual` varchar(8) DEFAULT NULL COMMENT '是否实收: 是/否/--',
  `virtual_amount` decimal(14,2) DEFAULT NULL COMMENT '虚拟账户金额(负数=转出/扣减)',
  `actual_amount` decimal(14,2) DEFAULT NULL COMMENT '实收账户金额(NULL=不涉及)',
  `discount_amount` decimal(14,2) DEFAULT NULL COMMENT '优惠金额',
  `applicant` varchar(64) DEFAULT NULL COMMENT '申请人',
  `bd` varchar(64) DEFAULT NULL COMMENT '所属BD',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `extra` json DEFAULT NULL COMMENT '批次明细页展示数据(结算方式/扣款门店/偿还门店等)',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_batch_no_group` (`batch_no`,`group_code`),
  KEY `idx_fin_batch_group` (`group_code`),
  KEY `idx_fin_batch_flow` (`flow_no`),
  KEY `idx_fin_batch_time` (`trade_time`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金批次表';

DROP TABLE IF EXISTS `biz_fin_debt_bill`;
CREATE TABLE `biz_fin_debt_bill` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `bill_no` varchar(32) NOT NULL COMMENT '账单编号: QK + 年月日 + 4位自增',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `store_code` varchar(32) DEFAULT NULL COMMENT '门店ID',
  `store_name` varchar(128) DEFAULT NULL COMMENT '门店名称',
  `channel` varchar(64) DEFAULT NULL COMMENT '业务频道',
  `bd` varchar(64) DEFAULT NULL COMMENT '所属BD',
  `source` varchar(16) NOT NULL COMMENT '账单来源: recharge=充值营业额扣款 merge=合并欠款转入',
  `loan_date` date DEFAULT NULL COMMENT '借款日期(审批通过日期)',
  `batch_no` varchar(32) DEFAULT NULL COMMENT '关联批次号',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '流程编号',
  `debt_total` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '欠款总额',
  `paid_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '已还金额(还款明细合计，含转移结算)',
  `remain_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '剩余待还 = 欠款总额 - 已还金额',
  `status` varchar(16) NOT NULL DEFAULT 'unsettled' COMMENT '账单状态: unsettled=未结清 settled=已结清 transferred=已转结',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_debt_bill_no` (`bill_no`),
  KEY `idx_fin_debt_group` (`group_code`),
  KEY `idx_fin_debt_store` (`store_code`),
  KEY `idx_fin_debt_status` (`status`),
  KEY `idx_fin_debt_brand` (`brand`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='欠款单表';

DROP TABLE IF EXISTS `biz_fin_debt_repayment`;
CREATE TABLE `biz_fin_debt_repayment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `bill_id` bigint NOT NULL COMMENT '欠款单ID (关联 biz_fin_debt_bill.id)',
  `bill_no` varchar(32) NOT NULL COMMENT '账单编号快照',
  `repay_date` date DEFAULT NULL COMMENT '还款日期',
  `channel` varchar(32) NOT NULL COMMENT '还款渠道: 推广金扣款/营业额扣款/对公转账/转移结算',
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '还款金额',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `operator` varchar(64) DEFAULT NULL COMMENT '操作人',
  `operate_time` datetime DEFAULT NULL COMMENT '操作时间',
  `can_delete` tinyint DEFAULT '1' COMMENT '是否可删除: 1=可删除 0=系统生成不可删除',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_fin_repay_bill` (`bill_id`),
  KEY `idx_fin_repay_bill_no` (`bill_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='欠款还款明细表';

DROP TABLE IF EXISTS `biz_fin_detail`;
CREATE TABLE `biz_fin_detail` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `detail_id` varchar(32) NOT NULL COMMENT '明细ID: MX + 年月日 + 4位自增',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌',
  `store_code` varchar(32) DEFAULT NULL COMMENT '门店ID(集团维度记 --)',
  `store_name` varchar(128) DEFAULT NULL COMMENT '门店名称',
  `channel` varchar(64) DEFAULT NULL COMMENT '业务频道: 美食外卖/超市百货/团购到店',
  `trade_type` varchar(16) DEFAULT NULL COMMENT '交易类型: 充值/扣款/消费/转入/转出',
  `change_type` varchar(64) DEFAULT NULL COMMENT '变动类别: 充值/充值批次扣款/账户扣款/欠款偿还/转账转出/转账转入/合并转出/合并转入等',
  `trade_time` datetime DEFAULT NULL COMMENT '交易时间',
  `virtual_change` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT '虚拟账户变动金额(+增 -减)',
  `actual_change` decimal(14,2) DEFAULT NULL COMMENT '实收账户变动金额(NULL=不涉及，展示 --)',
  `batch_no` varchar(32) DEFAULT NULL COMMENT '关联批次号',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '流程编号',
  `bd` varchar(64) DEFAULT NULL COMMENT '所属BD',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_detail_id` (`detail_id`),
  KEY `idx_fin_detail_group_time` (`group_code`,`trade_time`),
  KEY `idx_fin_detail_batch` (`batch_no`),
  KEY `idx_fin_detail_flow` (`flow_no`),
  KEY `idx_fin_detail_store` (`store_code`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金交易明细表';

DROP TABLE IF EXISTS `biz_fin_risk_config`;
CREATE TABLE `biz_fin_risk_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID (关联 biz_merchant_group.group_code)',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称快照',
  `brand` varchar(64) NOT NULL COMMENT '所属品牌: flashBee=闪蜂 / mFood',
  `status` varchar(16) NOT NULL DEFAULT 'enabled' COMMENT '状态: enabled=启用 disabled=停用',
  `release_mode` varchar(16) NOT NULL DEFAULT 'repay' COMMENT '未付部分释放方式: repay=还款释放 monthly=每月比例释放',
  `monthly_release_ratio` decimal(6,4) DEFAULT NULL COMMENT '每月释放比例(小数, 如0.1000=10%/月, monthly模式生效)',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注 (白名单原因等)',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_risk_group_brand` (`group_code`,`brand`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金消费风控配置表';

DROP TABLE IF EXISTS `biz_flash_sale_period`;
CREATE TABLE `biz_flash_sale_period` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `period_no` int NOT NULL COMMENT '期数（如 85）',
  `start_date` date DEFAULT NULL COMMENT '开始日期',
  `end_date` date DEFAULT NULL COMMENT '结束日期',
  `status` tinyint NOT NULL DEFAULT '2' COMMENT '状态: 1=进行中, 2=已结束',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_period_no` (`period_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='秒杀期数表';

DROP TABLE IF EXISTS `biz_flash_sale_price_tier`;
CREATE TABLE `biz_flash_sale_price_tier` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `owner_type` varchar(10) NOT NULL COMMENT '归属: register=登记, stats=统计',
  `owner_id` bigint NOT NULL COMMENT '归属记录ID',
  `tier_no` int NOT NULL COMMENT '阶梯序号（从1开始）',
  `tier_price` decimal(10,2) NOT NULL COMMENT '阶梯价',
  `tier_stock` int NOT NULL DEFAULT '0' COMMENT '阶梯库存',
  `tier_subsidy` decimal(10,2) DEFAULT NULL COMMENT '阶梯补贴（统计来源可为 NULL）',
  PRIMARY KEY (`id`),
  KEY `idx_owner` (`owner_type`,`owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='秒杀价阶梯表';

DROP TABLE IF EXISTS `biz_flash_sale_register`;
CREATE TABLE `biz_flash_sale_register` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `period_id` bigint NOT NULL COMMENT '期数ID',
  `seq_no` int DEFAULT NULL COMMENT '序号',
  `subsidy_type` varchar(20) NOT NULL COMMENT '补贴类型: ka/procurement/bd_submit/platform/merchant',
  `store_codes` varchar(512) DEFAULT NULL COMMENT '门店编码（多个逗号分隔，引用门店管理）',
  `store_names` varchar(1024) DEFAULT NULL COMMENT '门店名称（冗余展示）',
  `bd_names` varchar(255) DEFAULT NULL COMMENT 'BD姓名（门店-BD 自动带出快照，多个逗号分隔）',
  `product_id` varchar(32) NOT NULL COMMENT '商品ID',
  `product_name` varchar(255) DEFAULT NULL COMMENT '商品名称',
  `product_type` varchar(20) DEFAULT NULL COMMENT '商品类型: tuan_dan=团单, voucher=代金券',
  `max_purchase` varchar(50) DEFAULT NULL COMMENT '每人最多购买（自由文本: 不限购/限购1/阶梯限购1…）',
  `price_type` varchar(10) NOT NULL DEFAULT 'single' COMMENT '价格类型: single=单一价格, tier=阶梯价格',
  `original_price` decimal(10,2) DEFAULT NULL COMMENT '原价',
  `group_price` decimal(10,2) DEFAULT NULL COMMENT '团购价',
  `flash_sale_price` decimal(10,2) DEFAULT NULL COMMENT '秒杀价（单一价格）',
  `flash_sale_stock` int DEFAULT NULL COMMENT '秒杀库存（单一价格）',
  `current_sales` int NOT NULL DEFAULT '0' COMMENT '本期秒杀销量（统计导入后回填）',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_period_product` (`period_id`,`product_id`),
  KEY `idx_period` (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='秒杀商品登记表';

DROP TABLE IF EXISTS `biz_flash_sale_stats`;
CREATE TABLE `biz_flash_sale_stats` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `period_id` bigint NOT NULL COMMENT '期数ID',
  `product_id` varchar(32) NOT NULL COMMENT '商品ID',
  `product_name` varchar(255) DEFAULT NULL COMMENT '商品名称',
  `store_names` text COMMENT '商品门店（多个分号分隔）',
  `price_type` varchar(10) NOT NULL DEFAULT 'single' COMMENT '价格类型: single/tier',
  `flash_sale_price` decimal(10,2) DEFAULT NULL COMMENT '秒杀价（单一价格）',
  `order_users` int DEFAULT NULL COMMENT '下单用户',
  `total_price` decimal(12,2) DEFAULT NULL COMMENT '总价',
  `total_orders` int DEFAULT NULL COMMENT '订单总数',
  `total_sales` int DEFAULT NULL COMMENT '商品总销量',
  `actual_amount` decimal(12,2) DEFAULT NULL COMMENT '实付金额',
  `order_users_change` decimal(10,4) DEFAULT NULL COMMENT '下单用户环比（NULL=无上期数据）',
  `total_price_change` decimal(10,4) DEFAULT NULL COMMENT '总价环比',
  `total_orders_change` decimal(10,4) DEFAULT NULL COMMENT '订单总数环比',
  `total_sales_change` decimal(10,4) DEFAULT NULL COMMENT '商品总销量环比',
  `actual_amount_change` decimal(10,4) DEFAULT NULL COMMENT '实付金额环比',
  `subsidy_type` varchar(20) DEFAULT NULL COMMENT '是否补贴品: ka/procurement/bd_submit/platform/none',
  `discount_rate` decimal(10,6) DEFAULT NULL COMMENT '折扣率',
  `last_period_subsidy` varchar(20) DEFAULT NULL COMMENT '上期有无补贴: 5类/none/none_data=无上期数据',
  `bd_name` varchar(50) DEFAULT NULL COMMENT '所属BD',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_period_product` (`period_id`,`product_id`),
  KEY `idx_period` (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='秒杀商品统计表';

DROP TABLE IF EXISTS `biz_flash_sale_summary`;
CREATE TABLE `biz_flash_sale_summary` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `period_id` bigint NOT NULL COMMENT '期数ID',
  `stat_date` date DEFAULT NULL COMMENT '统计日期（NULL=整期合计行）',
  `total_payable` decimal(12,2) DEFAULT NULL COMMENT '总应付金额',
  `total_actual` decimal(12,2) DEFAULT NULL COMMENT '总实付金额',
  `total_orders` int DEFAULT NULL COMMENT '订单总数',
  `total_sales` int DEFAULT NULL COMMENT '商品总销量',
  `total_products` int DEFAULT NULL COMMENT '总商品数',
  `sold_products` int DEFAULT NULL COMMENT '动销商品数',
  `buyers` int DEFAULT NULL COMMENT '购买人数(已去重)',
  `repurchase_buyers` int DEFAULT NULL COMMENT '复购人数',
  `repurchase_rate` decimal(10,6) DEFAULT NULL COMMENT '复购率',
  `avg_order_value` decimal(10,2) DEFAULT NULL COMMENT '人均客单价',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_period_date` (`period_id`,`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='秒杀每日汇总表';

DROP TABLE IF EXISTS `biz_gift_consume`;
CREATE TABLE `biz_gift_consume` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `gift_record_id` bigint NOT NULL COMMENT '关联赠送记录ID',
  `gift_id` varchar(32) DEFAULT NULL COMMENT '关联赠送ID（冗余方便查询）',
  `group_id` bigint DEFAULT NULL COMMENT '集团ID',
  `group_name` varchar(128) DEFAULT NULL COMMENT '集团名称快照',
  `store_id` bigint DEFAULT NULL COMMENT '门店ID',
  `store_name` varchar(128) DEFAULT NULL COMMENT '门店名称快照',
  `brand` varchar(32) DEFAULT NULL COMMENT '品牌',
  `ad_type` varchar(32) DEFAULT NULL COMMENT '广告类型',
  `trade_type` varchar(32) NOT NULL COMMENT '交易类型: ad_purchase/ad_refund/manual_deduct/auto_expire',
  `balance_change` int NOT NULL COMMENT '余额变动（正=增加，负=减少）',
  `change_date` date DEFAULT NULL COMMENT '变动日期',
  `algorithm_id` varchar(32) DEFAULT NULL COMMENT '广告算法ID',
  `algorithm_name` varchar(128) DEFAULT NULL COMMENT '广告算法名称',
  `order_no` varchar(64) DEFAULT NULL COMMENT '关联订单号',
  `remaining_days` int DEFAULT NULL COMMENT '变动后剩余天数',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_consume_gift_record` (`gift_record_id`),
  KEY `idx_consume_gift_id` (`gift_id`),
  KEY `idx_consume_group` (`group_id`),
  KEY `idx_consume_store` (`store_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赠送消费流水表';

DROP TABLE IF EXISTS `biz_gift_record`;
CREATE TABLE `biz_gift_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `gift_id` varchar(32) NOT NULL COMMENT '赠送ID（业务生成，如 2401-001）',
  `group_id` bigint NOT NULL COMMENT '集团ID',
  `group_name` varchar(128) DEFAULT NULL COMMENT '集团名称快照',
  `store_id` bigint NOT NULL COMMENT '门店ID',
  `store_name` varchar(128) DEFAULT NULL COMMENT '门店名称快照',
  `brand` varchar(32) DEFAULT NULL COMMENT '品牌',
  `ad_type` varchar(32) NOT NULL COMMENT '广告类型: new_store/revival/exclusive/gold/ka',
  `total_days` int NOT NULL COMMENT '赠送总天数',
  `valid_days` int NOT NULL COMMENT '有效天数',
  `used_days` int DEFAULT '0' COMMENT '已使用天数',
  `remaining_days` int NOT NULL COMMENT '剩余天数',
  `gift_date` date DEFAULT NULL COMMENT '赠送日期',
  `expire_date` date DEFAULT NULL COMMENT '到期日期',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=可用 2=已用完 3=已过期',
  `reason` varchar(500) DEFAULT NULL COMMENT '赠送原因',
  `credentials` text COMMENT '凭证URL JSON数组',
  `approval_no` varchar(64) DEFAULT NULL COMMENT '审批流程编号',
  `applicant` varchar(64) DEFAULT NULL COMMENT '申请人',
  `apply_time` datetime DEFAULT NULL COMMENT '申请时间',
  `approval_status` tinyint DEFAULT '1' COMMENT '审批状态: 1=未审批 2=已审批 3=驳回',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gift_id` (`gift_id`),
  KEY `idx_gift_group` (`group_id`),
  KEY `idx_gift_store` (`store_id`),
  KEY `idx_gift_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赠送记录表';

DROP TABLE IF EXISTS `biz_llm_usage`;
CREATE TABLE `biz_llm_usage` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `mode` varchar(16) NOT NULL,
  `channel` varchar(16) NOT NULL,
  `model` varchar(64) NOT NULL,
  `prompt_tokens` int NOT NULL DEFAULT '0',
  `completion_tokens` int NOT NULL DEFAULT '0',
  `cached_tokens` int NOT NULL DEFAULT '0',
  `cost` decimal(12,6) NOT NULL DEFAULT '0.000000',
  `currency` varchar(8) NOT NULL DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `verification_status` varchar(16) NOT NULL DEFAULT 'ESTIMATED' COMMENT 'VERIFIED/ESTIMATED/UNKNOWN',
  `request_id` varchar(64) DEFAULT NULL COMMENT '关联 ai_budget_ledger.request_id（服务端计量口径）',
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`username`,`created_at`),
  KEY `idx_time` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=132 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 助手使用统计明细';

DROP TABLE IF EXISTS `biz_meeting_attendee`;
CREATE TABLE `biz_meeting_attendee` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `booking_id` bigint NOT NULL COMMENT '预约单 biz_meeting_booking.id',
  `user_id` bigint DEFAULT NULL COMMENT '参会人 sys_user.id（外部人员为 NULL）',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '在册工号快照',
  `name` varchar(64) NOT NULL COMMENT '姓名快照',
  `department_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `attendee_type` varchar(16) NOT NULL DEFAULT 'required' COMMENT '角色：organizer/required/optional/external',
  `response` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '响应：pending/accepted/declined/invalid',
  `respond_at` datetime DEFAULT NULL COMMENT '响应时间',
  `notify_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '邀约投递态：pending/sent/skipped/failed',
  `notify_note` varchar(200) DEFAULT NULL COMMENT '投递说明（如"未綁定釘釘"/"場景未啟用"）',
  `checkin_at` datetime DEFAULT NULL COMMENT '个人签到时间（M2 生效）',
  `invalid_reason` varchar(64) DEFAULT NULL COMMENT '失效原因（如"離職"），历史会议只标不改',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_attendee` varchar(40) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`user_id` is not null)) then concat(`booking_id`,_utf8mb4'|',`user_id`) else NULL end)) STORED COMMENT '同一会议同一员工只能有一行（外部人无唯一身份不参与约束）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_attendee` (`active_attendee`),
  KEY `idx_meeting_attendee_user` (`user_id`,`response`),
  KEY `idx_meeting_attendee_booking` (`booking_id`,`attendee_type`),
  KEY `idx_meeting_attendee_notify` (`booking_id`,`notify_status`),
  CONSTRAINT `fk_meeting_attendee_booking` FOREIGN KEY (`booking_id`) REFERENCES `biz_meeting_booking` (`id`),
  CONSTRAINT `ck_meeting_attendee_notify` CHECK ((`notify_status` in (_utf8mb4'pending',_utf8mb4'sent',_utf8mb4'skipped',_utf8mb4'failed'))),
  CONSTRAINT `ck_meeting_attendee_response` CHECK ((`response` in (_utf8mb4'pending',_utf8mb4'accepted',_utf8mb4'declined',_utf8mb4'invalid'))),
  CONSTRAINT `ck_meeting_attendee_type` CHECK ((`attendee_type` in (_utf8mb4'organizer',_utf8mb4'required',_utf8mb4'optional',_utf8mb4'external')))
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议参会人（邀约对象/响应/投递态）';

DROP TABLE IF EXISTS `biz_meeting_blacklist`;
CREATE TABLE `biz_meeting_blacklist` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` bigint NOT NULL COMMENT '被限制用户 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '在册工号快照',
  `name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `department_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `reason` varchar(300) NOT NULL COMMENT '限制原因（自动进入写爽约次数，手动写人工理由）',
  `source` varchar(16) NOT NULL DEFAULT 'admin' COMMENT '来源：auto=系统按阈值判定 / admin=行政手动',
  `no_show_count` int NOT NULL DEFAULT '0' COMMENT '判定时近30天爽约次数（手动加入为 0）',
  `start_date` date NOT NULL COMMENT '生效开始日',
  `end_date` date NOT NULL COMMENT '解除日（含当日；到期由查询按日期判定，不需要每日 job 翻状态）',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/revoked（expired 由日期派生，不落库避免每天全表更新）',
  `revoked_by` bigint DEFAULT NULL COMMENT '撤销操作人',
  `revoked_at` datetime DEFAULT NULL COMMENT '撤销时间',
  `revoke_reason` varchar(300) DEFAULT NULL COMMENT '撤销原因',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `active_user` bigint GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`status` = _utf8mb4'active')) then `user_id` else NULL end)) STORED COMMENT '同一用户同时只能有一条生效限制记录',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_blacklist_active` (`active_user`),
  KEY `idx_meeting_blacklist_user` (`user_id`,`start_date`),
  KEY `idx_meeting_blacklist_status` (`status`,`end_date`),
  CONSTRAINT `ck_meeting_blacklist_range` CHECK ((`end_date` >= `start_date`)),
  CONSTRAINT `ck_meeting_blacklist_source` CHECK ((`source` in (_utf8mb4'auto',_utf8mb4'admin'))),
  CONSTRAINT `ck_meeting_blacklist_status` CHECK ((`status` in (_utf8mb4'active',_utf8mb4'revoked')))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议预约黑名单（爽约治理）';

DROP TABLE IF EXISTS `biz_meeting_booking`;
CREATE TABLE `biz_meeting_booking` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `booking_no` varchar(32) NOT NULL COMMENT '会议单号（MT + YYYYMMDD + 4位）',
  `title` varchar(200) NOT NULL COMMENT '会议主题',
  `biz_type` varchar(24) NOT NULL DEFAULT 'general' COMMENT '关联业务类型：general/rdm_review/interview/training',
  `biz_id` bigint DEFAULT NULL COMMENT '关联业务对象ID（如 rdm 需求ID）',
  `biz_no` varchar(32) DEFAULT NULL COMMENT '关联业务对象编号快照（如 XQ202609120001）',
  `biz_url` varchar(500) DEFAULT NULL COMMENT '关联业务对象跳转链接（详情页深链）',
  `room_id` bigint NOT NULL COMMENT '会议室 biz_meeting_room.id',
  `room_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议室编号快照',
  `room_name` varchar(64) NOT NULL DEFAULT '' COMMENT '会议室名称快照',
  `room_location` varchar(200) NOT NULL DEFAULT '' COMMENT '园区/楼栋/楼层拼接快照（通知卡片与列表直接展示）',
  `organizer_id` bigint NOT NULL COMMENT '组织者 sys_user.id（服务端从 JWT 取，不信前端传值）',
  `organizer_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '组织者在册工号快照（MFxxxxx）',
  `organizer_name` varchar(64) NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
  `department_id` bigint DEFAULT NULL COMMENT '主办方部门 sys_department.id',
  `department_name` varchar(128) NOT NULL DEFAULT '' COMMENT '主办方部门名称快照',
  `delegate_for_id` bigint DEFAULT NULL COMMENT '代订的实际使用人 sys_user.id（M2 生效，组织者与使用人分列）',
  `delegate_for_name` varchar(64) DEFAULT NULL COMMENT '实际使用人姓名快照',
  `start_time` datetime NOT NULL COMMENT '会议开始时间（区间左闭）',
  `end_time` datetime NOT NULL COMMENT '会议结束时间（区间右开）',
  `series_id` bigint DEFAULT NULL COMMENT '周期会议主表ID（M2，单场为 NULL）',
  `series_seq` int DEFAULT NULL COMMENT '周期会议内序号，从 1 起（M2，单场为 NULL）',
  `attendee_count` int NOT NULL DEFAULT '1' COMMENT '参会人数（含组织者与外部人员）',
  `description` varchar(1000) DEFAULT NULL COMMENT '会议议程',
  `online_meeting_url` varchar(500) DEFAULT NULL COMMENT '线上会议链接（腾讯会议/钉钉会议等，人工填写）',
  `external_attendees` varchar(500) DEFAULT NULL COMMENT '外部参会人姓名快照，逗号分隔（无系统账号）',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '业务状态：booked/checked_in/finished/cancelled/released',
  `cancel_reason` varchar(300) DEFAULT NULL COMMENT '取消原因（取消必须留原因）',
  `cancel_scope` varchar(16) DEFAULT NULL COMMENT '取消範圍：this/future/all（周期會議三檔取消語義留痕）',
  `cancelled_by` bigint DEFAULT NULL COMMENT '取消操作人 sys_user.id',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `checkin_at` datetime DEFAULT NULL COMMENT '首次签到时间（M2 生效）',
  `checkin_by` bigint DEFAULT NULL COMMENT '签到动作的执行人 sys_user.id',
  `actual_start_at` datetime DEFAULT NULL COMMENT '实际开始时间（签到即视为开始）',
  `actual_end_at` datetime DEFAULT NULL COMMENT '实际结束时间（提前结束时写入，使用率统计取它）',
  `release_at` datetime DEFAULT NULL COMMENT '释放时间（自动或行政手动）',
  `release_by_id` bigint DEFAULT NULL COMMENT '行政手动释放操作人；自动释放为 NULL（区分两种释放的事实）',
  `release_reason` varchar(300) DEFAULT NULL COMMENT '释放原因（手动必填）',
  `no_show_flag` tinyint NOT NULL DEFAULT '0' COMMENT '爽约：预约了但未签到即被释放',
  `approval_outcome` varchar(20) NOT NULL DEFAULT 'not_applicable' COMMENT '预留：审批结论（本期恒为 not_applicable）',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '预留：关联 OA 流程编号',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
  `request_hash` varchar(64) DEFAULT NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `active_booking_no` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `booking_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：单号',
  `active_slot` varchar(80) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`status` in (_utf8mb4'booked',_utf8mb4'checked_in'))) then concat(_utf8mb4'R',`room_id`,_utf8mb4'|',date_format(`start_time`,_utf8mb4'%Y%m%d%H%i'),_utf8mb4'|',date_format(`end_time`,_utf8mb4'%Y%m%d%H%i')) else NULL end)) STORED COMMENT '完全相同占用窗口的重复预约兜底；区间重叠仍由服务层锁内当前读判定',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_booking_no` (`active_booking_no`),
  UNIQUE KEY `uk_meeting_booking_request` (`organizer_id`,`request_key`),
  UNIQUE KEY `uk_meeting_booking_slot` (`active_slot`),
  KEY `idx_meeting_booking_room` (`room_id`,`start_time`,`status`),
  KEY `idx_meeting_booking_organizer` (`organizer_id`,`start_time`),
  KEY `idx_meeting_booking_status_start` (`status`,`start_time`),
  KEY `idx_meeting_booking_series` (`series_id`,`series_seq`),
  KEY `idx_meeting_booking_biz` (`biz_type`,`biz_id`),
  KEY `idx_meeting_booking_dept` (`department_id`,`start_time`),
  KEY `idx_meeting_booking_cancel_scope` (`cancel_scope`),
  CONSTRAINT `fk_meeting_booking_room` FOREIGN KEY (`room_id`) REFERENCES `biz_meeting_room` (`id`),
  CONSTRAINT `ck_meeting_booking_attendee` CHECK ((`attendee_count` > 0)),
  CONSTRAINT `ck_meeting_booking_biz_type` CHECK ((`biz_type` in (_utf8mb4'general',_utf8mb4'rdm_review',_utf8mb4'interview',_utf8mb4'training'))),
  CONSTRAINT `ck_meeting_booking_cancel` CHECK (((`status` <> _utf8mb4'cancelled') or ((`cancel_reason` is not null) and (`cancelled_at` is not null)))),
  CONSTRAINT `ck_meeting_booking_cancel_scope` CHECK (((`cancel_scope` is null) or (`cancel_scope` in (_utf8mb4'this',_utf8mb4'future',_utf8mb4'all')))),
  CONSTRAINT `ck_meeting_booking_release` CHECK (((`status` <> _utf8mb4'released') or ((`release_at` is not null) and (`no_show_flag` = 1)))),
  CONSTRAINT `ck_meeting_booking_status` CHECK ((`status` in (_utf8mb4'booked',_utf8mb4'checked_in',_utf8mb4'finished',_utf8mb4'cancelled',_utf8mb4'released'))),
  CONSTRAINT `ck_meeting_booking_window` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议预约单（占用事实/业务关联/状态机）';

DROP TABLE IF EXISTS `biz_meeting_event`;
CREATE TABLE `biz_meeting_event` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `booking_id` bigint DEFAULT NULL COMMENT '预约单ID；会议室档案类事件为 NULL',
  `room_id` bigint DEFAULT NULL COMMENT '会议室ID（改房对比前后；档案事件为被操作房间）',
  `target_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议单号快照',
  `event_code` varchar(32) NOT NULL COMMENT '事件：create/update/cancel/checkin/release/finish/notify/reject',
  `reason` varchar(300) DEFAULT NULL COMMENT '原因（取消/释放必填）',
  `before_json` text COMMENT '变更前快照',
  `after_json` text COMMENT '变更后快照',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 sys_user.id（系统动作如自动释放为 NULL）',
  `operator_name` varchar(64) NOT NULL DEFAULT '' COMMENT '操作人姓名，系统动作写 SYSTEM',
  `operator_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '操作人工号快照',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（同键只落一条事件，防重复点击长出两条轨迹）',
  `occurred_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_event_request` (`operator_id`,`request_key`),
  KEY `idx_meeting_event_booking` (`booking_id`,`occurred_at`),
  KEY `idx_meeting_event_room` (`room_id`,`occurred_at`),
  CONSTRAINT `fk_meeting_event_booking` FOREIGN KEY (`booking_id`) REFERENCES `biz_meeting_booking` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=136 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议审计事件（追加式，不可被业务页面删改）';

DROP TABLE IF EXISTS `biz_meeting_minutes`;
CREATE TABLE `biz_meeting_minutes` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `minutes_no` varchar(32) NOT NULL COMMENT '纪要单号（MJ + YYYYMMDD + 4位）',
  `booking_id` bigint NOT NULL COMMENT '会议单 biz_meeting_booking.id（一场会一条纪要）',
  `booking_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议单号快照',
  `meeting_title` varchar(200) NOT NULL DEFAULT '' COMMENT '会议主题快照（卡片与列表直接展示）',
  `meeting_time_text` varchar(64) NOT NULL DEFAULT '' COMMENT '会议时间文本快照（yyyy-MM-dd HH:mm ~ HH:mm）',
  `room_text` varchar(200) NOT NULL DEFAULT '' COMMENT '会议室与位置快照',
  `organizer_name` varchar(64) NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
  `series_id` bigint DEFAULT NULL COMMENT '周期会议系列ID快照（单场为 NULL），系列纪要导航按它取数',
  `series_seq` int DEFAULT NULL COMMENT '系列内序号快照，从 1 起',
  `recorder_user_id` bigint NOT NULL COMMENT '记录人 sys_user.id（服务端从 JWT 取，不信前端传值）',
  `recorder_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '记录人在册工号快照',
  `recorder_name` varchar(64) NOT NULL DEFAULT '' COMMENT '记录人姓名快照',
  `content_json` text NOT NULL COMMENT '纪要正文 JSON（议题/行动项/未决/缺席/下次会议/备注）',
  `digest` varchar(300) NOT NULL DEFAULT '' COMMENT '摘要（首条结论或首条行动项），列表与钉钉卡片展示',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态：draft=未发出 sent=至少发过一批（不是锁版，仍可改后重发）',
  `send_count` int NOT NULL DEFAULT '0' COMMENT '已发送批次数（与 send 表行数字段冗余，列表免 JOIN）',
  `last_send_at` datetime DEFAULT NULL COMMENT '最近一次发送时间',
  `token_version` int NOT NULL DEFAULT '0' COMMENT '免登链接令牌版本：递增即让全部历史链接失效',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
  `request_hash` varchar(64) DEFAULT NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `active_booking` bigint GENERATED ALWAYS AS ((case when (`deleted` = 0) then `booking_id` else NULL end)) STORED COMMENT '软删感知唯一作用域：一场会只能有一条有效纪要',
  `active_minutes_no` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `minutes_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：单号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_minutes_booking` (`active_booking`),
  UNIQUE KEY `uk_meeting_minutes_no` (`active_minutes_no`),
  UNIQUE KEY `uk_meeting_minutes_request` (`recorder_user_id`,`request_key`),
  KEY `idx_meeting_minutes_recorder` (`recorder_user_id`,`updated_at`),
  KEY `idx_meeting_minutes_series` (`series_id`,`series_seq`),
  KEY `idx_meeting_minutes_status` (`status`,`last_send_at`),
  KEY `fk_meeting_minutes_booking` (`booking_id`),
  CONSTRAINT `fk_meeting_minutes_booking` FOREIGN KEY (`booking_id`) REFERENCES `biz_meeting_booking` (`id`),
  CONSTRAINT `ck_meeting_minutes_send_count` CHECK ((`send_count` >= 0)),
  CONSTRAINT `ck_meeting_minutes_status` CHECK ((`status` in (_utf8mb4'draft',_utf8mb4'sent'))),
  CONSTRAINT `ck_meeting_minutes_token` CHECK ((`token_version` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议纪要（一场会一条，正文按模板分区）';

DROP TABLE IF EXISTS `biz_meeting_minutes_delivery`;
CREATE TABLE `biz_meeting_minutes_delivery` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `send_id` bigint NOT NULL COMMENT '批次 biz_meeting_minutes_send.id',
  `minutes_id` bigint NOT NULL COMMENT '纪要ID冗余（按纪要查明细不绕批次表）',
  `booking_id` bigint NOT NULL COMMENT '会议单ID冗余',
  `target_type` varchar(16) NOT NULL COMMENT '目标类型：GROUP/USER',
  `receiver_user_id` bigint NOT NULL DEFAULT '0' COMMENT '收件人 sys_user.id；群投递固定 0（不能留 NULL，唯一键要参与去重）',
  `receiver_name` varchar(64) NOT NULL DEFAULT '' COMMENT '收件人姓名快照（群行存渠道名称）',
  `receiver_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '收件人工号快照',
  `receiver_department` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照（发送历史里区分同名的人）',
  `receiver_dingtalk_id` varchar(64) NOT NULL DEFAULT '' COMMENT '钉钉用户ID快照（排查绑定问题）',
  `group_channel_id` bigint DEFAULT NULL COMMENT '群渠道ID（target_type=GROUP 时有值）',
  `scenario` varchar(64) NOT NULL DEFAULT '' COMMENT '工作通知场景（USER 行）；群行走 webhook 不占场景',
  `send_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '结果：pending/sending/success/skipped/failed',
  `retry_count` int NOT NULL DEFAULT '0' COMMENT '已重试次数',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间（投递作业按此取数）',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '失败/跳过原因',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_minutes_delivery` (`send_id`,`target_type`,`receiver_user_id`),
  KEY `idx_meeting_minutes_delivery_due` (`send_status`,`next_retry_at`),
  KEY `idx_meeting_minutes_delivery_minutes` (`minutes_id`,`send_status`),
  KEY `idx_meeting_minutes_delivery_receiver` (`receiver_user_id`,`created_at`),
  CONSTRAINT `fk_meeting_minutes_delivery_send` FOREIGN KEY (`send_id`) REFERENCES `biz_meeting_minutes_send` (`id`),
  CONSTRAINT `ck_meeting_minutes_delivery_status` CHECK ((`send_status` in (_utf8mb4'pending',_utf8mb4'sending',_utf8mb4'success',_utf8mb4'skipped',_utf8mb4'failed'))),
  CONSTRAINT `ck_meeting_minutes_delivery_target` CHECK ((`target_type` in (_utf8mb4'GROUP',_utf8mb4'USER')))
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议纪要投递明细（群与收件人各自留痕，兼重试队列）';

DROP TABLE IF EXISTS `biz_meeting_minutes_item`;
CREATE TABLE `biz_meeting_minutes_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `minutes_id` bigint NOT NULL COMMENT '纪要 biz_meeting_minutes.id',
  `booking_id` bigint NOT NULL COMMENT '会议单ID冗余（按会议查待办不绕纪要）',
  `kind` varchar(16) NOT NULL COMMENT '类型：ACTION=行動項 FOLLOW=跟進事項',
  `seq` int NOT NULL DEFAULT '1' COMMENT '同类事项内序号（从 1 起，保存时按顺序重排）',
  `content` varchar(500) NOT NULL COMMENT '事项内容',
  `owner_user_id` bigint DEFAULT NULL COMMENT '负责人 sys_user.id（服务端回查姓名/工号快照）',
  `owner_name` varchar(64) NOT NULL DEFAULT '' COMMENT '负责人姓名快照',
  `owner_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '负责人工号快照',
  `due_date` date DEFAULT NULL COMMENT '完成时限；NULL=未定时限（不参与逾期扫描）',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/done',
  `result` varchar(16) DEFAULT NULL COMMENT '处理结果：completed/partial/cannot',
  `resolution_note` varchar(500) DEFAULT NULL COMMENT '结果说明（cannot 必填：为什么没办成）',
  `done_at` datetime DEFAULT NULL COMMENT '完成时间',
  `done_by` bigint DEFAULT NULL COMMENT '更新人 sys_user.id',
  `done_by_name` varchar(64) NOT NULL DEFAULT '' COMMENT '更新人姓名快照',
  `last_notified_at` datetime DEFAULT NULL COMMENT '最近一次逾期提醒时间（同一天只提醒一次）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_minutes_item` (`minutes_id`,`kind`,`seq`),
  KEY `idx_meeting_minutes_item_owner` (`owner_user_id`,`status`,`due_date`),
  KEY `idx_meeting_minutes_item_due` (`status`,`due_date`,`last_notified_at`),
  CONSTRAINT `fk_meeting_minutes_item_minutes` FOREIGN KEY (`minutes_id`) REFERENCES `biz_meeting_minutes` (`id`),
  CONSTRAINT `ck_meeting_minutes_item_kind` CHECK ((`kind` in (_utf8mb4'ACTION',_utf8mb4'FOLLOW'))),
  CONSTRAINT `ck_meeting_minutes_item_result` CHECK (((`result` is null) or (`result` in (_utf8mb4'completed',_utf8mb4'partial',_utf8mb4'cannot')))),
  CONSTRAINT `ck_meeting_minutes_item_seq` CHECK ((`seq` > 0)),
  CONSTRAINT `ck_meeting_minutes_item_status` CHECK ((`status` in (_utf8mb4'pending',_utf8mb4'done')))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='纪要可跟踪事项（行动项/跟进事项，支持状态更新与逾期提醒）';

DROP TABLE IF EXISTS `biz_meeting_minutes_link`;
CREATE TABLE `biz_meeting_minutes_link` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `minutes_id` bigint NOT NULL COMMENT '引用方纪要 biz_meeting_minutes.id',
  `linked_minutes_id` bigint NOT NULL COMMENT '被引用的纪要ID（仅供跳转，展示一律用快照）',
  `linked_minutes_no` varchar(32) NOT NULL DEFAULT '' COMMENT '被引用纪要单号快照',
  `linked_booking_no` varchar(32) NOT NULL DEFAULT '' COMMENT '被引用会议单号快照',
  `linked_title` varchar(200) NOT NULL DEFAULT '' COMMENT '被引用会议主题快照',
  `linked_time_text` varchar(64) NOT NULL DEFAULT '' COMMENT '被引用会议时间快照',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_minutes_link` (`minutes_id`,`linked_minutes_id`),
  KEY `idx_meeting_minutes_link_target` (`linked_minutes_id`),
  CONSTRAINT `fk_meeting_minutes_link_minutes` FOREIGN KEY (`minutes_id`) REFERENCES `biz_meeting_minutes` (`id`),
  CONSTRAINT `ck_meeting_minutes_link_self` CHECK ((`minutes_id` <> `linked_minutes_id`))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='纪要关联（引用其它会议纪要，带来源快照）';

DROP TABLE IF EXISTS `biz_meeting_minutes_send`;
CREATE TABLE `biz_meeting_minutes_send` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `minutes_id` bigint NOT NULL COMMENT '纪要 biz_meeting_minutes.id',
  `booking_id` bigint NOT NULL COMMENT '会议单ID冗余（按会议查发送记录不绕纪要）',
  `booking_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议单号快照',
  `minutes_no` varchar(32) NOT NULL DEFAULT '' COMMENT '纪要单号快照',
  `batch_seq` int NOT NULL DEFAULT '1' COMMENT '第几批（从 1 递增）：卡片尾注用它，同日重发才不会被钉钉按相同内容去重',
  `title` varchar(200) NOT NULL DEFAULT '' COMMENT '发送时的会议主题快照（卡片标题）',
  `content_snapshot` text NOT NULL COMMENT '发送时的纪要正文 JSON 快照（免登页渲染源）',
  `markdown_snapshot` text COMMENT '实际投出去的钉钉卡片正文（可能被截断）',
  `scenario` varchar(64) NOT NULL DEFAULT 'meeting_minutes' COMMENT '工作通知场景（收件人通道）',
  `group_channel_id` bigint DEFAULT NULL COMMENT '群机器人渠道 sys_notification_channel.id；NULL=本批不发群',
  `group_channel_name` varchar(100) NOT NULL DEFAULT '' COMMENT '渠道名称快照（渠道改名/删除后仍能读出发给谁）',
  `receiver_count` int NOT NULL DEFAULT '0' COMMENT '收件人人数（含非参会人）',
  `token_version` int NOT NULL DEFAULT '0' COMMENT '本批链接使用的纪要令牌版本：低于纪要当前版本即已作废',
  `link_expire_at` datetime DEFAULT NULL COMMENT '免登链接到期时间',
  `send_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '批次结论：pending/sending/success/partial/failed/skipped',
  `success_count` int NOT NULL DEFAULT '0' COMMENT '已送达明细数（群按 1 计）',
  `failed_count` int NOT NULL DEFAULT '0' COMMENT '投递失败数',
  `skipped_count` int NOT NULL DEFAULT '0' COMMENT '未送达数（未绑定钉钉/场景未启用/渠道停用等）',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '批次级失败原因（明细各自的原因在 delivery 表）',
  `operator_id` bigint DEFAULT NULL COMMENT '发送操作人 sys_user.id',
  `operator_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '操作人工号快照',
  `operator_name` varchar(64) NOT NULL DEFAULT '' COMMENT '操作人姓名快照',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（双击不会长出两个批次）',
  `sent_at` datetime DEFAULT NULL COMMENT '提交投递时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_minutes_send_seq` (`minutes_id`,`batch_seq`),
  UNIQUE KEY `uk_meeting_minutes_send_request` (`operator_id`,`request_key`),
  KEY `idx_meeting_minutes_send_minutes` (`minutes_id`,`sent_at`),
  KEY `idx_meeting_minutes_send_booking` (`booking_id`,`sent_at`),
  KEY `idx_meeting_minutes_send_status` (`send_status`,`updated_at`),
  CONSTRAINT `fk_meeting_minutes_send_minutes` FOREIGN KEY (`minutes_id`) REFERENCES `biz_meeting_minutes` (`id`),
  CONSTRAINT `ck_meeting_minutes_send_status` CHECK ((`send_status` in (_utf8mb4'pending',_utf8mb4'sending',_utf8mb4'success',_utf8mb4'partial',_utf8mb4'failed',_utf8mb4'skipped')))
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议纪要发送批次（含发出瞬间的内容快照）';

DROP TABLE IF EXISTS `biz_meeting_notify_log`;
CREATE TABLE `biz_meeting_notify_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `booking_id` bigint NOT NULL COMMENT '预约单ID',
  `booking_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议单号快照',
  `event_code` varchar(32) NOT NULL COMMENT '事件编码（见 MeetingConstants.EVENT_*）',
  `scenario` varchar(64) NOT NULL DEFAULT '' COMMENT '通知场景（meeting_invite/meeting_remind/meeting_ops）',
  `channel` varchar(16) NOT NULL DEFAULT 'DINGTALK' COMMENT '渠道：DINGTALK/INBOX',
  `receiver_user_id` bigint DEFAULT NULL COMMENT '接收人 sys_user.id',
  `receiver_name` varchar(64) NOT NULL DEFAULT '' COMMENT '接收人姓名快照',
  `receiver_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '接收人工号快照',
  `receiver_dingtalk_id` varchar(64) NOT NULL DEFAULT '' COMMENT '钉钉用户ID快照（排查绑定问题）',
  `send_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '结果：pending/sending/success/skipped/failed',
  `retry_count` int NOT NULL DEFAULT '0' COMMENT '已重试次数',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间（投递任务按此取数）',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '失败/跳过原因',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_notify_dedup` (`booking_id`,`event_code`,`receiver_user_id`),
  KEY `idx_meeting_notify_due` (`send_status`,`next_retry_at`),
  KEY `idx_meeting_notify_booking` (`booking_id`,`event_code`),
  CONSTRAINT `fk_meeting_notify_booking` FOREIGN KEY (`booking_id`) REFERENCES `biz_meeting_booking` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_meeting_notify_status` CHECK ((`send_status` in (_utf8mb4'pending',_utf8mb4'sending',_utf8mb4'success',_utf8mb4'skipped',_utf8mb4'failed')))
) ENGINE=InnoDB AUTO_INCREMENT=183 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议通知投递留痕与重试队列';

DROP TABLE IF EXISTS `biz_meeting_room`;
CREATE TABLE `biz_meeting_room` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `room_no` varchar(32) NOT NULL COMMENT '会议室编号（行政可读，如 MR-1F-01）',
  `room_name` varchar(64) NOT NULL COMMENT '会议室名称',
  `city` varchar(64) NOT NULL DEFAULT '' COMMENT '所在城市（如 深圳；跨城辦公防訂錯）',
  `campus` varchar(64) NOT NULL DEFAULT '' COMMENT '园区',
  `building` varchar(64) NOT NULL DEFAULT '' COMMENT '楼栋',
  `floor_code` varchar(32) NOT NULL DEFAULT '' COMMENT '楼层',
  `location_desc` varchar(200) NOT NULL DEFAULT '' COMMENT '位置描述（如电梯左侧）',
  `capacity` int NOT NULL DEFAULT '1' COMMENT '容纳人数（预约人数上限的判定依据）',
  `facilities` varchar(200) NOT NULL DEFAULT '' COMMENT '设备代码，前后带逗号便于 LIKE 精确匹配：,PROJECTION,WHITEBOARD,VIDEO_TERMINAL,PHONE,WIRELESS_CAST,',
  `photo_urls` text COMMENT '照片地址 JSON 数组',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态：active/maintenance/disabled',
  `bookable` tinyint NOT NULL DEFAULT '1' COMMENT '是否允许预约：0=仅展示不可订',
  `bookable_start_time` time DEFAULT NULL COMMENT '每日可预约起始（NULL=回落全局默认 08:00）',
  `bookable_end_time` time DEFAULT NULL COMMENT '每日可预约结束（NULL=回落全局默认 22:00）',
  `min_duration` int DEFAULT NULL COMMENT '单场最短分钟（NULL=回落全局默认）',
  `max_duration` int DEFAULT NULL COMMENT '单场最长分钟（NULL=回落全局默认）',
  `checkin_required` tinyint NOT NULL DEFAULT '0' COMMENT '是否需要签到保留（M2 生效，本期只维护不动作）',
  `release_after_minutes` int DEFAULT NULL COMMENT '开始后未签到多少分钟自动释放（NULL=回落全局默认 15）',
  `hide_title` tinyint NOT NULL DEFAULT '0' COMMENT '忙闲视图是否脱敏主题：1=只显示已占用',
  `approval_required` tinyint NOT NULL DEFAULT '0' COMMENT '预留：房间是否需要审批（本期不接 OA 引擎，服务端不读取）',
  `admin_user_ids` varchar(200) NOT NULL DEFAULT '' COMMENT '房间管理员 sys_user.id，前后带逗号：,12,35,',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `active_room_no` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `room_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：编号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_room_no` (`active_room_no`),
  KEY `idx_meeting_room_location` (`campus`,`building`,`floor_code`),
  KEY `idx_meeting_room_status` (`status`,`bookable`),
  KEY `idx_meeting_room_capacity` (`capacity`),
  CONSTRAINT `ck_meeting_room_capacity` CHECK ((`capacity` > 0)),
  CONSTRAINT `ck_meeting_room_duration` CHECK (((`min_duration` is null) or (`max_duration` is null) or (`max_duration` >= `min_duration`))),
  CONSTRAINT `ck_meeting_room_status` CHECK ((`status` in (_utf8mb4'active',_utf8mb4'maintenance',_utf8mb4'disabled'))),
  CONSTRAINT `ck_meeting_room_window` CHECK (((`bookable_start_time` is null) or (`bookable_end_time` is null) or (`bookable_end_time` > `bookable_start_time`)))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会议室档案（资源台账，行政维护）';

DROP TABLE IF EXISTS `biz_meeting_series`;
CREATE TABLE `biz_meeting_series` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `series_no` varchar(32) NOT NULL COMMENT '系列編號：MS + YYYYMMDD + 4位',
  `freq` varchar(16) NOT NULL COMMENT '频次：daily/weekly',
  `interval_n` int NOT NULL DEFAULT '1' COMMENT '间隔数：每 N 天/周',
  `by_weekday` varchar(32) NOT NULL DEFAULT '' COMMENT 'weekly 生效的星期集合，逗号包裹 ,1,3,5,（1=周一）',
  `time_start` time NOT NULL COMMENT '每日开始时间',
  `time_end` time NOT NULL COMMENT '每日结束时间（左闭右开）',
  `start_date` date NOT NULL COMMENT '首次生效日期',
  `end_date` date DEFAULT NULL COMMENT '最后生效日期（与 occurrence_limit 双上限，任一先到即止）',
  `occurrence_limit` int NOT NULL DEFAULT '60' COMMENT '计划生成实例上限（硬上限 100，防配置失误生成万场会）',
  `generated_count` int NOT NULL DEFAULT '0' COMMENT '实际物化实例数（冲突跳过的不计入）',
  `skipped_count` int NOT NULL DEFAULT '0' COMMENT '因冲突被跳过的实例数（列表要如实显示，不静默少建）',
  `room_id` bigint NOT NULL COMMENT '会议室 biz_meeting_room.id',
  `room_no` varchar(32) NOT NULL DEFAULT '' COMMENT '会议室编号快照',
  `room_name` varchar(64) NOT NULL DEFAULT '' COMMENT '会议室名称快照',
  `room_location` varchar(200) NOT NULL DEFAULT '' COMMENT '位置拼接快照',
  `title` varchar(200) NOT NULL COMMENT '会议主题模板',
  `description` varchar(1000) DEFAULT NULL COMMENT '议程模板',
  `online_meeting_url` varchar(500) DEFAULT NULL COMMENT '线上会议链接模板',
  `biz_type` varchar(24) NOT NULL DEFAULT 'general' COMMENT '关联业务类型',
  `biz_id` bigint DEFAULT NULL COMMENT '关联业务对象ID',
  `biz_no` varchar(64) NOT NULL DEFAULT '' COMMENT '关联业务编号快照',
  `biz_url` varchar(500) DEFAULT NULL COMMENT '关联业务跳转链接',
  `attendee_json` text COMMENT '参会人快照 JSON（改期新建实例时沿用，不回查 HR）',
  `organizer_id` bigint NOT NULL COMMENT '组织者 sys_user.id',
  `organizer_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '组织者在册工号快照',
  `organizer_name` varchar(64) NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
  `department_id` bigint DEFAULT NULL COMMENT '主办方部门ID',
  `department_name` varchar(128) NOT NULL DEFAULT '' COMMENT '主办方部门名称快照',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/cancelled',
  `cancelled_scope` varchar(16) DEFAULT NULL COMMENT '取消语义：this/future/all（历史实例永不改写，靠这列说明当时选了哪档）',
  `cancel_reason` varchar(300) DEFAULT NULL COMMENT '取消原因',
  `cancelled_by` bigint DEFAULT NULL COMMENT '取消操作人',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（同一组织者+同一键只生效一次）',
  `request_hash` varchar(64) DEFAULT NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `active_series_no` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `series_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：系列编号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_meeting_series_no` (`active_series_no`),
  UNIQUE KEY `uk_meeting_series_request` (`organizer_id`,`request_key`),
  KEY `idx_meeting_series_room` (`room_id`,`start_date`),
  KEY `idx_meeting_series_organizer` (`organizer_id`,`status`),
  KEY `idx_meeting_series_status` (`status`,`end_date`),
  CONSTRAINT `ck_meeting_series_cancel` CHECK (((`status` <> _utf8mb4'cancelled') or ((`cancel_reason` is not null) and (`cancelled_at` is not null)))),
  CONSTRAINT `ck_meeting_series_freq` CHECK ((`freq` in (_utf8mb4'daily',_utf8mb4'weekly'))),
  CONSTRAINT `ck_meeting_series_interval` CHECK (((`interval_n` >= 1) and (`interval_n` <= 30))),
  CONSTRAINT `ck_meeting_series_limit` CHECK ((`occurrence_limit` between 1 and 100)),
  CONSTRAINT `ck_meeting_series_range` CHECK (((`end_date` is null) or (`end_date` >= `start_date`))),
  CONSTRAINT `ck_meeting_series_scope` CHECK (((`cancelled_scope` is null) or (`cancelled_scope` in (_utf8mb4'this',_utf8mb4'future',_utf8mb4'all')))),
  CONSTRAINT `ck_meeting_series_status` CHECK ((`status` in (_utf8mb4'active',_utf8mb4'cancelled'))),
  CONSTRAINT `ck_meeting_series_time` CHECK ((`time_end` > `time_start`))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='周期会议主表（模板 + 物化进度）';

DROP TABLE IF EXISTS `biz_merchant_group`;
CREATE TABLE `biz_merchant_group` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_code` varchar(32) NOT NULL COMMENT '集团ID（系统自增，如 JT000001）',
  `group_name` varchar(128) NOT NULL COMMENT '集团名称',
  `login_account` varchar(64) DEFAULT NULL COMMENT '登录主账号',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_code` (`group_code`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商户集团表';

DROP TABLE IF EXISTS `biz_oa_approval_task`;
CREATE TABLE `biz_oa_approval_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `request_id` bigint NOT NULL COMMENT '关联流程实例ID',
  `node_name` varchar(64) NOT NULL COMMENT '审批节点名称',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '节点顺序',
  `approval_rule` varchar(16) NOT NULL DEFAULT 'any' COMMENT 'any=或签 / all=会签',
  `approver` varchar(64) DEFAULT NULL COMMENT '审批人',
  `task_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
  `approve_time` datetime DEFAULT NULL COMMENT '审批时间',
  `comment` varchar(500) DEFAULT NULL COMMENT '审批意见',
  `approved_by` varchar(500) DEFAULT NULL COMMENT '已审批人列表（逗号分隔，会签模式多人追加）',
  `approved_times` varchar(1000) DEFAULT NULL COMMENT '已审批时间列表（逗号分隔，与approved_by一一对应）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_oa_task_request` (`request_id`),
  KEY `idx_oa_task_approver` (`approver`),
  KEY `idx_oa_task_status` (`task_status`)
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OA审批任务表';

DROP TABLE IF EXISTS `biz_oa_process`;
CREATE TABLE `biz_oa_process` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `process_code` varchar(32) NOT NULL COMMENT '流程编码',
  `process_name` varchar(64) NOT NULL COMMENT '流程名称',
  `category` varchar(32) NOT NULL DEFAULT 'general' COMMENT '分类: office/finance/hr/general',
  `icon` varchar(64) DEFAULT NULL COMMENT '图标标识',
  `description` varchar(200) DEFAULT NULL COMMENT '流程说明',
  `workflow_type` varchar(32) DEFAULT NULL COMMENT '关联 biz_workflow_config.flow_type',
  `form_schema` text COMMENT '表单字段定义JSON',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oa_process_code` (`process_code`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OA流程定义表';

DROP TABLE IF EXISTS `biz_oa_request`;
CREATE TABLE `biz_oa_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `flow_no` varchar(32) NOT NULL COMMENT '流程编号',
  `process_code` varchar(32) NOT NULL COMMENT '关联流程定义编码',
  `title` varchar(200) NOT NULL COMMENT '流程标题',
  `form_data` text COMMENT '表单数据JSON',
  `applicant` varchar(64) NOT NULL COMMENT '申请人',
  `flow_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled',
  `current_node_name` varchar(64) DEFAULT NULL COMMENT '当前待审节点名称',
  `current_approver` varchar(64) DEFAULT NULL COMMENT '当前审批人',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回理由',
  `apply_time` datetime DEFAULT NULL COMMENT '申请时间',
  `complete_time` datetime DEFAULT NULL COMMENT '完成时间',
  `cancel_time` datetime DEFAULT NULL COMMENT '撤销时间',
  `group_id` varchar(32) DEFAULT NULL COMMENT '集团ID',
  `group_name` varchar(64) DEFAULT NULL COMMENT '集团名称',
  `brand` varchar(16) DEFAULT NULL COMMENT '品牌: 1=闪蜂 2=mFood',
  `biz_approver` varchar(64) DEFAULT NULL COMMENT '业务主管-审批人',
  `biz_approve_time` datetime DEFAULT NULL COMMENT '业务主管-审批时间',
  `biz_approve_status` varchar(16) DEFAULT NULL COMMENT '业务主管-审批状态',
  `ops_approver` varchar(64) DEFAULT NULL COMMENT '运营主管-审批人',
  `ops_approve_time` datetime DEFAULT NULL COMMENT '运营主管-审批时间',
  `ops_approve_status` varchar(16) DEFAULT NULL COMMENT '运营主管-审批状态',
  `fin_approver` varchar(64) DEFAULT NULL COMMENT '财务主管-审批人',
  `fin_approve_time` datetime DEFAULT NULL COMMENT '财务主管-审批时间',
  `fin_approve_status` varchar(16) DEFAULT NULL COMMENT '财务主管-审批状态',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oa_request_flow_no` (`flow_no`),
  KEY `idx_oa_request_applicant` (`applicant`),
  KEY `idx_oa_request_status` (`flow_status`),
  KEY `idx_oa_request_process` (`process_code`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OA流程实例表';

DROP TABLE IF EXISTS `biz_organic_score_dimension`;
CREATE TABLE `biz_organic_score_dimension` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `dimension` int NOT NULL COMMENT '维度: 1=商業 2=店鋪 4=平台',
  `weight` int NOT NULL DEFAULT '0' COMMENT '權重百分比（0~100）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序號',
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dimension` (`dimension`)
) ENGINE=InnoDB AUTO_INCREMENT=158 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分維度權重配置';

DROP TABLE IF EXISTS `biz_organic_score_rule`;
CREATE TABLE `biz_organic_score_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `rule_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '規則編碼（COM_01 / STB_01 / PLT_01 等）',
  `dimension` int NOT NULL COMMENT '所屬維度: 1=商業 2=店鋪 4=平台',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '規則名稱',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '計分說明',
  `mode` int NOT NULL COMMENT '計分方式: 1=規則加分 2=衰減函數 3=規則減分 4=金額倍率 5=梯度計分',
  `score` int NOT NULL DEFAULT '0' COMMENT '分值（扣分為負值；金額倍率時填倍率）',
  `stat_days` int DEFAULT NULL COMMENT '統計天數（僅部分規則需要）',
  `range_scores` json DEFAULT NULL COMMENT '配送範圍分層分數 JSON: {"short":80,"medium":60,"long":40,"crossBridge":20}',
  `tiers` json DEFAULT NULL COMMENT '梯度檔位 JSON: [{"threshold":50,"direction":"LESS_THAN","score":20}]',
  `calc_cycle` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '計算周期: NIGHTLY=每晚統計 DAILY=按當天',
  `status` int NOT NULL DEFAULT '1' COMMENT '服務狀態: 1=啟用 2=停用',
  `builtin` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否系統內置: 1=是 0=否',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序號',
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最後更新人',
  `deleted` int NOT NULL DEFAULT '0' COMMENT '邏輯刪除: 0=正常 1=已刪除',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `prerequisites` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '前提條件',
  `stat_days_total` int DEFAULT NULL COMMENT '歷史基線天數',
  `stat_days_recent` int DEFAULT NULL COMMENT '近期對比天數',
  `time_range_scores` json DEFAULT NULL COMMENT '分時段配送範圍分數 JSON',
  `condition_items` json DEFAULT NULL COMMENT '條件計分項 JSON',
  `calc_interval_hours` decimal(5,2) DEFAULT NULL COMMENT '定時監控間隔小時數',
  `peak_time_ranges` json DEFAULT NULL COMMENT '高峰時段定義 JSON',
  `deduction_per_order` int DEFAULT NULL COMMENT '每單固定扣分',
  `decay_coefficient` decimal(10,4) DEFAULT NULL COMMENT '衰減係數',
  `blocked_merchants` json DEFAULT NULL COMMENT '屏蔽商家列表 JSON',
  `activity_items` json DEFAULT NULL COMMENT '活動加分配置 JSON',
  `multiplier_tiers` text COLLATE utf8mb4_unicode_ci COMMENT '倍数梯度计分配置 JSON（[{multiplier, score}]，以门店客单价为基准）',
  `threshold_score` int DEFAULT NULL COMMENT '门槛≤客单价时固定加分（仅 COM_01 使用）',
  `region_configs` text COLLATE utf8mb4_unicode_ci COMMENT '区域配置 JSON（PLT_03 商家扶持 / PLT_04 订单过热调控，按区域独立配置）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`),
  KEY `idx_dimension` (`dimension`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=1718 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分規則配置';

DROP TABLE IF EXISTS `biz_store`;
CREATE TABLE `biz_store` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_id` bigint NOT NULL COMMENT '所属集团ID (关联 biz_merchant_group.id)',
  `store_code` varchar(32) NOT NULL COMMENT '门店ID（系统自增，如 MD00001）',
  `store_name` varchar(128) NOT NULL COMMENT '门店名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee / mFood / flashBee,mFood',
  `biz_channel` varchar(128) DEFAULT NULL COMMENT '业务频道（美食外賣/超市百貨/團購到店，可多选逗号分隔）',
  `login_account` varchar(64) DEFAULT NULL COMMENT '登录主账号',
  `region` int DEFAULT NULL COMMENT '所在区域/商圈: 1=黑沙环区 … 11=黑沙滩区',
  `address` varchar(256) DEFAULT NULL COMMENT '门店地址',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_store_code` (`store_code`),
  KEY `idx_store_group` (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='门店表';

DROP TABLE IF EXISTS `biz_store_bd`;
CREATE TABLE `biz_store_bd` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `store_id` bigint NOT NULL COMMENT '门店主键 (关联 biz_store.id)',
  `bd_emp_id` varchar(32) NOT NULL COMMENT 'BD员工工号 (关联 sys_user.emp_id)',
  `bd_name` varchar(64) DEFAULT NULL COMMENT 'BD员工姓名快照',
  `created_by` varchar(64) DEFAULT NULL COMMENT '绑定人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_store_bd` (`store_id`,`bd_emp_id`),
  KEY `idx_bd_emp` (`bd_emp_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='门店绑定BD关系表';

DROP TABLE IF EXISTS `biz_store_data_config`;
CREATE TABLE `biz_store_data_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `store_id` bigint NOT NULL COMMENT '門店主鍵 (關聯 biz_store.id)',
  `monthly_orders` int NOT NULL DEFAULT '0' COMMENT '月訂單數',
  `monthly_repurchase_orders` int NOT NULL DEFAULT '0' COMMENT '月復購訂單數據',
  `monthly_positive_orders` int NOT NULL DEFAULT '0' COMMENT '月好評訂單數據',
  `monthly_visits` int NOT NULL DEFAULT '0' COMMENT '月訪問量',
  `store_favorites` int NOT NULL DEFAULT '0' COMMENT '門店收藏數',
  `monthly_customers` int NOT NULL DEFAULT '0' COMMENT '顧客數',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_store_id` (`store_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='門店金字招牌數據配置表';

DROP TABLE IF EXISTS `biz_system_access_request`;
CREATE TABLE `biz_system_access_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `flow_no` varchar(64) NOT NULL COMMENT 'OA流程编号(XTSQ+YYYYMMDD+2位日流水)',
  `system_code` varchar(32) NOT NULL COMMENT '申请的业务系统编码 sys_system.code',
  `system_name` varchar(64) DEFAULT NULL COMMENT '系统名称快照',
  `user_id` bigint NOT NULL COMMENT '申请人 sys_user.id',
  `applicant_name` varchar(64) NOT NULL COMMENT '申请人姓名快照',
  `applicant_emp_id` varchar(32) DEFAULT NULL COMMENT '申请人工号快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '申请人部门名称快照',
  `scenarios` varchar(255) DEFAULT NULL COMMENT '使用场景code,逗号分隔',
  `duration_type` varchar(16) DEFAULT NULL COMMENT '使用期限类型: permanent/until',
  `duration_until` date DEFAULT NULL COMMENT '期限截止日(到期次日起自动回收,permanent为NULL)',
  `preferred_role_id` bigint DEFAULT NULL COMMENT '申请人建议的参考角色 sys_role.id',
  `preferred_role_name` varchar(64) DEFAULT NULL COMMENT '参考角色名称快照',
  `requested_menus` mediumtext COMMENT '申请的菜单功能JSON [{menuKey,name}]',
  `reason` varchar(1000) NOT NULL COMMENT '申请说明',
  `attachments` mediumtext COMMENT '相关凭证JSON [{name,type,size,contentType,dataUrl}]',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/approved/rejected/cancelled',
  `grant_target_type` varchar(16) DEFAULT NULL COMMENT '授权对象类型: role',
  `grant_target_id` bigint DEFAULT NULL COMMENT '授权角色 sys_role.id',
  `grant_target_name` varchar(64) DEFAULT NULL COMMENT '授权角色名称快照',
  `grant_status` varchar(16) NOT NULL DEFAULT 'none' COMMENT '授权兑现状态: none/granted',
  `grant_newly_bound` tinyint NOT NULL DEFAULT '0' COMMENT '本次兌現是否真的新绑角色:1=本单绑上(仅此有到期回收资格),0=此前已持有/存量',
  `revoke_status` varchar(16) NOT NULL DEFAULT 'none' COMMENT '到期回收状态: none/revoked/kept',
  `revoked_at` datetime DEFAULT NULL COMMENT '回收时间',
  `revoked_by` varchar(64) DEFAULT NULL COMMENT '回收执行者(system-expiry)',
  `granted_at` datetime DEFAULT NULL COMMENT '授权兑现时间',
  `granted_by` varchar(64) DEFAULT NULL COMMENT '兑现时的审批人签名',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回理由',
  `apply_time` datetime DEFAULT NULL COMMENT '申请时间',
  `complete_time` datetime DEFAULT NULL COMMENT '审结时间',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sar_flow_no` (`flow_no`),
  KEY `idx_sar_user` (`user_id`,`status`),
  KEY `idx_sar_system` (`system_code`,`status`),
  KEY `idx_sar_revoke` (`revoke_status`,`duration_until`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系統權限申請單（門戶我要申請→OA審批→綁定授權角色）';

DROP TABLE IF EXISTS `biz_vehicle`;
CREATE TABLE `biz_vehicle` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `vehicle_code` varchar(32) NOT NULL COMMENT '车辆编号（VH+6位，系统生成，稳定身份）',
  `plate_no` varchar(20) NOT NULL COMMENT '当前主车牌（换牌留痕，行程表另存发生时时车牌）',
  `register_region` varchar(20) NOT NULL DEFAULT '澳門' COMMENT '车牌登记地区：澳门/中国内地/香港',
  `vehicle_type` varchar(32) NOT NULL COMMENT '车型：轿车/SUV/商务车/货车/新能源车',
  `vin` varchar(32) DEFAULT NULL COMMENT 'VIN/底盘号，可选，不作业务身份',
  `seat_count` int NOT NULL COMMENT '核定载客人数（含驾驶人）',
  `current_odometer` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '当前里程(km)，取上次确认的结束里程',
  `status` varchar(16) NOT NULL DEFAULT 'normal' COMMENT '运行状态：normal/repairing/suspended/retired',
  `allow_direct_register` tinyint NOT NULL DEFAULT '0' COMMENT '是否允许授权直接登记：1=允许 0=仅审批用车',
  `insurance_valid_until` date DEFAULT NULL COMMENT '保险有效期止；未录入或过期禁止新出车',
  `inspection_valid_until` date DEFAULT NULL COMMENT '检验（年检）有效期止；未录入或过期禁止新出车',
  `verify_by` varchar(64) DEFAULT NULL COMMENT '合规核验人',
  `verify_at` datetime DEFAULT NULL COMMENT '合规核验时间',
  `owner_company_id` bigint DEFAULT NULL COMMENT '所属法人主体（sys_purchase_company.id），与公司品牌是两个独立维度',
  `owner_company_name` varchar(128) NOT NULL DEFAULT '' COMMENT '所属法人名称快照：不因字典改名而改写历史',
  `company_brand` tinyint NOT NULL DEFAULT '1' COMMENT '公司品牌：1=闪蜂 2=mFood',
  `brand_id` bigint DEFAULT NULL COMMENT '车辆品牌 ID',
  `series_id` bigint DEFAULT NULL COMMENT '车系 ID',
  `model_id` bigint DEFAULT NULL COMMENT '年款车型 ID',
  `body_type` varchar(20) DEFAULT NULL COMMENT '車身形式',
  `energy_type` varchar(20) DEFAULT NULL COMMENT '能源類型：petrol/diesel/hybrid/phev/ev',
  `brand_name` varchar(60) DEFAULT NULL COMMENT '品牌名称快照',
  `series_name` varchar(80) DEFAULT NULL COMMENT '车系名称快照',
  `model_name` varchar(120) DEFAULT NULL COMMENT '年款车型名称快照',
  `manage_dept_id` bigint NOT NULL COMMENT '管理部门（sys_department.id）',
  `manage_dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '管理部门名称快照',
  `eam_asset_id` bigint DEFAULT NULL COMMENT '关联 EAM 资产 ID（可空；关联后资产编号/购置信息以 EAM 为准）',
  `eam_asset_no` varchar(40) DEFAULT NULL COMMENT '关联 EAM 资产编号快照（展示用，真值以 EAM 为准）',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `version` bigint NOT NULL DEFAULT '0' COMMENT '乐观锁版本，数据库端递增',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_plate` varchar(64) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`register_region`,_utf8mb4'|',`plate_no`) else NULL end)) STORED COMMENT '软删感知唯一作用域：登记地区+车牌',
  `active_code` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `vehicle_code` else NULL end)) STORED COMMENT '软删感知唯一作用域：车辆编号',
  `active_asset` varchar(32) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`eam_asset_id` is not null)) then cast(`eam_asset_id` as char charset utf8mb4) else NULL end)) STORED COMMENT '软删感知唯一作用域：一台资产只能对应一份车辆档案',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_active_plate` (`active_plate`),
  UNIQUE KEY `uk_vehicle_active_code` (`active_code`),
  UNIQUE KEY `uk_vehicle_active_asset` (`active_asset`),
  KEY `idx_vehicle_status` (`status`),
  KEY `idx_vehicle_manage_dept` (`manage_dept_id`),
  KEY `idx_vehicle_insurance` (`insurance_valid_until`),
  KEY `idx_vehicle_inspection` (`inspection_valid_until`),
  CONSTRAINT `ck_vehicle_brand` CHECK ((`company_brand` in (1,2))),
  CONSTRAINT `ck_vehicle_odometer` CHECK ((`current_odometer` >= 0)),
  CONSTRAINT `ck_vehicle_seat` CHECK (((`seat_count` > 0) and (`seat_count` <= 60))),
  CONSTRAINT `ck_vehicle_status` CHECK ((`status` in (_utf8mb4'normal',_utf8mb4'repairing',_utf8mb4'suspended',_utf8mb4'retired')))
) ENGINE=InnoDB AUTO_INCREMENT=162 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='车辆运行档案（EAM 车辆域，与资产台账弱关联）';

DROP TABLE IF EXISTS `biz_vehicle_brand`;
CREATE TABLE `biz_vehicle_brand` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `brand_name` varchar(60) NOT NULL COMMENT '品牌名称，如 寶馬 / 保时捷',
  `brand_name_en` varchar(60) DEFAULT NULL COMMENT '品牌英文名，供多语言展示',
  `country_origin` varchar(30) DEFAULT NULL COMMENT '产地国家/地区，如 德國 / 日本',
  `status` varchar(20) NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除：0正常 1已删',
  `active_name` varchar(60) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `brand_name` else NULL end)) STORED COMMENT '生成列：未删除时的品牌名，用于唯一约束',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_brand_name` (`active_name`),
  KEY `idx_vehicle_brand_status` (`status`,`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='车辆品牌（车辆参数库第一级）';

DROP TABLE IF EXISTS `biz_vehicle_driver_qualification`;
CREATE TABLE `biz_vehicle_driver_qualification` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` bigint NOT NULL COMMENT '员工 sys_user.id（人员关联用稳定 ID，姓名只作展示）',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `region` varchar(20) NOT NULL COMMENT '驾照适用地区：澳門/中國內地/香港',
  `license_class` varchar(16) NOT NULL COMMENT '准驾范围：A1/B2/C1 …',
  `valid_until` date NOT NULL COMMENT '有效期至；过期按失效处理，禁止新出车',
  `result` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '核验结果：verified/pending/expired',
  `verified_by` varchar(64) DEFAULT NULL COMMENT '核验人',
  `verified_at` datetime DEFAULT NULL COMMENT '核验时间',
  `remark` varchar(300) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_key` varchar(52) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`user_id`,_utf8mb4'|',`region`) else NULL end)) STORED COMMENT '同一员工在同一地区只保留一条现行资格',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_qual_active` (`active_key`),
  KEY `idx_vehicle_qual_user` (`user_id`),
  KEY `idx_vehicle_qual_valid` (`valid_until`),
  CONSTRAINT `ck_vehicle_qual_region` CHECK ((`region` in (_utf8mb4'澳門',_utf8mb4'中國內地',_utf8mb4'香港'))),
  CONSTRAINT `ck_vehicle_qual_result` CHECK ((`result` in (_utf8mb4'verified',_utf8mb4'pending',_utf8mb4'expired')))
) ENGINE=InnoDB AUTO_INCREMENT=162 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='内部员工驾驶资格最小核验记录';

DROP TABLE IF EXISTS `biz_vehicle_manager`;
CREATE TABLE `biz_vehicle_manager` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `vehicle_id` bigint NOT NULL COMMENT '车辆 ID',
  `user_id` bigint NOT NULL COMMENT '管理人员 sys_user.id',
  `emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
  `level` varchar(16) NOT NULL DEFAULT 'manage' COMMENT '权限级别：manage=可办理 view=仅可查阅',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '授权人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_key` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`vehicle_id`,_utf8mb4'|',`user_id`) else NULL end)) STORED COMMENT '软删感知唯一作用域',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_manager_active` (`active_key`),
  KEY `idx_vehicle_manager_user` (`user_id`,`level`),
  KEY `fk_vehicle_manager_vehicle` (`vehicle_id`),
  CONSTRAINT `fk_vehicle_manager_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `biz_vehicle` (`id`),
  CONSTRAINT `ck_vehicle_manager_level` CHECK ((`level` in (_utf8mb4'manage',_utf8mb4'view')))
) ENGINE=InnoDB AUTO_INCREMENT=159 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='车辆授权管理人员关系';

DROP TABLE IF EXISTS `biz_vehicle_model`;
CREATE TABLE `biz_vehicle_model` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `series_id` bigint NOT NULL COMMENT '所属车系 ID',
  `model_name` varchar(80) NOT NULL COMMENT '车型名称，如 530Li 領先型',
  `year_label` varchar(16) NOT NULL DEFAULT '' COMMENT '年款，如 2024款；未知填未知',
  `displacement` varchar(20) DEFAULT NULL COMMENT '排量，如 2.0T；纯电可空',
  `gearbox` varchar(20) DEFAULT NULL COMMENT '变速箱，如 手自一體 / 單速變速器',
  `seat_count` int DEFAULT NULL COMMENT '该年款座位数（覆盖车系默认值）',
  `base_price` decimal(12,2) DEFAULT NULL COMMENT '厂商建议价（用于资产原值参考，金额禁用 float）',
  `status` varchar(20) NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除：0正常 1已删',
  `active_key` varchar(160) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`series_id`,_utf8mb4'|',`model_name`,_utf8mb4'|',`year_label`) else NULL end)) STORED COMMENT '生成列：同车系下「车型+年款」唯一',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_model_series_name_year` (`active_key`),
  KEY `idx_vehicle_model_series` (`series_id`,`status`),
  CONSTRAINT `fk_vehicle_model_series` FOREIGN KEY (`series_id`) REFERENCES `biz_vehicle_series` (`id`),
  CONSTRAINT `ck_vehicle_model_price` CHECK (((`base_price` is null) or (`base_price` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='年款车型（车辆参数库第三级）';

DROP TABLE IF EXISTS `biz_vehicle_series`;
CREATE TABLE `biz_vehicle_series` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `brand_id` bigint NOT NULL COMMENT '所属品牌 ID',
  `series_name` varchar(80) NOT NULL COMMENT '车系名称，如 5系 / Cayenne',
  `body_type` varchar(20) NOT NULL DEFAULT 'sedan' COMMENT '車身形式：sedan/suv/mpv/van/bus/pickup/coupe',
  `energy_type` varchar(20) NOT NULL DEFAULT 'petrol' COMMENT '能源類型：petrol/diesel/hybrid/phev/ev',
  `seat_count` int NOT NULL DEFAULT '5' COMMENT '默认核定载客人数（档案可覆盖）',
  `status` varchar(20) NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除：0正常 1已删',
  `active_key` varchar(140) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`brand_id`,_utf8mb4'|',`series_name`) else NULL end)) STORED COMMENT '生成列：品牌内车系名唯一',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_series_brand_name` (`active_key`),
  KEY `idx_vehicle_series_brand` (`brand_id`,`status`),
  CONSTRAINT `fk_vehicle_series_brand` FOREIGN KEY (`brand_id`) REFERENCES `biz_vehicle_brand` (`id`),
  CONSTRAINT `ck_vehicle_series_body` CHECK ((`body_type` in (_utf8mb4'sedan',_utf8mb4'suv',_utf8mb4'mpv',_utf8mb4'van',_utf8mb4'bus',_utf8mb4'pickup',_utf8mb4'coupe'))),
  CONSTRAINT `ck_vehicle_series_energy` CHECK ((`energy_type` in (_utf8mb4'petrol',_utf8mb4'diesel',_utf8mb4'hybrid',_utf8mb4'phev',_utf8mb4'ev'))),
  CONSTRAINT `ck_vehicle_series_seat` CHECK (((`seat_count` > 0) and (`seat_count` <= 60)))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='车系（车辆参数库第二级）';

DROP TABLE IF EXISTS `biz_vehicle_trip`;
CREATE TABLE `biz_vehicle_trip` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `use_id` bigint NOT NULL COMMENT '用车单 ID',
  `vehicle_id` bigint NOT NULL COMMENT '车辆 ID',
  `vehicle_plate_no` varchar(20) NOT NULL COMMENT '行程发生时的车牌快照（换牌不改历史）',
  `driver_id` bigint NOT NULL COMMENT '实际驾驶人 sys_user.id',
  `driver_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '驾驶人工号快照',
  `driver_name` varchar(64) NOT NULL DEFAULT '' COMMENT '驾驶人姓名快照',
  `status` varchar(20) NOT NULL COMMENT '行程状态：departed/returned/confirmed/pending_check/disputed',
  `depart_at` datetime DEFAULT NULL COMMENT '实际出车时间',
  `start_odometer` decimal(12,2) DEFAULT NULL COMMENT '起始里程',
  `key_received` tinyint DEFAULT NULL COMMENT '钥匙已领取：1=是 0=否',
  `condition_ok` tinyint DEFAULT NULL COMMENT '出发前车况已确认：1=是 0=否',
  `depart_by_id` bigint DEFAULT NULL COMMENT '出车登记人 sys_user.id',
  `depart_by_name` varchar(64) DEFAULT NULL COMMENT '出车登记人姓名',
  `depart_registered_at` datetime DEFAULT NULL COMMENT '出车的系统登记时间',
  `return_at` datetime DEFAULT NULL COMMENT '实际归还时间',
  `end_odometer` decimal(12,2) DEFAULT NULL COMMENT '结束里程',
  `return_place` varchar(120) DEFAULT NULL COMMENT '归还地点',
  `key_returned` tinyint DEFAULT NULL COMMENT '钥匙已交还：1=是 0=否',
  `vehicle_condition` varchar(16) DEFAULT NULL COMMENT '归还车况：normal/abnormal',
  `exception_note` varchar(500) DEFAULT NULL COMMENT '异常说明（车况异常/晚归/里程异常时必填）',
  `confirm_by_id` bigint DEFAULT NULL COMMENT '归还确认人 sys_user.id',
  `confirm_by_name` varchar(64) DEFAULT NULL COMMENT '归还确认人姓名',
  `confirm_at` datetime DEFAULT NULL COMMENT '归还确认时间（确认后才计入正式台账）',
  `mileage` decimal(10,2) DEFAULT NULL COMMENT '行驶里程 = 结束 - 起始，由后端计算',
  `duration_hours` decimal(8,2) DEFAULT NULL COMMENT '用车时长 = 实际归还 - 实际出车（小时），不用申请时段代替',
  `flags` varchar(200) DEFAULT NULL COMMENT '附加标识，逗号分隔：overdue/backfill/corrected/mileage_anomaly/key_pending/condition_abnormal',
  `backfill_entry_at` datetime DEFAULT NULL COMMENT '事后补录时的系统登记时间；正常流程为 NULL',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_use` bigint GENERATED ALWAYS AS ((case when (`deleted` = 0) then `use_id` else NULL end)) STORED COMMENT '一期一单一行程的唯一作用域',
  `active_vehicle_occupy` varchar(32) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`status` in (_utf8mb4'departed',_utf8mb4'returned'))) then concat(_utf8mb4'V',`vehicle_id`) else NULL end)) STORED COMMENT '车辆实际占用唯一约束：未确认归还前同车不得有第二条活动行程',
  `active_driver_occupy` varchar(32) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`status` in (_utf8mb4'departed',_utf8mb4'returned'))) then concat(_utf8mb4'D',`driver_id`) else NULL end)) STORED COMMENT '驾驶人实际占用唯一约束：同驾驶人不得同时执行两段行程',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_trip_use` (`active_use`),
  UNIQUE KEY `uk_vehicle_trip_active_vehicle` (`active_vehicle_occupy`),
  UNIQUE KEY `uk_vehicle_trip_active_driver` (`active_driver_occupy`),
  KEY `idx_vehicle_trip_vehicle_time` (`vehicle_id`,`depart_at`),
  KEY `idx_vehicle_trip_driver_time` (`driver_id`,`depart_at`),
  KEY `idx_vehicle_trip_status` (`status`),
  KEY `fk_vehicle_trip_use` (`use_id`),
  CONSTRAINT `fk_vehicle_trip_use` FOREIGN KEY (`use_id`) REFERENCES `biz_vehicle_use` (`id`),
  CONSTRAINT `fk_vehicle_trip_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `biz_vehicle` (`id`),
  CONSTRAINT `ck_vehicle_trip_condition` CHECK (((`vehicle_condition` is null) or (`vehicle_condition` in (_utf8mb4'normal',_utf8mb4'abnormal')))),
  CONSTRAINT `ck_vehicle_trip_mileage` CHECK (((`mileage` is null) or (`mileage` >= 0))),
  CONSTRAINT `ck_vehicle_trip_odometer` CHECK ((((`start_odometer` is null) or (`start_odometer` >= 0)) and ((`end_odometer` is null) or (`end_odometer` >= 0)))),
  CONSTRAINT `ck_vehicle_trip_status` CHECK ((`status` in (_utf8mb4'departed',_utf8mb4'returned',_utf8mb4'confirmed',_utf8mb4'pending_check',_utf8mb4'disputed')))
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用车行程（实际出还车与归还核对，与用车单 1:1）';

DROP TABLE IF EXISTS `biz_vehicle_use`;
CREATE TABLE `biz_vehicle_use` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `use_no` varchar(32) NOT NULL COMMENT '用车单号（审批=YC / 直接登记=ZC / 补录=BL + YYYYMMDD + 4位）',
  `source` varchar(20) NOT NULL COMMENT '数据来源：oa_approval/direct_register/backfill',
  `approval_outcome` varchar(20) NOT NULL COMMENT '审批结论：not_submitted/approving/approved/rejected/cancelled/direct/not_applicable',
  `status` varchar(20) NOT NULL COMMENT '业务状态：draft/approving/to_assign/to_depart/in_use/to_confirm/completed/rejected/cancelled',
  `flow_no` varchar(32) DEFAULT NULL COMMENT '关联 OA 流程编号（审批用车才有）',
  `applicant_id` bigint NOT NULL COMMENT '申请人 sys_user.id（服务端从 JWT 取，不信前端传值）',
  `applicant_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '申请人工号快照',
  `applicant_name` varchar(64) NOT NULL DEFAULT '' COMMENT '申请人姓名快照',
  `actual_user_name` varchar(64) NOT NULL DEFAULT '' COMMENT '实际用车人（可与申请人不同，代登记场景必填）',
  `department_id` bigint NOT NULL COMMENT '用车部门 sys_department.id',
  `department_name` varchar(128) NOT NULL DEFAULT '' COMMENT '用车部门名称快照',
  `intent_vehicle_id` bigint DEFAULT NULL COMMENT '意向车辆（安排前不代表预约成功）',
  `intent_plate_no` varchar(20) DEFAULT NULL COMMENT '意向车牌快照',
  `final_vehicle_id` bigint DEFAULT NULL COMMENT '最终车辆；安排成功才形成有效占用',
  `final_plate_no` varchar(20) DEFAULT NULL COMMENT '最终车牌快照',
  `driver_id` bigint DEFAULT NULL COMMENT '实际驾驶人 sys_user.id（与申请人、用车人分列）',
  `driver_emp_no` varchar(32) DEFAULT NULL COMMENT '驾驶人工号快照',
  `driver_name` varchar(64) DEFAULT NULL COMMENT '驾驶人姓名快照',
  `driving_mode` varchar(20) NOT NULL COMMENT '驾驶方式：self/company_driver',
  `passenger_count` int NOT NULL DEFAULT '1' COMMENT '人数（含驾驶人）',
  `purpose` varchar(200) NOT NULL COMMENT '用车事由',
  `origin` varchar(120) NOT NULL DEFAULT '' COMMENT '出发地',
  `destination` varchar(120) NOT NULL DEFAULT '' COMMENT '目的地',
  `planned_start` datetime NOT NULL COMMENT '计划开始时间',
  `planned_end` datetime NOT NULL COMMENT '计划结束时间（超时只标记，不倒改）',
  `assign_by_id` bigint DEFAULT NULL COMMENT '安排人 sys_user.id',
  `assign_by_name` varchar(64) DEFAULT NULL COMMENT '安排人姓名',
  `assign_at` datetime DEFAULT NULL COMMENT '安排时间',
  `direct_reason` varchar(300) DEFAULT NULL COMMENT '授权直接登记原因（source=direct_register 时必填）',
  `conflict_note` varchar(300) DEFAULT NULL COMMENT '冲突/改派说明（如受前车晚归影响）',
  `prev_use_id` bigint DEFAULT NULL COMMENT '重提来源单（驳回/取消后复制重提，保留关联不改写原审批历史）',
  `backfill_entry_at` datetime DEFAULT NULL COMMENT '补录的"系统登记时间"，与 planned/actual 时间分离',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
  `request_hash` varchar(64) DEFAULT NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_use_no` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then `use_no` else NULL end)) STORED COMMENT '软删感知唯一作用域：单号',
  `active_reservation_vehicle` varchar(80) GENERATED ALWAYS AS ((case when ((`deleted` = 0) and (`status` in (_utf8mb4'to_depart',_utf8mb4'in_use',_utf8mb4'to_confirm')) and (`final_vehicle_id` is not null)) then concat(_utf8mb4'V',`final_vehicle_id`,_utf8mb4'|',date_format(`planned_start`,_utf8mb4'%Y%m%d%H%i'),_utf8mb4'|',date_format(`planned_end`,_utf8mb4'%Y%m%d%H%i')) else NULL end)) STORED COMMENT '完全相同占用窗口的重复预约兜底（区间重叠仍需服务端锁内当前读判定）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_use_no` (`active_use_no`),
  UNIQUE KEY `uk_vehicle_use_request` (`applicant_id`,`request_key`),
  UNIQUE KEY `uk_vehicle_use_reservation` (`active_reservation_vehicle`),
  KEY `idx_vehicle_use_status` (`status`,`planned_start`),
  KEY `idx_vehicle_use_vehicle` (`final_vehicle_id`,`status`),
  KEY `idx_vehicle_use_driver` (`driver_id`,`status`),
  KEY `idx_vehicle_use_dept` (`department_id`,`planned_start`),
  KEY `idx_vehicle_use_flow` (`flow_no`),
  KEY `idx_vehicle_use_backfill` (`source`,`status`),
  KEY `fk_vehicle_use_intent` (`intent_vehicle_id`),
  KEY `fk_vehicle_use_prev` (`prev_use_id`),
  KEY `idx_vehicle_use_overdue` (`status`,`planned_end`),
  CONSTRAINT `fk_vehicle_use_final` FOREIGN KEY (`final_vehicle_id`) REFERENCES `biz_vehicle` (`id`),
  CONSTRAINT `fk_vehicle_use_intent` FOREIGN KEY (`intent_vehicle_id`) REFERENCES `biz_vehicle` (`id`),
  CONSTRAINT `fk_vehicle_use_prev` FOREIGN KEY (`prev_use_id`) REFERENCES `biz_vehicle_use` (`id`),
  CONSTRAINT `ck_vehicle_use_approval` CHECK ((`approval_outcome` in (_utf8mb4'not_submitted',_utf8mb4'approving',_utf8mb4'approved',_utf8mb4'rejected',_utf8mb4'cancelled',_utf8mb4'direct',_utf8mb4'not_applicable'))),
  CONSTRAINT `ck_vehicle_use_backfill_na` CHECK (((`source` <> _utf8mb4'backfill') or (`approval_outcome` = _utf8mb4'not_applicable'))),
  CONSTRAINT `ck_vehicle_use_direct_reason` CHECK (((`source` <> _utf8mb4'direct_register') or ((`approval_outcome` = _utf8mb4'direct') and (`direct_reason` is not null)))),
  CONSTRAINT `ck_vehicle_use_mode` CHECK ((`driving_mode` in (_utf8mb4'self',_utf8mb4'company_driver'))),
  CONSTRAINT `ck_vehicle_use_oa_source` CHECK (((`source` <> _utf8mb4'oa_approval') or (`approval_outcome` in (_utf8mb4'not_submitted',_utf8mb4'approving',_utf8mb4'approved',_utf8mb4'rejected',_utf8mb4'cancelled')))),
  CONSTRAINT `ck_vehicle_use_passenger` CHECK ((`passenger_count` > 0)),
  CONSTRAINT `ck_vehicle_use_source` CHECK ((`source` in (_utf8mb4'oa_approval',_utf8mb4'direct_register',_utf8mb4'backfill'))),
  CONSTRAINT `ck_vehicle_use_status` CHECK ((`status` in (_utf8mb4'draft',_utf8mb4'approving',_utf8mb4'to_assign',_utf8mb4'to_depart',_utf8mb4'in_use',_utf8mb4'to_confirm',_utf8mb4'completed',_utf8mb4'rejected',_utf8mb4'cancelled'))),
  CONSTRAINT `ck_vehicle_use_window` CHECK ((`planned_end` > `planned_start`))
) ENGINE=InnoDB AUTO_INCREMENT=186 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用车单（申请/安排/审批引用/业务状态）';

DROP TABLE IF EXISTS `biz_vehicle_use_department`;
CREATE TABLE `biz_vehicle_use_department` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `vehicle_id` bigint NOT NULL COMMENT '车辆 ID',
  `dept_id` bigint NOT NULL COMMENT '被授权部门 sys_department.id',
  `dept_name` varchar(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
  `created_by` varchar(64) NOT NULL DEFAULT '' COMMENT '授权人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0=正常 1=已删',
  `active_key` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`vehicle_id`,_utf8mb4'|',`dept_id`) else NULL end)) STORED COMMENT '软删感知唯一作用域',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_dept_active` (`active_key`),
  KEY `idx_vehicle_dept_dept` (`dept_id`),
  KEY `fk_vehicle_dept_vehicle` (`vehicle_id`),
  CONSTRAINT `fk_vehicle_dept_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `biz_vehicle` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=164 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='车辆可使用部门授权关系';

DROP TABLE IF EXISTS `biz_vehicle_use_event`;
CREATE TABLE `biz_vehicle_use_event` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `use_id` bigint DEFAULT NULL COMMENT '用车单 ID（车辆级配置变更为空）',
  `vehicle_id` bigint DEFAULT NULL COMMENT '车辆 ID',
  `target_no` varchar(40) NOT NULL DEFAULT '' COMMENT '对象编号快照（单号或车牌），便于跨表追溯',
  `action` varchar(32) NOT NULL COMMENT '动作：apply/approve_snapshot/assign/direct_register/depart/return/confirm/backfill/correct/config_change/qual_verify',
  `before_json` text COMMENT '变更前值 JSON（更正类必填）',
  `after_json` text COMMENT '变更后值 JSON',
  `reason` varchar(500) DEFAULT NULL COMMENT '原因/说明（直接登记原因、更正理由、补录说明）',
  `operator_id` bigint DEFAULT NULL COMMENT '操作人 sys_user.id',
  `operator_name` varchar(64) NOT NULL DEFAULT '' COMMENT '操作人姓名',
  `operator_emp_no` varchar(32) NOT NULL DEFAULT '' COMMENT '操作人工号',
  `request_key` varchar(64) DEFAULT NULL COMMENT '幂等键（重复回调只留一条事件）',
  `occurred_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件发生时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_event_request` (`operator_id`,`request_key`),
  KEY `idx_vehicle_event_use` (`use_id`,`id`),
  KEY `idx_vehicle_event_vehicle` (`vehicle_id`,`id`),
  KEY `idx_vehicle_event_action` (`action`,`occurred_at`)
) ENGINE=InnoDB AUTO_INCREMENT=284 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用车审计事件（追加式，不可被业务页面删改）';

DROP TABLE IF EXISTS `biz_workflow_config`;
CREATE TABLE `biz_workflow_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_id` varchar(32) DEFAULT NULL COMMENT '配置ID（LC+5位自增序号）',
  `flow_type` varchar(32) NOT NULL COMMENT '流程类型标识: recharge/deduct/transfer/merge/gift',
  `flow_name` varchar(64) NOT NULL COMMENT '流程展示名称',
  `approval_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '审批开关: 1=启用审批, 0=停用(直接执行)',
  `description` varchar(200) DEFAULT NULL COMMENT '流程说明',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `nodes_config` text COMMENT '审批节点配置JSON',
  `routing_rules` text COMMENT '路由规则JSON',
  PRIMARY KEY (`id`),
  UNIQUE KEY `flow_type` (`flow_type`),
  UNIQUE KEY `uk_workflow_flow_type` (`flow_type`)
) ENGINE=InnoDB AUTO_INCREMENT=254 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='流程配置表';

DROP TABLE IF EXISTS `doc_ack_receipt`;
CREATE TABLE `doc_ack_receipt` (
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `acknowledged_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source_ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`node_id`,`revision_id`,`user_id`),
  KEY `idx_doc_ack_receipt_user` (`user_id`,`acknowledged_at`),
  CONSTRAINT `fk_doc_ack_receipt_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_ack_receipt_revision` FOREIGN KEY (`node_id`, `revision_id`) REFERENCES `doc_revision` (`node_id`, `id`),
  CONSTRAINT `fk_doc_ack_receipt_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC制度签收回执';

DROP TABLE IF EXISTS `doc_ack_target`;
CREATE TABLE `doc_ack_target` (
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `subject_type` varchar(16) NOT NULL COMMENT 'DEPT/ROLE/ALL',
  `subject_id` varchar(64) NOT NULL COMMENT '部门/角色ID；ALL=0',
  `due_at` date DEFAULT NULL COMMENT '要求完成日期，空=不限',
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`node_id`,`revision_id`,`subject_type`,`subject_id`),
  KEY `idx_doc_ack_target_subject` (`subject_type`,`subject_id`),
  KEY `fk_doc_ack_target_creator` (`created_by`),
  CONSTRAINT `fk_doc_ack_target_creator` FOREIGN KEY (`created_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_ack_target_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_ack_target_revision` FOREIGN KEY (`node_id`, `revision_id`) REFERENCES `doc_revision` (`node_id`, `id`),
  CONSTRAINT `ck_doc_ack_target_type` CHECK ((`subject_type` in (_utf8mb4'DEPT',_utf8mb4'ROLE',_utf8mb4'ALL')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC制度签收范围';

DROP TABLE IF EXISTS `doc_acl_entry`;
CREATE TABLE `doc_acl_entry` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `subject_type` varchar(16) NOT NULL COMMENT 'USER/DEPT/ROLE/ALL',
  `subject_id` varchar(64) NOT NULL COMMENT '用户/部门/角色ID；ALL=0',
  `permissions` int NOT NULL DEFAULT '1' COMMENT '1读 3读写',
  `expires_at` datetime DEFAULT NULL COMMENT '空=长期',
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_acl_entry` (`node_id`,`subject_type`,`subject_id`),
  KEY `idx_doc_acl_lookup` (`subject_type`,`subject_id`,`node_id`),
  KEY `idx_doc_acl_expiry` (`node_id`,`expires_at`),
  CONSTRAINT `fk_doc_acl_entry_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `ck_doc_acl_entry_perm` CHECK ((`permissions` in (1,3))),
  CONSTRAINT `ck_doc_acl_entry_subject` CHECK ((`subject_type` in (_utf8mb4'USER',_utf8mb4'DEPT',_utf8mb4'ROLE',_utf8mb4'ALL')))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC文档主体授权（只能收窄空间权限）';

DROP TABLE IF EXISTS `doc_api_catalog`;
CREATE TABLE `doc_api_catalog` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `system_code` varchar(32) NOT NULL,
  `system_name` varchar(100) NOT NULL,
  `method` varchar(8) NOT NULL,
  `path` varchar(500) NOT NULL,
  `handler` varchar(255) NOT NULL,
  `request_schema` mediumtext COMMENT '参数/请求体类型 JSON 数组',
  `response_schema` mediumtext COMMENT '返回类型签名',
  `source` varchar(16) NOT NULL DEFAULT 'code' COMMENT 'code/openapi/manual',
  `synced_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `api_name` varchar(200) DEFAULT NULL COMMENT '对外接口名称',
  `description` varchar(1000) DEFAULT NULL COMMENT '接口说明',
  `scenario` varchar(2000) DEFAULT NULL COMMENT '使用场景/前置条件',
  `auth_type` varchar(32) NOT NULL DEFAULT 'JWT' COMMENT '鉴权方式',
  `auth_scope` varchar(500) DEFAULT NULL COMMENT '所需权限/scope',
  `visibility` tinyint NOT NULL DEFAULT '1' COMMENT '1内部 2合作方 3公开',
  `doc_status` tinyint NOT NULL DEFAULT '1' COMMENT '1草稿 2已发布 3已弃用',
  `owner_user_id` bigint DEFAULT NULL COMMENT '接口负责人',
  `version` varchar(32) NOT NULL DEFAULT 'v1' COMMENT '接口版本',
  `base_url` varchar(255) DEFAULT NULL COMMENT '调用基地址',
  `request_example` mediumtext COMMENT '请求示例',
  `response_example` mediumtext COMMENT '响应示例',
  `error_codes` mediumtext COMMENT '错误码说明',
  `changelog` mediumtext COMMENT '变更记录',
  `active` tinyint NOT NULL DEFAULT '1' COMMENT '代码扫描是否仍存在',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_api_catalog` (`system_code`,`method`,`path`),
  KEY `idx_doc_api_catalog_system` (`system_code`,`path`),
  KEY `idx_doc_api_catalog_source` (`source`,`synced_at`),
  CONSTRAINT `ck_doc_api_catalog_method` CHECK ((`method` in (_utf8mb4'GET',_utf8mb4'POST',_utf8mb4'PUT',_utf8mb4'DELETE',_utf8mb4'PATCH',_utf8mb4'HEAD',_utf8mb4'OPTIONS')))
) ENGINE=InnoDB AUTO_INCREMENT=14192 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC全系统接口清单';

DROP TABLE IF EXISTS `doc_api_change`;
CREATE TABLE `doc_api_change` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `from_spec_id` bigint DEFAULT NULL,
  `to_spec_id` bigint NOT NULL,
  `change_type` tinyint NOT NULL COMMENT '1新增 2删除 3破坏性 4弃用 5文档',
  `operation_key` varchar(300) NOT NULL,
  `detail` varchar(1000) DEFAULT NULL,
  `acknowledged_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_api_change_node` (`node_id`,`created_at`),
  KEY `fk_doc_api_change_from` (`from_spec_id`),
  KEY `fk_doc_api_change_to` (`to_spec_id`),
  KEY `fk_doc_api_change_ack` (`acknowledged_by`),
  CONSTRAINT `fk_doc_api_change_ack` FOREIGN KEY (`acknowledged_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_api_change_from` FOREIGN KEY (`from_spec_id`) REFERENCES `doc_api_spec` (`id`),
  CONSTRAINT `fk_doc_api_change_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_api_change_to` FOREIGN KEY (`to_spec_id`) REFERENCES `doc_api_spec` (`id`),
  CONSTRAINT `ck_doc_api_change_type` CHECK ((`change_type` in (1,2,3,4,5)))
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC接口版本差异';

DROP TABLE IF EXISTS `doc_api_operation`;
CREATE TABLE `doc_api_operation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `spec_id` bigint NOT NULL,
  `operation_id` varchar(160) NOT NULL,
  `method` varchar(8) NOT NULL,
  `path` varchar(255) NOT NULL,
  `summary` varchar(255) DEFAULT NULL,
  `tag` varchar(64) DEFAULT NULL,
  `deprecated` tinyint NOT NULL DEFAULT '0',
  `schema_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `owner_user_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_api_op` (`spec_id`,`method`,`path`),
  KEY `idx_doc_api_op_path` (`path`),
  KEY `fk_doc_api_op_owner` (`owner_user_id`),
  CONSTRAINT `fk_doc_api_op_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_api_op_spec` FOREIGN KEY (`spec_id`) REFERENCES `doc_api_spec` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC接口操作清单';

DROP TABLE IF EXISTS `doc_api_spec`;
CREATE TABLE `doc_api_spec` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `system_code` varchar(32) NOT NULL,
  `spec_format` varchar(16) NOT NULL DEFAULT 'openapi3',
  `spec_version` varchar(32) NOT NULL,
  `base_url` varchar(255) DEFAULT NULL,
  `source_type` tinyint NOT NULL DEFAULT '1' COMMENT '1上传 2同步 3手工',
  `raw_spec` mediumtext NOT NULL,
  `spec_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `synced_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_api_spec_ver` (`node_id`,`spec_version`),
  KEY `idx_doc_api_system` (`system_code`,`created_at`),
  KEY `fk_doc_api_spec_revision` (`revision_id`),
  CONSTRAINT `fk_doc_api_spec_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_api_spec_revision` FOREIGN KEY (`revision_id`) REFERENCES `doc_revision` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC接口规范版本';

DROP TABLE IF EXISTS `doc_archive_meta`;
CREATE TABLE `doc_archive_meta` (
  `node_id` bigint NOT NULL,
  `archive_no` varchar(64) NOT NULL,
  `fonds_code` varchar(32) NOT NULL COMMENT '全宗=空间编码',
  `series_code` varchar(32) DEFAULT NULL,
  `security_level` tinyint NOT NULL DEFAULT '2',
  `retention_years` smallint NOT NULL DEFAULT '10',
  `retention_start` date NOT NULL,
  `disposal_state` tinyint NOT NULL DEFAULT '0' COMMENT '0正常 1待鉴定 2已批准 3已销毁',
  `legal_hold` tinyint NOT NULL DEFAULT '0',
  `archived_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_by` bigint NOT NULL,
  PRIMARY KEY (`node_id`),
  UNIQUE KEY `uk_doc_archive_no` (`archive_no`),
  KEY `idx_doc_archive_retention` (`retention_start`,`retention_years`),
  KEY `fk_doc_archive_user` (`archived_by`),
  CONSTRAINT `fk_doc_archive_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_archive_user` FOREIGN KEY (`archived_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_archive_disposal` CHECK ((`disposal_state` in (0,1,2,3))),
  CONSTRAINT `ck_doc_archive_hold` CHECK ((`legal_hold` in (0,1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC档案元数据';

DROP TABLE IF EXISTS `doc_asset`;
CREATE TABLE `doc_asset` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `space_id` bigint NOT NULL COMMENT '所属空间',
  `sha256` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '内容哈希',
  `storage_provider` varchar(16) NOT NULL DEFAULT 'local' COMMENT 'local/s3',
  `bucket` varchar(64) NOT NULL DEFAULT '',
  `object_key` varchar(500) NOT NULL COMMENT '对象键，服务端生成',
  `original_name` varchar(255) NOT NULL,
  `mime` varchar(128) NOT NULL,
  `size_bytes` bigint NOT NULL,
  `page_count` int DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1待确认 2可用 3拒绝 4已删除',
  `scan_result` varchar(200) DEFAULT NULL COMMENT '病毒扫描结果；UNSCANNED=未扫描',
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_asset_hash` (`space_id`,`sha256`,`size_bytes`),
  KEY `idx_doc_asset_space` (`space_id`,`created_at`),
  KEY `idx_doc_asset_creator` (`created_by`,`created_at`),
  CONSTRAINT `fk_doc_asset_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space` (`id`),
  CONSTRAINT `ck_doc_asset_size` CHECK ((`size_bytes` > 0)),
  CONSTRAINT `ck_doc_asset_status` CHECK ((`status` in (1,2,3,4)))
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC对象存储资产元数据（禁止存二进制）';

DROP TABLE IF EXISTS `doc_audit_event`;
CREATE TABLE `doc_audit_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint DEFAULT NULL,
  `space_id` bigint NOT NULL,
  `actor_user_id` bigint NOT NULL,
  `action` varchar(64) NOT NULL,
  `revision_id` bigint DEFAULT NULL,
  `detail` varchar(500) NOT NULL DEFAULT '',
  `request_key` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_audit_node` (`node_id`,`id`),
  KEY `fk_doc_audit_space` (`space_id`),
  CONSTRAINT `fk_doc_audit_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_audit_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space_access` (`space_id`)
) ENGINE=InnoDB AUTO_INCREMENT=694 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC追加式关键操作审计';

DROP TABLE IF EXISTS `doc_book_meta`;
CREATE TABLE `doc_book_meta` (
  `node_id` bigint NOT NULL,
  `isbn` varchar(32) DEFAULT NULL,
  `author` varchar(200) DEFAULT NULL,
  `publisher` varchar(200) DEFAULT NULL,
  `publish_year` int DEFAULT NULL,
  `language` varchar(16) DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `cover_asset_id` bigint DEFAULT NULL,
  `book_category_id` bigint DEFAULT NULL,
  `access_mode` tinyint NOT NULL DEFAULT '1' COMMENT '1自由阅读 2限时借阅',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`node_id`),
  KEY `fk_doc_book_cover` (`cover_asset_id`),
  KEY `fk_doc_book_category` (`book_category_id`),
  CONSTRAINT `fk_doc_book_category` FOREIGN KEY (`book_category_id`) REFERENCES `doc_category` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_doc_book_cover` FOREIGN KEY (`cover_asset_id`) REFERENCES `doc_asset` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_doc_book_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `ck_doc_book_access` CHECK ((`access_mode` in (1,2)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC书目扩展（PDF/Office 书籍共用）';

DROP TABLE IF EXISTS `doc_category`;
CREATE TABLE `doc_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `space_id` bigint NOT NULL COMMENT '所属空间',
  `parent_id` bigint NOT NULL DEFAULT '0' COMMENT '父分类，0=根',
  `code` varchar(64) NOT NULL COMMENT '空间内稳定编码',
  `name` varchar(100) NOT NULL COMMENT '分类名称',
  `path` varchar(500) NOT NULL COMMENT '物化路径，如 /1/5/9/',
  `level` tinyint NOT NULL DEFAULT '1' COMMENT '层级 1-4',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序，小在前',
  `doc_count` int NOT NULL DEFAULT '0' COMMENT '文档计数（异步汇总）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1启用 0停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_category_code` (`space_id`,`code`),
  KEY `idx_doc_category_parent` (`space_id`,`parent_id`,`sort_order`),
  KEY `idx_doc_category_path` (`space_id`,`path`),
  CONSTRAINT `fk_doc_category_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space` (`id`),
  CONSTRAINT `ck_doc_category_level` CHECK ((`level` between 1 and 4)),
  CONSTRAINT `ck_doc_category_status` CHECK ((`status` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC分类树（空间内导航，不承载权限）';

DROP TABLE IF EXISTS `doc_clearance_audit`;
CREATE TABLE `doc_clearance_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '被授权人',
  `old_level` tinyint NOT NULL COMMENT '变更前密级 1-4',
  `new_level` tinyint NOT NULL COMMENT '变更后密级 1-4',
  `granted_by` bigint NOT NULL COMMENT '操作人',
  `expires_at` datetime DEFAULT NULL COMMENT '本次授权到期时间，空=长期',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_clearance_audit_user` (`user_id`,`id`),
  KEY `fk_doc_clearance_audit_operator` (`granted_by`),
  CONSTRAINT `fk_doc_clearance_audit_operator` FOREIGN KEY (`granted_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_clearance_audit_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_clearance_audit_level` CHECK (((`old_level` between 1 and 4) and (`new_level` between 1 and 4)))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC密级授权变更审计';

DROP TABLE IF EXISTS `doc_confirmation`;
CREATE TABLE `doc_confirmation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `reviewer_user_id` bigint NOT NULL,
  `status` int NOT NULL DEFAULT '1' COMMENT '1待确认 2通过 3退回 4撤回',
  `note` varchar(200) NOT NULL DEFAULT '',
  `submitted_by` bigint NOT NULL,
  `decided_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_confirmation_pending` (`node_id`,`status`),
  KEY `fk_doc_confirmation_revision` (`node_id`,`revision_id`),
  KEY `fk_doc_confirmation_reviewer` (`reviewer_user_id`),
  CONSTRAINT `fk_doc_confirmation_reviewer` FOREIGN KEY (`reviewer_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_confirmation_revision` FOREIGN KEY (`node_id`, `revision_id`) REFERENCES `doc_revision` (`node_id`, `id`),
  CONSTRAINT `ck_doc_confirmation_status` CHECK ((`status` in (1,2,3,4)))
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC精确版本确认';

DROP TABLE IF EXISTS `doc_disposal_request`;
CREATE TABLE `doc_disposal_request` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `reason` varchar(500) NOT NULL,
  `requested_by` bigint NOT NULL,
  `approved_by` bigint DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1待审批 2通过 3驳回 4已销毁',
  `certificate_no` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` datetime DEFAULT NULL,
  `destroyed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_disposal_status` (`status`,`created_at`),
  KEY `idx_doc_disposal_node` (`node_id`,`created_at`),
  KEY `fk_doc_disposal_requester` (`requested_by`),
  KEY `fk_doc_disposal_approver` (`approved_by`),
  CONSTRAINT `fk_doc_disposal_approver` FOREIGN KEY (`approved_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_disposal_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_disposal_requester` FOREIGN KEY (`requested_by`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_disposal_status` CHECK ((`status` in (1,2,3,4)))
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC销毁申请与审批';

DROP TABLE IF EXISTS `doc_document_acl`;
CREATE TABLE `doc_document_acl` (
  `node_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `permissions` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`node_id`,`user_id`),
  KEY `fk_doc_acl_user` (`user_id`),
  CONSTRAINT `fk_doc_acl_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_acl_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_acl_permissions` CHECK ((`permissions` in (1,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC文件收窄授权及草稿协作者';

DROP TABLE IF EXISTS `doc_favorite`;
CREATE TABLE `doc_favorite` (
  `user_id` bigint NOT NULL,
  `node_id` bigint NOT NULL,
  `folder` varchar(64) NOT NULL DEFAULT '默认',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`node_id`),
  KEY `idx_doc_favorite_user` (`user_id`,`created_at`),
  KEY `fk_doc_favorite_node` (`node_id`),
  CONSTRAINT `fk_doc_favorite_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_favorite_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC收藏';

DROP TABLE IF EXISTS `doc_handoff`;
CREATE TABLE `doc_handoff` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `sender_user_id` bigint NOT NULL,
  `recipient_user_id` bigint NOT NULL,
  `completed_text` varchar(2000) NOT NULL,
  `remaining_text` varchar(2000) NOT NULL,
  `risk_text` varchar(2000) NOT NULL DEFAULT '',
  `status` int NOT NULL DEFAULT '1' COMMENT '1待接收 2已接收',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_handoff_pending` (`node_id`,`status`),
  KEY `fk_doc_handoff_revision` (`node_id`,`revision_id`),
  KEY `fk_doc_handoff_sender` (`sender_user_id`),
  KEY `fk_doc_handoff_recipient` (`recipient_user_id`),
  CONSTRAINT `fk_doc_handoff_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_handoff_revision` FOREIGN KEY (`node_id`, `revision_id`) REFERENCES `doc_revision` (`node_id`, `id`),
  CONSTRAINT `fk_doc_handoff_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_handoff_status` CHECK ((`status` in (1,2)))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC版本交接';

DROP TABLE IF EXISTS `doc_ingest_request`;
CREATE TABLE `doc_ingest_request` (
  `actor_user_id` bigint NOT NULL,
  `request_key` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `request_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `node_id` bigint DEFAULT NULL,
  `response_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`actor_user_id`,`request_key`),
  KEY `fk_doc_receipt_node` (`node_id`),
  CONSTRAINT `fk_doc_receipt_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC事务幂等回执';

DROP TABLE IF EXISTS `doc_integration_grant`;
CREATE TABLE `doc_integration_grant` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `owner_user_id` bigint NOT NULL,
  `space_id` bigint NOT NULL,
  `name` varchar(64) NOT NULL,
  `token_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `rate_window` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `request_count` int NOT NULL DEFAULT '0',
  `can_write` tinyint NOT NULL DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `max_confidentiality` tinyint NOT NULL DEFAULT '2' COMMENT '机器令牌可读最高密级，默认内部',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_grant_hash` (`token_hash`),
  KEY `idx_doc_grant_owner` (`owner_user_id`,`revoked_at`),
  KEY `fk_doc_grant_space` (`space_id`),
  CONSTRAINT `fk_doc_grant_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_grant_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space_access` (`space_id`),
  CONSTRAINT `ck_doc_grant_write` CHECK ((`can_write` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=57 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC可撤销集成授权，禁止存明文令牌';

DROP TABLE IF EXISTS `doc_learning_path`;
CREATE TABLE `doc_learning_path` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `name` varchar(64) NOT NULL COMMENT '路徑名稱',
  `description` varchar(255) DEFAULT NULL COMMENT '路徑說明',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用（停用後僅管理側可見）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序（小在前）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  KEY `idx_doc_learning_path_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC-學習路徑（新人入職包/培訓清單）';

DROP TABLE IF EXISTS `doc_learning_path_item`;
CREATE TABLE `doc_learning_path_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `path_id` bigint NOT NULL COMMENT '所屬路徑ID',
  `node_id` bigint NOT NULL COMMENT '文檔ID（doc_node.id）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '路徑內順序（小在前）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  KEY `idx_doc_learning_item_path` (`path_id`,`sort_order`),
  KEY `idx_doc_learning_item_node` (`node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC-學習路徑條目（有序文檔清單）';

DROP TABLE IF EXISTS `doc_native_document`;
CREATE TABLE `doc_native_document` (
  `node_id` bigint NOT NULL,
  `document_no` varchar(40) NOT NULL,
  `space_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  `source_key` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `draft_revision_id` bigint DEFAULT NULL,
  `effective_revision_id` bigint DEFAULT NULL,
  `adopted_revision_id` bigint DEFAULT NULL,
  `version` int NOT NULL DEFAULT '1',
  `lifecycle` int NOT NULL DEFAULT '1' COMMENT '1有效 2归档 3废弃',
  `execution_status` int NOT NULL DEFAULT '1' COMMENT '1未开始 2执行中 3暂停 4完成',
  `restricted` tinyint NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint DEFAULT NULL,
  `deletion_reason` varchar(200) DEFAULT NULL,
  `review_due_at` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `content_kind` tinyint NOT NULL DEFAULT '1' COMMENT '1Markdown 2PDF 3Office 4外链 5OpenAPI',
  `category_id` bigint DEFAULT NULL COMMENT '主分类ID',
  `confidentiality` tinyint NOT NULL DEFAULT '2' COMMENT '1公开 2内部 3敏感 4机密',
  `download_policy` tinyint NOT NULL DEFAULT '1' COMMENT '1允许 2需审批 3禁止',
  `source_url` varchar(500) DEFAULT NULL COMMENT '外链型文档的目标地址',
  `legal_hold` tinyint NOT NULL DEFAULT '0' COMMENT '1法律冻结，禁止销毁',
  `effective_from` date DEFAULT NULL COMMENT '生效日期；P1 制度生命周期使用',
  PRIMARY KEY (`node_id`),
  UNIQUE KEY `uk_doc_native_no` (`document_no`),
  UNIQUE KEY `uk_doc_native_source` (`created_by_user_id`,`source_key`),
  KEY `idx_doc_native_space` (`space_id`,`deleted_at`,`updated_at`),
  KEY `fk_doc_native_owner` (`owner_user_id`),
  KEY `idx_doc_native_category` (`category_id`),
  KEY `idx_doc_native_conf` (`confidentiality`),
  CONSTRAINT `fk_doc_native_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_native_node` FOREIGN KEY (`node_id`) REFERENCES `doc_node` (`id`),
  CONSTRAINT `fk_doc_native_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_native_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space_access` (`space_id`),
  CONSTRAINT `ck_doc_native_state` CHECK (((`lifecycle` in (1,2,3)) and (`execution_status` in (1,2,3,4)) and (`version` > 0) and (`restricted` in (0,1))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC原生文档身份扩展';

DROP TABLE IF EXISTS `doc_node`;
CREATE TABLE `doc_node` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `space_id` bigint NOT NULL COMMENT '所屬空間ID',
  `category` varchar(64) NOT NULL DEFAULT '未分類' COMMENT '文檔分類',
  `title` varchar(200) NOT NULL COMMENT '文檔標題',
  `doc_type` tinyint NOT NULL DEFAULT '1' COMMENT '類型: 1=在線文檔 2=表格 3=幻燈片 4=PDF 5=外部鏈接',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '狀態: 1=草稿 2=評審中 3=已發布 4=已歸檔',
  `tags` varchar(255) DEFAULT NULL COMMENT '標籤（逗號分隔）',
  `owner_user_id` bigint DEFAULT NULL COMMENT '負責人用戶ID',
  `owner_name` varchar(64) DEFAULT NULL COMMENT '負責人姓名（冗餘快照）',
  `tencent_file_id` varchar(64) DEFAULT NULL COMMENT '騰訊文檔fileID（同步寫入；手工登記為空）',
  `tencent_url` varchar(500) NOT NULL COMMENT '騰訊文檔鏈接（閱讀出口）',
  `biz_type` varchar(16) DEFAULT NULL COMMENT '業務掛接類型: REQ=產研交付需求單',
  `biz_id` bigint DEFAULT NULL COMMENT '業務掛接ID',
  `summary` varchar(1000) DEFAULT NULL COMMENT '文檔摘要',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `category_id` bigint DEFAULT NULL COMMENT '主分类ID，兼容旧category快照',
  PRIMARY KEY (`id`),
  KEY `idx_doc_node_space` (`space_id`,`deleted`),
  KEY `idx_doc_node_biz` (`biz_type`,`biz_id`),
  KEY `idx_doc_node_file` (`tencent_file_id`),
  KEY `idx_doc_node_category` (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=159 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC-文檔元數據索引（正文在騰訊文檔側）';

DROP TABLE IF EXISTS `doc_node_tag`;
CREATE TABLE `doc_node_tag` (
  `node_id` bigint NOT NULL,
  `tag_id` bigint NOT NULL,
  PRIMARY KEY (`node_id`,`tag_id`),
  KEY `idx_doc_node_tag_tag` (`tag_id`,`node_id`),
  CONSTRAINT `fk_doc_node_tag_node` FOREIGN KEY (`node_id`) REFERENCES `doc_node` (`id`),
  CONSTRAINT `fk_doc_node_tag_tag` FOREIGN KEY (`tag_id`) REFERENCES `doc_tag` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC文档与标签关联';

DROP TABLE IF EXISTS `doc_note`;
CREATE TABLE `doc_note` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `node_id` bigint NOT NULL,
  `revision_id` bigint NOT NULL,
  `note_type` tinyint NOT NULL DEFAULT '1' COMMENT '1划线 2批注 3书签',
  `anchor_json` json DEFAULT NULL,
  `quote_text` varchar(1000) DEFAULT NULL,
  `content` varchar(4000) DEFAULT NULL,
  `visibility` tinyint NOT NULL DEFAULT '1' COMMENT '1仅本人 2空间可见',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_note_user` (`user_id`,`node_id`,`created_at`),
  KEY `fk_doc_note_node` (`node_id`),
  KEY `fk_doc_note_revision` (`revision_id`),
  CONSTRAINT `fk_doc_note_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_note_revision` FOREIGN KEY (`revision_id`) REFERENCES `doc_revision` (`id`),
  CONSTRAINT `fk_doc_note_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_note_type` CHECK ((`note_type` in (1,2,3))),
  CONSTRAINT `ck_doc_note_visibility` CHECK ((`visibility` in (1,2)))
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC阅读笔记';

DROP TABLE IF EXISTS `doc_reader_state`;
CREATE TABLE `doc_reader_state` (
  `user_id` bigint NOT NULL,
  `node_id` bigint NOT NULL,
  `revision_id` bigint DEFAULT NULL,
  `position_json` json DEFAULT NULL COMMENT 'PDF: page/scroll, Markdown: heading/anchor',
  `percent` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '0-100',
  `total_seconds` int NOT NULL DEFAULT '0',
  `last_read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`node_id`),
  KEY `idx_doc_reader_recent` (`user_id`,`last_read_at`),
  KEY `fk_doc_reader_node` (`node_id`),
  KEY `fk_doc_reader_revision` (`revision_id`),
  CONSTRAINT `fk_doc_reader_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `fk_doc_reader_revision` FOREIGN KEY (`revision_id`) REFERENCES `doc_revision` (`id`),
  CONSTRAINT `fk_doc_reader_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_reader_percent` CHECK ((`percent` between 0 and 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC阅读进度（按人×文档覆盖）';

DROP TABLE IF EXISTS `doc_revision`;
CREATE TABLE `doc_revision` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL,
  `revision_no` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `summary` varchar(1000) NOT NULL DEFAULT '',
  `markdown` longtext NOT NULL,
  `tags_json` json NOT NULL,
  `system_code` varchar(32) NOT NULL DEFAULT '',
  `menu_key` varchar(100) NOT NULL DEFAULT '',
  `original_filename` varchar(255) NOT NULL DEFAULT '',
  `content_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `change_reason` varchar(200) NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_revision_number` (`node_id`,`revision_no`),
  UNIQUE KEY `uk_doc_revision_owner` (`node_id`,`id`),
  KEY `fk_doc_revision_creator` (`created_by_user_id`),
  FULLTEXT KEY `ft_doc_revision_content` (`title`,`summary`,`markdown`) /*!50100 WITH PARSER `ngram` */ ,
  CONSTRAINT `fk_doc_revision_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_revision_node` FOREIGN KEY (`node_id`) REFERENCES `doc_native_document` (`node_id`),
  CONSTRAINT `ck_doc_revision_number` CHECK ((`revision_no` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=186 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC不可变原文修订';

DROP TABLE IF EXISTS `doc_revision_asset`;
CREATE TABLE `doc_revision_asset` (
  `revision_id` bigint NOT NULL,
  `asset_id` bigint NOT NULL,
  `role` tinyint NOT NULL DEFAULT '1' COMMENT '1原件 2预览 3封面 4附件',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`revision_id`,`asset_id`,`role`),
  KEY `idx_doc_revision_asset_asset` (`asset_id`),
  CONSTRAINT `fk_doc_revision_asset_asset` FOREIGN KEY (`asset_id`) REFERENCES `doc_asset` (`id`),
  CONSTRAINT `fk_doc_revision_asset_revision` FOREIGN KEY (`revision_id`) REFERENCES `doc_revision` (`id`),
  CONSTRAINT `ck_doc_revision_asset_role` CHECK ((`role` in (1,2,3,4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC修订与文件资产绑定';

DROP TABLE IF EXISTS `doc_search_index`;
CREATE TABLE `doc_search_index` (
  `node_id` bigint NOT NULL,
  `space_id` bigint NOT NULL,
  `category_id` bigint DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `summary` varchar(1000) NOT NULL DEFAULT '',
  `body_text` mediumtext NOT NULL COMMENT 'Markdown正文或提取文本；文件型未提取时为空',
  `tags` varchar(500) NOT NULL DEFAULT '',
  `owner_user_id` bigint DEFAULT NULL,
  `content_kind` tinyint NOT NULL DEFAULT '1' COMMENT '1Markdown 2PDF 3Office 4外链 5OpenAPI',
  `confidentiality` tinyint NOT NULL DEFAULT '2' COMMENT '1公开 2内部 3敏感 4机密',
  `status` tinyint NOT NULL DEFAULT '1',
  `effective_from` date DEFAULT NULL,
  `index_state` tinyint NOT NULL DEFAULT '1' COMMENT '1待索引 2就绪 3失败',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`node_id`),
  KEY `idx_doc_search_facet` (`space_id`,`category_id`,`content_kind`,`status`),
  KEY `idx_doc_search_owner` (`owner_user_id`),
  KEY `idx_doc_search_updated` (`updated_at`),
  FULLTEXT KEY `ft_doc_search` (`title`,`summary`,`body_text`,`tags`) /*!50100 WITH PARSER `ngram` */ ,
  CONSTRAINT `fk_doc_search_node` FOREIGN KEY (`node_id`) REFERENCES `doc_node` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_doc_search_conf` CHECK ((`confidentiality` between 1 and 4)),
  CONSTRAINT `ck_doc_search_kind` CHECK ((`content_kind` between 1 and 5)),
  CONSTRAINT `ck_doc_search_state` CHECK ((`index_state` in (1,2,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC统一检索索引（权限过滤后分页）';

DROP TABLE IF EXISTS `doc_space`;
CREATE TABLE `doc_space` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `name` varchar(64) NOT NULL COMMENT '空間名稱',
  `icon` varchar(16) DEFAULT NULL COMMENT '空間圖標（emoji）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序（小在前）',
  `description` varchar(255) DEFAULT NULL COMMENT '空間說明',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `space_kind` tinyint NOT NULL DEFAULT '1' COMMENT '1知识库 2制度库 3图书库 4接口库 5档案库',
  `code` varchar(32) DEFAULT NULL COMMENT '空间稳定编码，档案全宗用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_space_code` (`code`),
  KEY `idx_doc_space_sort` (`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=242 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC-文檔空間（知識域：需求/人事/行政/制度/培訓）';

DROP TABLE IF EXISTS `doc_space_access`;
CREATE TABLE `doc_space_access` (
  `space_id` bigint NOT NULL COMMENT '原生空间ID',
  `owner_user_id` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`space_id`),
  KEY `fk_doc_access_owner` (`owner_user_id`),
  CONSTRAINT `fk_doc_access_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_doc_access_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC原生空间配置';

DROP TABLE IF EXISTS `doc_space_member`;
CREATE TABLE `doc_space_member` (
  `space_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `permissions` int NOT NULL DEFAULT '1' COMMENT '位集:读取1 编辑2 确认4 管理8',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`space_id`,`user_id`),
  KEY `idx_doc_member_user` (`user_id`,`space_id`),
  CONSTRAINT `fk_doc_member_space` FOREIGN KEY (`space_id`) REFERENCES `doc_space_access` (`space_id`),
  CONSTRAINT `fk_doc_member_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_member_permissions` CHECK ((`permissions` in (1,3,5,7,15)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC空间成员';

DROP TABLE IF EXISTS `doc_system_plan`;
CREATE TABLE `doc_system_plan` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `plan_key` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'source_path 的 SHA-256，稳定身份',
  `file_name` varchar(255) NOT NULL,
  `title` varchar(300) NOT NULL,
  `system_name` varchar(100) NOT NULL,
  `system_code` varchar(32) DEFAULT NULL,
  `plan_type` varchar(32) NOT NULL,
  `generated_at` datetime NOT NULL,
  `source_path` varchar(500) NOT NULL,
  `content_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `content` mediumtext NOT NULL,
  `file_size` bigint NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_system_plan_key` (`plan_key`),
  KEY `idx_doc_system_plan_system` (`system_name`,`generated_at`),
  KEY `idx_doc_system_plan_type` (`plan_type`,`generated_at`),
  CONSTRAINT `ck_doc_system_plan_status` CHECK ((`status` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC系统方案文件归档';

DROP TABLE IF EXISTS `doc_tag`;
CREATE TABLE `doc_tag` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `space_id` bigint NOT NULL DEFAULT '0' COMMENT '0=全局标签，其余为空间标签',
  `name` varchar(64) NOT NULL COMMENT '标签名',
  `color` varchar(16) DEFAULT NULL COMMENT '展示色',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1启用 0停用',
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_tag_name` (`space_id`,`name`),
  KEY `idx_doc_tag_space` (`space_id`,`status`),
  CONSTRAINT `ck_doc_tag_status` CHECK ((`status` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC受控标签词表';

DROP TABLE IF EXISTS `doc_user_clearance`;
CREATE TABLE `doc_user_clearance` (
  `user_id` bigint NOT NULL,
  `max_level` tinyint NOT NULL DEFAULT '2' COMMENT '1公开 2内部 3敏感 4机密',
  `granted_by` bigint NOT NULL,
  `granted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_doc_clearance_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `ck_doc_clearance_level` CHECK ((`max_level` between 1 and 4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC用户密级授权；未登记默认内部';

DROP TABLE IF EXISTS `doc_view_log`;
CREATE TABLE `doc_view_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `node_id` bigint NOT NULL COMMENT '文檔ID',
  `user_id` bigint DEFAULT NULL COMMENT '查閱人用戶ID',
  `user_name` varchar(64) DEFAULT NULL COMMENT '查閱人姓名',
  `department` varchar(128) DEFAULT NULL COMMENT '部門（快照）',
  `viewed_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '查閱時間',
  `duration_sec` int DEFAULT NULL COMMENT '停留時長秒（頁面離開時上報，可空）',
  PRIMARY KEY (`id`),
  KEY `idx_doc_view_log_node` (`node_id`,`viewed_at`),
  KEY `idx_doc_view_log_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='DOC-查閱審計留痕（培訓完成度口徑）';

DROP TABLE IF EXISTS `emp_contract`;
CREATE TABLE `emp_contract` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '關聯 sys_user.id',
  `contract_no` varchar(64) NOT NULL COMMENT '合同編號',
  `contract_type` varchar(32) DEFAULT NULL COMMENT '合同類型',
  `company` varchar(128) DEFAULT NULL COMMENT '簽約主體名稱',
  `start_date` date DEFAULT NULL COMMENT '合同開始日期',
  `end_date` date DEFAULT NULL COMMENT '合同結束日期',
  `sign_date` date DEFAULT NULL COMMENT '簽訂日期',
  `status` varchar(16) DEFAULT NULL COMMENT '狀態: 生效中/已終止/已過期',
  `change_type` varchar(16) NOT NULL DEFAULT 'NEW' COMMENT '变更类型 NEW/RENEW/CHANGE',
  `previous_contract_id` bigint DEFAULT NULL COMMENT '上一份合同ID（续签/变更链）',
  `terminated_date` date DEFAULT NULL COMMENT '解除/终止日期',
  `terminate_reason` varchar(255) DEFAULT NULL COMMENT '解除原因',
  `evidence_url` varchar(500) DEFAULT NULL COMMENT '签署证据地址',
  `evidence_name` varchar(128) DEFAULT NULL COMMENT '证据文件名',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `created_by` varchar(64) DEFAULT NULL COMMENT '創建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  KEY `idx_contract_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='員工合同台賬';

DROP TABLE IF EXISTS `emp_emergency_contact`;
CREATE TABLE `emp_emergency_contact` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `name` varchar(50) NOT NULL COMMENT '联系人姓名',
  `phone` varchar(30) NOT NULL COMMENT '联系电话',
  `relation` varchar(30) NOT NULL COMMENT '关系',
  `created_by` varchar(50) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(50) DEFAULT NULL COMMENT '更新人',
  `deleted` int NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工紧急联系人';

DROP TABLE IF EXISTS `emp_position_record`;
CREATE TABLE `emp_position_record` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `effective_date` date NOT NULL COMMENT '生效日期',
  `effective_seq` int NOT NULL DEFAULT '0' COMMENT '生效序号',
  `operation` varchar(20) NOT NULL COMMENT '操作类型',
  `operation_code` varchar(24) DEFAULT NULL COMMENT '异动动作 code: ONBOARD/REGULAR/PROMOTION/TRANSFER/DEMISSION/DIMISSION/REHIRE/OTHER',
  `reason` varchar(200) DEFAULT NULL COMMENT '变动原因',
  `service_dept` varchar(100) DEFAULT NULL COMMENT '服务部门',
  `sequence_type` varchar(10) DEFAULT NULL COMMENT '职级序列',
  `position_level` varchar(10) DEFAULT NULL COMMENT '职级',
  `rank_code` varchar(10) DEFAULT NULL COMMENT '职等',
  `company` varchar(100) DEFAULT NULL COMMENT '任职公司',
  `employee_category` varchar(30) DEFAULT NULL COMMENT '员工类别',
  `work_system` varchar(20) DEFAULT NULL COMMENT '工时制',
  `position_name` varchar(100) DEFAULT NULL COMMENT '职位',
  `direct_superior` varchar(50) DEFAULT NULL COMMENT '直属上级',
  `mentor` varchar(50) DEFAULT NULL COMMENT '导师',
  `work_country` varchar(50) DEFAULT NULL COMMENT '工作国家',
  `work_city` varchar(50) DEFAULT NULL COMMENT '工作城市',
  `office_address` varchar(200) DEFAULT NULL COMMENT '办公地址',
  `contract_location` varchar(100) DEFAULT NULL COMMENT '合同签订地',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `employment_period_id` bigint DEFAULT NULL COMMENT '所属雇佣期间ID(hr_employment_period.id)',
  `dept_id` bigint DEFAULT NULL COMMENT '服务部门ID(sys_department.id)，名称快照留在 service_dept',
  `position_id` bigint DEFAULT NULL COMMENT '职位ID(sys_position.id)，名称快照留在 position_name',
  `employer_company_id` bigint DEFAULT NULL COMMENT '雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY)',
  `work_location_id` bigint DEFAULT NULL COMMENT '工作地点字典ID(sys_hr_dict WORK_LOCATION)',
  `manager_user_id` bigint DEFAULT NULL COMMENT '直属上级员工ID(sys_user.id)',
  `mentor_user_id` bigint DEFAULT NULL COMMENT '导师员工ID(sys_user.id)',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_user_seq` (`user_id`,`effective_seq`),
  CONSTRAINT `ck_position_op_code` CHECK (((`operation_code` is null) or (`operation_code` in (_utf8mb4'REGULAR',_utf8mb4'OTHER',_utf8mb4'PROMOTION',_utf8mb4'ONBOARD',_utf8mb4'DEMOTION',_utf8mb4'DIMISSION',_utf8mb4'REHIRE',_utf8mb4'TRANSFER'))))
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工职务记录';

DROP TABLE IF EXISTS `emp_salary_config`;
CREATE TABLE `emp_salary_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `salary_structure` varchar(30) DEFAULT NULL COMMENT '薪资结构',
  `payment_method` varchar(20) DEFAULT NULL COMMENT '发薪方式',
  `pay_day` int DEFAULT NULL COMMENT '发薪日(1~31)',
  `bank_name` varchar(100) DEFAULT NULL COMMENT '开户银行',
  `bank_account` varchar(50) DEFAULT NULL COMMENT '银行账号',
  `tax_city` varchar(50) DEFAULT NULL COMMENT '纳税城市',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工费用信息-薪资配置';

DROP TABLE IF EXISTS `emp_salary_deduction`;
CREATE TABLE `emp_salary_deduction` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `name` varchar(50) NOT NULL COMMENT '项目名称',
  `rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '费率(百分比)',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '金额(元)',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工费用信息-扣除项';

DROP TABLE IF EXISTS `emp_salary_income`;
CREATE TABLE `emp_salary_income` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `name` varchar(50) NOT NULL COMMENT '项目名称',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '金额(元)',
  `type` varchar(10) NOT NULL DEFAULT 'fixed' COMMENT '类型(fixed=固定,variable=浮动)',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工费用信息-收入项';

DROP TABLE IF EXISTS `hcm_pii_access_log`;
CREATE TABLE `hcm_pii_access_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `actor` varchar(64) NOT NULL COMMENT '查看人账号（工号口径）',
  `person_id` bigint NOT NULL COMMENT '被查看的人员ID',
  `fields` varchar(128) NOT NULL COMMENT '字段组 mobile,email,birthDate',
  `scene` varchar(32) NOT NULL DEFAULT 'detail' COMMENT 'detail/list/export',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '查看时间',
  PRIMARY KEY (`id`),
  KEY `idx_pii_person_time` (`person_id`,`created_at`),
  KEY `idx_pii_actor_time` (`actor`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='敏感字段明文查看留痕';

DROP TABLE IF EXISTS `hr_assignment`;
CREATE TABLE `hr_assignment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `employment_id` bigint NOT NULL COMMENT '雇佣关系ID',
  `unit_id` bigint NOT NULL COMMENT '任职组织ID',
  `position_id` bigint DEFAULT NULL COMMENT '岗位ID（空=未定岗）',
  `manager_person_id` bigint DEFAULT NULL COMMENT '直属经理（person.id）',
  `work_location` varchar(128) DEFAULT NULL COMMENT '工作地点',
  `fte` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT 'FTE 0.01~1.00',
  `primary_flag` tinyint NOT NULL DEFAULT '1' COMMENT '1=主任职 0=兼任',
  `effective_from` date NOT NULL COMMENT '生效起（含）',
  `effective_to` date DEFAULT NULL COMMENT '生效止（含，空=持续）',
  `seq_no` int NOT NULL DEFAULT '1' COMMENT '同日序号',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `primary_effective` bigint GENERATED ALWAYS AS ((case when ((`primary_flag` = 1) and (`effective_to` is null) and (`deleted` = 0)) then `employment_id` else NULL end)) STORED COMMENT '主任职唯一约束载体',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hr_assignment_version` (`employment_id`,`effective_from`,`seq_no`),
  UNIQUE KEY `uk_hr_assignment_primary` (`primary_effective`),
  KEY `idx_hr_assignment_unit` (`unit_id`),
  KEY `idx_hr_assignment_period` (`employment_id`,`effective_from`,`effective_to`),
  KEY `fk_hr_assignment_position` (`position_id`),
  CONSTRAINT `fk_hr_assignment_employment` FOREIGN KEY (`employment_id`) REFERENCES `hr_employment` (`id`),
  CONSTRAINT `fk_hr_assignment_position` FOREIGN KEY (`position_id`) REFERENCES `org_position` (`id`),
  CONSTRAINT `fk_hr_assignment_unit` FOREIGN KEY (`unit_id`) REFERENCES `org_unit` (`id`),
  CONSTRAINT `ck_hr_assignment_fte` CHECK (((`fte` > 0) and (`fte` <= 1))),
  CONSTRAINT `ck_hr_assignment_period` CHECK (((`effective_to` is null) or (`effective_to` >= `effective_from`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='任职（日期生效）';

DROP TABLE IF EXISTS `hr_certificate_request`;
CREATE TABLE `hr_certificate_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '证明申请单编号(ZM+YYYYMMDD+4位序号)',
  `user_id` bigint NOT NULL COMMENT '申请人 sys_user.id',
  `emp_name` varchar(64) NOT NULL COMMENT '申请人姓名快照',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '申请人工号快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `cert_type` varchar(32) NOT NULL COMMENT '证明类型(HR字典 CERT_TYPE code)',
  `purpose` varchar(200) NOT NULL COMMENT '证明用途',
  `recipient` varchar(200) DEFAULT NULL COMMENT '证明抬头(致XX单位)',
  `language` varchar(8) NOT NULL DEFAULT 'ZH' COMMENT '语种: ZH/EN/BOTH',
  `copies` int NOT NULL DEFAULT '1' COMMENT '需要份数',
  `expect_date` date DEFAULT NULL COMMENT '期望取得日期',
  `remark` varchar(500) DEFAULT NULL COMMENT '补充说明(申请人填写)',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '关联OA流程编号',
  `result_remark` varchar(500) DEFAULT NULL COMMENT '办理结果(审批通过后写入领取指引)',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `cert_no` varchar(64) DEFAULT NULL COMMENT '证明编号(人事开具时登记)',
  `issue_date` date DEFAULT NULL COMMENT '开具日期',
  `pickup_type` varchar(16) DEFAULT NULL COMMENT '领取方式: SELF/DELIVERY/ELECTRONIC',
  `issued_by` varchar(64) DEFAULT NULL COMMENT '开具办理人',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_certificate_req_no` (`req_no`),
  KEY `idx_certificate_user` (`user_id`,`status`),
  KEY `idx_certificate_flow` (`flow_no`),
  KEY `idx_certificate_cert_no` (`cert_no`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR证明开具申请单';

DROP TABLE IF EXISTS `hr_effective_task`;
CREATE TABLE `hr_effective_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `request_id` bigint NOT NULL COMMENT '关联 hr_lifecycle_request.id',
  `req_no` varchar(32) DEFAULT NULL COMMENT '单据编号快照',
  `request_type` varchar(16) DEFAULT NULL COMMENT '单据类型快照',
  `user_id` bigint DEFAULT NULL COMMENT '目标员工；入职单办理前可为空',
  `effective_date` date NOT NULL COMMENT '生效日，到这天才算到期',
  `status` varchar(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/DONE/FAILED/CANCELLED',
  `attempts` int NOT NULL DEFAULT '0' COMMENT '已尝试次数',
  `last_error` varchar(500) DEFAULT NULL COMMENT '最近一次失败原因',
  `executed_at` datetime DEFAULT NULL COMMENT '实际执行完成时间',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_effective_request` (`request_id`),
  KEY `idx_effective_status_date` (`status`,`effective_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR 待生效任务（轻量 outbox）';

DROP TABLE IF EXISTS `hr_employment`;
CREATE TABLE `hr_employment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `person_id` bigint NOT NULL COMMENT '人员ID',
  `legal_entity_id` bigint NOT NULL COMMENT '雇主法人ID',
  `employment_no` varchar(32) DEFAULT NULL COMMENT '雇佣编号（稳定业务键）',
  `employment_type` varchar(32) NOT NULL DEFAULT 'FULL_TIME' COMMENT '雇佣类型',
  `jurisdiction` varchar(8) NOT NULL DEFAULT 'CN' COMMENT '法域 CN/HK/MO',
  `start_date` date NOT NULL COMMENT '雇佣开始日期',
  `end_date` date DEFAULT NULL COMMENT '雇佣结束日期（空=无固定期限）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=有效 0=已终止',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hr_employment_no` (`employment_no`),
  KEY `idx_hr_employment_person` (`person_id`,`start_date`),
  KEY `idx_hr_employment_legal` (`legal_entity_id`),
  CONSTRAINT `fk_hr_employment_legal` FOREIGN KEY (`legal_entity_id`) REFERENCES `org_legal_entity` (`id`),
  CONSTRAINT `fk_hr_employment_person` FOREIGN KEY (`person_id`) REFERENCES `person` (`id`),
  CONSTRAINT `ck_hr_employment_period` CHECK (((`end_date` is null) or (`end_date` >= `start_date`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='雇佣关系';

DROP TABLE IF EXISTS `hr_employment_period`;
CREATE TABLE `hr_employment_period` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '员工身份锚点(sys_user.id)，允许一人为多段雇佣',
  `period_seq` int NOT NULL COMMENT '第几次雇佣，从1递增；重新入职开新段',
  `employer_company` varchar(128) DEFAULT NULL COMMENT '雇主法人名称快照',
  `employer_company_id` bigint DEFAULT NULL COMMENT '雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY)',
  `work_location` varchar(128) DEFAULT NULL COMMENT '工作地点名称快照',
  `work_location_id` bigint DEFAULT NULL COMMENT '工作地点字典ID(sys_hr_dict WORK_LOCATION)',
  `employee_category` varchar(64) DEFAULT NULL COMMENT '人员类别(正式/实习/派遣/外包)',
  `start_date` date DEFAULT NULL COMMENT '真实入职日；来源必须看 start_date_source',
  `start_date_source` varchar(24) NOT NULL DEFAULT 'POSITION_RECORD' COMMENT '入职日来源: POSITION_RECORD任职事实 / MANUAL人工确认 / UNVERIFIED未核实',
  `probation_end_date` date DEFAULT NULL COMMENT '试用期结束日',
  `regular_date` date DEFAULT NULL COMMENT '转正日期',
  `end_date` date DEFAULT NULL COMMENT '雇佣结束日(离职生效日)',
  `end_reason` varchar(255) DEFAULT NULL COMMENT '雇佣结束原因快照',
  `status` varchar(16) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE在职段 / ENDED已结束段',
  `source_req_no` varchar(32) DEFAULT NULL COMMENT '产生本段的单据号',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `active_scope` varchar(40) GENERATED ALWAYS AS ((case when (`deleted` = 0) then concat(`user_id`,_utf8mb4'-',`period_seq`) else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_period_active_scope` (`active_scope`),
  KEY `idx_period_user_status` (`user_id`,`status`),
  CONSTRAINT `ck_period_active_no_end` CHECK (((`status` <> _utf8mb4'ACTIVE') or (`end_date` is null))),
  CONSTRAINT `ck_period_start_source` CHECK ((`start_date_source` in (_utf8mb4'POSITION_RECORD',_utf8mb4'MANUAL',_utf8mb4'UNVERIFIED'))),
  CONSTRAINT `ck_period_status` CHECK ((`status` in (_utf8mb4'ACTIVE',_utf8mb4'ENDED')))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='雇佣期间(一人多段，重入职新开段)';

DROP TABLE IF EXISTS `hr_leave_balance`;
CREATE TABLE `hr_leave_balance` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '关联 sys_user.id',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '员工工号快照',
  `year` int NOT NULL COMMENT '额度过期年度(自然年)',
  `leave_type` varchar(32) NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE 的 code)',
  `total_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '年度授予天数',
  `carried_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '上年结转天数',
  `used_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '已使用天数(审批通过的请假累计)',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_leave_balance_user_year_type` (`user_id`,`year`,`leave_type`),
  KEY `idx_leave_balance_year_type` (`year`,`leave_type`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR假期额度台账';

DROP TABLE IF EXISTS `hr_leave_request`;
CREATE TABLE `hr_leave_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '请假单编号(LQ+YYYYMMDD+4位序号)',
  `user_id` bigint NOT NULL COMMENT '请假人 sys_user.id',
  `emp_name` varchar(64) NOT NULL COMMENT '请假人姓名快照',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '请假人工号快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `year` int NOT NULL COMMENT '所属年度(按开始日期)',
  `leave_type` varchar(32) NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE code)',
  `start_date` date NOT NULL COMMENT '请假开始日期',
  `end_date` date NOT NULL COMMENT '请假结束日期',
  `days` decimal(4,1) NOT NULL COMMENT '请假天数(自然日,含首尾)',
  `reason` varchar(512) DEFAULT NULL COMMENT '请假事由',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '关联OA流程编号',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注/办理结果',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_leave_request_req_no` (`req_no`),
  KEY `idx_leave_request_user` (`user_id`,`year`),
  KEY `idx_leave_request_status` (`status`,`leave_type`),
  KEY `idx_leave_request_flow` (`flow_no`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR请假申请单据';

DROP TABLE IF EXISTS `hr_lifecycle_request`;
CREATE TABLE `hr_lifecycle_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '单据编号(RS+YYYYMMDD+4位序号)',
  `type` varchar(16) NOT NULL COMMENT '单据类型: onboard/regular/transfer/dimission',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '单据状态: draft/pending/approved/rejected/completed',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '关联OA流程编号',
  `user_id` bigint DEFAULT NULL COMMENT '关联 sys_user.id(入职完成后回填)',
  `emp_name` varchar(64) NOT NULL COMMENT '姓名/候选人姓名',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '员工工号(入职完成后回填)',
  `dept_id` bigint DEFAULT NULL COMMENT '目标部门ID',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `position_id` bigint DEFAULT NULL COMMENT '职位ID',
  `position_name` varchar(128) DEFAULT NULL COMMENT '职位名称快照',
  `effective_date` date DEFAULT NULL COMMENT '生效日期',
  `reason` varchar(512) DEFAULT NULL COMMENT '申请事由',
  `offer_date` date DEFAULT NULL COMMENT 'Offer发放日期',
  `probation_months` int DEFAULT NULL COMMENT '试用期月数',
  `expected_regular_date` date DEFAULT NULL COMMENT '预计转正日期',
  `id_card_no` varchar(64) DEFAULT NULL COMMENT '证件号码',
  `mobile` varchar(32) DEFAULT NULL COMMENT '手机号',
  `email` varchar(128) DEFAULT NULL COMMENT '邮箱',
  `candidate_info` json DEFAULT NULL COMMENT '入职资料JSON',
  `old_dept_name` varchar(128) DEFAULT NULL COMMENT '调动前部门快照',
  `old_position_name` varchar(128) DEFAULT NULL COMMENT '调动前职位快照',
  `new_dept_id` bigint DEFAULT NULL COMMENT '调入部门ID',
  `new_dept_name` varchar(128) DEFAULT NULL COMMENT '调入部门名称快照',
  `new_position_id` bigint DEFAULT NULL COMMENT '调入职位ID',
  `new_position_name` varchar(128) DEFAULT NULL COMMENT '调入职位名称快照',
  `new_company` varchar(128) DEFAULT NULL COMMENT '调动后任职公司',
  `new_superior` varchar(64) DEFAULT NULL COMMENT '调动后直属上级',
  `dimission_type` varchar(32) DEFAULT NULL COMMENT '离职类型: voluntary/involuntary/expired',
  `last_work_date` date DEFAULT NULL COMMENT '最后工作日',
  `settlement_info` json DEFAULT NULL COMMENT '离职结算JSON',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注/办理结果说明',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `contract_id` bigint DEFAULT NULL COMMENT '被续签的原合同ID(emp_contract.id)',
  `contract_no` varchar(64) DEFAULT NULL COMMENT '原合同编号快照',
  `new_contract_no` varchar(64) DEFAULT NULL COMMENT '新合同编号',
  `new_contract_type` varchar(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)',
  `new_contract_company` varchar(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)',
  `new_contract_start_date` date DEFAULT NULL COMMENT '新合同开始日期',
  `new_contract_end_date` date DEFAULT NULL COMMENT '新合同结束日期',
  `handover_to_user_id` bigint DEFAULT NULL COMMENT '交接接收人ID(sys_user.id)',
  `handover_to_name` varchar(128) DEFAULT NULL COMMENT '交接接收人姓名快照',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hlr_req_no` (`req_no`),
  KEY `idx_hlr_type_status` (`type`,`status`),
  KEY `idx_hlr_user` (`user_id`),
  KEY `idx_hlr_flow_no` (`flow_no`),
  KEY `idx_hlr_emp_no` (`emp_no`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR入转调离生命周期单据';

DROP TABLE IF EXISTS `hr_offboarding_task`;
CREATE TABLE `hr_offboarding_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `request_id` bigint NOT NULL COMMENT '关联离职单据 hr_lifecycle_request.id',
  `req_no` varchar(32) DEFAULT NULL COMMENT '单据编号快照',
  `user_id` bigint DEFAULT NULL COMMENT '离职员工ID(sys_user.id)',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '离职工号快照',
  `task_type` varchar(32) NOT NULL COMMENT '任务类型: EAM_ASSET_HANDOVER / OA_TODO_TRANSFER',
  `status` varchar(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/RUNNING/DONE/SKIPPED/FAILED',
  `attempts` int NOT NULL DEFAULT '0' COMMENT '已尝试次数',
  `last_error` varchar(500) DEFAULT NULL COMMENT '最近一次失败原因',
  `result_summary` varchar(500) DEFAULT NULL COMMENT '执行结果摘要',
  `target_ref` varchar(64) DEFAULT NULL COMMENT '跨模块产物引用(EAM 交接单号 / OA 任务id)',
  `effective_date` date DEFAULT NULL COMMENT '计划执行日(离职生效日)',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_offboarding_request_type` (`request_id`,`task_type`),
  KEY `idx_offboarding_status_date` (`status`,`effective_date`),
  KEY `idx_offboarding_user` (`user_id`),
  CONSTRAINT `ck_offboarding_status` CHECK ((`status` in (_utf8mb4'FAILED',_utf8mb4'SKIPPED',_utf8mb4'RUNNING',_utf8mb4'PENDING',_utf8mb4'DONE'))),
  CONSTRAINT `ck_offboarding_type` CHECK ((`task_type` in (_utf8mb4'EAM_ASSET_HANDOVER',_utf8mb4'OA_TODO_TRANSFER')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='离职联动任务（轻量 outbox）';

DROP TABLE IF EXISTS `hr_operation_audit`;
CREATE TABLE `hr_operation_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '被操作员工ID(sys_user.id)',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '员工工号快照',
  `action` varchar(32) NOT NULL COMMENT '动作: EMPLOYEE_UPDATE/SENSITIVE_VIEW/POSITION_WRITE 等',
  `field_name` varchar(64) DEFAULT NULL COMMENT '变更字段名，动作级留痕为 NULL',
  `before_value` varchar(500) DEFAULT NULL COMMENT '变更前值（敏感字段写入时已脱敏）',
  `after_value` varchar(500) DEFAULT NULL COMMENT '变更后值（敏感字段写入时已脱敏）',
  `detail` varchar(500) DEFAULT NULL COMMENT '动作补充说明',
  `reason` varchar(255) DEFAULT NULL COMMENT '原因',
  `source_req_no` varchar(32) DEFAULT NULL COMMENT '来源人事单据号',
  `effective_date` date DEFAULT NULL COMMENT '业务生效日（与发生时间分开）',
  `sensitive` tinyint NOT NULL DEFAULT '0' COMMENT '是否涉及敏感面: 1是 0否',
  `operator` varchar(64) DEFAULT NULL COMMENT '操作人快照',
  `occurred_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_hr_audit_user` (`user_id`,`occurred_at`),
  KEY `idx_hr_audit_action` (`action`,`occurred_at`),
  KEY `idx_hr_audit_operator` (`operator`,`occurred_at`),
  CONSTRAINT `ck_hr_audit_action` CHECK ((`action` in (_utf8mb4'ACCOUNT_DISABLE',_utf8mb4'PERIOD_REGISTER',_utf8mb4'SENSITIVE_VIEW',_utf8mb4'PROFILE_UPDATE',_utf8mb4'CONTRACT_WRITE',_utf8mb4'EMPLOYEE_DELETE',_utf8mb4'EMPLOYEE_CREATE',_utf8mb4'ROLE_BIND',_utf8mb4'ROSTER_EXPORT',_utf8mb4'ACCOUNT_ENABLE',_utf8mb4'PASSWORD_RESET',_utf8mb4'POSITION_WRITE',_utf8mb4'SALARY_WRITE',_utf8mb4'LIFECYCLE_EXECUTE',_utf8mb4'EMPLOYEE_UPDATE')))
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人事操作审计（只增不改，无软删列）';

DROP TABLE IF EXISTS `hr_perf_appeal`;
CREATE TABLE `hr_perf_appeal` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '申诉单号(PA+YYYYMMDD+4位)',
  `assessment_id` bigint NOT NULL COMMENT '被申诉的考核单',
  `plan_id` bigint DEFAULT NULL COMMENT '所属计划',
  `user_id` bigint NOT NULL COMMENT '申诉人(即被考核人)',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照',
  `emp_name` varchar(64) DEFAULT NULL COMMENT '姓名快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门快照',
  `plan_name` varchar(128) DEFAULT NULL COMMENT '计划名称快照',
  `reason` varchar(500) NOT NULL COMMENT '申诉理由',
  `expectation` varchar(500) DEFAULT NULL COMMENT '期望处理',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/processing/resolved/rejected',
  `handler_user_id` bigint DEFAULT NULL COMMENT '受理人ID',
  `handler_name` varchar(64) DEFAULT NULL COMMENT '受理人姓名快照',
  `handled_at` datetime DEFAULT NULL COMMENT '办结时间',
  `conclusion` varchar(500) DEFAULT NULL COMMENT '处理结论(办结/驳回必填)',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perf_appeal_req` (`req_no`),
  KEY `idx_perf_appeal_status` (`status`),
  KEY `idx_perf_appeal_user` (`user_id`),
  KEY `idx_perf_appeal_assessment` (`assessment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR绩效申诉登记';

DROP TABLE IF EXISTS `hr_perf_assessment`;
CREATE TABLE `hr_perf_assessment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '考核单编号(PH+YYYYMMDD+4位)',
  `plan_id` bigint NOT NULL COMMENT '所属计划',
  `user_id` bigint NOT NULL COMMENT '被考核人 sys_user.id',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL COMMENT '姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门 ID 快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `sequence_type` varchar(32) DEFAULT NULL COMMENT '序列快照',
  `position_name` varchar(64) DEFAULT NULL COMMENT '职位快照',
  `position_level` varchar(32) DEFAULT NULL COMMENT '职级快照',
  `evaluator_user_id` bigint DEFAULT NULL COMMENT '评估人 sys_user.id(权威)',
  `evaluator_name` varchar(64) DEFAULT NULL COMMENT '评估人姓名快照',
  `status` varchar(24) NOT NULL DEFAULT 'self_pending' COMMENT '状态见 HrPerfConstants',
  `self_score` decimal(6,2) DEFAULT NULL COMMENT '自评加权分',
  `self_comment` varchar(1000) DEFAULT NULL COMMENT '自评评语',
  `self_at` datetime DEFAULT NULL COMMENT '自评提交时间',
  `supervisor_score` decimal(6,2) DEFAULT NULL COMMENT '上级加权分',
  `supervisor_comment` varchar(1000) DEFAULT NULL COMMENT '上级评语',
  `supervisor_at` datetime DEFAULT NULL COMMENT '上级提交时间',
  `calibrated_score` decimal(6,2) DEFAULT NULL COMMENT '校准后得分',
  `calibrated_grade` varchar(16) DEFAULT NULL COMMENT '校准后等级',
  `calibrated_by` varchar(64) DEFAULT NULL COMMENT '校准备案人',
  `calibrated_reason` varchar(500) DEFAULT NULL COMMENT '改判理由',
  `final_score` decimal(6,2) DEFAULT NULL COMMENT '最终得分',
  `final_grade` varchar(16) DEFAULT NULL COMMENT '最终等级',
  `confirmed_at` datetime DEFAULT NULL COMMENT '结果确认时间',
  `applied_note` varchar(500) DEFAULT NULL COMMENT '结果应用说明',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perf_assess_req` (`req_no`),
  UNIQUE KEY `uk_perf_assess_plan_user` (`plan_id`,`user_id`),
  KEY `idx_perf_assess_user` (`user_id`,`status`),
  KEY `idx_perf_assess_eval` (`evaluator_user_id`,`status`),
  KEY `idx_perf_assess_plan` (`plan_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR员工考核单';

DROP TABLE IF EXISTS `hr_perf_calibration_log`;
CREATE TABLE `hr_perf_calibration_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `assessment_id` bigint DEFAULT NULL COMMENT '被改判的考核单(例外放行为计划级动作, 为空)',
  `plan_id` bigint DEFAULT NULL COMMENT '所属计划(冗余便于按计划筛)',
  `user_id` bigint DEFAULT NULL COMMENT '被考核人(例外放行为空)',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照',
  `emp_name` varchar(64) DEFAULT NULL COMMENT '姓名快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门快照',
  `action` varchar(24) NOT NULL COMMENT '动作: CALIBRATE/APPEAL_REVISE/DIST_WAIVER',
  `before_score` decimal(6,2) DEFAULT NULL COMMENT '改判前得分',
  `before_grade` varchar(16) DEFAULT NULL COMMENT '改判前等级',
  `after_score` decimal(6,2) DEFAULT NULL COMMENT '改判后得分',
  `after_grade` varchar(16) DEFAULT NULL COMMENT '改判后等级',
  `reason` varchar(500) DEFAULT NULL COMMENT '理由(改判与例外放行必填)',
  `ref_appeal_id` bigint DEFAULT NULL COMMENT '关联申诉单(APPEAL_REVISE 回填)',
  `operator_user_id` bigint DEFAULT NULL COMMENT '操作人ID(姓名可重名, 追责靠ID)',
  `operator_name` varchar(64) DEFAULT NULL COMMENT '操作人姓名快照',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_perf_log_assessment` (`assessment_id`),
  KEY `idx_perf_log_plan` (`plan_id`),
  KEY `idx_perf_log_action` (`action`),
  KEY `idx_perf_log_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR绩效改判留痕';

DROP TABLE IF EXISTS `hr_perf_cycle`;
CREATE TABLE `hr_perf_cycle` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '周期编号(PC+YYYYMMDD+4位)',
  `code` varchar(32) NOT NULL COMMENT '周期编码，如 2026Q3',
  `name` varchar(64) NOT NULL COMMENT '周期名称',
  `cycle_type` varchar(16) NOT NULL COMMENT '周期类型: QUARTER/YEAR',
  `period_start` date NOT NULL COMMENT '考核期开始',
  `period_end` date NOT NULL COMMENT '考核期结束',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/published/closed',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perf_cycle_code` (`code`),
  UNIQUE KEY `uk_perf_cycle_req` (`req_no`),
  KEY `idx_perf_cycle_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR考核周期';

DROP TABLE IF EXISTS `hr_perf_indicator`;
CREATE TABLE `hr_perf_indicator` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `template_id` bigint NOT NULL COMMENT '所属模板',
  `name` varchar(128) NOT NULL COMMENT '指标名称',
  `indicator_type` varchar(32) DEFAULT NULL COMMENT '指标类型(字典 PERF_INDICATOR_TYPE)',
  `weight` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '权重',
  `target_desc` varchar(500) DEFAULT NULL COMMENT '目标值/衡量标准',
  `scoring_desc` varchar(500) DEFAULT NULL COMMENT '评分口径',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_perf_ind_template` (`template_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR考核指标';

DROP TABLE IF EXISTS `hr_perf_plan`;
CREATE TABLE `hr_perf_plan` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) NOT NULL COMMENT '计划编号(PP+YYYYMMDD+4位)',
  `cycle_id` bigint NOT NULL COMMENT '所属周期',
  `template_id` bigint NOT NULL COMMENT '使用模板',
  `name` varchar(64) NOT NULL COMMENT '计划名称',
  `scope_json` text COMMENT '范围条件 JSON: 部门/职级/在职状态',
  `self_start` date NOT NULL COMMENT '自评开始',
  `self_end` date NOT NULL COMMENT '自评截止',
  `sup_start` date NOT NULL COMMENT '上级评开始',
  `sup_end` date NOT NULL COMMENT '上级评截止',
  `calib_end` date NOT NULL COMMENT '校准截止',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/running/confirm_pending/confirmed',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '整批确认关联的 OA 流程编号',
  `summary` varchar(500) DEFAULT NULL COMMENT '计划说明',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perf_plan_req` (`req_no`),
  KEY `idx_perf_plan_cycle` (`cycle_id`,`status`),
  KEY `idx_perf_plan_flow` (`flow_no`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR考核计划';

DROP TABLE IF EXISTS `hr_perf_score_item`;
CREATE TABLE `hr_perf_score_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `assessment_id` bigint NOT NULL COMMENT '所属考核单',
  `indicator_id` bigint DEFAULT NULL COMMENT '来源指标',
  `indicator_name` varchar(128) NOT NULL COMMENT '指标名称快照',
  `weight` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT '权重快照',
  `suggested_score` decimal(12,2) DEFAULT NULL COMMENT '系統建議分（RDM 貢獻分推送寫入，HR 校準前僅參考）',
  `suggested_source` varchar(32) DEFAULT NULL COMMENT '建議值來源: RDM/MANUAL',
  `suggested_at` datetime DEFAULT NULL COMMENT '建議值寫入時間',
  `target_value` varchar(500) DEFAULT NULL COMMENT '完成情况/实际值',
  `self_score` decimal(6,2) DEFAULT NULL COMMENT '自评分',
  `supervisor_score` decimal(6,2) DEFAULT NULL COMMENT '上级评分',
  `final_score` decimal(6,2) DEFAULT NULL COMMENT '最终评分',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_perf_item_assess` (`assessment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR指标打分明细';

DROP TABLE IF EXISTS `hr_perf_template`;
CREATE TABLE `hr_perf_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(64) NOT NULL COMMENT '模板名称',
  `apply_cycle_type` varchar(16) DEFAULT NULL COMMENT '适用周期类型，空为通用',
  `grade_scheme` text COMMENT '等级方案 JSON: [{code,minScore,ratio}]',
  `weight_sum` int NOT NULL DEFAULT '100' COMMENT '指标权重合计',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态: 1 启用 0 停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR考核模板';

DROP TABLE IF EXISTS `hr_profile_item`;
CREATE TABLE `hr_profile_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `person_id` bigint NOT NULL COMMENT '人员ID',
  `item_type` varchar(32) NOT NULL COMMENT 'EDUCATION/WORK/QUALIFICATION/REWARD/PUNISH',
  `title` varchar(128) NOT NULL COMMENT '标题：学校/公司/证书/奖惩事项',
  `org_name` varchar(128) DEFAULT NULL COMMENT '机构：学校/公司/发证机构',
  `role_title` varchar(128) DEFAULT NULL COMMENT '专业/职位/等级',
  `cert_no` varchar(64) DEFAULT NULL COMMENT '证书编号',
  `start_date` date DEFAULT NULL COMMENT '开始日期',
  `end_date` date DEFAULT NULL COMMENT '结束日期（空=至今/长期）',
  `evidence_url` varchar(500) DEFAULT NULL COMMENT '证据地址',
  `evidence_name` varchar(128) DEFAULT NULL COMMENT '证据文件名',
  `verify_status` tinyint NOT NULL DEFAULT '0' COMMENT '0=待核实 1=已核实',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_hr_profile_person` (`person_id`,`item_type`),
  CONSTRAINT `fk_hr_profile_person` FOREIGN KEY (`person_id`) REFERENCES `person` (`id`),
  CONSTRAINT `ck_hr_profile_period` CHECK (((`end_date` is null) or (`start_date` is null) or (`end_date` >= `start_date`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人员档案扩展项';

DROP TABLE IF EXISTS `mcp_tool`;
CREATE TABLE `mcp_tool` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tool_key` varchar(64) NOT NULL COMMENT '工具唯一標識（MCP tool name，下發模型的 function name）',
  `name` varchar(100) NOT NULL COMMENT '工具名稱',
  `category` varchar(32) NOT NULL DEFAULT 'finance' COMMENT '分類: finance=財務 promotion=推廣 merchant=商戶 ai=智能中心',
  `description` varchar(500) NOT NULL COMMENT '能力描述（作為 tool description 下發給模型）',
  `icon` varchar(64) DEFAULT NULL COMMENT '圖標名稱（MenuIcon 註冊表）',
  `version` varchar(16) NOT NULL DEFAULT '1.0.0' COMMENT '工具版本',
  `risk_level` varchar(4) NOT NULL DEFAULT 'L1' COMMENT '風險等級 L0~L4（與 AI 操作授權分級一致）',
  `params_json` text COMMENT '參數 JSON Schema（作為 parameters 下發給模型）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否啟用: 1=啟用 0=停用',
  `installed` tinyint NOT NULL DEFAULT '0' COMMENT '是否已安裝: 1=已安裝（AI 助手即刻具備該能力）',
  `installed_by` varchar(64) DEFAULT NULL COMMENT '安裝人',
  `installed_at` datetime DEFAULT NULL COMMENT '安裝時間',
  `sort` int NOT NULL DEFAULT '0' COMMENT '廣場排序',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `source` varchar(16) NOT NULL DEFAULT 'builtin' COMMENT '工具來源: builtin=內置工具 external=外部服務(MCP Server)',
  `transport` varchar(32) DEFAULT NULL COMMENT '外部服務接入方式: remote-http / remote-sse / local-stdio（builtin 為 NULL）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tool_key` (`tool_key`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='MCP 工具註冊表（AI 助手工具廣場）';

DROP TABLE IF EXISTS `org_job_family`;
CREATE TABLE `org_job_family` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '職務族編碼（穩定業務鍵）',
  `name` varchar(128) NOT NULL COMMENT '職務族名稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_job_family_code` (`code`),
  KEY `idx_org_job_family_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='組織編制-職務族';

DROP TABLE IF EXISTS `org_job_grade`;
CREATE TABLE `org_job_grade` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '職位編碼（穩定業務鍵）',
  `name` varchar(128) NOT NULL COMMENT '職位名稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `job_family_id` bigint NOT NULL COMMENT '所屬職務族ID',
  `grade_level` int NOT NULL DEFAULT '1' COMMENT '職級序號（同族內越大越高）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_job_grade_code` (`code`),
  KEY `idx_org_job_grade_family` (`job_family_id`,`grade_level`),
  CONSTRAINT `fk_org_job_grade_family` FOREIGN KEY (`job_family_id`) REFERENCES `org_job_family` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='組織編制-職位職級';

DROP TABLE IF EXISTS `org_legal_entity`;
CREATE TABLE `org_legal_entity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '法人編碼（穩定業務鍵）',
  `name` varchar(128) NOT NULL COMMENT '法人全稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `jurisdiction` varchar(8) NOT NULL DEFAULT 'CN' COMMENT '法域 CN/HK/MO',
  `registration_no` varchar(64) DEFAULT NULL COMMENT '登記證照號',
  `registered_address` varchar(255) DEFAULT NULL COMMENT '註冊地址',
  `verify_status` tinyint NOT NULL DEFAULT '0' COMMENT '核實狀態 0=待核實 1=已核實',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_legal_code` (`code`),
  KEY `idx_org_legal_status` (`status`,`jurisdiction`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='組織編制-法人主體';

DROP TABLE IF EXISTS `org_position`;
CREATE TABLE `org_position` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '崗位編碼（穩定業務鍵）',
  `name` varchar(128) NOT NULL COMMENT '崗位名稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `unit_id` bigint NOT NULL COMMENT '所屬組織ID',
  `job_grade_id` bigint NOT NULL COMMENT '職位職級ID',
  `headcount` int NOT NULL DEFAULT '0' COMMENT '核定編制數（0=未核定）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_position_code` (`code`),
  KEY `idx_org_position_unit` (`unit_id`),
  KEY `idx_org_position_grade` (`job_grade_id`),
  CONSTRAINT `fk_org_position_grade` FOREIGN KEY (`job_grade_id`) REFERENCES `org_job_grade` (`id`),
  CONSTRAINT `fk_org_position_unit` FOREIGN KEY (`unit_id`) REFERENCES `org_unit` (`id`),
  CONSTRAINT `ck_org_position_headcount` CHECK ((`headcount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='組織編制-崗位實例';

DROP TABLE IF EXISTS `org_unit`;
CREATE TABLE `org_unit` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '組織編碼（穩定業務鍵）',
  `name` varchar(128) NOT NULL COMMENT '組織名稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `parent_id` bigint DEFAULT NULL COMMENT '上級組織ID（頂級為 NULL）',
  `legal_entity_id` bigint NOT NULL COMMENT '所屬法人ID',
  `unit_type` varchar(32) NOT NULL DEFAULT 'DEPARTMENT' COMMENT 'COMPANY/DEPARTMENT/BUSINESS_UNIT',
  `leader_name` varchar(64) DEFAULT NULL COMMENT '負責人姓名（人員主檔就緒前）',
  `path` varchar(255) DEFAULT NULL COMMENT '物化祖先路徑 /1/5/9',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '同級排序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_unit_code` (`code`),
  KEY `idx_org_unit_parent` (`parent_id`),
  KEY `idx_org_unit_legal` (`legal_entity_id`),
  KEY `idx_org_unit_path` (`path`),
  CONSTRAINT `fk_org_unit_legal` FOREIGN KEY (`legal_entity_id`) REFERENCES `org_legal_entity` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='組織編制-管理組織';

DROP TABLE IF EXISTS `payroll_component`;
CREATE TABLE `payroll_component` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `code` varchar(32) NOT NULL COMMENT '項目編碼',
  `name` varchar(128) NOT NULL COMMENT '項目名稱',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名稱',
  `component_type` varchar(32) NOT NULL COMMENT 'EARNING/DEDUCTION/EMPLOYER_COST',
  `taxable` tinyint NOT NULL DEFAULT '0' COMMENT '1=應稅 0=免稅',
  `currency` varchar(8) DEFAULT NULL COMMENT '幣種（空=隨薪酬標準）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=啟用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '工資單展示順序',
  `remark` varchar(255) DEFAULT NULL COMMENT '備註',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payroll_component_code` (`code`),
  KEY `idx_payroll_component_type` (`component_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='薪酬項目';

DROP TABLE IF EXISTS `payroll_salary_standard`;
CREATE TABLE `payroll_salary_standard` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主鍵ID',
  `employment_id` bigint NOT NULL COMMENT '雇傭關係ID',
  `base_amount` decimal(18,4) NOT NULL COMMENT '基本工資',
  `currency` varchar(8) NOT NULL COMMENT '幣種 CNY/HKD/MOP',
  `change_type` varchar(16) NOT NULL DEFAULT 'ADJUST' COMMENT 'HIRE/ADJUST/PROMOTION/ANNUAL',
  `effective_from` date NOT NULL COMMENT '生效起（含）',
  `effective_to` date DEFAULT NULL COMMENT '生效止（含，空=當前有效）',
  `seq_no` int NOT NULL DEFAULT '1' COMMENT '同日序號',
  `reason` varchar(255) DEFAULT NULL COMMENT '調薪原因',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最後更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '邏輯刪除',
  `current_employment` bigint GENERATED ALWAYS AS ((case when ((`effective_to` is null) and (`deleted` = 0)) then `employment_id` else NULL end)) STORED COMMENT '當前標準唯一約束載體',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payroll_standard_version` (`employment_id`,`effective_from`,`seq_no`),
  UNIQUE KEY `uk_payroll_standard_current` (`current_employment`),
  KEY `idx_payroll_standard_period` (`employment_id`,`effective_from`,`effective_to`),
  CONSTRAINT `fk_payroll_standard_employment` FOREIGN KEY (`employment_id`) REFERENCES `hr_employment` (`id`),
  CONSTRAINT `ck_payroll_standard_amount` CHECK ((`base_amount` >= 0)),
  CONSTRAINT `ck_payroll_standard_period` CHECK (((`effective_to` is null) or (`effective_to` >= `effective_from`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='薪酬標準（定調薪，日期生效）';

DROP TABLE IF EXISTS `person`;
CREATE TABLE `person` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `person_no` varchar(32) DEFAULT NULL COMMENT '集团工号（稳定业务键）',
  `name` varchar(64) NOT NULL COMMENT '姓名',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名',
  `gender` varchar(8) DEFAULT NULL COMMENT 'M/F/UNKNOWN',
  `birth_date` date DEFAULT NULL COMMENT '出生日期',
  `mobile` varchar(32) DEFAULT NULL COMMENT '手机号',
  `email` varchar(128) DEFAULT NULL COMMENT '邮箱',
  `nationality` varchar(8) DEFAULT NULL COMMENT '国籍 ISO 3166-1',
  `sys_user_id` bigint DEFAULT NULL COMMENT '账号映射 sys_user.id（为空=无账号人员）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=在职体系内 0=已退出',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_person_no` (`person_no`),
  UNIQUE KEY `uk_person_sys_user` (`sys_user_id`),
  KEY `idx_person_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人员主数据';

DROP TABLE IF EXISTS `prom_word_library`;
CREATE TABLE `prom_word_library` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `word` varchar(128) NOT NULL COMMENT '词条',
  `channel` varchar(32) NOT NULL COMMENT '所属频道: takeaway/supermarket/groupBuy',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态: 1=啟用 2=停用',
  `match_count` int NOT NULL DEFAULT '0' COMMENT '匹配次数',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `updated_time` datetime DEFAULT NULL COMMENT '最后更新时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_word_channel` (`word`,`channel`),
  KEY `idx_word_channel` (`channel`),
  KEY `idx_word_status` (`status`),
  KEY `idx_word_updated_by` (`updated_by`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广词库表';

DROP TABLE IF EXISTS `rdm_acceptance`;
CREATE TABLE `rdm_acceptance` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `accept_no` varchar(32) NOT NULL COMMENT '验收单号 XQYS+YYYYMMDD+4位',
  `req_id` bigint NOT NULL COMMENT '需求ID',
  `acceptor_user_id` bigint DEFAULT NULL COMMENT '验收人ID',
  `acceptor_emp_no` varchar(32) DEFAULT NULL COMMENT '验收人工号快照',
  `acceptor_name` varchar(64) DEFAULT NULL COMMENT '验收人姓名快照',
  `test_env` varchar(16) DEFAULT NULL COMMENT '验收环境: prod/pre/uat',
  `result` varchar(16) NOT NULL COMMENT '结论: pass/conditional/fail',
  `stage` varchar(16) NOT NULL DEFAULT 'pre_release' COMMENT '验收阶段: pre_release上线前预验收/post_release上线后业务验收',
  `attempt` int NOT NULL DEFAULT '1' COMMENT '第几次验收(1=首次,>1=返工复验)',
  `score` tinyint DEFAULT NULL COMMENT '交付满意度 1-5',
  `case_total` int DEFAULT NULL COMMENT '验收用例总数',
  `case_pass` int DEFAULT NULL COMMENT '通过用例数',
  `defect_count` int NOT NULL DEFAULT '0' COMMENT '本次缺陷数(用例未通过条数)',
  `issues` varchar(1000) DEFAULT NULL COMMENT '问题/遗留事项（不通过或有条件通过必填）',
  `opinion` varchar(1000) DEFAULT NULL COMMENT '验收意见',
  `follow_up_req_id` bigint DEFAULT NULL COMMENT '有条件通过时转出的后续需求ID',
  `follow_up_req_no` varchar(32) DEFAULT NULL COMMENT '后续需求编号快照',
  `accept_time` datetime DEFAULT NULL COMMENT '验收时间',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_accept_no` (`accept_no`),
  UNIQUE KEY `uk_rdm_acceptance_attempt` (`req_id`,`stage`,`attempt`),
  KEY `idx_rdm_accept_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-业务验收单（需求闭环最后一道闸）';

DROP TABLE IF EXISTS `rdm_acceptance_case`;
CREATE TABLE `rdm_acceptance_case` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `acceptance_id` bigint NOT NULL COMMENT '验收单ID',
  `req_id` bigint NOT NULL COMMENT '需求ID(冗余,便于按需求聚合缺陷)',
  `seq` int NOT NULL DEFAULT '1' COMMENT '用例序号',
  `title` varchar(200) NOT NULL COMMENT '用例名称(来源PRD验收标准)',
  `expect_result` varchar(500) DEFAULT NULL COMMENT '预期结果',
  `actual_result` varchar(500) DEFAULT NULL COMMENT '实际结果',
  `result` varchar(16) NOT NULL DEFAULT 'pass' COMMENT '用例结论: pass/fail/blocked',
  `severity` varchar(16) DEFAULT NULL COMMENT '缺陷严重度: critical/major/minor/trivial',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `evidence_json` mediumtext COMMENT '驗收證據附件JSON: [{name,type,size,dataUrl}]，列表僅回元信息，正文按需單張取',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_case_acceptance` (`acceptance_id`),
  KEY `idx_rdm_case_req` (`req_id`,`result`)
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-验收用例明细';

DROP TABLE IF EXISTS `rdm_acceptance_record`;
CREATE TABLE `rdm_acceptance_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `record_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '验收记录编号',
  `delivery_item_id` bigint NOT NULL COMMENT '交付项ID',
  `req_id` bigint DEFAULT NULL COMMENT '需求ID',
  `acceptance_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '验收类型:product/business',
  `stage` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pre_release' COMMENT '时点:pre_release/post_release',
  `scope_version` int DEFAULT NULL COMMENT '范围版本',
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '构建标识',
  `test_env` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '测试环境',
  `conclusion` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '结论:pass/fail/conditional',
  `score` tinyint DEFAULT NULL COMMENT '业务评分1-5',
  `opinion` text COLLATE utf8mb4_unicode_ci COMMENT '验收意见',
  `signer_user_id` bigint NOT NULL COMMENT '签署人ID',
  `signer_user_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '签署人姓名',
  `round_no` int NOT NULL DEFAULT '1' COMMENT '轮次',
  `conditions_json` json DEFAULT NULL COMMENT '附条件通过的条件',
  `evidence_json` json DEFAULT NULL COMMENT '验收证据',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_record_no` (`record_no`),
  KEY `idx_delivery_item` (`delivery_item_id`),
  KEY `idx_req` (`req_id`),
  KEY `idx_type_stage` (`acceptance_type`,`stage`),
  KEY `idx_signer` (`signer_user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM验收记录(交付项级)';

DROP TABLE IF EXISTS `rdm_attachment`;
CREATE TABLE `rdm_attachment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID',
  `biz_type` varchar(16) NOT NULL DEFAULT 'REQ' COMMENT '业务类型: REQ/COMMENT/ACCEPT/CHANGE',
  `file_name` varchar(200) NOT NULL COMMENT '文件名',
  `storage_path` mediumtext COMMENT '附件内容（存储路径或 Base64 Data URL）',
  `file_type` varchar(64) DEFAULT NULL COMMENT 'MIME 类型',
  `file_size` bigint DEFAULT NULL COMMENT '字节数',
  `uploader_user_id` bigint DEFAULT NULL COMMENT '上传人ID',
  `uploader_name` varchar(64) DEFAULT NULL COMMENT '上传人姓名',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_att_req` (`req_id`,`biz_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求附件（截图/文档/原型）';

DROP TABLE IF EXISTS `rdm_change_request`;
CREATE TABLE `rdm_change_request` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `change_no` varchar(32) NOT NULL COMMENT '變更編號 XC+YYYYMMDD+4位',
  `req_id` bigint NOT NULL COMMENT '業務需求ID',
  `prd_id` bigint DEFAULT NULL COMMENT '受影響 PRD',
  `change_type` varchar(24) NOT NULL COMMENT '變更類型: scope/schedule/criterion/priority/other',
  `before_snapshot` text COMMENT '變更前快照（JSON）',
  `after_content` varchar(2000) NOT NULL COMMENT '變更後內容',
  `reason` varchar(1000) NOT NULL COMMENT '變更原因',
  `impact_desc` varchar(1000) DEFAULT NULL COMMENT '影響說明（工时/排期/已验收内容）',
  `affects_schedule_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否影响排期',
  `added_hours` decimal(6,1) DEFAULT NULL COMMENT '增加工时（用于返工与产能复盘）',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '關聯 OA 審批流程編號',
  `approval_status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '審批狀態: pending/approved/rejected/cancelled',
  `applicant_user_id` bigint DEFAULT NULL COMMENT '申請人ID',
  `applicant_name` varchar(64) DEFAULT NULL COMMENT '申請人姓名',
  `apply_time` datetime DEFAULT NULL COMMENT '申請時間',
  `decide_time` datetime DEFAULT NULL COMMENT '審批時間',
  `decide_remark` varchar(500) DEFAULT NULL COMMENT '審批意見',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_change_no` (`change_no`),
  KEY `idx_rdm_change_req` (`req_id`,`approval_status`),
  KEY `idx_rdm_change_flow` (`flow_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求变更申请（走OA审批）';

DROP TABLE IF EXISTS `rdm_comment`;
CREATE TABLE `rdm_comment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID',
  `parent_id` bigint DEFAULT NULL COMMENT '父评论ID（回复）',
  `content` text NOT NULL COMMENT '评论内容',
  `mention_user_ids` varchar(500) DEFAULT NULL COMMENT '@ 提醒的用户ID列表',
  `internal_flag` tinyint NOT NULL DEFAULT '0' COMMENT '仅产研可见: 1=业务方不可见',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_comment_req` (`req_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求沟通记录';

DROP TABLE IF EXISTS `rdm_daily_report`;
CREATE TABLE `rdm_daily_report` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `report_date` date NOT NULL COMMENT '日报日期（快照口径日）',
  `report_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '档位: morning=晨报 / evening=晚报',
  `project_count` int NOT NULL DEFAULT '0' COMMENT '快照覆盖的在途项目数',
  `content_json` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '快照JSON：项目→迭代→需求层级 + 项目级指标 + 汇总计数',
  `group_title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '群报标题快照（渲染后）',
  `group_content` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '群报正文快照（渲染后 markdown，与实发内容一致）',
  `personal_count` int NOT NULL DEFAULT '0' COMMENT '个人工作通知接收人数（已绑定钉钉 userId 者）',
  `push_count` int NOT NULL DEFAULT '0' COMMENT '累计推送次数（含手动补发）',
  `trigger_type` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最近一次触发方式: schedule/manual',
  `trigger_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最近一次手动触发人姓名快照（定时为 NULL）',
  `scope_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '范围键：规则=rule:{id}，手动=manual:{projectId}:{iterationCode}；唯一键用它区分同日多份',
  `rule_id` bigint DEFAULT NULL COMMENT '推送规则ID（手动触发为 NULL）',
  `project_id` bigint DEFAULT NULL COMMENT '快照目标项目ID',
  `iteration_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '快照目标迭代编码（NULL=项目全部迭代）',
  `last_push_at` datetime DEFAULT NULL COMMENT '最近一次推送时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_daily_report_scope` (`report_date`,`report_type`,`scope_key`),
  KEY `idx_rdm_daily_report_date` (`report_date`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM每日日报快照（每天每档一行，通知与详情页同源）';

DROP TABLE IF EXISTS `rdm_daily_report_config`;
CREATE TABLE `rdm_daily_report_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_slot` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default' COMMENT '配置槽位（恒为 default，唯一键保证单行）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '日报总开关 0/1',
  `morning_time` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '09:00' COMMENT '晨报推送时间 HH:mm',
  `evening_time` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '18:00' COMMENT '晚报推送时间 HH:mm',
  `group_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '群报开关 0/1',
  `personal_enabled` tinyint NOT NULL DEFAULT '1' COMMENT '个人工作通知开关 0/1',
  `receiver_roles_json` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '["pm","product_owner"]' COMMENT '收件角色白名单(JSON数组)：pm/product_owner/tech_lead/qa_lead/ui_designer/ops_lead/project_member',
  `extra_receiver_user_ids_json` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '追加收件人 sys_user.id(JSON数组)，收到规则范围全部项目汇总',
  `exclude_receiver_user_ids_json` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '排除收件人 sys_user.id(JSON数组)，优先级最高',
  `receiver_scope` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all_projects' COMMENT '接收范围: all_projects=全部在途项目 / risk_only=仅风险逾期项目',
  `morning_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '晨报选用模板键（空=用该档默认模板）',
  `evening_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '晚报选用模板键（空=用该档默认模板）',
  `personal_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '个人通知选用模板键（空=用默认模板）',
  `board_link_valid_days` int NOT NULL DEFAULT '30' COMMENT '看板开放链接有效期（天）',
  `board_show_requirements` tinyint NOT NULL DEFAULT '1' COMMENT '看板是否展示需求明细 0/1',
  `board_show_owners` tinyint NOT NULL DEFAULT '1' COMMENT '看板是否展示负责人姓名 0/1',
  `board_show_unassigned` tinyint NOT NULL DEFAULT '1' COMMENT '看板是否展示未挂项目的迭代 0/1',
  `message_mode` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fixed' COMMENT '钉钉消息模式: fixed=固定框架 / template=自定义模板',
  `message_field_options` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '固定框架的字段开关（JSON，全局一套）',
  `quiet_policy` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'brief' COMMENT '无异常日降噪策略: full=照常发摘要 / brief=只发一句结论 / skip=不发（仍落快照）',
  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后更新人姓名快照',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_daily_report_config` (`config_slot`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送配置（单行：时间/开关/接收范围/选用模板）';

DROP TABLE IF EXISTS `rdm_daily_report_rule`;
CREATE TABLE `rdm_daily_report_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称（如「A產品-B1迭代日報」）',
  `project_id` bigint DEFAULT NULL COMMENT '目标项目ID（来自项目总览）；NULL=规则只以未挂项目的迭代（紧急修复）为范围',
  `project_ids` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '多项目范围 JSON array；空=单项目/全部项目/仅迭代',
  `iteration_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '目标迭代编码；NULL=该项目全部迭代',
  `push_time` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '推送时间 HH:mm',
  `content_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'morning' COMMENT '内容档位: morning=今日焦点 / evening=当日复盘',
  `group_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '群报模板键（空=按档位默认模板）',
  `personal_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '个人通知模板键（空=按档位默认模板）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否启用 0/1',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '说明',
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_daily_report_rule_project` (`project_id`,`deleted`),
  KEY `idx_rdm_daily_report_rule_time` (`enabled`,`push_time`,`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM进度日报推送规则（一条规则=项目+可选迭代+时间+档位+模板，可建多条）';

DROP TABLE IF EXISTS `rdm_daily_report_template`;
CREATE TABLE `rdm_daily_report_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `template_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板键（唯一，配置表按此引用）',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称',
  `channel` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '投放通道: group=钉钉群 / personal=工作通知',
  `report_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'morning' COMMENT '适用档位: morning/evening/any',
  `title_tpl` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题模板（含占位符）',
  `content_tpl` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '正文模板（markdown + 占位符，只做字符串替换不 eval）',
  `is_preset` tinyint NOT NULL DEFAULT '0' COMMENT '是否预置模板 0/1（预置不可删）',
  `is_default` tinyint NOT NULL DEFAULT '0' COMMENT '是否该 channel+report_type 的默认模板 0/1',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否启用 0/1',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '说明',
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_daily_report_template` (`template_key`),
  KEY `idx_rdm_daily_report_template_use` (`channel`,`report_type`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送模板（预置7套，用户可微调另存）';

DROP TABLE IF EXISTS `rdm_delivery_item`;
CREATE TABLE `rdm_delivery_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `item_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交付项编号',
  `req_id` bigint NOT NULL COMMENT '关联需求ID',
  `project_id` bigint DEFAULT NULL COMMENT '关联项目ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交付项标题',
  `scope_desc` text COLLATE utf8mb4_unicode_ci COMMENT '范围描述',
  `acceptance_criteria` text COLLATE utf8mb4_unicode_ci COMMENT '验收标准',
  `scope_version` int NOT NULL DEFAULT '1' COMMENT '范围版本号',
  `scope_frozen_at` datetime DEFAULT NULL COMMENT '范围冻结时间',
  `scope_frozen_by` bigint DEFAULT NULL COMMENT '范围冻结人',
  `scope_change_log` json DEFAULT NULL COMMENT '范围变更日志',
  `prd_snapshot_id` bigint DEFAULT NULL COMMENT 'PRD快照ID',
  `coordinator_user_id` bigint DEFAULT NULL COMMENT '协调人用户ID',
  `coordinator_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '协调人姓名',
  `product_acceptor_user_id` bigint DEFAULT NULL COMMENT '产品验收人ID',
  `product_acceptor_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品验收人姓名',
  `biz_acceptor_user_id` bigint DEFAULT NULL COMMENT '业务验收人ID',
  `biz_acceptor_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务验收人姓名',
  `acceptance_path` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'A' COMMENT '验收路径A/B',
  `plan_start_date` date DEFAULT NULL COMMENT '计划开始',
  `plan_end_date` date DEFAULT NULL COMMENT '计划结束',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'preparing' COMMENT '状态:preparing/developing/testing/pending_acceptance/pending_release/released_pending/done',
  `blocked_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '阻塞标记',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_no` (`item_no`),
  KEY `idx_req` (`req_id`),
  KEY `idx_project` (`project_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM交付项';

DROP TABLE IF EXISTS `rdm_evidence_invalidation`;
CREATE TABLE `rdm_evidence_invalidation` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `delivery_item_id` bigint NOT NULL COMMENT '交付项ID',
  `evidence_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '证据类型:test_batch/acceptance/release_check',
  `evidence_id` bigint NOT NULL COMMENT '证据记录ID',
  `old_scope_version` int NOT NULL COMMENT '旧范围版本',
  `new_scope_version` int NOT NULL COMMENT '新范围版本',
  `invalidated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '失效时间',
  `invalidated_by` bigint DEFAULT NULL COMMENT '操作人',
  `reason` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '失效原因',
  PRIMARY KEY (`id`),
  KEY `idx_delivery_item` (`delivery_item_id`),
  KEY `idx_evidence` (`evidence_type`,`evidence_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM范围变更证据失效记录';

DROP TABLE IF EXISTS `rdm_flow_config`;
CREATE TABLE `rdm_flow_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `scope_key` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'GLOBAL或PROJECT:数字ID',
  `project_id` bigint DEFAULT NULL,
  `v3_write_enabled` tinyint NOT NULL DEFAULT '0',
  `v3_release_enabled` tinyint NOT NULL DEFAULT '0',
  `global_write_paused` tinyint NOT NULL DEFAULT '0',
  `global_release_paused` tinyint NOT NULL DEFAULT '0',
  `product_verification_days` int NOT NULL DEFAULT '1',
  `business_verification_days` int NOT NULL DEFAULT '5',
  `version` int NOT NULL DEFAULT '0',
  `updated_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_flow_scope` (`scope_key`),
  KEY `idx_rdm_flow_project` (`project_id`),
  CONSTRAINT `fk_rdm_flow_project` FOREIGN KEY (`project_id`) REFERENCES `rdm_project` (`id`),
  CONSTRAINT `ck_rdm_flow_days` CHECK (((`product_verification_days` > 0) and (`business_verification_days` > 0) and (`version` >= 0))),
  CONSTRAINT `ck_rdm_flow_flags` CHECK (((`v3_write_enabled` in (0,1)) and (`v3_release_enabled` in (0,1)) and (`global_write_paused` in (0,1)) and (`global_release_paused` in (0,1)) and ((`scope_key` = _utf8mb4'GLOBAL') or ((`global_write_paused` = 0) and (`global_release_paused` = 0))))),
  CONSTRAINT `ck_rdm_flow_scope` CHECK ((((`scope_key` = _utf8mb4'GLOBAL') and (`project_id` is null)) or ((`project_id` is not null) and (`project_id` > 0) and (`scope_key` = concat(_utf8mb4'PROJECT:',`project_id`)))))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM显式项目灰度，读审计不受写熔断影响';

DROP TABLE IF EXISTS `rdm_hr_suggestion`;
CREATE TABLE `rdm_hr_suggestion` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `period_code` varchar(32) NOT NULL COMMENT '绩效周期编码',
  `user_id` bigint NOT NULL COMMENT '被建议人 sys_user.id',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照（HR 系统按工号匹配，改不了历史）',
  `user_name` varchar(64) DEFAULT NULL COMMENT '姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '部门ID快照',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `total_score` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '本周期贡献分合计',
  `record_count` int NOT NULL DEFAULT '0' COMMENT '依据的积分流水条数（0 说明没有可追溯明细）',
  `delivered_count` int NOT NULL DEFAULT '0' COMMENT '交付需求数',
  `avg_acceptance_score` decimal(4,2) DEFAULT NULL COMMENT '上线后业务验收平均分',
  `first_pass_count` int NOT NULL DEFAULT '0' COMMENT '一次通过的需求数',
  `budget_used_ratio` decimal(9,2) NOT NULL DEFAULT '0.00' COMMENT '所屬部門預算占用百分比（可遠超 100）',
  `over_budget` tinyint NOT NULL DEFAULT '0' COMMENT '是否超出预算（1=超出，需 PMO 复核说明）',
  `breakdown_json` text COMMENT '分项依据快照（角色/需求/规则版本，供申诉复算）',
  `rule_version` int DEFAULT NULL COMMENT '出分时生效的规则版本',
  `status` varchar(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/confirmed/pushed/withdrawn',
  `reviewer_user_id` bigint DEFAULT NULL COMMENT '复核人（PMO/主管）',
  `reviewer_name` varchar(64) DEFAULT NULL COMMENT '复核人姓名快照',
  `review_time` datetime DEFAULT NULL COMMENT '复核时间',
  `review_remark` varchar(500) DEFAULT NULL COMMENT '复核意见（驳回或超限说明必填）',
  `pushed_at` datetime DEFAULT NULL COMMENT '推送建议值到绩效的时间',
  `generated_at` datetime DEFAULT NULL COMMENT '本次聚合时间（重算会更新）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_hr_suggestion` (`period_code`,`user_id`),
  KEY `idx_rdm_hr_suggestion_period` (`period_code`,`status`),
  KEY `idx_rdm_hr_suggestion_dept` (`dept_id`,`period_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-HR绩效建议（积分聚合→人工复核→推送，状态单向流转并留痕）';

DROP TABLE IF EXISTS `rdm_idempotent_log`;
CREATE TABLE `rdm_idempotent_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '请求幂等ID',
  `biz_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型',
  `result_json` json DEFAULT NULL COMMENT '缓存结果',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `user_id` bigint DEFAULT NULL COMMENT '认证用户，旧日志不回放',
  `resource_key` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `client_request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `request_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'legacy' COMMENT 'legacy/processing/completed',
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  KEY `idx_biz_type` (`biz_type`),
  CONSTRAINT `ck_rdm_idempotent_binding` CHECK (((`status` = _utf8mb4'legacy') or ((`status` in (_utf8mb4'processing',_utf8mb4'completed')) and (`user_id` is not null) and (`user_id` > 0) and (`resource_key` is not null) and (`client_request_id` is not null) and (`request_hash` is not null))))
) ENGINE=InnoDB AUTO_INCREMENT=110 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM幂等请求日志';

DROP TABLE IF EXISTS `rdm_intake_policy`;
CREATE TABLE `rdm_intake_policy` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(128) NOT NULL COMMENT '策略名称（会出现在需求的准入判定说明里）',
  `mode` varchar(16) NOT NULL DEFAULT 'APPROVE' COMMENT '准入动作: FORCE_APPROVE=强制需审批 APPROVE=需审批 EXEMPT=免审直送技术部',
  `scope_dept_ids` varchar(255) DEFAULT NULL COMMENT '适用部门ID列表(逗号分隔)，空=不限部门',
  `scope_dept_names` varchar(512) DEFAULT NULL COMMENT '适用部门名称快照(逗号分隔)，用于展示与名称命中',
  `include_sub_dept` tinyint NOT NULL DEFAULT '0' COMMENT '是否含下级部门: 1=含 0=仅本部门',
  `scope_roles` varchar(255) DEFAULT NULL COMMENT '适用角色编码/名称列表(逗号分隔)，空=不限角色',
  `scope_systems` varchar(255) DEFAULT NULL COMMENT '适用系统编码列表(逗号分隔)，空=不限系统',
  `scope_req_types` varchar(255) DEFAULT NULL COMMENT '适用需求类型列表(逗号分隔)，空=不限类型',
  `approval_nodes` varchar(512) DEFAULT NULL COMMENT '审批节点名称(按顺序执行，逗号分隔)；缺失则该轮进入审批异常待办',
  `dispatcher_user_id` bigint DEFAULT NULL COMMENT '默认分派责任人（技术负责人）sys_user.id',
  `dispatcher_name` varchar(64) DEFAULT NULL COMMENT '默认分派责任人姓名快照',
  `priority` int NOT NULL DEFAULT '10' COMMENT '命中优先级（越小越优先；同优先级条件重叠禁止保存）',
  `effective_from` date NOT NULL COMMENT '生效开始日期',
  `effective_to` date DEFAULT NULL COMMENT '生效结束日期，空=长期有效',
  `version` varchar(16) NOT NULL DEFAULT 'v1' COMMENT '规则版本，在途需求绑定发起时的版本',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '启用: 1=启用 0=停用（新建默认停用，避免半套条件直接上线）',
  `remark` varchar(512) DEFAULT NULL COMMENT '适用说明/免审理由',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_policy_hit` (`status`,`deleted`,`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求准入策略（谁提的需求要不要先审批、走哪条审批链）';

DROP TABLE IF EXISTS `rdm_intake_round`;
CREATE TABLE `rdm_intake_round` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID rdm_requirement.id',
  `round_no` int NOT NULL COMMENT '第几轮提交（从 1 递增，历史轮次不覆盖）',
  `flow_no` varchar(64) DEFAULT NULL COMMENT '本轮准入单号 biz_oa_request.flow_no，空=免审轮次无审批单',
  `decision` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '轮次结论: pending/approved/rejected/withdrawn/exempt',
  `need_approval` tinyint NOT NULL DEFAULT '1' COMMENT '本轮是否需审批（服务端裁决结果，非客户端参数）',
  `policy_id` bigint DEFAULT NULL COMMENT '命中的准入策略ID，空=使用内置默认策略',
  `policy_name` varchar(128) DEFAULT NULL COMMENT '命中策略名称快照',
  `policy_version` varchar(16) DEFAULT NULL COMMENT '命中策略版本快照',
  `policy_mode` varchar(16) DEFAULT NULL COMMENT '命中策略动作快照',
  `match_explain` text COMMENT '命中链路（为什么免审/为什么要审，事后审计用）',
  `submit_dept_id` bigint DEFAULT NULL COMMENT '提交时提出部门ID快照',
  `submit_dept_name` varchar(128) DEFAULT NULL COMMENT '提交时提出部门名称快照',
  `submitter_user_id` bigint DEFAULT NULL COMMENT '本轮提交人 sys_user.id',
  `submitter_name` varchar(64) DEFAULT NULL COMMENT '本轮提交人姓名快照',
  `content_snapshot` text COMMENT '本轮提交内容摘要快照（标题/类型/优先级，用于证明审批的是哪一版）',
  `submit_time` datetime DEFAULT NULL COMMENT '本轮提交时间',
  `decide_time` datetime DEFAULT NULL COMMENT '本轮审结时间',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_intake_round` (`req_id`,`round_no`),
  UNIQUE KEY `uk_rdm_intake_flow` (`flow_no`),
  KEY `idx_rdm_intake_decision` (`decision`,`submit_time`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-准入审批轮次（每轮独立内容与OA实例，旧回调不能推动新轮次）';

DROP TABLE IF EXISTS `rdm_issue`;
CREATE TABLE `rdm_issue` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `issue_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '问题编号',
  `source_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '来源:test/product_acceptance/biz_acceptance',
  `source_id` bigint DEFAULT NULL COMMENT '来源记录ID',
  `req_id` bigint DEFAULT NULL COMMENT '需求ID',
  `delivery_item_id` bigint DEFAULT NULL COMMENT '交付项ID',
  `scope_version` int DEFAULT NULL COMMENT '范围版本',
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '构建标识',
  `title` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '问题标题',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '问题描述',
  `impact` text COLLATE utf8mb4_unicode_ci COMMENT '影响描述',
  `severity` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'minor' COMMENT '严重程度:critical/major/minor/trivial',
  `owner_user_id` bigint DEFAULT NULL COMMENT '负责人ID',
  `owner_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '负责人姓名',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open' COMMENT '状态:open/processing/pending_verify/resolved/deferred',
  `reporter_user_id` bigint DEFAULT NULL COMMENT '报告人ID',
  `reporter_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报告人姓名',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `version` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_issue_no` (`issue_no`),
  KEY `idx_req` (`req_id`),
  KEY `idx_delivery_item` (`delivery_item_id`),
  KEY `idx_owner` (`owner_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_severity` (`severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM问题';

DROP TABLE IF EXISTS `rdm_issue_defer`;
CREATE TABLE `rdm_issue_defer` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `issue_id` bigint NOT NULL COMMENT '问题ID',
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '延期原因',
  `impact_desc` text COLLATE utf8mb4_unicode_ci COMMENT '影响描述',
  `mitigation` text COLLATE utf8mb4_unicode_ci COMMENT '临时措施',
  `target_version` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标版本',
  `owner_user_id` bigint DEFAULT NULL COMMENT '后续责任人ID',
  `owner_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '后续责任人姓名',
  `due_at` date NOT NULL COMMENT '截止日期',
  `product_decision` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '产品决定:pending/approved/rejected',
  `product_decide_user_id` bigint DEFAULT NULL COMMENT '产品决定人ID',
  `product_decide_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品决定人姓名',
  `product_decide_time` datetime DEFAULT NULL COMMENT '产品决定时间',
  `product_decide_reason` text COLLATE utf8mb4_unicode_ci COMMENT '产品决定理由',
  `biz_decision` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_required' COMMENT '业务决定:pending/approved/rejected/not_required',
  `biz_decide_user_id` bigint DEFAULT NULL COMMENT '业务决定人ID',
  `biz_decide_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务决定人姓名',
  `biz_decide_time` datetime DEFAULT NULL COMMENT '业务决定时间',
  `biz_decide_reason` text COLLATE utf8mb4_unicode_ci COMMENT '业务决定理由',
  `follow_up_req_id` bigint DEFAULT NULL COMMENT '承接需求ID',
  `follow_up_req_no` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接需求编号',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_product' COMMENT '状态:pending_product/pending_biz/pending_bind/effective/rejected',
  `applicant_user_id` bigint DEFAULT NULL COMMENT '申请人ID',
  `applicant_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '申请人姓名',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `version` int NOT NULL DEFAULT '0',
  `scope_version` int DEFAULT NULL,
  `scope_change_id` bigint DEFAULT NULL COMMENT '必要范围变更批准引用',
  `effective_at` datetime DEFAULT NULL,
  `escalated_at` datetime DEFAULT NULL,
  `escalation_level` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_issue` (`issue_id`),
  KEY `idx_status` (`status`),
  KEY `idx_follow_up` (`follow_up_req_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM问题延期决定';

DROP TABLE IF EXISTS `rdm_issue_followup`;
CREATE TABLE `rdm_issue_followup` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `issue_id` bigint NOT NULL,
  `defer_id` bigint NOT NULL,
  `follow_up_req_id` bigint NOT NULL,
  `source_req_id` bigint NOT NULL,
  `source_delivery_item_id` bigint NOT NULL,
  `scope_version` int NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `target_version` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `due_at` date NOT NULL,
  `active` tinyint NOT NULL DEFAULT '1',
  `active_issue_id` bigint GENERATED ALWAYS AS ((case when (`active` = 1) then `issue_id` else NULL end)) STORED,
  `supersedes_id` bigint DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deactivated_at` datetime DEFAULT NULL,
  `deactivated_by` bigint DEFAULT NULL,
  `version` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_followup_active_issue` (`active_issue_id`),
  KEY `idx_rdm_followup_req` (`follow_up_req_id`),
  KEY `fk_rdm_followup_issue` (`issue_id`),
  KEY `fk_rdm_followup_defer` (`defer_id`),
  KEY `fk_rdm_followup_source_req` (`source_req_id`),
  KEY `fk_rdm_followup_source_item` (`source_delivery_item_id`),
  CONSTRAINT `fk_rdm_followup_defer` FOREIGN KEY (`defer_id`) REFERENCES `rdm_issue_defer` (`id`),
  CONSTRAINT `fk_rdm_followup_issue` FOREIGN KEY (`issue_id`) REFERENCES `rdm_issue` (`id`),
  CONSTRAINT `fk_rdm_followup_req` FOREIGN KEY (`follow_up_req_id`) REFERENCES `rdm_requirement` (`id`),
  CONSTRAINT `fk_rdm_followup_source_item` FOREIGN KEY (`source_delivery_item_id`) REFERENCES `rdm_delivery_item` (`id`),
  CONSTRAINT `fk_rdm_followup_source_req` FOREIGN KEY (`source_req_id`) REFERENCES `rdm_requirement` (`id`),
  CONSTRAINT `ck_rdm_followup_active` CHECK ((`active` in (0,1))),
  CONSTRAINT `ck_rdm_followup_version` CHECK (((`scope_version` > 0) and (`version` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM承接历史，仅当前关联可失效，不删除';

DROP TABLE IF EXISTS `rdm_issue_resolution`;
CREATE TABLE `rdm_issue_resolution` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `issue_id` bigint NOT NULL,
  `followup_id` bigint NOT NULL,
  `delivery_item_id` bigint NOT NULL,
  `scope_version` int NOT NULL,
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `repair_evidence_json` json NOT NULL,
  `test_round_id` bigint NOT NULL,
  `test_execution_ids_json` json NOT NULL,
  `product_acceptance_id` bigint NOT NULL,
  `business_acceptance_id` bigint DEFAULT NULL,
  `conclusion` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `signer_user_id` bigint NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rdm_resolution_issue` (`issue_id`,`created_at`),
  KEY `fk_rdm_resolution_followup` (`followup_id`),
  KEY `fk_rdm_resolution_item` (`delivery_item_id`),
  KEY `fk_rdm_resolution_round` (`test_round_id`),
  KEY `fk_rdm_resolution_product` (`product_acceptance_id`),
  KEY `fk_rdm_resolution_business` (`business_acceptance_id`),
  CONSTRAINT `fk_rdm_resolution_business` FOREIGN KEY (`business_acceptance_id`) REFERENCES `rdm_acceptance_record` (`id`),
  CONSTRAINT `fk_rdm_resolution_followup` FOREIGN KEY (`followup_id`) REFERENCES `rdm_issue_followup` (`id`),
  CONSTRAINT `fk_rdm_resolution_issue` FOREIGN KEY (`issue_id`) REFERENCES `rdm_issue` (`id`),
  CONSTRAINT `fk_rdm_resolution_item` FOREIGN KEY (`delivery_item_id`) REFERENCES `rdm_delivery_item` (`id`),
  CONSTRAINT `fk_rdm_resolution_product` FOREIGN KEY (`product_acceptance_id`) REFERENCES `rdm_acceptance_record` (`id`),
  CONSTRAINT `fk_rdm_resolution_round` FOREIGN KEY (`test_round_id`) REFERENCES `rdm_test_round` (`id`),
  CONSTRAINT `ck_rdm_resolution_conclusion` CHECK ((`conclusion` in (_utf8mb4'pass',_utf8mb4'fail')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式修复复测验收闭环证据';

DROP TABLE IF EXISTS `rdm_iteration`;
CREATE TABLE `rdm_iteration` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` varchar(32) NOT NULL COMMENT '迭代編碼，如 SP2026-10A',
  `name` varchar(64) NOT NULL COMMENT '迭代名稱',
  `project_id` bigint DEFAULT NULL COMMENT '所属项目ID（sprint/version必填，hotfix可空）',
  `iteration_type` varchar(16) NOT NULL DEFAULT 'sprint' COMMENT '類型: sprint/version/hotfix',
  `start_date` date NOT NULL COMMENT '開始日期',
  `end_date` date NOT NULL COMMENT '結束日期',
  `capacity_hours` int NOT NULL DEFAULT '0' COMMENT '產能（工時）',
  `owner_user_id` bigint DEFAULT NULL COMMENT '迭代負責人ID',
  `owner_name` varchar(64) DEFAULT NULL COMMENT '迭代負責人姓名',
  `status` varchar(16) NOT NULL DEFAULT 'planning' COMMENT '狀態: planning/active/closed',
  `remark` varchar(500) DEFAULT NULL COMMENT '說明',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_iteration_code` (`code`),
  KEY `idx_rdm_iteration_status` (`status`,`start_date`),
  KEY `idx_rdm_iteration_project` (`project_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-迭代/版本排期';

DROP TABLE IF EXISTS `rdm_metric_snapshot`;
CREATE TABLE `rdm_metric_snapshot` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `stat_date` date NOT NULL COMMENT '快照日期',
  `dim_type` varchar(16) NOT NULL DEFAULT 'COMPANY' COMMENT '維度: COMPANY/DEPT/PERSON/PM',
  `dim_id` bigint NOT NULL DEFAULT '0' COMMENT '維度對象ID，COMPANY 固定為 0',
  `dim_name` varchar(64) DEFAULT NULL COMMENT '維度名稱快照',
  `req_total` int NOT NULL DEFAULT '0' COMMENT '截至當日存量需求數',
  `submitted` int NOT NULL DEFAULT '0' COMMENT '當日新提交',
  `accepted` int NOT NULL DEFAULT '0' COMMENT '當日受理',
  `released` int NOT NULL DEFAULT '0' COMMENT '當日上線',
  `overdue` int NOT NULL DEFAULT '0' COMMENT '當日逾期存量',
  `avg_response_hours` decimal(8,2) DEFAULT NULL COMMENT '平均響應時長（小時）',
  `avg_delivery_days` decimal(8,2) DEFAULT NULL COMMENT '平均交付週期（天）',
  `on_time_rate` decimal(5,4) DEFAULT NULL COMMENT '按時上線率',
  `reject_rate` decimal(5,4) DEFAULT NULL COMMENT '駁回率',
  `first_pass_rate` decimal(5,4) DEFAULT NULL COMMENT '驗收一次通過率',
  `rework_count` int NOT NULL DEFAULT '0' COMMENT '當日返工次數',
  `change_count` int NOT NULL DEFAULT '0' COMMENT '當日變更次數',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_metric_day` (`stat_date`,`dim_type`,`dim_id`),
  KEY `idx_rdm_metric_dim` (`dim_type`,`stat_date`)
) ENGINE=InnoDB AUTO_INCREMENT=273 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-效能量日快照';

DROP TABLE IF EXISTS `rdm_migration_audit`;
CREATE TABLE `rdm_migration_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_id` bigint NOT NULL,
  `item_id` bigint DEFAULT NULL,
  `action` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'preview/confirm/execute/pause/resume/rollback/reconcile',
  `result` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'success/failed/blocked',
  `operator_user_id` bigint NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `before_version` int NOT NULL,
  `after_version` int NOT NULL,
  `before_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `after_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `result_json` json NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rdm_migration_audit_batch` (`batch_id`,`created_at`),
  KEY `fk_rdm_migration_audit_item` (`item_id`),
  CONSTRAINT `fk_rdm_migration_audit_batch` FOREIGN KEY (`batch_id`) REFERENCES `rdm_migration_batch` (`id`),
  CONSTRAINT `fk_rdm_migration_audit_item` FOREIGN KEY (`item_id`) REFERENCES `rdm_migration_item` (`id`),
  CONSTRAINT `ck_rdm_migration_audit_action` CHECK ((`action` in (_utf8mb4'preview',_utf8mb4'confirm',_utf8mb4'execute',_utf8mb4'pause',_utf8mb4'resume',_utf8mb4'rollback',_utf8mb4'reconcile'))),
  CONSTRAINT `ck_rdm_migration_audit_result` CHECK ((`result` in (_utf8mb4'success',_utf8mb4'failed',_utf8mb4'blocked')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可覆盖的迁移结果审计';

DROP TABLE IF EXISTS `rdm_migration_batch`;
CREATE TABLE `rdm_migration_batch` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `requested_by` bigint NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'previewed',
  `preview_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `preview_summary_json` json NOT NULL,
  `chunk_size` int NOT NULL DEFAULT '20',
  `confirmed_by` bigint DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `paused_at` datetime DEFAULT NULL,
  `pause_reason` text COLLATE utf8mb4_unicode_ci,
  `version` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_migration_request` (`requested_by`,`request_id`),
  KEY `idx_rdm_migration_status` (`status`,`created_at`),
  CONSTRAINT `ck_rdm_migration_batch_status` CHECK ((`status` in (_utf8mb4'previewed',_utf8mb4'confirmed',_utf8mb4'running',_utf8mb4'paused',_utf8mb4'completed',_utf8mb4'failed',_utf8mb4'rolled_back'))),
  CONSTRAINT `ck_rdm_migration_chunk` CHECK (((`chunk_size` between 1 and 100) and (`version` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM人工确认的小批迁移计划';

DROP TABLE IF EXISTS `rdm_migration_item`;
CREATE TABLE `rdm_migration_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_id` bigint NOT NULL,
  `req_id` bigint NOT NULL,
  `target_project_id` bigint DEFAULT NULL,
  `source_flow_version` int NOT NULL,
  `source_version` int NOT NULL,
  `preview_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `before_snapshot_json` json NOT NULL COMMENT '原范围、任务归属、整改来源和版本摘要',
  `after_snapshot_json` json DEFAULT NULL COMMENT '执行后关联及版本摘要，不伪造证据',
  `fact_baseline_json` json NOT NULL COMMENT '执行前已有事实ID集合与摘要，回滚须重读差异',
  `executed_fact_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'previewed',
  `active_req_id` bigint GENERATED ALWAYS AS ((case when (`status` in (_utf8mb4'confirmed',_utf8mb4'running',_utf8mb4'completed',_utf8mb4'blocked')) then `req_id` else NULL end)) STORED,
  `confirmed_by` bigint DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `executed_by` bigint DEFAULT NULL,
  `executed_at` datetime DEFAULT NULL,
  `rolled_back_by` bigint DEFAULT NULL,
  `rolled_back_at` datetime DEFAULT NULL,
  `result_json` json DEFAULT NULL,
  `blocking_reason` text COLLATE utf8mb4_unicode_ci,
  `version` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_migration_batch_req` (`batch_id`,`req_id`),
  UNIQUE KEY `uk_rdm_migration_active_req` (`active_req_id`),
  KEY `fk_rdm_migration_item_req` (`req_id`),
  KEY `fk_rdm_migration_item_project` (`target_project_id`),
  CONSTRAINT `fk_rdm_migration_item_batch` FOREIGN KEY (`batch_id`) REFERENCES `rdm_migration_batch` (`id`),
  CONSTRAINT `fk_rdm_migration_item_project` FOREIGN KEY (`target_project_id`) REFERENCES `rdm_project` (`id`),
  CONSTRAINT `fk_rdm_migration_item_req` FOREIGN KEY (`req_id`) REFERENCES `rdm_requirement` (`id`),
  CONSTRAINT `ck_rdm_migration_item_status` CHECK ((`status` in (_utf8mb4'previewed',_utf8mb4'confirmed',_utf8mb4'running',_utf8mb4'completed',_utf8mb4'failed',_utf8mb4'blocked',_utf8mb4'rolled_back'))),
  CONSTRAINT `ck_rdm_migration_source` CHECK (((`source_flow_version` in (1,2)) and (`source_version` >= 0) and (`version` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM逐项预览确认执行与保守回退';

DROP TABLE IF EXISTS `rdm_milestone`;
CREATE TABLE `rdm_milestone` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID rdm_requirement.id',
  `code` varchar(32) NOT NULL COMMENT '节点编码: PRD_REVIEW/DESIGN_DONE/DEV_START/DEV_DONE/RELEASE',
  `name` varchar(64) NOT NULL COMMENT '节点名称快照（展示用，改配置不影响历史）',
  `owner_user_id` bigint DEFAULT NULL COMMENT '节点负责人 sys_user.id',
  `owner_name` varchar(64) DEFAULT NULL COMMENT '负责人姓名快照',
  `preliminary_date` date DEFAULT NULL COMMENT '初步计划（PM 受理时填）',
  `baseline_date` date DEFAULT NULL COMMENT '已批准基线（评审/估时后冻结，不随后续改期覆盖）',
  `forecast_date` date DEFAULT NULL COMMENT '当前预测（改期只动这列，基线保留）',
  `actual_date` date DEFAULT NULL COMMENT '实际完成时间（由流转或任务联动写入）',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/done/not_applicable',
  `na_reason` varchar(256) DEFAULT NULL COMMENT '不适用原因（如纯后端需求无 UI 设计节点）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '节点顺序',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_milestone` (`req_id`,`code`),
  KEY `idx_rdm_milestone_owner` (`owner_user_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求里程碑（五节点计划/基线/预测/实际，按时率与甘特基线的事实来源）';

DROP TABLE IF EXISTS `rdm_notify_log`;
CREATE TABLE `rdm_notify_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint DEFAULT NULL COMMENT '需求ID',
  `event_code` varchar(32) NOT NULL COMMENT '事件编码（见 RdmConstants.EVENT_*）',
  `channel` varchar(16) NOT NULL DEFAULT 'DINGTALK' COMMENT '渠道: DINGTALK/INBOX',
  `scenario` varchar(32) DEFAULT NULL COMMENT '钉钉场景编码（重发时沿用原场景）',
  `title` varchar(200) DEFAULT NULL COMMENT '消息标题（重发载荷）',
  `content` text COMMENT '消息正文（重发载荷）',
  `msg_type` varchar(16) NOT NULL DEFAULT 'markdown' COMMENT '投递消息类型: markdown/action_card（卡片带一个跳转按钮）',
  `btn_title` varchar(32) DEFAULT NULL COMMENT '卡片按钮文案（msg_type=action_card 时必填）',
  `btn_url` varchar(512) DEFAULT NULL COMMENT '卡片按钮跳转地址（msg_type=action_card 时必填）',
  `at_mobiles` varchar(512) DEFAULT NULL COMMENT '@手机号列表（逗号分隔）',
  `receivers` varchar(512) DEFAULT NULL COMMENT '接收人姓名列表（逗号分隔）。一条事件一行、一条群播报消息，所以不按人拆行；旧的 receiver_name/receiver_emp_no 仅保留给历史行',
  `receiver_name` varchar(64) DEFAULT NULL COMMENT '接收人姓名',
  `receiver_emp_no` varchar(32) DEFAULT NULL COMMENT '接收人工号',
  `send_status` varchar(16) NOT NULL COMMENT '结果: success/skipped/failed',
  `attempts` int NOT NULL DEFAULT '0' COMMENT '已尝试次数',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间（退避）',
  `channel_name` varchar(64) DEFAULT NULL COMMENT '实际受理的渠道名',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '失败原因',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `object_type` varchar(32) DEFAULT NULL,
  `object_id` bigint DEFAULT NULL,
  `event_version` varchar(64) DEFAULT NULL COMMENT 'VERSION:并发版本或DATE:yyyy-MM-dd',
  `receiver_user_id` bigint DEFAULT NULL,
  `dedupe_key` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL COMMENT '新事件规范化摘要，旧行NULL不回填',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_notify_dedupe` (`dedupe_key`),
  KEY `idx_rdm_notify_req` (`req_id`,`event_code`),
  KEY `idx_rdm_notify_due` (`send_status`,`next_retry_at`),
  CONSTRAINT `ck_rdm_notify_dedupe` CHECK (((`dedupe_key` is null) or ((char_length(`dedupe_key`) = 64) and (`object_type` is not null) and (char_length(`object_type`) > 0) and (`object_id` is not null) and (`object_id` > 0) and (`event_version` is not null) and (char_length(`event_version`) > 0) and (`receiver_user_id` is not null) and (`receiver_user_id` > 0))))
) ENGINE=InnoDB AUTO_INCREMENT=562 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-通知发送留痕（可排查漏通知/重发）';

DROP TABLE IF EXISTS `rdm_prd`;
CREATE TABLE `rdm_prd` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `prd_no` varchar(32) NOT NULL COMMENT 'PRD編號 PRD+YYYYMMDD+4位',
  `req_id` bigint NOT NULL COMMENT '所屬業務需求 rdm_requirement.id',
  `parent_prd_id` bigint DEFAULT NULL COMMENT '父 PRD（支持逐級拆解）',
  `title` varchar(200) NOT NULL COMMENT 'PRD 標題',
  `target_users` varchar(255) DEFAULT NULL COMMENT '目標用戶與場景',
  `feature_list` text COMMENT '功能清單（結構化文本/JSON）',
  `acceptance_criteria` text COMMENT '驗收標準（逐條可驗證）',
  `content_rich` mediumtext COMMENT 'PRD 正文（富文本 HTML）',
  `prototype_url` varchar(500) DEFAULT NULL COMMENT '原型/設計稿連結',
  `status` varchar(24) NOT NULL DEFAULT 'draft' COMMENT '狀態: draft/reviewing/approved/rejected/archived',
  `version_no` varchar(16) NOT NULL DEFAULT 'v1.0' COMMENT '文檔版本',
  `author_user_id` bigint DEFAULT NULL COMMENT '編寫人（產品經理）ID',
  `author_name` varchar(64) DEFAULT NULL COMMENT '編寫人姓名',
  `review_time` datetime DEFAULT NULL COMMENT '評審完成時間',
  `review_conclusion` varchar(500) DEFAULT NULL COMMENT '評審結論',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `row_version` int NOT NULL DEFAULT '0' COMMENT '并发版本号(乐观锁)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_prd_no` (`prd_no`),
  KEY `idx_rdm_prd_req` (`req_id`,`status`),
  KEY `idx_rdm_prd_author` (`author_user_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=122 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-产品需求PRD（L2，可多级拆解）';

DROP TABLE IF EXISTS `rdm_prd_snapshot`;
CREATE TABLE `rdm_prd_snapshot` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `prd_id` bigint NOT NULL COMMENT 'PRD ID rdm_prd.id',
  `req_id` bigint NOT NULL COMMENT '需求ID（冗余便于按需求查版本链）',
  `version_no` varchar(16) NOT NULL COMMENT 'PRD 版本号快照，如 v1.2',
  `title` varchar(200) DEFAULT NULL COMMENT '标题快照',
  `feature_list` text COMMENT '功能清单快照',
  `acceptance_criteria` text COMMENT '验收标准快照（验收用例的来源）',
  `content_rich` mediumtext COMMENT '正文快照',
  `prototype_url` varchar(512) DEFAULT NULL COMMENT '原型链接快照',
  `review_id` bigint DEFAULT NULL COMMENT '产生本快照的评审记录ID',
  `conclusion` varchar(16) DEFAULT NULL COMMENT '评审结论: passed/rejected',
  `conclusion_desc` varchar(512) DEFAULT NULL COMMENT '评审意见摘要',
  `reviewer_ids` varchar(255) DEFAULT NULL COMMENT '评审参与人ID列表（逗号分隔）',
  `snapshot_time` datetime DEFAULT NULL COMMENT '定稿时间',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除（快照本身不可改，只允许逻辑标记）',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_prd_snapshot_prd` (`prd_id`,`snapshot_time`),
  KEY `idx_rdm_prd_snapshot_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-PRD定稿快照（评审通过即冻结一版，改内容必须走新版本）';

DROP TABLE IF EXISTS `rdm_project`;
CREATE TABLE `rdm_project` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `project_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目编号',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目名称',
  `objective` text COLLATE utf8mb4_unicode_ci COMMENT '项目目标',
  `pm_user_id` bigint DEFAULT NULL COMMENT '项目经理用户ID',
  `pm_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '项目经理姓名',
  `product_owner_user_id` bigint DEFAULT NULL COMMENT '产品负责人用户ID',
  `product_owner_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品负责人姓名',
  `tech_lead_user_id` bigint DEFAULT NULL COMMENT '技术负责人用户ID',
  `tech_lead_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '技术负责人姓名快照',
  `ui_designer_user_id` bigint DEFAULT NULL COMMENT 'UI设计负责人用户ID',
  `ui_designer_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UI设计负责人姓名快照',
  `qa_lead_user_id` bigint DEFAULT NULL COMMENT '测试/QA负责人用户ID',
  `qa_lead_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '测试/QA负责人姓名快照',
  `ops_lead_user_id` bigint DEFAULT NULL COMMENT '运维/DevOps负责人用户ID',
  `ops_lead_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '运维/DevOps负责人姓名快照',
  `plan_start_date` date DEFAULT NULL COMMENT '计划开始日期',
  `plan_end_date` date DEFAULT NULL COMMENT '计划结束日期',
  `default_acceptance_path` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'A' COMMENT '默认验收路径(A=先验收后上线,B=先上线后验收)',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'preparing' COMMENT '状态:preparing/in_progress/partial_delivered/all_delivered/closed',
  `paused_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '暂停标记',
  `risk_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '风险标记',
  `overdue_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '逾期标记',
  `scope_summary_json` json DEFAULT NULL COMMENT '范围摘要JSON',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后更新人姓名快照',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_project_no` (`project_no`),
  KEY `idx_pm_user` (`pm_user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM项目';

DROP TABLE IF EXISTS `rdm_project_member`;
CREATE TABLE `rdm_project_member` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `project_id` bigint NOT NULL COMMENT '项目ID',
  `user_id` bigint NOT NULL COMMENT '用户ID',
  `emp_no` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '工号',
  `user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '姓名',
  `role_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色:pm/product/dev_lead/dev/qa/designer/pmo',
  `join_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `leave_time` datetime DEFAULT NULL COMMENT '离开时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_project_user_role` (`project_id`,`user_id`,`role_code`),
  KEY `idx_project` (`project_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM项目成员';

DROP TABLE IF EXISTS `rdm_release`;
CREATE TABLE `rdm_release` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `release_no` varchar(32) NOT NULL COMMENT '放行单号',
  `req_id` bigint NOT NULL COMMENT '需求ID rdm_requirement.id',
  `round_no` int NOT NULL DEFAULT '1' COMMENT '第几次放行（返工后再上线时递增，历史不覆盖）',
  `env` varchar(16) NOT NULL DEFAULT 'prod' COMMENT '目标环境: prod/pre/uat',
  `version_no` varchar(64) DEFAULT NULL COMMENT '发布版本号/迭代号（与需求 version_no 对齐）',
  `plan_time` datetime DEFAULT NULL COMMENT '计划上线时间',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/passed/rejected/revoked',
  `checks_json` text COMMENT '检查项结果快照（JSON 数组：code/label/passed/skipped/reason）',
  `blocking_count` int NOT NULL DEFAULT '0' COMMENT '未通过且未豁免的检查项数',
  `summary` varchar(512) DEFAULT NULL COMMENT '放行说明（驳回原因/豁免理由写在这里）',
  `applicant_user_id` bigint DEFAULT NULL COMMENT '发起人 sys_user.id（通常 PM）',
  `applicant_emp_no` varchar(32) DEFAULT NULL COMMENT '发起人工号快照',
  `applicant_name` varchar(64) DEFAULT NULL COMMENT '发起人姓名快照',
  `apply_time` datetime DEFAULT NULL COMMENT '发起时间',
  `gate_user_id` bigint DEFAULT NULL COMMENT '放行人 sys_user.id',
  `gate_emp_no` varchar(32) DEFAULT NULL COMMENT '放行人工号快照',
  `gate_name` varchar(64) DEFAULT NULL COMMENT '放行人姓名快照',
  `decide_time` datetime DEFAULT NULL COMMENT '放行动作时间',
  `expire_at` datetime DEFAULT NULL COMMENT '放行有效期（过期须重新过闸，避免"一次放行管 forever"）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_release_no` (`release_no`),
  KEY `idx_rdm_release_req` (`req_id`,`status`,`round_no`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-发布放行单（上线前质量闸门的事实记录，含检查项快照与放行人）';

DROP TABLE IF EXISTS `rdm_release_approval`;
CREATE TABLE `rdm_release_approval` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `release_batch_id` bigint NOT NULL,
  `application_version` int NOT NULL COMMENT '申请时批次并发版本，非范围版本',
  `action` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'apply/decide',
  `decision` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `snapshot_json` json NOT NULL,
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `operator_user_id` bigint NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_release_approval` (`release_batch_id`,`application_version`,`action`),
  CONSTRAINT `fk_rdm_approval_batch` FOREIGN KEY (`release_batch_id`) REFERENCES `rdm_release_batch` (`id`),
  CONSTRAINT `ck_rdm_approval_action` CHECK ((`action` in (_utf8mb4'apply',_utf8mb4'decide'))),
  CONSTRAINT `ck_rdm_approval_decision` CHECK ((((`action` = _utf8mb4'apply') and (`decision` is null)) or ((`action` = _utf8mb4'decide') and (`decision` is not null) and (`decision` in (_utf8mb4'approved',_utf8mb4'rejected')))))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式发布申请裁决事实';

DROP TABLE IF EXISTS `rdm_release_attempt`;
CREATE TABLE `rdm_release_attempt` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `release_batch_id` bigint NOT NULL,
  `deployment_id` bigint NOT NULL COMMENT '复用逐系统部署清单',
  `attempt_no` int NOT NULL,
  `action` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'deploy/verify/open/rollback',
  `result` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `test_env` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `approval_id` bigint NOT NULL,
  `scope_snapshot_json` json NOT NULL,
  `evidence_json` json NOT NULL,
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `operator_user_id` bigint NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `occurred_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_release_attempt` (`deployment_id`,`action`,`attempt_no`),
  KEY `idx_rdm_attempt_batch` (`release_batch_id`,`created_at`),
  KEY `fk_rdm_attempt_approval` (`approval_id`),
  CONSTRAINT `fk_rdm_attempt_approval` FOREIGN KEY (`approval_id`) REFERENCES `rdm_release_approval` (`id`),
  CONSTRAINT `fk_rdm_attempt_batch` FOREIGN KEY (`release_batch_id`) REFERENCES `rdm_release_batch` (`id`),
  CONSTRAINT `fk_rdm_attempt_deployment` FOREIGN KEY (`deployment_id`) REFERENCES `rdm_release_deployment` (`id`),
  CONSTRAINT `ck_rdm_attempt_action` CHECK ((`action` in (_utf8mb4'deploy',_utf8mb4'verify',_utf8mb4'open',_utf8mb4'rollback'))),
  CONSTRAINT `ck_rdm_attempt_no` CHECK ((`attempt_no` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式部署验证开放回滚事实';

DROP TABLE IF EXISTS `rdm_release_batch`;
CREATE TABLE `rdm_release_batch` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `batch_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发布批次号',
  `version_tag` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本标识',
  `req_id` bigint DEFAULT NULL COMMENT '关联需求ID(主需求)',
  `project_id` bigint DEFAULT NULL COMMENT '关联项目ID',
  `scope_snapshot_json` json DEFAULT NULL COMMENT '范围快照',
  `release_owner_user_id` bigint DEFAULT NULL COMMENT '发布负责人ID',
  `release_owner_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发布负责人姓名',
  `plan_time` datetime DEFAULT NULL COMMENT '计划发布时间',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planning' COMMENT '状态:planning/checking/approved/deploying/verifying/released/rolled_back/cancelled',
  `approval_user_id` bigint DEFAULT NULL COMMENT '审批人ID',
  `approval_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批人姓名',
  `approval_time` datetime DEFAULT NULL COMMENT '审批时间',
  `applicant_user_id` bigint DEFAULT NULL COMMENT '申请人ID',
  `applicant_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '申请人姓名',
  `rollback_reason` text COLLATE utf8mb4_unicode_ci COMMENT '回滚原因',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `version` int NOT NULL DEFAULT '0',
  `application_version` int DEFAULT NULL,
  `application_snapshot_json` json DEFAULT NULL,
  `approval_snapshot_json` json DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `approval_evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `approval_expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  KEY `idx_project` (`project_id`),
  KEY `idx_status` (`status`),
  KEY `idx_release_owner` (`release_owner_user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM发布批次';

DROP TABLE IF EXISTS `rdm_release_deployment`;
CREATE TABLE `rdm_release_deployment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `release_batch_id` bigint NOT NULL COMMENT '发布批次ID',
  `system_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '系统编码',
  `system_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '系统名称',
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '构建标识',
  `deploy_order` int NOT NULL DEFAULT '1' COMMENT '部署顺序',
  `deploy_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '部署状态:pending/deploying/success/failed/rolled_back',
  `deploy_time` datetime DEFAULT NULL COMMENT '部署时间',
  `verify_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '验证状态:pending/passed/failed',
  `verify_time` datetime DEFAULT NULL COMMENT '验证时间',
  `open_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '开放状态:pending/opened/not_opened',
  `open_time` datetime DEFAULT NULL COMMENT '开放时间',
  `rollback_reason` text COLLATE utf8mb4_unicode_ci COMMENT '回滚原因',
  `attempt_no` int NOT NULL DEFAULT '1' COMMENT '尝试次数',
  `operator_user_id` bigint DEFAULT NULL COMMENT '操作人ID',
  `operator_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作人姓名',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_release_batch` (`release_batch_id`),
  KEY `idx_system` (`system_code`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM发布部署记录';

DROP TABLE IF EXISTS `rdm_release_exemption`;
CREATE TABLE `rdm_release_exemption` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `release_batch_id` bigint NOT NULL,
  `application_version` int NOT NULL,
  `applicant_user_id` bigint NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `risk` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `missing_acceptance_json` json NOT NULL,
  `scope_snapshot_json` json NOT NULL,
  `build_mapping_json` json NOT NULL,
  `rollback_plan` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplementary_plan_json` json NOT NULL COMMENT '交付项+产品补验人+冻结截止时间+日历版本',
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_exemption_application` (`release_batch_id`,`application_version`),
  CONSTRAINT `fk_rdm_exemption_batch` FOREIGN KEY (`release_batch_id`) REFERENCES `rdm_release_batch` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可变紧急产品豁免申请';

DROP TABLE IF EXISTS `rdm_release_exemption_decision`;
CREATE TABLE `rdm_release_exemption_decision` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `exemption_id` bigint NOT NULL,
  `decision_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'product_risk/release',
  `decision` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `signer_user_id` bigint NOT NULL,
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_exemption_decision` (`exemption_id`,`decision_type`),
  CONSTRAINT `fk_rdm_exemption_decision` FOREIGN KEY (`exemption_id`) REFERENCES `rdm_release_exemption` (`id`),
  CONSTRAINT `ck_rdm_exemption_decision` CHECK ((`decision` in (_utf8mb4'approved',_utf8mb4'rejected'))),
  CONSTRAINT `ck_rdm_exemption_decision_type` CHECK ((`decision_type` in (_utf8mb4'product_risk',_utf8mb4'release')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM追加式产品风险确认和独立发布审批';

DROP TABLE IF EXISTS `rdm_requirement`;
CREATE TABLE `rdm_requirement` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_no` varchar(32) DEFAULT NULL COMMENT '需求编号 XQ+YYYYMMDD+4位；仅首次准入成功（审批全通过或免审批）时生成，准入前为 NULL',
  `title` varchar(200) NOT NULL COMMENT '需求标题',
  `req_type` varchar(32) NOT NULL COMMENT '需求类型: NEW_MENU/NEW_FEATURE/OPTIMIZE/BUG/DATA/POLICY/INTEGRATION/OTHER',
  `priority` varchar(16) NOT NULL DEFAULT 'P2' COMMENT '优先级: P0/P1/P2/P3',
  `complexity` varchar(16) DEFAULT NULL COMMENT '规模: SIMPLE/MEDIUM/COMPLEX/HUGE（产品评估后回填）',
  `description` text COMMENT '现状与痛点',
  `expect_result` text COMMENT '期望结果（验收检查项来源）',
  `business_value` varchar(1000) DEFAULT NULL COMMENT '业务价值',
  `expect_date` date DEFAULT NULL COMMENT '业务期望完成日期',
  `submitter_user_id` bigint NOT NULL COMMENT '提出人 sys_user.id',
  `submitter_emp_no` varchar(32) DEFAULT NULL COMMENT '提出人工号快照',
  `submitter_name` varchar(64) NOT NULL COMMENT '提出人姓名快照',
  `submit_dept_id` bigint DEFAULT NULL COMMENT '提出部门ID快照',
  `submit_dept_name` varchar(128) DEFAULT NULL COMMENT '提出部门名称快照',
  `submit_time` datetime DEFAULT NULL COMMENT '提交时间（草稿为空，进入待审批时写入）',
  `need_approval` tinyint NOT NULL DEFAULT '1' COMMENT '是否需要准入审批: 1=需要 0=免审（按路由规则判定）',
  `intake_flow_no` varchar(64) DEFAULT NULL COMMENT '关联 OA 准入流程编号',
  `intake_round_no` int DEFAULT NULL COMMENT '当前准入轮次序号（0/空=未发起过）',
  `intake_policy_id` bigint DEFAULT NULL COMMENT '本轮命中的准入策略ID，空=内置默认策略',
  `intake_policy_name` varchar(128) DEFAULT NULL COMMENT '命中策略名称快照',
  `intake_policy_version` varchar(16) DEFAULT NULL COMMENT '命中策略版本快照（规则改了不影响在途单）',
  `intake_mode` varchar(16) DEFAULT NULL COMMENT '本轮准入裁决: APPROVE/FORCE_APPROVE/EXEMPT',
  `intake_explain` text COMMENT '命中链路说明（为什么免审/为什么要审）',
  `dispatcher_user_id` bigint DEFAULT NULL COMMENT '分发人（技术负责人）ID',
  `dispatcher_name` varchar(64) DEFAULT NULL COMMENT '分发人姓名',
  `distribute_time` datetime DEFAULT NULL COMMENT '分配时间',
  `assignee_pm_user_id` bigint DEFAULT NULL COMMENT '产品经理 sys_user.id',
  `assignee_pm_emp_no` varchar(32) DEFAULT NULL COMMENT '产品经理工号快照',
  `assignee_pm_name` varchar(64) DEFAULT NULL COMMENT '产品经理姓名快照',
  `project_manager_user_id` bigint DEFAULT NULL COMMENT '项目经理ID（需求级，未绑项目时使用）',
  `project_manager_user_name` varchar(64) DEFAULT NULL COMMENT '项目经理姓名快照',
  `intent_pm_user_id` bigint DEFAULT NULL COMMENT '提交时指定的产品经理ID（意向，需审时审批通过后再生效）',
  `intent_pm_name` varchar(64) DEFAULT NULL COMMENT '指定产品经理姓名快照',
  `accept_time` datetime DEFAULT NULL COMMENT '产品受理时间',
  `promised_prd_date` date DEFAULT NULL COMMENT '承诺出 PRD 日期',
  `dev_owner_user_id` bigint DEFAULT NULL COMMENT '研发负责人ID',
  `dev_owner_name` varchar(64) DEFAULT NULL COMMENT '研发负责人姓名',
  `iteration_code` varchar(32) DEFAULT NULL COMMENT '迭代/版本排期标识',
  `plan_dev_date` date DEFAULT NULL COMMENT '计划开发完成日期',
  `plan_release_date` date DEFAULT NULL COMMENT '计划上线日期',
  `actual_release_date` date DEFAULT NULL COMMENT '实际上线日期',
  `version_no` varchar(32) DEFAULT NULL COMMENT '关联发布版本 sys_version_history.version_no',
  `external_no` varchar(64) DEFAULT NULL COMMENT '外部来源编号（云效工作项编号），仅记录用于回查',
  `external_source` varchar(32) DEFAULT NULL COMMENT '外部来源: YUNXIAO',
  `status` varchar(32) NOT NULL DEFAULT 'draft' COMMENT '当前状态（见 rdm_status_def）',
  `status_enter_time` datetime DEFAULT NULL COMMENT '进入当前状态时间（停留时长计算基准）',
  `progress` int NOT NULL DEFAULT '0' COMMENT '研发进度百分比 0-100',
  `blocked_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否阻塞: 1=阻塞中',
  `blocked_reason` varchar(500) DEFAULT NULL COMMENT '阻塞原因与依赖方',
  `overdue_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否逾期（SLA 扫描写入）',
  `flow_version` int NOT NULL DEFAULT '1' COMMENT '流程版本: 1=历史记录(无五节点计/定稿快照/工时明细), 2=新链路',
  `on_hold_until` date DEFAULT NULL COMMENT '挂起复审日期',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '最近一次驳回理由',
  `reject_count` int NOT NULL DEFAULT '0' COMMENT '累计驳回次数（准入驳回+产品驳回+验收退回）',
  `reopen_count` int NOT NULL DEFAULT '0' COMMENT '重开次数',
  `rework_count` int NOT NULL DEFAULT '0' COMMENT '验收退回返工次数',
  `change_count` int NOT NULL DEFAULT '0' COMMENT '需求变更次数',
  `acceptor_user_id` bigint DEFAULT NULL COMMENT '业务验收人ID',
  `acceptor_name` varchar(64) DEFAULT NULL COMMENT '业务验收人姓名',
  `acceptance_result` varchar(16) DEFAULT NULL COMMENT '验收结论: pass/conditional/fail',
  `acceptance_score` tinyint DEFAULT NULL COMMENT '交付满意度 1-5',
  `acceptance_time` datetime DEFAULT NULL COMMENT '验收时间',
  `current_handler_name` varchar(64) DEFAULT NULL COMMENT '当前处理人（列表/待办展示与筛选冗余）',
  `source_channel` varchar(16) NOT NULL DEFAULT 'WEB' COMMENT '来源渠道: WEB/MOBILE/DINGTALK/AI',
  `parent_req_id` bigint DEFAULT NULL COMMENT '衍生来源需求ID(验收遗留转后续需求)',
  `parent_req_no` varchar(32) DEFAULT NULL COMMENT '衍生来源需求编号快照',
  `project_id` bigint DEFAULT NULL COMMENT '所属项目ID',
  `structure_parent_req_id` bigint DEFAULT NULL COMMENT '结构父需求ID(主子关系)',
  `requirement_kind` varchar(16) NOT NULL DEFAULT 'execution' COMMENT '需求种类:aggregate/execution',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_req_no` (`req_no`),
  UNIQUE KEY `uk_rdm_req_external` (`external_source`,`external_no`),
  KEY `idx_rdm_req_status` (`status`,`plan_release_date`),
  KEY `idx_rdm_req_submitter` (`submitter_user_id`,`status`),
  KEY `idx_rdm_req_pm` (`assignee_pm_user_id`,`status`),
  KEY `idx_rdm_req_dept` (`submit_dept_id`,`status`),
  KEY `idx_rdm_req_flow` (`intake_flow_no`),
  KEY `idx_rdm_req_submit` (`submit_time`),
  KEY `idx_rdm_requirement_version` (`version_no`,`status`),
  KEY `idx_project` (`project_id`),
  KEY `idx_structure_parent` (`structure_parent_req_id`),
  CONSTRAINT `ck_rdm_req_no_admitted` CHECK (((`status` in (_utf8mb4'assigned',_utf8mb4'draft',_utf8mb4'intake_pending',_utf8mb4'intake_rejected',_utf8mb4'pool')) or (`req_no` is not null))),
  CONSTRAINT `ck_rdm_req_no_blank` CHECK (((`req_no` is null) or (char_length(trim(`req_no`)) > 0)))
) ENGINE=InnoDB AUTO_INCREMENT=127 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-业务需求主表（需求全生命周期单据）';

DROP TABLE IF EXISTS `rdm_requirement_role`;
CREATE TABLE `rdm_requirement_role` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID',
  `user_id` bigint NOT NULL COMMENT '成员 sys_user.id',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照',
  `emp_name` varchar(64) NOT NULL COMMENT '姓名快照',
  `role_code` varchar(32) NOT NULL COMMENT '角色: SUBMITTER/DEPT_LEADER/APPROVER/DISPATCHER/PM/PMO/DEV_LEAD/DEV/DESIGNER/QA/ACCEPTOR/CC',
  `is_active` tinyint NOT NULL DEFAULT '1' COMMENT '是否有效参与人',
  `join_time` datetime DEFAULT NULL COMMENT '加入时间',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_role` (`req_id`,`user_id`,`role_code`),
  KEY `idx_rdm_role_user` (`user_id`,`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=302 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求参与角色（同一需求多人多角色）';

DROP TABLE IF EXISTS `rdm_requirement_target`;
CREATE TABLE `rdm_requirement_target` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID rdm_requirement.id',
  `system_code` varchar(32) DEFAULT NULL COMMENT '业务系统编码 sys_system.code',
  `system_name` varchar(64) DEFAULT NULL COMMENT '系统名称快照',
  `menu_key` varchar(64) DEFAULT NULL COMMENT '菜单标识 sys_menu.menu_key',
  `menu_name` varchar(64) DEFAULT NULL COMMENT '菜单名称快照',
  `page_path` varchar(128) DEFAULT NULL COMMENT '页面路由路径',
  `anchor_type` varchar(32) NOT NULL DEFAULT 'NONE' COMMENT '定位粒度: NONE/SYSTEM/MENU/PAGE/FUNCTION/FIELD/BUTTON/REPORT',
  `anchor_name` varchar(128) DEFAULT NULL COMMENT '定位对象名称（按钮/字段/功能点名）',
  `anchor_desc` varchar(1000) DEFAULT NULL COMMENT '定位补充说明',
  `screenshot_path` mediumtext COMMENT '現狀截圖（存储路径或 Base64 Data URL）',
  `annotation_json` text COMMENT '圈选标注数据 JSON',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_target_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-需求关联对象（改现有菜单/功能时精确定位）';

DROP TABLE IF EXISTS `rdm_resource_member`;
CREATE TABLE `rdm_resource_member` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '员工 sys_user.id',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '工号快照',
  `user_name` varchar(64) DEFAULT NULL COMMENT '姓名快照',
  `dept` varchar(128) DEFAULT NULL COMMENT '部门快照',
  `role_codes` varchar(255) DEFAULT NULL COMMENT '岗位角色JSON数组:pm/product/dev/designer/qa/ops/pmo',
  `weekly_capacity_hours` decimal(5,2) DEFAULT NULL COMMENT '每周默认容量(人时);空则按工作日8h推算',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=纳入名册 0=移出',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除(兜底;正常用status移出)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rrm_user` (`user_id`),
  KEY `idx_rrm_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM资源名册(团队负载纳入人员)';

DROP TABLE IF EXISTS `rdm_resource_plan`;
CREATE TABLE `rdm_resource_plan` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '承担人 sys_user.id',
  `source_type` varchar(16) NOT NULL COMMENT '来源:work_task/requirement/test_batch/project/coordination',
  `source_id` bigint NOT NULL COMMENT '来源单据主键',
  `work_task_id` bigint DEFAULT NULL COMMENT '来源为任务时的 rdm_work_task.id;UNIQUE 防重复计时',
  `role_code` varchar(16) DEFAULT NULL COMMENT '岗位/阶段',
  `plan_hours` decimal(7,2) DEFAULT NULL COMMENT '计划工时',
  `remaining_hours` decimal(7,2) DEFAULT NULL COMMENT '负责人确认的剩余工时',
  `plan_start_date` date DEFAULT NULL COMMENT '计划开始',
  `plan_end_date` date DEFAULT NULL COMMENT '计划完成',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/done/cancelled',
  `confirmed_by` varchar(64) DEFAULT NULL COMMENT '剩余工时确认人快照',
  `confirmed_at` datetime DEFAULT NULL COMMENT '确认时间',
  `version` int NOT NULL DEFAULT '0' COMMENT '乐观锁版本',
  `created_by` varchar(64) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rrp_work_task` (`work_task_id`),
  KEY `idx_rrp_user_status` (`user_id`,`status`,`deleted`),
  KEY `idx_rrp_source` (`source_type`,`source_id`),
  CONSTRAINT `ck_rrp_plan_hours` CHECK (((`plan_hours` is null) or (`plan_hours` >= 0))),
  CONSTRAINT `ck_rrp_remaining` CHECK (((`remaining_hours` is null) or (`remaining_hours` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM个人工作计划';

DROP TABLE IF EXISTS `rdm_resource_plan_log`;
CREATE TABLE `rdm_resource_plan_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `plan_id` bigint DEFAULT NULL COMMENT '关联 rdm_resource_plan.id',
  `user_id` bigint NOT NULL COMMENT '被计划承担人',
  `source_type` varchar(16) NOT NULL,
  `source_id` bigint NOT NULL,
  `action` varchar(32) NOT NULL COMMENT 'create/update/reassign/dispatch/cancel',
  `operator_id` bigint NOT NULL,
  `operator_name` varchar(64) DEFAULT NULL,
  `old_value` varchar(512) DEFAULT NULL,
  `new_value` varchar(512) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `client_request_id` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rrpl_plan` (`plan_id`),
  KEY `idx_rrpl_source` (`source_type`,`source_id`),
  KEY `idx_rrpl_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM个人计划调整/改派审计(只追加)';

DROP TABLE IF EXISTS `rdm_review`;
CREATE TABLE `rdm_review` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `review_no` varchar(32) NOT NULL COMMENT '評審編號 RV+YYYYMMDD+4位',
  `req_id` bigint NOT NULL COMMENT '業務需求ID',
  `prd_id` bigint DEFAULT NULL COMMENT '被評審的 PRD（需求级评审可空）',
  `review_type` varchar(24) NOT NULL COMMENT '評審類型: requirement/dev/ui/test',
  `review_time` datetime DEFAULT NULL COMMENT '評審時間',
  `participants` varchar(1000) DEFAULT NULL COMMENT '參與人（逗號分隔姓名，便於展示）',
  `participant_ids` varchar(500) DEFAULT NULL COMMENT '參與人ID列表（逗號分隔，通知用）',
  `conclusion` varchar(24) NOT NULL DEFAULT 'pending' COMMENT '結論: pending/passed/rejected',
  `conclusion_desc` varchar(1000) DEFAULT NULL COMMENT '結論說明',
  `affects_schedule_flag` tinyint NOT NULL DEFAULT '0' COMMENT '結論是否影響排期（需回填計劃時間）',
  `attachment_ids` varchar(500) DEFAULT NULL COMMENT '附件ID列表',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_review_no` (`review_no`),
  KEY `idx_rdm_review_req` (`req_id`,`review_type`),
  KEY `idx_rdm_review_prd` (`prd_id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-评审记录（需求/研发/UI/测试）';

DROP TABLE IF EXISTS `rdm_routing_rule`;
CREATE TABLE `rdm_routing_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `scope_type` varchar(16) NOT NULL COMMENT '匹配范围: SYSTEM/MENU/DEPT/TYPE',
  `scope_value` varchar(64) NOT NULL COMMENT '范围取值（系统编码/菜单key/部门ID/需求类型）',
  `scope_name` varchar(128) NOT NULL COMMENT '范围名称快照（展示用）',
  `pm_user_id` bigint NOT NULL COMMENT '负责产品经理 sys_user.id',
  `pm_name` varchar(64) NOT NULL COMMENT '产品经理姓名快照',
  `backup_pm_user_id` bigint DEFAULT NULL COMMENT '备用产品经理ID',
  `backup_pm_name` varchar(64) DEFAULT NULL COMMENT '备用产品经理姓名',
  `load_capacity` int NOT NULL DEFAULT '8' COMMENT '在途需求容量上限',
  `priority` int NOT NULL DEFAULT '0' COMMENT '命中优先级（越小越优先）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '启用: 1=启用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_routing` (`scope_type`,`scope_value`,`pm_user_id`),
  KEY `idx_rdm_routing_priority` (`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-分发矩阵（自动推荐对口产品经理）';

DROP TABLE IF EXISTS `rdm_score_budget`;
CREATE TABLE `rdm_score_budget` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `period_code` varchar(32) NOT NULL COMMENT '绩效周期编码 hr_perf_cycle.code',
  `dept_id` bigint NOT NULL DEFAULT '0' COMMENT '部门ID，0=全员预算（兜底口径）',
  `dept_name` varchar(128) DEFAULT NULL COMMENT '部门名称快照',
  `score_budget` decimal(12,2) NOT NULL COMMENT '本周期该部门可分配的贡献分预算上限',
  `warning_ratio` decimal(5,2) NOT NULL DEFAULT '80.00' COMMENT '预警阈值（预算占用达到该百分比时提示 PMO）',
  `remark` varchar(500) DEFAULT NULL COMMENT '预算依据（人力/迭代容量/历史均值等）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_score_budget` (`period_code`,`dept_id`),
  KEY `idx_rdm_score_budget_period` (`period_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-贡献分预算（周期×部门上限与预警阈值，只预警不折算）';

DROP TABLE IF EXISTS `rdm_score_record`;
CREATE TABLE `rdm_score_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '業務需求ID',
  `user_id` bigint NOT NULL COMMENT '得分人ID',
  `emp_no` varchar(32) DEFAULT NULL COMMENT '得分人工號快照',
  `user_name` varchar(64) DEFAULT NULL COMMENT '得分人姓名快照',
  `dept_id` bigint DEFAULT NULL COMMENT '得分人部門ID快照',
  `dept_name` varchar(64) DEFAULT NULL COMMENT '得分人部門名稱快照',
  `role_code` varchar(32) NOT NULL COMMENT '計分角色（PM/DEV_LEAD/DEV/DESIGNER/QA/PMO/DISPATCHER）',
  `period_code` varchar(32) DEFAULT NULL COMMENT '績效周期編碼（對應 hr_perf_cycle.code）',
  `score` decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '最終得分',
  `base_score` decimal(8,2) DEFAULT NULL COMMENT '基準分（複雜度×單位分）',
  `type_factor` decimal(5,2) DEFAULT NULL COMMENT '類型係數',
  `priority_factor` decimal(5,2) DEFAULT NULL COMMENT '優先級係數',
  `on_time_factor` decimal(5,2) DEFAULT NULL COMMENT '按時因子',
  `quality_factor` decimal(5,2) DEFAULT NULL COMMENT '質量因子',
  `role_factor` decimal(5,2) DEFAULT NULL COMMENT '角色係數',
  `breakdown_json` text COMMENT '成因明細JSON（績效申訴復算依據）',
  `rule_version` int DEFAULT NULL COMMENT '命中的規則版本（歷史不可變）',
  `complexity` varchar(16) DEFAULT NULL COMMENT '需求複雜度快照',
  `req_type` varchar(24) DEFAULT NULL COMMENT '需求類型快照',
  `priority` varchar(8) DEFAULT NULL COMMENT '需求優先級快照',
  `on_time` tinyint NOT NULL DEFAULT '1' COMMENT '是否按時上線',
  `late_days` int DEFAULT NULL COMMENT '逾期天數',
  `rework_count` int DEFAULT NULL COMMENT '驗收返工次數快照',
  `acceptance_score` tinyint DEFAULT NULL COMMENT '驗收滿意度快照',
  `first_pass` tinyint DEFAULT NULL COMMENT '驗收是否一次通過',
  `push_status` varchar(16) NOT NULL DEFAULT 'none' COMMENT '績效推送狀態: none/suggested/confirmed/rejected',
  `pushed_at` datetime DEFAULT NULL COMMENT '推送時間',
  `calculated_at` datetime DEFAULT NULL COMMENT '計算時間',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_score_owner` (`req_id`,`user_id`,`role_code`,`period_code`),
  KEY `idx_rdm_score_period_user` (`period_code`,`user_id`),
  KEY `idx_rdm_score_dept` (`period_code`,`dept_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-产出积分流水';

DROP TABLE IF EXISTS `rdm_score_rule`;
CREATE TABLE `rdm_score_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `rule_code` varchar(32) NOT NULL COMMENT '規則編碼，如 BASE',
  `req_type` varchar(24) DEFAULT NULL COMMENT '適用需求類型，NULL=全部',
  `role_code` varchar(32) DEFAULT NULL COMMENT '適用角色，NULL=全部計分角色',
  `complexity_weight` decimal(5,2) DEFAULT NULL COMMENT '複雜度權重覆蓋，NULL=按默認表',
  `type_factor` decimal(5,2) DEFAULT NULL COMMENT '類型係數覆蓋，NULL=按默認表',
  `priority_bonus` decimal(5,2) DEFAULT NULL COMMENT '優先級加分（係數增量）',
  `on_time_bonus` decimal(5,2) NOT NULL DEFAULT '0.10' COMMENT '按時交付加分',
  `late_penalty` decimal(5,2) NOT NULL DEFAULT '0.30' COMMENT '逾期扣分上限',
  `first_pass_bonus` decimal(5,2) NOT NULL DEFAULT '0.10' COMMENT '驗收一次通過加分',
  `rework_penalty` decimal(5,2) NOT NULL DEFAULT '0.10' COMMENT '每次驗收返工扣分',
  `reopen_penalty` decimal(5,2) NOT NULL DEFAULT '0.05' COMMENT '每次駁回重開扣分',
  `acceptance_factor` decimal(5,3) NOT NULL DEFAULT '0.060' COMMENT '滿意度係數（偏離3分部分）',
  `quality_floor` decimal(5,2) NOT NULL DEFAULT '0.60' COMMENT '質量因子下限（防分数被抹平）',
  `role_factor` decimal(5,2) DEFAULT NULL COMMENT '角色係數覆蓋，NULL=按默認表',
  `unit_score` decimal(6,1) NOT NULL DEFAULT '10.0' COMMENT '單位分',
  `alloc_mode` varchar(16) NOT NULL DEFAULT 'each' COMMENT '分配模式: each(各角色分别计分)/split(总额按角色瓜分)',
  `max_scorable_roles` int NOT NULL DEFAULT '6' COMMENT '单条需求计分角色上限，超出需PMO确认留痕',
  `version` int NOT NULL DEFAULT '1' COMMENT '規則版本，同碼唯一',
  `effective_from` date DEFAULT NULL COMMENT '生效日期',
  `enabled` tinyint NOT NULL DEFAULT '0' COMMENT '是否当前生效（同一时刻只应有一条）',
  `remark` varchar(500) DEFAULT NULL COMMENT '說明',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_score_rule` (`rule_code`,`version`),
  KEY `idx_rdm_score_rule_enabled` (`enabled`,`effective_from`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-产出积分规则（版本化）';

DROP TABLE IF EXISTS `rdm_sla_config`;
CREATE TABLE `rdm_sla_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `status_code` varchar(32) NOT NULL COMMENT '环节状态编码',
  `priority` varchar(16) NOT NULL DEFAULT '' COMMENT '适用优先级，空=全部',
  `sla_hours` int NOT NULL COMMENT '标准时效（小时）',
  `warn_hours` int NOT NULL COMMENT '预警阈值（小时）',
  `escalate_role` varchar(32) NOT NULL DEFAULT 'PM' COMMENT '逾期升级通知角色',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '启用: 1=启用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_sla` (`status_code`,`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-SLA 时效与逾期升级配置';

DROP TABLE IF EXISTS `rdm_status_def`;
CREATE TABLE `rdm_status_def` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` varchar(32) NOT NULL COMMENT '状态编码',
  `label` varchar(64) NOT NULL COMMENT '状态名称',
  `stage` varchar(32) NOT NULL COMMENT '所属阶段: submit/intake/dispatch/product/delivery/acceptance',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `final_flag` tinyint NOT NULL DEFAULT '0' COMMENT '是否终态',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '启用: 1=启用 0=停用',
  `remark` varchar(255) DEFAULT NULL COMMENT '说明',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_status_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-状态定义';

DROP TABLE IF EXISTS `rdm_status_log`;
CREATE TABLE `rdm_status_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '需求ID',
  `from_status` varchar(32) DEFAULT NULL COMMENT '变更前状态',
  `to_status` varchar(32) NOT NULL COMMENT '变更后状态',
  `action_code` varchar(32) DEFAULT NULL COMMENT '触发动作（见 rdm_transition）',
  `operator_user_id` bigint DEFAULT NULL COMMENT '操作人ID（姓名可重名，追责靠ID）',
  `operator_name` varchar(64) DEFAULT NULL COMMENT '操作人姓名快照',
  `operator_role` varchar(32) DEFAULT NULL COMMENT '操作人当时角色',
  `remark` varchar(1000) DEFAULT NULL COMMENT '说明/理由',
  `enter_time` datetime NOT NULL COMMENT '进入 to_status 时间',
  `leave_time` datetime DEFAULT NULL COMMENT '离开 to_status 时间（下一条流水写入时回填）',
  `duration_seconds` bigint DEFAULT NULL COMMENT '在 to_status 停留秒数（离开时回填）',
  `is_overdue` tinyint NOT NULL DEFAULT '0' COMMENT '该状态是否逾期离开',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_rdm_log_req` (`req_id`,`enter_time`),
  KEY `idx_rdm_log_status` (`to_status`)
) ENGINE=InnoDB AUTO_INCREMENT=257 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-状态流转流水（周期/瓶颈/逾期分析唯一数据源）';

DROP TABLE IF EXISTS `rdm_supplementary_verification`;
CREATE TABLE `rdm_supplementary_verification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `release_batch_id` bigint NOT NULL,
  `delivery_item_id` bigint NOT NULL,
  `scope_version` int NOT NULL,
  `build_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `verification_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'product/business',
  `exemption_id` bigint DEFAULT NULL,
  `verifier_user_id` bigint NOT NULL,
  `verifier_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deadline` datetime NOT NULL COMMENT '申请时用工作日历冻结，不动态顺延',
  `calendar_version` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `result` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acceptance_record_id` bigint DEFAULT NULL,
  `evidence_json` json DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` bigint DEFAULT NULL,
  `escalated` tinyint NOT NULL DEFAULT '0',
  `escalated_at` datetime DEFAULT NULL,
  `escalation_level` int NOT NULL DEFAULT '0',
  `version` int NOT NULL DEFAULT '0',
  `created_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_supplementary_scope` (`release_batch_id`,`delivery_item_id`,`scope_version`,`build_id`,`verification_type`),
  KEY `idx_rdm_supplementary_due` (`status`,`deadline`),
  KEY `fk_rdm_supplementary_item` (`delivery_item_id`),
  KEY `fk_rdm_supplementary_exemption` (`exemption_id`),
  KEY `fk_rdm_supplementary_acceptance` (`acceptance_record_id`),
  CONSTRAINT `fk_rdm_supplementary_acceptance` FOREIGN KEY (`acceptance_record_id`) REFERENCES `rdm_acceptance_record` (`id`),
  CONSTRAINT `fk_rdm_supplementary_batch` FOREIGN KEY (`release_batch_id`) REFERENCES `rdm_release_batch` (`id`),
  CONSTRAINT `fk_rdm_supplementary_exemption` FOREIGN KEY (`exemption_id`) REFERENCES `rdm_release_exemption` (`id`),
  CONSTRAINT `fk_rdm_supplementary_item` FOREIGN KEY (`delivery_item_id`) REFERENCES `rdm_delivery_item` (`id`),
  CONSTRAINT `ck_rdm_supplementary_completion` CHECK (((`status` not in (_utf8mb4'completed',_utf8mb4'failed')) or ((`completed_at` is not null) and (`completed_by` is not null) and (`acceptance_record_id` is not null) and (`evidence_json` is not null) and (`result` is not null) and (((`status` = _utf8mb4'completed') and (`result` = _utf8mb4'pass')) or ((`status` = _utf8mb4'failed') and (`result` = _utf8mb4'fail')))))),
  CONSTRAINT `ck_rdm_supplementary_status` CHECK ((`status` in (_utf8mb4'pending',_utf8mb4'completed',_utf8mb4'overdue',_utf8mb4'failed'))),
  CONSTRAINT `ck_rdm_supplementary_type` CHECK ((`verification_type` in (_utf8mb4'product',_utf8mb4'business'))),
  CONSTRAINT `ck_rdm_supplementary_version` CHECK (((`scope_version` > 0) and (`version` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM补验任务，补验签字引用验收事实';

DROP TABLE IF EXISTS `rdm_task_dependency`;
CREATE TABLE `rdm_task_dependency` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `req_id` bigint NOT NULL COMMENT '所属需求ID（两端任务必须同属该需求，跨需求依赖走需求关联）',
  `pred_task_id` bigint NOT NULL COMMENT '前驱任务ID rdm_work_task.id',
  `succ_task_id` bigint NOT NULL COMMENT '后继任务ID rdm_work_task.id',
  `dep_type` varchar(16) NOT NULL DEFAULT 'FS' COMMENT '依赖类型: FS完成-开始（首期只支持 FS）',
  `lag_days` int NOT NULL DEFAULT '0' COMMENT '延迟天数（FS 之后隔几个工作日才能开始，可为负）',
  `block_point` varchar(16) NOT NULL DEFAULT 'start' COMMENT '阻断点:start/test/release',
  `cross_delivery_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否跨交付项',
  `pred_delivery_item_id` bigint DEFAULT NULL COMMENT '前置交付项ID',
  `succ_delivery_item_id` bigint DEFAULT NULL COMMENT '后续交付项ID',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_task_dep` (`pred_task_id`,`succ_task_id`),
  KEY `idx_rdm_task_dep_req` (`req_id`),
  KEY `idx_rdm_task_dep_succ` (`succ_task_id`),
  KEY `idx_succ_delivery_item` (`succ_delivery_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-任务依赖（关键路径与甘特连线的边集，写入时做自环与环检测）';

DROP TABLE IF EXISTS `rdm_task_plan_log`;
CREATE TABLE `rdm_task_plan_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_id` bigint NOT NULL COMMENT '任务ID rdm_work_task.id',
  `task_no` varchar(32) DEFAULT NULL COMMENT '任务编号快照',
  `req_id` bigint NOT NULL COMMENT '需求ID(冗余便于追溯)',
  `user_id` bigint NOT NULL COMMENT '操作人 sys_user.id',
  `user_name` varchar(64) DEFAULT NULL COMMENT '操作人姓名快照',
  `old_start_date` date DEFAULT NULL COMMENT '原计划开始',
  `old_finish_date` date DEFAULT NULL COMMENT '原计划完成',
  `new_start_date` date DEFAULT NULL COMMENT '新计划开始',
  `new_finish_date` date DEFAULT NULL COMMENT '新计划完成',
  `old_version` int DEFAULT NULL COMMENT '变更前版本',
  `new_version` int DEFAULT NULL COMMENT '变更后版本',
  `client_request_id` varchar(64) DEFAULT NULL COMMENT '幂等请求标识',
  `remark` varchar(255) DEFAULT NULL COMMENT '变更说明(如:同步需求承诺出PRD日期)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
  PRIMARY KEY (`id`),
  KEY `idx_tpl_task` (`task_id`),
  KEY `idx_tpl_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM任务排期变更审计(只追加)';

DROP TABLE IF EXISTS `rdm_task_progress_log`;
CREATE TABLE `rdm_task_progress_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_id` bigint NOT NULL COMMENT '任务ID rdm_work_task.id',
  `task_no` varchar(32) DEFAULT NULL COMMENT '任务编号快照',
  `req_id` bigint NOT NULL COMMENT '需求ID(冗余便于追溯)',
  `user_id` bigint NOT NULL COMMENT '操作人 sys_user.id',
  `user_name` varchar(64) DEFAULT NULL COMMENT '操作人姓名快照',
  `old_progress` int DEFAULT NULL COMMENT '变更前进度',
  `new_progress` int DEFAULT NULL COMMENT '变更后进度',
  `old_status` varchar(32) DEFAULT NULL COMMENT '变更前状态',
  `new_status` varchar(32) DEFAULT NULL COMMENT '变更后状态',
  `remark` varchar(1000) DEFAULT NULL COMMENT '说明/完成交付说明',
  `client_request_id` varchar(64) DEFAULT NULL COMMENT '客户端请求标识',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
  PRIMARY KEY (`id`),
  KEY `idx_tplg_task` (`task_id`),
  KEY `idx_tplg_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM任务进度变更审计(只追加)';

DROP TABLE IF EXISTS `rdm_task_type_config`;
CREATE TABLE `rdm_task_type_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` varchar(32) NOT NULL COMMENT '稳定编码: design/frontend/app/backend/qa/data，扩展如 android/ios',
  `label` varchar(64) NOT NULL COMMENT '显示名（繁体）',
  `color` varchar(16) NOT NULL COMMENT '图例/标签色 #RRGGBB',
  `category` varchar(16) NOT NULL DEFAULT 'dev' COMMENT '聚合桶: design/qa/dev（默认 dev=研发）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序（升序）',
  `company_id` bigint DEFAULT NULL COMMENT '预留公司维度隔离，NULL=全局',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_task_type_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM 任务类型字典（业务可配置）';

DROP TABLE IF EXISTS `rdm_test_batch`;
CREATE TABLE `rdm_test_batch` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `batch_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '提测批次号',
  `req_id` bigint DEFAULT NULL COMMENT '关联需求ID',
  `delivery_item_ids_json` json DEFAULT NULL COMMENT '交付项ID列表',
  `scope_snapshot_json` json DEFAULT NULL COMMENT '范围快照',
  `build_ids_json` json DEFAULT NULL COMMENT '构建标识列表',
  `test_env` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'uat' COMMENT '测试环境',
  `test_lead_user_id` bigint DEFAULT NULL COMMENT '测试负责人ID',
  `test_lead_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '测试负责人姓名',
  `executor_user_ids_json` json DEFAULT NULL COMMENT '执行人ID列表',
  `plan_end_time` datetime DEFAULT NULL COMMENT '计划结束时间',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态:pending/accepted/returned/executing/passed/failed',
  `round_no` int NOT NULL DEFAULT '1' COMMENT '轮次',
  `returned_reason` text COLLATE utf8mb4_unicode_ci COMMENT '退回原因',
  `applicant_user_id` bigint DEFAULT NULL COMMENT '申请人ID',
  `applicant_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '申请人姓名',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `version` int NOT NULL DEFAULT '0' COMMENT '并发版本，不是轮次或范围版本',
  `case_snapshot_json` json DEFAULT NULL COMMENT '待接收用例草稿，已冻结事实以rdm_test_round为准',
  `build_mapping_json` json DEFAULT NULL COMMENT '待接收交付项系统构建映射',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  KEY `idx_req` (`req_id`),
  KEY `idx_test_lead` (`test_lead_user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM提测批次';

DROP TABLE IF EXISTS `rdm_test_execution`;
CREATE TABLE `rdm_test_execution` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `batch_id` bigint NOT NULL COMMENT '批次ID',
  `delivery_item_id` bigint DEFAULT NULL COMMENT '交付项ID',
  `case_title` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用例标题',
  `executor_user_id` bigint NOT NULL COMMENT '执行人ID',
  `executor_user_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '执行人姓名',
  `build_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '构建标识',
  `test_env` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '测试环境',
  `result` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '结果:pass/fail/blocked/skip',
  `executed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `round_no` int NOT NULL DEFAULT '1' COMMENT '轮次',
  `case_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '稳定用例ID，旧记录不回填',
  `test_round_id` bigint DEFAULT NULL COMMENT '不可变轮次事实ID',
  `scope_version` int DEFAULT NULL,
  `evidence_json` json DEFAULT NULL,
  `request_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_delivery_item` (`delivery_item_id`),
  KEY `idx_executor` (`executor_user_id`),
  KEY `idx_rdm_execution_case` (`batch_id`,`round_no`,`delivery_item_id`,`case_id`),
  KEY `fk_rdm_execution_round` (`test_round_id`),
  CONSTRAINT `fk_rdm_execution_round` FOREIGN KEY (`test_round_id`) REFERENCES `rdm_test_round` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM测试执行记录';

DROP TABLE IF EXISTS `rdm_test_round`;
CREATE TABLE `rdm_test_round` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_id` bigint NOT NULL,
  `round_no` int NOT NULL,
  `scope_snapshot_json` json NOT NULL COMMENT '交付项+scopeVersion+PRD+标准快照',
  `build_mapping_json` json NOT NULL COMMENT '交付项+系统+构建映射',
  `test_env` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `case_snapshot_json` json NOT NULL COMMENT '交付项+稳定caseId+标题+mandatory冻结集合',
  `executor_user_ids_json` json NOT NULL,
  `frozen_at` datetime NOT NULL,
  `frozen_by` bigint NOT NULL COMMENT '认证SysUser.id',
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_test_round` (`batch_id`,`round_no`),
  CONSTRAINT `fk_rdm_round_batch` FOREIGN KEY (`batch_id`) REFERENCES `rdm_test_batch` (`id`),
  CONSTRAINT `ck_rdm_round_no` CHECK ((`round_no` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM不可变测试轮次';

DROP TABLE IF EXISTS `rdm_transition`;
CREATE TABLE `rdm_transition` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `from_status` varchar(32) NOT NULL COMMENT '起始状态',
  `to_status` varchar(32) NOT NULL COMMENT '目标状态',
  `action_code` varchar(32) NOT NULL COMMENT '动作编码',
  `action_name` varchar(64) NOT NULL COMMENT '动作名称（按钮文案）',
  `allowed_roles` varchar(255) NOT NULL COMMENT '允许角色编码，逗号分隔',
  `required_fields` varchar(255) DEFAULT NULL COMMENT '必填字段，逗号分隔（remark/planDate/promisedDate/versionNo/score/pm/holdUntil）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '启用: 1=启用 0=停用（停用后详情页按钮消失，无需发版）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_trans` (`from_status`,`action_code`),
  KEY `idx_rdm_trans_from` (`from_status`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-状态流转规则';

DROP TABLE IF EXISTS `rdm_work_calendar`;
CREATE TABLE `rdm_work_calendar` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '人员ID sys_user.id',
  `day` date NOT NULL COMMENT '日期',
  `day_type` varchar(16) NOT NULL DEFAULT 'leave' COMMENT '类型: leave休假日/overtime加班日/custom自定义容量',
  `available_hours` decimal(4,1) DEFAULT NULL COMMENT '当日可用工时（leave 视为 0；NULL 表示按默认规则）',
  `reason` varchar(200) DEFAULT NULL COMMENT '原因（年假/婚假/周末支援上线等）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_work_calendar` (`user_id`,`day`),
  KEY `idx_rdm_work_calendar_day` (`day`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-工作日历（按人按日的可用工时，排程与负载计算的输入）';

DROP TABLE IF EXISTS `rdm_work_log`;
CREATE TABLE `rdm_work_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_id` bigint NOT NULL COMMENT '任务ID rdm_work_task.id',
  `req_id` bigint NOT NULL COMMENT '需求ID（冗余，便于按需求/人员汇总）',
  `user_id` bigint NOT NULL COMMENT '填报人 sys_user.id',
  `user_name` varchar(64) DEFAULT NULL COMMENT '填报人姓名快照',
  `work_date` date NOT NULL COMMENT '工作日期',
  `hours` decimal(6,2) NOT NULL COMMENT '当日投入工时（人时）',
  `remark` varchar(255) DEFAULT NULL COMMENT '说明（做了什么/为何加班）',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人（修订留痕：保留最后修改人与时间）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_work_log_day` (`task_id`,`user_id`,`work_date`),
  KEY `idx_rdm_work_log_user_date` (`user_id`,`work_date`),
  KEY `idx_rdm_work_log_req` (`req_id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-工时明细（同人同任务同日唯一，重复提交视为修订）';

DROP TABLE IF EXISTS `rdm_work_task`;
CREATE TABLE `rdm_work_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_no` varchar(32) NOT NULL COMMENT '任務編號 RT+YYYYMMDD+4位',
  `req_id` bigint NOT NULL COMMENT '業務需求ID（進度歸集口徑）',
  `delivery_item_id` bigint DEFAULT NULL COMMENT '关联交付项ID',
  `prd_id` bigint DEFAULT NULL COMMENT '所屬 PRD',
  `task_type` varchar(16) NOT NULL COMMENT '任務類型: design/frontend/backend/qa/data',
  `title` varchar(200) NOT NULL COMMENT '任務標題',
  `content` varchar(1000) DEFAULT NULL COMMENT '任務說明',
  `owner_user_id` bigint DEFAULT NULL COMMENT '負責人ID',
  `owner_emp_no` varchar(32) DEFAULT NULL COMMENT '負責人工號快照',
  `owner_name` varchar(64) DEFAULT NULL COMMENT '負責人姓名',
  `role_code` varchar(32) DEFAULT NULL COMMENT '負責人角色（DESIGNER/DEV/QA…）',
  `status` varchar(16) NOT NULL DEFAULT 'todo' COMMENT '狀態: todo/doing/done/blocked/cancelled',
  `progress` int NOT NULL DEFAULT '0' COMMENT '進度百分比',
  `plan_hours` decimal(6,1) DEFAULT NULL COMMENT '計劃工時',
  `actual_hours` decimal(6,1) DEFAULT NULL COMMENT '實際工時',
  `plan_start_date` date DEFAULT NULL COMMENT '計劃開始',
  `plan_finish_date` date DEFAULT NULL COMMENT '計劃完成',
  `actual_start_time` datetime DEFAULT NULL COMMENT '實際開始',
  `actual_finish_time` datetime DEFAULT NULL COMMENT '實際完成',
  `blocked_reason` varchar(500) DEFAULT NULL COMMENT '阻塞原因',
  `iteration_code` varchar(32) DEFAULT NULL COMMENT '所屬迭代編碼',
  `plan_version` int NOT NULL DEFAULT '1' COMMENT '排期版本(乐观锁):计划起止/负责人变更自增',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rdm_task_no` (`task_no`),
  KEY `idx_rdm_task_req` (`req_id`,`status`),
  KEY `idx_rdm_task_owner` (`owner_user_id`,`status`),
  KEY `idx_rdm_task_iteration` (`iteration_code`),
  KEY `idx_delivery_item` (`delivery_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RDM-执行任务与工时（L3）';

DROP TABLE IF EXISTS `sys_biz_seq`;
CREATE TABLE `sys_biz_seq` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `prefix` varchar(8) NOT NULL COMMENT '编号前缀',
  `date_key` varchar(8) NOT NULL COMMENT '日期键 yyyyMMdd',
  `current_value` int NOT NULL DEFAULT '0' COMMENT '当前序号(从0开始，编号中补齐4位)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_biz_seq` (`prefix`,`date_key`)
) ENGINE=InnoDB AUTO_INCREMENT=1751 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务编号序号表';

DROP TABLE IF EXISTS `sys_biz_seq_rule`;
CREATE TABLE `sys_biz_seq_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `rule_key` varchar(64) NOT NULL COMMENT '规则唯一标识（与前端 key 一致）',
  `rule_name` varchar(64) NOT NULL COMMENT '业务类型名称',
  `biz_menu` varchar(64) DEFAULT NULL COMMENT '所属菜单',
  `prefix` varchar(16) NOT NULL COMMENT '编号前缀',
  `date_format` varchar(16) NOT NULL DEFAULT '' COMMENT '日期格式: YYYYMMDD / YYMM / 空=无日期维度',
  `seq_length` int NOT NULL DEFAULT '4' COMMENT '自增序号位数',
  `seq_start` int NOT NULL DEFAULT '0' COMMENT '序号起始: 0=从0000起 1=从0001起',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seq_rule_key` (`rule_key`),
  UNIQUE KEY `uk_seq_rule_prefix` (`prefix`)
) ENGINE=InnoDB AUTO_INCREMENT=2029 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='编号生成规则配置表';

DROP TABLE IF EXISTS `sys_card_order`;
CREATE TABLE `sys_card_order` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `menu_key` varchar(50) NOT NULL COMMENT '菜单标识: algorithm / waterfall / ad-sales',
  `tab_key` varchar(20) NOT NULL COMMENT 'Tab标识: delivery / groupBuy',
  `card_order` json NOT NULL COMMENT '卡片类型顺序 JSON 数组, 如 [1,3,2,5]',
  `updated_by` varchar(50) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_menu_tab` (`menu_key`,`tab_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='卡片排序配置表';

DROP TABLE IF EXISTS `sys_company_brand`;
CREATE TABLE `sys_company_brand` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL COMMENT '品牌编码（用于资产编号前缀，如 TB/MF）',
  `label_zh` varchar(100) NOT NULL COMMENT '品牌中文名称',
  `label_en` varchar(100) DEFAULT '' COMMENT '品牌英文名称',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1=启用 0=停用',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '' COMMENT '最后更新人',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公司品牌配置表';

DROP TABLE IF EXISTS `sys_config`;
CREATE TABLE `sys_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL COMMENT '配置项唯一标识（如 session_idle_timeout_ms）',
  `config_value` varchar(500) NOT NULL COMMENT '配置值',
  `description` varchar(200) DEFAULT NULL COMMENT '配置说明',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `config_key` (`config_key`)
) ENGINE=InnoDB AUTO_INCREMENT=802 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置表（通用 key-value 存储）';

DROP TABLE IF EXISTS `sys_data_authorization`;
CREATE TABLE `sys_data_authorization` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `target_type` varchar(20) NOT NULL COMMENT '授权对象类型: role / department',
  `target_id` bigint NOT NULL COMMENT '角色ID 或 部门ID',
  `group_code` varchar(50) NOT NULL COMMENT '授权商家集团编码',
  `status` tinyint DEFAULT '1' COMMENT '1=启用 0=停用',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_target_group` (`target_type`,`target_id`,`group_code`)
) ENGINE=InnoDB AUTO_INCREMENT=12006 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据授权表：角色/部门 → 可见商家范围';

DROP TABLE IF EXISTS `sys_department`;
CREATE TABLE `sys_department` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` varchar(64) NOT NULL COMMENT '部门编码',
  `name` varchar(128) NOT NULL COMMENT '部门名称',
  `name_en` varchar(100) DEFAULT NULL COMMENT '部门英文名称',
  `parent_id` bigint DEFAULT NULL COMMENT '上级部门ID (顶级为 NULL)',
  `leader` varchar(64) DEFAULT NULL COMMENT '部门对接人',
  `permissions` text COMMENT '部门授权菜单权限 JSON数组',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=有效 0=无效',
  `sort` int DEFAULT '0' COMMENT '排序',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_dept_parent` (`parent_id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='集团组织架构-部门表';

DROP TABLE IF EXISTS `sys_department_menu`;
CREATE TABLE `sys_department_menu` (
  `dept_id` bigint NOT NULL COMMENT '部门ID',
  `menu_id` bigint NOT NULL COMMENT '菜单ID',
  `actions` text COMMENT '允许的操作 JSON数组',
  PRIMARY KEY (`dept_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门-菜单权限关联表';

DROP TABLE IF EXISTS `sys_department_system`;
CREATE TABLE `sys_department_system` (
  `dept_id` bigint NOT NULL COMMENT 'sys_department.id',
  `system_code` varchar(32) NOT NULL COMMENT 'sys_system.code',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dept_id`,`system_code`),
  KEY `idx_dept_system_code` (`system_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门与系统准入关联';

DROP TABLE IF EXISTS `sys_hr_dict`;
CREATE TABLE `sys_hr_dict` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `dict_type` varchar(32) NOT NULL COMMENT '字典类型: EMPLOYER_COMPANY/WORK_LOCATION/EMPLOYEE_CATEGORY 等',
  `code` varchar(64) NOT NULL COMMENT '稳定编码',
  `name` varchar(128) NOT NULL COMMENT '名称',
  `name_en` varchar(128) DEFAULT NULL COMMENT '英文名称',
  `parent_code` varchar(64) DEFAULT NULL COMMENT '上级code(工作地点城市指向国家code)',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序(升序)',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hr_dict_type_code` (`dict_type`,`code`),
  KEY `idx_hr_dict_type_status` (`dict_type`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HR人事通用字典';

DROP TABLE IF EXISTS `sys_language`;
CREATE TABLE `sys_language` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL COMMENT '语言代码 ISO 639-1',
  `native_name` varchar(100) NOT NULL COMMENT '母语名称',
  `flag` varchar(16) DEFAULT 0xF09F8C90 COMMENT '国旗 Emoji',
  `names_json` text COMMENT '各系统语言下的显示名 JSON',
  `status` int DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `deleted` int DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lang_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多语言配置-已注册语言表';

DROP TABLE IF EXISTS `sys_login_log`;
CREATE TABLE `sys_login_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '用户ID (关联 sys_user.id)',
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '登录账号',
  `emp_id` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '员工工号',
  `employee_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '员工姓名',
  `department_id` bigint DEFAULT NULL COMMENT '部门ID',
  `department_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '部门全路径快照',
  `login_time` datetime NOT NULL COMMENT '登录时间',
  `logout_time` datetime DEFAULT NULL COMMENT '退出时间 (NULL=在线中)',
  `logout_reason` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '退出原因: manual=主动退出, timeout=系统超时退出, forced=强制下线',
  `ip_address` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录IP地址',
  `user_agent` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '浏览器 User-Agent',
  `created_at` datetime DEFAULT NULL COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_login_time` (`login_time`),
  KEY `idx_logout_time` (`logout_time`),
  KEY `idx_department_id` (`department_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1356 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工登录日志表';

DROP TABLE IF EXISTS `sys_menu`;
CREATE TABLE `sys_menu` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `parent_id` bigint DEFAULT NULL COMMENT '父菜单ID, 顶级为 NULL',
  `menu_key` varchar(64) NOT NULL COMMENT '菜单标识, 用于权限判断与前端路由key',
  `name` varchar(50) NOT NULL COMMENT '菜单名称',
  `name_en` varchar(100) DEFAULT NULL COMMENT '菜单英文名称',
  `path` varchar(200) DEFAULT NULL COMMENT '路由路径',
  `component` varchar(200) DEFAULT NULL COMMENT '前端组件路径',
  `icon` varchar(100) DEFAULT NULL COMMENT '图标',
  `type` tinyint DEFAULT NULL COMMENT '类型: 1=目录 2=菜单 3=按钮',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `actions` text COMMENT '可用操作 JSON数组: ["view","create","edit","delete"]',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `system_code` varchar(32) DEFAULT NULL COMMENT '归属系统编码；顶级菜单必填，叶子菜单继承父级；NULL 表示暂未归属',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_menu_key` (`menu_key`),
  KEY `idx_menu_system_code` (`system_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3243 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统菜单配置表';

DROP TABLE IF EXISTS `sys_mt_engine`;
CREATE TABLE `sys_mt_engine` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `engine_key` varchar(32) NOT NULL COMMENT '引擎标识: mymemory/deepl/openai',
  `engine_name` varchar(64) NOT NULL COMMENT '引擎显示名称',
  `api_url` varchar(256) DEFAULT NULL COMMENT 'API 地址',
  `api_key` varchar(512) DEFAULT NULL COMMENT 'API Key（加密存储）',
  `daily_limit` int DEFAULT '50000' COMMENT '每日字符额度',
  `timeout_ms` int DEFAULT '10000' COMMENT '请求超时（毫秒）',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `config_json` text COMMENT '引擎特有配置（JSON）',
  `sort_order` int DEFAULT '0' COMMENT '排序号',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `engine_key` (`engine_key`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机翻引擎配置表';

DROP TABLE IF EXISTS `sys_notification_app`;
CREATE TABLE `sys_notification_app` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '应用名称',
  `platform` varchar(20) NOT NULL DEFAULT 'dingtalk',
  `app_key` varchar(100) NOT NULL,
  `app_secret` varchar(256) NOT NULL DEFAULT '',
  `agent_id` varchar(32) NOT NULL DEFAULT '',
  `base_url` varchar(500) NOT NULL DEFAULT '',
  `enabled` tinyint NOT NULL DEFAULT '1',
  `remark` varchar(500) NOT NULL DEFAULT '',
  `legacy_key` varchar(50) DEFAULT NULL COMMENT '旧配置迁移标记',
  `updated_by` varchar(100) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_app_key` (`app_key`),
  UNIQUE KEY `uk_notification_app_legacy` (`legacy_key`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业内部应用（凭据每应用保存一次）';

DROP TABLE IF EXISTS `sys_notification_channel`;
CREATE TABLE `sys_notification_channel` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '渠道名称',
  `channel` varchar(20) NOT NULL COMMENT '平台类型',
  `webhook_url` varchar(500) NOT NULL COMMENT 'Webhook 地址',
  `secret` varchar(200) DEFAULT '' COMMENT '加签密钥',
  `at_mobiles` varchar(500) DEFAULT '' COMMENT '默认@手机号',
  `enabled` tinyint DEFAULT '1' COMMENT '是否启用',
  `is_default` tinyint DEFAULT '1' COMMENT '是否默认渠道',
  `scenarios` varchar(500) DEFAULT '' COMMENT '绑定场景',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  `created_by` varchar(50) DEFAULT '',
  `updated_by` varchar(50) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_channel` (`channel`,`deleted`),
  KEY `idx_scenario` (`scenarios`(100),`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知渠道配置表（支持多场景）';

DROP TABLE IF EXISTS `sys_notification_scenario`;
CREATE TABLE `sys_notification_scenario` (
  `scenario_key` varchar(64) NOT NULL,
  `app_id` bigint DEFAULT NULL,
  `enabled` tinyint NOT NULL DEFAULT '0',
  `updated_by` varchar(100) NOT NULL DEFAULT '',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`scenario_key`),
  KEY `fk_notification_scenario_app` (`app_id`),
  CONSTRAINT `fk_notification_scenario_app` FOREIGN KEY (`app_id`) REFERENCES `sys_notification_app` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务通知场景路由，场景定义与接收人规则由业务代码声明';

DROP TABLE IF EXISTS `sys_notification_switch`;
CREATE TABLE `sys_notification_switch` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `scene_key` varchar(64) NOT NULL COMMENT '通知场景键',
  `channel` varchar(16) NOT NULL COMMENT '渠道：DINGTALK_WORK=工作通知 DINGTALK_GROUP=群机器人',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否发送：0=静音 1=发送',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_switch` (`scene_key`,`channel`),
  CONSTRAINT `ck_notification_switch_channel` CHECK ((`channel` in (_utf8mb4'DINGTALK_WORK',_utf8mb4'DINGTALK_GROUP')))
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知推送开关（按场景×渠道临时静音）';

DROP TABLE IF EXISTS `sys_notification_template`;
CREATE TABLE `sys_notification_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `scene_key` varchar(64) NOT NULL COMMENT '通知场景键（与 sys_notification_scenario.scenario_key 对齐）',
  `scene_name` varchar(64) NOT NULL COMMENT '场景名称（展示用，随模板保存刷新）',
  `title_tpl` varchar(200) NOT NULL COMMENT '标题模板',
  `body_tpl` text NOT NULL COMMENT '正文模板（钉钉 markdown）',
  `variables` varchar(500) NOT NULL DEFAULT '' COMMENT '可用变量说明（逗号分隔，仅提示，不参与渲染）',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '模板启用：0=回落内置默认文案',
  `updated_by` varchar(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_template_scene` (`scene_key`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知模板（钉钉 markdown，按场景一行）';

DROP TABLE IF EXISTS `sys_permission_audit_log`;
CREATE TABLE `sys_permission_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `target_type` varchar(20) NOT NULL COMMENT '授权对象类型: role/department',
  `target_id` bigint NOT NULL COMMENT '角色ID 或 部门ID',
  `target_name` varchar(128) DEFAULT NULL COMMENT '目标名称快照',
  `system_code` varchar(64) DEFAULT NULL COMMENT '业务系统编码, 跨系统操作为 NULL',
  `change_type` varchar(20) NOT NULL COMMENT '变更类型: GRANT/REVOKE/UPDATE/DELETE/COPY/BIND/STATUS',
  `before_snapshot` text COMMENT '变更前快照 JSON',
  `after_snapshot` text COMMENT '变更后快照 JSON',
  `operator` varchar(64) DEFAULT NULL COMMENT '操作人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_perm_audit_target` (`target_type`,`target_id`,`created_at`),
  KEY `idx_perm_audit_operator` (`operator`,`created_at`),
  KEY `idx_perm_audit_time` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='授权变更审计日志表';

DROP TABLE IF EXISTS `sys_permission_revision`;
CREATE TABLE `sys_permission_revision` (
  `id` bigint NOT NULL COMMENT '固定单行：id=1',
  `revision` bigint NOT NULL DEFAULT '0' COMMENT '全局权限版本号',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `ck_permission_revision_singleton` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权限版本号（跨实例即时失效）';

DROP TABLE IF EXISTS `sys_position`;
CREATE TABLE `sys_position` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` varchar(32) DEFAULT NULL COMMENT '职位ID（按编号生成规则 position_id 生成）',
  `name` varchar(128) NOT NULL COMMENT '职位名称',
  `name_en` varchar(128) DEFAULT NULL COMMENT '职位英文名称',
  `sequence` varchar(8) NOT NULL COMMENT '职级序列: M=管理 T=技术 P=专业',
  `job_level` varchar(32) NOT NULL COMMENT '职级 (如 M3/T5/P2)',
  `rank` varchar(8) DEFAULT NULL COMMENT '职等 R1~R5',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='集团人事-职位表';

DROP TABLE IF EXISTS `sys_purchase_company`;
CREATE TABLE `sys_purchase_company` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '公司稳定编码',
  `name` varchar(128) NOT NULL COMMENT '公司全称',
  `short_name` varchar(64) DEFAULT '' COMMENT '公司简称',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `sort_order` int NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT '',
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT '',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchase_company_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='购买公司字典';

DROP TABLE IF EXISTS `sys_role`;
CREATE TABLE `sys_role` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(50) NOT NULL COMMENT '角色名称',
  `code` varchar(50) NOT NULL COMMENT '角色编码',
  `description` varchar(255) DEFAULT NULL COMMENT '角色描述',
  `self_service_requestable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否开放员工自助申请：1=出现在门户系统权限申请的参考角色目录，0=不开放',
  `permissions` text COMMENT '菜单权限 JSON数组: [{"menuKey":"xxx","actions":["view","edit"]}]',
  `data_scope` tinyint NOT NULL DEFAULT '1' COMMENT '数据范围: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='功能角色表';

DROP TABLE IF EXISTS `sys_role_dept`;
CREATE TABLE `sys_role_dept` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `role_id` bigint NOT NULL COMMENT '角色ID(sys_role.id)',
  `dept_id` bigint NOT NULL COMMENT '部门ID(sys_department.id)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_dept` (`role_id`,`dept_id`),
  KEY `idx_role_dept_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色-自定部门数据范围关联表';

DROP TABLE IF EXISTS `sys_role_menu`;
CREATE TABLE `sys_role_menu` (
  `role_id` bigint NOT NULL COMMENT '角色ID',
  `menu_id` bigint NOT NULL COMMENT '菜单ID',
  `actions` text COMMENT '允许的操作 JSON数组',
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色-菜单权限关联表';

DROP TABLE IF EXISTS `sys_role_system`;
CREATE TABLE `sys_role_system` (
  `role_id` bigint NOT NULL COMMENT 'sys_role.id',
  `system_code` varchar(32) NOT NULL COMMENT 'sys_system.code',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`,`system_code`),
  KEY `idx_role_system_code` (`system_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色与系统准入关联';

DROP TABLE IF EXISTS `sys_schema_migration_log`;
CREATE TABLE `sys_schema_migration_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `version_key` varchar(128) NOT NULL COMMENT '迁移版本标识',
  `status` varchar(16) NOT NULL COMMENT '执行状态: SUCCESS/FAILED',
  `cost_ms` bigint DEFAULT NULL COMMENT '耗时毫秒',
  `build_tag` varchar(128) DEFAULT NULL COMMENT '构建/部署标识',
  `detail` varchar(512) DEFAULT NULL COMMENT '脱敏失败摘要',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_migration_log_key` (`version_key`)
) ENGINE=InnoDB AUTO_INCREMENT=257 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='迁移执行审计日志表';

DROP TABLE IF EXISTS `sys_schema_version`;
CREATE TABLE `sys_schema_version` (
  `version_key` varchar(128) NOT NULL COMMENT '迁移版本标识',
  `applied_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '首次执行时间',
  PRIMARY KEY (`version_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='启动初始化迁移版本记录表';

DROP TABLE IF EXISTS `sys_system`;
CREATE TABLE `sys_system` (
  `code` varchar(32) NOT NULL COMMENT '系统编码，唯一且不可修改',
  `name` varchar(64) NOT NULL COMMENT '系统中文名',
  `name_en` varchar(64) DEFAULT NULL COMMENT '系统英文名',
  `description` varchar(255) DEFAULT NULL COMMENT '系统简介',
  `icon` varchar(64) DEFAULT NULL COMMENT '前端图标 key',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '门户排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`code`),
  KEY `idx_sys_system_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统清单（用于统一门户与系统准入）';

DROP TABLE IF EXISTS `sys_system_country`;
CREATE TABLE `sys_system_country` (
  `country_code` varchar(32) NOT NULL COMMENT '国家编码',
  `system_code` varchar(32) NOT NULL COMMENT '业务系统编码',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=开放 0=关闭',
  PRIMARY KEY (`country_code`,`system_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='国家与系统开放配置';

DROP TABLE IF EXISTS `sys_translation`;
CREATE TABLE `sys_translation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `field_key` varchar(128) NOT NULL COMMENT '字段Key, 全局唯一',
  `field_name` varchar(100) NOT NULL COMMENT '字段名称（业务识别用，允许重复）',
  `category` varchar(32) DEFAULT 'biz' COMMENT '分类: common/status/action/menu/biz/ui',
  `translations_json` text COMMENT '翻译 JSON',
  `source` varchar(16) DEFAULT 'manual' COMMENT '来源: manual/sync',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` int DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_field_key` (`field_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8576 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多语言配置-翻译字段表';

DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `username` varchar(50) NOT NULL COMMENT '登录账号(=工号)',
  `password` varchar(255) NOT NULL COMMENT '密码(BCrypt加密)',
  `name` varchar(50) DEFAULT NULL COMMENT '姓名',
  `emp_id` varchar(20) DEFAULT NULL COMMENT '员工工号',
  `avatar` mediumtext COMMENT '头像（pikachu expression / dicebear URL / base64）',
  `avatar_url` varchar(512) DEFAULT NULL COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）',
  `role` varchar(20) DEFAULT 'guest' COMMENT '系统角色: admin/guest',
  `function_roles` text COMMENT '绑定的功能角色ID JSON数组, 如 [1,3]',
  `department_id` bigint DEFAULT NULL COMMENT '所在部门ID (关联 sys_department.id)',
  `department` varchar(100) DEFAULT NULL COMMENT '所在部门名称快照',
  `department_en` varchar(100) DEFAULT NULL COMMENT '所在部门英文名称快照',
  `position_id` bigint DEFAULT NULL COMMENT '职位ID (关联 sys_position.id)',
  `position` varchar(100) DEFAULT NULL COMMENT '职位名称(中文)快照',
  `position_en` varchar(128) DEFAULT NULL COMMENT '职位名称(英文)快照',
  `sequence` varchar(8) DEFAULT NULL COMMENT '职级序列快照: M=管理 T=技术 P=专业 (随职位带出)',
  `job_level` varchar(32) DEFAULT NULL COMMENT '职级快照 (如 M3/T5/P2, 随职位带出)',
  `rank` varchar(8) DEFAULT NULL COMMENT '职等 R1~R5',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否必须修改密码后才能使用系统：1=初始密码/被管理员重置，0=本人设定',
  `last_active_at` datetime DEFAULT NULL COMMENT '最后活跃时间（空闲超时检测用）',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除: 0=未删除 1=已删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `active_token` varchar(512) DEFAULT NULL COMMENT '当前活跃JWT Token（单设备登录校验）',
  `active_login_ip` varchar(45) DEFAULT NULL COMMENT '当前活跃设备登录IP（单设备登录校验时返回给旧设备）',
  `force_logout_operator` varchar(64) DEFAULT NULL COMMENT '强制下线操作人姓名',
  `force_logout_emp_id` varchar(32) DEFAULT NULL COMMENT '强制下线操作人工号',
  `force_logout_reason` varchar(32) DEFAULT NULL COMMENT '强制下线原因: operator=管理员操作, account_disabled=账号被停用',
  `quick_favorites` varchar(1024) DEFAULT NULL COMMENT '快捷入口菜单key列表，JSON数组格式',
  `portal_favorites` text COMMENT '企业门户常用系统编码列表，JSON 数组格式',
  `ai_settings` text COMMENT 'AI 助手偏好设置，JSON 格式',
  `workbench_layout` text COMMENT '产研交付个人工作台布局偏好，JSON 格式',
  `nationality` varchar(50) DEFAULT NULL COMMENT '国籍',
  `ethnicity` varchar(20) DEFAULT NULL COMMENT '民族',
  `birth_date` date DEFAULT NULL COMMENT '出生日期',
  `marital_status` varchar(10) DEFAULT NULL COMMENT '婚姻状况',
  `political_status` varchar(20) DEFAULT NULL COMMENT '政治面貌',
  `religion` varchar(20) DEFAULT NULL COMMENT '宗教信仰',
  `id_type` varchar(30) DEFAULT NULL COMMENT '证件类型',
  `id_number` varchar(50) DEFAULT NULL COMMENT '证件号码',
  `id_address` varchar(200) DEFAULT NULL COMMENT '证件地址',
  `household_type` varchar(30) DEFAULT NULL COMMENT '户籍类型',
  `household_location` varchar(100) DEFAULT NULL COMMENT '户籍所在地',
  `native_place` varchar(100) DEFAULT NULL COMMENT '籍贯',
  `dingtalk_user_id` varchar(64) DEFAULT NULL COMMENT '钉钉用户ID（工作通知定向推送用）',
  `address_country` varchar(50) DEFAULT NULL COMMENT '住址-国家',
  `address_city` varchar(50) DEFAULT NULL COMMENT '住址-城市',
  `address_detail` varchar(300) DEFAULT NULL COMMENT '住址-详细地址',
  `gender` varchar(10) DEFAULT NULL COMMENT '性別',
  `mobile` varchar(32) DEFAULT NULL COMMENT '手機號',
  `email` varchar(128) DEFAULT NULL COMMENT '郵箱',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_user_dept` (`department_id`),
  KEY `idx_user_position` (`position_id`),
  KEY `idx_user_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表(员工)';

DROP TABLE IF EXISTS `sys_version_history`;
CREATE TABLE `sys_version_history` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `version_no` varchar(32) NOT NULL COMMENT '版本号 (Semantic Versioning, 如 1.0.0)',
  `release_date` date NOT NULL COMMENT '发布日期',
  `release_type` varchar(16) NOT NULL DEFAULT 'patch' COMMENT '发布类型: major/minor/patch',
  `summary` varchar(2000) NOT NULL DEFAULT '' COMMENT '版本概要说明',
  `frontend_changes` text COMMENT '前端更新内容 (每行一条)',
  `backend_changes` text COMMENT '后端更新内容 (每行一条)',
  `database_changes` text COMMENT '数据库变更内容 (每行一条)',
  `commit_hash` varchar(40) DEFAULT NULL COMMENT '同步覆盖的最新 Git commit SHA',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态: 1=已发布 2=草稿',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_version_no` (`version_no`)
) ENGINE=InnoDB AUTO_INCREMENT=126 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='版本发布历史记录表';

SET FOREIGN_KEY_CHECKS=1;
