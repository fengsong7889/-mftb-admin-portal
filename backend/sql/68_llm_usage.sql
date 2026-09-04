-- ============================================================
-- 68_llm_usage.sql
-- AI 助手使用统计：请求级用量明细表 + 模型单价配置种子
-- 统计采用「存明细、实时聚合」模式（与充消对账一致），不建汇总表；
-- 费用按请求时刻的单价快照入库，后续调价不影响历史记录。
-- 注：菜单「AI 助手 > 使用統計」由 DataInitializer.seedSystemMenus 自动播种，无需在此插入。
-- ============================================================

CREATE TABLE IF NOT EXISTS biz_llm_usage (
    id                BIGINT       AUTO_INCREMENT PRIMARY KEY,
    username          VARCHAR(64)  NOT NULL                 COMMENT '使用账号（取自 JWT，不接受客户端传入）',
    mode              VARCHAR(16)  NOT NULL                 COMMENT '引擎模式: auto/primary/off-peak',
    channel           VARCHAR(16)  NOT NULL                 COMMENT '路由通道: primary=百炼QW / off-peak=DeepSeek',
    model             VARCHAR(64)  NOT NULL                 COMMENT '实际调用的模型（响应回传，回落时为真实接管模型）',
    prompt_tokens     INT          NOT NULL DEFAULT 0       COMMENT '输入 tokens',
    completion_tokens INT          NOT NULL DEFAULT 0       COMMENT '输出 tokens',
    cached_tokens     INT          NOT NULL DEFAULT 0       COMMENT '命中缓存的输入 tokens（按缓存单价计费）',
    cost              DECIMAL(12,6) NOT NULL DEFAULT 0      COMMENT '本次费用（请求时刻单价快照计算）',
    currency          VARCHAR(8)   NOT NULL DEFAULT ''      COMMENT '币种: CNY/USD；无单价配置时为空',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_time (username, created_at),
    INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手使用统计明细（请求级）';

-- 模型单价表（元/百万tokens）：只读配置，取自供应商官方价目表，不支持在页面手工改价
-- 如需更新价格，请修改此条记录并注明 source 与 as_of（仅影响其后产生的记录）
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
    ('llm_model_prices',
     '{"qwen3.7-flash":{"input":0.2,"output":0.8,"cachedInput":0.04,"currency":"CNY","source":"阿里云百炼官方价目表","asOf":"2026-09"},"deepseek-chat":{"input":0.22,"output":0.66,"currency":"USD","source":"DeepSeek官方价目表","asOf":"2026-09"},"deepseek-v4-flash":{"input":0.22,"output":0.66,"currency":"USD","source":"DeepSeek官方价目表","asOf":"2026-09"}}',
     'AI模型单价(元或美元/百万tokens)，只读，来源为供应商官方价目表');
