-- ============================================================
-- MFTB 开发库 fengsong_test 全量重置脚本
-- 用途: 清空所有表，从零开始重建完整数据库（与生产库结构完全一致）
-- 执行: 在 fengsong_test 数据库中直接执行
-- 注意: ⚠️ 此操作不可逆，所有数据将被永久删除！
-- 生成时间: 2026-08-11 11:01:32
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `biz_ad_algorithm`;
DROP TABLE IF EXISTS `biz_ad_cell_lock`;
DROP TABLE IF EXISTS `biz_ad_day_lock_revive`;
DROP TABLE IF EXISTS `biz_ad_order`;
DROP TABLE IF EXISTS `biz_ad_order_item_hot`;
DROP TABLE IF EXISTS `biz_ad_order_item_new_store`;
DROP TABLE IF EXISTS `biz_ad_order_item_revive`;
DROP TABLE IF EXISTS `biz_ad_order_item_signboard`;
DROP TABLE IF EXISTS `biz_ad_order_item_star`;
DROP TABLE IF EXISTS `biz_ad_pricing_hot`;
DROP TABLE IF EXISTS `biz_ad_pricing_hot_skin`;
DROP TABLE IF EXISTS `biz_ad_pricing_revive`;
DROP TABLE IF EXISTS `biz_ad_pricing_revive_region`;
DROP TABLE IF EXISTS `biz_ad_pricing_signboard`;
DROP TABLE IF EXISTS `biz_ad_pricing_signboard_label`;
DROP TABLE IF EXISTS `biz_ad_pricing_star`;
DROP TABLE IF EXISTS `biz_ad_pricing_star_region`;
DROP TABLE IF EXISTS `biz_ad_waterfall`;
DROP TABLE IF EXISTS `biz_ad_waterfall_slot`;
DROP TABLE IF EXISTS `biz_fin_account`;
DROP TABLE IF EXISTS `biz_fin_approval`;
DROP TABLE IF EXISTS `biz_fin_batch`;
DROP TABLE IF EXISTS `biz_fin_debt_bill`;
DROP TABLE IF EXISTS `biz_fin_debt_repayment`;
DROP TABLE IF EXISTS `biz_fin_detail`;
DROP TABLE IF EXISTS `biz_gift_consume`;
DROP TABLE IF EXISTS `biz_gift_record`;
DROP TABLE IF EXISTS `biz_merchant_group`;
DROP TABLE IF EXISTS `biz_organic_score_dimension`;
DROP TABLE IF EXISTS `biz_organic_score_rule`;
DROP TABLE IF EXISTS `biz_store`;
DROP TABLE IF EXISTS `biz_store_bd`;
DROP TABLE IF EXISTS `prom_word_library`;
DROP TABLE IF EXISTS `sys_biz_seq`;
DROP TABLE IF EXISTS `sys_department`;
DROP TABLE IF EXISTS `sys_department_menu`;
DROP TABLE IF EXISTS `sys_language`;
DROP TABLE IF EXISTS `sys_login_log`;
DROP TABLE IF EXISTS `sys_menu`;
DROP TABLE IF EXISTS `sys_position`;
DROP TABLE IF EXISTS `sys_role`;
DROP TABLE IF EXISTS `sys_role_menu`;
DROP TABLE IF EXISTS `sys_translation`;
DROP TABLE IF EXISTS `sys_user`;

SET FOREIGN_KEY_CHECKS = 1;


CREATE TABLE `sys_user` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `username` varchar(50) NOT NULL COMMENT '登录账号(=工号)',
  `password` varchar(255) NOT NULL COMMENT '密码(BCrypt加密)',
  `name` varchar(50) DEFAULT NULL COMMENT '姓名',
  `emp_id` varchar(20) DEFAULT NULL COMMENT '员工工号',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像',
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_user_dept` (`department_id`),
  KEY `idx_user_position` (`position_id`),
  KEY `idx_user_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表(员工) ';

CREATE TABLE `sys_role` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(50) NOT NULL COMMENT '角色名称',
  `code` varchar(50) NOT NULL COMMENT '角色编码',
  `description` varchar(255) DEFAULT NULL COMMENT '角色描述',
  `permissions` text COMMENT '菜单权限 JSON数组: [{"menuKey":"xxx","actions":["view","edit"]}]',
  `status` tinyint DEFAULT '1' COMMENT '状态: 1=启用 0=停用',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='功能角色表';

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

