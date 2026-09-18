-- ============================================================
-- 164_employee_salary_tables.sql
-- 员工费用信息页签后端支撑：收入项 + 扣除项 + 薪资配置
-- ============================================================

-- ── A. 收入项表 ──

CREATE TABLE IF NOT EXISTS emp_salary_income (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '关联 sys_user.id',
  name VARCHAR(50) NOT NULL COMMENT '项目名称',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额(元)',
  type VARCHAR(10) NOT NULL DEFAULT 'fixed' COMMENT '类型(fixed=固定,variable=浮动)',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  created_by VARCHAR(50) DEFAULT NULL COMMENT '创建人',
  updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
  deleted INT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
) COMMENT='员工费用信息-收入项';

-- ── B. 扣除项表 ──

CREATE TABLE IF NOT EXISTS emp_salary_deduction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '关联 sys_user.id',
  name VARCHAR(50) NOT NULL COMMENT '项目名称',
  rate DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '费率(百分比)',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '金额(元)',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  created_by VARCHAR(50) DEFAULT NULL COMMENT '创建人',
  updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
  deleted INT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
) COMMENT='员工费用信息-扣除项';

-- ── C. 薪资配置表（每员工唯一） ──

CREATE TABLE IF NOT EXISTS emp_salary_config (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '关联 sys_user.id',
  salary_structure VARCHAR(30) DEFAULT NULL COMMENT '薪资结构',
  payment_method VARCHAR(20) DEFAULT NULL COMMENT '发薪方式',
  pay_day INT DEFAULT NULL COMMENT '发薪日(1~31)',
  bank_name VARCHAR(100) DEFAULT NULL COMMENT '开户银行',
  bank_account VARCHAR(50) DEFAULT NULL COMMENT '银行账号',
  tax_city VARCHAR(50) DEFAULT NULL COMMENT '纳税城市',
  created_by VARCHAR(50) DEFAULT NULL COMMENT '创建人',
  updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
  deleted INT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_id (user_id)
) COMMENT='员工费用信息-薪资配置';
