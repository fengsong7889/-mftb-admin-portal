-- ============================================================
-- MFTB 搜广推系统 - 瀑布流策略模块
-- 数据库: MySQL 8.0+
-- 业务规则:
--   1. 一条瀑布流策略 = 一条 biz_ad_waterfall 记录, 主键即「配置ID」, 被 APP 引用
--   2. 一条配置可配置多个坑位(biz_ad_waterfall_slot), 一个坑位只能展示一种算法
--   3. 同一个算法可配置在不同的坑位
--   4. 未配置的坑位由 APP 端读取「自然流量」数据:
--      主表 natural_algo_id 指定自然流量兜底算法, 所有未配置坑位统一读取该算法
--      计算出来的数据(用户可能刷几百/几千页, 无法逐坑位人工配置)
-- 注意: 使用 CREATE TABLE IF NOT EXISTS, 幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、瀑布流策略主表（对应前端「瀑布流策略」菜单列表）
-- id 即配置ID, APP 按该 ID 引用本条配置渲染瀑布流
-- natural_algo_id: 自然流量兜底算法(关联 biz_ad_algorithm.id),
--   未配置坑位统一读取该算法数据; 为空表示未配置兜底算法
-- filter_dislike: 过滤用户不喜欢开关
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_waterfall (
    id                BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID(配置ID, APP引用)',
    strategy_name     VARCHAR(128) NOT NULL                   COMMENT '瀑布流名称',
    brand             VARCHAR(64)                             COMMENT '所属品牌: flashBee=闪蜂 / mFood',
    natural_algo_id   BIGINT                                  COMMENT '自然流量兜底算法ID(关联 biz_ad_algorithm.id, 未配置坑位读取该算法数据)',
    natural_algo_name VARCHAR(128)                            COMMENT '自然流量算法名称快照',
    filter_dislike    TINYINT      NOT NULL DEFAULT 2         COMMENT '过滤用户不喜欢: 1=开启 2=关闭',
    status            TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark            VARCHAR(500)                            COMMENT '备注',
    updated_by        VARCHAR(64)                             COMMENT '最后更新人',
    deleted           TINYINT      DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_waterfall_brand (brand),
    KEY idx_ad_waterfall_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='瀑布流策略主表';

-- ============================================================
-- 二、瀑布流坑位明细表（一条配置 N 个坑位）
-- 业务规则: 一个坑位(slot_position)只能展示一种算法, 唯一性在应用层校验
--           (逻辑删除场景下不加硬唯一约束, 与订单独家占规则一致)
-- 同一个算法(algo_id)允许出现在多个坑位
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_waterfall_slot (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    waterfall_id  BIGINT       NOT NULL                   COMMENT '瀑布流策略ID (biz_ad_waterfall.id)',
    slot_position INT          NOT NULL                   COMMENT '坑位序号(从1开始)',
    algo_id       BIGINT       NOT NULL                   COMMENT '算法ID (关联 biz_ad_algorithm.id)',
    algo_name     VARCHAR(128)                            COMMENT '算法名称快照',
    algo_type     TINYINT                                 COMMENT '算法类型快照: 1=无敌星星 2=新店广告 3=盘活复苏 ...',
    status        TINYINT      NOT NULL DEFAULT 1         COMMENT '坑位状态: 1=启用 2=停用',
    deleted       TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_wf_slot_waterfall (waterfall_id),
    KEY idx_ad_wf_slot_algo (algo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='瀑布流坑位明细表';