CREATE TABLE `sys_position` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_menu_key` (`menu_key`)
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统菜单配置表';

CREATE TABLE `sys_role_menu` (

  `role_id` bigint NOT NULL COMMENT '角色ID',
  `menu_id` bigint NOT NULL COMMENT '菜单ID',
  `actions` text COMMENT '允许的操作 JSON数组',
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色-菜单权限关联表';

CREATE TABLE `sys_department_menu` (

  `dept_id` bigint NOT NULL COMMENT '部门ID',
  `menu_id` bigint NOT NULL COMMENT '菜单ID',
  `actions` text COMMENT '允许的操作 JSON数组',
  PRIMARY KEY (`dept_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门-菜单权限关联表';

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
) ENGINE=InnoDB AUTO_INCREMENT=115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工登录日志表';

CREATE TABLE `sys_biz_seq` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `prefix` varchar(8) NOT NULL COMMENT '编号前缀',
  `date_key` varchar(8) NOT NULL COMMENT '日期键 yyyyMMdd',
  `current_value` int NOT NULL DEFAULT '0' COMMENT '当前序号(从0开始，编号中补齐4位)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_biz_seq` (`prefix`,`date_key`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务编号序号表';

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多语言配置-已注册语言表';

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
) ENGINE=InnoDB AUTO_INCREMENT=4272 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多语言配置-翻译字段表';

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

