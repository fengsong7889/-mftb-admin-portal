-- =====================================================================
-- 185_purchase_company.sql
-- 购买公司字典（耗材/资产按公司核算消耗的前置基础数据）
--   将「购买公司」从前端硬编码字符串（珠海闪蜂/珠海麦峰）升级为后端受控字典，
--   耗材档案与业务单据按 purchase_company_id 引用，名称作快照冗余。
--   注意：购买公司与「所属品牌」(sys_company_brand 閃蜂/mFood) 是两个独立维度，
--         本表不与品牌建立强绑定关系，仅种子初始两家公司。
--   实际幂等由 SysPurchaseCompanySchemaInitializer / 应用启动迁移保证，
--   本文件供手动建库与 SQLPub 平台执行使用。
-- =====================================================================

CREATE TABLE IF NOT EXISTS sys_purchase_company (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL COMMENT '公司稳定编码（如 SFCO/MFCO）',
    name        VARCHAR(128) NOT NULL COMMENT '公司全称',
    short_name  VARCHAR(64)  DEFAULT '' COMMENT '公司简称',
    status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序号（越小越靠前）',
    remark      VARCHAR(500) DEFAULT '' COMMENT '备注',
    created_by  VARCHAR(64)  DEFAULT '' COMMENT '创建人',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by  VARCHAR(64)  DEFAULT '' COMMENT '最后更新人',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted     TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_purchase_company_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='购买公司字典';

-- 种子数据（INSERT IGNORE 幂等，以 code 唯一）
INSERT IGNORE INTO sys_purchase_company (code, name, short_name, status, sort_order)
VALUES ('SFCO', '珠海閃蜂科技有限公司', '閃蜂', 1, 1);

INSERT IGNORE INTO sys_purchase_company (code, name, short_name, status, sort_order)
VALUES ('MFCO', '珠海麥峰科技有限公司', 'mFood', 1, 2);
