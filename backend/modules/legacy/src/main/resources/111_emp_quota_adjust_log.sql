-- 員工額度調整日誌表
-- 記錄管理員對員工額度的人工調整操作（舊值→新值+原因+操作人），供詳情頁調整歷史展示
CREATE TABLE IF NOT EXISTS ai_emp_quota_adjust_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id  BIGINT       NOT NULL COMMENT '被調整員工ID (sys_user.id)',
  source       VARCHAR(32)  NOT NULL COMMENT '來源維度: department/position/role/approval',
  source_desc  VARCHAR(200)          COMMENT '來源描述',
  quota_type   VARCHAR(16)  NOT NULL COMMENT 'token/request/cost',
  quota_period VARCHAR(16)  NOT NULL COMMENT 'daily/monthly',
  old_value    DECIMAL(15,2) NOT NULL DEFAULT 0,
  new_value    DECIMAL(15,2) NOT NULL,
  reason       VARCHAR(300)          COMMENT '調整原因',
  operator     VARCHAR(64)  NOT NULL COMMENT '操作人',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_emp (employee_id),
  INDEX idx_time (created_at)
) COMMENT='員工額度調整日誌';