CREATE TABLE `biz_store` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_id` bigint NOT NULL COMMENT '所属集团ID (关联 biz_merchant_group.id)',
  `store_code` varchar(32) NOT NULL COMMENT '门店ID（系统自增，如 MD00001）',
  `store_name` varchar(128) NOT NULL COMMENT '门店名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee / mFood / flashBee,mFood',
  `biz_channel` varchar(128) DEFAULT NULL COMMENT '业务频道（美食外賣/超市百貨/團購到店，可多选逗号分隔）',
  `login_account` varchar(64) DEFAULT NULL COMMENT '登录主账号',
  `region` int DEFAULT NULL COMMENT '所在区域/商圈: 1=黑沙环区 … 11=黑沙滩区',
  `updated_by` varchar(64) DEFAULT NULL COMMENT '最后更新人',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_store_code` (`store_code`),
  KEY `idx_store_group` (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='门店表';

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='门店绑定BD关系表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赠送消费流水表';

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金账户表';

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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fin_approval_flow` (`flow_no`),
  KEY `idx_fin_approval_group` (`group_code`),
  KEY `idx_fin_approval_status` (`flow_status`),
  KEY `idx_fin_approval_type` (`approval_type`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='财务审批流程表';

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
  UNIQUE KEY `uk_fin_batch_no` (`batch_no`),
  KEY `idx_fin_batch_group` (`group_code`),
  KEY `idx_fin_batch_flow` (`flow_no`),
  KEY `idx_fin_batch_time` (`trade_time`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金批次表';

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广金交易明细表';

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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广算法登记表';

CREATE TABLE `biz_ad_order` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号: GD + 年月日 + 4位自增',
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_order_no` (`order_no`),
  KEY `idx_ad_order_group` (`group_code`),
  KEY `idx_ad_order_store` (`store_code`),
  KEY `idx_ad_order_algo` (`algo_id`),
  KEY `idx_ad_order_status` (`status`),
  KEY `idx_ad_order_time` (`order_time`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广广告订单主表';

CREATE TABLE `biz_ad_pricing_star` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星计价主表';

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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星商圈计价明细表';

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星订单明细表(独家占) ';

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无敌星星格子加购锁(60秒) ';

CREATE TABLE `biz_ad_pricing_revive` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏计价主表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏商圈计价明细表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏订单明细表(按天库存) ';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='盘活复苏加购锁(60秒) ';

CREATE TABLE `biz_ad_waterfall` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID(配置ID, APP引用)',
  `strategy_name` varchar(128) NOT NULL COMMENT '瀑布流名称',
  `brand` varchar(64) DEFAULT NULL COMMENT '所属品牌: flashBee=闪蜂 / mFood',
  `natural_algo_id` varchar(64) DEFAULT NULL COMMENT '自然流量兜底算法编码(关联 biz_ad_algorithm.algo_code, 未配置坑位读取该算法数据)',
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='瀑布流策略主表';

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='瀑布流坑位明细表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='新店广告订单明细表';

CREATE TABLE `biz_ad_pricing_hot` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
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
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_hot_algo` (`algo_id`),
  KEY `idx_ad_pricing_hot_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家计价主表';

CREATE TABLE `biz_ad_pricing_hot_skin` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `pricing_id` bigint NOT NULL COMMENT '计价主表ID (biz_ad_pricing_hot.id)',
  `skin_name` varchar(64) NOT NULL COMMENT '皮肤名称',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '皮肤日单价(MOP)',
  `border_type` varchar(16) DEFAULT 'color' COMMENT '边框方式: none=无边框 color=选择配色 image=上传边框图',
  `border_color` varchar(32) DEFAULT NULL COMMENT '边框颜色(HEX, border_type=color时生效)',
  `dish_layout` varchar(20) DEFAULT 'grid' COMMENT '菜品展示布局: grid=大图拼列(1大2小) carousel=阶梯轮播',
  `tier` varchar(20) DEFAULT 'classic' COMMENT '皮肤段位: classic=经典 premium=精选 flagship=旗舰 ultimate=至尊',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_pricing_hot_skin_pricing` (`pricing_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家皮肤计价明细表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人气商家订单明细表(皮肤x日期) ';

CREATE TABLE `biz_ad_order_item_signboard` (

  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单主表ID (biz_ad_order.id)',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号快照',
  `biz_date` date NOT NULL COMMENT '投放日期',
  `label_type` varchar(32) NOT NULL COMMENT '标签类型(hot/popular/sales/rating/repurchase/favorites/customers)',
  `original_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '格子原价(标签日单价)',
  `sale_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实付分摊价(折扣后)',
  `refund_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '已退款金额(取消扣费梯度)',
  `delivery_status` tinyint NOT NULL DEFAULT '1' COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
  `deleted` tinyint DEFAULT '0' COMMENT '逻辑删除',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_item_signboard_order` (`order_id`),
  KEY `idx_ad_item_signboard_cell` (`biz_date`,`label_type`),
  KEY `idx_ad_item_signboard_status` (`delivery_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='金字招牌订单明细表(标签x日期)';

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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分維度權重配置';

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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`),
  KEY `idx_dimension` (`dimension`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=174 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分規則配置';

-- ============================================================
-- 种子数据
-- ============================================================

-- sys_role 种子数据
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (1, '超级管理员', 'admin', '拥有系统所有权限', '[{"menuKey":"home","actions":["view"]},{"menuKey":"merchant-group-list","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"store-list","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-dashboard","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-algorithm","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-slot-config","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-waterfall","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"gift-detail","actions":["view","create","export"]},{"menuKey":"gift-consume-detail","actions":["view","export"]},{"menuKey":"ad-sales","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-word-library","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-sales-config","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-report-overview","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-report-order","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"promotion-report-compare","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"global-config","actions":["view","edit"]},{"menuKey":"channel-strategy","actions":["view","create","edit","delete","enable","disable"]},{"menuKey":"hint-config","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"hot-search-config","actions":["view","create","edit","delete","import","export","enable","disable"]},{"menuKey":"search-weight-config","actions":["view","create","edit","delete","enable","disable"]},{"menuKey":"word-segmentation","actions":["view","create","edit","delete","import","export"]},{"menuKey":"synonym-config","actions":["view","create","edit","delete","import","export"]},{"menuKey":"hot-search-library","actions":["view","create","edit","delete","import","export"]},{"menuKey":"stop-words","actions":["view","create","edit","delete","import","export"]},{"menuKey":"search-verify","actions":["view","export"]},{"menuKey":"hint-verify","actions":["view","export"]},{"menuKey":"hot-search-verify","actions":["view","export"]},{"menuKey":"hint-report","actions":["view","export"]},{"menuKey":"hot-search-report","actions":["view","export"]},{"menuKey":"employee-management","actions":["view","create","edit","delete"]},{"menuKey":"organization-management","actions":["view","create","edit","delete"]},{"menuKey":"position-management","actions":["view","create","edit","delete"]},{"menuKey":"role-management","actions":["view","create","edit","delete"]},{"menuKey":"function-permission","actions":["view","create","edit","delete"]},{"menuKey":"data-permission","actions":["view","create","edit","delete"]},{"menuKey":"login-log","actions":["view","export","forceLogout"]},{"menuKey":"account-balance","actions":["view","edit","export"]},{"menuKey":"batch-query","actions":["view","export"]},{"menuKey":"detail-query","actions":["view","export"]},{"menuKey":"writeoff-reconcile","actions":["view","export"]},{"menuKey":"debt-reconcile","actions":["view","export","import"]},{"menuKey":"approval-center","actions":["view","edit"]}]', 1, '权限管理', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (2, '访客', 'guest', '仅拥有查看权限', NULL, 1, NULL, 1, '2026-07-30T21:05:07', '2026-07-30T23:42:38');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (3, '业务主管审批', 'FIN_BIZ_APPROVER', '财务审批流程第一级：业务主管节点审批权限', NULL, 1, NULL, 0, '2026-07-30T21:05:08', '2026-07-30T21:05:08');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (4, '运营主管审批', 'FIN_OPS_APPROVER', '财务审批流程第二级：运营主管节点审批权限', NULL, 1, NULL, 0, '2026-07-30T21:05:08', '2026-07-30T21:05:08');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (5, '财务主管审批', 'FIN_FIN_APPROVER', '财务审批流程第三级：财务主管节点审批权限，通过后生成批次/明细/欠款单', NULL, 1, NULL, 0, '2026-07-30T21:05:08', '2026-07-30T21:05:08');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (6, '團購運營', 'role_1785836308930', '', '[]', 1, '权限管理', 1, '2026-08-04T17:38:29', '2026-08-04T17:39:21');
INSERT INTO `sys_role` (`id`, `name`, `code`, `description`, `permissions`, `status`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (7, '多语言配置权限', 'role_1786083748121', '多语言配置业务专属', NULL, 1, '冯松', 0, '2026-08-07T14:22:28', '2026-08-07T14:22:28');

-- sys_department 种子数据
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (1, 'MT00001', '集团总裁办', NULL, NULL, 'Bee', NULL, 1, 0, NULL, 1, '2026-07-30T21:05:07', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (2, 'MT00002', '技术部', NULL, NULL, NULL, NULL, 1, 1, NULL, 1, '2026-07-30T21:05:07', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (3, 'MT00003', '运营部', NULL, NULL, NULL, NULL, 1, 2, NULL, 1, '2026-07-30T21:05:07', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (4, 'MT00004', 'MFTB集團', 'MFTB Group', NULL, '贝总', '[]', 1, 0, '冯松', 0, '2026-07-30T23:33:56', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (5, 'MT00005', '董事長兼首席執行官辦公室', 'Office of the Chairman and Chief Executive Officer', 4, '周忠浩', '[]', 1, 1, '冯松', 0, '2026-07-30T23:33:56', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (6, 'MT00006', '事業部門（業務+執行）', 'Business Unit (Business + Execution)', 4, '冯松', '[]', 1, 2, '冯松', 0, '2026-07-30T23:33:57', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (7, 'MT00007', '運營中心（策略+綜合）', 'Operations Center (Strategy + Composite)', 4, '周忠浩', '[]', 1, 3, '冯松', 0, '2026-07-30T23:33:57', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (8, 'MT00008', '產研中心（平台+項目）', 'Production and Research Center (Platform + Project)', 4, '贝总', '[]', 1, 4, '冯松', 0, '2026-07-30T23:33:57', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (9, 'MT00009', '配送中心（履約+極馬）', 'Distribution Center (Fulfillment + Extreme)', 4, '刘卫', '[]', 1, 5, '冯松', 0, '2026-07-30T23:33:57', '2026-07-31T09:50:30');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (10, 'MT00010', '財務中心（資金+風控）', 'Finance Center (Funding + Risk Control)', 4, '潘晓媛', '[]', 1, 6, '冯松', 0, '2026-07-30T23:33:58', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (11, 'MT00011', '行政中心（公司+法務）', 'Administrative Center (Corporate + Legal)', 4, '州州', '[]', 1, 7, '冯松', 0, '2026-07-30T23:33:58', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (12, 'MT00012', '澳門通裝機組（對外合作）', 'Macau Complete Unit (External Cooperation)', 4, '坦克', '[]', 1, 8, '冯松', 0, '2026-07-30T23:33:58', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (13, 'MT00013', '「外賣到家」事業部', '"Food Delivery to Home" Business Division', 6, '刘卫', '[]', 1, 1, '冯松', 0, '2026-07-30T23:33:59', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (14, 'MT00014', '「團購到店」事業部', 'Group Purchase Arrival Division', 6, '州州', '[]', 1, 2, '冯松', 0, '2026-07-30T23:33:59', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (15, 'MT00015', '「零售閃購」事業部', 'Retail Flash Purchase Division', 6, '潘晓媛', '[]', 1, 3, '冯松', 0, '2026-07-30T23:33:59', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (16, 'MT00016', '「市場營銷」事業部', 'Marketing Division', 6, '浩源', '[]', 1, 4, '冯松', 0, '2026-07-30T23:33:59', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (17, 'MT00017', '「數字媒體」事業部', 'Digital Media Division', 6, '周忠浩', '[]', 1, 5, '冯松', 0, '2026-07-30T23:34', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (18, 'MT00018', '用戶運營部', 'User Operations Department', 7, '杨志成', '[]', 1, 1, '冯松', 0, '2026-07-30T23:34', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (19, 'MT00019', '商戶運營部', 'Merchant Operations', 7, '陳舒婷', '[]', 1, 2, '冯松', 0, '2026-07-30T23:34', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (20, 'MT00020', 'TB技术中心', 'TB Technology Center', 8, '李科', '[]', 1, 1, '冯松', 0, '2026-07-30T23:34:01', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (21, 'MT00021', 'MF技术中心', 'MF Technical Center', 8, '李科', '[]', 1, 2, '冯松', 0, '2026-07-30T23:34:01', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (22, 'MT00022', 'SH眾包部', 'SH Crowdsourcing Department', 9, '浩源', '[]', 1, 1, '冯松', 0, '2026-07-30T23:34:01', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (23, 'MT00023', 'TB配送站', 'TB Distribution Station', 9, '刘卫', '[]', 1, 2, '冯松', 0, '2026-07-30T23:34:01', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (24, 'MT00024', 'TB調度部', 'TB Dispatch Department', 9, '杨志成', '[]', 1, 3, '冯松', 0, '2026-07-30T23:34:02', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (25, 'MT00025', 'MF配送站', 'MF Distribution Station', 9, '古月', '[]', 1, 4, '冯松', 0, '2026-07-30T23:34:02', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (26, 'MT00026', 'MF調度部', 'MF Dispatch Dept.', 9, '浩源', '[]', 1, 5, '冯松', 0, '2026-07-30T23:34:02', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (27, 'MT00027', '財務中心', 'Finance Center', 10, '古月', '[]', 1, 1, '冯松', 0, '2026-07-30T23:34:02', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (28, 'MT00028', '行政中心', 'Administrative Center', 11, '冯松', '[{"menuKey":"employee-management","actions":["view","create","edit","delete"]},{"menuKey":"role-management","actions":["view","create","edit","delete"]}]', 1, 1, '冯松', 0, '2026-07-30T23:34:03', '2026-07-31T09:50:31');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (29, 'MT00029', '前端研發部', 'Front-end R&D', 20, '州州', '[]', 1, 1, '冯松', 0, '2026-07-31T06:25:15', '2026-07-31T06:25:15');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (30, 'MT00030', '後端研發部', 'Back-end R&D', 20, '坦克', '[]', 1, 2, '冯松', 0, '2026-07-31T06:25:39', '2026-07-31T06:25:39');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (31, 'MT00031', '測試部', 'Test Dept.', 20, '冯松', '[]', 1, 3, '冯松', 0, '2026-07-31T06:25:49', '2026-07-31T06:25:49');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (32, 'MT00032', '設計部', 'Design Department', 20, 'Bee', '[]', 1, 4, '冯松', 0, '2026-07-31T06:25:57', '2026-07-31T06:25:57');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (33, 'MT00033', '前端研發部', 'Front-end R&D', 21, '州州', '[]', 1, 1, '冯松', 0, '2026-07-31T06:26:10', '2026-07-31T06:26:10');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (34, 'MT00034', '後端研發部', 'Back-end R&D', 21, '坦克', '[]', 1, 2, '冯松', 0, '2026-07-31T06:26:18', '2026-07-31T06:26:18');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (35, 'MT00035', '測試部', 'Test Dept.', 21, '冯松', '[]', 1, 3, '冯松', 0, '2026-07-31T06:26:26', '2026-07-31T06:26:26');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (36, 'MT00036', '設計部', 'Design Department', 21, 'Bee', '[]', 1, 4, '冯松', 0, '2026-07-31T06:26:39', '2026-07-31T06:26:39');
INSERT INTO `sys_department` (`id`, `code`, `name`, `name_en`, `parent_id`, `leader`, `permissions`, `status`, `sort`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (37, 'MT00037', '產品部', 'Product Department', 21, '古月', '[]', 1, 5, '冯松', 0, '2026-07-31T09:36:03', '2026-07-31T09:36:03');

-- sys_position 种子数据
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (1, '首席執行官', 'CEO', 'M', 'M12', 'R3', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (2, '總裁', 'President', 'M', 'M11', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (3, '首席官', 'CXO', 'M', 'M10', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (4, '高級負責人', 'Senior Leader', 'M', 'M9', 'R4', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (5, '負責人', 'Leader', 'M', 'M8', 'R3', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (6, '高級總監', 'Senior Director', 'M', 'M7', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (7, '總監', 'Director', 'M', 'M6', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (8, '高級經理/主管', 'Senior Manager', 'M', 'M5', 'R5', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (9, '經理/主管', 'Manager', 'M', 'M4', 'R4', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (10, '高級研究員', 'Senior Researcher', 'T', 'T9', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (11, '中級研究員', 'Middle Researcher', 'T', 'T8', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (12, '研究員', 'Researcher', 'T', 'T7', 'R5', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (13, '高級工程師', 'Senior Engineer', 'T', 'T6', 'R4', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (14, '中級工程師', 'Middle Engineer', 'T', 'T5', 'R3', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (15, '工程師', 'Engineer', 'T', 'T4', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (16, '高級技術助理', 'Senior IT Assistant', 'T', 'T3', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (17, '中級技術助理', 'Middle IT Assistant', 'T', 'T2', 'R5', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (18, '技術助理', 'IT Assistant', 'T', 'T1', 'R4', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (19, '高級專家', 'Senior Expert', 'P', 'P9', 'R3', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (20, '中級專家', 'Middle Expert', 'P', 'P8', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (21, '專家', 'Expert', 'P', 'P7', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (22, '高級專員', 'Senior Officer', 'P', 'P6', 'R5', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (23, '中級專員', 'Middle Officer', 'P', 'P5', 'R4', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (24, '專員', 'Officer', 'P', 'P4', 'R3', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (25, '高級助理', 'Senior Assistant', 'P', 'P3', 'R2', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (26, '中級助理', 'Middle Assistant', 'P', 'P2', 'R1', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `sys_position` (`id`, `name`, `name_en`, `sequence`, `job_level`, `rank`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (27, '助理', 'Assistant', 'P', 'P1', 'R5', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');

-- biz_merchant_group 种子数据
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (1, 'JT000001', '騰訊技術餐廳集團', 'group_g001', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (2, 'JT000002', '阿里技術餐廳集團', 'group_g002', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (3, 'JT000003', '字節技術餐廳集團', 'group_g003', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (4, 'JT000004', '京東技術餐廳集團', 'group_g004', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (5, 'JT000005', 'SHEIN技術餐廳集團', 'group_g005', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (6, 'JT000006', '百度技術餐廳集團', 'group_g006', 'Bee', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_merchant_group` (`id`, `group_code`, `group_name`, `login_account`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (13, 'JT000007', 'ceshi001', '2001', '冯松', 1, '2026-07-31T08:10:09', '2026-08-03T12:55:49');

-- biz_store 种子数据
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (1, 1, 'MD00001', '澳門總店', 'mFood', '1', 'store_s1001', 1, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (2, 2, 'MD00002', '氹仔分店', 'flashBee', '1', 'store_s1002', 2, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (3, 3, 'MD00003', '新馬路店', 'mFood', '2', 'store_s1003', 3, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (4, 4, 'MD00004', '黑沙環店', 'flashBee', '1', 'store_s1004', 5, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (5, 5, 'MD00005', '官也街老店', 'mFood', '1', 'store_s1005', 4, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (6, 6, 'MD00006', '珠海旗艦店', 'mFood', '1,3', 'store_s1006', 6, '冯松', 0, '2026-07-30T21:05:07', '2026-07-30T21:05:07');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (13, 1, 'MD00007', '珠海前山分店', 'flashBee', '1', 'group_g007', 7, '冯松', 0, '2026-07-31T06:28', '2026-07-31T06:28');
INSERT INTO `biz_store` (`id`, `group_id`, `store_code`, `store_name`, `brand`, `biz_channel`, `login_account`, `region`, `updated_by`, `deleted`, `created_at`, `updated_at`) VALUES (14, 1, 'MD00008', '中山坦洲分店', 'mFood', '1', 'group_g008', 8, '冯松', 0, '2026-07-31T06:28:16', '2026-07-31T06:28:16');

