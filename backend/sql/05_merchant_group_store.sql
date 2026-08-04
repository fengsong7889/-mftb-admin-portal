-- ============================================================
-- MFTB 搜广推系统 - 商户集团管理 & 赠送管理
-- 数据库: MySQL 8.0+
-- 覆盖模块: 商户集团 / 门店 / 赠送记录 / 赠送消费流水
-- 注意: 使用 CREATE TABLE IF NOT EXISTS，幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、商户集团表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_merchant_group (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    group_code     VARCHAR(32)  NOT NULL                   COMMENT '集团ID（系统自增，如 JT000001）',
    group_name     VARCHAR(128) NOT NULL                   COMMENT '集团名称',
    login_account  VARCHAR(64)                             COMMENT '登录主账号',
    updated_by     VARCHAR(64)                             COMMENT '最后更新人',
    deleted        TINYINT      DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_group_code (group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商户集团表';

-- ============================================================
-- 二、门店表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_store (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    group_id       BIGINT       NOT NULL                   COMMENT '所属集团ID (关联 biz_merchant_group.id)',
    store_code     VARCHAR(32)  NOT NULL                   COMMENT '门店ID（系统自增，如 MD00001）',
    store_name     VARCHAR(128) NOT NULL                   COMMENT '门店名称',
    brand          VARCHAR(64)                             COMMENT '所属品牌: flashBee / mFood / flashBee,mFood',
    biz_channel    VARCHAR(128)                            COMMENT '业务频道（美食外賣/超市百貨/團購到店，可多选逗号分隔）',
    login_account  VARCHAR(64)                             COMMENT '登录主账号',
    region         INT                                     COMMENT '所在区域/商圈: 1=黑沙环区 … 11=黑沙滩区（与广告定价商圈枚举一致）',
    updated_by     VARCHAR(64)                             COMMENT '最后更新人',
    deleted        TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_store_group (group_id),
    UNIQUE KEY uk_store_code (store_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表';

-- ============================================================
-- 二.1、门店绑定BD关系表（一家门店可绑定多个BD）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_store_bd (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键',
    store_id       BIGINT       NOT NULL                   COMMENT '门店主键 (关联 biz_store.id)',
    bd_emp_id      VARCHAR(32)  NOT NULL                   COMMENT 'BD员工工号 (关联 sys_user.emp_id)',
    bd_name        VARCHAR(64)                             COMMENT 'BD员工姓名快照',
    created_by     VARCHAR(64)                             COMMENT '绑定人',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '绑定时间',
    UNIQUE KEY uk_store_bd (store_id, bd_emp_id),
    KEY idx_bd_emp (bd_emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店绑定BD关系表';

-- ============================================================
-- 三、赠送记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_gift_record (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    gift_id         VARCHAR(32)   NOT NULL                   COMMENT '赠送ID（业务生成，如 2401-001）',
    group_id        BIGINT        NOT NULL                   COMMENT '集团ID',
    group_name      VARCHAR(128)                             COMMENT '集团名称快照',
    store_id        BIGINT        NOT NULL                   COMMENT '门店ID',
    store_name      VARCHAR(128)                             COMMENT '门店名称快照',
    brand           VARCHAR(32)                              COMMENT '品牌',
    ad_type         VARCHAR(32)   NOT NULL                   COMMENT '广告类型: new_store/revival/exclusive/gold/ka',
    total_days      INT           NOT NULL                   COMMENT '赠送总天数',
    valid_days      INT           NOT NULL                   COMMENT '有效天数',
    used_days       INT           DEFAULT 0                  COMMENT '已使用天数',
    remaining_days  INT           NOT NULL                   COMMENT '剩余天数',
    gift_date       DATE                                     COMMENT '赠送日期',
    expire_date     DATE                                     COMMENT '到期日期',
    status          TINYINT       DEFAULT 1                  COMMENT '状态: 1=可用 2=已用完 3=已过期',
    reason          VARCHAR(500)                             COMMENT '赠送原因',
    credentials     TEXT                                     COMMENT '凭证URL JSON数组',
    approval_no     VARCHAR(64)                              COMMENT '审批流程编号',
    applicant       VARCHAR(64)                              COMMENT '申请人',
    apply_time      DATETIME                                 COMMENT '申请时间',
    approval_status TINYINT       DEFAULT 1                  COMMENT '审批状态: 1=未审批 2=已审批 3=驳回',
    updated_by      VARCHAR(64)                              COMMENT '最后更新人',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_gift_id (gift_id),
    KEY idx_gift_group (group_id),
    KEY idx_gift_store (store_id),
    KEY idx_gift_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赠送记录表';

-- ============================================================
-- 四、赠送消费流水表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_gift_consume (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    gift_record_id  BIGINT        NOT NULL                   COMMENT '关联赠送记录ID',
    gift_id         VARCHAR(32)                              COMMENT '关联赠送ID（冗余方便查询）',
    group_id        BIGINT                                   COMMENT '集团ID',
    group_name      VARCHAR(128)                             COMMENT '集团名称快照',
    store_id        BIGINT                                   COMMENT '门店ID',
    store_name      VARCHAR(128)                             COMMENT '门店名称快照',
    brand           VARCHAR(32)                              COMMENT '品牌',
    ad_type         VARCHAR(32)                              COMMENT '广告类型',
    trade_type      VARCHAR(32)   NOT NULL                   COMMENT '交易类型: ad_purchase/ad_refund/manual_deduct/auto_expire',
    balance_change  INT           NOT NULL                   COMMENT '余额变动（正=增加，负=减少）',
    change_date     DATE                                     COMMENT '变动日期',
    algorithm_id    VARCHAR(32)                              COMMENT '广告算法ID',
    algorithm_name  VARCHAR(128)                             COMMENT '广告算法名称',
    order_no        VARCHAR(64)                              COMMENT '关联订单号',
    remaining_days  INT                                      COMMENT '变动后剩余天数',
    remark          VARCHAR(500)                             COMMENT '备注',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    KEY idx_consume_gift_record (gift_record_id),
    KEY idx_consume_gift_id (gift_id),
    KEY idx_consume_group (group_id),
    KEY idx_consume_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赠送消费流水表';

-- ============================================================
-- 五、存量编码迁移（集团ID → JT 序列，门店ID → MD 序列）
-- 说明：ID 由系统自增生成，历史非标准编码按 id 顺序重编
-- 说明：必须先于初始种子数据执行，避免重复插入
-- ============================================================
SET @group_seq := (SELECT IFNULL(MAX(CAST(SUBSTRING(group_code, 3) AS UNSIGNED)), 0)
                   FROM biz_merchant_group WHERE group_code REGEXP '^JT[0-9]+$');
UPDATE biz_merchant_group
SET group_code = CONCAT('JT', LPAD(@group_seq := @group_seq + 1, 6, '0'))
WHERE group_code NOT REGEXP '^JT[0-9]{6}$'
ORDER BY id;

SET @store_seq := (SELECT IFNULL(MAX(CAST(SUBSTRING(store_code, 3) AS UNSIGNED)), 0)
                   FROM biz_store WHERE store_code REGEXP '^MD[0-9]+$');
UPDATE biz_store
SET store_code = CONCAT('MD', LPAD(@store_seq := @store_seq + 1, 5, '0'))
WHERE store_code NOT REGEXP '^MD[0-9]{5}$'
ORDER BY id;

-- ============================================================
-- 六、初始种子数据（幂等）
-- ============================================================

-- 示例集团
INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000001', '美味餐廳集團', 'group_g001'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000001');

INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000002', '生鮮超市集團', 'group_g002'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000002');

INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000003', '時尚百貨集團', 'group_g003'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000003');

INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000004', '速遞物流集團', 'group_g004'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000004');

INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000005', '甜品屋集團', 'group_g005'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000005');

INSERT INTO biz_merchant_group (group_code, group_name, login_account)
SELECT 'JT000006', '火鍋城集團', 'group_g006'
WHERE NOT EXISTS (SELECT 1 FROM biz_merchant_group WHERE group_code = 'JT000006');

-- 示例门店
INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00001', '澳門總店', 'mFood', '1,2', 'store_s1001'
FROM biz_merchant_group g WHERE g.group_code = 'JT000001'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00001');

INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00002', '氹仔分店', 'flashBee', '1', 'store_s1002'
FROM biz_merchant_group g WHERE g.group_code = 'JT000002'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00002');

INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00003', '新馬路店', 'mFood', '2', 'store_s1003'
FROM biz_merchant_group g WHERE g.group_code = 'JT000003'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00003');

INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00004', '黑沙環店', 'flashBee', '1', 'store_s1004'
FROM biz_merchant_group g WHERE g.group_code = 'JT000004'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00004');

INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00005', '官也街老店', 'mFood', '1,2', 'store_s1005'
FROM biz_merchant_group g WHERE g.group_code = 'JT000005'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00005');

INSERT INTO biz_store (group_id, store_code, store_name, brand, biz_channel, login_account)
SELECT g.id, 'MD00006', '珠海旗艦店', 'flashBee,mFood', '1,2,3', 'store_s1006'
FROM biz_merchant_group g WHERE g.group_code = 'JT000006'
AND NOT EXISTS (SELECT 1 FROM biz_store WHERE store_code = 'MD00006');

-- 赠送记录/消费流水不再提供示例种子数据：业务上尚未发生任何赠送，数据均由真实赠送操作产生
