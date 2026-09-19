-- =====================================================================
-- 170: EAM 资产盘点任务表 + 盘点明细表
-- =====================================================================
-- 盘点任务表：记录每次盘点的基本信息、统计数据
-- 盘点明细表：每次盘点快照所有未报废资产，逐条标记盘点状态

-- 盘点任务主表
CREATE TABLE IF NOT EXISTS `biz_eam_inventory_task` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `task_no` VARCHAR(64) NOT NULL COMMENT '盘点任务编号（PD+YYYYMMDD+4位）',
    `task_name` VARCHAR(200) NOT NULL COMMENT '盘点任务名称',
    `inventory_date` VARCHAR(20) NOT NULL COMMENT '盘点日期',
    `operator` VARCHAR(128) NOT NULL COMMENT '盘点人',
    `expected_count` INT NOT NULL DEFAULT 0 COMMENT '应盘数量',
    `actual_count` INT NOT NULL DEFAULT 0 COMMENT '实盘数量',
    `diff_count` INT NOT NULL DEFAULT 0 COMMENT '差异数（实盘-应盘）',
    `status` VARCHAR(32) NOT NULL DEFAULT 'in_progress' COMMENT '状态：in_progress/completed/cancelled',
    `remark` VARCHAR(500) NULL DEFAULT '' COMMENT '备注',
    `created_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '创建人',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '最后更新人',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY `uk_task_no` (`task_no`),
    KEY `idx_status` (`status`),
    KEY `idx_inventory_date` (`inventory_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产盘点任务表';

-- 盘点明细表
CREATE TABLE IF NOT EXISTS `biz_eam_inventory_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `task_id` BIGINT NOT NULL COMMENT '关联盘点任务 ID',
    `asset_id` BIGINT NOT NULL COMMENT '资产 ID',
    `asset_no` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '资产编号（快照）',
    `asset_name` VARCHAR(256) NOT NULL DEFAULT '' COMMENT '资产名称（快照）',
    `asset_type` VARCHAR(128) NULL DEFAULT NULL COMMENT '资产分类（快照）',
    `location` VARCHAR(200) NULL DEFAULT NULL COMMENT '存放位置（快照）',
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '盘点状态：pending/normal/lost/damaged',
    `remark` VARCHAR(500) NULL DEFAULT '' COMMENT '备注',
    `created_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '创建人',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '最后更新人',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY `idx_task_id` (`task_id`),
    KEY `idx_asset_id` (`asset_id`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产盘点明细表';

-- =====================================================================
-- 编号生成规则种子：盘点任务编号 PD+YYYYMMDD+4位
-- =====================================================================
INSERT INTO sys_biz_seq_rule
    (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES
    ('eam_inventory', '盤點任務編號', '物資管理(EAM)-資產盤點', 'PD', 'YYYYMMDD', 4, 0, 1,
     '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE
    rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu),
    prefix = VALUES(prefix), date_format = VALUES(date_format),
    seq_length = VALUES(seq_length), seq_start = VALUES(seq_start),
    remark = VALUES(remark), status = VALUES(status);
