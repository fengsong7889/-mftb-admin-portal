-- 147: 供应商联系人表（支持一个供应商配置多个联系人及电话）
-- 旧字段 biz_eam_supplier.contact_person / contact_phone 保留兼容已有采购订单数据，不再写入新数据

-- 1. 新建联系人关联表
CREATE TABLE IF NOT EXISTS biz_eam_supplier_contact (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    supplier_id BIGINT NOT NULL COMMENT '关联供应商ID',
    contact_name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
    contact_phone VARCHAR(64) DEFAULT NULL COMMENT '联系电话',
    status VARCHAR(16) DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted TINYINT DEFAULT 0,
    KEY idx_contact_supplier (supplier_id),
    KEY idx_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商联系人';
