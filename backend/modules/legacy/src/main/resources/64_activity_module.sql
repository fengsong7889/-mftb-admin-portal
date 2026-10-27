-- ============================================================
-- 活動管理模塊（自然流量「活動加分」規則依賴）
-- 系統活動會定期啟動/停用，自然流量評分通過活動ID獲取活動名稱與狀態
-- ============================================================

CREATE TABLE IF NOT EXISTS `biz_activity` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `activity_no` VARCHAR(50)  NOT NULL COMMENT '活動ID（業務編號）',
  `name`        VARCHAR(100) NOT NULL COMMENT '活動名稱',
  `status`      INT          NOT NULL DEFAULT 1 COMMENT '活動狀態: 1=啟動 2=停用',
  `start_time`  DATETIME     DEFAULT NULL COMMENT '活動開始時間',
  `end_time`    DATETIME     DEFAULT NULL COMMENT '活動結束時間',
  `remark`      VARCHAR(500) DEFAULT NULL COMMENT '備註',
  `deleted`     INT          NOT NULL DEFAULT 0 COMMENT '邏輯刪除: 0=正常 1=已刪除',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_no` (`activity_no`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系統活動管理';

-- ============================================================
-- 種子數據（冪等：僅在活動ID不存在時插入）
-- ============================================================

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000001', '減免運費活動', 1, '2026-08-01 00:00:00', '2026-12-31 23:59:59', '商家減免用戶配送運費'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000001');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000002', '新客立減活動', 1, '2026-08-01 00:00:00', '2026-12-31 23:59:59', '新用戶首單立減優惠'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000002');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000003', '秒殺專區活動', 1, '2026-08-15 00:00:00', '2026-11-30 23:59:59', '限時秒殺商品專區'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000003');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000004', '百億補貼活動', 1, '2026-07-01 00:00:00', '2026-12-31 23:59:59', '平台百億補貼專項'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000004');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000005', '會員日專享活動', 2, '2026-06-01 00:00:00', '2026-08-31 23:59:59', '每月會員日專屬折扣'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000005');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000006', '深夜食堂活動', 1, '2026-08-01 00:00:00', '2027-01-31 23:59:59', '宵夜時段專項補貼'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000006');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000007', '進店領券活動', 2, '2026-05-01 00:00:00', '2026-07-31 23:59:59', '用戶進店自動領取優惠券'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000007');

INSERT INTO `biz_activity` (`activity_no`, `name`, `status`, `start_time`, `end_time`, `remark`)
SELECT 'HD000008', '金牌名店評選活動', 1, '2026-09-01 00:00:00', '2026-12-31 23:59:59', '年度金牌名店評選報名'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `biz_activity` WHERE `activity_no` = 'HD000008');
