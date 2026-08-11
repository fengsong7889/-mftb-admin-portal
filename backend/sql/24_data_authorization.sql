-- ============================================================
-- 数据授权表: 角色/部门 → 可见商家范围 (group_code)
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_data_authorization (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL COMMENT '授权对象类型: role / department',
  target_id   BIGINT NOT NULL COMMENT '角色ID 或 部门ID',
  group_code  VARCHAR(50) NOT NULL COMMENT '授权商家集团编码 (biz_merchant_group.group_code)',
  status      TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
  created_by  VARCHAR(64) DEFAULT NULL COMMENT '创建人',
  updated_by  VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
  deleted     TINYINT DEFAULT 0 COMMENT '逻辑删除',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_target_group (target_type, target_id, group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
COMMENT='数据授权表：角色/部门 → 可见商家范围';
