-- =====================================================================
-- 61_store_data_config.sql
-- 門店金字招牌數據配置表：按門店存儲資格判斷所需的運營數據閾值
-- 首次訪問某門店配置時由後端按 store_id 種子確定性隨機預生成（見
-- StoreDataConfigServiceImpl / BizDataInitializer），免去逐個手工配置
-- =====================================================================

CREATE TABLE IF NOT EXISTS biz_store_data_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主鍵ID',
    store_id BIGINT NOT NULL COMMENT '門店主鍵 (關聯 biz_store.id)',
    monthly_orders INT NOT NULL DEFAULT 0 COMMENT '月訂單數',
    monthly_repurchase_orders INT NOT NULL DEFAULT 0 COMMENT '月復購訂單數據',
    monthly_positive_orders INT NOT NULL DEFAULT 0 COMMENT '月好評訂單數據',
    monthly_visits INT NOT NULL DEFAULT 0 COMMENT '月訪問量',
    store_favorites INT NOT NULL DEFAULT 0 COMMENT '門店收藏數',
    monthly_customers INT NOT NULL DEFAULT 0 COMMENT '顧客數',
    updated_by VARCHAR(64) NULL COMMENT '最後更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    UNIQUE KEY uk_store_id (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='門店金字招牌數據配置表';
