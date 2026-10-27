-- 卡片排序持久化表（全局共享，按 menu_key + tab_key 维度保存，所有用户同一排序）
CREATE TABLE IF NOT EXISTS sys_card_order (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    menu_key VARCHAR(50) NOT NULL COMMENT '菜单标识: algorithm / waterfall / ad-sales',
    tab_key VARCHAR(20) NOT NULL COMMENT 'Tab标识: delivery / groupBuy',
    card_order JSON NOT NULL COMMENT '卡片类型顺序 JSON 数组, 如 [1,3,2,5]',
    updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_menu_tab (menu_key, tab_key)
) COMMENT='卡片排序配置表';
