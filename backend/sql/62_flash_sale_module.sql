-- 62. 秒杀模块（团购管理重构一期）
-- 数据流: 登记(register) -> 统计(stats) -> 每日汇总(summary)；期数(period)为核心维度
-- 执行时间: 2026-08-26

-- 期数表
CREATE TABLE IF NOT EXISTS biz_flash_sale_period (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_no INT NOT NULL COMMENT '期数（如 85）',
  start_date DATE NULL COMMENT '开始日期',
  end_date DATE NULL COMMENT '结束日期',
  status TINYINT NOT NULL DEFAULT 2 COMMENT '状态: 1=进行中, 2=已结束',
  remark VARCHAR(255) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_period_no (period_no)
) COMMENT '秒杀期数表';

-- 商品登记表
CREATE TABLE IF NOT EXISTS biz_flash_sale_register (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id BIGINT NOT NULL COMMENT '期数ID',
  seq_no INT NULL COMMENT '序号',
  subsidy_type VARCHAR(20) NOT NULL COMMENT '补贴类型: ka/procurement/bd_submit/platform/merchant',
  store_codes VARCHAR(512) NULL COMMENT '门店编码（多个逗号分隔，引用门店管理）',
  store_names VARCHAR(1024) NULL COMMENT '门店名称（冗余展示）',
  bd_names VARCHAR(255) NULL COMMENT 'BD姓名（门店-BD 自动带出快照，多个逗号分隔）',
  product_id VARCHAR(32) NOT NULL COMMENT '商品ID',
  product_name VARCHAR(255) NULL COMMENT '商品名称',
  product_type VARCHAR(20) NULL COMMENT '商品类型: tuan_dan=团单, voucher=代金券',
  max_purchase VARCHAR(50) NULL COMMENT '每人最多购买（自由文本: 不限购/限购1/阶梯限购1…）',
  price_type VARCHAR(10) NOT NULL DEFAULT 'single' COMMENT '价格类型: single=单一价格, tier=阶梯价格',
  original_price DECIMAL(10,2) NULL COMMENT '原价',
  group_price DECIMAL(10,2) NULL COMMENT '团购价',
  flash_sale_price DECIMAL(10,2) NULL COMMENT '秒杀价（单一价格）',
  flash_sale_stock INT NULL COMMENT '秒杀库存（单一价格）',
  current_sales INT NOT NULL DEFAULT 0 COMMENT '本期秒杀销量（统计导入后回填）',
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_period_product (period_id, product_id),
  KEY idx_period (period_id)
) COMMENT '秒杀商品登记表';

-- 秒杀价阶梯表（登记/统计共用）
CREATE TABLE IF NOT EXISTS biz_flash_sale_price_tier (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_type VARCHAR(10) NOT NULL COMMENT '归属: register=登记, stats=统计',
  owner_id BIGINT NOT NULL COMMENT '归属记录ID',
  tier_no INT NOT NULL COMMENT '阶梯序号（从1开始）',
  tier_price DECIMAL(10,2) NOT NULL COMMENT '阶梯价',
  tier_stock INT NOT NULL DEFAULT 0 COMMENT '阶梯库存',
  tier_subsidy DECIMAL(10,2) NULL COMMENT '阶梯补贴（统计来源可为 NULL）',
  KEY idx_owner (owner_type, owner_id)
) COMMENT '秒杀价阶梯表';

-- 商品统计表
CREATE TABLE IF NOT EXISTS biz_flash_sale_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id BIGINT NOT NULL COMMENT '期数ID',
  product_id VARCHAR(32) NOT NULL COMMENT '商品ID',
  product_name VARCHAR(255) NULL COMMENT '商品名称',
  store_names TEXT NULL COMMENT '商品门店（多个分号分隔）',
  price_type VARCHAR(10) NOT NULL DEFAULT 'single' COMMENT '价格类型: single/tier',
  flash_sale_price DECIMAL(10,2) NULL COMMENT '秒杀价（单一价格）',
  order_users INT NULL COMMENT '下单用户',
  total_price DECIMAL(12,2) NULL COMMENT '总价',
  total_orders INT NULL COMMENT '订单总数',
  total_sales INT NULL COMMENT '商品总销量',
  actual_amount DECIMAL(12,2) NULL COMMENT '实付金额',
  order_users_change DECIMAL(10,4) NULL COMMENT '下单用户环比（NULL=无上期数据）',
  total_price_change DECIMAL(10,4) NULL COMMENT '总价环比',
  total_orders_change DECIMAL(10,4) NULL COMMENT '订单总数环比',
  total_sales_change DECIMAL(10,4) NULL COMMENT '商品总销量环比',
  actual_amount_change DECIMAL(10,4) NULL COMMENT '实付金额环比',
  subsidy_type VARCHAR(20) NULL COMMENT '是否补贴品: ka/procurement/bd_submit/platform/none',
  discount_rate DECIMAL(10,6) NULL COMMENT '折扣率',
  last_period_subsidy VARCHAR(20) NULL COMMENT '上期有无补贴: 5类/none/none_data=无上期数据',
  bd_name VARCHAR(50) NULL COMMENT '所属BD',
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_period_product (period_id, product_id),
  KEY idx_period (period_id)
) COMMENT '秒杀商品统计表';

-- 每日汇总表
CREATE TABLE IF NOT EXISTS biz_flash_sale_summary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id BIGINT NOT NULL COMMENT '期数ID',
  stat_date DATE NULL COMMENT '统计日期（NULL=整期合计行）',
  total_payable DECIMAL(12,2) NULL COMMENT '总应付金额',
  total_actual DECIMAL(12,2) NULL COMMENT '总实付金额',
  total_orders INT NULL COMMENT '订单总数',
  total_sales INT NULL COMMENT '商品总销量',
  total_products INT NULL COMMENT '总商品数',
  sold_products INT NULL COMMENT '动销商品数',
  buyers INT NULL COMMENT '购买人数(已去重)',
  repurchase_buyers INT NULL COMMENT '复购人数',
  repurchase_rate DECIMAL(10,6) NULL COMMENT '复购率',
  avg_order_value DECIMAL(10,2) NULL COMMENT '人均客单价',
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_period_date (period_id, stat_date)
) COMMENT '秒杀每日汇总表';

-- 黑榜阈值配置（连续3期销量低于该值标记黑榜）
INSERT INTO sys_config (config_key, config_value, description)
SELECT 'flash_sale_blacklist_threshold', '10', '秒杀近3期销量黑榜阈值'
WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'flash_sale_blacklist_threshold');

-- 种子期数: 第84/85期
INSERT INTO biz_flash_sale_period (period_no, start_date, end_date, status, remark)
SELECT 84, '2026-08-06', '2026-08-08', 2, '第84期秒杀'
WHERE NOT EXISTS (SELECT 1 FROM biz_flash_sale_period WHERE period_no = 84);
INSERT INTO biz_flash_sale_period (period_no, start_date, end_date, status, remark)
SELECT 85, '2026-08-13', '2026-08-15', 2, '第85期秒杀'
WHERE NOT EXISTS (SELECT 1 FROM biz_flash_sale_period WHERE period_no = 85);
