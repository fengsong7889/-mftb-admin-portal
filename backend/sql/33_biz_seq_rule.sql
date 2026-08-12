-- =============================================================
-- 33_biz_seq_rule.sql
-- 编号生成规则配置表（对应前端「规则配置 > 编号生成规则」模块）
-- 后端 BizSeqService 统一读取本表生成各类业务编号
-- =============================================================

CREATE TABLE IF NOT EXISTS `sys_biz_seq_rule` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `rule_key`    VARCHAR(64)  NOT NULL COMMENT '规则唯一标识（与前端 key 一致）',
    `rule_name`   VARCHAR(64)  NOT NULL COMMENT '业务类型名称',
    `biz_menu`    VARCHAR(64)  NULL COMMENT '所属菜单',
    `prefix`      VARCHAR(16)  NOT NULL COMMENT '编号前缀',
    `date_format` VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '日期格式: YYYYMMDD / YYMM / 空=无日期维度',
    `seq_length`  INT          NOT NULL DEFAULT 4 COMMENT '自增序号位数',
    `seq_start`   INT          NOT NULL DEFAULT 0 COMMENT '序号起始: 0=从0000起 1=从0001起',
    `remark`      VARCHAR(255) NULL COMMENT '备注',
    `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 1=启用 0=停用',
    `created_at`  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_seq_rule_key` (`rule_key`),
    UNIQUE KEY `uk_seq_rule_prefix` (`prefix`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '编号生成规则配置表';

-- 种子数据（与前端 constants/ruleConfig.tsx 中「编号生成规则」一致，幂等写入）
INSERT IGNORE INTO `sys_biz_seq_rule` (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `remark`) VALUES
-- 商户集团管理
('merchant_group',       '集團ID',           '商戶集團管理', 'JT',   '',         6, 1, '{prefix} + {n}位自增序號（取表內最大序號+1）'),
('store',                '門店ID',           '商戶集團管理', 'MD',   '',         6, 1, '{prefix} + {n}位固定序號（無日期維度，全局自增）'),
-- 算法库
('algo_star',            '無敵星星算法ID',   '算法庫',       'SFWD', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_new_store',       '新店廣告算法ID',   '算法庫',       'SFXD', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_revive',          '盤活復蘇算法ID',   '算法庫',       'SFPH', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_traffic',         '流量廣告算法ID',   '算法庫',       'SFLL', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_popular',         '人氣商家算法ID',   '算法庫',       'SFRQ', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_exclusive',       '獨家商家算法ID',   '算法庫',       'SFDJ', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_guess',           '猜你喜歡算法ID',   '算法庫',       'SFXH', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_organic',         '自然流量算法ID',   '算法庫',       'SFZR', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('algo_brand',           '品牌商家算法ID',   '算法庫',       'SFPP', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 瀑布流配置
('config_waterfall',     '瀑布流策略',       '瀑布流配置',   'PB',   'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 广告销售（订单）
('ad_order_star',        '無敵星星訂單',     '廣告銷售',     'DDWD', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('ad_order_new_store',   '新店廣告訂單',     '廣告銷售',     'DDXD', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('ad_order_revive',      '盤活復蘇訂單',     '廣告銷售',     'DDPH', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('ad_order_traffic',     '流量廣告訂單',     '廣告銷售',     'DDLL', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('ad_order_popular',     '人氣商家訂單',     '廣告銷售',     'DDRQ', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 广告销售（定价）
('config_pricing_star',  '無敵星星定價',     '廣告銷售',     'DJWD', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_hot',   '人氣商家定價',     '廣告銷售',     'DJRQ', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('config_pricing_revive','盤活復蘇定價',     '廣告銷售',     'DJPH', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 推广赠送
('gift_new_store',       '新店廣告贈送ID',   '推廣贈送',     'XDZS', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('gift_popular',         '人氣商家贈送ID',   '推廣贈送',     'RQZS', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('gift_revive',          '盤活復蘇贈送ID',   '推廣贈送',     'PHZS', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 批次查询
('batch_recharge',       '充值批次',         '批次查詢',     'CZPC', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('batch_transfer',       '轉賬批次',         '批次查詢',     'ZZPC', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('batch_merge',          '合併批次',         '批次查詢',     'HBPC', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 明细查询
('detail',               '交易明細編號',     '明細查詢',     'MX',   'YYYYMMDD', 6, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 欠款对账
('debt',                 '欠款單編號',       '欠款對賬',     'QK',   'YYYYMMDD', 5, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 审批中心
('recharge',             '充值流程編號',     '審批中心',     'CZ',   'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('deduct',               '扣款流程編號',     '審批中心',     'KK',   'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('transfer',             '轉賬流程編號',     '審批中心',     'ZZ',   'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('merge',                '合併流程編號',     '審批中心',     'HB',   'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
('gift_approval',        '贈送流程編號',     '審批中心',     'ZS',   'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號'),
-- 集团人事（员工/部门/职位）
('employee_no',          '工號',             '員工管理',     'MF',   '',         5, 1, '{prefix} + {n}位自增序號（全局自增）'),
('dept_code',            '部門編碼',         '組織管理',     'BM',   '',         5, 1, '{prefix} + {n}位自增序號（全局自增）'),
('position_id',          '職位ID',           '職位管理',     'ZW',   '',         5, 1, '{prefix} + {n}位自增序號（全局自增）');

-- =============================================================
-- 业务表补充编号字段（按规则生成后落库）
-- =============================================================

-- 瀑布流策略编号（规则 config_waterfall，如 PB20260812000）
ALTER TABLE `biz_ad_waterfall`
    ADD COLUMN `strategy_code` VARCHAR(32) NULL COMMENT '策略编号（按编号生成规则 config_waterfall 生成）' AFTER `id`;

-- 销售定价编号（规则 config_pricing_*，如 DJWD20260812000）
ALTER TABLE `biz_ad_pricing_star`
    ADD COLUMN `pricing_no` VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_star 生成）' AFTER `id`;
ALTER TABLE `biz_ad_pricing_hot`
    ADD COLUMN `pricing_no` VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_hot 生成）' AFTER `id`;
ALTER TABLE `biz_ad_pricing_revive`
    ADD COLUMN `pricing_no` VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_revive 生成）' AFTER `id`;

-- 职位ID（规则 position_id，如 ZW00001）
ALTER TABLE `sys_position`
    ADD COLUMN `code` VARCHAR(32) NULL COMMENT '职位ID（按编号生成规则 position_id 生成）' AFTER `id`;
