-- 39_workflow_config.sql
-- 流程配置表：存储各业务流程的审批开关配置
-- 前端「流程配置」菜单管理，控制对应流程是否需要进入审批环节

CREATE TABLE IF NOT EXISTS biz_workflow_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    flow_type VARCHAR(32) NOT NULL UNIQUE COMMENT '流程类型标识: recharge/deduct/transfer/merge/gift',
    flow_name VARCHAR(64) NOT NULL COMMENT '流程展示名称',
    approval_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '审批开关: 1=启用审批, 0=停用(直接执行)',
    description VARCHAR(200) DEFAULT NULL COMMENT '流程说明',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_workflow_flow_type (flow_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程配置表';

-- 种子数据：5种流程配置（默认全部启用审批）
INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description)
VALUES
    ('recharge', '推廣金充值', 1, '推廣金充值操作，啟用後需經過三級審批（業務主管->運營主管->財務主管）'),
    ('deduct', '推廣金扣款', 1, '推廣金扣款操作，啟用後需經過三級審批'),
    ('transfer', '推廣金轉賬', 1, '推廣金轉賬操作，啟用後需經過三級審批'),
    ('merge', '推廣金合併', 1, '集團合併操作，啟用後需經過三級審批'),
    ('gift', '贈送廣告天數', 1, '推廣贈送廣告天數操作，啟用後需經過三級審批');
