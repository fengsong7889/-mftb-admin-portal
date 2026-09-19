-- =====================================================================
-- 169_eam_repair_table.sql
-- 资产维修记录表（幂等，可在 SQLPub 平台在线执行）
-- =====================================================================

CREATE TABLE IF NOT EXISTS `biz_eam_repair` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `asset_id`      BIGINT       NOT NULL COMMENT '资产 ID',
  `asset_no`      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '资产编号（快照）',
  `asset_name`    VARCHAR(128) NOT NULL DEFAULT '' COMMENT '资产名称（快照）',
  `repair_date`   VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '维修日期',
  `fault_desc`    VARCHAR(500) NOT NULL DEFAULT '' COMMENT '故障描述',
  `repair_content`VARCHAR(500) NOT NULL DEFAULT '' COMMENT '维修内容',
  `repair_by`     VARCHAR(100) NOT NULL DEFAULT '' COMMENT '维修方',
  `cost`          DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '维修费用（MOP）',
  `finish_date`   VARCHAR(20)  NULL DEFAULT NULL COMMENT '完成日期',
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'repairing' COMMENT '状态：repairing/done',
  `applicant`     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '申请人/部门',
  `cause_type`    VARCHAR(20)  NULL DEFAULT NULL COMMENT '损坏原因：human/natural/third_party/quality',
  `created_by`    VARCHAR(64)  NULL DEFAULT NULL COMMENT '创建人',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by`    VARCHAR(64)  NULL DEFAULT NULL COMMENT '最后更新人',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted`       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
  PRIMARY KEY (`id`),
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_status` (`status`),
  KEY `idx_repair_date` (`repair_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产维修记录表';
