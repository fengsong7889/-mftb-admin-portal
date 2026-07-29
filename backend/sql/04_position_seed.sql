-- ============================================================
-- 职位管理初始数据（依据集团职级体系表）
-- 用途: 清空现有职位数据后, 导入 M/T/P 三序列共 27 个职位
-- 执行方式: 在 Sealos 数据库终端直接执行本脚本
-- 注意: sequence / rank 为 MySQL 保留字, 必须加反引号
-- ============================================================

-- 一、删除当前已存在的职位数据（物理清空并重置自增ID）
TRUNCATE TABLE sys_position;

-- 二、M 序列（管理）
INSERT INTO sys_position (name, name_en, `sequence`, job_level, `rank`) VALUES
('首席執行官',   'CEO',             'M', 'M12', NULL),
('總裁',         'President',       'M', 'M11', NULL),
('首席官',       'CXO',             'M', 'M10', NULL),
('高級負責人',   'Senior Leader',   'M', 'M9',  NULL),
('負責人',       'Leader',          'M', 'M8',  NULL),
('高級總監',     'Senior Director', 'M', 'M7',  NULL),
('總監',         'Director',        'M', 'M6',  NULL),
('高級經理/主管', 'Senior Manager', 'M', 'M5',  NULL),
('經理/主管',    'Manager',         'M', 'M4',  NULL);

-- 三、T 序列（技术）
INSERT INTO sys_position (name, name_en, `sequence`, job_level, `rank`) VALUES
('高級研究員',   'Senior Researcher',   'T', 'T9', NULL),
('中級研究員',   'Middle Researcher',   'T', 'T8', NULL),
('研究員',       'Researcher',          'T', 'T7', NULL),
('高級工程師',   'Senior Engineer',     'T', 'T6', NULL),
('中級工程師',   'Middle Engineer',     'T', 'T5', NULL),
('工程師',       'Engineer',            'T', 'T4', NULL),
('高級技術助理', 'Senior IT Assistant', 'T', 'T3', NULL),
('中級技術助理', 'Middle IT Assistant', 'T', 'T2', NULL),
('技術助理',     'IT Assistant',        'T', 'T1', NULL);

-- 四、P 序列（专业）
INSERT INTO sys_position (name, name_en, `sequence`, job_level, `rank`) VALUES
('高級專家', 'Senior Expert',    'P', 'P9', NULL),
('中級專家', 'Middle Expert',    'P', 'P8', NULL),
('專家',     'Expert',           'P', 'P7', NULL),
('高級專員', 'Senior Officer',   'P', 'P6', NULL),
('中級專員', 'Middle Officer',   'P', 'P5', NULL),
('專員',     'Officer',          'P', 'P4', NULL),
('高級助理', 'Senior Assistant', 'P', 'P3', NULL),
('中級助理', 'Middle Assistant', 'P', 'P2', NULL),
('助理',     'Assistant',        'P', 'P1', NULL);

-- 五、执行结果核对（应返回 27 行）
SELECT `sequence`, job_level, name, name_en FROM sys_position
ORDER BY FIELD(`sequence`, 'M', 'T', 'P'), job_level DESC;
