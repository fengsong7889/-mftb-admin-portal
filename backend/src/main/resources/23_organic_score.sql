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
  `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主鍵',
  `rule_code`    VARCHAR(50)   NOT NULL COMMENT '規則編碼（COM_01 / STB_01 / PLT_01 等）',
  `dimension`    INT           NOT NULL COMMENT '所屬維度: 1=商業 2=店鋪 4=平台',
  `name`         VARCHAR(100)  NOT NULL COMMENT '規則名稱',
  `description`  VARCHAR(500)  DEFAULT '' COMMENT '計分說明',
  `mode`         INT           NOT NULL COMMENT '計分方式: 1=規則加分 2=衰減函數 3=規則減分 4=金額倍率 5=梯度計分',
  `score`        INT           NOT NULL DEFAULT 0 COMMENT '分值（扣分為負值；金額倍率時填倍率）',
  `stat_days`    INT           DEFAULT NULL COMMENT '統計天數（僅部分規則需要）',
  `range_scores` JSON          DEFAULT NULL COMMENT '配送範圍分層分數 JSON: {"short":80,"medium":60,"long":40,"crossBridge":20}',
  `tiers`        JSON          DEFAULT NULL COMMENT '梯度檔位 JSON: [{"threshold":50,"direction":"LESS_THAN","score":20}]',
  `calc_cycle`   VARCHAR(20)   DEFAULT NULL COMMENT '計算周期: NIGHTLY=每晚統計 DAILY=按當天',
  `status`       INT           NOT NULL DEFAULT 1 COMMENT '服務狀態: 1=啟用 2=停用',
  `builtin`      TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否系統內置: 1=是 0=否',
  `sort_order`   INT           NOT NULL DEFAULT 0 COMMENT '排序號',
  `updated_by`   VARCHAR(50)   DEFAULT NULL COMMENT '最後更新人',
  `deleted`      INT           NOT NULL DEFAULT 0 COMMENT '邏輯刪除: 0=正常 1=已刪除',
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
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
-- 初始化數據：29 條評分規則（含前端界面現有全部評分項）
-- ============================================================

-- ===== 商業維度（10 條） =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `range_scores`, `tiers`, `calc_cycle`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('COM_01', 1, '滿額立減', '商家參與滿額立減活動固定加分', 1, 30, NULL, NULL, NULL, NULL, 1, 1, 1, 'system'),
('COM_02', 1, '減免運費', '商家減免配送運費固定加分', 1, 20, NULL, NULL, NULL, NULL, 1, 1, 2, 'system'),
('COM_03', 1, '進店領券', '浮動計分：得分 = 領券金額 × 倍率', 4, 2, NULL, NULL, NULL, NULL, 1, 1, 3, 'system'),
('COM_04', 1, '新客立減', '商家參與新客立減活動固定加分', 1, 30, NULL, NULL, NULL, NULL, 1, 1, 4, 'system'),
('COM_05', 1, '收藏送券', '浮動計分：得分 = 贈券金額 × 倍率', 4, 2, NULL, NULL, NULL, NULL, 1, 1, 5, 'system'),
('COM_06', 1, '會員紅包-按金額', '浮動計分：得分 = 紅包金額 × 倍率，如紅包 10 元、倍率 2 則得 20 分', 4, 2, NULL, NULL, NULL, NULL, 1, 1, 6, 'system'),
('COM_07', 1, '閃蜂官方神券-按金額', '浮動計分：得分 = 券金額 × 倍率', 4, 2, NULL, NULL, NULL, NULL, 1, 1, 7, 'system'),
('COM_08', 1, '滿額立減-按平均折扣', '浮動計分：得分 = 商家出資金額 × 倍率', 4, 2, NULL, NULL, NULL, NULL, 1, 1, 8, 'system'),
('COM_09', 1, '購買廣告-點金廣告', '購買點金廣告投放期內加分', 1, 80, NULL, NULL, NULL, NULL, 1, 1, 9, 'system'),
('COM_10', 1, '購買廣告-金字招牌', '購買金字招牌廣告投放期內加分', 1, 100, NULL, NULL, NULL, NULL, 1, 1, 10, 'system');

-- ===== 店鋪維度（13 條） =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `range_scores`, `tiers`, `calc_cycle`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STB_01', 2, '主營時段', '主營時段配置完整，當前處於主營時段內加分', 1, 60, NULL, NULL, NULL, NULL, 1, 1, 1, 'system'),
('STB_04', 2, '店鋪標籤-金牌', '金牌店鋪身份標籤加分', 1, 60, NULL, NULL, NULL, NULL, 1, 1, 2, 'system'),
('STO_01', 2, '營業狀態', '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', 1, 100, NULL, NULL, NULL, NULL, 1, 1, 3, 'system'),
('STO_02A', 2, '好評得分', '統計天數內好評數量加分，好評越多得分越高', 1, 100, 30, NULL, NULL, NULL, 1, 1, 4, 'system'),
('STO_02B', 2, '差評得分', '統計天數內差評數量扣分，差評越多扣分越多', 3, -100, 30, NULL, NULL, NULL, 1, 1, 5, 'system'),
('STO_03', 2, '店鋪銷量扶持', '統計有效訂單數，按梯度加分：訂單越多得分越高', 5, 0, NULL, NULL, '[{"threshold":50,"direction":"LESS_THAN","score":20,"statDays":30},{"threshold":100,"direction":"LESS_THAN","score":40,"statDays":30},{"threshold":200,"direction":"LESS_THAN","score":60,"statDays":30},{"threshold":500,"direction":"LESS_THAN","score":80,"statDays":30},{"threshold":500,"direction":"MORE_THAN","score":100,"statDays":30}]', NULL, 1, 1, 6, 'system'),
('STO_03B', 2, '當天訂單超量扣分', '按當天計算，訂單超過閾值按梯度扣分，防止刷單', 5, 0, NULL, NULL, '[{"threshold":200,"direction":"MORE_THAN","score":-10},{"threshold":500,"direction":"MORE_THAN","score":-30},{"threshold":1000,"direction":"MORE_THAN","score":-60}]', 'DAILY', 1, 1, 7, 'system'),
('STO_04', 2, '出餐速度', '平均出餐時長越短得分越高，店鋪自身效率指標', 2, 90, NULL, NULL, NULL, NULL, 1, 1, 8, 'system'),
('STO_05', 2, '拒絕訂單', '商家拒絕訂單按次扣分', 3, -80, NULL, NULL, NULL, NULL, 1, 1, 9, 'system'),
('STO_07', 2, '出餐超時', '超出承諾出餐時長的訂單按佔比扣分', 3, -70, NULL, NULL, NULL, NULL, 1, 1, 10, 'system'),
('STO_08', 2, '取消訂單', '商家主動取消訂單按次扣分', 3, -80, NULL, NULL, NULL, NULL, 1, 1, 11, 'system'),
('STO_09', 2, '超時接單', '超出接單時限未接單按次扣分', 3, -60, NULL, NULL, NULL, NULL, 1, 1, 12, 'system');

-- ===== 平台維度（6 條） =====
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `range_scores`, `tiers`, `calc_cycle`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('PLT_01', 4, '距離衰減', 'e^(-k×距離km)，距離越遠得分越低', 2, 100, NULL, NULL, NULL, NULL, 1, 1, 1, 'system'),
('PLT_02A', 4, '配送範圍-早餐', '早餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', 1, 80, NULL, '{"short":80,"medium":60,"long":40,"crossBridge":20}', NULL, NULL, 1, 1, 2, 'system'),
('PLT_02B', 4, '配送範圍-午餐', '午餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', 1, 80, NULL, '{"short":80,"medium":60,"long":40,"crossBridge":20}', NULL, NULL, 1, 1, 3, 'system'),
('PLT_02C', 4, '配送範圍-下午茶', '下午茶時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', 1, 80, NULL, '{"short":80,"medium":60,"long":40,"crossBridge":20}', NULL, NULL, 1, 1, 4, 'system'),
('PLT_02D', 4, '配送範圍-晚餐', '晚餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', 1, 80, NULL, '{"short":80,"medium":60,"long":40,"crossBridge":20}', NULL, NULL, 1, 1, 5, 'system'),
('PLT_02E', 4, '配送範圍-夜宵', '夜宵時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', 1, 80, NULL, '{"short":80,"medium":60,"long":40,"crossBridge":20}', NULL, NULL, 1, 1, 6, 'system');

-- ============================================================
-- 數據遷移：更新已存在的 STO_03 記錄（重命名 + 梯度檔位增加 statDays）
-- INSERT IGNORE 保證冪等：首次刪除後重新插入，後續運行 DELETE 無影響、INSERT 因唯一鍵跳過
-- ============================================================
DELETE FROM `biz_organic_score_rule` WHERE `rule_code` = 'STO_03';
INSERT IGNORE INTO `biz_organic_score_rule` (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `stat_days`, `range_scores`, `tiers`, `calc_cycle`, `status`, `builtin`, `sort_order`, `updated_by`) VALUES
('STO_03', 2, '店鋪銷量扶持', '統計有效訂單數，按梯度加分：訂單越多得分越高', 5, 0, NULL, NULL, '[{"threshold":50,"direction":"LESS_THAN","score":20,"statDays":30},{"threshold":100,"direction":"LESS_THAN","score":40,"statDays":30},{"threshold":200,"direction":"LESS_THAN","score":60,"statDays":30},{"threshold":500,"direction":"LESS_THAN","score":80,"statDays":30},{"threshold":500,"direction":"MORE_THAN","score":100,"statDays":30}]', NULL, 1, 1, 6, 'system');
