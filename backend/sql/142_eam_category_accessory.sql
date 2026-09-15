-- =====================================================================
-- 142: EAM 分类配件配置表
--   品牌产品库按「分类」统一配置常用配件（如手机分类统一配置数据线、说明书），
--   同分类下所有产品（iPhone 15/16/17/Pro/Max 等）验收时共用并可一键带入，
--   避免逐个产品配置配件导致维护成本过高。
-- =====================================================================

CREATE TABLE IF NOT EXISTS biz_eam_category_accessory (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    category_code VARCHAR(32) NOT NULL COMMENT '所属分类编码（同分类下所有产品共用）',
    name VARCHAR(64) NOT NULL COMMENT '配件名称',
    default_qty INT NOT NULL DEFAULT 1 COMMENT '默认数量',
    sort INT NOT NULL DEFAULT 0 COMMENT '排序（越小越靠前）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常, 1=已删除',
    PRIMARY KEY (id),
    KEY idx_eca_category_code (category_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = 'EAM分类配件配置表';
