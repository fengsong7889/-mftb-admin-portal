-- 154: 资产标签模板表 + 资产-标签绑定关系表
-- 标签模板：业务人员自定义标签样式（配色 + 展示字段），用于资产批量贴标
-- 绑定关系：资产与标签的多对多关联，每个资产至多 1 个主标签 + N 个次标签

-- 1. 资产标签模板表
CREATE TABLE IF NOT EXISTS biz_eam_asset_tag (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '标签名称',
    description VARCHAR(500) DEFAULT '' COMMENT '标签描述',
    bg_color VARCHAR(16) NOT NULL DEFAULT '#1890FF' COMMENT '标签背景色',
    text_color VARCHAR(16) NOT NULL DEFAULT '#FFFFFF' COMMENT '标签文字颜色',
    display_fields VARCHAR(500) NOT NULL DEFAULT '' COMMENT '展示字段配置（逗号分隔的资产字段 key 列表）',
    status VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
    sort INT NOT NULL DEFAULT 0 COMMENT '排序（升序）',
    updated_by VARCHAR(64) DEFAULT '' COMMENT '最后更新人',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    KEY idx_tag_status (status),
    KEY idx_tag_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产标签模板';

-- 2. 资产-标签绑定关系表
CREATE TABLE IF NOT EXISTS biz_eam_asset_tag_binding (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id BIGINT NOT NULL COMMENT '关联资产ID',
    tag_id BIGINT NOT NULL COMMENT '关联标签模板ID',
    is_primary TINYINT NOT NULL DEFAULT 0 COMMENT '是否主标签：1=是，0=否（每个资产至多 1 个主标签）',
    created_by VARCHAR(64) DEFAULT '' COMMENT '创建人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_asset_tag (asset_id, tag_id),
    KEY idx_binding_asset (asset_id),
    KEY idx_binding_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产-标签绑定关系';
