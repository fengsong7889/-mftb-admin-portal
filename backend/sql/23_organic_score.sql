-- ============================================================
-- 自然流量算法评分配置持久化
-- 两张表：维度权重配置 + 评分规则（含梯度档位/配送范围分数）
-- ============================================================

-- 1. 维度权重配置表
CREATE TABLE IF NOT EXISTS `biz_organic_score_dimension` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `dimension`  INT          NOT NULL COMMENT '维度: 1=商業 2=店鋪 4=平台',
  `weight`     INT          NOT NULL DEFAULT 0 COMMENT '權重百分比（0~100）',
  `sort_order` INT          NOT NULL DEFAULT 0 COMMENT '排序號',
  `updated_by` VARCHAR(50)  DEFAULT NULL COMMENT '最後更新人',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dimension` (`dimension`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分維度權重配置';

-- 2. 评分规则表
CREATE TABLE IF NOT EXISTS `biz_organic_score_rule` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `rule_code`         VARCHAR(50)   NOT NULL COMMENT '規則編碼（COM_01 / STB_01 / PLT_01 等）',
  `dimension`         INT           NOT NULL COMMENT '所屬維度: 1=商業 2=店鋪 4=平台',
  `name`              VARCHAR(100)  NOT NULL COMMENT '規則名稱',
  `description`       VARCHAR(500)  DEFAULT '' COMMENT '計分說明',
  `mode`              INT           NOT NULL COMMENT '計分方式: 1=規則加分 2=衰減函數 3=規則減分 4=金額倍率 5=梯度計分 6=條件計分',
  `score`             INT           NOT NULL DEFAULT 0 COMMENT '分值（扣分為負值；金額倍率時填倍率）',
  `prerequisites`     VARCHAR(500)  DEFAULT NULL COMMENT '前提條件',
  `stat_days`         INT           DEFAULT NULL COMMENT '統計天數',
  `stat_days_total`   INT           DEFAULT NULL COMMENT '歷史基線天數',
  `stat_days_recent`  INT           DEFAULT NULL COMMENT '近期對比天數',
  `range_scores`      JSON          DEFAULT NULL COMMENT '配送範圍分層分數 JSON',
  `time_range_scores` JSON          DEFAULT NULL COMMENT '分時段配送範圍分數 JSON',
  `tiers`             JSON          DEFAULT NULL COMMENT '梯度檔位 JSON',
  `condition_items`   JSON          DEFAULT NULL COMMENT '條件計分項 JSON',
  `calc_cycle`        VARCHAR(20)   DEFAULT NULL COMMENT '計算周期: NIGHTLY/DAILY/SCHEDULED',
  `calc_interval_hours` DECIMAL(5,2) DEFAULT NULL COMMENT '定時監控間隔小時數',
  `peak_time_ranges`  JSON          DEFAULT NULL COMMENT '高峰時段定義 JSON',
  `deduction_per_order` INT         DEFAULT NULL COMMENT '每單固定扣分',
  `decay_coefficient`   DECIMAL(10,4) DEFAULT NULL COMMENT '衰減係數',
  `blocked_merchants`   JSON          DEFAULT NULL COMMENT '屏蔽商家列表 JSON',
  `activity_items`      JSON          DEFAULT NULL COMMENT '活動加分配置 JSON',
  `status`            INT           NOT NULL DEFAULT 1 COMMENT '服務狀態: 1=啟用 2=停用',
  `builtin`           TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否系統內置: 1=是 0=否',
  `sort_order`        INT           NOT NULL DEFAULT 0 COMMENT '排序號',
  `updated_by`        VARCHAR(50)   DEFAULT NULL COMMENT '最後更新人',
  `deleted`           INT           NOT NULL DEFAULT 0 COMMENT '邏輯刪除: 0=正常 1=已刪除',
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`),
  KEY `idx_dimension` (`dimension`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自然流量評分規則配置';

-- ============================================================
-- 初始化數據：3 個維度權重（總和 = 100%）
-- ============================================================
INSERT IGNORE INTO `biz_organic_score_dimension` (`dimension`, `weight`, `sort_order`, `updated_by`) VALUES
(1, 35, 1, 'system'),
(2, 40, 2, 'system'),
(4, 25, 3, 'system');

-- ============================================================
-- 初始化數據：評分規則（與前端 DEFAULT_ORGANIC_SCORE_RULES 同步）
-- ============================================================

-- ===== 商業維度 =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `prerequisites`, `condition_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('COM_01', 1, '滿額立減', '商家參與滿額立減活動加分', 1, 30, NULL, NULL, 1, 1, 1, 'system'),
('COM_02', 1, '減免運費', '商家減免配送運費加分', 1, 20, NULL, NULL, 1, 1, 2, 'system'),
('COM_03', 1, '進店領券', '商家設置進店領券加分', 4, 2, NULL, NULL, 1, 1, 3, 'system'),
('COM_04', 1, '新客立減', '商家參與新客立減活動加分', 1, 30, NULL, NULL, 1, 1, 4, 'system'),
('COM_05', 1, '收藏送券', '商家設置收藏送券加分', 4, 2, NULL, NULL, 1, 1, 5, 'system'),
('COM_06', 1, '會員紅包-按金額', '商家設置會員紅包加分', 4, 2, NULL, NULL, 1, 1, 6, 'system'),
('COM_07', 1, '閃蜂官方神券-按金額', '商家設置閃蜂官方神券加分', 4, 2, NULL, NULL, 1, 1, 7, 'system'),
('COM_09', 1, '購買廣告-點金廣告', '購買點金廣告投放期內加分', 1, 80, NULL, NULL, 1, 1, 8, 'system'),
('COM_10', 1, '購買廣告-金字招牌', '購買金字招牌廣告投放期內加分', 1, 100, NULL, NULL, 1, 1, 9, 'system');

-- ===== 店鋪維度 =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `condition_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_01', 2, '主營時段加分', '主營時段配置完整，當前處於主營時段內加分', 1, 60, NULL, 1, 1, 1, 'system'),
('STB_04', 2, '店鋪標籤-金牌', '金牌店鋪身份標籤加分', 1, 60, NULL, 1, 1, 2, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `condition_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_02', 2, '營業狀態', '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', 6, 0, '[{"condition":"bonus","score":100},{"condition":"deduction","score":20},{"condition":"deduction","score":50},{"condition":"deduction","score":80}]', 1, 1, 3, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `condition_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_03', 2, '評價得分', '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率', 6, 0, 30, '[{"condition":"fixed_bonus","score":50},{"condition":"fixed_bonus","score":20},{"condition":"fixed_bonus","score":0},{"condition":"fixed_deduction","score":20},{"condition":"fixed_deduction","score":50}]', 1, 1, 4, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `prerequisites`, `stat_days`, `tiers`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('PLT_03', 4, '商家扶持', '統計有效訂單數，按梯度加分：訂單越多得分越高', 5, 0, 'UNCONDITIONAL', 30, '[{"threshold":50,"direction":"LESS_THAN","score":20,"statDays":30}]', 1, 1, 5, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `calc_cycle`, `calc_interval_hours`, `tiers`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('PLT_04', 4, '訂單過熱調控', '定時監控商家訂單過熱時按梯度降權，平衡流量分配給其他商家機會', 5, 0, 'SCHEDULED', 1.00, '[{"threshold":200,"direction":"MORE_THAN","score":-10},{"threshold":500,"direction":"MORE_THAN","score":-30},{"threshold":1000,"direction":"MORE_THAN","score":-60}]', 1, 1, 6, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days_total`, `condition_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_05', 2, '出餐速度', '統計過去N天（不含當天）出餐均值，當天出餐時間超過均值即扣分', 6, 0, 7, '[{"condition":"over_avg_deduction","score":30}]', 1, 1, 7, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `deduction_per_order`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_06', 2, '拒絕接單', '統計天數內（含當天），每拒絕一單固定扣分，即時生效', 3, 0, 7, 80, 1, 1, 8, 'system'),
('STB_07', 2, '出餐超時', '統計天數內（不含當天），每超時一單固定扣分，即時生效', 3, 0, 7, 70, 1, 1, 9, 'system'),
('STB_08', 2, '取消訂單', '統計天數內（含當天），每取消一單固定扣分，即時生效', 3, 0, 7, 80, 1, 1, 10, 'system'),
('STB_09', 2, '超時接單', '統計天數內（含當天），每超時一單固定扣分，即時生效', 3, 0, 7, 60, 1, 1, 11, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `activity_items`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_ACT', 2, '活動加分', '店鋪報名參與系統活動即得固定加分；按活動ID配置，系統自動獲取活動名稱與狀態，每個活動獨立計分', 1, 0, '[]', 1, 1, 12, 'system');

-- ===== 平台維度 =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `decay_coefficient`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('PLT_01', 4, '距離衰減', '滿分按衰減係數×距離遞減，距離越遠得分越低', 2, 100, 5.0000, 1, 1, 1, 'system');

INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `time_range_scores`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('PLT_02A', 4, '配送範圍', '按時段配置配送範圍分層計分，後端根據當前時間自動匹配對應時段', 1, 0, '{"breakfast":{"short":80,"medium":60,"long":40,"crossBridge":20},"lunch":{"short":80,"medium":60,"long":40,"crossBridge":20},"afternoonTea":{"short":80,"medium":60,"long":40,"crossBridge":20},"dinner":{"short":80,"medium":60,"long":40,"crossBridge":20},"lateNight":{"short":80,"medium":60,"long":40,"crossBridge":20}}', 1, 1, 2, 'system');
