-- 213: RDM 阶段 4 结构（发布放行单）
-- 目的：把「上线前的质量放行」与「上线后的业务验收」拆成两件事实。
--       原本只有一个 uat_pending 状态承载"验收"，于是验收既像在验质量又像在签字上线，
--       而真正上线的那一刻（release）没有任何前置闸门记录，出事无法回答"当时是谁放行、依据什么"。
-- 说明：本文件是可读参考副本，实际执行的是 classpath 下的同名脚本。
--       列级变更（rdm_acceptance.stage / rdm_requirement.flow_version）由
--       RdmSchemaMigrationInitializer 逐列先查再加，不在本脚本里写 ALTER。

-- ── 发布放行单：一次上线一行，检查项结果作为快照一起存 ──
-- 为什么存快照而不是每次实时算：放行时点是法律性的，事后代码规则变了不能让当时的放行变成违规。
CREATE TABLE IF NOT EXISTS rdm_release (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    release_no VARCHAR(32) NOT NULL COMMENT '放行单号',
    req_id BIGINT NOT NULL COMMENT '需求ID rdm_requirement.id',
    round_no INT NOT NULL DEFAULT 1 COMMENT '第几次放行（返工后再上线时递增，历史不覆盖）',
    env VARCHAR(16) NOT NULL DEFAULT 'prod' COMMENT '目标环境: prod/pre/uat',
    version_no VARCHAR(64) DEFAULT NULL COMMENT '发布版本号/迭代号（与需求 version_no 对齐）',
    plan_time DATETIME DEFAULT NULL COMMENT '计划上线时间',
    status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/passed/rejected/revoked',
    checks_json TEXT COMMENT '检查项结果快照（JSON 数组：code/label/passed/skipped/reason）',
    blocking_count INT NOT NULL DEFAULT 0 COMMENT '未通过且未豁免的检查项数',
    summary VARCHAR(512) DEFAULT NULL COMMENT '放行说明（驳回原因/豁免理由写在这里）',
    applicant_user_id BIGINT DEFAULT NULL COMMENT '发起人 sys_user.id（通常 PM）',
    applicant_emp_no VARCHAR(32) DEFAULT NULL COMMENT '发起人工号快照（与 gate_emp_no 对称，便于核对四眼原则）',
    applicant_name VARCHAR(64) DEFAULT NULL COMMENT '发起人姓名快照',
    apply_time DATETIME DEFAULT NULL COMMENT '发起时间',
    gate_user_id BIGINT DEFAULT NULL COMMENT '放行人 sys_user.id',
    gate_emp_no VARCHAR(32) DEFAULT NULL COMMENT '放行人工号快照',
    gate_name VARCHAR(64) DEFAULT NULL COMMENT '放行人姓名快照',
    decide_time DATETIME DEFAULT NULL COMMENT '放行动作时间',
    expire_at DATETIME DEFAULT NULL COMMENT '放行有效期（过期须重新过闸，避免"一次放行管 forever"）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_release_no (release_no),
    KEY idx_rdm_release_req (req_id, status, round_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-发布放行单（上线前质量闸门的事实记录，含检查项快照与放行人）';

-- 放行单编号规则：缺这条种子时 bizSeqService.next("rdm_release") 会直接报
-- 「編號生成規則未配置或已停用」，整个放行链路 100% 不可用（深度测试实测踩过）。
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('rdm_release','發布放行單號','產研協同','FZ','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號');
