-- =====================================================================
-- 149: 公司品牌管理表
--   将公司品牌（闪蜂/mFood 等）从前端硬编码改为后端表管理
--   支持动态新增品牌、修改编码/标签，前端从 API 加载
-- =====================================================================

CREATE TABLE IF NOT EXISTS sys_company_brand (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL COMMENT '品牌编码（用于资产编号前缀，如 TB/MF）',
    label_zh    VARCHAR(100) NOT NULL COMMENT '品牌中文名称',
    label_en    VARCHAR(100) DEFAULT '' COMMENT '品牌英文名称',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序号（越小越靠前）',
    status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    remark      VARCHAR(500) DEFAULT '' COMMENT '备注',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by  VARCHAR(64)  DEFAULT '' COMMENT '最后更新人',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted     TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公司品牌配置表';

-- 种子数据（INSERT IGNORE 幂等）
INSERT IGNORE INTO sys_company_brand (id, code, label_zh, label_en, sort_order, status)
VALUES (1, 'TB', '閃蜂', 'FlashBee', 1, 1);

INSERT IGNORE INTO sys_company_brand (id, code, label_zh, label_en, sort_order, status)
VALUES (2, 'MF', 'mFood', 'mFood', 2, 1);
