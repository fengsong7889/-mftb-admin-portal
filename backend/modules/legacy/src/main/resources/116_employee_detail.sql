-- ============================================================
-- 116_employee_detail.sql
-- 员工详情页后端支撑：基础信息扩展 + 紧急联系人 + 职务记录
-- ============================================================

-- ── A. sys_user 表新增列（基础信息扩展） ──

-- 个人信息
ALTER TABLE sys_user ADD COLUMN nationality VARCHAR(50) DEFAULT NULL COMMENT '国籍';
ALTER TABLE sys_user ADD COLUMN ethnicity VARCHAR(20) DEFAULT NULL COMMENT '民族';
ALTER TABLE sys_user ADD COLUMN birth_date DATE DEFAULT NULL COMMENT '出生日期';
ALTER TABLE sys_user ADD COLUMN marital_status VARCHAR(10) DEFAULT NULL COMMENT '婚姻状况';
ALTER TABLE sys_user ADD COLUMN political_status VARCHAR(20) DEFAULT NULL COMMENT '政治面貌';
ALTER TABLE sys_user ADD COLUMN religion VARCHAR(20) DEFAULT NULL COMMENT '宗教信仰';

-- 证件信息
ALTER TABLE sys_user ADD COLUMN id_type VARCHAR(30) DEFAULT NULL COMMENT '证件类型';
ALTER TABLE sys_user ADD COLUMN id_number VARCHAR(50) DEFAULT NULL COMMENT '证件号码';
ALTER TABLE sys_user ADD COLUMN id_address VARCHAR(200) DEFAULT NULL COMMENT '证件地址';
ALTER TABLE sys_user ADD COLUMN household_type VARCHAR(30) DEFAULT NULL COMMENT '户籍类型';
ALTER TABLE sys_user ADD COLUMN household_location VARCHAR(100) DEFAULT NULL COMMENT '户籍所在地';
ALTER TABLE sys_user ADD COLUMN native_place VARCHAR(100) DEFAULT NULL COMMENT '籍贯';

-- 通讯信息
ALTER TABLE sys_user ADD COLUMN address_country VARCHAR(50) DEFAULT NULL COMMENT '住址-国家';
ALTER TABLE sys_user ADD COLUMN address_city VARCHAR(50) DEFAULT NULL COMMENT '住址-城市';
ALTER TABLE sys_user ADD COLUMN address_detail VARCHAR(300) DEFAULT NULL COMMENT '住址-详细地址';

-- ── B. 紧急联系人表 ──

CREATE TABLE IF NOT EXISTS emp_emergency_contact (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '关联 sys_user.id',
  name VARCHAR(50) NOT NULL COMMENT '联系人姓名',
  phone VARCHAR(30) NOT NULL COMMENT '联系电话',
  relation VARCHAR(30) NOT NULL COMMENT '关系（父母/配偶/子女等）',
  created_by VARCHAR(50) DEFAULT NULL COMMENT '创建人',
  updated_by VARCHAR(50) DEFAULT NULL COMMENT '更新人',
  deleted INT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
) COMMENT='员工紧急联系人';

-- ── C. 职务记录表 ──

CREATE TABLE IF NOT EXISTS emp_position_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '关联 sys_user.id',

  -- 变动信息
  effective_date DATE NOT NULL COMMENT '生效日期',
  effective_seq INT NOT NULL DEFAULT 0 COMMENT '生效序号（0起递增）',
  operation VARCHAR(20) NOT NULL COMMENT '操作类型（入职/调动/晋升/降职/离职/重新入职）',
  reason VARCHAR(200) DEFAULT NULL COMMENT '变动原因',

  -- 任职信息
  service_dept VARCHAR(100) DEFAULT NULL COMMENT '服务部门',
  sequence_type VARCHAR(10) DEFAULT NULL COMMENT '职级序列(M/T/P)',
  position_level VARCHAR(10) DEFAULT NULL COMMENT '职级(如P2)',
  rank_code VARCHAR(10) DEFAULT NULL COMMENT '职等(R1-R5)',
  company VARCHAR(100) DEFAULT NULL COMMENT '任职公司',
  employee_category VARCHAR(30) DEFAULT NULL COMMENT '员工类别',
  work_system VARCHAR(20) DEFAULT NULL COMMENT '工时制',
  position_name VARCHAR(100) DEFAULT NULL COMMENT '职位',
  direct_superior VARCHAR(50) DEFAULT NULL COMMENT '直属上级',
  mentor VARCHAR(50) DEFAULT NULL COMMENT '导师',

  -- 工作信息
  work_country VARCHAR(50) DEFAULT NULL COMMENT '工作国家',
  work_city VARCHAR(50) DEFAULT NULL COMMENT '工作城市',
  office_address VARCHAR(200) DEFAULT NULL COMMENT '办公地址',
  contract_location VARCHAR(100) DEFAULT NULL COMMENT '合同签订地',

  created_by VARCHAR(50) DEFAULT NULL,
  updated_by VARCHAR(50) DEFAULT NULL,
  deleted INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_user_seq (user_id, effective_seq)
) COMMENT='员工职务记录';
