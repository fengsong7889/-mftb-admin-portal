-- ============================================================
-- MFTB 搜广推系统 - 推广金消费风控配置
-- 背景: 分期充值（混合支付/营业额支付）集团消费后关店跑路，欠款无法追回
-- 规则:
--   1. 无未结清欠款的集团不限制消费
--   2. 有欠款的集团按风控模式限额:
--      pool  = 已付池限额: 可用 = 累计已付 - 累计已消费 + 当月提前释放额度
--      fixed = 自定义额度: 可用 = 自定义上限 - 累计已消费
--      exempt= 白名单豁免: 优质集团（连锁/大型餐饮）不限额
--   3. 转账金额按 FIFO 模拟拆分，触碰含未结清欠款的批次则拦截
-- 幂等: CREATE TABLE IF NOT EXISTS + INSERT ... WHERE NOT EXISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS biz_fin_risk_config (
    id                     BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    group_code             VARCHAR(32)   NOT NULL                   COMMENT '集团ID (关联 biz_merchant_group.group_code)',
    group_name             VARCHAR(128)  NOT NULL                   COMMENT '集团名称快照',
    brand                  VARCHAR(64)   NOT NULL                   COMMENT '所属品牌: flashBee=闪蜂 / mFood',
    risk_mode              VARCHAR(16)   NOT NULL DEFAULT 'pool'    COMMENT '风控模式: pool=已付池限额 fixed=自定义额度 exempt=白名单豁免',
    monthly_release_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '每月提前释放额度 (pool模式, 仅当前自然月生效, 不超过未结清欠款)',
    fixed_limit_amount     DECIMAL(14,2) NULL                       COMMENT '自定义限额 (fixed模式, 累计消费上限)',
    remark                 VARCHAR(500)  NULL                       COMMENT '备注 (白名单原因等)',
    updated_by             VARCHAR(64)   NULL                       COMMENT '最后更新人',
    deleted                TINYINT       DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at             DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at             DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_risk_group_brand (group_code, brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广金消费风控配置表';

-- 「消费风控」菜单由后端 DataInitializer.seedSystemMenus() 启动时自动种子化（含 admin 角色授权），无需手工插入

